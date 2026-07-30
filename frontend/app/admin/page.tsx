"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useChannel } from "@/lib/websocket";
import { Activity, Users, Zap, Clock, Play, Square } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [simulatorRunning, setSimulatorRunning] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  const { data } = useQuery({
    queryKey: ["adminMetrics"],
    queryFn: () => adminApi.metrics().then((r) => r.data),
    refetchInterval: 2000,
    enabled: isAuthenticated,
  });

  useEffect(() => { if (data) setMetrics(data); }, [data]);

  // Live metrics from WebSocket
  useChannel<Record<string, number>>("admin/metrics", (msg) => {
    setMetrics((prev) => ({ ...prev, ...msg }));
  });

  const handleSimulator = async (action: "start" | "stop") => {
    try {
      if (action === "start") {
        await adminApi.simulatorStart();
        setSimulatorRunning(true);
        toast.success("Simulator started");
      } else {
        await adminApi.simulatorStop();
        setSimulatorRunning(false);
        toast.success("Simulator stopped");
      }
    } catch { toast.error("Action failed"); }
  };

  if (!isAuthenticated) return null;

  const metricCards = [
    { label: "Total Orders",     value: metrics.totalOrders?.toLocaleString() ?? "0",   icon: Activity, color: "#00d4ff" },
    { label: "Total Trades",     value: metrics.totalTrades?.toLocaleString() ?? "0",   icon: Zap,      color: "#00ff88" },
    { label: "Rejected Orders",  value: metrics.rejectedOrders?.toLocaleString() ?? "0",icon: Activity, color: "#ff4444" },
    { label: "Connected Users",  value: metrics.connectedUsers?.toLocaleString() ?? "0",icon: Users,    color: "#a855f7" },
    { label: "Avg Latency",      value: `${metrics.avgLatencyUs ?? 0}μs`,               icon: Clock,    color: "#ffd700" },
    { label: "Peak Latency",     value: `${metrics.peakLatencyUs ?? 0}μs`,              icon: Clock,    color: "#ff9500" },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <Header />
        <div className="flex-1 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Activity size={20} className="text-[var(--accent-orange)]" />
              Admin Dashboard
            </h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${simulatorRunning ? "bg-[var(--accent-green)] animate-pulse" : "bg-[var(--text-muted)]"}`} />
              <span className="text-xs text-[var(--text-muted)]">
                Simulator {simulatorRunning ? "Running" : "Stopped"}
              </span>
              <button
                onClick={() => handleSimulator(simulatorRunning ? "stop" : "start")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  simulatorRunning
                    ? "border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[rgba(255,68,68,0.1)]"
                    : "border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[rgba(0,255,136,0.1)]"
                }`}
              >
                {simulatorRunning ? <Square size={12} /> : <Play size={12} />}
                {simulatorRunning ? "Stop Simulator" : "Start Simulator"}
              </button>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {metricCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} style={{ color: card.color }} />
                    <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                      {card.label}
                    </span>
                  </div>
                  <div className="mono font-bold text-2xl" style={{ color: card.color }}>
                    {card.value}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Users table */}
          <UsersTable />
        </div>
      </div>
    </div>
  );
}

function UsersTable() {
  const { data } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: () => adminApi.users().then((r) => r.data.users || []),
    refetchInterval: 30000,
  });

  return (
    <div className="card">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Registered Users
        </span>
        <span className="badge badge-blue">{data?.length ?? 0}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-dark">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Cash Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map(
              (u: {
                id: string;
                username: string;
                email: string;
                role: string;
                cash: number;
                isActive: boolean;
              }) => (
                <tr key={u.id}>
                  <td className="font-bold text-[var(--text-primary)]">{u.username}</td>
                  <td className="text-[var(--text-secondary)]">{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === "ADMIN" ? "badge-orange" : "badge-blue"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="mono">${u.cash?.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td>
                    <span className={`badge ${u.isActive ? "badge-green" : "badge-gray"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
