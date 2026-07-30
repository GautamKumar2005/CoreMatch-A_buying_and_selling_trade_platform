"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Watchlist } from "@/components/market/Watchlist";
import { useTradingStore } from "@/store/tradingStore";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import Link from "next/link";

export default function MarketPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { stats } = useTradingStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  const allStats = Object.values(stats);
  const movers = [...allStats]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 6);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <Header />
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
            {/* Watchlist */}
            <div className="col-span-1 lg:col-span-3 card overflow-hidden h-[250px] lg:h-[calc(100vh-100px)]">
              <Watchlist />
            </div>

            {/* Main content */}
            <div className="col-span-1 lg:col-span-9 space-y-4">
              <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <BarChart3 size={20} className="text-[var(--accent-blue)]" />
                Market Watch
              </h1>

              {/* Top movers */}
              <div>
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Top Movers
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {movers.map((s) => {
                    const up = s.changePercent >= 0;
                    return (
                      <Link key={s.symbol} href={`/chart/${s.symbol}`}>
                        <div className="card p-4 hover:border-[var(--border-bright)] transition-all cursor-pointer">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-[var(--text-primary)]">
                              {s.symbol}
                            </span>
                            <span className={`badge ${up ? "badge-green" : "badge-red"}`}>
                              {up ? "▲" : "▼"} {Math.abs(s.changePercent).toFixed(2)}%
                            </span>
                          </div>
                          <div className="mono font-bold text-xl" style={{ color: up ? "var(--accent-green)" : "var(--accent-red)" }}>
                            ${s.lastPrice.toFixed(2)}
                          </div>
                          <div className="flex justify-between mt-2 text-[10px] text-[var(--text-muted)]">
                            <span>H: ${s.highPrice.toFixed(2)}</span>
                            <span>L: ${s.lowPrice.toFixed(2)}</span>
                            <span>V: {s.volume.toLocaleString()}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Full market table */}
              <div className="card">
                <div className="px-3 py-2 border-b border-[var(--border)]">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                    All Markets
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-dark">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Last</th>
                        <th>Open</th>
                        <th>High</th>
                        <th>Low</th>
                        <th>Change</th>
                        <th>Volume</th>
                        <th>VWAP</th>
                        <th>Trades</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allStats.map((s) => {
                        const up = s.changePercent >= 0;
                        return (
                          <tr key={s.symbol}>
                            <td className="font-bold text-[var(--text-primary)]">
                              {s.symbol}
                            </td>
                            <td className={`mono font-bold ${up ? "price-up" : "price-down"}`}>
                              ${s.lastPrice.toFixed(2)}
                            </td>
                            <td className="mono">${s.openPrice.toFixed(2)}</td>
                            <td className="mono price-up">${s.highPrice.toFixed(2)}</td>
                            <td className="mono price-down">${s.lowPrice.toFixed(2)}</td>
                            <td>
                              <span className={`flex items-center gap-1 text-xs ${up ? "price-up" : "price-down"}`}>
                                {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {up ? "+" : ""}{s.changePercent.toFixed(2)}%
                              </span>
                            </td>
                            <td className="mono text-[var(--text-secondary)]">
                              {s.volume.toLocaleString()}
                            </td>
                            <td className="mono text-[var(--accent-blue)]">
                              ${s.vwap.toFixed(2)}
                            </td>
                            <td className="mono">{s.tradeCount.toLocaleString()}</td>
                            <td>
                              <Link
                                href={`/chart/${s.symbol}`}
                                className="text-[10px] text-[var(--accent-blue)] hover:underline"
                              >
                                Trade →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
