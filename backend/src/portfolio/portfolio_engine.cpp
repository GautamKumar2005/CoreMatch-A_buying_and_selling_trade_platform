#include "portfolio_engine.hpp"
#include "../utils/logger.hpp"
#include <chrono>

namespace exchange {

void PortfolioEngine::initPortfolio(const std::string& userId, int64_t startingCash) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    if (portfolios_.count(userId)) return;  // already exists
    Portfolio p;
    p.userId = userId;
    p.cash   = startingCash;
    p.updatedAt = std::chrono::duration_cast<std::chrono::milliseconds>(
                      std::chrono::system_clock::now().time_since_epoch()).count();
    portfolios_[userId] = std::move(p);
}

void PortfolioEngine::loadPortfolio(Portfolio portfolio) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    portfolios_[portfolio.userId] = std::move(portfolio);
}

void PortfolioEngine::updateBuyer(Portfolio& buyer, const Trade& trade) {
    int64_t cost = trade.price * trade.quantity;
    buyer.cash -= cost;

    auto& pos = buyer.positions[trade.symbol];
    pos.symbol = trade.symbol;
    // Update average buy price: (totalCost + newCost) / (oldQty + newQty)
    pos.totalCost += cost;
    pos.quantity  += trade.quantity;
    if (pos.quantity > 0) {
        pos.avgBuyPrice = pos.totalCost / pos.quantity;
    }
    // Update last price
    pos.lastPrice = trade.price;
    buyer.updatedAt = trade.createdAt;
}

void PortfolioEngine::updateSeller(Portfolio& seller, const Trade& trade) {
    int64_t proceeds = trade.price * trade.quantity;
    seller.cash += proceeds;

    auto& pos = seller.positions[trade.symbol];
    // Realized PnL = (sell price - avg buy price) * qty
    int64_t realizedPnL = (trade.price - pos.avgBuyPrice) * trade.quantity;
    pos.realizedPnL += realizedPnL;
    seller.totalRealizedPnL += realizedPnL;

    pos.quantity  -= trade.quantity;
    pos.totalCost  = pos.avgBuyPrice * pos.quantity;  // recalculate
    pos.lastPrice  = trade.price;

    if (pos.quantity == 0) {
        seller.positions.erase(trade.symbol);
    }
    seller.updatedAt = trade.createdAt;
}

void PortfolioEngine::processTrade(const Trade& trade) {
    std::unique_lock<std::shared_mutex> lock(mutex_);

    auto buyerIt  = portfolios_.find(trade.buyerId);
    auto sellerIt = portfolios_.find(trade.sellerId);

    if (buyerIt != portfolios_.end()) {
        updateBuyer(buyerIt->second, trade);
        if (updateCallback_) updateCallback_(buyerIt->second);
    }
    if (sellerIt != portfolios_.end()) {
        updateSeller(sellerIt->second, trade);
        if (updateCallback_) updateCallback_(sellerIt->second);
    }

    // Update last prices
    lastPrices_[trade.symbol] = trade.price;
    // Update unrealized PnL for all positions in this symbol
    for (auto& [uid, portfolio] : portfolios_) {
        auto posIt = portfolio.positions.find(trade.symbol);
        if (posIt != portfolio.positions.end()) {
            posIt->second.lastPrice = trade.price;
        }
    }
}

bool PortfolioEngine::reserveCash(const std::string& userId, int64_t amount) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    auto it = portfolios_.find(userId);
    if (it == portfolios_.end() || it->second.cash < amount) return false;
    it->second.cash -= amount;
    return true;
}

void PortfolioEngine::releaseCash(const std::string& userId, int64_t amount) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    auto it = portfolios_.find(userId);
    if (it != portfolios_.end()) it->second.cash += amount;
}

bool PortfolioEngine::reserveStock(const std::string& userId,
                                    const std::string& symbol, int64_t qty) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    auto it = portfolios_.find(userId);
    if (it == portfolios_.end()) return false;
    auto posIt = it->second.positions.find(symbol);
    if (posIt == it->second.positions.end() || posIt->second.quantity < qty) return false;
    posIt->second.quantity -= qty;
    return true;
}

void PortfolioEngine::releaseStock(const std::string& userId,
                                    const std::string& symbol, int64_t qty) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    auto it = portfolios_.find(userId);
    if (it != portfolios_.end()) it->second.positions[symbol].quantity += qty;
}

void PortfolioEngine::updateLastPrice(const std::string& symbol, int64_t price) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    lastPrices_[symbol] = price;
    for (auto& [uid, portfolio] : portfolios_) {
        auto posIt = portfolio.positions.find(symbol);
        if (posIt != portfolio.positions.end()) {
            posIt->second.lastPrice = price;
        }
    }
}

std::optional<Portfolio> PortfolioEngine::getPortfolio(const std::string& userId) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    auto it = portfolios_.find(userId);
    if (it == portfolios_.end()) return std::nullopt;
    return it->second;
}

std::optional<int64_t> PortfolioEngine::getCash(const std::string& userId) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    auto it = portfolios_.find(userId);
    if (it == portfolios_.end()) return std::nullopt;
    return it->second.cash;
}

} // namespace exchange
