import { create } from "zustand";

export interface DepthLevel {
  price: number;
  qty: number;
  count: number;
}

export interface OrderBook {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  timestamp: number;
}

export interface Trade {
  id: string;
  symbol: string;
  buyerId: string;
  sellerId: string;
  price: number;
  quantity: number;
  value: number;
  createdAt: number;
}

export interface SymbolStats {
  symbol: string;
  lastPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  vwap: number;
  tradeCount: number;
  changePercent: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  lastPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  value: number;
}

export interface Portfolio {
  userId: string;
  cash: number;
  positions: Position[];
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  portfolioValue: number;
}

interface TradingState {
  // Selected symbol
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;

  // Order books per symbol
  orderBooks: Record<string, OrderBook>;
  setOrderBook: (symbol: string, book: OrderBook) => void;

  // Recent trades per symbol
  recentTrades: Record<string, Trade[]>;
  addTrade: (symbol: string, trade: Trade) => void;

  // Market stats per symbol
  stats: Record<string, SymbolStats>;
  setStats: (symbol: string, stats: SymbolStats) => void;
  setAllStats: (allStats: SymbolStats[]) => void;

  // Portfolio
  portfolio: Portfolio | null;
  setPortfolio: (portfolio: Portfolio) => void;

  // Notifications
  lastTrade: Trade | null;

  // Sidebar toggle for mobile responsive layout
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Selected price from OrderBook for click-to-fill order placement
  selectedPrice: number | null;
  setSelectedPrice: (price: number | null) => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  activeSymbol: "AAPL",
  setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),

  orderBooks: {},
  setOrderBook: (symbol, book) =>
    set((s) => ({ orderBooks: { ...s.orderBooks, [symbol]: book } })),

  recentTrades: {},
  addTrade: (symbol, trade) =>
    set((s) => ({
      recentTrades: {
        ...s.recentTrades,
        [symbol]: [trade, ...(s.recentTrades[symbol] || [])].slice(0, 100),
      },
      lastTrade: trade,
    })),

  stats: {},
  setStats: (symbol, stats) =>
    set((s) => ({ stats: { ...s.stats, [symbol]: stats } })),
  setAllStats: (allStats) =>
    set(() => {
      const statsMap: Record<string, SymbolStats> = {};
      for (const s of allStats) statsMap[s.symbol] = s;
      return { stats: statsMap };
    }),

  portfolio: null,
  setPortfolio: (portfolio) => set({ portfolio }),

  lastTrade: null,

  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  selectedPrice: null,
  setSelectedPrice: (price) => set({ selectedPrice: price }),
}));
