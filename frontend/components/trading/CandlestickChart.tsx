"use client";

import { useEffect, useRef } from "react";
import { marketApi } from "@/lib/api";

// Dynamically import lightweight-charts to avoid SSR issues
let LightweightCharts: typeof import("lightweight-charts") | null = null;

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import { useState } from "react";

interface Props {
  symbol: string;
  timeframe?: string;
  height?: number;
}

function calculateSMA(data: CandleData[], period: number) {
  const smaData = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    smaData.push({
      time: data[i].time as import("lightweight-charts").Time,
      value: sum / period,
    });
  }
  return smaData;
}

export function CandlestickChart({ symbol, timeframe = "1m", height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<import("lightweight-charts").IChartApi | null>(null);
  const candleSeriesRef = useRef<import("lightweight-charts").ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<import("lightweight-charts").ISeriesApi<"Histogram"> | null>(null);
  const sma20SeriesRef = useRef<any>(null);
  const sma50SeriesRef = useRef<any>(null);

  const [showSMA, setShowSMA] = useState(true);
  const [candlesData, setCandlesData] = useState<CandleData[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const initChart = async () => {
      const lc = await import("lightweight-charts");
      LightweightCharts = lc;

      if (destroyed || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height: height,
        layout: {
          background: { color: "#111118" },
          textColor: "#94a3b8",
        },
        grid: {
          vertLines: { color: "#1a1a2e" },
          horzLines: { color: "#1a1a2e" },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: "#444466", labelBackgroundColor: "#1a1a2e" },
          horzLine: { color: "#444466", labelBackgroundColor: "#1a1a2e" },
        },
        rightPriceScale: {
          borderColor: "#2d2d44",
          textColor: "#94a3b8",
        },
        timeScale: {
          borderColor: "#2d2d44",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor:          "#00ff88",
        downColor:        "#ff4444",
        borderUpColor:    "#00ff88",
        borderDownColor:  "#ff4444",
        wickUpColor:      "#00ff88",
        wickDownColor:    "#ff4444",
      });
      candleSeriesRef.current = candleSeries;

      const volumeSeries = chart.addSeries(lc.HistogramSeries, {
        color: "#26a69a",
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeriesRef.current = volumeSeries;

      // Add SMA Indicators Line Series
      const sma20Series = chart.addSeries(lc.LineSeries, {
        color: "#ff9500",
        lineWidth: 2,
        title: "SMA 20",
      });
      sma20SeriesRef.current = sma20Series;

      const sma50Series = chart.addSeries(lc.LineSeries, {
        color: "#a855f7",
        lineWidth: 2,
        title: "SMA 50",
      });
      sma50SeriesRef.current = sma50Series;

      try {
        const res = await marketApi.candles(symbol, timeframe, 200);
        const candles: CandleData[] = res.data.candles || [];

        if (candles.length > 0 && !destroyed) {
          setCandlesData(candles);
          candleSeries.setData(
            candles.map((c) => ({
              time: c.time as import("lightweight-charts").Time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          );
          volumeSeries.setData(
            candles.map((c) => ({
              time: c.time as import("lightweight-charts").Time,
              value: c.volume,
              color: c.close >= c.open
                ? "rgba(0,255,136,0.3)"
                : "rgba(255,68,68,0.3)",
            }))
          );
          chart.timeScale().fitContent();
        }
      } catch {}

      const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current && !destroyed) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      resizeObserver.observe(containerRef.current!);

      return () => {
        resizeObserver.disconnect();
        chart.remove();
      };
    };

    const cleanup = initChart();

    return () => {
      destroyed = true;
      cleanup.then((fn) => fn?.());
    };
  }, [symbol, timeframe, height]);

  // Reactive effect to toggle indicators on/off
  useEffect(() => {
    if (sma20SeriesRef.current && sma50SeriesRef.current) {
      if (showSMA && candlesData.length > 0) {
        sma20SeriesRef.current.setData(calculateSMA(candlesData, 20));
        sma50SeriesRef.current.setData(calculateSMA(candlesData, 50));
      } else {
        sma20SeriesRef.current.setData([]);
        sma50SeriesRef.current.setData([]);
      }
    }
  }, [showSMA, candlesData]);

  return (
    <div className="relative bg-[#111118] rounded-b-lg overflow-hidden flex flex-col">
      {/* Chart Toolbar */}
      <div className="px-3 py-1.5 border-b border-[var(--border)] flex items-center justify-between text-xs bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] font-semibold uppercase text-[10px] tracking-wider">Indicators:</span>
          <button
            onClick={() => setShowSMA(!showSMA)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
              showSMA
                ? "bg-[var(--accent-blue)] text-black border-[var(--accent-blue)]"
                : "text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-bright)]"
            }`}
          >
            SMA (20, 50)
          </button>
        </div>
        <div className="flex gap-3 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff9500]" />
            SMA 20
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" />
            SMA 50
          </span>
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} style={{ height }} />
        {!chartRef.current && (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
              Loading chart...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
