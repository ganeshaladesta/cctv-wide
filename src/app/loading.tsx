import React from "react";
import { APP_CONFIG } from "@/lib/branding";

export default function Loading() {
  return (
    <div
      style={{ backgroundColor: "#090B10" }}
      className="min-h-screen text-[#F3F6FB] flex flex-col items-center justify-center p-4 gap-5"
    >
      {/* Official Unboxed Eagle Eyes Emblem */}
      <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center bg-transparent">
        <picture className="w-full h-full flex items-center justify-center bg-transparent">
          <source srcSet={APP_CONFIG.primaryIconWebp} type="image/webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={APP_CONFIG.primaryIcon}
            alt={APP_CONFIG.name}
            className="w-full h-full object-contain bg-transparent"
            style={{ objectFit: "contain", background: "transparent" }}
          />
        </picture>
      </div>
      <div className="text-center space-y-1.5">
        <h1 className="text-base sm:text-lg font-bold tracking-[0.18em] uppercase text-[#F3F6FB]">
          {APP_CONFIG.name}
        </h1>
        <p className="text-xs text-[#98A4B8] max-w-sm">
          {APP_CONFIG.description}
        </p>
      </div>
      <div className="w-7 h-7 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
