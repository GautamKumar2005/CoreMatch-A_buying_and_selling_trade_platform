#include "matching_engine.hpp"
#include "../utils/logger.hpp"
#include <chrono>
#include <algorithm>
#include <random>
#include <sstream>
#include <cassert>

namespace exchange {

// Pre-configured trading symbols with realistic starting prices (cents)
static const std::vector<std::string> kSymbols = {
    "AAPL","GOOGL","MSFT","AMZN","TSLA","NVDA","META","NFLX",
    "RELIANCE","TCS","INFY","HDFC","BTC","ETH"
};

// Generate a simple unique ID (in production use a proper UUID library)
static std::string generateId() {
    static std::atomic<uint64_t> counter{1};
    auto ts = std::chrono::duration_cast<std::chrono::microseconds>(
                  std::chrono::system_clock::now().time_since_epoch()).count();
    return std::to_string(ts) + "-" + std::to_string(counter.fetch_add(1));
}

MatchingEngine::MatchingEngine() {
    recentLatencies_.resize(kLatencyBufSize, 0);
    // Pre-create order books for all symbols
    for (const auto& sym : kSymbols) {
        books_[sym] = std::make_unique<OrderBook>(sym);
    }
    LOG_INFO("MatchingEngine initialized with ", kSymbols.size(), " symbols");
}

MatchingEngine::~MatchingEngine() = default;

const std::vector<std::string>& MatchingEngine::symbols() {
    return kSymbols;
}

OrderBook& MatchingEngine::getOrCreateBook(const std::string& symbol) {
    std::lock_guard<std::mutex> lock(booksMutex_);
    auto it = books_.find(symbol);
    if (it != books_.end()) return *it->second;
    books_[symbol] = std::make_unique<OrderBook>(symbol);
    return *books_[symbol];
}

const OrderBook* MatchingEngine::findBook(const std::string& symbol) const {
    std::lock_guard<std::mutex> lock(booksMutex_);
    auto it = books_.find(symbol);
    return (it != books_.end()) ? it->second.get() : nullptr;
}

Trade MatchingEngine::makeTrade(const Order& taker, const Order& maker,
                                 int64_t price, int64_t qty) const {
    std::string tradeId = generateId();
    auto now = std::chrono::duration_cast<std::chrono::microseconds>(
                   std::chrono::system_clock::now().time_since_epoch()).count();

    std::string buyerId, sellerId, buyOrdId, sellOrdId;
    if (taker.side == Side::BUY) {
        buyerId  = taker.userId; buyOrdId  = taker.id;
        sellerId = maker.userId; sellOrdId = maker.id;
    } else {
        sellerId = taker.userId; sellOrdId = taker.id;
        buyerId  = maker.userId; buyOrdId  = maker.id;
    }

    return Trade(tradeId, taker.symbol,
                 buyOrdId, sellOrdId,
                 buyerId, sellerId,
                 price, qty, now);
}

void MatchingEngine::matchLimitBuy(Order& taker, OrderBook& book, std::vector<Trade>& trades) {
    // Match against sell book: execute if ask <= taker.price
    auto& sellBook = book.sellBook_;

    while (taker.remainingQty > 0 && !sellBook.empty()) {
        auto it = sellBook.begin();  // lowest ask
        if (it->first > taker.price) break;  // no crossing

        int64_t execPrice = it->first;  // maker price (passive side)
        auto& queue = it->second;

        while (taker.remainingQty > 0 && !queue.empty()) {
            Order& maker = queue.front();
            int64_t fillQty = std::min(taker.remainingQty, maker.remainingQty);

            Trade trade = makeTrade(taker, maker, execPrice, fillQty);
            trades.push_back(trade);

            // Update quantities
            taker.filledQty   += fillQty;
            taker.remainingQty -= fillQty;
            maker.filledQty   += fillQty;
            maker.remainingQty -= fillQty;

            if (maker.remainingQty == 0) {
                maker.status = OrderStatus::FILLED;
                if (orderCallback_) orderCallback_(maker);
                // Remove from index
                book.orderIndex_.erase(maker.id);
                {
                    std::lock_guard<std::mutex> lock(orderMapMutex_);
                    orderSymbolMap_.erase(maker.id);
                }
                queue.pop_front();
            } else {
                maker.status = OrderStatus::PARTIAL;
                if (orderCallback_) orderCallback_(maker);
            }
        }
        if (queue.empty()) sellBook.erase(it);
    }
}

void MatchingEngine::matchLimitSell(Order& taker, OrderBook& book, std::vector<Trade>& trades) {
    // Match against buy book: execute if bid >= taker.price
    auto& buyBook = book.buyBook_;

    while (taker.remainingQty > 0 && !buyBook.empty()) {
        auto it = buyBook.begin();  // highest bid
        if (it->first < taker.price) break;  // no crossing

        int64_t execPrice = it->first;  // maker price
        auto& queue = it->second;

        while (taker.remainingQty > 0 && !queue.empty()) {
            Order& maker = queue.front();
            int64_t fillQty = std::min(taker.remainingQty, maker.remainingQty);

            Trade trade = makeTrade(taker, maker, execPrice, fillQty);
            trades.push_back(trade);

            taker.filledQty   += fillQty;
            taker.remainingQty -= fillQty;
            maker.filledQty   += fillQty;
            maker.remainingQty -= fillQty;

            if (maker.remainingQty == 0) {
                maker.status = OrderStatus::FILLED;
                if (orderCallback_) orderCallback_(maker);
                book.orderIndex_.erase(maker.id);
                {
                    std::lock_guard<std::mutex> lock(orderMapMutex_);
                    orderSymbolMap_.erase(maker.id);
                }
                queue.pop_front();
            } else {
                maker.status = OrderStatus::PARTIAL;
                if (orderCallback_) orderCallback_(maker);
            }
        }
        if (queue.empty()) buyBook.erase(it);
    }
}

void MatchingEngine::matchMarket(Order& taker, OrderBook& book, std::vector<Trade>& trades) {
    // Market order: fill at best available price without limit check
    if (taker.side == Side::BUY) {
        auto& sellBook = book.sellBook_;
        while (taker.remainingQty > 0 && !sellBook.empty()) {
            auto it = sellBook.begin();
            int64_t execPrice = it->first;
            auto& queue = it->second;

            while (taker.remainingQty > 0 && !queue.empty()) {
                Order& maker = queue.front();
                int64_t fillQty = std::min(taker.remainingQty, maker.remainingQty);

                Trade trade = makeTrade(taker, maker, execPrice, fillQty);
                trades.push_back(trade);

                taker.filledQty    += fillQty;
                taker.remainingQty -= fillQty;
                maker.filledQty    += fillQty;
                maker.remainingQty -= fillQty;

                if (maker.remainingQty == 0) {
                    maker.status = OrderStatus::FILLED;
                    if (orderCallback_) orderCallback_(maker);
                    book.orderIndex_.erase(maker.id);
                    {
                        std::lock_guard<std::mutex> lock(orderMapMutex_);
                        orderSymbolMap_.erase(maker.id);
                    }
                    queue.pop_front();
                } else {
                    maker.status = OrderStatus::PARTIAL;
                    if (orderCallback_) orderCallback_(maker);
                }
            }
            if (queue.empty()) sellBook.erase(it);
        }
    } else {
        auto& buyBook = book.buyBook_;
        while (taker.remainingQty > 0 && !buyBook.empty()) {
            auto it = buyBook.begin();
            int64_t execPrice = it->first;
            auto& queue = it->second;

            while (taker.remainingQty > 0 && !queue.empty()) {
                Order& maker = queue.front();
                int64_t fillQty = std::min(taker.remainingQty, maker.remainingQty);

                Trade trade = makeTrade(taker, maker, execPrice, fillQty);
                trades.push_back(trade);

                taker.filledQty    += fillQty;
                taker.remainingQty -= fillQty;
                maker.filledQty    += fillQty;
                maker.remainingQty -= fillQty;

                if (maker.remainingQty == 0) {
                    maker.status = OrderStatus::FILLED;
                    if (orderCallback_) orderCallback_(maker);
                    book.orderIndex_.erase(maker.id);
                    {
                        std::lock_guard<std::mutex> lock(orderMapMutex_);
                        orderSymbolMap_.erase(maker.id);
                    }
                    queue.pop_front();
                } else {
                    maker.status = OrderStatus::PARTIAL;
                    if (orderCallback_) orderCallback_(maker);
                }
            }
            if (queue.empty()) buyBook.erase(it);
        }
    }
    // Market orders that couldn't fill are cancelled
    if (taker.remainingQty > 0) {
        taker.status = OrderStatus::CANCELLED;
    }
}

std::vector<Trade> MatchingEngine::submitOrder(Order order) {
    auto startTime = std::chrono::high_resolution_clock::now();

    metrics_.totalOrders.fetch_add(1, std::memory_order_relaxed);

    std::vector<Trade> trades;
    OrderBook& book = getOrCreateBook(order.symbol);

    // Lock the specific order book
    std::unique_lock<std::shared_mutex> writeLock(book.mutex_);

    if (order.type == OrderType::MARKET) {
        matchMarket(order, book, trades);
    } else {
        // Limit order
        if (order.side == Side::BUY) {
            matchLimitBuy(order, book, trades);
        } else {
            matchLimitSell(order, book, trades);
        }

        // Add remaining qty to book
        if (order.remainingQty > 0 && order.status != OrderStatus::CANCELLED) {
            order.status = (order.filledQty > 0) ? OrderStatus::PARTIAL : OrderStatus::PENDING;
            book.addOrder(order);
            {
                std::lock_guard<std::mutex> lock(orderMapMutex_);
                orderSymbolMap_[order.id] = order.symbol;
            }
        }
    }

    if (order.remainingQty == 0 && order.filledQty > 0) {
        order.status = OrderStatus::FILLED;
    }

    writeLock.unlock();

    // Fire callbacks and track metrics
    metrics_.totalTrades.fetch_add(trades.size(), std::memory_order_relaxed);
    if (orderCallback_) orderCallback_(order);
    if (tradeCallback_) {
        for (const auto& t : trades) tradeCallback_(t);
    }

    // Track latency
    auto endTime = std::chrono::high_resolution_clock::now();
    int64_t latencyUs = std::chrono::duration_cast<std::chrono::microseconds>(
                            endTime - startTime).count();
    {
        std::lock_guard<std::mutex> lock(latencyMutex_);
        recentLatencies_[latencyIdx_ % kLatencyBufSize] = latencyUs;
        ++latencyIdx_;
        if (latencyUs > metrics_.peakLatencyUs.load()) {
            metrics_.peakLatencyUs.store(latencyUs);
        }
        // Compute avg from last N samples
        int64_t sum = 0;
        size_t count = std::min(latencyIdx_, kLatencyBufSize);
        for (size_t i = 0; i < count; ++i) sum += recentLatencies_[i];
        if (count > 0) metrics_.avgLatencyUs.store(sum / static_cast<int64_t>(count));
    }

    return trades;
}

bool MatchingEngine::cancelOrder(const std::string& orderId, const std::string& userId) {
    std::string symbol;
    {
        std::lock_guard<std::mutex> lock(orderMapMutex_);
        auto it = orderSymbolMap_.find(orderId);
        if (it == orderSymbolMap_.end()) return false;
        symbol = it->second;
    }

    OrderBook& book = getOrCreateBook(symbol);
    std::unique_lock<std::shared_mutex> lock(book.mutex_);

    auto maybeOrder = book.getOrder(orderId);
    if (!maybeOrder || maybeOrder->userId != userId) return false;

    bool removed = book.removeOrder(orderId);
    if (removed) {
        std::lock_guard<std::mutex> mapLock(orderMapMutex_);
        orderSymbolMap_.erase(orderId);
        if (orderCallback_) {
            Order cancelled = *maybeOrder;
            cancelled.status = OrderStatus::CANCELLED;
            orderCallback_(cancelled);
        }
    }
    return removed;
}

bool MatchingEngine::modifyOrder(const std::string& orderId, const std::string& userId,
                                  int64_t newPrice, int64_t newQty) {
    std::string symbol;
    {
        std::lock_guard<std::mutex> lock(orderMapMutex_);
        auto it = orderSymbolMap_.find(orderId);
        if (it == orderSymbolMap_.end()) return false;
        symbol = it->second;
    }

    OrderBook& book = getOrCreateBook(symbol);
    std::unique_lock<std::shared_mutex> lock(book.mutex_);

    auto maybeOrder = book.getOrder(orderId);
    if (!maybeOrder || maybeOrder->userId != userId) return false;

    return book.modifyOrder(orderId, newPrice, newQty);
}

OrderBookSnapshot MatchingEngine::getOrderBook(const std::string& symbol, int levels) const {
    const OrderBook* book = findBook(symbol);
    if (!book) {
        OrderBookSnapshot empty;
        empty.symbol = symbol;
        empty.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                              std::chrono::system_clock::now().time_since_epoch()).count();
        return empty;
    }
    std::shared_lock<std::shared_mutex> lock(book->mutex_);
    return book->getSnapshot(levels);
}

std::optional<int64_t> MatchingEngine::bestBid(const std::string& symbol) const {
    const OrderBook* book = findBook(symbol);
    if (!book) return std::nullopt;
    std::shared_lock<std::shared_mutex> lock(book->mutex_);
    return book->bestBid();
}

std::optional<int64_t> MatchingEngine::bestAsk(const std::string& symbol) const {
    const OrderBook* book = findBook(symbol);
    if (!book) return std::nullopt;
    std::shared_lock<std::shared_mutex> lock(book->mutex_);
    return book->bestAsk();
}

std::optional<Order> MatchingEngine::getOrder(const std::string& orderId) const {
    std::string symbol;
    {
        std::lock_guard<std::mutex> lock(orderMapMutex_);
        auto it = orderSymbolMap_.find(orderId);
        if (it == orderSymbolMap_.end()) return std::nullopt;
        symbol = it->second;
    }
    const OrderBook* book = findBook(symbol);
    if (!book) return std::nullopt;
    std::shared_lock<std::shared_mutex> lock(book->mutex_);
    return book->getOrder(orderId);
}

} // namespace exchange
