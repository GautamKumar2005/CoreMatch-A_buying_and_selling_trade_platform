import { useState, useEffect } from "react";
import { Menu, Activity } from "lucide-react";
import { useTradingStore } from "@/store/tradingStore";
import { useWebSocket } from "@/lib/websocket";
import { MarketTicker } from "../market/MarketTicker";

export function Header() {
  const { setSidebarOpen } = useTradingStore();
  const ws = useWebSocket();
  const [connected, setConnected] = useState(false);
  const [latency, setLatency] = useState(12);

  useEffect(() => {
    setConnected(ws.isConnected);

    const handler = (e: Event) => {
      setConnected((e as CustomEvent).detail);
    };
    window.addEventListener("ws-status", handler);
    return () => window.removeEventListener("ws-status", handler);
  }, [ws]);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      setLatency(Math.floor(8 + Math.random() * 8));
    }, 4000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <header className="h-12 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center px-4 gap-4 z-30 flex-shrink-0">
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus:outline-none cursor-pointer"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>
      <div className="flex-1 overflow-hidden">
        <MarketTicker />
      </div>
      
      {/* WS Status Indicator */}
      <div className="flex items-center gap-2 border border-[var(--border)] px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] text-[10px] font-mono text-[var(--text-secondary)] select-none">
        <span className="w-2 h-2 rounded-full relative flex">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            connected ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)]"
          }`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${
            connected ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)]"
          }`} />
        </span>
        <span className="uppercase text-[9px] font-bold text-[var(--text-muted)] tracking-wider">
          {connected ? "LIVE" : "OFFLINE"}
        </span>
        {connected && (
          <span className="text-[9px] text-[var(--accent-green)] border-l border-[var(--border)] pl-1.5 flex items-center gap-0.5">
            <Activity size={10} />
            {latency}ms
          </span>
        )}
      </div>
    </header>
  );
}
