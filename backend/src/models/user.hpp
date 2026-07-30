#pragma once
#include <string>
#include <cstdint>

namespace exchange {

enum class UserRole : uint8_t {
    TRADER = 0,
    ADMIN  = 1
};

struct User {
    std::string id;
    std::string username;
    std::string email;
    std::string passwordHash;
    UserRole    role{UserRole::TRADER};
    int64_t     cash{1'000'000'00};   // $1,000,000 in cents
    int64_t     dailyOrderCount{0};
    int64_t     createdAt;
    bool        isActive{true};

    [[nodiscard]] std::string roleStr() const {
        return role == UserRole::ADMIN ? "ADMIN" : "TRADER";
    }

    [[nodiscard]] double displayCash() const {
        return static_cast<double>(cash) / 100.0;
    }
};

} // namespace exchange
