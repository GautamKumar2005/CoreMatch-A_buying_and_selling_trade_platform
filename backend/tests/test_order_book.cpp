#include <gtest/gtest.h>
#include "engine/order_book.hpp"
#include <string>

using namespace exchange;

static Order makeOrder(const std::string& id, Side side, int64_t price, int64_t qty) {
    Order o;
    o.id           = id;
    o.symbol       = "AAPL";
    o.userId       = "user1";
    o.side         = side;
    o.type         = OrderType::LIMIT;
    o.price        = price;
    o.quantity     = qty;
    o.remainingQty = qty;
    o.status       = OrderStatus::PENDING;
    o.timestamp    = 0;
    o.createdAt    = 0;
    return o;
}

class OrderBookTest : public ::testing::Test {
protected:
    OrderBook book{"AAPL"};
};

TEST_F(OrderBookTest, EmptyBookHasNoDepth) {
    EXPECT_FALSE(book.bestBid().has_value());
    EXPECT_FALSE(book.bestAsk().has_value());
    EXPECT_EQ(book.size(), 0u);
}

TEST_F(OrderBookTest, AddBuyOrderUpdatesBestBid) {
    book.addOrder(makeOrder("B1", Side::BUY, 15000, 100));
    ASSERT_TRUE(book.bestBid().has_value());
    EXPECT_EQ(*book.bestBid(), 15000);
}

TEST_F(OrderBookTest, AddSellOrderUpdatesBestAsk) {
    book.addOrder(makeOrder("S1", Side::SELL, 15100, 50));
    ASSERT_TRUE(book.bestAsk().has_value());
    EXPECT_EQ(*book.bestAsk(), 15100);
}

TEST_F(OrderBookTest, BestBidIsHighestPrice) {
    book.addOrder(makeOrder("B1", Side::BUY, 15000, 10));
    book.addOrder(makeOrder("B2", Side::BUY, 15200, 10));
    book.addOrder(makeOrder("B3", Side::BUY, 14800, 10));
    EXPECT_EQ(*book.bestBid(), 15200);
}

TEST_F(OrderBookTest, BestAskIsLowestPrice) {
    book.addOrder(makeOrder("S1", Side::SELL, 15500, 10));
    book.addOrder(makeOrder("S2", Side::SELL, 15100, 10));
    book.addOrder(makeOrder("S3", Side::SELL, 15900, 10));
    EXPECT_EQ(*book.bestAsk(), 15100);
}

TEST_F(OrderBookTest, CancelOrderRemovesFromBook) {
    book.addOrder(makeOrder("B1", Side::BUY, 15000, 100));
    EXPECT_TRUE(book.hasOrder("B1"));
    EXPECT_TRUE(book.removeOrder("B1"));
    EXPECT_FALSE(book.hasOrder("B1"));
    EXPECT_FALSE(book.bestBid().has_value());
}

TEST_F(OrderBookTest, CancelNonExistentReturnsFalse) {
    EXPECT_FALSE(book.removeOrder("NONEXISTENT"));
}

TEST_F(OrderBookTest, DepthSnapshotCorrect) {
    book.addOrder(makeOrder("B1", Side::BUY, 15000, 100));
    book.addOrder(makeOrder("B2", Side::BUY, 15000, 50));
    book.addOrder(makeOrder("S1", Side::SELL, 15100, 75));
    auto snap = book.getSnapshot(10);
    ASSERT_EQ(snap.bids.size(), 1u);
    ASSERT_EQ(snap.asks.size(), 1u);
    EXPECT_EQ(snap.bids[0].totalQty, 150);  // 100 + 50
    EXPECT_EQ(snap.asks[0].totalQty, 75);
}

TEST_F(OrderBookTest, FIFOOrderPreserved) {
    book.addOrder(makeOrder("B1", Side::BUY, 15000, 100));
    book.addOrder(makeOrder("B2", Side::BUY, 15000, 200));
    // B1 should be at front of queue
    const auto& q = book.buyBook_[15000];
    ASSERT_EQ(q.size(), 2u);
    EXPECT_EQ(q.front().id, "B1");
}

TEST_F(OrderBookTest, SpreadCalculation) {
    book.addOrder(makeOrder("B1", Side::BUY,  15000, 100));
    book.addOrder(makeOrder("S1", Side::SELL, 15100, 100));
    auto spread = book.spread();
    ASSERT_TRUE(spread.has_value());
    EXPECT_EQ(*spread, 100); // 1.00 dollar spread
}
