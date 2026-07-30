"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Zap, ShieldCheck, BarChart3, Activity } from "lucide-react";
import { MarketTicker } from "@/components/market/MarketTicker";
import { useAuthStore } from "@/store/authStore";

const features = [
  {
    icon: Zap,
    title: "C++20 Matching Engine",
    desc: "Price-Time Priority (FIFO) with sub-millisecond latency. 500K+ orders/sec throughput.",
    color: "#00d4ff",
  },
  {
    icon: BarChart3,
    title: "TradingView Charts",
    desc: "Professional candlestick charts with 5 timeframes, VWAP overlay, and volume bars.",
    color: "#00ff88",
  },
  {
    icon: Activity,
    title: "Real-Time WebSocket",
    desc: "Live order book, trade feed, and portfolio updates pushed instantly to all clients.",
    color: "#a855f7",
  },
  {
    icon: ShieldCheck,
    title: "Risk Management",
    desc: "Validate every order: cash, holdings, limits, duplicates — before it enters the engine.",
    color: "#ffd700",
  },
];

const stats = [
  { label: "Order Latency", value: "< 1ms", sub: "P99" },
  { label: "Throughput",    value: "500K+", sub: "Orders/sec" },
  { label: "Symbols",       value: "14",    sub: "Markets" },
  { label: "Architecture",  value: "C++20", sub: "Matching Engine" },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Ticker tape */}
      <MarketTicker />

      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
            <BarChart3 size={16} className="text-black" />
          </div>
          <span className="font-bold text-lg gradient-text">CoreMatch</span>
          <span className="text-xs text-[var(--text-muted)] border border-[var(--border)] px-2 py-0.5 rounded">
            Exchange Simulator
          </span>
        </div>
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="btn-primary flex items-center gap-2 text-sm"
            >
              Open Dashboard <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Login
              </Link>
              <Link
                href="/auth/register"
                className="btn-primary flex items-center gap-2 text-sm"
              >
                Start Trading <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="relative px-8 py-24 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-radial from-[rgba(0,212,255,0.08)] to-transparent" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 border border-[var(--border)] rounded-full px-4 py-1.5 text-xs text-[var(--text-muted)] mb-8">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
            Live Exchange — Orders Matching Now
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="gradient-text">Production-Grade</span>
            <br />
            <span className="text-[var(--text-primary)]">Stock Exchange</span>
          </h1>

          <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            A real stock exchange simulator powered by a{" "}
            <span className="text-[var(--accent-blue)]">C++20 matching engine</span>,
            WebSocket real-time feeds, and a professional Bloomberg-inspired UI.
            Designed for HFT/Quant portfolio demonstrations.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href={isAuthenticated ? "/dashboard" : "/auth/register"}
              className="btn-primary flex items-center gap-2 px-8 py-3 text-base rounded-xl"
            >
              <Zap size={16} />
              {isAuthenticated ? "Open Dashboard" : "Start Trading Free"}
            </Link>
            <Link
              href="/benchmark"
              className="flex items-center gap-2 px-8 py-3 text-base rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-bright)] transition-all"
            >
              <Activity size={16} />
              Run Benchmark
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="px-8 py-12 border-y border-[var(--border)]">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-3xl font-bold gradient-text mono mb-1">
                {s.value}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{s.sub}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="px-8 py-20 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-[var(--text-primary)] mb-3">
          Built for HFT Portfolios
        </h2>
        <p className="text-center text-[var(--text-muted)] text-sm mb-12">
          Every component is designed for engineering quality, performance, and
          maintainability
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
                className="card p-6 hover:border-[var(--border-bright)] transition-all group"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${f.color}20`, border: `1px solid ${f.color}40` }}
                >
                  <Icon size={20} style={{ color: f.color }} />
                </div>
                <h3 className="font-bold text-[var(--text-primary)] mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  {f.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="px-8 py-16 text-center border-t border-[var(--border)]">
        <p className="text-[var(--text-muted)] text-sm mb-6">
          Designed to showcase skills for{" "}
          <span className="text-[var(--accent-blue)]">
            Jane Street, Optiver, Tower Research, IMC, Hudson River Trading
          </span>
        </p>
        <Link
          href={isAuthenticated ? "/dashboard" : "/auth/register"}
          className="btn-primary flex items-center gap-2 px-8 py-3 rounded-xl inline-flex mx-auto"
        >
          <ArrowRight size={16} />
          {isAuthenticated ? "Go to Dashboard" : "Create Account — $1M Virtual Cash"}
        </Link>
        <p className="text-xs text-[var(--text-muted)] mt-4">
          Free • No credit card required • Instant access
        </p>
      </div>
    </div>
  );
}
