"use client";

import { useState, useEffect } from "react";
import { ordersApi } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";

interface Props {
  symbol: string;
}

export function OrderForm({ symbol }: Props) {
  const { stats, selectedPrice, setSelectedPrice, portfolio } = useTradingStore();
  const symbolStats = stats[symbol];

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [price, setPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedPrice !== null) {
      setPrice(selectedPrice.toFixed(2));
      setSelectedPrice(null);
    }
  }, [selectedPrice, setSelectedPrice]);

  const handlePercentageShortcut = (pct: number) => {
    const prc = type === "LIMIT" ? parseFloat(price) : (symbolStats?.lastPrice ?? 0);
    if (side === "BUY") {
      const cash = portfolio?.cash ?? 0;
      if (prc > 0) {
        const qty = Math.floor((cash * pct) / prc);
        setQuantity(qty > 0 ? qty.toString() : "");
      } else {
        toast.error("Set a price first to calculate percentage");
      }
    } else {
      const pos = portfolio?.positions?.find((x) => x.symbol === symbol);
      const holdings = pos ? pos.quantity : 0;
      const qty = Math.floor(holdings * pct);
      setQuantity(qty > 0 ? qty.toString() : "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(quantity);
    const prc = parseFloat(price);

    if (!qty || qty <= 0) return toast.error("Enter a valid quantity");
    if (type === "LIMIT" && (!prc || prc <= 0))
      return toast.error("Enter a valid price");

    setLoading(true);
    try {
      const res = await ordersApi.place({
        symbol,
        side,
        type,
        price: type === "LIMIT" ? prc : undefined,
        quantity: qty,
      });
      const data = res.data;
      const tradeCount = data.tradeCount || 0;

      if (tradeCount > 0) {
        toast.success(
          `✅ ${side} filled! ${tradeCount} trade${tradeCount > 1 ? "s" : ""} executed.`,
          { duration: 4000 }
        );
      } else {
        toast(
          `📋 ${type} ${side} order placed for ${qty} ${symbol}`,
          { icon: "📋", duration: 3000 }
        );
      }

      setQuantity("");
      if (type === "LIMIT") setPrice("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Order rejected";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const lastPrice = symbolStats?.lastPrice ?? 0;
  const orderValue =
    type === "LIMIT"
      ? parseFloat(price || "0") * parseInt(quantity || "0")
      : lastPrice * parseInt(quantity || "0");

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Place Order
          </span>
          <span className="mono text-xs text-[var(--text-secondary)]">{symbol}</span>
        </div>

        {/* Buy / Sell toggle */}
        <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-all ${
                side === s
                  ? s === "BUY"
                    ? "bg-[var(--accent-green)] text-black"
                    : "bg-[var(--accent-red)] text-white"
                  : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {s === "BUY" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {s}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-3 gap-3">
        {/* Order type */}
        <div className="flex rounded-lg overflow-hidden border border-[var(--border)] text-xs">
          {(["LIMIT", "MARKET"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-1.5 font-semibold transition-all ${
                type === t
                  ? "bg-[var(--bg-elevated)] text-[var(--accent-blue)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Price field (LIMIT only) */}
        {type === "LIMIT" && (
          <div>
            <label className="block text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Price (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={lastPrice ? lastPrice.toFixed(2) : "0.00"}
                className="input-dark !pl-7 text-sm"
                required
              />
            </div>
            {/* Quick price buttons */}
            {lastPrice > 0 && (
              <div className="flex gap-1 mt-1">
                {[0.99, 1, 1.01].map((mult) => (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => setPrice((lastPrice * mult).toFixed(2))}
                    className="flex-1 text-[9px] py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-bright)] transition-colors"
                  >
                    {mult < 1 ? "−1%" : mult > 1 ? "+1%" : "Mid"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quantity field */}
        <div>
          <label className="block text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Quantity (Shares)
          </label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="100"
            className="input-dark text-sm"
            required
          />
          {/* Quick qty and percentage buttons */}
          <div className="flex flex-col gap-1 mt-1.5">
            <div className="flex gap-1">
              {[10, 50, 100, 500].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantity(q.toString())}
                  className="flex-1 text-[9px] py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-bright)] transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentageShortcut(pct)}
                  className="flex-1 text-[9px] py-0.5 rounded border border-[var(--border)] text-[var(--accent-blue)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)] transition-colors cursor-pointer"
                >
                  {pct * 100}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Order summary */}
        {orderValue > 0 && (
          <div className="bg-[var(--bg-elevated)] rounded-lg p-2 text-xs border border-[var(--border)]">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Est. Value</span>
              <span className="mono font-bold text-[var(--text-primary)]">
                ${orderValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Submit */}
        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={`mt-auto flex items-center justify-center gap-2 w-full py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            side === "BUY"
              ? "bg-[var(--accent-green)] text-black hover:brightness-110"
              : "bg-[var(--accent-red)] text-white hover:brightness-110"
          }`}
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Zap size={14} />
          )}
          {loading ? "Submitting..." : `${side} ${symbol}`}
        </motion.button>
      </form>
    </div>
  );
}
