#pragma once
#include "../engine/matching_engine.hpp"
#include <thread>
#include <atomic>
#include <vector>
#include <random>
#include <functional>

namespace exchange {

using SimulatorOrderSubmitter = std::function<void(Order)>;

// Bot trader configuration
struct BotConfig {
    std::string botId;
    std::string symbol;
    int64_t midPrice;         // starting mid-price for the symbol (cents)
    int64_t priceRange;       // +/- range around mid price (cents)
    int     ordersPerSec;     // target order submission rate
    double  marketOrderRatio; // fraction of orders that are market orders
    double  cancelRatio;      // fraction of orders to immediately cancel
};

class MarketSimulator {
public:
    explicit MarketSimulator(SimulatorOrderSubmitter submitFn);
    ~MarketSimulator();

    void start();
    void stop();
    bool isRunning() const { return running_.load(); }

    // Update mid-price for a symbol (from real trades)
    void updateMidPrice(const std::string& symbol, int64_t price);

    // Get active bot count
    int botCount() const { return static_cast<int>(bots_.size()); }

private:
    void botLoop(BotConfig config);
    Order generateOrder(const BotConfig& config, std::mt19937_64& rng);

    SimulatorOrderSubmitter submitFn_;
    std::atomic<bool>       running_{false};
    std::vector<std::thread> threads_;
    std::vector<BotConfig>   bots_;

    mutable std::mutex midPriceMutex_;
    std::unordered_map<std::string, int64_t> midPrices_;

    // Seed prices for each symbol (realistic starting values in cents)
    static const std::unordered_map<std::string, int64_t>& seedPrices();
};

} // namespace exchange
