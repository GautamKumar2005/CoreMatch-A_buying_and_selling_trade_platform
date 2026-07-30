"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  Briefcase,
  ListOrdered,
  Activity,
  Zap,
  LogOut,
  Settings,
  TrendingUp,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useTradingStore } from "@/store/tradingStore";
import { authApi, portfolioApi } from "@/lib/api";
import { useChannel } from "@/lib/websocket";
import toast from "react-hot-toast";
import { motion } from "framer-motion";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/market",    icon: TrendingUp,      label: "Market Watch" },
  { href: "/portfolio", icon: Briefcase,       label: "Portfolio" },
  { href: "/orders",    icon: ListOrdered,     label: "Orders" },
  { href: "/settings",  icon: Settings,        label: "Settings" },
];

const adminItems = [
  { href: "/admin",     icon: Activity, label: "Admin" },
  { href: "/benchmark", icon: Zap,      label: "Benchmark" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, portfolio, setPortfolio } = useTradingStore();

  useEffect(() => {
    if (user) {
      portfolioApi.get().then((r) => {
        if (r.data) setPortfolio(r.data);
      }).catch(() => {});
    }
  }, [user, setPortfolio]);

  useChannel<{ type: string; data: any }>(
    `portfolio/${user?.id}`,
    (msg) => { if (msg?.data) setPortfolio(msg.data); },
    [user?.id]
  );

  const displayCash = portfolio ? portfolio.cash : (user ? user.cash : 0);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {}
    logout();
    toast.success("Logged out");
    router.push("/");
  };

  return (
    <aside className={`sidebar flex flex-col ${sidebarOpen ? "open" : ""}`}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 w-full">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center flex-shrink-0">
            <LineChart size={16} className="text-black" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm gradient-text">CoreMatch</div>
            <div className="text-[10px] text-[var(--text-muted)]">Exchange</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* User info */}
      {user && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="text-xs text-[var(--text-muted)]">Logged in as</div>
          <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {user.username}
          </div>
          <div className="text-xs text-[var(--accent-blue)] font-mono">
            ${displayCash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        <div className="section-header">Trading</div>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href}>
              <motion.div
                whileHover={{ x: 3 }}
                className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-colors cursor-pointer ${
                  active
                    ? "bg-[var(--bg-elevated)] text-[var(--accent-blue)] border border-[var(--border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                <Icon size={16} />
                <span>{label}</span>
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />
                )}
              </motion.div>
            </Link>
          );
        })}

        {user?.role === "ADMIN" && (
          <>
            <div className="section-header mt-4">Admin</div>
            {adminItems.map(({ href, icon: Icon, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <motion.div
                    whileHover={{ x: 3 }}
                    className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--bg-elevated)] text-[var(--accent-orange)] border border-[var(--border)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </motion.div>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--border)] p-3 space-y-1">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2 w-full rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
