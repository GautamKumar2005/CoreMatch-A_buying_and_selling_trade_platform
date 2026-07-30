#pragma once
#include <iostream>
#include <sstream>
#include <string>
#include <mutex>
#include <chrono>
#include <iomanip>

namespace exchange {

enum class LogLevel { DEBUG, INFO, WARN, ERROR };

class Logger {
public:
    static Logger& instance() {
        static Logger inst;
        return inst;
    }

    void setLevel(LogLevel level) { level_ = level; }

    template<typename... Args>
    void log(LogLevel level, Args&&... args) {
        if (level < level_) return;
        std::lock_guard<std::mutex> lock(mutex_);
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::tm tm{};
#ifdef _WIN32
        localtime_s(&tm, &time);
#else
        localtime_r(&time, &tm);
#endif
        std::ostringstream oss;
        oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S")
            << " [" << levelStr(level) << "] ";
        (oss << ... << std::forward<Args>(args));
        std::cerr << oss.str() << "\n";
        std::cerr.flush();
    }

    template<typename... Args> void debug(Args&&... args) { log(LogLevel::DEBUG, std::forward<Args>(args)...); }
    template<typename... Args> void info (Args&&... args) { log(LogLevel::INFO,  std::forward<Args>(args)...); }
    template<typename... Args> void warn (Args&&... args) { log(LogLevel::WARN,  std::forward<Args>(args)...); }
    template<typename... Args> void error(Args&&... args) { log(LogLevel::ERROR, std::forward<Args>(args)...); }

private:
    Logger() : level_(LogLevel::INFO) {}
    LogLevel level_;
    std::mutex mutex_;

    static const char* levelStr(LogLevel l) {
        switch (l) {
            case LogLevel::DEBUG: return "DEBUG";
            case LogLevel::INFO:  return " INFO";
            case LogLevel::WARN:  return " WARN";
            case LogLevel::ERROR: return "ERROR";
        }
        return "?????";
    }
};

// Convenience macros
#define LOG_DEBUG(...) exchange::Logger::instance().debug(__VA_ARGS__)
#define LOG_INFO(...)  exchange::Logger::instance().info(__VA_ARGS__)
#define LOG_WARN(...)  exchange::Logger::instance().warn(__VA_ARGS__)
#define LOG_ERROR(...) exchange::Logger::instance().error(__VA_ARGS__)

} // namespace exchange
