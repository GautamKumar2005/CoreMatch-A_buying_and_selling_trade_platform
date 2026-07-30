#include "mongo_client.hpp"
#include "../utils/logger.hpp"
#include <mongocxx/client.hpp>
#include <mongocxx/instance.hpp>
#include <mongocxx/uri.hpp>
#include <mongocxx/exception/exception.hpp>
#include <bsoncxx/builder/stream/document.hpp>
#include <bsoncxx/builder/basic/document.hpp>
#include <bsoncxx/builder/basic/kvp.hpp>
#include <bsoncxx/json.hpp>
#include <bsoncxx/types.hpp>
#include <chrono>

using bsoncxx::builder::basic::kvp;
using bsoncxx::builder::basic::make_document;

namespace exchange {

struct MongoClient::Impl {
    mongocxx::instance  instance;
    mongocxx::client    client;
    mongocxx::database  db;
    bool                ready{false};
};

MongoClient::~MongoClient() = default;

bool MongoClient::connect(const std::string& uri, const std::string& dbName) {
    try {
        impl_ = std::make_unique<Impl>();
        mongocxx::uri mongoUri{uri};
        impl_->client = mongocxx::client{mongoUri};
        impl_->db     = impl_->client[dbName];
        impl_->ready  = true;
        connected_    = true;

        // Ensure indexes
        impl_->db["users"].create_index(make_document(kvp("email", 1)),
            mongocxx::options::index{}.unique(true));
        impl_->db["orders"].create_index(make_document(kvp("userId", 1), kvp("createdAt", -1)));
        impl_->db["orders"].create_index(make_document(kvp("symbol", 1), kvp("status", 1)));
        impl_->db["trades"].create_index(make_document(kvp("symbol", 1), kvp("createdAt", -1)));
        impl_->db["trades"].create_index(make_document(kvp("buyerId", 1)));
        impl_->db["trades"].create_index(make_document(kvp("sellerId", 1)));

        LOG_INFO("MongoDB connected to database: ", dbName);
        return true;
    } catch (const mongocxx::exception& e) {
        LOG_ERROR("MongoDB connection failed: ", e.what());
        return false;
    }
}

// Helper: get current timestamp in milliseconds
static int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch()).count();
}

// ─── Users ─────────────────────────────────────────────────────────────────

bool MongoClient::saveUser(const User& user) {
    if (!connected_) return false;
    try {
        auto doc = make_document(
            kvp("_id",          user.id),
            kvp("username",     user.username),
            kvp("email",        user.email),
            kvp("passwordHash", user.passwordHash),
            kvp("role",         user.roleStr()),
            kvp("cash",         user.cash),
            kvp("isActive",     user.isActive),
            kvp("createdAt",    user.createdAt)
        );
        impl_->db["users"].insert_one(doc.view());
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("saveUser failed: ", e.what());
        return false;
    }
}

bool MongoClient::updateUserCash(const std::string& userId, int64_t cash) {
    if (!connected_) return false;
    try {
        auto filter = make_document(kvp("_id", userId));
        auto update = make_document(kvp("$set", make_document(kvp("cash", cash))));
        impl_->db["users"].update_one(filter.view(), update.view());
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("updateUserCash failed: ", e.what());
        return false;
    }
}

static User docToUser(const bsoncxx::document::view& doc) {
    User u;
    u.id           = std::string(doc["_id"].get_string().value);
    u.username     = std::string(doc["username"].get_string().value);
    u.email        = std::string(doc["email"].get_string().value);
    u.passwordHash = std::string(doc["passwordHash"].get_string().value);
    u.cash         = doc["cash"].get_int64().value;
    u.isActive     = doc["isActive"].get_bool().value;
    u.createdAt    = doc["createdAt"].get_int64().value;
    std::string role = std::string(doc["role"].get_string().value);
    u.role = (role == "ADMIN") ? UserRole::ADMIN : UserRole::TRADER;
    return u;
}

std::optional<User> MongoClient::findUserByEmail(const std::string& email) const {
    if (!connected_) return std::nullopt;
    try {
        auto filter = make_document(kvp("email", email));
        auto result = impl_->db["users"].find_one(filter.view());
        if (!result) return std::nullopt;
        return docToUser(result->view());
    } catch (...) { return std::nullopt; }
}

std::optional<User> MongoClient::findUserById(const std::string& id) const {
    if (!connected_) return std::nullopt;
    try {
        auto filter = make_document(kvp("_id", id));
        auto result = impl_->db["users"].find_one(filter.view());
        if (!result) return std::nullopt;
        return docToUser(result->view());
    } catch (...) { return std::nullopt; }
}

std::vector<User> MongoClient::getAllUsers() const {
    if (!connected_) return {};
    std::vector<User> users;
    try {
        auto cursor = impl_->db["users"].find({});
        for (auto& doc : cursor) users.push_back(docToUser(doc));
    } catch (...) {}
    return users;
}

// ─── Orders ────────────────────────────────────────────────────────────────

static auto orderToDoc(const Order& o) {
    return make_document(
        kvp("_id",         o.id),
        kvp("symbol",      o.symbol),
        kvp("userId",      o.userId),
        kvp("side",        o.sideStr()),
        kvp("type",        o.typeStr()),
        kvp("price",       o.price),
        kvp("quantity",    o.quantity),
        kvp("filledQty",   o.filledQty),
        kvp("remainingQty",o.remainingQty),
        kvp("status",      o.statusStr()),
        kvp("rejectionReason", o.rejectionReason),
        kvp("timestamp",   o.timestamp),
        kvp("createdAt",   o.createdAt)
    );
}

bool MongoClient::saveOrder(const Order& order) {
    if (!connected_) return false;
    try {
        impl_->db["orders"].insert_one(orderToDoc(order).view());
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("saveOrder failed: ", e.what());
        return false;
    }
}

bool MongoClient::updateOrder(const Order& order) {
    if (!connected_) return false;
    try {
        auto filter = make_document(kvp("_id", order.id));
        auto update = make_document(
            kvp("$set", make_document(
                kvp("filledQty",    order.filledQty),
                kvp("remainingQty", order.remainingQty),
                kvp("status",       order.statusStr()),
                kvp("rejectionReason", order.rejectionReason)
            ))
        );
        impl_->db["orders"].update_one(filter.view(), update.view());
        return true;
    } catch (...) { return false; }
}

std::vector<Order> MongoClient::getOrdersByUser(const std::string& userId, int limit) const {
    if (!connected_) return {};
    std::vector<Order> orders;
    try {
        auto filter  = make_document(kvp("userId", userId));
        auto options = mongocxx::options::find{};
        options.limit(limit);
        options.sort(make_document(kvp("createdAt", -1)));
        auto cursor = impl_->db["orders"].find(filter.view(), options);
        for (auto& doc : cursor) {
            Order o;
            o.id           = std::string(doc["_id"].get_string().value);
            o.symbol       = std::string(doc["symbol"].get_string().value);
            o.userId       = std::string(doc["userId"].get_string().value);
            o.price        = doc["price"].get_int64().value;
            o.quantity     = doc["quantity"].get_int64().value;
            o.filledQty    = doc["filledQty"].get_int64().value;
            o.remainingQty = doc["remainingQty"].get_int64().value;
            o.createdAt    = doc["createdAt"].get_int64().value;
            orders.push_back(o);
        }
    } catch (...) {}
    return orders;
}

std::vector<Order> MongoClient::getOpenOrders(const std::string& userId) const {
    if (!connected_) return {};
    std::vector<Order> orders;
    try {
        auto filter = make_document(
            kvp("userId", userId),
            kvp("status", make_document(
                kvp("$in", bsoncxx::builder::basic::make_array("PENDING", "PARTIAL"))
            ))
        );
        auto cursor = impl_->db["orders"].find(filter.view());
        for (auto& doc : cursor) {
            Order o;
            o.id       = std::string(doc["_id"].get_string().value);
            o.symbol   = std::string(doc["symbol"].get_string().value);
            o.userId   = std::string(doc["userId"].get_string().value);
            o.price    = doc["price"].get_int64().value;
            o.quantity = doc["quantity"].get_int64().value;
            o.filledQty= doc["filledQty"].get_int64().value;
            o.remainingQty = doc["remainingQty"].get_int64().value;
            orders.push_back(o);
        }
    } catch (...) {}
    return orders;
}

// ─── Trades ────────────────────────────────────────────────────────────────

bool MongoClient::saveTrade(const Trade& trade) {
    if (!connected_) return false;
    try {
        auto doc = make_document(
            kvp("_id",        trade.id),
            kvp("symbol",     trade.symbol),
            kvp("buyOrderId", trade.buyOrderId),
            kvp("sellOrderId",trade.sellOrderId),
            kvp("buyerId",    trade.buyerId),
            kvp("sellerId",   trade.sellerId),
            kvp("price",      trade.price),
            kvp("quantity",   trade.quantity),
            kvp("timestamp",  trade.timestamp),
            kvp("createdAt",  trade.createdAt)
        );
        impl_->db["trades"].insert_one(doc.view());
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("saveTrade failed: ", e.what());
        return false;
    }
}

std::vector<Trade> MongoClient::getTradesBySymbol(const std::string& symbol, int limit) const {
    if (!connected_) return {};
    std::vector<Trade> trades;
    try {
        auto filter  = make_document(kvp("symbol", symbol));
        auto options = mongocxx::options::find{};
        options.limit(limit);
        options.sort(make_document(kvp("createdAt", -1)));
        auto cursor = impl_->db["trades"].find(filter.view(), options);
        for (auto& doc : cursor) {
            Trade t;
            t.id         = std::string(doc["_id"].get_string().value);
            t.symbol     = std::string(doc["symbol"].get_string().value);
            t.buyerId    = std::string(doc["buyerId"].get_string().value);
            t.sellerId   = std::string(doc["sellerId"].get_string().value);
            t.price      = doc["price"].get_int64().value;
            t.quantity   = doc["quantity"].get_int64().value;
            t.createdAt  = doc["createdAt"].get_int64().value;
            trades.push_back(t);
        }
    } catch (...) {}
    return trades;
}

std::vector<Trade> MongoClient::getTradesByUser(const std::string& userId, int limit) const {
    if (!connected_) return {};
    std::vector<Trade> trades;
    try {
        auto filter  = make_document(
            kvp("$or", bsoncxx::builder::basic::make_array(
                make_document(kvp("buyerId",  userId)),
                make_document(kvp("sellerId", userId))
            ))
        );
        auto options = mongocxx::options::find{};
        options.limit(limit);
        options.sort(make_document(kvp("createdAt", -1)));
        auto cursor = impl_->db["trades"].find(filter.view(), options);
        for (auto& doc : cursor) {
            Trade t;
            t.id        = std::string(doc["_id"].get_string().value);
            t.symbol    = std::string(doc["symbol"].get_string().value);
            t.buyerId   = std::string(doc["buyerId"].get_string().value);
            t.sellerId  = std::string(doc["sellerId"].get_string().value);
            t.price     = doc["price"].get_int64().value;
            t.quantity  = doc["quantity"].get_int64().value;
            t.createdAt = doc["createdAt"].get_int64().value;
            trades.push_back(t);
        }
    } catch (...) {}
    return trades;
}

// ─── Portfolios ────────────────────────────────────────────────────────────

bool MongoClient::savePortfolio(const Portfolio& p) {
    if (!connected_) return false;
    try {
        // Build positions array
        bsoncxx::builder::basic::array posArr;
        for (const auto& [sym, pos] : p.positions) {
            posArr.append(make_document(
                kvp("symbol",      sym),
                kvp("quantity",    pos.quantity),
                kvp("avgBuyPrice", pos.avgBuyPrice),
                kvp("totalCost",   pos.totalCost),
                kvp("realizedPnL", pos.realizedPnL),
                kvp("lastPrice",   pos.lastPrice)
            ));
        }
        auto filter = make_document(kvp("userId", p.userId));
        auto update = make_document(
            kvp("$set", make_document(
                kvp("userId",           p.userId),
                kvp("cash",             p.cash),
                kvp("totalRealizedPnL", p.totalRealizedPnL),
                kvp("positions",        posArr),
                kvp("updatedAt",        p.updatedAt)
            ))
        );
        mongocxx::options::update opts;
        opts.upsert(true);
        impl_->db["portfolios"].update_one(filter.view(), update.view(), opts);
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("savePortfolio failed: ", e.what());
        return false;
    }
}

std::optional<Portfolio> MongoClient::loadPortfolio(const std::string& userId) const {
    if (!connected_) return std::nullopt;
    try {
        auto filter = make_document(kvp("userId", userId));
        auto result = impl_->db["portfolios"].find_one(filter.view());
        if (!result) return std::nullopt;
        auto& doc = *result;
        Portfolio p;
        p.userId           = std::string(doc["userId"].get_string().value);
        p.cash             = doc["cash"].get_int64().value;
        p.totalRealizedPnL = doc["totalRealizedPnL"].get_int64().value;
        p.updatedAt        = doc["updatedAt"].get_int64().value;
        // Load positions
        if (doc.find("positions") != doc.end()) {
            for (auto& posDoc : doc["positions"].get_array().value) {
                Position pos;
                pos.symbol      = std::string(posDoc["symbol"].get_string().value);
                pos.quantity    = posDoc["quantity"].get_int64().value;
                pos.avgBuyPrice = posDoc["avgBuyPrice"].get_int64().value;
                pos.totalCost   = posDoc["totalCost"].get_int64().value;
                pos.realizedPnL = posDoc["realizedPnL"].get_int64().value;
                pos.lastPrice   = posDoc["lastPrice"].get_int64().value;
                p.positions[pos.symbol] = pos;
            }
        }
        return p;
    } catch (...) { return std::nullopt; }
}

std::vector<Portfolio> MongoClient::loadAllPortfolios() const {
    if (!connected_) return {};
    std::vector<Portfolio> result;
    try {
        auto cursor = impl_->db["portfolios"].find({});
        for (auto& doc : cursor) {
            Portfolio p;
            p.userId = std::string(doc["userId"].get_string().value);
            p.cash   = doc["cash"].get_int64().value;
            result.push_back(p);
        }
    } catch (...) {}
    return result;
}

// ─── Audit Logs ────────────────────────────────────────────────────────────

bool MongoClient::saveAuditLog(const std::string& event,
                                const std::string& userId,
                                const std::string& detail) {
    if (!connected_) return false;
    try {
        auto doc = make_document(
            kvp("event",     event),
            kvp("userId",    userId),
            kvp("detail",    detail),
            kvp("timestamp", nowMs())
        );
        impl_->db["auditLogs"].insert_one(doc.view());
        return true;
    } catch (...) { return false; }
}

bool MongoClient::saveMarketSnapshot(const std::string& symbol,
                                      const std::string& snapshotJson) {
    if (!connected_) return false;
    try {
        auto filter = make_document(kvp("symbol", symbol));
        auto update = make_document(
            kvp("$set", make_document(
                kvp("symbol",    symbol),
                kvp("data",      snapshotJson),
                kvp("updatedAt", nowMs())
            ))
        );
        mongocxx::options::update opts;
        opts.upsert(true);
        impl_->db["marketSnapshots"].update_one(filter.view(), update.view(), opts);
        return true;
    } catch (...) { return false; }
}

} // namespace exchange
