#include "ws_broadcaster.hpp"

namespace exchange {

void WsBroadcaster::subscribe(const std::string& channel, crow::websocket::connection& conn) {
    std::lock_guard<std::mutex> lock(mutex_);
    channels_[channel].insert(&conn);
    connChannels_[&conn].insert(channel);
}

void WsBroadcaster::unsubscribe(crow::websocket::connection& conn) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = connChannels_.find(&conn);
    if (it == connChannels_.end()) return;
    for (const auto& ch : it->second) {
        channels_[ch].erase(&conn);
        if (channels_[ch].empty()) channels_.erase(ch);
    }
    connChannels_.erase(it);
}

void WsBroadcaster::broadcast(const std::string& channel, const json& msg) {
    std::string payload = msg.dump();
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = channels_.find(channel);
    if (it == channels_.end()) return;
    for (auto* conn : it->second) {
        try { conn->send_text(payload); }
        catch (...) { /* connection may have closed */ }
    }
}

void WsBroadcaster::broadcastTo(const std::string& channel, const json& msg) {
    broadcast(channel, msg);
}

size_t WsBroadcaster::subscriberCount(const std::string& channel) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = channels_.find(channel);
    return (it != channels_.end()) ? it->second.size() : 0;
}

size_t WsBroadcaster::totalConnections() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connChannels_.size();
}

} // namespace exchange
