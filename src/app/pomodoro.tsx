"use client";

import { useEffect, useState } from "react";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Mirror / Alpines";

const DURATIONS = {
  focus: 25 * 60,
  break: 5 * 60,
} as const;

type Mode = keyof typeof DURATIONS;

function format(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Pomodoro() {
  const [mode, setMode] = useState<Mode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          if (mode === "focus") setDone((d) => d + 1);
          const next: Mode = mode === "focus" ? "break" : "focus";
          setMode(next);
          setSecondsLeft(DURATIONS[next]);
          return DURATIONS[next];
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, mode]);

  function switchMode(next: Mode) {
    setMode(next);
    setSecondsLeft(DURATIONS[next]);
    setRunning(false);
  }

  const total = DURATIONS[mode];
  const pct = Math.round((secondsLeft / total) * 100);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-4 py-10 dark:bg-neutral-950">
      <div className="mb-8 flex items-center gap-2">
        <span className="text-2xl">🌲</span>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {APP_NAME}
        </h1>
      </div>

      <div className="w-full max-w-xs">
        <div className="flex justify-center gap-2 rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
          {(["focus", "break"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium capitalize transition ${
                mode === m
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="relative mx-auto mt-10 flex h-64 w-64 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-8 border-neutral-200 dark:border-neutral-800"
            style={{
              background: `conic-gradient(#4f46e5 ${pct}%, transparent ${pct}%)`,
            }}
          />
          <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-neutral-50 dark:bg-neutral-950">
            <span className="text-5xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
              {format(secondsLeft)}
            </span>
            <span className="mt-1 text-xs uppercase tracking-wide text-neutral-400">
              {mode === "focus" ? "Focus" : "Break"}
            </span>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="rounded-full bg-indigo-600 px-8 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRunning(false);
              setSecondsLeft(DURATIONS[mode]);
            }}
            className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          >
            Reset
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-neutral-400">
          {done > 0 ? "🍅".repeat(Math.min(done, 6)) : "No tomatoes yet."}
          {done > 6 && ` ${done}`}
        </p>
      </div>

      <p className="mt-10 text-xs text-neutral-400">
        Offline POMODORO app! Made with love :^]
      </p>
    </main>
  );
}
