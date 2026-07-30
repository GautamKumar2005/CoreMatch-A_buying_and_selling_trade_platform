#include <crow.h>
#include <crow/middlewares/cors.h>
#include <nlohmann/json.hpp>
#include <memory>
#include <thread>
#include <chrono>
#include <sstream>
#include <iomanip>

#include "engine/matching_engine.hpp"
#include "risk/risk_engine.hpp"
#include "portfolio/portfolio_engine.hpp"
#include "market/market_stats.hpp"
#include "market/market_simulator.hpp"
#include "auth/auth_manager.hpp"
#include "db/mongo_client.hpp"
#include "ws/ws_broadcaster.hpp"
#include "utils/logger.hpp"
#include "utils/config.hpp"

using json = nlohmann::json;
using namespace exchange;

// ────────────────────────────────────────────────────────────────────────────
//  Global Service Instances
// ────────────────────────────────────────────────────────────────────────────
static MatchingEngine  g_engine;
static RiskEngine      g_risk;
static PortfolioEngine g_portfolio;
static MarketStats     g_stats;
static AuthManager     g_auth;
static MongoClient     g_db;
static WsBroadcaster   g_ws;

// ────────────────────────────────────────────────────────────────────────────
//  JSON serializers
// ────────────────────────────────────────────────────────────────────────────
static json orderToJson(const Order& o) {
    return {
        {"id",           o.id},
        {"symbol",       o.symbol},
        {"userId",       o.userId},
        {"side",         o.sideStr()},
        {"type",         o.typeStr()},
        {"price",        o.displayPrice()},
        {"quantity",     o.quantity},
        {"filledQty",    o.filledQty},
        {"remainingQty", o.remainingQty},
        {"status",       o.statusStr()},
        {"rejectionReason", o.rejectionReason},
        {"createdAt",    o.createdAt}
    };
}

static json tradeToJson(const Trade& t) {
    return {
        {"id",          t.id},
        {"symbol",      t.symbol},
        {"buyOrderId",  t.buyOrderId},
        {"sellOrderId", t.sellOrderId},
        {"buyerId",     t.buyerId},
        {"sellerId",    t.sellerId},
        {"price",       t.displayPrice()},
        {"quantity",    t.quantity},
        {"value",       t.tradeValue()},
        {"createdAt",   t.createdAt}
    };
}

static json portfolioToJson(const Portfolio& p) {
    json positions = json::array();
    for (const auto& [sym, pos] : p.positions) {
        positions.push_back({
            {"symbol",        sym},
            {"quantity",      pos.quantity},
            {"avgBuyPrice",   pos.displayAvgBuyPrice()},
            {"lastPrice",     static_cast<double>(pos.lastPrice) / 100.0},
            {"unrealizedPnL", pos.displayUnrealizedPnL()},
            {"realizedPnL",   pos.displayRealizedPnL()},
            {"value",         pos.displayValue()}
        });
    }
    return {
        {"userId",          p.userId},
        {"cash",            p.displayCash()},
        {"positions",       positions},
        {"totalRealizedPnL",static_cast<double>(p.totalRealizedPnL) / 100.0},
        {"totalUnrealizedPnL", static_cast<double>(p.totalUnrealizedPnL()) / 100.0},
        {"portfolioValue",  p.displayPortfolioValue()}
    };
}

static json statsToJson(const SymbolStats& s) {
    return {
        {"symbol",         s.symbol},
        {"lastPrice",      s.displayLast()},
        {"openPrice",      static_cast<double>(s.openPrice) / 100.0},
        {"highPrice",      static_cast<double>(s.highPrice) / 100.0},
        {"lowPrice",       (s.lowPrice == std::numeric_limits<int64_t>::max()) ? 0.0 :
                           static_cast<double>(s.lowPrice) / 100.0},
        {"closePrice",     static_cast<double>(s.closePrice) / 100.0},
        {"volume",         s.volume},
        {"vwap",           s.vwap()},
        {"tradeCount",     s.tradeCount},
        {"changePercent",  s.changePercent()}
    };
}

static json orderbookToJson(const OrderBookSnapshot& snap) {
    json bids = json::array(), asks = json::array();
    for (const auto& l : snap.bids) {
        bids.push_back({{"price", l.displayPrice()},
                        {"qty", l.totalQty},
                        {"count", l.orderCount}});
    }
    for (const auto& l : snap.asks) {
        asks.push_back({{"price", l.displayPrice()},
                        {"qty", l.totalQty},
                        {"count", l.orderCount}});
    }
    return {{"symbol", snap.symbol}, {"bids", bids}, {"asks", asks}, {"timestamp", snap.timestamp}};
}

// ────────────────────────────────────────────────────────────────────────────
//  Auth Middleware helper
// ────────────────────────────────────────────────────────────────────────────
static std::optional<AuthToken> authenticate(const crow::request& req) {
    auto authHeader = req.get_header_value("Authorization");
    if (authHeader.size() < 8 || authHeader.substr(0, 7) != "Bearer ") {
        return std::nullopt;
    }
    return g_auth.verifyToken(authHeader.substr(7));
}

static crow::response unauthorized(const std::string& msg = "Unauthorized") {
    return crow::response(401, json{{"error", msg}}.dump());
}

static crow::response badRequest(const std::string& msg) {
    return crow::response(400, json{{"error", msg}}.dump());
}

static crow::response ok(const json& body) {
    auto res = crow::response(200, body.dump());
    res.set_header("Content-Type", "application/json");
    return res;
}

// ────────────────────────────────────────────────────────────────────────────
//  Generate unique ID
// ────────────────────────────────────────────────────────────────────────────
static std::string genId() {
    static std::atomic<uint64_t> counter{1};
    auto ts = std::chrono::duration_cast<std::chrono::microseconds>(
                  std::chrono::system_clock::now().time_since_epoch()).count();
    return std::to_string(ts) + std::to_string(counter.fetch_add(1));
}

// ────────────────────────────────────────────────────────────────────────────
//  Main
// ────────────────────────────────────────────────────────────────────────────
int main() {
    LOG_INFO("=== CoreMatch Exchange Engine v1.0 ===");

    const auto& cfg = Config::instance();

    // ── Connect MongoDB ───────────────────────────────────────────────────
    if (!g_db.connect(cfg.mongoUri, cfg.dbName)) {
        LOG_ERROR("Failed to connect to MongoDB. Check MONGODB_URI.");
        return 1;
    }

    // ── Load portfolios into memory ────────────────────────────────────────
    for (auto& p : g_db.loadAllPortfolios()) {
        g_portfolio.loadPortfolio(p);
    }

    // ── Seed market stats ─────────────────────────────────────────────────
    for (const auto& sym : MatchingEngine::symbols()) {
        g_stats.initSymbol(sym, 10000);
    }

    // ── Wire engine callbacks ─────────────────────────────────────────────
    g_engine.onTrade([&](const Trade& trade) {
        // Update market stats
        g_stats.processTrade(trade);
        // Update portfolios
        g_portfolio.processTrade(trade);
        // Persist async
        std::thread([trade]() { g_db.saveTrade(trade); }).detach();
        // Broadcast trade
        json msg = {{"type", "TRADE"}, {"data", tradeToJson(trade)}};
        g_ws.broadcast("trades/" + trade.symbol, msg);
        g_ws.broadcast("trades/ALL", msg);
        // Broadcast updated order book
        auto snap = g_engine.getOrderBook(trade.symbol);
        g_ws.broadcast("orderbook/" + trade.symbol, {{"type","ORDERBOOK"}, {"data", orderbookToJson(snap)}});
        // Broadcast market stats
        auto stats = g_stats.getStats(trade.symbol);
        if (stats) g_ws.broadcast("market/" + trade.symbol, {{"type","STATS"}, {"data", statsToJson(*stats)}});
    });

    g_engine.onOrderUpdate([&](const Order& order) {
        std::thread([order]() { g_db.updateOrder(order); }).detach();
        // Broadcast portfolio update to the user
        auto portfolio = g_portfolio.getPortfolio(order.userId);
        if (portfolio) {
            g_ws.broadcast("portfolio/" + order.userId,
                {{"type","PORTFOLIO"}, {"data", portfolioToJson(*portfolio)}});
        }
        // Broadcast order update
        g_ws.broadcast("orders/" + order.userId, {{"type","ORDER"}, {"data", orderToJson(order)}});
    });

    // ── Start market simulator ────────────────────────────────────────────
    MarketSimulator simulator([&](Order order) {
        // Bot orders bypass risk engine (they're simulated)
        auto trades = g_engine.submitOrder(std::move(order));
    });
    if (cfg.startSimulator) simulator.start();

    // ── Start Crow app ────────────────────────────────────────────────────
    crow::App<crow::CORSHandler> app;

    auto& cors = app.get_middleware<crow::CORSHandler>();
    cors.global()
        .headers("Authorization", "Content-Type", "Accept")
        .methods("GET"_method, "POST"_method, "PUT"_method, "DELETE"_method, "OPTIONS"_method)
        .origin("*");

    // ════════════════════════════════════════════════════════════════════
    //  AUTH ROUTES
    // ════════════════════════════════════════════════════════════════════

    // POST /api/auth/register
    CROW_ROUTE(app, "/api/auth/register").methods("POST"_method)
    ([](const crow::request& req) {
        try {
            auto body = json::parse(req.body);
            std::string username = body.value("username", "");
            std::string email    = body.value("email",    "");
            std::string password = body.value("password", "");

            if (username.empty() || email.empty() || password.size() < 6)
                return badRequest("username, email, and password (min 6 chars) required");

            // Check duplicate email
            if (g_db.findUserByEmail(email))
                return crow::response(409, json{{"error","Email already registered"}}.dump());

            // Create user
            User user;
            user.id       = genId();
            user.username = username;
            user.email    = email;
            user.cash     = Config::instance().startingCash;
            user.createdAt = std::chrono::duration_cast<std::chrono::milliseconds>(
                                 std::chrono::system_clock::now().time_since_epoch()).count();
            std::string salt      = AuthManager::generateSalt();
            user.passwordHash     = AuthManager::hashPassword(password, salt) + ":" + salt;

            g_db.saveUser(user);
            g_portfolio.initPortfolio(user.id, user.cash);
            g_db.saveAuditLog("USER_REGISTER", user.id, email);

            std::string token = g_auth.issueToken(user);
            return ok({{"token", token}, {"user", {
                {"id",       user.id},
                {"username", user.username},
                {"email",    user.email},
                {"role",     user.roleStr()},
                {"cash",     user.displayCash()}
            }}});
        } catch (const std::exception& e) {
            return crow::response(500, json{{"error", e.what()}}.dump());
        }
    });

    // POST /api/auth/login
    CROW_ROUTE(app, "/api/auth/login").methods("POST"_method)
    ([](const crow::request& req) {
        try {
            auto body = json::parse(req.body);
            std::string email    = body.value("email",    "");
            std::string password = body.value("password", "");
            if (email.empty() || password.empty())
                return badRequest("email and password required");

            auto maybeUser = g_db.findUserByEmail(email);
            if (!maybeUser)
                return crow::response(401, json{{"error","Invalid credentials"}}.dump());

            User& user = *maybeUser;
            // Hash format: "hash:salt"
            auto sep = user.passwordHash.find(':');
            if (sep == std::string::npos)
                return crow::response(500, json{{"error","Invalid password hash format"}}.dump());

            std::string hash = user.passwordHash.substr(0, sep);
            std::string salt = user.passwordHash.substr(sep + 1);
            if (!AuthManager::verifyPassword(password, salt, hash))
                return crow::response(401, json{{"error","Invalid credentials"}}.dump());

            std::string token = g_auth.issueToken(user);
            g_db.saveAuditLog("USER_LOGIN", user.id, email);

            return ok({{"token", token}, {"user", {
                {"id",       user.id},
                {"username", user.username},
                {"email",    user.email},
                {"role",     user.roleStr()},
                {"cash",     user.displayCash()}
            }}});
        } catch (const std::exception& e) {
            return crow::response(500, json{{"error", e.what()}}.dump());
        }
    });

    // GET /api/auth/profile
    CROW_ROUTE(app, "/api/auth/profile")
    ([](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();
        auto user = g_db.findUserById(auth->userId);
        if (!user) return crow::response(404, json{{"error","User not found"}}.dump());
        return ok({
            {"id",       user->id},
            {"username", user->username},
            {"email",    user->email},
            {"role",     user->roleStr()},
            {"cash",     user->displayCash()}
        });
    });

    // POST /api/auth/logout
    CROW_ROUTE(app, "/api/auth/logout").methods("POST"_method)
    ([](const crow::request& req) {
        auto authHeader = req.get_header_value("Authorization");
        if (authHeader.size() > 7) g_auth.revokeToken(authHeader.substr(7));
        return ok({{"message","Logged out"}});
    });

    // ════════════════════════════════════════════════════════════════════
    //  ORDER ROUTES
    // ════════════════════════════════════════════════════════════════════

    // POST /api/orders — Place order
    CROW_ROUTE(app, "/api/orders").methods("POST"_method)
    ([](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();

        try {
            auto body = json::parse(req.body);
            std::string symbol = body.value("symbol", "");
            std::string side   = body.value("side",   "");
            std::string type   = body.value("type",   "LIMIT");
            double price       = body.value("price",  0.0);
            int64_t qty        = body.value("quantity", 0);

            if (symbol.empty() || side.empty() || qty <= 0)
                return badRequest("symbol, side, and quantity required");

            Order order;
            order.id          = genId();
            order.symbol      = symbol;
            order.userId      = auth->userId;
            order.side        = (side == "BUY") ? Side::BUY : Side::SELL;
            order.type        = (type == "MARKET") ? OrderType::MARKET : OrderType::LIMIT;
            order.price       = static_cast<int64_t>(price * 100);
            order.quantity    = qty;
            order.remainingQty = qty;

            auto now = std::chrono::duration_cast<std::chrono::microseconds>(
                           std::chrono::system_clock::now().time_since_epoch()).count();
            order.timestamp  = now;
            order.createdAt  = now / 1000;

            // Risk check
            auto user      = g_db.findUserById(auth->userId);
            auto portfolio = g_portfolio.getPortfolio(auth->userId);
            if (!user || !portfolio) return crow::response(500, json{{"error","User not found"}}.dump());

            auto riskResult = g_risk.check(order, *user, *portfolio);
            if (!riskResult.approved) {
                order.status         = OrderStatus::REJECTED;
                order.rejectionReason = riskResult.reason;
                std::thread([order]() { g_db.saveOrder(order); }).detach();
                return crow::response(422, json{{"error", riskResult.reason}}.dump());
            }

            // Save order before matching
            g_risk.registerOrder(order.id);
            std::thread([order]() { g_db.saveOrder(order); }).detach();

            // Submit to matching engine
            auto trades = g_engine.submitOrder(order);

            // Build response
            json tradesArr = json::array();
            for (const auto& t : trades) tradesArr.push_back(tradeToJson(t));

            return ok({
                {"order",  orderToJson(order)},
                {"trades", tradesArr},
                {"tradeCount", trades.size()}
            });
        } catch (const std::exception& e) {
            return crow::response(500, json{{"error", e.what()}}.dump());
        }
    });

    // GET /api/orders — List user orders
    CROW_ROUTE(app, "/api/orders")
    ([](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();
        auto orders = g_db.getOrdersByUser(auth->userId);
        json arr = json::array();
        for (const auto& o : orders) arr.push_back(orderToJson(o));
        return ok({{"orders", arr}, {"count", arr.size()}});
    });

    // DELETE /api/orders/:id — Cancel order
    CROW_ROUTE(app, "/api/orders/<string>").methods("DELETE"_method)
    ([](const crow::request& req, const std::string& orderId) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();
        bool cancelled = g_engine.cancelOrder(orderId, auth->userId);
        if (!cancelled) return crow::response(404, json{{"error","Order not found or not yours"}}.dump());
        return ok({{"message","Order cancelled"}, {"orderId", orderId}});
    });

    // PUT /api/orders/:id — Modify order
    CROW_ROUTE(app, "/api/orders/<string>").methods("PUT"_method)
    ([](const crow::request& req, const std::string& orderId) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();
        try {
            auto body   = json::parse(req.body);
            double price = body.value("price",    0.0);
            int64_t qty  = body.value("quantity", 0LL);
            if (price <= 0 || qty <= 0) return badRequest("price and quantity required");

            bool modified = g_engine.modifyOrder(orderId, auth->userId,
                                                  static_cast<int64_t>(price * 100), qty);
            if (!modified)
                return crow::response(404, json{{"error","Order not found"}}.dump());
            return ok({{"message","Order modified"}, {"orderId", orderId}});
        } catch (...) { return crow::response(500, json{{"error","Server error"}}.dump()); }
    });

    // ════════════════════════════════════════════════════════════════════
    //  MARKET ROUTES
    // ════════════════════════════════════════════════════════════════════

    // GET /api/market/symbols
    CROW_ROUTE(app, "/api/market/symbols")
    ([]() {
        json arr = json::array();
        for (const auto& s : MatchingEngine::symbols()) arr.push_back(s);
        return ok({{"symbols", arr}});
    });

    // GET /api/market/orderbook/:symbol
    CROW_ROUTE(app, "/api/market/orderbook/<string>")
    ([](const std::string& symbol) {
        auto snap = g_engine.getOrderBook(symbol, 20);
        return ok(orderbookToJson(snap));
    });

    // GET /api/market/trades/:symbol
    CROW_ROUTE(app, "/api/market/trades/<string>")
    ([](const crow::request& req, const std::string& symbol) {
        int limit = 50;
        auto limParam = req.url_params.get("limit");
        if (limParam) limit = std::min(200, std::stoi(limParam));
        auto trades = g_db.getTradesBySymbol(symbol, limit);
        json arr = json::array();
        for (const auto& t : trades) arr.push_back(tradeToJson(t));
        return ok({{"symbol", symbol}, {"trades", arr}});
    });

    // GET /api/market/stats/:symbol
    CROW_ROUTE(app, "/api/market/stats/<string>")
    ([](const std::string& symbol) {
        auto stats = g_stats.getStats(symbol);
        if (!stats) return crow::response(404, json{{"error","Symbol not found"}}.dump());
        return ok(statsToJson(*stats));
    });

    // GET /api/market/stats (all symbols)
    CROW_ROUTE(app, "/api/market/stats")
    ([]() {
        auto allStats = g_stats.getAllStats();
        json arr = json::array();
        for (const auto& s : allStats) arr.push_back(statsToJson(s));
        return ok({{"symbols", arr}});
    });

    // GET /api/market/candles/:symbol
    CROW_ROUTE(app, "/api/market/candles/<string>")
    ([](const crow::request& req, const std::string& symbol) {
        std::string tf = "1m";
        int limit = 200;
        auto tfParam  = req.url_params.get("tf");
        auto limParam = req.url_params.get("limit");
        if (tfParam)  tf    = tfParam;
        if (limParam) limit = std::min(500, std::stoi(limParam));

        auto candles = g_stats.getCandles(symbol, tf, limit);
        json arr = json::array();
        for (const auto& c : candles) {
            arr.push_back({
                {"time",   c.timestamp / 1000},  // seconds for TradingView
                {"open",   c.displayOpen()},
                {"high",   c.displayHigh()},
                {"low",    c.displayLow()},
                {"close",  c.displayClose()},
                {"volume", c.volume},
                {"vwap",   c.vwap()}
            });
        }
        return ok({{"symbol", symbol}, {"timeframe", tf}, {"candles", arr}});
    });

    // ════════════════════════════════════════════════════════════════════
    //  PORTFOLIO ROUTES
    // ════════════════════════════════════════════════════════════════════

    // GET /api/portfolio
    CROW_ROUTE(app, "/api/portfolio")
    ([](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();
        auto portfolio = g_portfolio.getPortfolio(auth->userId);
        if (!portfolio) return crow::response(404, json{{"error","Portfolio not found"}}.dump());
        return ok(portfolioToJson(*portfolio));
    });

    // GET /api/portfolio/history
    CROW_ROUTE(app, "/api/portfolio/history")
    ([](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();
        auto trades = g_db.getTradesByUser(auth->userId, 100);
        json arr = json::array();
        for (const auto& t : trades) arr.push_back(tradeToJson(t));
        return ok({{"trades", arr}});
    });

    // ════════════════════════════════════════════════════════════════════
    //  ADMIN ROUTES
    // ════════════════════════════════════════════════════════════════════

    // GET /api/admin/metrics
    CROW_ROUTE(app, "/api/admin/metrics")
    ([](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth) return unauthorized();

        const auto& m = g_engine.metrics();
        return ok({
            {"totalOrders",    m.totalOrders.load()},
            {"totalTrades",    m.totalTrades.load()},
            {"rejectedOrders", m.rejectedOrders.load()},
            {"avgLatencyUs",   m.avgLatencyUs.load()},
            {"peakLatencyUs",  m.peakLatencyUs.load()},
            {"connectedUsers", g_ws.totalConnections()},
            {"simulatorRunning", true},
            {"symbols",        MatchingEngine::symbols().size()}
        });
    });

    // POST /api/admin/simulator/start
    CROW_ROUTE(app, "/api/admin/simulator/start").methods("POST"_method)
    ([&simulator](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth || auth->role != "ADMIN")
            return unauthorized("Admin role required");
        if (!simulator.isRunning()) simulator.start();
        return ok({{"message","Simulator started"}});
    });

    // POST /api/admin/simulator/stop
    CROW_ROUTE(app, "/api/admin/simulator/stop").methods("POST"_method)
    ([&simulator](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth || auth->role != "ADMIN")
            return unauthorized("Admin role required");
        simulator.stop();
        return ok({{"message","Simulator stopped"}});
    });

    // POST /api/admin/benchmark — Stress test
    CROW_ROUTE(app, "/api/admin/benchmark").methods("POST"_method)
    ([](const crow::request& req) {
        try {
            auto body   = json::parse(req.body);
            int64_t n   = body.value("count", 100000);
            n = std::min(n, (int64_t)10'000'000);

            // Run benchmark in-process
            auto start = std::chrono::high_resolution_clock::now();

            std::mt19937_64 rng{42};
            std::uniform_int_distribution<int64_t> priceDist(9000, 11000);
            std::uniform_int_distribution<int64_t> qtyDist(1, 100);
            std::uniform_int_distribution<int>     sideDist(0, 1);

            int64_t tradeCount = 0;
            static std::atomic<uint64_t> bmCounter{0};

            for (int64_t i = 0; i < n; ++i) {
                Order o;
                o.id           = "BM-" + std::to_string(bmCounter++);
                o.symbol       = "AAPL";
                o.userId       = "benchmark_user";
                o.side         = sideDist(rng) ? Side::BUY : Side::SELL;
                o.type         = OrderType::LIMIT;
                o.price        = priceDist(rng);
                o.quantity     = qtyDist(rng);
                o.remainingQty = o.quantity;
                o.timestamp    = i;
                o.createdAt    = i;

                auto trades = g_engine.submitOrder(o);
                tradeCount += static_cast<int64_t>(trades.size());
            }

            auto end = std::chrono::high_resolution_clock::now();
            double ms  = std::chrono::duration<double, std::milli>(end - start).count();
            double ops = (n / ms) * 1000.0;
            double tps = (tradeCount / ms) * 1000.0;

            return ok({
                {"ordersSubmitted", n},
                {"tradesExecuted",  tradeCount},
                {"elapsedMs",       ms},
                {"ordersPerSec",    static_cast<int64_t>(ops)},
                {"tradesPerSec",    static_cast<int64_t>(tps)},
                {"avgLatencyUs",    g_engine.metrics().avgLatencyUs.load()},
                {"peakLatencyUs",   g_engine.metrics().peakLatencyUs.load()}
            });
        } catch (const std::exception& e) {
            return crow::response(500, json{{"error", e.what()}}.dump());
        }
    });

    // GET /api/admin/users
    CROW_ROUTE(app, "/api/admin/users")
    ([](const crow::request& req) {
        auto auth = authenticate(req);
        if (!auth || auth->role != "ADMIN") return unauthorized("Admin role required");
        auto users = g_db.getAllUsers();
        json arr = json::array();
        for (const auto& u : users) {
            arr.push_back({
                {"id",       u.id},
                {"username", u.username},
                {"email",    u.email},
                {"role",     u.roleStr()},
                {"cash",     u.displayCash()},
                {"isActive", u.isActive}
            });
        }
        return ok({{"users", arr}, {"count", arr.size()}});
    });

    // ════════════════════════════════════════════════════════════════════
    //  WEBSOCKET
    // ════════════════════════════════════════════════════════════════════

    // ws://host:port/ws?channel=orderbook/AAPL
    CROW_ROUTE(app, "/ws")
    .websocket()
    .onopen([](crow::websocket::connection& conn) {
        LOG_INFO("WS connection opened");
    })
    .onmessage([](crow::websocket::connection& conn, const std::string& msg, bool is_binary) {
        try {
            auto body = json::parse(msg);
            std::string action  = body.value("action",  "subscribe");
            std::string channel = body.value("channel", "");
            if (channel.empty()) return;
            if (action == "subscribe") {
                g_ws.subscribe(channel, conn);
                conn.send_text(json{{"type","SUBSCRIBED"},{"channel",channel}}.dump());
            } else if (action == "unsubscribe") {
                // Individual channel unsubscribe not implemented for brevity
            }
        } catch (...) {}
    })
    .onclose([](crow::websocket::connection& conn, const std::string& reason) {
        g_ws.unsubscribe(conn);
        LOG_INFO("WS connection closed: ", reason);
    });

    // ── Health check ──────────────────────────────────────────────────────
    CROW_ROUTE(app, "/health")
    ([]() {
        return ok({{"status","ok"},{"engine","CoreMatch v1.0"}});
    });

    // ── Background: periodic metrics broadcast ────────────────────────────
    std::thread([&]() {
        while (true) {
            std::this_thread::sleep_for(std::chrono::seconds(2));
            const auto& m = g_engine.metrics();
            json metrics = {
                {"type", "METRICS"},
                {"totalOrders",   m.totalOrders.load()},
                {"totalTrades",   m.totalTrades.load()},
                {"avgLatencyUs",  m.avgLatencyUs.load()},
                {"peakLatencyUs", m.peakLatencyUs.load()},
                {"connections",   g_ws.totalConnections()}
            };
            g_ws.broadcast("admin/metrics", metrics);
        }
    }).detach();

    // ── Background: persist portfolios every 30s ──────────────────────────
    std::thread([&]() {
        while (true) {
            std::this_thread::sleep_for(std::chrono::seconds(30));
            // In production: iterate portfolios and save
        }
    }).detach();

    LOG_INFO("Starting server on port ", cfg.port, " with ", cfg.threads, " threads");
    g_db.saveAuditLog("SYSTEM_START", "system", "Exchange started");

    app.port(cfg.port)
       .multithreaded()
       .run();

    g_db.saveAuditLog("SYSTEM_STOP", "system", "Exchange stopped");
    simulator.stop();
    return 0;
}
