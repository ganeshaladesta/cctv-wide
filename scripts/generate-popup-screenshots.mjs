import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const sampleProtest = {
  id: "KEJ-20261120-U1473",
  id_kejadian: "KEJ-20261120-U1473",
  kode_unras: "U1473",
  status: "scheduled",
  urgency: "high",
  isu_tuntutan: "Aksi Damai Menolak Relokasi Pasar Tradisional dan Menuntut Revitalisasi Fasilitas Umum Pedagang",
  lokasi: "Jl. Pemuda No. 45, Kompleks Perkantoran Pemerintah Kota",
  kota_kabupaten: "Samarinda",
  provinsi: "Kalimantan Timur",
  tanggal: "2026-11-20",
  waktu_mulai: "09:00:00",
  actual_crowd_size: 500,
  validated_lat: -0.50210,
  validated_lng: 117.15360,
  organisasi_kelompok: "Aliansi Pedagang Pasar Tradisional, Serikat Pekerja Mandiri, LBH Kaltim"
};

const sampleOffice = {
  id: "KPWDN_KALTIM",
  office_id: "KPwDN-KALTIM",
  office_name: "Kantor Perwakilan Bank Indonesia Provinsi Kalimantan Timur",
  short_name: "KPw BI Kaltim",
  office_type: "kpwdn",
  regional: "Kalimantan",
  island_group: "Kalimantan",
  latitude: -0.50520,
  longitude: 117.15110
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getProtestStatusMeta(status) {
  switch (status) {
    case "ongoing":
      return { bg: "bg-red-500/20 text-red-400 border border-red-500/30", label: "Sedang Berlangsung" };
    case "scheduled":
      return { bg: "bg-blue-500/20 text-blue-400 border border-blue-500/30", label: "Terjadwal" };
    case "monitoring":
      return { bg: "bg-amber-500/20 text-amber-400 border border-amber-500/30", label: "Pemantauan" };
    default:
      return { bg: "bg-slate-500/20 text-slate-400 border border-slate-500/30", label: "Selesai" };
  }
}

function getProtestUrgencyMeta(urgency) {
  switch (urgency) {
    case "critical":
      return { bg: "bg-red-600 text-white animate-pulse", label: "Kritis" };
    case "high":
      return { bg: "bg-orange-500/20 text-orange-400 border border-orange-500/30", label: "Tinggi" };
    case "medium":
      return { bg: "bg-amber-500/20 text-amber-400 border border-amber-500/30", label: "Sedang" };
    default:
      return { bg: "bg-slate-500/20 text-slate-400 border border-slate-500/30", label: "Rendah" };
  }
}

function createProtestPopupHtml(p, nearestOffice) {
  const sBadge = getProtestStatusMeta(p.status);
  const uBadge = getProtestUrgencyMeta(p.urgency);
  const safeIsu = escapeHtml(p.isu_tuntutan || "Aksi Unjuk Rasa");
  const safeLokasi = escapeHtml(p.lokasi || "Lokasi Aksi");
  const safeKota = p.kota_kabupaten ? escapeHtml(p.kota_kabupaten) : "";
  const safeProvinsi = p.provinsi ? escapeHtml(p.provinsi) : "";
  const crowdCount = p.actual_crowd_size || p.estimasi_massa_source;
  const crowdFormatted = crowdCount ? `${crowdCount.toLocaleString("id-ID")} orang` : "Belum diestimasi";
  const waktuFormatted = p.waktu_mulai ? p.waktu_mulai.slice(0, 5) + " WIB" : "09:00 WIB";
  const coordsFormatted = p.validated_lat !== null && p.validated_lng !== null
    ? `${p.validated_lat.toFixed(5)}, ${p.validated_lng.toFixed(5)}`
    : "-";

  const rawElements = p.organisasi_kelompok
    ? p.organisasi_kelompok
        .split(/[,;\/\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1)
        .slice(0, 4)
    : [];

  const elementsHtml = rawElements.length > 0
    ? `
      <div class="pt-1.5 border-t border-[#1E293B]/60">
        <span class="text-[10px] text-[#98A4B8] font-bold block mb-1">ELEMEN MASSA TERIDENTIFIKASI:</span>
        <div class="flex flex-wrap gap-1">
          ${rawElements.map((el) => `<span class="px-2 py-0.5 rounded bg-white/5 text-[9px] text-[#CAD4E0] border border-white/5 truncate max-w-[160px]">${escapeHtml(el)}</span>`).join("")}
        </div>
      </div>
    `
    : "";

  let biOfficeProximityHtml = "";
  if (nearestOffice) {
    const distText = "680 m";
    const isClose = true;

    biOfficeProximityHtml = `
      <div class="flex items-center justify-between text-[10px] ${
        isClose
          ? "bg-amber-950/50 border border-amber-500/40 text-amber-300"
          : "bg-blue-950/40 border border-blue-500/30 text-blue-300"
      } px-2.5 py-1.5 rounded-lg">
        <span class="flex items-center gap-1.5 font-semibold truncate max-w-[210px]">
          🏢 BI: ${escapeHtml(nearestOffice.office.short_name || nearestOffice.office.office_name)}
        </span>
        <span class="font-mono font-bold text-white shrink-0 ml-1">
          ${distText}
        </span>
      </div>
    `;
  }

  return `
    <div class="scc-protest-popup-root p-3.5 text-left font-sans text-white w-full box-border overflow-hidden" style="width: min(360px, calc(100vw - 40px)); max-width: 360px; box-sizing: border-box;">
      <div class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#1E293B]">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${sBadge.bg}">
            ${sBadge.label}
          </span>
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${uBadge.bg}">
            ${uBadge.label}
          </span>
        </div>
        <span class="font-mono text-[10px] text-[#98A4B8] font-bold truncate max-w-[130px]" title="${escapeHtml(p.kode_unras || p.id_kejadian)}">
          ${escapeHtml(p.kode_unras || p.id_kejadian)}
        </span>
      </div>

      <h4 class="text-xs sm:text-[13px] font-bold text-white leading-snug mb-2.5 break-words line-clamp-3">
        ${safeIsu}
      </h4>

      <div class="space-y-1.5 text-[11px] text-[#98A4B8] mb-3">
        <div class="flex items-center gap-2">
          <span class="text-xs shrink-0">📅</span>
          <span class="text-[#F3F6FB]">${p.tanggal} • ${waktuFormatted}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="text-xs shrink-0 mt-0.5">📍</span>
          <span class="text-[#F3F6FB] leading-tight break-words">
            ${safeLokasi}${safeKota ? ` (${safeKota})` : ""}${safeProvinsi ? `, ${safeProvinsi}` : ""}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs shrink-0">👥</span>
          <span>Estimasi Massa: <strong class="text-white font-mono">${crowdFormatted}</strong></span>
        </div>
        <div class="flex items-center gap-1.5 pt-1 text-[10px] text-emerald-400 font-semibold border-t border-[#1E293B]/60">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
          <span class="truncate">Koordinat Valid: ${coordsFormatted}</span>
        </div>
        ${biOfficeProximityHtml}
        ${elementsHtml}
      </div>

      <div class="popup-actions grid grid-cols-2 gap-2 w-full min-w-0" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; width: 100%; min-width: 0; box-sizing: border-box;">
        <button
          type="button"
          id="btn-protest-geoint-${p.id}"
          class="popup-btn-geoint w-full min-w-0 max-w-full py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-blue-500/25 transition-all cursor-pointer box-border text-center"
          style="width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; text-align: center;"
        >
          <svg class="w-3.5 h-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
            <path d="M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" />
            <line x1="12" y1="3" x2="12" y2="12" />
          </svg>
          <span class="truncate">GeoINT HUD</span>
        </button>
        <button
          type="button"
          id="btn-protest-popup-${p.id}"
          class="popup-btn-pantau w-full min-w-0 max-w-full py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all cursor-pointer box-border text-center"
          style="width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; text-align: center;"
        >
          <span class="truncate">Pantau Situasi</span>
          <span class="shrink-0">→</span>
        </button>
      </div>
    </div>
  `;
}

const innerHtml = createProtestPopupHtml(sampleProtest, { office: sampleOffice, distanceMeters: 680 });
const leafletCss = fs.readFileSync("node_modules/leaflet/dist/leaflet.css", "utf-8");
const appCss = fs.readFileSync(".next/static/css/1da38aedb4dc7d84.css", "utf-8");

function generateHtml(mode) {
  const isMobile = mode === "mobile";
  const containerStyle = isMobile
    ? "width: 390px; height: 844px; margin: 0 auto; position: relative; overflow: hidden; background: #07090d;"
    : "width: 100vw; height: 100vh; position: relative; overflow: hidden; background: #07090d;";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Incident Popup Preview - ${mode}</title>
  <style>
    ${leafletCss}
    ${appCss}
    body {
      background-color: #030508;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .map-frame {
      ${containerStyle}
      background-image: 
        radial-gradient(circle at 50% 50%, rgba(30, 41, 59, 0.45) 0%, rgba(7, 9, 13, 1) 100%),
        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 100% 100%, 36px 36px, 36px 36px;
      box-shadow: ${isMobile ? "0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.1)" : "none"};
      border-radius: ${isMobile ? "32px" : "0"};
    }
    .marker-pin {
      position: absolute;
      top: 55%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10;
    }
    .popup-wrapper {
      position: absolute;
      top: 55%;
      left: 50%;
      transform: translate(-50%, -100%) translateY(-14px);
      z-index: 20;
    }
    ${isMobile ? `
      .scc-leaflet-protest-popup {
        width: 358px !important;
        max-width: 358px !important;
      }
      .scc-leaflet-protest-popup .leaflet-popup-content-wrapper {
        width: 358px !important;
        max-width: 358px !important;
      }
      .scc-leaflet-protest-popup .scc-protest-popup-root {
        width: 100% !important;
        max-width: 100% !important;
      }
    ` : ""}
  </style>
</head>
<body>
  <div class="map-frame">
    <!-- Map marker pin simulation -->
    <div class="marker-pin">
      <div style="position: absolute; top: -14px; left: -14px; width: 44px; height: 44px; border-radius: 9999px; background: rgba(59, 130, 246, 0.25);"></div>
      <div style="position: relative; width: 16px; height: 16px; border-radius: 9999px; background: #3b82f6; border: 2px solid #ffffff; box-shadow: 0 0 14px rgba(59, 130, 246, 0.9);"></div>
    </div>

    <!-- Leaflet popup simulation structure -->
    <div class="popup-wrapper">
      <div class="leaflet-popup scc-leaflet-protest-popup" style="position: relative; margin: 0; transform: none;">
        <div class="leaflet-popup-content-wrapper">
          <div class="leaflet-popup-content">
            ${innerHtml}
          </div>
        </div>
        <div class="leaflet-popup-tip-container" style="width: 40px; height: 20px; position: absolute; left: 50%; margin-left: -20px; overflow: hidden; pointer-events: none;">
          <div class="leaflet-popup-tip" style="width: 17px; height: 17px; padding: 1px; margin: -10px auto 0; transform: rotate(45deg);"></div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const desktopHtml = generateHtml("desktop");
const mobileHtml = generateHtml("mobile");

const outDesktopPath = path.resolve("public/popup-preview-desktop.html");
const outMobilePath = path.resolve("public/popup-preview-mobile.html");

fs.writeFileSync(outDesktopPath, desktopHtml, "utf-8");
fs.writeFileSync(outMobilePath, mobileHtml, "utf-8");

const screenshotDir = path.resolve("artifacts");
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const desktopScreenshot = path.join(screenshotDir, "incident-popup-desktop.png");
const mobileScreenshot = path.join(screenshotDir, "incident-popup-mobile.png");

console.log("Capturing Desktop screenshot (1440x900)...");
execSync(`"${chromePath}" --headless=new --screenshot="${desktopScreenshot}" --window-size=1440,900 --hide-scrollbars "file:///${outDesktopPath.replace(/\\/g, "/")}"`);

console.log("Capturing Mobile screenshot (430x920 viewport containing 390x844 device frame)...");
execSync(`"${chromePath}" --headless=new --screenshot="${mobileScreenshot}" --window-size=430,920 --hide-scrollbars "file:///${outMobilePath.replace(/\\/g, "/")}"`);

console.log(`Screenshots saved:\n  1. ${desktopScreenshot}\n  2. ${mobileScreenshot}`);
