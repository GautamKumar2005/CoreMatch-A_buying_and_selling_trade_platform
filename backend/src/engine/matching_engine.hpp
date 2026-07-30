#pragma once
#include "order_book.hpp"
#include "../models/trade.hpp"
#include <unordered_map>
#include <functional>
#include <atomic>
#include <string>
#include <vector>
#include <memory>
#include <mutex>

namespace exchange {

// Callback types for event notification
using TradeCallback     = std::function<void(const Trade&)>;
using OrderCallback     = std::function<void(const Order&)>;

struct EngineMetrics {
    std::atomic<uint64_t> totalOrders{0};
    std::atomic<uint64_t> totalTrades{0};
    std::atomic<uint64_t> ordersPerSecond{0};
    std::atomic<uint64_t> tradesPerSecond{0};
    std::atomic<uint64_t> rejectedOrders{0};
    std::atomic<int64_t>  avgLatencyUs{0};   // microseconds
    std::atomic<int64_t>  p99LatencyUs{0};
    std::atomic<int64_t>  peakLatencyUs{0};
};

class MatchingEngine {
public:
    MatchingEngine();
    ~MatchingEngine();

    // Register callbacks
    void onTrade(TradeCallback cb)       { tradeCallback_  = std::move(cb); }
    void onOrderUpdate(OrderCallback cb) { orderCallback_  = std::move(cb); }

    // Submit an order for matching.
    // Returns generated trades (empty if no match).
    std::vector<Trade> submitOrder(Order order);

    // Cancel a resting order
    bool cancelOrder(const std::string& orderId, const std::string& userId);

    // Modify a resting order
    bool modifyOrder(const std::string& orderId, const std::string& userId,
                     int64_t newPrice, int64_t newQty);

    // Get order book snapshot for a symbol
    OrderBookSnapshot getOrderBook(const std::string& symbol, int levels = 20) const;

    // Get best bid/ask
    std::optional<int64_t> bestBid(const std::string& symbol) const;
    std::optional<int64_t> bestAsk(const std::string& symbol) const;

    // Get resting order
    std::optional<Order> getOrder(const std::string& orderId) const;

    // Metrics
    const EngineMetrics& metrics() const { return metrics_; }

    // List of valid symbols
    static const std::vector<std::string>& symbols();

private:
    OrderBook& getOrCreateBook(const std::string& symbol);
    const OrderBook* findBook(const std::string& symbol) const;

    Trade makeTrade(const Order& taker, const Order& maker,
                    int64_t price, int64_t qty) const;

    void matchLimitBuy(Order& taker, OrderBook& book, std::vector<Trade>& trades);
    void matchLimitSell(Order& taker, OrderBook& book, std::vector<Trade>& trades);
    void matchMarket(Order& taker, OrderBook& book, std::vector<Trade>& trades);

    // symbol -> order book
    mutable std::mutex booksMutex_;
    std::unordered_map<std::string, std::unique_ptr<OrderBook>> books_;

    // orderId -> symbol (for cancel lookups across symbols)
    mutable std::mutex orderMapMutex_;
    std::unordered_map<std::string, std::string> orderSymbolMap_; // orderId -> symbol

    TradeCallback  tradeCallback_;
    OrderCallback  orderCallback_;

    mutable EngineMetrics metrics_;

    // Latency tracking (ring buffer of last 1000 latencies)
    mutable std::mutex latencyMutex_;
    std::vector<int64_t> recentLatencies_;
    size_t latencyIdx_{0};
    static constexpr size_t kLatencyBufSize = 1000;
};

} // namespace exchange
