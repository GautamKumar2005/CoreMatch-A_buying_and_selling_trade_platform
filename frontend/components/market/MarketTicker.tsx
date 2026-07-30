"use client";

import { useEffect, useRef, useState } from "react";
import { useTradingStore } from "@/store/tradingStore";
import { marketApi } from "@/lib/api";
import { TrendingUp, TrendingDown } from "lucide-react";

export function MarketTicker() {
  const { stats, setAllStats } = useTradingStore();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await marketApi.stats();
        setAllStats(res.data.symbols || []);
      } catch {}
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [setAllStats]);

  const symbols = Object.values(stats);

  if (symbols.length === 0) {
    return (
      <div className="ticker-container h-9 flex items-center px-4">
        <span className="text-xs text-[var(--text-muted)] animate-pulse">
          Loading market data...
        </span>
      </div>
    );
  }

  const items = [...symbols, ...symbols]; // duplicate for seamless loop

  return (
    <div className="ticker-container h-9 flex items-center overflow-hidden">
      <div className="ticker-inner flex items-center gap-8 px-4">
        {items.map((s, i) => {
          const up = s.changePercent >= 0;
          return (
            <div
              key={`${s.symbol}-${i}`}
              className="flex items-center gap-2 text-xs"
            >
              <span className="font-bold text-[var(--text-primary)] mono">
                {s.symbol}
              </span>
              <span className={`mono font-semibold ${up ? "price-up" : "price-down"}`}>
                ${s.lastPrice.toFixed(2)}
              </span>
              <span
                className={`flex items-center gap-0.5 ${up ? "price-up" : "price-down"}`}
              >
                {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {Math.abs(s.changePercent).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
