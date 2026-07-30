"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { portfolioApi, authApi } from "@/lib/api";
import { Settings, ShieldAlert, CreditCard, History, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuthStore();
  const [fundAmount, setFundAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState("");
  const { user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  // Load audit logs
  const { data: logsData, refetch: refetchLogs } = useQuery({
    queryKey: ["portfolioAuditLogs"],
    queryFn: () => portfolioApi.auditLogs().then((r) => r.data.logs || []),
    refetchInterval: 5000,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;

  const handleDeposit = async () => {
    const amount = parseFloat(fundAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid deposit amount");
    setLoading(true);
    try {
      await portfolioApi.deposit(amount);
      toast.success(`✅ Successfully deposited $${amount.toLocaleString()}`);
      setFundAmount("");
      refetchLogs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(fundAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid withdrawal amount");
    setLoading(true);
    try {
      await portfolioApi.withdraw(amount);
      toast.success(`✅ Successfully withdrew $${amount.toLocaleString()}`);
      setFundAmount("");
      refetchLogs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmUsername !== user?.username) {
      return toast.error("Username does not match confirmation value");
    }
    setLoading(true);
    try {
      await authApi.deleteAccount();
      toast.success("Account deleted successfully");
      logout();
      router.push("/auth/login");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to delete account");
    } finally {
      setLoading(false);
    }
  };

  const fundsLogs = (logsData || []).filter(
    (l: any) => l.event === "DEPOSIT" || l.event === "WITHDRAWAL"
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="main-content flex-1 flex flex-col">
        <Header />
        <div className="flex-1 p-4 space-y-6 max-w-4xl mx-auto w-full">
          {/* Page Header */}
          <div className="flex items-center gap-2 mb-2">
            <Settings size={20} className="text-[var(--accent-blue)]" />
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Settings</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Funds credit/debit */}
            <div className="card p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                <CreditCard size={16} className="text-[var(--accent-blue)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Cash Manager
                </h2>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Credit or debit cash to fund your demo trading account. Transactions execute instantly and update your available trading power.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      placeholder="1,000.00"
                      className="input-dark !pl-7 text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleDeposit}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--accent-green)] text-black font-bold text-xs hover:brightness-110 disabled:opacity-60 cursor-pointer transition-all"
                  >
                    <ArrowUpRight size={14} />
                    Deposit (Credit)
                  </button>
                  <button
                    onClick={handleWithdraw}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--accent-red)] border border-[var(--border)] font-bold text-xs hover:bg-[rgba(255,68,68,0.05)] disabled:opacity-60 cursor-pointer transition-all"
                  >
                    <ArrowDownLeft size={14} />
                    Withdraw (Debit)
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="card p-4 space-y-4 border border-red-900/30 bg-red-950/5">
              <div className="flex items-center gap-2 border-b border-red-900/30 pb-2">
                <ShieldAlert size={16} className="text-[var(--accent-red)]" />
                <h2 className="text-sm font-semibold text-[var(--accent-red)] uppercase tracking-wider">
                  Danger Zone
                </h2>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Permanently delete your trader profile. This will wipe your trading history, portfolio holdings, orders, and credentials. This action is irreversible.
              </p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-950/60 text-red-400 border border-red-900/60 font-bold text-xs hover:bg-red-900/60 hover:text-white cursor-pointer transition-all"
              >
                <Trash2 size={14} />
                Delete Profile
              </button>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="card">
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2">
              <History size={14} className="text-[var(--text-muted)]" />
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Funding Adjustments History
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Log Details</th>
                  </tr>
                </thead>
                <tbody>
                  {fundsLogs.map((log: any) => {
                    const isDep = log.event === "DEPOSIT";
                    return (
                      <tr key={log._id || log.timestamp}>
                        <td className="mono text-[10px] text-[var(--text-muted)]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge ${isDep ? "badge-green" : "badge-red"}`}>
                            {log.event}
                          </span>
                        </td>
                        <td className="text-xs text-[var(--text-secondary)]">
                          {log.detail}
                        </td>
                      </tr>
                    );
                  })}
                  {fundsLogs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center text-[var(--text-muted)] py-8 text-sm">
                        No recent credit/debit adjustments found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card max-w-md w-full p-6 space-y-4 border border-red-900/60 bg-[#120a0a]"
            >
              <div className="flex items-center gap-2 text-[var(--accent-red)]">
                <ShieldAlert size={20} />
                <h3 className="text-base font-bold">Delete Trader Account?</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                This action is irreversible. All of your trading orders, positions, and history will be permanently expunged from the CoreMatch exchange.
              </p>
              <div className="space-y-2">
                <label className="block text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                  Type username <span className="mono text-white underline">{user?.username}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmUsername}
                  onChange={(e) => setConfirmUsername(e.target.value)}
                  placeholder={user?.username}
                  className="input-dark text-sm border-red-900/40 focus:border-red-500"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setConfirmUsername("");
                  }}
                  className="px-4 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={confirmUsername !== user?.username}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-red)] text-white text-xs font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
