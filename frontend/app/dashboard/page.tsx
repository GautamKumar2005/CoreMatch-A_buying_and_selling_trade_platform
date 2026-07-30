"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { OrderBook } from "@/components/trading/OrderBook";
import { OrderForm } from "@/components/trading/OrderForm";
import { TradesFeed } from "@/components/trading/TradesFeed";
import { useTradingStore } from "@/store/tradingStore";
import { useQuery } from "@tanstack/react-query";
import { portfolioApi, ordersApi, marketApi } from "@/lib/api";
import { useChannel } from "@/lib/websocket";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

function PortfolioSummary() {
  const { portfolio, setPortfolio } = useTradingStore();
  const { user } = useAuthStore();

  const { data } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => portfolioApi.get().then((r) => r.data),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (data) setPortfolio(data);
  }, [data, setPortfolio]);

  useChannel<{ type: string; data: typeof portfolio }>(
    `portfolio/${user?.id}`,
    (msg) => { if (msg?.data) setPortfolio(msg.data!); },
    [user?.id]
  );

  const p = portfolio;
  const totalPnL = (p?.totalRealizedPnL ?? 0) + (p?.totalUnrealizedPnL ?? 0);
  const pnlUp = totalPnL >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {[
        {
          label: "Portfolio Value",
          value: `$${(p?.portfolioValue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          icon: DollarSign,
          color: "var(--accent-blue)",
        },
        {
          label: "Available Cash",
          value: `$${(p?.cash ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          icon: DollarSign,
          color: "var(--accent-green)",
        },
        {
          label: "Unrealized P&L",
          value: `${(p?.totalUnrealizedPnL ?? 0) >= 0 ? "+" : ""}$${(p?.totalUnrealizedPnL ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          icon: (p?.totalUnrealizedPnL ?? 0) >= 0 ? TrendingUp : TrendingDown,
          color: (p?.totalUnrealizedPnL ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)",
        },
        {
          label: "Realized P&L",
          value: `${(p?.totalRealizedPnL ?? 0) >= 0 ? "+" : ""}$${(p?.totalRealizedPnL ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          icon: Activity,
          color: (p?.totalRealizedPnL ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)",
        },
      ].map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} style={{ color: card.color }} />
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                {card.label}
              </span>
            </div>
            <div className="mono font-bold text-lg" style={{ color: card.color }}>
              {card.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpenOrdersPanel() {
  const { data: ordersData, refetch } = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersApi.list().then((r) => r.data.orders || []),
    refetchInterval: 5000,
  });

  const openOrders = (ordersData || []).filter(
    (o: { status: string }) => o.status === "PENDING" || o.status === "PARTIAL"
  );

  const handleCancel = async (id: string) => {
    try {
      await ordersApi.cancel(id);
      toast.success("Order cancelled");
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Cancel failed");
    }
  };

  return (
    <div className="card">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Open Orders
        </span>
        <span className="badge badge-blue">{openOrders.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-dark">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Type</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Filled</th>
              <th>Status</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {openOrders.slice(0, 10).map(
              (o: {
                id: string;
                symbol: string;
                side: string;
                type: string;
                price: number;
                quantity: number;
                filledQty: number;
                status: string;
              }) => (
                <tr key={o.id}>
                  <td className="font-bold text-[var(--text-primary)]">{o.symbol}</td>
                  <td>
                    <span
                      className={`badge ${o.side === "BUY" ? "badge-green" : "badge-red"}`}
                    >
                      {o.side}
                    </span>
                  </td>
                  <td className="text-[var(--text-muted)]">{o.type}</td>
                  <td>${o.price.toFixed(2)}</td>
                  <td>{o.quantity.toLocaleString()}</td>
                  <td>{o.filledQty.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${o.status === "PARTIAL" ? "badge-yellow" : "badge-blue"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => handleCancel(o.id)}
                      className="px-2 py-0.5 rounded text-[10px] bg-red-950/40 text-red-400 border border-red-900/60 hover:bg-red-900/60 hover:text-white cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              )
            )}
            {openOrders.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-[var(--text-muted)] py-6 text-xs">
                  No open orders
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { activeSymbol, setActiveSymbol, stats } = useTradingStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  const symbolStats = stats[activeSymbol];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <Header />

        <div className="flex-1 p-4 space-y-4">
          {/* Symbol selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[var(--text-muted)]">Active Market:</span>
            <div className="flex gap-2 flex-wrap">
              {["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA", "BTC", "ETH"].map((sym) => {
                const s = stats[sym];
                const up = (s?.changePercent ?? 0) >= 0;
                return (
                  <button
                    key={sym}
                    onClick={() => setActiveSymbol(sym)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      activeSymbol === sym
                        ? "bg-[var(--bg-elevated)] border-[var(--accent-blue)] text-[var(--accent-blue)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]"
                    }`}
                  >
                    {sym}
                    {s && (
                      <span className={up ? "price-up" : "price-down"}>
                        ${s.lastPrice.toFixed(0)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <Link
              href={`/chart/${activeSymbol}`}
              className="ml-auto text-xs text-[var(--accent-blue)] hover:underline"
            >
              Full Chart →
            </Link>
          </div>

          {/* Portfolio summary */}
          <PortfolioSummary />

          {/* Main trading layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-auto lg:h-[520px]">
            {/* Order book — 3 cols */}
            <div className="col-span-1 lg:col-span-3 card overflow-hidden h-[450px] lg:h-auto">
              <OrderBook symbol={activeSymbol} levels={18} />
            </div>

            {/* Chart placeholder + trade feed — 6 cols */}
            <div className="col-span-1 lg:col-span-6 card overflow-hidden flex flex-col h-[520px] lg:h-auto">
              <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[var(--text-primary)]">
                    {activeSymbol}
                  </span>
                  {symbolStats && (
                    <>
                      <span className="mono font-bold text-lg gradient-text">
                        ${symbolStats.lastPrice.toFixed(2)}
                      </span>
                      <span
                        className={`text-xs ${symbolStats.changePercent >= 0 ? "price-up" : "price-down"}`}
                      >
                        {symbolStats.changePercent >= 0 ? "▲" : "▼"}{" "}
                        {Math.abs(symbolStats.changePercent).toFixed(2)}%
                      </span>
                    </>
                  )}
                </div>
                <Link
                  href={`/chart/${activeSymbol}`}
                  className="text-xs text-[var(--accent-blue)] hover:underline"
                >
                  Full chart
                </Link>
              </div>

              {/* Mini stats bar */}
              {symbolStats && (
                <div className="flex gap-4 px-3 py-2 border-b border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                  <span>O: <span className="mono text-[var(--text-secondary)]">${symbolStats.openPrice.toFixed(2)}</span></span>
                  <span>H: <span className="mono price-up">${symbolStats.highPrice.toFixed(2)}</span></span>
                  <span>L: <span className="mono price-down">${symbolStats.lowPrice.toFixed(2)}</span></span>
                  <span>V: <span className="mono text-[var(--text-secondary)]">{symbolStats.volume.toLocaleString()}</span></span>
                  <span>VWAP: <span className="mono text-[var(--accent-blue)]">${symbolStats.vwap.toFixed(2)}</span></span>
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                <TradesFeed symbol={activeSymbol} maxRows={30} />
              </div>
            </div>

            {/* Order form — 3 cols */}
            <div className="col-span-1 lg:col-span-3 card overflow-hidden h-auto lg:h-auto">
              <OrderForm symbol={activeSymbol} />
            </div>
          </div>

          {/* Open orders */}
          <OpenOrdersPanel />
        </div>
      </div>
    </div>
  );
}
