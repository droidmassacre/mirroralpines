"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/client";
import { imageIsExpired } from "@/lib/images";
import Pomodoro from "./pomodoro";

type Message = {
  id: number;
  sender: string;
  body: string;
  image_path: string | null;
  image_expires_at: string | null;
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
  const [status, setStatus] = useState<"loading" | "gate" | "chat" | "decoy">(
    "loading",
  );
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
  const [uploading, setUploading] = useState(false);
  const [roomId, setRoomId] = useState("");

  const lastIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setStatus("decoy");
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

  async function postMessage(text: string, imagePath: string | null): Promise<boolean> {
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, sender: name, imagePath }),
      });
      if (!res.ok) return false;
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
      return true;
    } catch {
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || uploading) return;
    setInput("");
    const ok = await postMessage(text, null);
    if (!ok) setInput(text);
  }

  async function compressImage(file: File): Promise<Blob> {
    if (file.type === "image/gif") return file;
    try {
      const bitmap = await createImageBitmap(file);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const mime =
        file.type === "image/png" || file.type === "image/webp"
          ? file.type
          : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, 0.82),
      );
      return blob ?? file;
    } catch {
      return file;
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading) return;
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    const text = input.trim();
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append("file", blob, "photo.jpg");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) return;
      const data = await up.json();
      setInput("");
      const ok = await postMessage(text, data.path as string);
      if (!ok) setInput(text);
    } catch {
      // ignore
    } finally {
      setUploading(false);
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

  if (status === "decoy") {
    return <Pomodoro />;
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
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
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
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
                  {m.image_path && (
                    <span className="mb-1.5 block">
                      {imageIsExpired(m.image_expires_at) ? (
                        <span className="block rounded-lg bg-neutral-100 px-3 py-4 text-center text-xs text-neutral-400 dark:bg-neutral-700">
                          Photo expired
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/image?id=${m.id}&path=${encodeURIComponent(
                            m.image_path,
                          )}`}
                          alt=""
                          className="max-h-64 w-auto max-w-full rounded-lg"
                        />
                      )}
                    </span>
                  )}
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
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePick}
            className="hidden"
            aria-label="Attach a photo"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploading}
            aria-label="Attach a photo"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-50 text-base text-neutral-600 transition enabled:hover:border-neutral-400 enabled:hover:text-neutral-900 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:enabled:hover:text-neutral-100"
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
            ) : (
              "📷"
            )}
          </button>
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
            disabled={sending || uploading || !input.trim()}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-indigo-500 disabled:opacity-40"
          >
            {uploading ? "Uploading…" : "Send"}
          </button>
        </form>
      </div>
    </main>
  );
}
