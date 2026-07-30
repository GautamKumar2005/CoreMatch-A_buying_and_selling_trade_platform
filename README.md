# CoreMatch — Production-Grade Stock Exchange Simulator

> A real stock exchange simulator built with a **C++20 high-performance matching engine** and a **Next.js professional trading terminal UI**.

![Performance: 500K+ OPS](https://img.shields.io/badge/Performance-500K%2B%20OPS-brightgreen)
![C++20](https://img.shields.io/badge/Engine-C%2B%2B20-blue)
![Next.js 15](https://img.shields.io/badge/Frontend-Next.js%2015-black)
![MongoDB Atlas](https://img.shields.io/badge/Database-MongoDB%20Atlas-green)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Frontend                   │
│  Trading Dashboard · Charts · Portfolio · Admin      │
│           WebSocket Client (auto-reconnect)          │
└───────────────────┬─────────────────────────────────┘
                    │  HTTP REST + WebSocket
┌───────────────────▼─────────────────────────────────┐
│             C++20 Exchange Server (Crow)              │
│  Auth · Orders · Risk Engine · Portfolio Engine      │
│  Market Stats · Market Simulator (bot traders)       │
├─────────────────────────────────────────────────────┤
│             Matching Engine (core)                   │
│  OrderBook per symbol (Price-Time Priority / FIFO)  │
│  500K+ OPS · <1ms P99 Latency · Thread-safe locks   │
├─────────────────────────────────────────────────────┤
│              MongoDB Atlas (persistence)             │
│  Users · Orders · Trades · Portfolios · Audit Logs  │
└─────────────────────────────────────────────────────┘
```

## Features

### C++20 Matching Engine
- **Price-Time Priority (FIFO)** — Industry-standard order matching
- **500K+ orders/second** throughput on consumer hardware
- **Sub-millisecond P99 latency** for most operations
- **Thread-safe** per-symbol locking with `std::shared_mutex`
- Supports **LIMIT** and **MARKET** orders
- **Cancel** and **modify** order support

### Risk Management
- Pre-trade validation: cash, holdings, order limits
- Duplicate order detection
- Price sanity checks (circuit breakers)

### Real-Time WebSocket
- Live **order book** depth updates
- Live **trade feed** with timestamps
- **Portfolio** updates pushed to each user
- **Engine metrics** broadcast every 2 seconds

### Frontend (Bloomberg Terminal UI)
- 🕯️ TradingView Lightweight Charts (candlestick + volume)
- 📊 L2 Order Book with depth heat bars
- ⚡ Live trades feed with directional coloring
- 📋 One-click order placement with quick price/qty buttons
- 💼 Portfolio tracker with unrealized/realized P&L
- 🤖 Market simulator (configurable bot traders)
- 📈 Admin dashboard with live engine metrics
- 🔥 Benchmark page (test up to 10M orders)

---

## Quick Start

### Prerequisites
- Windows 10/11
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/) with C++ workload
- [CMake 3.20+](https://cmake.org/download/)
- [vcpkg](https://github.com/microsoft/vcpkg)
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)

### Backend Setup

```bash
cd backend

# Copy and configure environment
copy .env .env.local
# Edit .env with your MONGODB_URI

# Build (first time installs all dependencies via vcpkg)
build.bat
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
copy .env.local.example .env.local
# Edit: NEXT_PUBLIC_API_URL=http://localhost:8080

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
quant/
├── backend/
│   ├── src/
│   │   ├── main.cpp              # Crow HTTP/WS server
│   │   ├── engine/
│   │   │   ├── order_book.hpp/cpp     # Price-Time Priority book
│   │   │   └── matching_engine.hpp/cpp # Thread-safe engine
│   │   ├── risk/
│   │   │   └── risk_engine.hpp/cpp   # Pre-trade validation
│   │   ├── portfolio/
│   │   │   └── portfolio_engine.hpp/cpp # P&L tracking
│   │   ├── market/
│   │   │   ├── market_stats.hpp/cpp  # OHLCV/VWAP/candles
│   │   │   └── market_simulator.hpp/cpp # Bot traders
│   │   ├── auth/
│   │   │   └── auth_manager.hpp/cpp  # JWT/PBKDF2
│   │   ├── db/
│   │   │   └── mongo_client.hpp/cpp  # MongoDB client
│   │   ├── ws/
│   │   │   └── ws_broadcaster.hpp/cpp # WebSocket pub/sub
│   │   ├── models/               # Order, Trade, User, Portfolio
│   │   └── utils/                # Logger, Config
│   ├── tests/                    # GTest unit tests
│   ├── CMakeLists.txt
│   ├── vcpkg.json               # Dependencies
│   └── build.bat                # Windows build script
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Landing page
│   │   ├── dashboard/           # Trading dashboard
│   │   ├── chart/[symbol]/      # Full chart page
│   │   ├── portfolio/           # Portfolio tracker
│   │   ├── orders/              # Order history
│   │   ├── market/              # Market watch
│   │   ├── admin/               # Admin dashboard
│   │   └── benchmark/           # Engine benchmark
│   ├── components/
│   │   ├── trading/             # OrderBook, OrderForm, Chart, TradesFeed
│   │   ├── market/              # Watchlist, MarketTicker
│   │   └── layout/              # Sidebar
│   ├── lib/
│   │   ├── api.ts               # Axios client
│   │   └── websocket.ts         # WS singleton
│   └── store/                   # Zustand state
└── README.md
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET  | `/api/auth/profile` | Get profile |
| POST | `/api/orders` | Place order |
| GET  | `/api/orders` | List user orders |
| DELETE | `/api/orders/:id` | Cancel order |
| GET  | `/api/market/orderbook/:symbol` | L2 order book |
| GET  | `/api/market/stats` | All market stats |
| GET  | `/api/market/candles/:symbol` | OHLCV candles |
| GET  | `/api/portfolio` | User portfolio |
| GET  | `/api/admin/metrics` | Engine metrics |
| POST | `/api/admin/benchmark` | Stress test |

### WebSocket Channels
```
ws://localhost:8080/ws

Subscribe: { "action": "subscribe", "channel": "orderbook/AAPL" }

Channels:
  orderbook/{symbol}   — L2 book updates
  trades/{symbol}      — Trade feed
  market/{symbol}      — Stats (OHLCV, VWAP)
  portfolio/{userId}   — Portfolio updates
  admin/metrics        — Engine performance
```

---

## Portfolio Companies This Targets

Built to demonstrate skills for:
- **Jane Street** — OCaml/C++ systems, functional programming
- **Optiver** — HFT, low-latency systems  
- **Tower Research Capital** — C++ trading systems
- **IMC Trading** — Market making, system design
- **Hudson River Trading** — Algorithm engineering
- **Graviton Research** — Quantitative systems
- **WorldQuant** — Algorithmic research
- **Quadeye** — HFT infrastructure

---

*Built with C++20, Next.js 15, MongoDB Atlas, Crow, Zustand, and TanStack Query.*
