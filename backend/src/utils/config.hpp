#pragma once
#include <string>
#include <cstdlib>
#include <stdexcept>

namespace exchange {

struct Config {
    // Server
    std::string host        = "0.0.0.0";
    int         port        = 8080;
    int         threads     = 4;

    // MongoDB
    std::string mongoUri;
    std::string dbName      = "CoreMatch";

    // JWT
    std::string jwtSecret   = "exchange_super_secret_key_change_in_prod";
    int         jwtExpiry   = 86400; // 24 hours in seconds

    // Simulator
    bool        startSimulator   = true;
    int         simulatorBots    = 5;
    int         ordersPerSecond  = 10;  // per bot

    // Risk limits
    int64_t     maxOrderQty      = 100'000;
    int64_t     maxOrderValue    = 10'000'000'00; // $10M in cents
    int         dailyOrderLimit  = 10'000;

    // Starting cash per user
    int64_t     startingCash     = 1'000'000'00; // $1M in cents

    static Config& instance() {
        static Config cfg = Config::fromEnv();
        return cfg;
    }

private:
    static Config fromEnv() {
        Config c;
        if (auto v = std::getenv("HOST"))        c.host       = v;
        if (auto v = std::getenv("PORT"))        c.port       = std::stoi(v);
        if (auto v = std::getenv("THREADS"))     c.threads    = std::stoi(v);
        if (auto v = std::getenv("MONGODB_URI")) c.mongoUri   = v;
        if (auto v = std::getenv("DB_NAME"))     c.dbName     = v;
        if (auto v = std::getenv("JWT_SECRET"))  c.jwtSecret  = v;
        if (auto v = std::getenv("JWT_EXPIRY"))  c.jwtExpiry  = std::stoi(v);
        if (c.mongoUri.empty()) {
            throw std::runtime_error("MONGODB_URI environment variable is required");
        }
        return c;
    }
};

} // namespace exchange
