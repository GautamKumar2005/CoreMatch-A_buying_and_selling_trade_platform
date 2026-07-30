#pragma once
#include "../models/order.hpp"
#include "../models/user.hpp"
#include "../models/portfolio.hpp"
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <shared_mutex>

namespace exchange {

struct RiskResult {
    bool        approved;
    std::string reason;
};

class RiskEngine {
public:
    RiskEngine() = default;

    // Thread-safe: validate an order before it enters the matching engine
    RiskResult check(const Order& order,
                     const User& user,
                     const Portfolio& portfolio) const;

    // Register a placed order ID (for duplicate detection)
    void registerOrder(const std::string& orderId);

    // Remove a completed/cancelled order
    void deregisterOrder(const std::string& orderId);

    // Track daily order count per user
    void incrementUserOrderCount(const std::string& userId);
    void resetDailyLimits();  // call at midnight

    // Valid symbols set
    static bool isValidSymbol(const std::string& symbol);

private:
    mutable std::shared_mutex mutex_;
    std::unordered_set<std::string> activeOrderIds_;
    std::unordered_map<std::string, int> dailyOrderCount_;

    static constexpr int64_t kMaxOrderQty   = 100'000;
    static constexpr int64_t kMaxOrderPrice = 100'000'00; // $100,000
    static constexpr int     kDailyLimit    = 10'000;
};

} // namespace exchange
