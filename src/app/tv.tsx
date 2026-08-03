"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

type YTPlayer = {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(t: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        id: string,
        opts: {
          videoId: string;
          playerVars?: Record<string, number>;
          events?: Record<string, (e: { data: number }) => void>;
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type TvPayload =
  | { action: "load"; videoId: string }
  | { action: "play"; t: number }
  | { action: "pause" };

function extractVideoId(input: string): string | null {
  try {
    const raw = input.trim();
    if (!raw) return null;
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export default function TvWatch({ channel }: { channel: RealtimeChannel | null }) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [ready, setReady] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const videoIdRef = useRef<string | null>(null);
  const suppressRef = useRef(false);
  const subRef = useRef<RealtimeChannel | null>(null);

  const send = useCallback(
    (payload: TvPayload) => {
      channel?.send({ type: "broadcast", event: "tv", payload }).catch(() => {});
    },
    [channel],
  );

  const handleState = useCallback(
    (state: number) => {
      if (suppressRef.current) {
        suppressRef.current = false;
        return;
      }
      if (state === 1) {
        send({ action: "play", t: playerRef.current?.getCurrentTime() ?? 0 });
      } else if (state === 2 || state === 0) {
        send({ action: "pause" });
      }
    },
    [send],
  );

  useEffect(() => {
    const start = () => {
      if (!window.YT?.Player || playerRef.current) return false;
      playerRef.current = new window.YT.Player("tv-frame", {
        videoId: "",
        playerVars: { controls: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            setReady(true);
            const pending = videoIdRef.current;
            if (pending) {
              suppressRef.current = true;
              playerRef.current?.loadVideoById(pending);
              playerRef.current?.pauseVideo();
            }
          },
          onStateChange: (e) => handleState(e.data),
        },
      });
      return true;
    };

    if (start()) return;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      start();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  }, [handleState]);

  useEffect(() => {
    if (!channel || subRef.current === channel) return;
    subRef.current = channel;
    channel.on("broadcast", { event: "tv" }, (payload) => {
      const m = payload.payload as TvPayload | undefined;
      const p = playerRef.current;
      if (!m || !m.action) return;
      if (m.action === "load") {
        videoIdRef.current = m.videoId;
        setVideoId(m.videoId);
        if (p) {
          suppressRef.current = true;
          p.loadVideoById(m.videoId);
          p.pauseVideo();
        }
      } else if (m.action === "play") {
        if (p) {
          suppressRef.current = true;
          if (typeof m.t === "number") p.seekTo(m.t, true);
          p.playVideo();
        }
      } else if (m.action === "pause") {
        if (p) {
          suppressRef.current = true;
          p.pauseVideo();
        }
      }
    });
  }, [channel]);

  function loadVideo() {
    const id = extractVideoId(url);
    if (!id) return;
    setUrl("");
    setVideoId(id);
    videoIdRef.current = id;
    send({ action: "load", videoId: id });
    const p = playerRef.current;
    if (p) {
      suppressRef.current = true;
      p.loadVideoById(id);
      p.pauseVideo();
    }
  }

  function resync() {
    const p = playerRef.current;
    if (!p) return;
    const t = p.getCurrentTime();
    suppressRef.current = true;
    p.pauseVideo();
    p.seekTo(t, true);
    p.playVideo();
    send({ action: "play", t });
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-black shadow-lg">
      <div className="relative min-h-0 flex-1">
        <div id="tv-frame" className="h-full w-full" />
        {(!videoId || !ready) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="text-4xl">🎬</span>
            <p className="text-sm text-neutral-500">
              {videoId
                ? "Loading video…"
                : "Nothing playing — paste a YouTube link and watch together."}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-800 bg-neutral-950 p-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadVideo();
          }}
          placeholder="YouTube link…"
          className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-neutral-600"
        />
        <button
          type="button"
          onClick={loadVideo}
          className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-300"
        >
          Load
        </button>
        {videoId && (
          <button
            type="button"
            onClick={resync}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-neutral-500"
          >
            Sync
          </button>
        )}
      </div>
    </div>
  );
}
