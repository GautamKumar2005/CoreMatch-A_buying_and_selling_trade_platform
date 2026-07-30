#include "risk_engine.hpp"
#include "../engine/matching_engine.hpp"
#include <algorithm>

namespace exchange {

RiskResult RiskEngine::check(const Order& order,
                              const User& user,
                              const Portfolio& portfolio) const {
    // Quantity check
    if (order.quantity <= 0)
        return {false, "Quantity must be positive"};
    if (order.quantity > kMaxOrderQty)
        return {false, "Quantity exceeds maximum allowed (" + std::to_string(kMaxOrderQty) + ")"};

    // Price check for LIMIT orders
    if (order.type == OrderType::LIMIT) {
        if (order.price <= 0)
            return {false, "Limit price must be positive"};
        if (order.price > kMaxOrderPrice)
            return {false, "Price exceeds maximum allowed"};
    }

    // Symbol check
    if (!isValidSymbol(order.symbol))
        return {false, "Invalid or unsupported symbol: " + order.symbol};

    // User active check
    if (!user.isActive)
        return {false, "User account is inactive"};

    // Daily order limit
    {
        std::shared_lock<std::shared_mutex> lock(mutex_);
        auto it = dailyOrderCount_.find(order.userId);
        if (it != dailyOrderCount_.end() && it->second >= kDailyLimit)
            return {false, "Daily order limit exceeded"};
    }

    // Duplicate order ID check
    {
        std::shared_lock<std::shared_mutex> lock(mutex_);
        if (activeOrderIds_.count(order.id))
            return {false, "Duplicate order ID"};
    }

    // Funds / holdings checks
    if (order.side == Side::BUY) {
        // For LIMIT: need price * qty cash
        // For MARKET: we allow it (best-effort fill)
        if (order.type == OrderType::LIMIT) {
            int64_t required = order.price * order.quantity;
            if (portfolio.cash < required)
                return {false, "Insufficient cash. Required: $" +
                               std::to_string(required / 100) +
                               ", Available: $" + std::to_string(portfolio.cash / 100)};
        }
    } else {
        // SELL: must own the stock
        auto it = portfolio.positions.find(order.symbol);
        if (it == portfolio.positions.end() || it->second.quantity < order.quantity)
            return {false, "Insufficient holdings for " + order.symbol};
    }

    return {true, ""};
}

void RiskEngine::registerOrder(const std::string& orderId) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    activeOrderIds_.insert(orderId);
}

void RiskEngine::deregisterOrder(const std::string& orderId) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    activeOrderIds_.erase(orderId);
}

void RiskEngine::incrementUserOrderCount(const std::string& userId) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    dailyOrderCount_[userId]++;
}

void RiskEngine::resetDailyLimits() {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    dailyOrderCount_.clear();
}

bool RiskEngine::isValidSymbol(const std::string& symbol) {
    const auto& syms = MatchingEngine::symbols();
    return std::find(syms.begin(), syms.end(), symbol) != syms.end();
}

} // namespace exchange
