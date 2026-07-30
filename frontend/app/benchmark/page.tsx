"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { adminApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Play, Clock, TrendingUp, BarChart3 } from "lucide-react";

const ORDER_COUNTS = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000];

interface BenchmarkResult {
  ordersSubmitted: number;
  tradesExecuted: number;
  elapsedMs: number;
  ordersPerSec: number;
  tradesPerSec: number;
  avgLatencyUs: number;
  peakLatencyUs: number;
}

export default function BenchmarkPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [selectedCount, setSelectedCount] = useState(100_000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  const runBenchmark = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await adminApi.benchmark(selectedCount);
      setResult(res.data);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          "Benchmark failed"
      );
    } finally {
      setRunning(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <Header />
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold gradient-text mb-2 flex items-center justify-center gap-2">
              <Zap size={24} />
              Matching Engine Benchmark
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Stress-test the C++20 matching engine with millions of synthetic orders
            </p>
          </div>

          {/* Count selector */}
          <div className="card p-6">
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Number of Orders
            </div>
            <div className="flex gap-3 flex-wrap">
              {ORDER_COUNTS.map((count) => (
                <button
                  key={count}
                  onClick={() => setSelectedCount(count)}
                  className={`flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold text-sm border transition-all ${
                    selectedCount === count
                      ? "bg-[var(--accent-blue)] text-black border-[var(--accent-blue)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {count >= 1_000_000
                    ? `${count / 1_000_000}M`
                    : `${count / 1_000}K`}
                </button>
              ))}
            </div>

            <div className="mt-4 p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)]">
              <strong className="text-[var(--text-secondary)]">Note:</strong> The
              benchmark submits{" "}
              <span className="mono text-[var(--accent-blue)]">
                {selectedCount.toLocaleString()}
              </span>{" "}
              random LIMIT orders to the AAPL book and measures execution time,
              throughput, and latency. Large counts may take 10–60 seconds.
            </div>

            <motion.button
              onClick={runBenchmark}
              disabled={running}
              whileHover={{ scale: running ? 1 : 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full mt-4 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-black disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {running ? (
                <>
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Running benchmark... ({selectedCount.toLocaleString()} orders)
                </>
              ) : (
                <>
                  <Play size={18} />
                  Run Benchmark — {selectedCount.toLocaleString()} Orders
                </>
              )}
            </motion.button>
          </div>

          {/* Error */}
          {error && (
            <div className="card p-4 border-[var(--accent-red)] text-[var(--accent-red)] text-sm">
              ❌ {error}
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <BarChart3 size={18} className="text-[var(--accent-green)]" />
                  Benchmark Results
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Orders/Second",
                      value: result.ordersPerSec.toLocaleString(),
                      icon: Zap,
                      color: "#00d4ff",
                      sub: "throughput",
                    },
                    {
                      label: "Trades/Second",
                      value: result.tradesPerSec.toLocaleString(),
                      icon: TrendingUp,
                      color: "#00ff88",
                      sub: "match rate",
                    },
                    {
                      label: "Avg Latency",
                      value: `${result.avgLatencyUs}μs`,
                      icon: Clock,
                      color: "#ffd700",
                      sub: "per order",
                    },
                    {
                      label: "Peak Latency",
                      value: `${result.peakLatencyUs}μs`,
                      icon: Clock,
                      color: "#ff9500",
                      sub: "worst case",
                    },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.label} className="card p-4 text-center">
                        <Icon
                          size={20}
                          style={{ color: card.color }}
                          className="mx-auto mb-2"
                        />
                        <div
                          className="mono font-bold text-2xl mb-1"
                          style={{ color: card.color }}
                        >
                          {card.value}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                          {card.label}
                        </div>
                        <div className="text-[9px] text-[var(--text-muted)]">
                          {card.sub}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="card p-4 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">
                      Orders Submitted
                    </div>
                    <div className="mono font-bold text-[var(--text-primary)]">
                      {result.ordersSubmitted.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">
                      Trades Executed
                    </div>
                    <div className="mono font-bold text-[var(--accent-green)]">
                      {result.tradesExecuted.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">
                      Elapsed Time
                    </div>
                    <div className="mono font-bold text-[var(--accent-blue)]">
                      {result.elapsedMs.toFixed(1)}ms
                    </div>
                  </div>
                </div>

                {/* Performance grade */}
                <div className="card p-4 text-center">
                  <div className="text-xs text-[var(--text-muted)] mb-2">
                    Performance Grade
                  </div>
                  <div
                    className={`text-4xl font-bold mono ${
                      result.ordersPerSec >= 1_000_000
                        ? "text-[var(--accent-green)]"
                        : result.ordersPerSec >= 500_000
                        ? "text-[var(--accent-blue)]"
                        : result.ordersPerSec >= 100_000
                        ? "text-[var(--accent-yellow)]"
                        : "text-[var(--accent-orange)]"
                    }`}
                  >
                    {result.ordersPerSec >= 1_000_000
                      ? "A+"
                      : result.ordersPerSec >= 500_000
                      ? "A"
                      : result.ordersPerSec >= 100_000
                      ? "B"
                      : "C"}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    {result.ordersPerSec >= 500_000
                      ? "Production-grade HFT performance"
                      : "Good performance — optimize for release build"}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
