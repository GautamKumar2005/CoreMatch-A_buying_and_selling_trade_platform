"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useQuery } from "@tanstack/react-query";
import { portfolioApi } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import { TrendingUp, TrendingDown, DollarSign, Briefcase } from "lucide-react";

function TradeHistoryPanel() {
  const { user } = useAuthStore();
  const { data: trades } = useQuery({
    queryKey: ["portfolioHistory"],
    queryFn: () => portfolioApi.history().then((r) => r.data.trades || []),
    refetchInterval: 5000,
    enabled: !!user,
  });

  return (
    <div className="card">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Trade History
        </span>
        <span className="badge badge-blue">{(trades || []).length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-dark">
          <thead>
            <tr>
              <th>Time</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {(trades || []).map((t: any) => {
              const isBuy = t.buyerId === user?.id;
              return (
                <tr key={t.id}>
                  <td className="mono text-[10px] text-[var(--text-muted)]">
                    {new Date(t.createdAt * 1000).toLocaleTimeString()}
                  </td>
                  <td className="font-bold text-[var(--text-primary)]">{t.symbol}</td>
                  <td>
                    <span className={`badge ${isBuy ? "badge-green" : "badge-red"}`}>
                      {isBuy ? "BUY" : "SELL"}
                    </span>
                  </td>
                  <td className="mono">${t.price.toFixed(2)}</td>
                  <td className="mono">{t.quantity.toLocaleString()}</td>
                  <td className="mono text-[var(--text-secondary)]">
                    ${t.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
            {(trades || []).length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-[var(--text-muted)] py-8 text-sm">
                  No trades executed yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PortfolioAnalytics({ positions }: { positions: any[] }) {
  if (!positions || positions.length === 0) {
    return (
      <div className="card p-4 text-center text-[var(--text-muted)] text-xs">
        Open some positions to view detailed P&L performance analytics.
      </div>
    );
  }

  let profitableCount = 0;
  let topAsset = null;
  let topPnlPct = -Infinity;
  let worstAsset = null;
  let worstPnlPct = Infinity;
  let winningGains = 0;
  let losingLosses = 0;

  for (const pos of positions) {
    const pnl = pos.unrealizedPnL;
    const pnlPct = pos.avgBuyPrice > 0 ? ((pos.lastPrice - pos.avgBuyPrice) / pos.avgBuyPrice) * 100 : 0;

    if (pnl > 0) {
      profitableCount++;
      winningGains += pnl;
    } else if (pnl < 0) {
      losingLosses += Math.abs(pnl);
    }

    if (pnlPct > topPnlPct) {
      topPnlPct = pnlPct;
      topAsset = pos;
    }
    if (pnlPct < worstPnlPct) {
      worstPnlPct = pnlPct;
      worstAsset = pos;
    }
  }

  const winRate = (profitableCount / positions.length) * 100;
  const totalGainsLosses = winningGains + losingLosses;
  const winRatio = totalGainsLosses > 0 ? (winningGains / totalGainsLosses) * 100 : 50;

  return (
    <div className="card p-4 space-y-4">
      <div className="border-b border-[var(--border)] pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          P&L Performance Analytics
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">Active Holdings: {positions.length}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Win Rate */}
        <div className="space-y-1">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Holding Win Rate</div>
          <div className="flex items-baseline gap-2">
            <span className="mono text-2xl font-bold text-[var(--text-primary)]">
              {winRate.toFixed(1)}%
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              ({profitableCount} of {positions.length} green)
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-[var(--bg-elevated)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[var(--accent-green)] h-full transition-all duration-500"
              style={{ width: `${winRate}%` }}
            />
          </div>
        </div>

        {/* Top Performer */}
        <div className="space-y-1">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Top Performer</div>
          {topAsset ? (
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--text-primary)]">{(topAsset as any).symbol}</span>
                <span className="mono text-[var(--accent-green)] font-semibold">
                  +{topPnlPct.toFixed(2)}%
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Profit: +${(topAsset as any).unrealizedPnL.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">—</span>
          )}
        </div>

        {/* Worst Performer */}
        <div className="space-y-1">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Worst Performer</div>
          {worstAsset ? (
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--text-primary)]">{(worstAsset as any).symbol}</span>
                <span className={`mono font-semibold ${worstPnlPct >= 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
                  {worstPnlPct >= 0 ? "+" : ""}{worstPnlPct.toFixed(2)}%
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Loss: {(worstAsset as any).unrealizedPnL >= 0 ? "+" : ""}${(worstAsset as any).unrealizedPnL.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">—</span>
          )}
        </div>
      </div>

      {/* Visual Profit Ratio Bar */}
      {totalGainsLosses > 0 && (
        <div className="space-y-1 pt-1 border-t border-[var(--border)]">
          <div className="flex justify-between text-[9px] text-[var(--text-muted)] uppercase">
            <span>Winning Value (${winningGains.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
            <span>Losing Value (${losingLosses.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden flex">
            <div className="bg-[var(--accent-green)] h-full" style={{ width: `${winRatio}%` }} />
            <div className="bg-[var(--accent-red)] h-full flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { portfolio, setPortfolio } = useTradingStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  const { data } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => portfolioApi.get().then((r) => r.data),
    refetchInterval: 10000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (data) setPortfolio(data);
  }, [data, setPortfolio]);

  if (!isAuthenticated) return null;
  const p = portfolio;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <Header />
        <div className="flex-1 p-4 space-y-4">
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Briefcase size={20} className="text-[var(--accent-blue)]" />
            Portfolio
          </h1>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Portfolio Value",   value: `$${(p?.portfolioValue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "var(--accent-blue)" },
              { label: "Cash Balance",      value: `$${(p?.cash ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "var(--accent-green)" },
              { label: "Unrealized P&L",    value: `${(p?.totalUnrealizedPnL ?? 0) >= 0 ? "+" : ""}$${(p?.totalUnrealizedPnL ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: (p?.totalUnrealizedPnL ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" },
              { label: "Realized P&L",      value: `${(p?.totalRealizedPnL ?? 0) >= 0 ? "+" : ""}$${(p?.totalRealizedPnL ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: (p?.totalRealizedPnL ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" },
            ].map((card) => (
              <div key={card.label} className="card p-4">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  {card.label}
                </div>
                <div className="mono font-bold text-xl" style={{ color: card.color }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          <PortfolioAnalytics positions={p?.positions || []} />

          {/* Positions table */}
          <div className="card">
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Open Positions
              </span>
              <span className="badge badge-blue">{p?.positions?.length ?? 0}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Qty</th>
                    <th>Avg Price</th>
                    <th>Last Price</th>
                    <th>Market Value</th>
                    <th>Unrealized P&L</th>
                    <th>Realized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {(p?.positions ?? []).map((pos) => {
                    const pnlUp = pos.unrealizedPnL >= 0;
                    return (
                      <tr key={pos.symbol}>
                        <td className="font-bold text-[var(--text-primary)]">
                          {pos.symbol}
                        </td>
                        <td className="mono">{pos.quantity.toLocaleString()}</td>
                        <td className="mono">${pos.avgBuyPrice.toFixed(2)}</td>
                        <td className="mono">${pos.lastPrice.toFixed(2)}</td>
                        <td className="mono">${pos.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                        <td>
                          <span className={`mono flex items-center gap-1 ${pnlUp ? "price-up" : "price-down"}`}>
                            {pnlUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {pnlUp ? "+" : ""}${pos.unrealizedPnL.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td>
                          <span className={`mono ${pos.realizedPnL >= 0 ? "price-up" : "price-down"}`}>
                            {pos.realizedPnL >= 0 ? "+" : ""}${pos.realizedPnL.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {(p?.positions?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-[var(--text-muted)] py-8 text-sm">
                        No open positions — place some orders to get started
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <TradeHistoryPanel />
        </div>
      </div>
    </div>
  );
}
