"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

const SPRITES: Record<string, string> = { mira: "[MIRA]", alp: "[ALP]" };

const START: Record<string, { x: number; y: number }> = {
  mira: { x: 70, y: 58 },
  alp: { x: 28, y: 58 },
};

const DECOR = [
  { e: "🌳", x: 8, y: 16 },
  { e: "🌳", x: 90, y: 20 },
  { e: "🪨", x: 50, y: 82 },
  { e: "💧", x: 16, y: 78 },
  { e: "🌸", x: 82, y: 70 },
  { e: "🦋", x: 62, y: 18 },
];

type Pos = { x: number; y: number };

type Latest = { id: number; sender: string; text: string };

function clamp(p: Pos): Pos {
  return { x: Math.min(Math.max(p.x, 5), 95), y: Math.min(Math.max(p.y, 12), 88) };
}

export default function SpriteSpace({
  channel,
  name,
  latest,
}: {
  channel: RealtimeChannel | null;
  name: string;
  latest: Latest | null;
}) {
  const own = name.trim().toLowerCase();
  const other = own === "mira" ? "alp" : "mira";

  const [myPos, setMyPos] = useState<Pos>(() => clamp(START[own] ?? { x: 50, y: 50 }));
  const [others, setOthers] = useState<Record<string, Pos>>(() => ({
    [other]: START[other] ?? { x: 50, y: 50 },
  }));

  const posRef = useRef<Pos>(myPos);
  const keysRef = useRef<Set<string>>(new Set());
  const targetRef = useRef<Pos | null>(null);
  const othersRef = useRef<Record<string, Pos>>(others);
  const lastSentRef = useRef(0);
  const floorRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      keysRef.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const k = keysRef.current;
      const p = posRef.current;
      let dx = 0;
      let dy = 0;
      if (k.has("arrowleft") || k.has("a")) dx -= 0.55;
      if (k.has("arrowright") || k.has("d")) dx += 0.55;
      if (k.has("arrowup") || k.has("w")) dy -= 0.55;
      if (k.has("arrowdown") || k.has("s")) dy += 0.55;

      if (!dx && !dy && targetRef.current) {
        const t = targetRef.current;
        const ddx = t.x - p.x;
        const ddy = t.y - p.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist < 0.4) {
          targetRef.current = null;
        } else {
          const step = Math.min(dist, 0.55);
          dx = (ddx / dist) * step;
          dy = (ddy / dist) * step;
        }
      }

      if (dx || dy) {
        const next = clamp({ x: p.x + dx, y: p.y + dy });
        posRef.current = next;
        setMyPos(next);
        const now = Date.now();
        if (now - lastSentRef.current > 80) {
          lastSentRef.current = now;
          channel
            ?.send({
              type: "broadcast",
              event: "move",
              payload: { name, x: next.x, y: next.y },
            })
            .catch(() => {});
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [channel, name]);

  useEffect(() => {
    if (!channel || subRef.current === channel) return;
    subRef.current = channel;
    channel.on("broadcast", { event: "move" }, (payload) => {
      const p = payload.payload as { name?: string; x?: number; y?: number };
      if (
        p &&
        typeof p.x === "number" &&
        typeof p.y === "number" &&
        p.name &&
        p.name.toLowerCase() !== own
      ) {
        const next = clamp({ x: p.x, y: p.y });
        othersRef.current[p.name] = next;
        setOthers({ ...othersRef.current });
      }
    });
  }, [channel, own]);

  function handlePointerDown(e: React.PointerEvent) {
    const el = floorRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    targetRef.current = clamp({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  const otherPos = others[other];
  const myBubble =
    latest && latest.sender.toLowerCase() === own && latest.text ? latest : null;
  const otherBubble =
    latest && latest.sender.toLowerCase() === other && latest.text ? latest : null;

  return (
    <div className="flex h-full w-full flex-col">
      <style>{`@keyframes bubble-pop { from { transform: translateY(4px) scale(0.85); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }`}</style>
      <div
        ref={floorRef}
        onPointerDown={handlePointerDown}
        className="relative min-h-0 flex-1 touch-none overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-b from-emerald-50 via-neutral-50 to-neutral-100 dark:border-neutral-800 dark:from-emerald-950/30 dark:via-neutral-950 dark:to-neutral-900"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      >
        {DECOR.map((d, i) => (
          <span
            key={i}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-xl opacity-80"
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
          >
            {d.e}
          </span>
        ))}

        {otherPos && (
          <Sprite
            label={other}
            emoji={SPRITES[other] ?? "🙂"}
            pos={otherPos}
            mine={false}
            bubble={otherBubble}
          />
        )}
        <Sprite
          label={own}
          emoji={SPRITES[own] ?? "🙂"}
          pos={myPos}
          mine
          bubble={myBubble}
        />
      </div>
      <p className="mt-2 px-1 text-center text-[10px] text-neutral-400">
        Move with WASD / arrow keys, or tap the floor · positions sync live
      </p>
    </div>
  );
}

function Sprite({
  label,
  emoji,
  pos,
  mine,
  bubble,
}: {
  label: string;
  emoji: string;
  pos: Pos;
  mine: boolean;
  bubble: Latest | null;
}) {
  return (
    <div
      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-[left,top] duration-150 ease-linear"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      {bubble && (
        <div
          key={bubble.id}
          className={`mb-1 max-w-[150px] rounded-xl rounded-br-sm px-2.5 py-1.5 text-xs leading-snug break-words line-clamp-2 ${
            mine
              ? "bg-indigo-600 text-white"
              : "bg-white text-neutral-900 shadow-md dark:bg-neutral-800 dark:text-neutral-100"
          }`}
          style={{ animation: "bubble-pop 0.22s ease-out" }}
        >
          {bubble.text}
        </div>
      )}
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl shadow-md dark:bg-neutral-800 ${
          mine ? "ring-2 ring-indigo-500 ring-offset-1" : "ring-1 ring-neutral-300"
        }`}
      >
        {emoji}
      </div>
      <span
        className={`mt-0.5 rounded-full px-1.5 text-[10px] font-medium ${
          mine
            ? "bg-indigo-600 text-white"
            : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
