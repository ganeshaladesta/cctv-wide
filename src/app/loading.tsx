import React from "react";
import { APP_CONFIG } from "@/lib/branding";

export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-white/95 border border-amber-500/40 p-2 flex items-center justify-center shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_CONFIG.primaryIcon}
          alt={APP_CONFIG.name}
          className="w-full h-full object-contain"
          style={{ objectFit: "contain" }}
        />
      </div>
      <div className="text-center space-y-1.5">
        <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
          {APP_CONFIG.name}
        </h1>
        <p className="text-xs text-zinc-400 max-w-sm">
          {APP_CONFIG.description}
        </p>
      </div>
      <div className="w-7 h-7 border-2 border-sky-500 border-t-amber-400 rounded-full animate-spin" />
    </div>
  );
}

