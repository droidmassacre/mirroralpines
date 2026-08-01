"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/client";

type Message = {
  id: number;
  sender: string;
  body: string;
  created_at: string;
};

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Mirror / Alpines";
const NAME_KEY = "ma_name";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Home() {
  const [status, setStatus] = useState<"loading" | "gate" | "chat">("loading");
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [roomId, setRoomId] = useState("");

  const lastIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const appendMessages = useCallback((incoming: Message[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const msg of incoming) {
        if (!seen.has(msg.id)) {
          merged.push(msg);
          seen.add(msg.id);
        }
      }
      merged.sort((a, b) => a.id - b.id);
      return merged;
    });
  }, []);

  const lastId = messages.length ? messages[messages.length - 1].id : 0;

  useEffect(() => {
    lastIdRef.current = lastId;
  }, [lastId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setRoomId(data.roomId ?? "");
            setStatus("chat");
          }
        } else if (!cancelled) {
          setStatus("gate");
        }
      } catch {
        if (!cancelled) setStatus("gate");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "chat") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/messages");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) appendMessages(data.messages ?? []);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, appendMessages]);

  useEffect(() => {
    if (status !== "chat" || !roomId) return;
    const supabase = getBrowserClient();
    const channel = supabase.channel(roomId, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "message" }, (payload) => {
        const msg = payload.payload as Message;
        if (msg && typeof msg.id === "number") appendMessages([msg]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [status, roomId, appendMessages]);

  useEffect(() => {
    if (status !== "chat") return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/messages?after=${lastIdRef.current}`);
        if (res.ok) {
          const data = await res.json();
          appendMessages(data.messages ?? []);
        }
      } catch {
        // ignore
      }
    };
    const id = setInterval(tick, 8000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, appendMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!code.trim()) {
      setError("Enter the passcode.");
      return;
    }
    const finalName = name.trim().slice(0, 32) || "You";
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That passcode didn't work.");
        return;
      }
      try {
        localStorage.setItem(NAME_KEY, finalName);
      } catch {
        // ignore
      }
      setName(finalName);
      setRoomId(data.roomId ?? "");
      setCode("");
      setStatus("chat");
    } catch {
      setError("Connection error. Try again.");
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, sender: name }),
      });
      if (!res.ok) {
        setInput(text);
        return;
      }
      const data = await res.json();
      const msg = data.message as Message;
      appendMessages([msg]);
      const channel = channelRef.current;
      if (channel) {
        channel.send({
          type: "broadcast",
          event: "message",
          payload: msg,
        }).catch(() => {});
      }
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setMessages([]);
    setRoomId("");
    setStatus("gate");
  }

  if (status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </main>
    );
  }

  if (status === "gate") {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-xl dark:bg-neutral-800">
                🌲
              </div>
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {APP_NAME}
              </h1>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Offline POMODORO app! Made with love :^]
              </p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
                >
                  Your name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mira"
                  autoComplete="nickname"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:ring-neutral-800"
                />
              </div>
              <div>
                <label
                  htmlFor="code"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
                >
                  Passcode
                </label>
                <input
                  id="code"
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:ring-neutral-800"
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                Sign in
              </button>
            </form>
          </div>
          <p className="mt-4 text-center text-xs text-neutral-400">
            Because to hell with your parents.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌲</span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {APP_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {name || "You"}
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-600 hover:underline dark:hover:text-neutral-200"
          >
            Leave
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-neutral-400">
              No messages yet. Say hi.
            </p>
          )}
          {messages.map((m) => {
            const mine = m.sender === (name || "You");
            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                {!mine && (
                  <span className="mb-0.5 ml-1 text-xs text-neutral-400">
                    {m.sender}
                  </span>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                    mine
                      ? "rounded-br-md bg-indigo-600 text-white"
                      : "rounded-bl-md bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 mr-1 text-[10px] text-neutral-400">
                  {formatTime(m.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <form
          onSubmit={handleSend}
          className="mx-auto flex w-full max-w-2xl items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            autoComplete="off"
            className="flex-1 rounded-full border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-indigo-500 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
