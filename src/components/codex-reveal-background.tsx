"use client";

import React, { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";

interface CodexRevealBackgroundProps {
  fontSize?: number;
  density?: number;
  damping?: number;
  velocity?: number;
  maxOpacity?: number;
}

const ASCII_CHARS = ["·", ".", "-", "~", "=", "+", "x", "*", "o"] as const;
const ALPHA_STEPS = 14;

/**
 * Global Codex Reveal ambient background adapted for SCC - EAGLE EYES.
 * Ported from Framer Codex Reveal (AsciiWaterReveal) with passive window listeners,
 * constrained cool-silver/slate contrast, DPR cap, tab-visibility pause, and auto-sleep.
 */
export function CodexRevealBackground({
  fontSize = 14,
  density = 0.88,
  damping = 0.955,
  velocity = 0.46,
  maxOpacity = 0.16
}: CodexRevealBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const canvasEl = canvas;
    const containerEl = container;
    const context = ctx;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let isSleeping = false;
    let idleFrames = 0;

    const colSpacing = (fontSize * 0.9) / density;
    const rowSpacing = (fontSize * 1.2) / density;

    let buffer1 = new Float32Array(0);
    let buffer2 = new Float32Array(0);

    // Cool metallic silver/slate palette with restrained blue crest hint at peak amplitude
    const colorPalette = Array.from({ length: ALPHA_STEPS + 1 }, (_, i) => {
      const ratio = i / ALPHA_STEPS;
      const alpha = (ratio * maxOpacity).toFixed(3);
      if (ratio > 0.72) {
        return `rgba(147, 197, 253, ${alpha})`;
      }
      return `rgba(203, 213, 225, ${alpha})`;
    });

    const mouse = {
      x: -1,
      y: -1,
      prevX: -1,
      prevY: -1,
      isDown: false
    };

    function drop(x: number, y: number, radius: number, strength: number) {
      if (cols <= 2 || rows <= 2) return;
      const gridX = Math.floor(x / colSpacing);
      const gridY = Math.floor(y / rowSpacing);
      const radSq = radius * radius;

      for (let r = -radius; r <= radius; r++) {
        for (let c = -radius; c <= radius; c++) {
          const nx = gridX + c;
          const ny = gridY + r;
          if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1) {
            const distSq = c * c + r * r;
            if (distSq < radSq) {
              const index = ny * cols + nx;
              buffer1[index] += strength * (1 - distSq / radSq);
            }
          }
        }
      }
      if (!prefersReducedMotion) {
        wakeUp();
      }
    }

    function renderStaticAmbient() {
      context.clearRect(0, 0, width, height);
      context.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      context.textBaseline = "middle";
      context.textAlign = "center";

      const charsLen = ASCII_CHARS.length - 1;
      for (let y = 1; y < rows - 1; y++) {
        const rowOffset = y * cols;
        const posY = y * rowSpacing;
        for (let x = 1; x < cols - 1; x++) {
          const intensity = Math.abs(buffer1[rowOffset + x]);
          if (intensity > 0.015) {
            const posX = x * colSpacing;
            const charIndex = Math.min((intensity * 2.1) | 0, charsLen);
            const colorIndex = Math.min((intensity * 5) | 0, ALPHA_STEPS);
            context.fillStyle = colorPalette[colorIndex];
            context.fillText(ASCII_CHARS[charIndex], posX, posY);
          }
        }
      }
    }

    function initBuffers() {
      const rect = containerEl.getBoundingClientRect();
      width = Math.max(100, Math.floor(rect.width || window.innerWidth));
      height = Math.max(100, Math.floor(rect.height || window.innerHeight));
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      canvasEl.width = Math.floor(width * dpr);
      canvasEl.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.ceil(width / colSpacing) + 2;
      rows = Math.ceil(height / rowSpacing) + 2;
      const size = cols * rows;
      buffer1 = new Float32Array(size);
      buffer2 = new Float32Array(size);

      // Subtle initial wave pulse on first paint that decays gently into idle sleep
      drop(width * 0.5, height * 0.28, 4, 2.2);

      if (prefersReducedMotion) {
        renderStaticAmbient();
      } else {
        wakeUp();
      }
    }

    function render() {
      if (prefersReducedMotion || document.hidden) {
        isSleeping = true;
        return;
      }

      context.clearRect(0, 0, width, height);
      context.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      context.textBaseline = "middle";
      context.textAlign = "center";

      let activeCells = 0;

      // 1. Wave physics step
      for (let y = 1; y < rows - 1; y++) {
        const rowOffset = y * cols;
        for (let x = 1; x < cols - 1; x++) {
          const i = rowOffset + x;
          let nextVal =
            (buffer1[i - 1] +
              buffer1[i + 1] +
              buffer1[i - cols] +
              buffer1[i + cols]) *
              velocity -
            buffer2[i];
          nextVal *= damping;
          buffer2[i] = nextVal;
        }
      }

      // Buffer swap
      const temp = buffer1;
      buffer1 = buffer2;
      buffer2 = temp;

      // 2. Render active cells only
      const charsLen = ASCII_CHARS.length - 1;
      for (let y = 1; y < rows - 1; y++) {
        const rowOffset = y * cols;
        const posY = y * rowSpacing;
        for (let x = 1; x < cols - 1; x++) {
          const i = rowOffset + x;
          const intensity = Math.abs(buffer1[i]);
          if (intensity > 0.012) {
            activeCells++;
            const posX = x * colSpacing;
            const charIndex = Math.min((intensity * 2.2) | 0, charsLen);
            const colorIndex = Math.min((intensity * 6) | 0, ALPHA_STEPS);
            context.fillStyle = colorPalette[colorIndex];
            context.fillText(ASCII_CHARS[charIndex], posX, posY);
          }
        }
      }

      // Auto-sleep CPU/GPU conservation once ripple dissipates
      if (activeCells === 0 && !mouse.isDown) {
        idleFrames++;
        if (idleFrames > 30) {
          isSleeping = true;
          return;
        }
      } else {
        idleFrames = 0;
      }

      animationFrameId = window.requestAnimationFrame(render);
    }

    function wakeUp() {
      if (prefersReducedMotion || document.hidden) return;
      idleFrames = 0;
      if (isSleeping) {
        isSleeping = false;
        animationFrameId = window.requestAnimationFrame(render);
      } else if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(render);
      }
    }

    initBuffers();
    if (!prefersReducedMotion) {
      animationFrameId = window.requestAnimationFrame(render);
    }

    const resizeObserver = new ResizeObserver(() => {
      initBuffers();
    });
    resizeObserver.observe(container);

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion || document.hidden) return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (mouse.prevX === -1) {
        mouse.prevX = mouse.x;
        mouse.prevY = mouse.y;
        return;
      }
      const dx = mouse.x - mouse.prevX;
      const dy = mouse.y - mouse.prevY;
      const speedSq = dx * dx + dy * dy;
      if (speedSq > 9) {
        const speed = Math.sqrt(speedSq);
        const steps = Math.min(Math.floor(speed / 12), 5);
        const strength = Math.min(speed * 0.065, 2.0) * (mouse.isDown ? 1.45 : 1);
        const radius = mouse.isDown ? 3 : 2;
        for (let i = 0; i <= steps; i++) {
          const t = steps === 0 ? 0 : i / steps;
          drop(mouse.prevX + dx * t, mouse.prevY + dy * t, radius, strength);
        }
      }
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (prefersReducedMotion || document.hidden) return;
      mouse.isDown = true;
      drop(e.clientX, e.clientY, 4, 3.4);
    };

    const handlePointerUp = () => {
      mouse.isDown = false;
    };

    const handlePointerCancel = () => {
      mouse.prevX = -1;
      mouse.prevY = -1;
      mouse.isDown = false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden && animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
        isSleeping = true;
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerCancel, {
      passive: true
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [fontSize, density, damping, velocity, maxOpacity, prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-testid="codex-reveal-background"
      style={{ zIndex: 0 }}
      className="fixed inset-0 pointer-events-none select-none overflow-hidden"
    >
      {/* Subtle Vignette Depth Wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 85% 60% at 50% 0%, rgba(59, 130, 246, 0.045) 0%, rgba(7, 9, 13, 0) 68%)"
        }}
      />
      <canvas
        ref={canvasRef}
        className="block w-full h-full pointer-events-none"
      />
    </div>
  );
}
