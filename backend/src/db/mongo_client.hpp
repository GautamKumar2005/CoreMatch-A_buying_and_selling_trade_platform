#pragma once
#include "../models/user.hpp"
#include "../models/order.hpp"
#include "../models/trade.hpp"
#include "../models/portfolio.hpp"
#include <string>
#include <vector>
#include <optional>
#include <functional>

namespace exchange {

class MongoClient {
public:
    MongoClient() = default;
    ~MongoClient();

    bool connect(const std::string& uri, const std::string& dbName);
    bool isConnected() const { return connected_; }

    // ── Users ──────────────────────────────────────────────
    bool        saveUser(const User& user);
    bool        updateUserCash(const std::string& userId, int64_t cash);
    std::optional<User> findUserByEmail(const std::string& email) const;
    std::optional<User> findUserById(const std::string& id) const;
    std::vector<User>   getAllUsers() const;

    // ── Orders ─────────────────────────────────────────────
    bool saveOrder(const Order& order);
    bool updateOrder(const Order& order);
    std::vector<Order> getOrdersByUser(const std::string& userId, int limit = 100) const;
    std::vector<Order> getOpenOrders(const std::string& userId) const;

    // ── Trades ─────────────────────────────────────────────
    bool saveTrade(const Trade& trade);
    std::vector<Trade> getTradesBySymbol(const std::string& symbol, int limit = 100) const;
    std::vector<Trade> getTradesByUser(const std::string& userId, int limit = 100) const;

    // ── Portfolios ─────────────────────────────────────────
    bool savePortfolio(const Portfolio& portfolio);
    std::optional<Portfolio> loadPortfolio(const std::string& userId) const;
    std::vector<Portfolio>   loadAllPortfolios() const;

    // ── Audit Logs ─────────────────────────────────────────
    bool saveAuditLog(const std::string& event,
                      const std::string& userId,
                      const std::string& detail);

    // ── Market Snapshots ───────────────────────────────────
    bool saveMarketSnapshot(const std::string& symbol,
                            const std::string& snapshotJson);

private:
    bool connected_{false};
    // Forward-declared pimpl to avoid exposing mongocxx headers
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace exchange
