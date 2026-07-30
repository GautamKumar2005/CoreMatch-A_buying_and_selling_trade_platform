#include "auth_manager.hpp"
#include "../utils/config.hpp"
#include "../utils/logger.hpp"
#include <jwt-cpp/jwt.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/sha.h>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <stdexcept>
#include <unordered_set>

namespace exchange {

// Convert bytes to hex string
static std::string toHex(const unsigned char* data, size_t len) {
    std::ostringstream oss;
    for (size_t i = 0; i < len; ++i)
        oss << std::hex << std::setw(2) << std::setfill('0') << (int)data[i];
    return oss.str();
}

std::string AuthManager::generateSalt() {
    unsigned char buf[16];
    RAND_bytes(buf, sizeof(buf));
    return toHex(buf, sizeof(buf));
}

std::string AuthManager::hashPassword(const std::string& password, const std::string& salt) {
    // PBKDF2-HMAC-SHA256: 10000 iterations, 32-byte output
    std::string input = password + salt;
    unsigned char hash[32];
    unsigned char saltBytes[16];
    // Convert salt hex back to bytes
    for (size_t i = 0; i < 16; ++i) {
        saltBytes[i] = static_cast<unsigned char>(
            std::stoul(salt.substr(i * 2, 2), nullptr, 16));
    }
    PKCS5_PBKDF2_HMAC(password.c_str(), static_cast<int>(password.size()),
                       saltBytes, 16,
                       10000, EVP_sha256(),
                       32, hash);
    return toHex(hash, 32);
}

bool AuthManager::verifyPassword(const std::string& password,
                                  const std::string& salt,
                                  const std::string& storedHash) {
    std::string computed = hashPassword(password, salt);
    // Constant-time comparison to prevent timing attacks
    if (computed.size() != storedHash.size()) return false;
    int diff = 0;
    for (size_t i = 0; i < computed.size(); ++i)
        diff |= (computed[i] ^ storedHash[i]);
    return diff == 0;
}

std::string AuthManager::issueToken(const User& user) const {
    const auto& cfg = Config::instance();
    auto now     = std::chrono::system_clock::now();
    auto expiry  = now + std::chrono::seconds(cfg.jwtExpiry);

    auto token = jwt::create()
        .set_issuer("exchange")
        .set_type("JWT")
        .set_subject(user.id)
        .set_payload_claim("username", jwt::claim(user.username))
        .set_payload_claim("email",    jwt::claim(user.email))
        .set_payload_claim("role",     jwt::claim(user.roleStr()))
        .set_issued_at(now)
        .set_expires_at(expiry)
        .sign(jwt::algorithm::hs256{cfg.jwtSecret});

    return token;
}

std::optional<AuthToken> AuthManager::verifyToken(const std::string& tokenStr) const {
    // Check revocation list
    {
        std::shared_lock<std::shared_mutex> lock(mutex_);
        if (revokedTokens_.count(tokenStr)) return std::nullopt;
    }

    try {
        const auto& cfg = Config::instance();
        auto verifier = jwt::verify()
            .allow_algorithm(jwt::algorithm::hs256{cfg.jwtSecret})
            .with_issuer("exchange");

        auto decoded = jwt::decode(tokenStr);
        verifier.verify(decoded);

        AuthToken result;
        result.token    = tokenStr;
        result.userId   = decoded.get_subject();
        result.username = decoded.get_payload_claim("username").as_string();
        result.role     = decoded.get_payload_claim("role").as_string();
        result.expiresAt = std::chrono::duration_cast<std::chrono::seconds>(
                               decoded.get_expires_at().time_since_epoch()).count();
        return result;
    } catch (const std::exception& e) {
        LOG_WARN("Token verification failed: ", e.what());
        return std::nullopt;
    }
}

void AuthManager::revokeToken(const std::string& token) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    revokedTokens_.insert(token);
}

bool AuthManager::isTokenRevoked(const std::string& token) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    return revokedTokens_.count(token) > 0;
}

} // namespace exchange
