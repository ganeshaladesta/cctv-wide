import type { Transition } from "framer-motion";

export const EASE_STANDARD: [number, number, number, number] = [
  0.22, 1, 0.36, 1
];

export const EASE_CURTAIN: [number, number, number, number] = [
  0.2, 0.8, 0.2, 1
];

export const EASE_BREATHE: [number, number, number, number] = [
  0.45, 0, 0.55, 1
];

export const DURATIONS = {
  fast: 0.16,
  normal: 0.28,
  entrance: 0.44,
  curtain: 0.65,
  breathe: 7
} as const;

export const SPRINGS = {
  snappy: {
    type: "spring",
    stiffness: 420,
    damping: 32
  } satisfies Transition,
  pill: {
    type: "spring",
    stiffness: 380,
    damping: 30
  } satisfies Transition,
  drawer: {
    type: "spring",
    stiffness: 350,
    damping: 32
  } satisfies Transition,
  modal: {
    type: "spring",
    stiffness: 380,
    damping: 30
  } satisfies Transition
} as const;

export function getProgramsEntranceDelay(index: number): number {
  return Math.min(Math.max(0, index), 8) * 0.035;
}
