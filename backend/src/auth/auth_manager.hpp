#pragma once
#include "../models/user.hpp"
#include <string>
#include <optional>
#include <unordered_map>
#include <shared_mutex>

namespace exchange {

struct AuthToken {
    std::string token;
    std::string userId;
    std::string username;
    std::string role;
    int64_t     expiresAt;
};

struct RegisterRequest {
    std::string username;
    std::string email;
    std::string password;
};

struct LoginRequest {
    std::string email;
    std::string password;
};

class AuthManager {
public:
    AuthManager() = default;

    // Hash a password using SHA-256 + salt (PBKDF2)
    static std::string hashPassword(const std::string& password, const std::string& salt);

    // Generate a random salt (hex string)
    static std::string generateSalt();

    // Verify a password against stored hash+salt
    static bool verifyPassword(const std::string& password,
                                const std::string& salt,
                                const std::string& hash);

    // Issue a JWT token for a user
    std::string issueToken(const User& user) const;

    // Verify and decode a JWT token
    std::optional<AuthToken> verifyToken(const std::string& token) const;

    // Cache tokens for fast validation (optional)
    void cacheToken(const std::string& userId, const std::string& token);
    void revokeToken(const std::string& token);
    bool isTokenRevoked(const std::string& token) const;

private:
    mutable std::shared_mutex mutex_;
    std::unordered_set<std::string> revokedTokens_;
};

} // namespace exchange
