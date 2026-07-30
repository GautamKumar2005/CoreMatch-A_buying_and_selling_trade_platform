#pragma once
#include <crow.h>
#include <string>
#include <functional>
#include <unordered_map>
#include <unordered_set>
#include <mutex>
#include <nlohmann/json.hpp>

namespace exchange {

using json = nlohmann::json;

// WebSocket connection registry — one hub per channel
class WsBroadcaster {
public:
    WsBroadcaster() = default;

    // Subscribe a connection to a channel
    void subscribe(const std::string& channel, crow::websocket::connection& conn);

    // Unsubscribe a connection from all channels
    void unsubscribe(crow::websocket::connection& conn);

    // Broadcast JSON message to all subscribers of a channel
    void broadcast(const std::string& channel, const json& msg);

    // Broadcast to a specific channel+key (e.g., "portfolio/user123")
    void broadcastTo(const std::string& channel, const json& msg);

    // Get subscriber count for a channel
    size_t subscriberCount(const std::string& channel) const;

    // Total connected clients
    size_t totalConnections() const;

private:
    mutable std::mutex mutex_;
    // channel -> set of connections
    std::unordered_map<std::string, std::unordered_set<crow::websocket::connection*>> channels_;
    // connection -> set of channels (for reverse lookup on disconnect)
    std::unordered_map<crow::websocket::connection*, std::unordered_set<std::string>> connChannels_;
};

// Global broadcaster channels
namespace channels {
    inline const char* orderbook(const std::string& symbol) {
        return ("orderbook/" + symbol).c_str();
    }
    inline std::string trades(const std::string& symbol)    { return "trades/"    + symbol; }
    inline std::string portfolio(const std::string& userId)  { return "portfolio/" + userId; }
    inline std::string market(const std::string& symbol)     { return "market/"    + symbol; }
    inline const char* kAdminMetrics = "admin/metrics";
}

} // namespace exchange
