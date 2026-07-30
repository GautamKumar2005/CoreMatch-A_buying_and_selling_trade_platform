#pragma once
#include <string>
#include <unordered_map>
#include <vector>
#include <cstdint>

namespace exchange {

struct Position {
    std::string symbol;
    int64_t     quantity{0};
    int64_t     avgBuyPrice{0};    // integer cents
    int64_t     totalCost{0};      // total cost basis in cents
    int64_t     realizedPnL{0};    // cents
    int64_t     lastPrice{0};      // last traded price, cents

    [[nodiscard]] int64_t unrealizedPnL() const {
        return (lastPrice - avgBuyPrice) * quantity;
    }

    [[nodiscard]] double displayAvgBuyPrice() const {
        return static_cast<double>(avgBuyPrice) / 100.0;
    }

    [[nodiscard]] double displayUnrealizedPnL() const {
        return static_cast<double>(unrealizedPnL()) / 100.0;
    }

    [[nodiscard]] double displayRealizedPnL() const {
        return static_cast<double>(realizedPnL) / 100.0;
    }

    [[nodiscard]] double displayValue() const {
        return static_cast<double>(lastPrice * quantity) / 100.0;
    }
};

struct Portfolio {
    std::string userId;
    int64_t     cash;          // available cash in cents
    std::unordered_map<std::string, Position> positions;
    int64_t     totalRealizedPnL{0};
    int64_t     updatedAt{0};

    [[nodiscard]] double displayCash() const {
        return static_cast<double>(cash) / 100.0;
    }

    [[nodiscard]] int64_t totalUnrealizedPnL() const {
        int64_t total = 0;
        for (const auto& [sym, pos] : positions) {
            total += pos.unrealizedPnL();
        }
        return total;
    }

    [[nodiscard]] int64_t portfolioValue() const {
        int64_t total = cash;
        for (const auto& [sym, pos] : positions) {
            total += pos.lastPrice * pos.quantity;
        }
        return total;
    }

    [[nodiscard]] double displayPortfolioValue() const {
        return static_cast<double>(portfolioValue()) / 100.0;
    }
};

} // namespace exchange
