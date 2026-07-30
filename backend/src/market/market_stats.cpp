#include "market_stats.hpp"
#include <algorithm>
#include <limits>

namespace exchange {

int64_t MarketStats::timeframeMs(const std::string& tf) {
    if (tf == "1m")  return 60'000LL;
    if (tf == "5m")  return 300'000LL;
    if (tf == "15m") return 900'000LL;
    if (tf == "1h")  return 3'600'000LL;
    if (tf == "1d")  return 86'400'000LL;
    return 60'000LL;  // default 1m
}

void MarketStats::initSymbol(const std::string& symbol, int64_t seedPrice) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    auto& s = stats_[symbol];
    s.symbol     = symbol;
    s.lastPrice  = seedPrice;
    s.openPrice  = seedPrice;
    s.highPrice  = seedPrice;
    s.lowPrice   = seedPrice;
    s.closePrice = seedPrice;
    s.prevClose  = seedPrice;
}

Candle& MarketStats::getOrCreateCandle(const std::string& symbol,
                                        const std::string& tf,
                                        int64_t tradeTime,
                                        int64_t price) {
    auto& tfMap  = candles_[symbol];
    auto& deque_ = tfMap[tf];
    int64_t tfMs = timeframeMs(tf);
    int64_t bucket = (tradeTime / tfMs) * tfMs;  // floor to candle start

    if (deque_.empty() || deque_.back().timestamp != bucket) {
        if (deque_.size() >= kMaxCandles) deque_.pop_front();
        Candle c;
        c.open      = price;
        c.high      = price;
        c.low       = price;
        c.close     = price;
        c.volume    = 0;
        c.turnover  = 0;
        c.timestamp = bucket;
        c.tradeCount = 0;
        deque_.push_back(std::move(c));
    }
    return deque_.back();
}

void MarketStats::processTrade(const Trade& trade) {
    std::unique_lock<std::shared_mutex> lock(mutex_);

    auto& s = stats_[trade.symbol];
    s.symbol = trade.symbol;

    // Update OHLCV
    if (s.openPrice == 0) {
        s.openPrice = trade.price;
        s.prevClose = trade.price;
    }
    if (trade.price > s.highPrice) s.highPrice = trade.price;
    if (s.lowPrice == std::numeric_limits<int64_t>::max() || trade.price < s.lowPrice)
        s.lowPrice = trade.price;

    s.lastPrice  = trade.price;
    s.closePrice = trade.price;
    s.volume    += trade.quantity;
    s.turnover  += trade.price * trade.quantity;
    s.tradeCount++;

    // Update all timeframe candles
    int64_t tradeMs = trade.createdAt;  // already milliseconds
    for (const auto& tf : {"1m", "5m", "15m", "1h", "1d"}) {
        auto& candle = getOrCreateCandle(trade.symbol, tf, tradeMs, trade.price);
        if (trade.price > candle.high) candle.high = trade.price;
        if (trade.price < candle.low)  candle.low  = trade.price;
        candle.close     = trade.price;
        candle.volume   += trade.quantity;
        candle.turnover += trade.price * trade.quantity;
        candle.tradeCount++;
    }
}

std::optional<SymbolStats> MarketStats::getStats(const std::string& symbol) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    auto it = stats_.find(symbol);
    if (it == stats_.end()) return std::nullopt;
    return it->second;
}

std::vector<SymbolStats> MarketStats::getAllStats() const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    std::vector<SymbolStats> result;
    result.reserve(stats_.size());
    for (const auto& [sym, stat] : stats_) result.push_back(stat);
    return result;
}

std::vector<Candle> MarketStats::getCandles(const std::string& symbol,
                                             const std::string& timeframe,
                                             int limit) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    auto symIt = candles_.find(symbol);
    if (symIt == candles_.end()) return {};
    auto tfIt = symIt->second.find(timeframe);
    if (tfIt == symIt->second.end()) return {};

    const auto& deq = tfIt->second;
    int start = std::max(0, static_cast<int>(deq.size()) - limit);
    return std::vector<Candle>(deq.begin() + start, deq.end());
}

} // namespace exchange
