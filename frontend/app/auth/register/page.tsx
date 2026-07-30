"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UserPlus, BarChart3, Eye, EyeOff } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setLoading(true);
    try {
      const res = await authApi.register({ username, email, password });
      setAuth(res.data.user, res.data.token);
      toast.success(`🎉 Welcome, ${username}! You have $1,000,000 virtual cash.`);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Registration failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-radial from-[rgba(0,255,136,0.05)] to-transparent rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
              <BarChart3 size={24} className="text-black" />
            </div>
            <div>
              <div className="text-2xl font-bold gradient-text">CoreMatch</div>
              <div className="text-xs text-[var(--text-muted)]">Exchange Simulator</div>
            </div>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            Create your trading account
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Start with{" "}
            <span className="text-[var(--accent-green)] font-semibold">
              $1,000,000
            </span>{" "}
            in virtual cash
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="trader_pro"
                className="input-dark"
                required
                minLength={3}
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@example.com"
                className="input-dark"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="input-dark !pr-10"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Benefits list */}
            <div className="bg-[var(--bg-elevated)] rounded-lg p-3 text-xs space-y-1.5 border border-[var(--border)]">
              {[
                "✅ $1,000,000 virtual cash to trade",
                "✅ Access to 14 symbols (stocks + crypto)",
                "✅ Real-time matching engine",
                "✅ Live candlestick charts",
              ].map((b) => (
                <div key={b} className="text-[var(--text-secondary)]">
                  {b}
                </div>
              ))}
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-lg"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <UserPlus size={16} />
              )}
              {loading ? "Creating account..." : "Create Account"}
            </motion.button>
          </form>

          <p className="text-center text-xs text-[var(--text-muted)] mt-5">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-[var(--accent-blue)] hover:underline"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
