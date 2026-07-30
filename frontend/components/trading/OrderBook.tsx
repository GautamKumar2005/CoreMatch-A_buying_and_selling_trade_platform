"use client";

import { useEffect, useRef, useState } from "react";
import { useTradingStore, type OrderBook as OrderBookType } from "@/store/tradingStore";
import { useChannel } from "@/lib/websocket";
import { marketApi } from "@/lib/api";

interface Props {
  symbol: string;
  levels?: number;
}

export function OrderBook({ symbol, levels = 15 }: Props) {
  const { orderBooks, setOrderBook, setSelectedPrice } = useTradingStore();
  const book = orderBooks[symbol];

  // Load initial snapshot
  useEffect(() => {
    marketApi
      .orderBook(symbol)
      .then((res) => setOrderBook(symbol, res.data))
      .catch(() => {});
  }, [symbol, setOrderBook]);

  // Subscribe to live updates
  useChannel<{ type: string; data: OrderBookType }>(
    `orderbook/${symbol}`,
    (msg) => {
      if (msg?.data) setOrderBook(symbol, msg.data);
    },
    [symbol]
  );

  const bids = book?.bids?.slice(0, levels) ?? [];
  const asks = book?.asks?.slice(0, levels) ?? [];

  const maxBidQty = Math.max(...bids.map((b) => b.qty), 1);
  const maxAskQty = Math.max(...asks.map((a) => a.qty), 1);

  const spread =
    bids[0] && asks[0] && bids[0].price != null && asks[0].price != null
      ? (asks[0].price - bids[0].price).toFixed(2)
      : "—";

  return (
    <div className="h-full flex flex-col text-xs">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Order Book
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">Spread</span>
          <span className="mono text-[var(--accent-yellow)]">${spread}</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">#Orders</span>
      </div>

      {/* Asks (sell orders) — top, reversed so best ask is closest to mid */}
      <div className="flex-1 overflow-y-auto flex flex-col-reverse">
        {[...asks].reverse().map((level, i) => {
          const pct = (level.qty / maxAskQty) * 100;
          return (
            <div
              key={`ask-${level.price}-${i}`}
              onClick={() => setSelectedPrice(level.price)}
              className="grid grid-cols-3 px-3 py-[3px] relative hover:bg-[rgba(255,68,68,0.1)] cursor-pointer transition-colors"
              style={
                {
                  "--pct": `${pct}%`,
                } as React.CSSProperties
              }
            >
              {/* Depth bar */}
              <div
                className="absolute inset-0 depth-bar-ask opacity-60"
                style={{ "--pct": `${pct}%` } as React.CSSProperties}
              />
              <span className="relative mono font-semibold price-down">
                {level.price != null ? level.price.toFixed(2) : "—"}
              </span>
              <span className="relative text-right mono text-[var(--text-secondary)]">
                {level.qty.toLocaleString()}
              </span>
              <span className="relative text-right mono text-[var(--text-muted)]">
                {level.count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Spread indicator */}
      <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border-y border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {bids[0] && bids[0].price != null && (
            <span className="mono text-[var(--accent-green)] text-xs font-bold">
              {bids[0].price.toFixed(2)}
            </span>
          )}
          <span className="text-[var(--text-muted)] text-[10px]">bid</span>
        </div>
        <span className="mono text-[var(--accent-yellow)] text-[10px] font-bold">
          ${spread}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] text-[10px]">ask</span>
          {asks[0] && asks[0].price != null && (
            <span className="mono text-[var(--accent-red)] text-xs font-bold">
              {asks[0].price.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Bids (buy orders) */}
      <div className="flex-1 overflow-y-auto">
        {bids.map((level, i) => {
          const pct = (level.qty / maxBidQty) * 100;
          return (
            <div
              key={`bid-${level.price}-${i}`}
              onClick={() => setSelectedPrice(level.price)}
              className="grid grid-cols-3 px-3 py-[3px] relative hover:bg-[rgba(0,255,136,0.1)] cursor-pointer transition-colors"
            >
              <div
                className="absolute inset-0 depth-bar-bid opacity-60"
                style={{ "--pct": `${pct}%` } as React.CSSProperties}
              />
              <span className="relative mono font-semibold price-up">
                {level.price != null ? level.price.toFixed(2) : "—"}
              </span>
              <span className="relative text-right mono text-[var(--text-secondary)]">
                {level.qty.toLocaleString()}
              </span>
              <span className="relative text-right mono text-[var(--text-muted)]">
                {level.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
