import React from "react";
import { getDataStore } from "@/lib/data-store";
import CommandCenter from "@/components/command-center";

export const metadata = {
  title: "Monitoring Unjuk Rasa & Situasi Lapangan | SCC - EAGLE EYES",
  description: "Pusat pemantauan situasi lapangan aksi unjuk rasa terpadu dengan pemetaan CCTV nasional."
};

export default function UnrasPage() {
  const store = getDataStore();
  const stats = store.getStats();
  const provinces = store.getProvinces();
  const initialCameras = store.queryCameras({}).slice(0, 24);

  return (
    <CommandCenter
      initialStats={stats}
      initialProvinces={provinces}
      initialCameras={initialCameras}
      initialTab="protests"
    />
  );
}
