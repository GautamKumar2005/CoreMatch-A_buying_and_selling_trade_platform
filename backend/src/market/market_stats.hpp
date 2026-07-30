#pragma once
#include "../models/trade.hpp"
#include <string>
#include <vector>
#include <deque>
#include <unordered_map>
#include <shared_mutex>
#include <chrono>
#include <cstdint>

namespace exchange {

struct Candle {
    int64_t open;
    int64_t high;
    int64_t low;
    int64_t close;
    int64_t volume;        // total shares
    int64_t turnover;      // price * volume (cents)
    int64_t timestamp;     // candle start time (Unix milliseconds)
    int64_t tradeCount;

    [[nodiscard]] double displayOpen()  const { return static_cast<double>(open)  / 100.0; }
    [[nodiscard]] double displayHigh()  const { return static_cast<double>(high)  / 100.0; }
    [[nodiscard]] double displayLow()   const { return static_cast<double>(low)   / 100.0; }
    [[nodiscard]] double displayClose() const { return static_cast<double>(close) / 100.0; }
    [[nodiscard]] double vwap() const {
        return volume > 0 ? static_cast<double>(turnover) / (volume * 100.0) : 0.0;
    }
};

struct SymbolStats {
    std::string symbol;
    int64_t lastPrice{0};
    int64_t openPrice{0};
    int64_t highPrice{0};
    int64_t lowPrice{std::numeric_limits<int64_t>::max()};
    int64_t closePrice{0};
    int64_t volume{0};
    int64_t turnover{0};    // sum(price*qty) for VWAP
    int64_t tradeCount{0};
    int64_t prevClose{0};

    [[nodiscard]] double vwap() const {
        return volume > 0 ? static_cast<double>(turnover) / (volume * 100.0) : 0.0;
    }
    [[nodiscard]] double displayLast()   const { return static_cast<double>(lastPrice) / 100.0; }
    [[nodiscard]] double changePercent() const {
        if (prevClose == 0) return 0.0;
        return (static_cast<double>(lastPrice - prevClose) / prevClose) * 100.0;
    }
};

class MarketStats {
public:
    MarketStats() = default;

    // Process a new trade — updates OHLCV and all candle timeframes
    void processTrade(const Trade& trade);

    // Get symbol statistics
    std::optional<SymbolStats> getStats(const std::string& symbol) const;

    // Get all symbol stats (for watchlist)
    std::vector<SymbolStats> getAllStats() const;

    // Get candles for a symbol + timeframe
    // timeframe: 1m, 5m, 15m, 1h, 1d
    std::vector<Candle> getCandles(const std::string& symbol,
                                    const std::string& timeframe,
                                    int limit = 200) const;

    // Initialize symbol with seed price (for simulator)
    void initSymbol(const std::string& symbol, int64_t seedPrice);

private:
    mutable std::shared_mutex mutex_;

    std::unordered_map<std::string, SymbolStats> stats_;

    // Candles: symbol -> timeframe -> deque of candles (newest at back)
    std::unordered_map<std::string,
        std::unordered_map<std::string, std::deque<Candle>>> candles_;

    static constexpr size_t kMaxCandles = 500;

    // Timeframe in milliseconds
    static int64_t timeframeMs(const std::string& tf);

    // Get or create candle for the current time bucket
    Candle& getOrCreateCandle(const std::string& symbol,
                               const std::string& tf,
                               int64_t tradeTime,
                               int64_t price);
};

} // namespace exchange
