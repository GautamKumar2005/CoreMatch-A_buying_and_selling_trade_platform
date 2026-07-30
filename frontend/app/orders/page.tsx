"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import toast from "react-hot-toast";
import { X } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "badge-blue",
  PARTIAL:   "badge-yellow",
  FILLED:    "badge-green",
  CANCELLED: "badge-gray",
  REJECTED:  "badge-red",
};

export default function OrdersPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [filter, setFilter] = useState("ALL");
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  const { data, refetch } = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersApi.list().then((r) => r.data.orders || []),
    refetchInterval: 5000,
    enabled: isAuthenticated,
  });

  const orders = (data || []).filter(
    (o: { status: string }) => filter === "ALL" || o.status === filter
  );

  const handleCancel = async (orderId: string) => {
    setCancelling(orderId);
    try {
      await ordersApi.cancel(orderId);
      toast.success("Order cancelled");
      refetch();
    } catch {
      toast.error("Failed to cancel order");
    } finally {
      setCancelling(null);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <Header />
        <div className="flex-1 p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Orders</h1>
            <div className="flex gap-1.5 flex-wrap">
              {["ALL", "PENDING", "PARTIAL", "FILLED", "CANCELLED", "REJECTED"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === s
                      ? "bg-[var(--bg-elevated)] text-[var(--accent-blue)] border border-[var(--border)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Filled</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(
                    (o: {
                      id: string;
                      createdAt: number;
                      symbol: string;
                      side: string;
                      type: string;
                      price: number;
                      quantity: number;
                      filledQty: number;
                      status: string;
                      rejectionReason?: string;
                    }) => (
                      <tr key={o.id}>
                        <td className="mono text-[10px] text-[var(--text-muted)]">
                          {new Date(o.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="font-bold text-[var(--text-primary)]">{o.symbol}</td>
                        <td>
                          <span className={`badge ${o.side === "BUY" ? "badge-green" : "badge-red"}`}>
                            {o.side}
                          </span>
                        </td>
                        <td className="text-[var(--text-muted)] text-xs">{o.type}</td>
                        <td className="mono">${o.price.toFixed(2)}</td>
                        <td className="mono">{o.quantity.toLocaleString()}</td>
                        <td className="mono text-[var(--text-secondary)]">
                          {o.filledQty.toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_COLORS[o.status] ?? "badge-gray"}`}>
                            {o.status}
                          </span>
                          {o.status === "REJECTED" && o.rejectionReason && (
                            <div className="text-[9px] text-[var(--accent-red)] mt-0.5 max-w-[160px] truncate">
                              {o.rejectionReason}
                            </div>
                          )}
                        </td>
                        <td>
                          {(o.status === "PENDING" || o.status === "PARTIAL") && (
                            <button
                              onClick={() => handleCancel(o.id)}
                              disabled={cancelling === o.id}
                              className="flex items-center gap-1 text-[10px] text-[var(--accent-red)] hover:text-[var(--accent-red)] border border-[rgba(255,68,68,0.3)] rounded px-2 py-1 transition-colors hover:bg-[rgba(255,68,68,0.1)] disabled:opacity-50"
                            >
                              <X size={10} />
                              {cancelling === o.id ? "..." : "Cancel"}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  )}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-[var(--text-muted)] py-8 text-sm">
                        No orders found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
