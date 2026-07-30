#pragma once
#include <string>
#include <cstdint>
#include <chrono>

namespace exchange {

enum class Side : uint8_t {
    BUY  = 0,
    SELL = 1
};

enum class OrderType : uint8_t {
    LIMIT  = 0,
    MARKET = 1
};

enum class OrderStatus : uint8_t {
    PENDING   = 0,
    PARTIAL   = 1,
    FILLED    = 2,
    CANCELLED = 3,
    REJECTED  = 4
};

// Prices stored as integers (price * 100) to avoid floating-point issues
// e.g., $150.25 -> 15025
struct Order {
    std::string id;          // UUID
    std::string symbol;      // e.g., "AAPL"
    std::string userId;
    Side        side;
    OrderType   type;
    int64_t     price;       // integer cents, ignored for MARKET orders
    int64_t     quantity;    // number of shares
    int64_t     filledQty{0};
    int64_t     remainingQty;
    OrderStatus status{OrderStatus::PENDING};
    std::string rejectionReason;
    int64_t     timestamp;   // Unix microseconds
    int64_t     createdAt;   // Unix milliseconds

    Order() = default;

    Order(std::string id_, std::string symbol_, std::string userId_,
          Side side_, OrderType type_, int64_t price_, int64_t quantity_)
        : id(std::move(id_))
        , symbol(std::move(symbol_))
        , userId(std::move(userId_))
        , side(side_)
        , type(type_)
        , price(price_)
        , quantity(quantity_)
        , filledQty(0)
        , remainingQty(quantity_)
        , status(OrderStatus::PENDING)
    {
        auto now = std::chrono::system_clock::now();
        timestamp = std::chrono::duration_cast<std::chrono::microseconds>(
                        now.time_since_epoch()).count();
        createdAt = timestamp / 1000;
    }

    [[nodiscard]] bool isFilled()    const { return status == OrderStatus::FILLED; }
    [[nodiscard]] bool isCancelled() const { return status == OrderStatus::CANCELLED; }
    [[nodiscard]] bool isRejected()  const { return status == OrderStatus::REJECTED; }
    [[nodiscard]] bool isActive()    const {
        return status == OrderStatus::PENDING || status == OrderStatus::PARTIAL;
    }

    // Convert side to display string
    [[nodiscard]] std::string sideStr() const {
        return side == Side::BUY ? "BUY" : "SELL";
    }
    [[nodiscard]] std::string typeStr() const {
        return type == OrderType::LIMIT ? "LIMIT" : "MARKET";
    }
    [[nodiscard]] std::string statusStr() const {
        switch (status) {
            case OrderStatus::PENDING:   return "PENDING";
            case OrderStatus::PARTIAL:   return "PARTIAL";
            case OrderStatus::FILLED:    return "FILLED";
            case OrderStatus::CANCELLED: return "CANCELLED";
            case OrderStatus::REJECTED:  return "REJECTED";
        }
        return "UNKNOWN";
    }

    // Display price as double
    [[nodiscard]] double displayPrice() const {
        return static_cast<double>(price) / 100.0;
    }
};

} // namespace exchange
