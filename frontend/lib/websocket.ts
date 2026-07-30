"use client";

import { useEffect, useRef, useCallback } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";

type MessageHandler = (data: unknown) => void;

class ExchangeWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private subscribedChannels: Set<string> = new Set();
  private static instance: ExchangeWebSocket;

  static getInstance(): ExchangeWebSocket {
    if (!ExchangeWebSocket.instance) {
      ExchangeWebSocket.instance = new ExchangeWebSocket();
    }
    return ExchangeWebSocket.instance;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    )
      return;

    // Resolve URL dynamically at connection time (so it adapts to current hostname if not hardcoded)
    let finalUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!finalUrl && typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Check if we are running frontend on a port like 3000 but backend is on 8080 (dev environment)
      // Otherwise, use same host
      const host = window.location.host;
      if (host.includes("localhost:3000")) {
        finalUrl = "ws://localhost:8080/ws";
      } else {
        finalUrl = `${proto}//${host}/ws`;
      }
    }
    finalUrl = finalUrl || "ws://localhost:8080/ws";

    console.log("[WS] Connecting to:", finalUrl);
    this.ws = new WebSocket(finalUrl);

    this.ws.onopen = () => {
      console.log("[WS] Connected successfully");
      this.reconnectDelay = 1000;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ws-status", { detail: true }));
      }
      // Re-subscribe all channels after reconnect
      for (const channel of this.subscribedChannels) {
        this.sendSubscribe(channel);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const channel = msg.channel as string | undefined;
        const type = msg.type as string | undefined;

        // Dispatch to handlers by type and by channel
        if (type) this.dispatch(type, msg.data ?? msg);
        if (channel) this.dispatch(channel, msg.data ?? msg);
        // Also dispatch raw message to wildcard
        this.dispatch("*", msg);
      } catch {}
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected — reconnecting in", this.reconnectDelay, "ms");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ws-status", { detail: false }));
      }
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        this.connect();
      }, this.reconnectDelay);
    };

    this.ws.onerror = (e) => {
      console.warn("[WS] Error", e);
    };
  }

  private sendSubscribe(channel: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "subscribe", channel }));
    }
  }

  subscribe(channel: string, handler: MessageHandler) {
    this.subscribedChannels.add(channel);
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel)!.add(handler);
    this.sendSubscribe(channel);
  }

  unsubscribe(channel: string, handler: MessageHandler) {
    this.handlers.get(channel)?.delete(handler);
    if (this.handlers.get(channel)?.size === 0) {
      this.handlers.delete(channel);
      this.subscribedChannels.delete(channel);
    }
  }

  private dispatch(channel: string, data: unknown) {
    this.handlers.get(channel)?.forEach((h) => h(data));
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

// ── React hooks ───────────────────────────────────────────────────────────────

export function useWebSocket() {
  const ws = ExchangeWebSocket.getInstance();
  useEffect(() => {
    ws.connect();
  }, [ws]);
  return ws;
}

export function useChannel<T = unknown>(
  channel: string,
  onMessage: (data: T) => void,
  deps: React.DependencyList = []
) {
  const ws = useWebSocket();
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const handler = (data: unknown) => handlerRef.current(data as T);
    ws.subscribe(channel, handler);
    return () => ws.unsubscribe(channel, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, ws, ...deps]);
}
