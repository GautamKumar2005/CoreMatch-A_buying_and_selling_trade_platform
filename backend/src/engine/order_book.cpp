#include "order_book.hpp"
#include <chrono>
#include <algorithm>
#include <stdexcept>

namespace exchange {

OrderBook::OrderBook(std::string symbol) : symbol_(std::move(symbol)) {}

void OrderBook::addOrder(const Order& order) {
    if (order.remainingQty <= 0) return;

    if (order.side == Side::BUY) {
        buyBook_[order.price].push_back(order);
    } else {
        sellBook_[order.price].push_back(order);
    }
    orderIndex_[order.id] = {order.side, order.price};
}

bool OrderBook::removeOrder(const std::string& orderId) {
    auto idxIt = orderIndex_.find(orderId);
    if (idxIt == orderIndex_.end()) return false;

    auto [side, price] = idxIt->second;
    orderIndex_.erase(idxIt);

    if (side == Side::BUY) {
        auto bookIt = buyBook_.find(price);
        if (bookIt != buyBook_.end()) {
            auto& q = bookIt->second;
            auto it = std::find_if(q.begin(), q.end(),
                [&orderId](const Order& o) { return o.id == orderId; });
            if (it != q.end()) q.erase(it);
            if (q.empty()) buyBook_.erase(bookIt);
        }
    } else {
        auto bookIt = sellBook_.find(price);
        if (bookIt != sellBook_.end()) {
            auto& q = bookIt->second;
            auto it = std::find_if(q.begin(), q.end(),
                [&orderId](const Order& o) { return o.id == orderId; });
            if (it != q.end()) q.erase(it);
            if (q.empty()) sellBook_.erase(bookIt);
        }
    }
    return true;
}

bool OrderBook::modifyOrder(const std::string& orderId, int64_t newPrice, int64_t newQty) {
    auto idxIt = orderIndex_.find(orderId);
    if (idxIt == orderIndex_.end()) return false;

    auto [side, oldPrice] = idxIt->second;

    auto findAndModify = [&](auto& book) -> bool {
        auto bookIt = book.find(oldPrice);
        if (bookIt == book.end()) return false;
        auto& q = bookIt->second;
        auto it = std::find_if(q.begin(), q.end(),
            [&orderId](const Order& o) { return o.id == orderId; });
        if (it == q.end()) return false;

        Order modified = *it;
        q.erase(it);
        if (q.empty()) book.erase(bookIt);

        modified.price       = newPrice;
        modified.quantity    = newQty;
        modified.remainingQty = newQty - modified.filledQty;
        book[newPrice].push_back(modified);
        orderIndex_[orderId] = {side, newPrice};
        return true;
    };

    if (side == Side::BUY) return findAndModify(buyBook_);
    else                    return findAndModify(sellBook_);
}

std::optional<int64_t> OrderBook::bestBid() const {
    if (buyBook_.empty()) return std::nullopt;
    return buyBook_.begin()->first;
}

std::optional<int64_t> OrderBook::bestAsk() const {
    if (sellBook_.empty()) return std::nullopt;
    return sellBook_.begin()->first;
}

std::optional<int64_t> OrderBook::spread() const {
    auto bid = bestBid();
    auto ask = bestAsk();
    if (!bid || !ask) return std::nullopt;
    return *ask - *bid;
}

OrderBookSnapshot OrderBook::getSnapshot(int levels) const {
    OrderBookSnapshot snap;
    snap.symbol    = symbol_;
    snap.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                         std::chrono::system_clock::now().time_since_epoch()).count();

    int count = 0;
    for (auto& [price, queue] : buyBook_) {
        if (count++ >= levels) break;
        int64_t total = 0;
        for (auto& o : queue) total += o.remainingQty;
        snap.bids.push_back({price, total, static_cast<int>(queue.size())});
    }

    count = 0;
    for (auto& [price, queue] : sellBook_) {
        if (count++ >= levels) break;
        int64_t total = 0;
        for (auto& o : queue) total += o.remainingQty;
        snap.asks.push_back({price, total, static_cast<int>(queue.size())});
    }

    return snap;
}

std::optional<Order> OrderBook::getOrder(const std::string& orderId) const {
    auto idxIt = orderIndex_.find(orderId);
    if (idxIt == orderIndex_.end()) return std::nullopt;

    auto [side, price] = idxIt->second;

    auto findInBook = [&](const auto& book) -> std::optional<Order> {
        auto bookIt = book.find(price);
        if (bookIt == book.end()) return std::nullopt;
        for (const auto& o : bookIt->second) {
            if (o.id == orderId) return o;
        }
        return std::nullopt;
    };

    if (side == Side::BUY) return findInBook(buyBook_);
    else                    return findInBook(sellBook_);
}

size_t OrderBook::size() const {
    return orderIndex_.size();
}

bool OrderBook::hasOrder(const std::string& orderId) const {
    return orderIndex_.count(orderId) > 0;
}

} // namespace exchange
