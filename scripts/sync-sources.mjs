import fs from "node:fs";
import path from "node:path";

console.log("=== PANTAU NUSANTARA Live Government Portal Discovery Probe ===");

const PORTALS = [
  {
    id: "JogjaATCSProvider",
    name: "Pemkot Yogyakarta ATCS",
    url: "https://cctv.jogjakota.go.id/home/getdata",
    method: "GET"
  },
  {
    id: "JogjaProvProvider",
    name: "Pemprov DI Yogyakarta (CCTV Jogja Istimewa)",
    url: "https://cctv.jogjaprov.go.id/",
    method: "GET"
  },
  {
    id: "BandungATCSProvider",
    name: "Dishub Kota Bandung ATCS",
    url: "https://atcs-dishub.bandung.go.id/ajax/lokasi",
    method: "POST"
  },
  {
    id: "OpenCCTVProvider",
    name: "OpenCCTV Global / Indonesia",
    url: "https://opencctv.org/",
    method: "GET"
  }
];

for (const portal of PORTALS) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(portal.url, {
      method: portal.method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    console.log(
      `[PROVIDER SYNC] ${portal.id} (${portal.name}) -> HTTP ${res.status} in ${ms}ms`
    );
  } catch (err) {
    console.log(
      `[PROVIDER SYNC] ${portal.id} (${portal.name}) -> Offline/Timeout (${err.message})`
    );
  }
}

const dataDir = path.join(process.cwd(), "data");
const stats = {
  provinces: JSON.parse(
    fs.readFileSync(path.join(dataDir, "provinces.json"), "utf8")
  ).length,
  cities: JSON.parse(
    fs.readFileSync(path.join(dataDir, "cities.json"), "utf8")
  ).length,
  sources: JSON.parse(
    fs.readFileSync(path.join(dataDir, "sources.json"), "utf8")
  ).length,
  cameras: JSON.parse(
    fs.readFileSync(path.join(dataDir, "cameras.json"), "utf8")
  ).length
};
console.log("[SYNC SUMMARY] Active Catalog:", stats);
