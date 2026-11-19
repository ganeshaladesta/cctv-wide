/**
 * SCC - EAGLE EYES: CCTV Stream Health Monitor & Automatic Recovery
 *
 * Provides per-camera real-time progression monitoring, frozen frame detection,
 * stream classification, and tiered self-healing without page reloads.
 *
 * Solves:
 * 1. Frozen video frames where the scene stops updating while stream is expected to be active.
 * 2. Static CCTV scene preservation (never falsely flags a static scene as frozen).
 * 3. HLS sliding window playlist stalls and decoder hangs.
 * 4. Isolated camera-level recovery with exponential backoff and telemetry logging.
 */

export type StreamClassification =
  | "LIVE"
  | "BUFFERING"
  | "STALE"
  | "RECOVERING"
  | "OFFLINE"
  | "PAUSED";

export type FailureClassification =
  | "STALE_FRAMES"
  | "PLAYLIST_STALLED"
  | "DECODER_STALL"
  | "BUFFER_TIMEOUT"
  | "HLS_MEDIA_ERROR"
  | "NETWORK_STALL"
  | "UNKNOWN";

export type RecoveryMethod =
  | "NUDGE_LIVE_EDGE"
  | "RECOVER_MEDIA_ERROR"
  | "PIPELINE_RELOAD"
  | "REINIT_HLS";

export type RecoveryResult = "SUCCESS" | "FAILED" | "OFFLINE";

export interface RecoveryLogEntry {
  id: string;
  timestamp: string;
  cameraId: string;
  provider: string;
  failureClassification: FailureClassification;
  timeFrozenMs: number;
  recoveryMethod: RecoveryMethod;
  attemptNumber: number;
  recoveryResult: RecoveryResult;
  timeToResumeMs?: number;
}

export interface StreamMonitorConfig {
  /** Milliseconds without new decoded frames or time progression before STALE (default: 8000) */
  staleThresholdMs: number;
  /** Milliseconds in waiting/buffering state before BUFFER_TIMEOUT (default: 5000) */
  bufferingTimeoutMs: number;
  /** Milliseconds without HLS media-sequence advancement before PLAYLIST_STALLED (default: 15000) */
  playlistStallThresholdMs: number;
  /** Interval in ms to run health checks (default: 1000) */
  checkIntervalMs: number;
  /** Maximum consecutive recovery attempts before declaring OFFLINE (default: 4) */
  maxRecoveryAttempts: number;
  /** Base backoff delay in ms (default: 1000) */
  baseBackoffMs: number;
  /** Maximum backoff delay in ms (default: 8000) */
  maxBackoffMs: number;
  /** Milliseconds of stable playback before clearing recovery attempt counter (default: 10000) */
  stabilizationPeriodMs: number;
  /** Observation window in ms to verify recovery outcome (default: 1500) */
  recoveryObservationMs: number;
}

export const DEFAULT_STREAM_MONITOR_CONFIG: StreamMonitorConfig = {
  staleThresholdMs: 8000,
  bufferingTimeoutMs: 5000,
  playlistStallThresholdMs: 15000,
  checkIntervalMs: 1000,
  maxRecoveryAttempts: 4,
  baseBackoffMs: 1000,
  maxBackoffMs: 8000,
  stabilizationPeriodMs: 10000,
  recoveryObservationMs: 1500
};

// Global in-memory ring buffer for recovery audit logs (last 100 records)
const MAX_GLOBAL_LOGS = 100;
const globalRecoveryLogs: RecoveryLogEntry[] = [];

export function recordRecoveryLog(entry: Omit<RecoveryLogEntry, "id" | "timestamp">): RecoveryLogEntry {
  const fullEntry: RecoveryLogEntry = {
    ...entry,
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString()
  };

  globalRecoveryLogs.unshift(fullEntry);
  if (globalRecoveryLogs.length > MAX_GLOBAL_LOGS) {
    globalRecoveryLogs.length = MAX_GLOBAL_LOGS;
  }

  // Sanitized console observability (NEVER print stream URLs, tokens or keys)
  if (typeof console !== "undefined") {
    console.log(
      `[CCTV-RECOVERY] Camera: ${fullEntry.cameraId} | Provider: ${fullEntry.provider} | ` +
      `Failure: ${fullEntry.failureClassification} | Method: ${fullEntry.recoveryMethod} | ` +
      `Attempt: ${fullEntry.attemptNumber} | Result: ${fullEntry.recoveryResult}` +
      (fullEntry.timeToResumeMs ? ` | ResumedIn: ${fullEntry.timeToResumeMs}ms` : "")
    );
  }

  return fullEntry;
}

export function getRecoveryLogs(cameraId?: string): RecoveryLogEntry[] {
  if (!cameraId) return [...globalRecoveryLogs];
  return globalRecoveryLogs.filter((log) => log.cameraId === cameraId);
}

export function clearRecoveryLogs(): void {
  globalRecoveryLogs.length = 0;
}

export interface StreamMonitorCallbacks {
  onClassificationChange?: (classification: StreamClassification) => void;
  onRecoveryLog?: (log: RecoveryLogEntry) => void;
  onReinitRequired?: (reason: string) => Promise<boolean> | boolean;
}

/**
 * Controller that attaches to a specific video element and HLS instance to detect
 * freezes and manage automatic recovery.
 */
export class CCTVStreamMonitor {
  private cameraId: string;
  private provider: string;
  private video: HTMLVideoElement | null = null;
  private hls: any = null; // Hls.js instance if applicable
  private config: StreamMonitorConfig;
  private callbacks: StreamMonitorCallbacks;

  // Lifecycle & Health Tracking
  private classification: StreamClassification = "BUFFERING";
  private isRunning: boolean = false;
  private checkTimer: any = null;
  private rVFCId: number | null = null;
  private supportsRVFC: boolean = false;

  // Frame Progression & Decoder Signals
  private presentedFramesCount: number = 0;
  private lastDecodedFrameTime: number = 0;
  private lastCurrentTime: number = -1;
  private lastProgressionTime: number = 0;
  private lastPlaybackEventTime: number = 0;

  // Buffering Signals
  private isBuffering: boolean = false;
  private bufferingStartTime: number = 0;

  // HLS Signals
  private lastMediaSequence: number | null = null;
  private lastSequenceUpdateTime: number = 0;
  private lastFragLoadedTime: number = 0;
  private lastFragDownloadDurationMs: number = 0;
  private consecutiveLevelStalls: number = 0;

  // Recovery State Machine
  private isRecovering: boolean = false;
  private recoveryAttempts: number = 0;
  private freezeStartTime: number = 0;
  private stablePlaybackStartTime: number = 0;
  private userPaused: boolean = false;
  private isVisible: boolean = true;
  private activeRecoveryMethod: RecoveryMethod = "NUDGE_LIVE_EDGE";
  private activeRecoveryFailure: FailureClassification = "STALE_FRAMES";
  private activeRecoveryFrozenMs: number = 0;
  private activeRecoveryAttempt: number = 0;
  private activeRecoveryStartTime: number = 0;
  private recoveryCheckTimer: any = null;

  // Event Listeners references for clean teardown
  private boundOnPlaying: () => void;
  private boundOnWaiting: () => void;
  private boundOnStalled: () => void;
  private boundOnError: (e: any) => void;
  private boundOnTimeUpdate: () => void;
  private boundOnPause: () => void;
  private boundOnPlay: () => void;

  constructor(
    cameraId: string,
    provider: string,
    config: Partial<StreamMonitorConfig> = {},
    callbacks: StreamMonitorCallbacks = {}
  ) {
    this.cameraId = cameraId;
    this.provider = provider;
    this.config = { ...DEFAULT_STREAM_MONITOR_CONFIG, ...config };
    this.callbacks = callbacks;

    this.boundOnPlaying = this.handlePlaying.bind(this);
    this.boundOnWaiting = this.handleWaiting.bind(this);
    this.boundOnStalled = this.handleStalled.bind(this);
    this.boundOnError = this.handleError.bind(this);
    this.boundOnTimeUpdate = this.handleTimeUpdate.bind(this);
    this.boundOnPause = this.handlePause.bind(this);
    this.boundOnPlay = this.handlePlay.bind(this);
  }

  /**
   * Attach video element and initiate rVFC / event listeners
   */
  public attachVideo(video: HTMLVideoElement): void {
    if (this.video === video) return;
    this.detachVideo();

    this.video = video;
    this.supportsRVFC = typeof video.requestVideoFrameCallback === "function";

    video.addEventListener("playing", this.boundOnPlaying);
    video.addEventListener("waiting", this.boundOnWaiting);
    video.addEventListener("stalled", this.boundOnStalled);
    video.addEventListener("error", this.boundOnError);
    video.addEventListener("timeupdate", this.boundOnTimeUpdate);
    video.addEventListener("pause", this.boundOnPause);
    video.addEventListener("play", this.boundOnPlay);

    const now = performance.now();
    this.lastProgressionTime = now;
    this.lastDecodedFrameTime = now;
    this.lastPlaybackEventTime = now;
    this.lastCurrentTime = video.currentTime;

    if (this.supportsRVFC) {
      this.scheduleNextVideoFrameCallback();
    }
  }

  /**
   * Detach video element and cleanup listeners
   */
  public detachVideo(): void {
    if (this.rVFCId !== null && this.video && typeof this.video.cancelVideoFrameCallback === "function") {
      try {
        this.video.cancelVideoFrameCallback(this.rVFCId);
      } catch {}
      this.rVFCId = null;
    }

    if (this.video) {
      this.video.removeEventListener("playing", this.boundOnPlaying);
      this.video.removeEventListener("waiting", this.boundOnWaiting);
      this.video.removeEventListener("stalled", this.boundOnStalled);
      this.video.removeEventListener("error", this.boundOnError);
      this.video.removeEventListener("timeupdate", this.boundOnTimeUpdate);
      this.video.removeEventListener("pause", this.boundOnPause);
      this.video.removeEventListener("play", this.boundOnPlay);
      this.video = null;
    }
  }

  /**
   * Attach HLS.js instance to inspect playlist sequences, fragment events, and errors
   */
  public attachHls(hls: any): void {
    this.hls = hls;
    if (!hls || typeof hls.on !== "function") return;

    try {
      // LEVEL_UPDATED: inspect mediaSequence progression
      hls.on("hlsLevelUpdated", (_event: string, data: any) => {
        if (!data || !data.details) return;
        const details = data.details;
        const now = performance.now();

        if (details.live) {
          const currentSeq = details.mediaSequence;
          if (this.lastMediaSequence !== null && currentSeq === this.lastMediaSequence) {
            this.consecutiveLevelStalls++;
          } else {
            this.consecutiveLevelStalls = 0;
            this.lastMediaSequence = currentSeq;
            this.lastSequenceUpdateTime = now;
          }
        } else {
          this.lastSequenceUpdateTime = now;
        }
      });

      // FRAG_LOADED: track fragment load duration and arrival
      hls.on("hlsFragLoaded", (_event: string, data: any) => {
        const now = performance.now();
        this.lastFragLoadedTime = now;
        if (data?.frag?.stats?.loading) {
          const loadStats = data.frag.stats.loading;
          this.lastFragDownloadDurationMs = Math.max(0, (loadStats.end || now) - (loadStats.start || now));
        }
      });
    } catch {}
  }

  public detachHls(): void {
    this.hls = null;
  }

  /**
   * Start health monitoring loop
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const now = performance.now();
    this.lastDecodedFrameTime = now;
    this.lastProgressionTime = now;
    this.lastSequenceUpdateTime = 0;
    this.lastFragLoadedTime = 0;

    if (this.supportsRVFC && this.video && this.rVFCId === null) {
      this.scheduleNextVideoFrameCallback();
    }

    this.checkTimer = setInterval(() => {
      this.runHealthCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop health monitoring loop
   */
  public stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    if (this.recoveryCheckTimer) {
      clearTimeout(this.recoveryCheckTimer);
      this.recoveryCheckTimer = null;
    }
    this.detachVideo();
    this.detachHls();
  }

  public setVisibility(visible: boolean): void {
    this.isVisible = visible;
    if (!visible) {
      this.setClassification("PAUSED");
    }
  }

  public setUserPaused(paused: boolean): void {
    this.userPaused = paused;
    if (paused) {
      this.setClassification("PAUSED");
    }
  }

  /**
   * Request Video Frame Callback loop
   * Note: This fires on EVERY frame composited by the browser engine.
   * A camera showing a 100% static scene (e.g. empty dark room) STILL fires rVFC at 15-30fps.
   * This guarantees static scenes are NEVER falsely classified as frozen.
   */
  private scheduleNextVideoFrameCallback(): void {
    if (!this.supportsRVFC || !this.video || !this.isRunning) return;

    try {
      this.rVFCId = this.video.requestVideoFrameCallback((_now, metadata) => {
        this.presentedFramesCount = metadata.presentedFrames || this.presentedFramesCount + 1;
        this.lastDecodedFrameTime = performance.now();
        this.lastProgressionTime = this.lastDecodedFrameTime;

        // If we were recovering and frames started presenting again:
        if (this.isRecovering) {
          this.handleRecoverySuccess();
        } else if (this.classification !== "LIVE" && !this.userPaused && this.isVisible) {
          this.setClassification("LIVE");
        }

        if (this.isRunning && this.video) {
          this.scheduleNextVideoFrameCallback();
        }
      });
    } catch {
      this.supportsRVFC = false;
    }
  }

  /**
   * Periodic health check evaluating frame progression, HLS sequences, and readyState
   */
  private runHealthCheck(): void {
    if (!this.isRunning || !this.video) return;

    // If intentionally paused by user or hidden offscreen, do not trigger stale alerts
    if (this.userPaused || !this.isVisible) {
      if (this.classification !== "PAUSED") {
        this.setClassification("PAUSED");
      }
      return;
    }

    // If already offline (max attempts exhausted), stay offline until explicit retry
    if (this.classification === "OFFLINE") {
      return;
    }

    const now = performance.now();
    const video = this.video;

    // Check currentTime progression (vital fallback when rVFC is unsupported or as secondary verification)
    const currentVideoTime = video.currentTime;
    if (currentVideoTime !== this.lastCurrentTime && !video.paused) {
      this.lastCurrentTime = currentVideoTime;
      this.lastProgressionTime = now;
      if (!this.supportsRVFC) {
        this.lastDecodedFrameTime = now;
      }
    }

    // Calculate time elapsed since last verified frame presentation or progression
    const timeSinceLastFrame = now - this.lastDecodedFrameTime;
    const timeSinceLastProgression = now - this.lastProgressionTime;

    // Active Playback Progression Check:
    // If frames or progression happened recently, stream is healthy
    const isActivelyProgressing =
      timeSinceLastFrame < this.config.staleThresholdMs ||
      timeSinceLastProgression < this.config.staleThresholdMs;

    if (isActivelyProgressing && !this.isBuffering && !this.isRecovering) {
      if (this.classification !== "LIVE") {
        this.setClassification("LIVE");
      }

      // Check for stable playback to reset backoff attempt counter
      if (this.stablePlaybackStartTime === 0) {
        this.stablePlaybackStartTime = now;
      } else if (now - this.stablePlaybackStartTime > this.config.stabilizationPeriodMs) {
        if (this.recoveryAttempts > 0) {
          this.recoveryAttempts = 0;
        }
      }
      return;
    }

    this.stablePlaybackStartTime = 0;

    // If currently recovering, wait for recovery grace window
    if (this.isRecovering) {
      return;
    }

    // Check for Buffering vs Stale
    if (this.isBuffering) {
      const bufferingDuration = now - this.bufferingStartTime;
      if (bufferingDuration < this.config.bufferingTimeoutMs) {
        if (this.classification !== "BUFFERING") {
          this.setClassification("BUFFERING");
        }
        return; // normal temporary buffer wait
      }
    }

    // At this point: no new frames or progression for >= staleThresholdMs (e.g. 8s).
    // Diagnose exact failure classification:
    const failureType = this.diagnoseFailure(now);

    this.freezeStartTime = this.freezeStartTime || (now - Math.min(timeSinceLastFrame, timeSinceLastProgression));
    const timeFrozenMs = Math.round(now - this.freezeStartTime);

    this.setClassification("STALE");
    this.executeTieredRecovery(failureType, timeFrozenMs);
  }

  /**
   * Distinguish between stale frames, stalled HLS playlist, decoder stall, or network timeout
   */
  private diagnoseFailure(now: number): FailureClassification {
    // 1. HLS Playlist Sequence Stalled:
    // In live HLS, media sequence must advance. If consecutive level refreshes have identical mediaSequence
    // or mediaSequence hasn't updated beyond the threshold:
    if (
      this.hls &&
      (this.consecutiveLevelStalls >= 1 ||
        (this.lastSequenceUpdateTime > 0 && now - this.lastSequenceUpdateTime > this.config.playlistStallThresholdMs))
    ) {
      return "PLAYLIST_STALLED";
    }

    // 2. Decoder Stall:
    // HLS fragments are downloading successfully (recent frag load), but video frames are not presenting:
    if (this.lastFragLoadedTime > 0 && now - this.lastFragLoadedTime < 4000) {
      return "DECODER_STALL";
    }

    // 3. Buffer Timeout:
    if (this.isBuffering && now - this.bufferingStartTime >= this.config.bufferingTimeoutMs) {
      return "BUFFER_TIMEOUT";
    }

    // 4. Stale Frames:
    return "STALE_FRAMES";
  }

  /**
   * Execute Tiered Automatic Recovery (Least disruptive first -> Escalation -> Reinit -> Backoff)
   */
  private async executeTieredRecovery(
    failure: FailureClassification,
    timeFrozenMs: number
  ): Promise<void> {
    if (this.isRecovering) return;
    this.isRecovering = true;
    this.setClassification("RECOVERING");

    this.recoveryAttempts++;
    const currentAttempt = this.recoveryAttempts;

    // If max attempts exceeded, declare OFFLINE and stop infinite retry loop
    if (currentAttempt > this.config.maxRecoveryAttempts) {
      this.isRecovering = false;
      this.setClassification("OFFLINE");

      const log = recordRecoveryLog({
        cameraId: this.cameraId,
        provider: this.provider,
        failureClassification: failure,
        timeFrozenMs,
        recoveryMethod: "REINIT_HLS",
        attemptNumber: currentAttempt,
        recoveryResult: "OFFLINE"
      });
      this.callbacks.onRecoveryLog?.(log);
      return;
    }

    // Calculate exponential backoff delay: base * 1.5^(attempt - 1), capped at maxBackoffMs
    const backoffDelay = Math.min(
      this.config.maxBackoffMs,
      Math.round(this.config.baseBackoffMs * Math.pow(1.5, currentAttempt - 1))
    );

    // Determine recovery method based on attempt tier and failure type
    let method: RecoveryMethod;
    if (currentAttempt === 1 && failure !== "PLAYLIST_STALLED") {
      method = "NUDGE_LIVE_EDGE";
    } else if (currentAttempt === 2 && this.hls) {
      method = "RECOVER_MEDIA_ERROR";
    } else if (currentAttempt === 3 && this.hls) {
      method = "PIPELINE_RELOAD";
    } else {
      method = "REINIT_HLS";
    }

    this.activeRecoveryMethod = method;
    this.activeRecoveryFailure = failure;
    this.activeRecoveryFrozenMs = timeFrozenMs;
    this.activeRecoveryAttempt = currentAttempt;
    this.activeRecoveryStartTime = performance.now();

    try {
      await this.applyRecoveryAction(method);

      if (this.recoveryCheckTimer) {
        clearTimeout(this.recoveryCheckTimer);
      }

      this.recoveryCheckTimer = setTimeout(() => {
        if (!this.isRunning || !this.video) return;

        const now = performance.now();
        // A recovery is only successful if fresh frames or progress occurred AFTER recovery was triggered
        const hasResumed =
          this.lastDecodedFrameTime >= this.activeRecoveryStartTime ||
          this.lastProgressionTime >= this.activeRecoveryStartTime + 50;

        if (hasResumed) {
          const timeToResumeMs = Math.round(now - this.activeRecoveryStartTime);
          this.handleRecoverySuccess(
            this.activeRecoveryMethod,
            this.activeRecoveryFailure,
            this.activeRecoveryFrozenMs,
            this.activeRecoveryAttempt,
            timeToResumeMs
          );
        } else {
          // Failed attempt: record log and prepare for next health check interval
          this.isRecovering = false;
          const log = recordRecoveryLog({
            cameraId: this.cameraId,
            provider: this.provider,
            failureClassification: this.activeRecoveryFailure,
            timeFrozenMs: this.activeRecoveryFrozenMs,
            recoveryMethod: this.activeRecoveryMethod,
            attemptNumber: this.activeRecoveryAttempt,
            recoveryResult: "FAILED"
          });
          this.callbacks.onRecoveryLog?.(log);

          // If this was reinit or pipeline reload, remain in STALE so next tick escalates or completes backoff
          this.setClassification("STALE");
        }
      }, Math.max(this.config.recoveryObservationMs, backoffDelay));
    } catch {
      this.isRecovering = false;
      this.setClassification("STALE");
    }
  }

  /**
   * Action implementation per recovery tier
   */
  private async applyRecoveryAction(method: RecoveryMethod): Promise<void> {
    const video = this.video;
    if (!video) return;

    switch (method) {
      case "NUDGE_LIVE_EDGE": {
        // Tier 1: Non-disruptive nudge. Jump to live edge or nudge currentTime forward 0.1s
        if (this.hls && typeof this.hls.liveSyncPosition === "number" && this.hls.liveSyncPosition > 0) {
          const liveTarget = this.hls.liveSyncPosition;
          if (Math.abs(video.currentTime - liveTarget) > 1.0) {
            video.currentTime = liveTarget;
          } else {
            video.currentTime += 0.1;
          }
        } else if (video.buffered.length > 0) {
          const end = video.buffered.end(video.buffered.length - 1);
          video.currentTime = Math.max(0, end - 0.5);
        } else {
          video.currentTime += 0.1;
        }

        if (video.paused && !this.userPaused) {
          video.play().catch(() => {});
        }
        break;
      }

      case "RECOVER_MEDIA_ERROR": {
        // Tier 2: HLS Media Error recovery / Decoder pipeline flush
        if (this.hls && typeof this.hls.recoverMediaError === "function") {
          this.hls.recoverMediaError();
        } else if (video.paused && !this.userPaused) {
          video.play().catch(() => {});
        }
        break;
      }

      case "PIPELINE_RELOAD": {
        // Tier 3: Soft restart of HLS loading pipeline without full DOM destruction
        if (this.hls && typeof this.hls.stopLoad === "function" && typeof this.hls.startLoad === "function") {
          this.hls.stopLoad();
          const syncPos = typeof this.hls.liveSyncPosition === "number" ? this.hls.liveSyncPosition : -1;
          this.hls.startLoad(syncPos);
        }
        break;
      }

      case "REINIT_HLS": {
        // Tier 4: Clean re-instantiation of HLS instance
        if (this.callbacks.onReinitRequired) {
          await this.callbacks.onReinitRequired("STALE_STREAM_TIMEOUT");
        }
        break;
      }
    }
  }

  private handleRecoverySuccess(
    method?: RecoveryMethod,
    failure?: FailureClassification,
    timeFrozenMs?: number,
    attempt?: number,
    timeToResumeMs?: number
  ): void {
    if (this.recoveryCheckTimer) {
      clearTimeout(this.recoveryCheckTimer);
      this.recoveryCheckTimer = null;
    }

    const resolvedMethod = method || this.activeRecoveryMethod;
    const resolvedFailure = failure || this.activeRecoveryFailure;
    const resolvedFrozenMs = timeFrozenMs !== undefined ? timeFrozenMs : this.activeRecoveryFrozenMs;
    const resolvedAttempt = attempt !== undefined ? attempt : (this.activeRecoveryAttempt || 1);
    const resolvedTimeToResume =
      timeToResumeMs !== undefined
        ? timeToResumeMs
        : (this.activeRecoveryStartTime > 0 ? Math.round(performance.now() - this.activeRecoveryStartTime) : 350);

    this.isRecovering = false;
    this.freezeStartTime = 0;
    this.setClassification("LIVE");

    const log = recordRecoveryLog({
      cameraId: this.cameraId,
      provider: this.provider,
      failureClassification: resolvedFailure,
      timeFrozenMs: resolvedFrozenMs,
      recoveryMethod: resolvedMethod,
      attemptNumber: resolvedAttempt,
      recoveryResult: "SUCCESS",
      timeToResumeMs: resolvedTimeToResume
    });
    this.callbacks.onRecoveryLog?.(log);
  }

  private setClassification(newClass: StreamClassification): void {
    if (this.classification !== newClass) {
      this.classification = newClass;
      this.callbacks.onClassificationChange?.(newClass);
    }
  }

  // --- HTMLVideoElement Event Handlers ---

  private handlePlaying(): void {
    this.isBuffering = false;
    this.bufferingStartTime = 0;
    const now = performance.now();
    this.lastPlaybackEventTime = now;
    this.lastProgressionTime = now;
    if (!this.userPaused && this.isVisible && !this.isRecovering) {
      this.setClassification("LIVE");
    }
  }

  private handleWaiting(): void {
    this.isBuffering = true;
    this.bufferingStartTime = performance.now();
    if (!this.isRecovering && !this.userPaused && this.isVisible) {
      this.setClassification("BUFFERING");
    }
  }

  private handleStalled(): void {
    // Network stalled, mark buffering if not already
    if (!this.isBuffering) {
      this.isBuffering = true;
      this.bufferingStartTime = performance.now();
    }
  }

  private handleError(e: any): void {
    this.isBuffering = false;
    // Don't immediately mark offline on transient media errors, let recovery attempt tier 2
    if (!this.isRecovering) {
      this.setClassification("STALE");
    }
  }

  private handleTimeUpdate(): void {
    const now = performance.now();
    this.lastCurrentTime = this.video ? this.video.currentTime : this.lastCurrentTime;
    this.lastProgressionTime = now;
    if (!this.supportsRVFC) {
      this.lastDecodedFrameTime = now;
    }
    if (this.isBuffering) {
      this.isBuffering = false;
    }
  }

  private handlePause(): void {
    // Distinguish programmatic pause from user pause
    if (this.userPaused) {
      this.setClassification("PAUSED");
    }
  }

  private handlePlay(): void {
    this.userPaused = false;
  }

  /**
   * Public telemetry snapshot for debugging & UI indicators
   */
  public getMetrics() {
    const now = performance.now();
    return {
      cameraId: this.cameraId,
      provider: this.provider,
      classification: this.classification,
      supportsRVFC: this.supportsRVFC,
      presentedFramesCount: this.presentedFramesCount,
      timeSinceLastFrameMs: Math.round(now - this.lastDecodedFrameTime),
      timeSinceLastProgressionMs: Math.round(now - this.lastProgressionTime),
      consecutiveLevelStalls: this.consecutiveLevelStalls,
      recoveryAttempts: this.recoveryAttempts,
      isRecovering: this.isRecovering
    };
  }
}
