#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <algorithm>
#include "engine/matching_engine.hpp"
#include "utils/logger.hpp"

using namespace exchange;

int main() {
    // Silence logger or output to stderr
    Logger::instance().setLevel(LogLevel::WARN);

    MatchingEngine engine;
    
    // Wire callbacks
    engine.onTrade([](const Trade& t) {
        std::cout << "TRADE " << t.id << " " << t.symbol << " " << t.buyOrderId << " " << t.sellOrderId 
                  << " " << t.buyerId << " " << t.sellerId << " " << t.price << " " << t.quantity 
                  << " " << t.timestamp << "\n";
        std::cout.flush();
    });

    engine.onOrderUpdate([](const Order& o) {
        std::string reason = o.rejectionReason;
        if (reason.empty()) {
            reason = "NONE";
        } else {
            // Replace spaces with underscores for easy parsing
            std::replace(reason.begin(), reason.end(), ' ', '_');
        }
        std::cout << "ORDER " << o.id << " " << o.symbol << " " << o.userId << " " 
                  << o.sideStr() << " " << o.typeStr() << " " << o.price << " " 
                  << o.quantity << " " << o.filledQty << " " << o.remainingQty << " " 
                  << o.statusStr() << " " << reason << "\n";
        std::cout.flush();
    });

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string cmd;
        ss >> cmd;
        if (cmd == "SUBMIT") {
            // SUBMIT <symbol> <id> <userId> <side_BUY_SELL> <type_LIMIT_MARKET> <price> <qty>
            std::string symbol, id, userId, sideStr, typeStr;
            int64_t price, qty;
            if (ss >> symbol >> id >> userId >> sideStr >> typeStr >> price >> qty) {
                Order order;
                order.id = id;
                order.symbol = symbol;
                order.userId = userId;
                order.side = (sideStr == "BUY") ? Side::BUY : Side::SELL;
                order.type = (typeStr == "MARKET") ? OrderType::MARKET : OrderType::LIMIT;
                order.price = price;
                order.quantity = qty;
                order.remainingQty = qty;
                order.status = OrderStatus::PENDING;
                auto now = std::chrono::duration_cast<std::chrono::microseconds>(
                               std::chrono::system_clock::now().time_since_epoch()).count();
                order.timestamp = now;
                order.createdAt = now / 1000;
                
                engine.submitOrder(order);
                std::cout << "SUCCESS SUBMIT " << id << "\n";
            } else {
                std::cout << "ERROR INVALID_SUBMIT_ARGS\n";
            }
        } else if (cmd == "CANCEL") {
            // CANCEL <orderId> <userId>
            std::string orderId, userId;
            if (ss >> orderId >> userId) {
                bool cancelled = engine.cancelOrder(orderId, userId);
                if (cancelled) {
                    std::cout << "SUCCESS CANCEL " << orderId << "\n";
                } else {
                    std::cout << "ERROR CANCEL_FAILED " << orderId << "\n";
                }
            } else {
                std::cout << "ERROR INVALID_CANCEL_ARGS\n";
            }
        } else if (cmd == "MODIFY") {
            // MODIFY <orderId> <userId> <price> <qty>
            std::string orderId, userId;
            int64_t price, qty;
            if (ss >> orderId >> userId >> price >> qty) {
                bool modified = engine.modifyOrder(orderId, userId, price, qty);
                if (modified) {
                    std::cout << "SUCCESS MODIFY " << orderId << "\n";
                } else {
                    std::cout << "ERROR MODIFY_FAILED " << orderId << "\n";
                }
            } else {
                std::cout << "ERROR INVALID_MODIFY_ARGS\n";
            }
        } else if (cmd == "ORDERBOOK") {
            // ORDERBOOK <symbol>
            std::string symbol;
            if (ss >> symbol) {
                auto snap = engine.getOrderBook(symbol);
                std::cout << "ORDERBOOK " << symbol << " " << snap.timestamp;
                std::cout << " BIDS:[";
                for (size_t i = 0; i < snap.bids.size(); ++i) {
                    std::cout << snap.bids[i].price << ":" << snap.bids[i].totalQty << ":" << snap.bids[i].orderCount;
                    if (i + 1 < snap.bids.size()) std::cout << ",";
                }
                std::cout << "] ASKS:[";
                for (size_t i = 0; i < snap.asks.size(); ++i) {
                    std::cout << snap.asks[i].price << ":" << snap.asks[i].totalQty << ":" << snap.asks[i].orderCount;
                    if (i + 1 < snap.asks.size()) std::cout << ",";
                }
                std::cout << "]\n";
            } else {
                std::cout << "ERROR INVALID_ORDERBOOK_ARGS\n";
            }
        } else if (cmd == "METRICS") {
            const auto& m = engine.metrics();
            std::cout << "METRICS " << m.totalOrders.load() << " " << m.totalTrades.load() << " " 
                      << m.rejectedOrders.load() << " " << m.avgLatencyUs.load() << " " << m.peakLatencyUs.load() << "\n";
        } else {
            std::cout << "ERROR UNKNOWN_COMMAND\n";
        }
        std::cout.flush();
    }
    return 0;
}
