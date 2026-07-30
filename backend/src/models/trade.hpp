#pragma once
#include <string>
#include <cstdint>

namespace exchange {

struct Trade {
    std::string id;            // UUID
    std::string symbol;
    std::string buyOrderId;
    std::string sellOrderId;
    std::string buyerId;
    std::string sellerId;
    int64_t     price;         // execution price (integer cents)
    int64_t     quantity;      // shares traded
    int64_t     timestamp;     // Unix microseconds
    int64_t     createdAt;     // Unix milliseconds

    Trade() = default;

    Trade(std::string id_, std::string symbol_,
          std::string buyOrderId_, std::string sellOrderId_,
          std::string buyerId_, std::string sellerId_,
          int64_t price_, int64_t quantity_, int64_t ts)
        : id(std::move(id_))
        , symbol(std::move(symbol_))
        , buyOrderId(std::move(buyOrderId_))
        , sellOrderId(std::move(sellOrderId_))
        , buyerId(std::move(buyerId_))
        , sellerId(std::move(sellerId_))
        , price(price_)
        , quantity(quantity_)
        , timestamp(ts)
        , createdAt(ts / 1000)
    {}

    [[nodiscard]] double displayPrice()  const { return static_cast<double>(price) / 100.0; }
    [[nodiscard]] double tradeValue()    const { return displayPrice() * static_cast<double>(quantity); }
};

} // namespace exchange
