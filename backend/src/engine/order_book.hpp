#pragma once
#include "../models/order.hpp"
#include "../models/trade.hpp"
#include <map>
#include <deque>
#include <unordered_map>
#include <shared_mutex>
#include <vector>
#include <optional>
#include <functional>

namespace exchange {

// Level-2 order book entry (aggregated depth)
struct DepthLevel {
    int64_t price;
    int64_t totalQty;
    int     orderCount;

    [[nodiscard]] double displayPrice() const { return static_cast<double>(price) / 100.0; }
};

struct OrderBookSnapshot {
    std::string            symbol;
    std::vector<DepthLevel> bids;   // sorted descending (best bid first)
    std::vector<DepthLevel> asks;   // sorted ascending  (best ask first)
    int64_t                timestamp;
};

class OrderBook {
    friend class MatchingEngine;
public:
    explicit OrderBook(std::string symbol);

    // Add order to book — O(log N)
    void addOrder(const Order& order);

    // Remove order from book — O(1) lookup + O(log N) erase from map
    bool removeOrder(const std::string& orderId);

    // Modify order (price or quantity). Returns false if not found.
    bool modifyOrder(const std::string& orderId, int64_t newPrice, int64_t newQty);

    // Get best bid (highest buy price) — O(1)
    [[nodiscard]] std::optional<int64_t> bestBid() const;

    // Get best ask (lowest sell price) — O(1)
    [[nodiscard]] std::optional<int64_t> bestAsk() const;

    // Get spread in cents
    [[nodiscard]] std::optional<int64_t> spread() const;

    // Get Level-2 depth snapshot
    [[nodiscard]] OrderBookSnapshot getSnapshot(int levels = 20) const;

    // Get an order by ID
    [[nodiscard]] std::optional<Order> getOrder(const std::string& orderId) const;

    // Total orders in book
    [[nodiscard]] size_t size() const;

    // Check if book has an order
    [[nodiscard]] bool hasOrder(const std::string& orderId) const;

    // Buy and sell books exposed for matching engine access
    // Key: price (cents), Value: FIFO queue of orders at that price
    std::map<int64_t, std::deque<Order>, std::greater<int64_t>> buyBook_;   // descending
    std::map<int64_t, std::deque<Order>>                         sellBook_;  // ascending

    mutable std::shared_mutex mutex_;

private:
    std::string symbol_;
    // Fast O(1) cancel lookup: orderId -> {side, price}
    std::unordered_map<std::string, std::pair<Side, int64_t>> orderIndex_;
};

} // namespace exchange
