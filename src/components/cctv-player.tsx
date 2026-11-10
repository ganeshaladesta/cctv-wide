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
  ShieldCheck,
  Tv
} from "lucide-react";
import { Camera } from "@/lib/types";
import { FavoritesButton } from "@/components/motion-ui";

interface CCTVPlayerProps {
  camera: Camera;
  autoPlay?: boolean;
  compact?: boolean;
  onClose?: () => void;
  onStatusChange?: (id: string, status: "ONLINE" | "OFFLINE") => void;
}

function extractAmgChannelId(url: string): string | null {
  if (!url || !url.includes("stream.amg.id")) return null;
  const match = url.match(
    /(?:playersite_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match ? match[1] : null;
}

function formatEmbedUrl(url: string): string {
  try {
    if (url.includes("stream.amg.id")) {
      return url.includes("?")
        ? `${url}&autoplay=true&mute=true`
        : `${url}?autoplay=true&mute=true`;
    }
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

export function CCTVPlayer({
  camera,
  autoPlay = true,
  compact = false,
  onClose,
  onStatusChange
}: CCTVPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const amgChannelId = React.useMemo(
    () => extractAmgChannelId(camera.stream_url),
    [camera.stream_url]
  );

  // For AMG cameras (CCTV Sarinah), Direct HLS is the primary default playback mode, with Embed Resmi as an optional fallback
  const [amgMode, setAmgMode] = useState<"hls" | "embed">("hls");

  const [isVisible, setIsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [usingProxy, setUsingProxy] = useState(false);
  const [snapshotTick, setSnapshotTick] = useState(0);

  const activeProtocol = React.useMemo(() => {
    if (amgChannelId) {
      return amgMode === "hls" ? "HLS" : "EMBED";
    }
    return camera.protocol;
  }, [amgChannelId, amgMode, camera.protocol]);

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

  // Reset mode to Direct HLS when camera ID changes
  useEffect(() => {
    setAmgMode("hls");
  }, [camera.id]);

  // Reset proxy fallback when camera or mode changes
  useEffect(() => {
    setUsingProxy(false);
    setRetryCount(0);
    setError(null);
    setLoading(true);
  }, [camera.id, camera.stream_url, amgMode]);

  const effectiveStreamUrl = React.useMemo(() => {
    const raw = amgChannelId
      ? amgMode === "hls"
        ? `https://stream.amg.id/memfs/${amgChannelId}.m3u8`
        : `https://stream.amg.id/playersite_${amgChannelId}.html`
      : camera.stream_url;
    if (usingProxy && raw.startsWith("http") && activeProtocol !== "EMBED") {
      return `/api/proxy?url=${encodeURIComponent(raw)}`;
    }
    return raw;
  }, [camera.stream_url, amgChannelId, amgMode, usingProxy, activeProtocol]);

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

  // Verify actual live stream availability for EMBED cameras (such as AMG)
  useEffect(() => {
    if (!isVisible || activeProtocol !== "EMBED" || !amgChannelId) return;
    let cancelled = false;
    fetch(`https://stream.amg.id/memfs/${amgChannelId}.m3u8`)
      .then(async (res) => {
        const text = await res.text();
        if (cancelled) return;
        if (res.ok && text.includes("#EXTM3U")) {
          reportStatus("ONLINE");
        } else {
          setError("Stream AMG sedang offline");
          reportStatus("OFFLINE");
        }
      })
      .catch(() => {
        if (!cancelled) {
          reportStatus("OFFLINE");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isVisible, activeProtocol, amgChannelId, retryCount, reportStatus]);

  // Snapshot polling timer
  useEffect(() => {
    if (activeProtocol !== "SNAPSHOT" || !isVisible) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        setSnapshotTick((t) => t + 1);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [activeProtocol, isVisible]);

  // HLS & MP4 Video lifecycle
  useEffect(() => {
    if (!isVisible) return;
    if (activeProtocol !== "HLS" && activeProtocol !== "MP4") {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const watchdog = setTimeout(() => {
      if (cancelled) return;
      if (!usingProxy && effectiveStreamUrl.startsWith("http")) {
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

    if (activeProtocol === "HLS" && Hls.isSupported()) {
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
          if (!usingProxy && effectiveStreamUrl.startsWith("http")) {
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
          setError(
            "Stream tidak merespons (CORS / Offline pada server sumber)"
          );
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
        if (!usingProxy && effectiveStreamUrl.startsWith("http")) {
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
    activeProtocol,
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
      className="relative group w-full h-full min-h-[180px] aspect-video bg-[#07090D] rounded-xl overflow-hidden border border-[var(--border-default)] flex flex-col justify-between select-none"
    >
      {/* Top Status & Attribution Overlay */}
      <div className="absolute top-0 inset-x-0 z-20 p-2.5 bg-gradient-to-b from-black/85 via-black/45 to-transparent flex items-start justify-between gap-2 pointer-events-none">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
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
            <span className="px-1.5 py-0.5 rounded bg-[#0C1018]/90 text-[#E2E8F0] text-[10px] font-mono border border-[var(--border-default)]">
              {activeProtocol}
              {usingProxy ? " • PROXY" : ""}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-[#F3F6FB] truncate mt-1 drop-shadow">
            {camera.name}
          </h4>
          {!compact && (
            <p className="text-[11px] text-[#98A4B8] truncate">
              {camera.city_name}, {camera.province_name}
            </p>
          )}
        </div>

        {/* AMG Mode Switcher (Direct HLS Primary Default vs Embed Resmi Fallback) */}
        {amgChannelId && (
          <div
            data-testid="amg-playback-switcher"
            className="pointer-events-auto flex items-center gap-1 bg-[#090C12]/92 border border-[var(--border-default)] rounded-lg p-0.5"
          >
            <button
              type="button"
              data-testid="amg-mode-hls"
              aria-pressed={amgMode === "hls"}
              onClick={() => setAmgMode("hls")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                amgMode === "hls"
                  ? "bg-[#3B82F6] text-white"
                  : "text-[#98A4B8] hover:text-[#F3F6FB]"
              }`}
            >
              Direct HLS
            </button>
            <button
              type="button"
              data-testid="amg-mode-embed"
              aria-pressed={amgMode === "embed"}
              onClick={() => setAmgMode("embed")}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                amgMode === "embed"
                  ? "bg-[#3B82F6] text-white"
                  : "text-[#98A4B8] hover:text-[#F3F6FB]"
              }`}
            >
              Embed Resmi
            </button>
          </div>
        )}
      </div>

      {/* Main Media Surface */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
        {!isVisible ? (
          <div className="text-xs text-[#98A4B8] flex flex-col items-center gap-1">
            <Radio className="w-5 h-5 text-[#657287] animate-pulse" />
            <span>Menunggu di layar...</span>
          </div>
        ) : activeProtocol === "EMBED" ? (
          <iframe
            key={`${camera.id}-${retryCount}`}
            src={formatEmbedUrl(effectiveStreamUrl)}
            title={camera.name}
            loading="lazy"
            className="w-full h-full border-0 min-h-[180px] aspect-video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError("Gagal memuat player embed resmi");
            }}
          />
        ) : activeProtocol === "MJPEG" || activeProtocol === "SNAPSHOT" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              activeProtocol === "SNAPSHOT"
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
              if (!usingProxy && effectiveStreamUrl.startsWith("http")) {
                setUsingProxy(true);
              } else {
                setLoading(false);
                setError("Gagal memuat frame MJPEG/Snapshot");
              }
            }}
          />
        ) : activeProtocol === "WEBSOCKET" ? (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <Radio className="w-8 h-8 text-[#10B981] mb-2 animate-pulse" />
            <p className="text-xs text-[#F3F6FB] font-medium">
              Stream WebSocket JSMpeg ({camera.city_name})
            </p>
            <p className="text-[11px] text-[#98A4B8] mt-1 max-w-xs break-all font-mono">
              {camera.stream_url}
            </p>
            <a
              href={camera.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#60A5FA] text-xs font-semibold text-white transition-colors"
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
          <div className="absolute inset-0 z-10 bg-[#07090D]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
            <div className="w-7 h-7 border-2 border-[#3B82F6] border-t-white rounded-full animate-spin" />
            <span className="text-[11px] text-[#E2E8F0] font-mono">
              Menghubungkan ke {camera.source_name}...
            </span>
          </div>
        )}

        {/* Error & Retry Overlay */}
        {error && (
          <div className="absolute inset-0 z-10 bg-[#07090D]/92 p-4 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="w-7 h-7 text-[#F59E0B] mb-1.5" />
            <p className="text-xs font-medium text-[#F3F6FB] max-w-xs">
              {error}
            </p>
            <p className="text-[10px] text-[#98A4B8] mt-0.5 truncate max-w-[260px]">
              Sumber: {camera.source_name}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#3B82F6] hover:bg-[#60A5FA] text-white text-xs font-medium transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Coba Lagi</span>
              </button>
              {amgChannelId && amgMode === "hls" && (
                <button
                  type="button"
                  onClick={() => setAmgMode("embed")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] text-[#E2E8F0] text-xs transition-colors"
                >
                  <Tv className="w-3 h-3" />
                  <span>Gunakan Embed Resmi</span>
                </button>
              )}
              <a
                href={camera.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] text-[#E2E8F0] text-xs transition-colors"
              >
                <span>Portal Asli</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls & Attribution Bar */}
      <div className="z-20 px-2.5 py-1.5 bg-[#0C1018]/95 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[11px] text-[#98A4B8]">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <ShieldCheck className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
          <span className="truncate" title={camera.source_name}>
            Sumber: {camera.source_name}
          </span>
          {!compact && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#657287] ml-1">
              <Clock className="w-3 h-3" />
              {new Date(camera.last_checked_at).toLocaleDateString("id-ID")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <FavoritesButton
            cameraId={camera.id}
            cameraName={camera.name}
            size="sm"
          />
          {(activeProtocol === "HLS" || activeProtocol === "MP4") && (
            <>
              <button
                type="button"
                onClick={handleTogglePlay}
                title={isPlaying ? "Jeda" : "Putar"}
                aria-label={isPlaying ? "Jeda" : "Putar"}
                className="p-1 rounded-md hover:bg-white/[0.08] text-[#E2E8F0] hover:text-white transition-colors"
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
                aria-label={isMuted ? "Suara Aktif" : "Bisukan"}
                className="p-1 rounded-md hover:bg-white/[0.08] text-[#E2E8F0] hover:text-white transition-colors"
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
            aria-label="Muat Ulang Stream"
            className="p-1 rounded-md hover:bg-white/[0.08] text-[#E2E8F0] hover:text-white transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={camera.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Sumber Resmi"
            aria-label="Sumber Resmi"
            className="p-1 rounded-md hover:bg-white/[0.08] text-[#E2E8F0] hover:text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={handleFullscreen}
            title="Layar Penuh"
            aria-label="Layar Penuh"
            className="p-1 rounded-md hover:bg-white/[0.08] text-[#E2E8F0] hover:text-white transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Tutup"
              aria-label="Tutup pemutar"
              className="px-2 py-0.5 rounded-md bg-[#161C2B] hover:bg-[#1C2436] text-[#E2E8F0] text-[10px] font-semibold transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const CameraVideoPlayer = CCTVPlayer;
export default CCTVPlayer;
