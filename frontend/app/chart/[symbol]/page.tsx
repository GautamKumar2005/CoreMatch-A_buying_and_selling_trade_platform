// Server component — exports generateStaticParams for Next.js static export.
// The actual UI is in ChartClient.tsx ("use client").

import { ChartClient } from "./ChartClient";

const SYMBOLS = [
  "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "NFLX",
  "RELIANCE", "TCS", "INFY", "HDFC", "BTC", "ETH",
];

// Pre-generate a static page for every known symbol at build time
export function generateStaticParams() {
  return SYMBOLS.map((symbol) => ({ symbol }));
}

export default function ChartPage({
  params,
}: {
  params: { symbol: string };
}) {
  return <ChartClient symbol={params.symbol} />;
}
