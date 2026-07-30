"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { marketApi } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import { useChannel } from "@/lib/websocket";
import { TrendingUp, TrendingDown, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Watchlist() {
  const { stats, setStats, setAllStats, activeSymbol, setActiveSymbol } =
    useTradingStore();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["allStats"],
    queryFn: () => marketApi.stats().then((r) => r.data.symbols),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (data) setAllStats(data);
  }, [data, setAllStats]);

  // Live market updates via WebSocket
  useChannel<{ type: string; data: Record<string, unknown> }>(
    "market/ALL",
    (msg) => {
      if (msg?.data && typeof msg.data === "object") {
        const s = msg.data as { symbol: string };
        if (s.symbol) setStats(s.symbol, s as never);
      }
    }
  );

  const symbols = Object.values(stats).filter((s) =>
    s.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol..."
            className="input-dark !pl-8 text-xs py-2"
          />
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]">
        <span>Symbol</span>
        <span className="text-right">Price</span>
        <span className="text-right">Change</span>
      </div>

      {/* Symbol list */}
      <div className="flex-1 overflow-y-auto">
        {symbols.map((s) => {
          const up = s.changePercent >= 0;
          const active = activeSymbol === s.symbol;
          return (
            <button
              key={s.symbol}
              onClick={() => {
                setActiveSymbol(s.symbol);
                router.push(`/chart/${s.symbol}`);
              }}
              className={`w-full grid grid-cols-3 px-3 py-2 text-xs hover:bg-[var(--bg-elevated)] transition-colors text-left ${
                active ? "bg-[var(--bg-elevated)] border-l-2 border-[var(--accent-blue)]" : ""
              }`}
            >
              <span className="font-bold text-[var(--text-primary)]">
                {s.symbol}
              </span>
              <span className={`text-right mono font-semibold ${up ? "price-up" : "price-down"}`}>
                ${s.lastPrice.toFixed(2)}
              </span>
              <span
                className={`text-right flex items-center justify-end gap-0.5 ${
                  up ? "price-up" : "price-down"
                }`}
              >
                {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {Math.abs(s.changePercent).toFixed(2)}%
              </span>
            </button>
          );
        })}

        {symbols.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-[var(--text-muted)]">
            No symbols found
          </div>
        )}
      </div>
    </div>
  );
}
