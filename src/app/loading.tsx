import React from "react";
import { APP_CONFIG } from "@/lib/branding";

export default function Loading() {
  return (
    <div
      style={{ backgroundColor: "#090B10" }}
      className="min-h-screen text-zinc-100 flex flex-col items-center justify-center p-4 gap-4"
    >
      <div className="w-20 h-20 rounded-2xl bg-[#090B10] border border-[#252A35] p-2.5 flex items-center justify-center shadow-lg">
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
      <div className="w-7 h-7 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
