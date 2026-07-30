"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { MarketTicker } from "@/components/market/MarketTicker";
import { OrderBook } from "@/components/trading/OrderBook";
import { TradesFeed } from "@/components/trading/TradesFeed";
import { OrderForm } from "@/components/trading/OrderForm";
import { CandlestickChart } from "@/components/trading/CandlestickChart";
import { useTradingStore } from "@/store/tradingStore";
import { useChannel } from "@/lib/websocket";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "1d"];

export function ChartClient({ symbol }: { symbol: string }) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { stats, setStats } = useTradingStore();
  const [timeframe, setTimeframe] = useState("1m");

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  useChannel<{ type: string; data: Record<string, unknown> }>(
    `market/${symbol}`,
    (msg) => { if (msg?.data) setStats(symbol, msg.data as never); },
    [symbol]
  );

  const s = stats[symbol];
  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <MarketTicker />

        <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Chart — 9 cols */}
          <div className="col-span-1 lg:col-span-9 flex flex-col gap-3">
            {/* Symbol header */}
            <div className="card p-3 flex flex-wrap items-center gap-4">
              <span className="text-xl font-bold text-[var(--text-primary)]">{symbol}</span>
              {s && (
                <>
                  <span className="mono font-bold text-2xl gradient-text">
                    ${s.lastPrice.toFixed(2)}
                  </span>
                  <span className={`text-sm font-semibold ${s.changePercent >= 0 ? "price-up" : "price-down"}`}>
                    {s.changePercent >= 0 ? "+" : ""}
                    {s.changePercent.toFixed(2)}%
                  </span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--text-muted)] sm:ml-4">
                    <span>O: <span className="mono text-[var(--text-secondary)]">${s.openPrice.toFixed(2)}</span></span>
                    <span>H: <span className="mono price-up">${s.highPrice.toFixed(2)}</span></span>
                    <span>L: <span className="mono price-down">${s.lowPrice.toFixed(2)}</span></span>
                    <span>V: <span className="mono text-[var(--text-secondary)]">{s.volume.toLocaleString()}</span></span>
                    <span>VWAP: <span className="mono text-[var(--accent-blue)]">${s.vwap.toFixed(2)}</span></span>
                    <span>Trades: <span className="mono">{s.tradeCount.toLocaleString()}</span></span>
                  </div>
                </>
              )}

              {/* Timeframe selector */}
              <div className="w-full sm:w-auto sm:ml-auto flex gap-1 mt-2 sm:mt-0">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                      timeframe === tf
                        ? "bg-[var(--accent-blue)] text-black"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-bright)]"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Candlestick Chart */}
            <div className="card overflow-hidden">
              <CandlestickChart symbol={symbol} timeframe={timeframe} height={420} />
            </div>

            {/* Order book */}
            <div className="card h-[280px] overflow-hidden">
              <OrderBook symbol={symbol} levels={10} />
            </div>
          </div>

          {/* Right panel — 3 cols */}
          <div className="col-span-1 lg:col-span-3 flex flex-col gap-3">
            <div className="card flex-1 overflow-hidden">
              <OrderForm symbol={symbol} />
            </div>
            <div className="card h-[300px] overflow-hidden">
              <TradesFeed symbol={symbol} maxRows={20} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
