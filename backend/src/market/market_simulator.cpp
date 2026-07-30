#include "market_simulator.hpp"
#include "../utils/logger.hpp"
#include <chrono>
#include <thread>

namespace exchange {

// Realistic seed prices (in cents)
const std::unordered_map<std::string, int64_t>& MarketSimulator::seedPrices() {
    static const std::unordered_map<std::string, int64_t> prices = {
        {"AAPL",     17500},   // $175.00
        {"GOOGL",    14000},   // $140.00
        {"MSFT",     37500},   // $375.00
        {"AMZN",     18500},   // $185.00
        {"TSLA",     25000},   // $250.00
        {"NVDA",     80000},   // $800.00
        {"META",     50000},   // $500.00
        {"NFLX",     60000},   // $600.00
        {"RELIANCE", 280000},  // ₹2800 (treating as cents)
        {"TCS",      400000},  // ₹4000
        {"INFY",     175000},  // ₹1750
        {"HDFC",     160000},  // ₹1600
        {"BTC",    5000000},   // $50,000
        {"ETH",     300000},   // $3,000
    };
    return prices;
}

MarketSimulator::MarketSimulator(SimulatorOrderSubmitter submitFn)
    : submitFn_(std::move(submitFn)) {
    // Pre-configure bots for each symbol
    const auto& seeds = seedPrices();
    for (const auto& sym : MatchingEngine::symbols()) {
        int64_t mid = 10000; // default
        auto it = seeds.find(sym);
        if (it != seeds.end()) mid = it->second;
        midPrices_[sym] = mid;

        BotConfig cfg;
        cfg.botId            = "BOT_" + sym;
        cfg.symbol           = sym;
        cfg.midPrice         = mid;
        cfg.priceRange       = mid / 100; // 1% range
        cfg.ordersPerSec     = 3;
        cfg.marketOrderRatio = 0.15;
        cfg.cancelRatio      = 0.20;
        bots_.push_back(cfg);
    }
}

MarketSimulator::~MarketSimulator() {
    stop();
}

void MarketSimulator::start() {
    if (running_.load()) return;
    running_.store(true);
    for (const auto& bot : bots_) {
        threads_.emplace_back(&MarketSimulator::botLoop, this, bot);
    }
    LOG_INFO("Market simulator started with ", bots_.size(), " bots");
}

void MarketSimulator::stop() {
    running_.store(false);
    for (auto& t : threads_) {
        if (t.joinable()) t.join();
    }
    threads_.clear();
    LOG_INFO("Market simulator stopped");
}

void MarketSimulator::updateMidPrice(const std::string& symbol, int64_t price) {
    std::lock_guard<std::mutex> lock(midPriceMutex_);
    midPrices_[symbol] = price;
}

Order MarketSimulator::generateOrder(const BotConfig& config, std::mt19937_64& rng) {
    // Get current mid price
    int64_t mid;
    {
        std::lock_guard<std::mutex> lock(midPriceMutex_);
        mid = midPrices_.count(config.symbol) ? midPrices_[config.symbol] : config.midPrice;
    }

    std::uniform_real_distribution<double> probDist(0.0, 1.0);
    std::uniform_int_distribution<int64_t> qtyDist(1, 100);
    std::uniform_int_distribution<int64_t> spreadDist(0, config.priceRange);

    Order order;
    // Generate a static-like bot user ID
    order.userId = config.botId;
    order.symbol = config.symbol;

    // Random side
    order.side = (probDist(rng) < 0.5) ? Side::BUY : Side::SELL;
    order.quantity = qtyDist(rng);

    // Market vs limit order
    if (probDist(rng) < config.marketOrderRatio) {
        order.type  = OrderType::MARKET;
        order.price = 0;
    } else {
        order.type = OrderType::LIMIT;
        int64_t offset = spreadDist(rng);
        if (order.side == Side::BUY) {
            order.price = mid - offset;  // bid below mid
        } else {
            order.price = mid + offset;  // ask above mid
        }
        if (order.price <= 0) order.price = 1;
    }

    // Generate ID
    static std::atomic<uint64_t> simOrderCount{0};
    auto ts = std::chrono::duration_cast<std::chrono::microseconds>(
                  std::chrono::system_clock::now().time_since_epoch()).count();
    order.id          = "SIM-" + std::to_string(ts) + "-" + std::to_string(simOrderCount++);
    order.remainingQty = order.quantity;
    order.status       = OrderStatus::PENDING;
    order.timestamp    = ts;
    order.createdAt    = ts / 1000;

    return order;
}

void MarketSimulator::botLoop(BotConfig config) {
    std::mt19937_64 rng{std::random_device{}()};
    int64_t intervalMs = (config.ordersPerSec > 0)
                         ? (1000 / config.ordersPerSec)
                         : 500;

    while (running_.load()) {
        try {
            Order order = generateOrder(config, rng);
            submitFn_(order);
        } catch (const std::exception& e) {
            LOG_WARN("Simulator bot error: ", e.what());
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(intervalMs));
    }
}

} // namespace exchange
