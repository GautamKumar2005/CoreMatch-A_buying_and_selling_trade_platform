import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token from localStorage and automatically rewrite localhost URL to current domain if deployed
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // If baseURL is localhost but browser is on a deployed domain (like Render), rewrite it dynamically
    if (config.baseURL?.includes("localhost:8080") && !window.location.host.includes("localhost:8080")) {
      config.baseURL = window.location.origin;
    }

    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


// Response error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post("/api/auth/register", data),

  login: (data: { email: string; password: string }) =>
    api.post("/api/auth/login", data),

  logout: () => api.post("/api/auth/logout"),

  profile: () => api.get("/api/auth/profile"),

  deleteAccount: () => api.delete("/api/auth/delete-account"),
};

// ── Orders ───────────────────────────────────────────────────────────────────
export const ordersApi = {
  place: (order: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    price?: number;
    quantity: number;
  }) => api.post("/api/orders", order),

  list: () => api.get("/api/orders"),

  cancel: (orderId: string) => api.delete(`/api/orders/${orderId}`),

  modify: (orderId: string, price: number, quantity: number) =>
    api.put(`/api/orders/${orderId}`, { price, quantity }),
};

// ── Market ───────────────────────────────────────────────────────────────────
export const marketApi = {
  symbols: () => api.get("/api/market/symbols"),

  orderBook: (symbol: string) => api.get(`/api/market/orderbook/${symbol}`),

  trades: (symbol: string, limit = 50) =>
    api.get(`/api/market/trades/${symbol}?limit=${limit}`),

  stats: (symbol?: string) =>
    symbol
      ? api.get(`/api/market/stats/${symbol}`)
      : api.get("/api/market/stats"),

  candles: (symbol: string, tf = "1m", limit = 200) =>
    api.get(`/api/market/candles/${symbol}?tf=${tf}&limit=${limit}`),
};

// ── Portfolio ────────────────────────────────────────────────────────────────
export const portfolioApi = {
  get: () => api.get("/api/portfolio"),
  history: () => api.get("/api/portfolio/history"),
  deposit: (amount: number) => api.post("/api/portfolio/deposit", { amount }),
  withdraw: (amount: number) => api.post("/api/portfolio/withdraw", { amount }),
  auditLogs: () => api.get("/api/portfolio/audit-logs"),
};

// ── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  metrics: () => api.get("/api/admin/metrics"),
  users: () => api.get("/api/admin/users"),
  simulatorStart: () => api.post("/api/admin/simulator/start"),
  simulatorStop: () => api.post("/api/admin/simulator/stop"),
  benchmark: (count: number) => api.post("/api/admin/benchmark", { count }),
};
