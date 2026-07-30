"use client";

import { useEffect, useRef, useState } from "react";
import { useTradingStore, type Trade } from "@/store/tradingStore";
import { useChannel } from "@/lib/websocket";
import { motion, AnimatePresence } from "framer-motion";
import { marketApi } from "@/lib/api";

interface Props {
  symbol: string;
  maxRows?: number;
}

export function TradesFeed({ symbol, maxRows = 25 }: Props) {
  const { recentTrades, addTrade } = useTradingStore();
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const trades = recentTrades[symbol] || [];

  // Load initial trades from REST
  useEffect(() => {
    marketApi
      .trades(symbol, 50)
      .then((res) => {
        const apiTrades: Trade[] = res.data.trades || [];
        apiTrades.forEach((t) => addTrade(symbol, t));
      })
      .catch(() => {});
  }, [symbol, addTrade]);

  // Subscribe to live WebSocket trade updates
  useChannel<{ type: string; data: Trade }>(
    `trades/${symbol}`,
    (msg) => {
      if (msg?.data) {
        addTrade(symbol, msg.data);
      }
    },
    [symbol]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Recent Trades
        </span>
        <span className="text-xs text-[var(--text-muted)] mono">{symbol}</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>

      {/* Trades list */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {trades.slice(0, maxRows).map((trade, i) => {
            const prev = trades[i + 1];
            const isUp = !prev || trade.price >= prev.price;
            const time = new Date(trade.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });

            return (
              <motion.div
                key={trade.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-3 px-3 py-1 text-xs hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <span
                  className={`mono font-semibold ${
                    isUp ? "price-up" : "price-down"
                  }`}
                >
                  {trade.price.toFixed(2)}
                </span>
                <span className="text-right mono text-[var(--text-secondary)]">
                  {trade.quantity.toLocaleString()}
                </span>
                <span className="text-right mono text-[var(--text-muted)] text-[10px]">
                  {time}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {trades.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-[var(--text-muted)]">
            Waiting for trades...
          </div>
        )}
      </div>
    </div>
  );
}
