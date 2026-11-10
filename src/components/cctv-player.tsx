"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  RotateCw,
  Maximize2,
  Volume2,
  VolumeX,
  ExternalLink,
  AlertTriangle,
  Radio,
  Clock,
  ShieldCheck
} from "lucide-react";
import { Camera } from "@/lib/types";

interface CCTVPlayerProps {
  camera: Camera;
  autoPlay?: boolean;
  compact?: boolean;
  onStatusChange?: (id: string, status: "ONLINE" | "OFFLINE") => void;
}

function formatYoutubeEmbed(url: string): string {
  try {
    if (url.includes("youtube.com/embed/")) {
      return url.includes("?")
        ? `${url}&autoplay=1&mute=1`
        : `${url}?autoplay=1&mute=1`;
    }
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}?autoplay=1&mute=1`;
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "");
      return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`;
    }
  } catch {}
  return url;
}

export default function CCTVPlayer({
  camera,
  autoPlay = true,
  compact = false,
  onStatusChange
}: CCTVPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isVisible, setIsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [usingProxy, setUsingProxy] = useState(false);
  const [snapshotTick, setSnapshotTick] = useState(0);

  // Lazy visibility observer so offscreen players in Multi-View or long grids pause decoding
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          setIsVisible(entries[0].isIntersecting);
        }
      },
      { rootMargin: "200px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Reset proxy fallback when camera changes
  useEffect(() => {
    setUsingProxy(false);
    setRetryCount(0);
    setError(null);
    setLoading(true);
  }, [camera.id, camera.stream_url]);

  const effectiveStreamUrl = React.useMemo(() => {
    const raw = camera.stream_url;
    if (usingProxy && raw.startsWith("http")) {
      return `/api/proxy?url=${encodeURIComponent(raw)}`;
    }
    return raw;
  }, [camera.stream_url, usingProxy]);

  const reportStatus = useCallback(
    (status: "ONLINE" | "OFFLINE") => {
      onStatusChange?.(camera.id, status);
      fetch(`/api/cameras/${encodeURIComponent(camera.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      }).catch(() => {});
    },
    [camera.id, onStatusChange]
  );

  // Snapshot polling timer
  useEffect(() => {
    if (camera.protocol !== "SNAPSHOT" || !isVisible) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        setSnapshotTick((t) => t + 1);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [camera.protocol, isVisible]);

  // HLS & MP4 Video lifecycle
  useEffect(() => {
    if (!isVisible) return;
    if (camera.protocol !== "HLS" && camera.protocol !== "MP4") {
      setLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const watchdog = setTimeout(() => {
      if (cancelled) return;
      if (!usingProxy && camera.stream_url.startsWith("http")) {
        setUsingProxy(true);
      } else {
        setLoading(false);
        setError("Stream timeout — kamera sedang offline atau sibuk");
      }
    }, 22000);

    const cleanup = () => {
      clearTimeout(watchdog);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    if (camera.protocol === "HLS" && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 15,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 12000,
        fragLoadingTimeOut: 15000
      });
      hlsRef.current = hls;

      hls.loadSource(effectiveStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        clearTimeout(watchdog);
        setLoading(false);
        setError(null);
        reportStatus("ONLINE");
        if (autoPlay) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled) return;
        if (data.fatal) {
          clearTimeout(watchdog);
          if (!usingProxy && camera.stream_url.startsWith("http")) {
            hls.destroy();
            hlsRef.current = null;
            setUsingProxy(true);
            return;
          }
          if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            retryCount < 2
          ) {
            hls.recoverMediaError();
            return;
          }
          setLoading(false);
          setError("Stream tidak merespons (CORS / Offline pada server Dishub)");
        }
      });
    } else {
      // Native HLS (Safari) or MP4
      video.src = effectiveStreamUrl;
      const onLoaded = () => {
        if (cancelled) return;
        clearTimeout(watchdog);
        setLoading(false);
        setError(null);
        reportStatus("ONLINE");
        if (autoPlay) video.play().catch(() => {});
      };
      const onErr = () => {
        if (cancelled) return;
        clearTimeout(watchdog);
        if (!usingProxy && camera.stream_url.startsWith("http")) {
          setUsingProxy(true);
          return;
        }
        setLoading(false);
        setError("Gagal memuat video stream");
      };
      video.addEventListener("loadeddata", onLoaded);
      video.addEventListener("error", onErr);
      return () => {
        cancelled = true;
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("error", onErr);
        cleanup();
      };
    }

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    camera.id,
    camera.protocol,
    camera.stream_url,
    effectiveStreamUrl,
    usingProxy,
    retryCount,
    isVisible,
    autoPlay,
    reportStatus
  ]);

  const handleTogglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleRefresh = () => {
    setError(null);
    setLoading(true);
    setRetryCount((c) => c + 1);
  };

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative group w-full h-full min-h-[180px] bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800/80 flex flex-col justify-between select-none"
    >
      {/* Top Status & Attribution Overlay */}
      <div className="absolute top-0 inset-x-0 z-20 p-2.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-start justify-between gap-2 pointer-events-none">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                error
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : camera.status === "ONLINE"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-red-500/20 text-red-300 border border-red-500/40"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  error
                    ? "bg-amber-400"
                    : camera.status === "ONLINE"
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-red-400"
                }`}
              />
              {error ? "GANGGUAN" : camera.status === "ONLINE" ? "LIVE" : "OFFLINE"}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-300 text-[10px] font-mono border border-zinc-700/70">
              {camera.protocol}
              {usingProxy ? " • PROXY" : ""}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-zinc-100 truncate mt-1 drop-shadow">
            {camera.name}
          </h4>
          {!compact && (
            <p className="text-[11px] text-zinc-400 truncate">
              {camera.city_name}, {camera.province_name}
            </p>
          )}
        </div>
      </div>

      {/* Main Media Surface */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
        {!isVisible ? (
          <div className="text-xs text-zinc-500 flex flex-col items-center gap-1">
            <Radio className="w-5 h-5 text-zinc-600 animate-pulse" />
            <span>Menunggu di layar...</span>
          </div>
        ) : camera.protocol === "EMBED" ? (
          <iframe
            src={formatYoutubeEmbed(camera.stream_url)}
            title={camera.name}
            className="w-full h-full border-0 min-h-[180px]"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={() => setLoading(false)}
          />
        ) : camera.protocol === "MJPEG" || camera.protocol === "SNAPSHOT" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              camera.protocol === "SNAPSHOT"
                ? `${effectiveStreamUrl}${
                    effectiveStreamUrl.includes("?") ? "&" : "?"
                  }_t=${snapshotTick}`
                : effectiveStreamUrl
            }
            alt={camera.name}
            className="w-full h-full object-contain"
            onLoad={() => {
              setLoading(false);
              setError(null);
            }}
            onError={() => {
              if (!usingProxy && camera.stream_url.startsWith("http")) {
                setUsingProxy(true);
              } else {
                setLoading(false);
                setError("Gagal memuat frame MJPEG/Snapshot");
              }
            }}
          />
        ) : camera.protocol === "WEBSOCKET" ? (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <Radio className="w-8 h-8 text-emerald-400 mb-2 animate-pulse" />
            <p className="text-xs text-zinc-200 font-medium">
              Stream WebSocket JSMpeg ({camera.city_name})
            </p>
            <p className="text-[11px] text-zinc-400 mt-1 max-w-xs break-all font-mono">
              {camera.stream_url}
            </p>
            <a
              href={camera.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition"
            >
              <span>Buka Portal Resmi</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            playsInline
            muted={isMuted}
            autoPlay={autoPlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}

        {/* Loading Spinner Overlay */}
        {loading && !error && (
          <div className="absolute inset-0 z-10 bg-zinc-950/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-zinc-300 font-mono">
              Menghubungkan ke {camera.source_name}...
            </span>
          </div>
        )}

        {/* Error & Retry Overlay */}
        {error && (
          <div className="absolute inset-0 z-10 bg-zinc-950/90 p-4 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="w-7 h-7 text-amber-400 mb-1.5" />
            <p className="text-xs font-medium text-zinc-200 max-w-xs">
              {error}
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[260px]">
              Sumber: {camera.source_name}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Coba Lagi</span>
              </button>
              <a
                href={camera.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition"
              >
                <span>Portal Asli</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls & Attribution Bar */}
      <div className="z-20 px-2.5 py-1.5 bg-zinc-900/95 border-t border-zinc-800/80 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate" title={camera.source_name}>
            {camera.source_name}
          </span>
          {!compact && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-zinc-500 ml-1">
              <Clock className="w-3 h-3" />
              {new Date(camera.last_checked_at).toLocaleDateString("id-ID")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(camera.protocol === "HLS" || camera.protocol === "MP4") && (
            <>
              <button
                type="button"
                onClick={handleTogglePlay}
                title={isPlaying ? "Jeda" : "Putar"}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                title={isMuted ? "Suara Aktif" : "Bisukan"}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            title="Muat Ulang Stream"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={camera.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Sumber Resmi Pemerintah"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={handleFullscreen}
            title="Layar Penuh"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

