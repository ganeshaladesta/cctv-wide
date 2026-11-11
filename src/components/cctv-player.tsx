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
import { FavoritesButton } from "@/components/motion-ui";
import {
  isTokenExchangeWrapperUrl,
  normalizeLegacyStreamUrl
} from "@/lib/stream-url";

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

  const [isVisible, setIsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [usingProxy, setUsingProxy] = useState(false);
  const [snapshotTick, setSnapshotTick] = useState(0);
  const [isHttpsPage, setIsHttpsPage] = useState(false);

  useEffect(() => {
    setIsHttpsPage(window.location.protocol === "https:");
  }, []);

  // AMG Sarinah cameras permanently use Direct HLS; other providers preserve camera.protocol
  const activeProtocol = React.useMemo(
    () => (amgChannelId ? "HLS" : camera.protocol),
    [amgChannelId, camera.protocol]
  );

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

  const rawStreamUrl = React.useMemo(() => {
    return amgChannelId
      ? `https://stream.amg.id/memfs/${amgChannelId}.m3u8`
      : normalizeLegacyStreamUrl(camera.stream_url, camera.source_url);
  }, [camera.stream_url, camera.source_url, amgChannelId]);

  const requiresManifestWrapperProxy = React.useMemo(
    () => activeProtocol === "HLS" && isTokenExchangeWrapperUrl(rawStreamUrl),
    [activeProtocol, rawStreamUrl]
  );

  const isMixedContentBlocked =
    isHttpsPage &&
    rawStreamUrl.startsWith("http://") &&
    activeProtocol !== "WEBSOCKET";

  const effectiveStreamUrl = React.useMemo(() => {
    // Only manifest-only CORS/token-wrapper resolution or static snapshots may use /api/proxy;
    // binary .ts/.m4s segments, MP4, and continuous MJPEG always load directly from the provider.
    const allowProxy =
      activeProtocol === "SNAPSHOT" ||
      (activeProtocol === "HLS" && (usingProxy || requiresManifestWrapperProxy));
    if (allowProxy && rawStreamUrl.startsWith("https://")) {
      return `/api/proxy?url=${encodeURIComponent(rawStreamUrl)}`;
    }
    return rawStreamUrl;
  }, [rawStreamUrl, usingProxy, requiresManifestWrapperProxy, activeProtocol]);

  const reportStatus = useCallback(
    (status: "ONLINE" | "OFFLINE") => {
      if (status !== camera.status) {
        onStatusChange?.(camera.id, status);
      }
    },
    [camera.id, camera.status, onStatusChange]
  );

  // Stop background loading indicator immediately when browser Mixed Content blocks HTTP-only streams
  useEffect(() => {
    if (isMixedContentBlocked) {
      setLoading(false);
      setError(
        "Stream HTTP tidak didukung di halaman HTTPS (Mixed Content) — gunakan tautan langsung atau portal resmi."
      );
    }
  }, [isMixedContentBlocked]);
  // Snapshot polling timer
  useEffect(() => {
    if (activeProtocol !== "SNAPSHOT" || !isVisible || isMixedContentBlocked) {
      return;
    }
    const interval = setInterval(() => {
      if (!document.hidden) {
        setSnapshotTick((t) => t + 1);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [activeProtocol, isVisible, isMixedContentBlocked]);

  // HLS & MP4 Video lifecycle (Direct HLS first; never auto-proxy slow streams or binary video)
  useEffect(() => {
    if (!isVisible || isMixedContentBlocked) return;
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
      setLoading(false);
      setError("Stream timeout — server kamera sedang offline atau sibuk");
    }, 18000);

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
        manifestLoadingMaxRetry: 1,
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
          // Only retry through /api/proxy (manifest-only, direct .ts/.m4s segments)
          // when manifest loading/parsing hits CORS, never for segment errors or slow timeouts.
          const isManifestCorsOrParse =
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR;
          if (
            !usingProxy &&
            !requiresManifestWrapperProxy &&
            isManifestCorsOrParse &&
            rawStreamUrl.startsWith("https://")
          ) {
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
      // Native HLS (Safari) or MP4 — direct provider playback only (never proxy MP4 video)
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
        setLoading(false);
        setError("Gagal memuat video stream secara langsung dari sumber");
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
    rawStreamUrl,
    usingProxy,
    requiresManifestWrapperProxy,
    isMixedContentBlocked,
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
          isMixedContentBlocked ? null : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={
                activeProtocol === "SNAPSHOT"
                  ? `${effectiveStreamUrl}${
                      effectiveStreamUrl.includes("?") ? "&" : "?"
                    }_t=${snapshotTick}`
                  : rawStreamUrl
              }
              alt={camera.name}
              className="w-full h-full object-contain"
              onLoad={() => {
                setLoading(false);
                setError(null);
              }}
              onError={() => {
                // Only allow single snapshot proxy fallback; NEVER proxy continuous MJPEG streams
                if (
                  activeProtocol === "SNAPSHOT" &&
                  !usingProxy &&
                  rawStreamUrl.startsWith("https://")
                ) {
                  setUsingProxy(true);
                } else {
                  setLoading(false);
                  setError(
                    activeProtocol === "MJPEG"
                      ? "Stream MJPEG tidak dapat dimuat langsung — silakan buka sumber atau portal resmi."
                      : "Gagal memuat frame Snapshot"
                  );
                }
              }}
            />
          )
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
              {rawStreamUrl.startsWith("http") && (
                <a
                  href={rawStreamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] text-[#E2E8F0] text-xs transition-colors"
                >
                  <span>Buka Stream Langsung</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
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
