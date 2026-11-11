import React from "react";
import { getDataStore } from "@/lib/data-store";
import CommandCenter from "@/components/command-center";

export default function HomePage() {
  const store = getDataStore();
  const stats = store.getStats();
  const provinces = store.getProvinces();
  const initialCameras = store.queryCameras({}).slice(0, 24);

  return (
    <CommandCenter
      initialStats={stats}
      initialProvinces={provinces}
      initialCameras={initialCameras}
    />
  );
}

