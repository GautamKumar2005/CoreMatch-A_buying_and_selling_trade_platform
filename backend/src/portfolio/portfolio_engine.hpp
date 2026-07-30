#pragma once
#include "../models/portfolio.hpp"
#include "../models/trade.hpp"
#include "../models/user.hpp"
#include <unordered_map>
#include <shared_mutex>
#include <functional>
#include <optional>

namespace exchange {

using PortfolioUpdateCallback = std::function<void(const Portfolio&)>;

class PortfolioEngine {
public:
    PortfolioEngine() = default;

    // Initialize a portfolio for a new user
    void initPortfolio(const std::string& userId, int64_t startingCash);

    // Load portfolio from persistent storage (called at startup)
    void loadPortfolio(Portfolio portfolio);

    // Process a completed trade — updates both buyer and seller
    void processTrade(const Trade& trade);

    // Reserve cash for a pending BUY order (deduct on order, release on fill/cancel)
    bool reserveCash(const std::string& userId, int64_t amount);
    void releaseCash(const std::string& userId, int64_t amount);

    // Reserve stock for a pending SELL order
    bool reserveStock(const std::string& userId, const std::string& symbol, int64_t qty);
    void releaseStock(const std::string& userId, const std::string& symbol, int64_t qty);

    // Update last price for unrealized PnL calculations
    void updateLastPrice(const std::string& symbol, int64_t price);

    // Accessors
    std::optional<Portfolio> getPortfolio(const std::string& userId) const;
    std::optional<int64_t>   getCash(const std::string& userId) const;

    // Callback on portfolio update
    void onPortfolioUpdate(PortfolioUpdateCallback cb) {
        updateCallback_ = std::move(cb);
    }

private:
    mutable std::shared_mutex mutex_;
    std::unordered_map<std::string, Portfolio> portfolios_;  // userId -> Portfolio
    std::unordered_map<std::string, int64_t>   lastPrices_;  // symbol -> price
    PortfolioUpdateCallback updateCallback_;

    void updateBuyer(Portfolio& buyer, const Trade& trade);
    void updateSeller(Portfolio& seller, const Trade& trade);
};

} // namespace exchange
