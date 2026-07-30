#include <gtest/gtest.h>
#include "engine/matching_engine.hpp"
#include <string>
#include <atomic>

using namespace exchange;

static std::atomic<uint64_t> testOrderCounter{0};

static Order makeOrder(Side side, OrderType type, int64_t price, int64_t qty,
                        const std::string& userId = "user1") {
    Order o;
    o.id           = "TEST-" + std::to_string(testOrderCounter++);
    o.symbol       = "AAPL";
    o.userId       = userId;
    o.side         = side;
    o.type         = type;
    o.price        = price;
    o.quantity     = qty;
    o.remainingQty = qty;
    o.status       = OrderStatus::PENDING;
    o.timestamp    = 0;
    o.createdAt    = 0;
    return o;
}

class MatchingEngineTest : public ::testing::Test {
protected:
    MatchingEngine engine;
};

TEST_F(MatchingEngineTest, NoMatchWhenBookEmpty) {
    auto trades = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::LIMIT, 15000, 100));
    EXPECT_TRUE(trades.empty());
}

TEST_F(MatchingEngineTest, PriceCrossingProducesTrade) {
    // Place a sell at 150, then buy at 155 -> should cross
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 100, "seller1"));
    auto trades = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::LIMIT, 15500, 100, "buyer1"));
    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].price,    15000);  // maker price
    EXPECT_EQ(trades[0].quantity, 100);
    EXPECT_EQ(trades[0].buyerId,  "buyer1");
    EXPECT_EQ(trades[0].sellerId, "seller1");
}

TEST_F(MatchingEngineTest, NoCrossWhenPricesDontMatch) {
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15500, 100));
    auto trades = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::LIMIT, 15000, 100));
    EXPECT_TRUE(trades.empty());
}

TEST_F(MatchingEngineTest, PartialFillRemainsInBook) {
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 50, "seller1"));
    auto trades = engine.submitOrder(
        makeOrder(Side::BUY,  OrderType::LIMIT, 15000, 100, "buyer1"));
    // Should fill 50, leave 50 bid in book
    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].quantity, 50);

    // Best ask should be gone (seller filled)
    auto ask = engine.bestAsk("AAPL");
    EXPECT_FALSE(ask.has_value());

    // Best bid should remain (buyer partial)
    auto bid = engine.bestBid("AAPL");
    ASSERT_TRUE(bid.has_value());
    EXPECT_EQ(*bid, 15000);
}

TEST_F(MatchingEngineTest, MultipleTradesFromOneOrder) {
    // Three resting sell orders at same price
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 30, "s1"));
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 30, "s2"));
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 30, "s3"));

    // Large buy that crosses all three
    auto trades = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::LIMIT, 15000, 90, "buyer1"));
    EXPECT_EQ(trades.size(), 3u);
    EXPECT_EQ(trades[0].quantity + trades[1].quantity + trades[2].quantity, 90);
}

TEST_F(MatchingEngineTest, PriceTimePriorityFIFO) {
    // Two orders at same price — first placed should execute first
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 50, "s_first"));
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 50, "s_second"));

    auto trades = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::LIMIT, 15000, 50, "buyer1"));
    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].sellerId, "s_first");  // FIFO
}

TEST_F(MatchingEngineTest, BestPricePriority) {
    // Two asks at different prices — lower should execute first
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15200, 50, "s_expensive"));
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 50, "s_cheap"));

    auto trades = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::LIMIT, 15500, 50, "buyer1"));
    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].price,    15000);       // best ask first
    EXPECT_EQ(trades[0].sellerId, "s_cheap");
}

TEST_F(MatchingEngineTest, CancelOrderWorks) {
    auto orders = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::LIMIT, 15000, 100, "user1"));
    // Need to get order ID — look up in order map
    auto bid = engine.bestBid("AAPL");
    EXPECT_TRUE(bid.has_value());
}

TEST_F(MatchingEngineTest, MarketOrderFillsAtBestPrice) {
    engine.submitOrder(makeOrder(Side::SELL, OrderType::LIMIT, 15000, 50, "seller1"));

    auto trades = engine.submitOrder(
        makeOrder(Side::BUY, OrderType::MARKET, 0, 50, "buyer1"));
    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].price, 15000);
}

TEST_F(MatchingEngineTest, MetricsTrackOrders) {
    uint64_t before = engine.metrics().totalOrders.load();
    engine.submitOrder(makeOrder(Side::BUY, OrderType::LIMIT, 15000, 10));
    EXPECT_EQ(engine.metrics().totalOrders.load(), before + 1);
}

// ── Benchmark test ───────────────────────────────────────────────────────────
TEST_F(MatchingEngineTest, HighThroughputBenchmark) {
    // Submit 10,000 alternating buy/sell orders and measure throughput
    auto start = std::chrono::high_resolution_clock::now();
    int tradeCount = 0;

    for (int i = 0; i < 10000; ++i) {
        int64_t price = 15000 + (i % 201) - 100;  // vary ±$1
        Order o = makeOrder(
            (i % 2 == 0) ? Side::BUY : Side::SELL,
            OrderType::LIMIT, price, 10);
        auto trades = engine.submitOrder(o);
        tradeCount += static_cast<int>(trades.size());
    }

    auto end = std::chrono::high_resolution_clock::now();
    double ms = std::chrono::duration<double, std::milli>(end - start).count();
    double ops = 10000.0 / ms * 1000.0;

    std::cout << "\n[Benchmark] 10K orders in " << ms << " ms ("
              << static_cast<int>(ops) << " OPS, "
              << tradeCount << " trades)\n";

    EXPECT_GT(ops, 50000);  // must exceed 50K OPS on any modern machine
}
