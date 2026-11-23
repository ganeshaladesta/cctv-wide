import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Data: Kantor Pusat KPBI
const kpbiOffice = {
  id: "KPBI",
  office_id: "KPBI",
  office_name: "Kantor Pusat Bank Indonesia",
  short_name: "KPBI",
  office_type: "Kantor Pusat",
  regional: "DKI Jakarta",
  island_group: "Jawa",
  address: "Jl. M.H. Thamrin No. 2, Gambir, Jakarta Pusat, DKI Jakarta 10110",
  latitude: -6.18170,
  longitude: 106.82072
};

// Data: KPw BI Samarinda
const kpwOffice = {
  id: "KPWDN_KALTIM",
  office_id: "KPwDN-KALTIM",
  office_name: "Kantor Perwakilan Bank Indonesia Provinsi Kalimantan Timur",
  short_name: "KPw BI Kaltim",
  office_type: "KPwDN",
  regional: "Kalimantan",
  island_group: "Kalimantan",
  address: "Jl. Gajah Mada No. 1, Jawa, Kec. Samarinda Ulu, Kota Samarinda, Kalimantan Timur 75122",
  latitude: -0.50520,
  longitude: 117.15110
};

// Sample Nearest Protest
const sampleProtest = {
  id: "KEJ-20261120-U1473",
  id_kejadian: "KEJ-20261120-U1473",
  kode_unras: "U1473",
  status: "scheduled",
  urgency: "high",
  isu_tuntutan: "Aksi Damai Menolak Relokasi Pasar Tradisional dan Menuntut Revitalisasi Fasilitas Umum Pedagang Secara Berkelanjutan",
  lokasi: "Jl. Medan Merdeka Barat / Monas",
  kota_kabupaten: "Jakarta Pusat",
  provinsi: "DKI Jakarta",
  tanggal: "2026-11-20",
  waktu_mulai: "09:00:00",
  actual_crowd_size: 500,
  validated_lat: -6.18050,
  validated_lng: 106.82200
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

function createBIOfficePopupHtml(office, nearestProtest) {
  const safeName = escapeHtml(office.office_name);
  const safeAddress = escapeHtml(office.address);
  const coordsFormatted =
    office.latitude !== null && office.longitude !== null
      ? `${office.latitude.toFixed(5)}, ${office.longitude.toFixed(5)}`
      : "-";

  const typeBadgeClass =
    office.office_type === "Kantor Pusat"
      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
      : office.office_type === "KOPERBI IKN"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";

  let unrasAlertHtml = "";
  if (nearestProtest) {
    const isCritical = nearestProtest.distanceMeters <= 1000;
    const isWarning = nearestProtest.distanceMeters <= 3000;
    const alertBg = isCritical
      ? "bg-red-950/50 border-red-500/50 text-red-300"
      : isWarning
      ? "bg-amber-950/50 border-amber-500/50 text-amber-300"
      : "bg-blue-950/40 border-blue-500/40 text-blue-300";

    const distText =
      nearestProtest.distanceMeters >= 1000
        ? `${(nearestProtest.distanceMeters / 1000).toFixed(2)} km`
        : `${nearestProtest.distanceMeters} m`;

    unrasAlertHtml = `
      <div class="p-2 rounded-lg border ${alertBg} text-[10px] space-y-1 mb-2.5 box-border">
        <div class="flex items-center justify-between font-bold gap-2">
          <span class="flex items-center gap-1 shrink-0">⚠️ PROKSIMITAS UNRAS</span>
          <span class="font-mono text-white bg-black/30 px-1.5 py-0.5 rounded shrink-0">${distText}</span>
        </div>
        <p class="line-clamp-2 break-words text-white/90 text-[10px] leading-snug m-0">${escapeHtml(nearestProtest.event.isu_tuntutan)}</p>
      </div>
    `;
  } else {
    unrasAlertHtml = `
      <div class="p-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-[10px] flex items-center gap-1.5 mb-2.5 box-border">
        <span class="font-bold shrink-0">✓</span>
        <span class="leading-tight">Perimeter Aman (Tidak ada unras aktif &lt; 5km)</span>
      </div>
    `;
  }

  return `
    <div class="scc-bi-popup-root p-3 text-left font-sans text-white w-full box-border overflow-hidden" style="width: min(300px, calc(100vw - 32px)); max-width: 300px; box-sizing: border-box;">
      <div class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#1E293B] pr-6">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${typeBadgeClass}">
          ${office.office_type}
        </span>
        <span class="font-mono text-[10px] text-blue-400 font-bold truncate max-w-[120px]" title="${escapeHtml(office.office_id || office.id)}">
          ${escapeHtml(office.office_id || office.id)}
        </span>
      </div>

      <h4 class="text-xs sm:text-[13px] font-bold text-white leading-snug mb-1 break-words">
        ${safeName}
      </h4>
      <p class="text-[10px] text-slate-400 mb-2 leading-relaxed break-words">
        ${safeAddress}
      </p>

      <div class="space-y-1 text-[11px] text-slate-300 mb-2.5 py-2 border-y border-[#1E293B]/60">
        <div class="flex items-center justify-between gap-2 text-[10px]">
          <span class="text-slate-400 shrink-0">Regional / Wilayah:</span>
          <span class="text-white font-medium text-right truncate">${office.regional}${office.island_group ? ` (${office.island_group})` : ""}</span>
        </div>
        <div class="flex items-center justify-between gap-2 text-[10px]">
          <span class="text-slate-400 shrink-0">Koordinat Valid:</span>
          <span class="font-mono text-emerald-400 text-right">${coordsFormatted}</span>
        </div>
      </div>

      ${unrasAlertHtml}

      <button
        type="button"
        id="btn-bi-office-hud-${office.id}"
        class="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all cursor-pointer box-border text-center"
        style="width: 100%; box-sizing: border-box;"
      >
        <svg class="w-3.5 h-3.5 text-blue-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <path d="M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" />
          <line x1="12" y1="3" x2="12" y2="12" />
        </svg>
        <span class="truncate">Analisis GeoINT &amp; Perimeter</span>
        <span class="shrink-0">→</span>
      </button>
    </div>
  `;
}

const biHtmlWithAlert = createBIOfficePopupHtml(kpbiOffice, { event: sampleProtest, distanceMeters: 450 });
const biHtmlSecure = createBIOfficePopupHtml(kpwOffice, null);

const leafletCss = fs.readFileSync("node_modules/leaflet/dist/leaflet.css", "utf-8");
const appCss = fs.readFileSync(".next/static/css/dbed20ebdd9739d2.css", "utf-8");

function generateHtml(innerContent, mode) {
  const isMobile = mode === "mobile";
  const containerStyle = isMobile
    ? "width: 390px; height: 844px; position: relative; overflow: hidden; background: #07090d;"
    : "width: 100vw; height: 100vh; position: relative; overflow: hidden; background: #07090d;";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BI Office Popup Preview - ${mode}</title>
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
      width: ${isMobile ? "430px" : "100vw"};
      height: ${isMobile ? "920px" : "100vh"};
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-sizing: border-box;
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
      box-sizing: border-box;
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
      .scc-leaflet-bi-popup {
        width: 300px !important;
        max-width: 300px !important;
      }
      .scc-leaflet-bi-popup .leaflet-popup-content-wrapper {
        width: 300px !important;
        max-width: 300px !important;
      }
      .scc-leaflet-bi-popup .scc-bi-popup-root {
        width: 100% !important;
        max-width: 100% !important;
      }
    ` : ""}
  </style>
</head>
<body>
  <div class="map-frame">
    <!-- Map marker pin simulation (BI Office gold icon) -->
    <div class="marker-pin">
      <div style="position: absolute; top: -14px; left: -14px; width: 44px; height: 44px; border-radius: 9999px; background: rgba(245, 158, 11, 0.25);"></div>
      <div style="position: relative; width: 18px; height: 18px; border-radius: 9999px; background: #f59e0b; border: 2px solid #ffffff; box-shadow: 0 0 14px rgba(245, 158, 11, 0.9); display: flex; align-items: center; justify-content: center; font-size: 10px;">🏢</div>
    </div>

    <!-- Leaflet popup simulation structure -->
    <div class="popup-wrapper">
      <div class="leaflet-popup scc-leaflet-bi-popup" style="position: relative; margin: 0; transform: none;">
        <div class="leaflet-popup-content-wrapper">
          <div class="leaflet-popup-content">
            ${innerContent}
          </div>
        </div>
        <a class="leaflet-popup-close-button" href="#close">×</a>
        <div class="leaflet-popup-tip-container" style="width: 40px; height: 20px; position: absolute; left: 50%; margin-left: -20px; overflow: hidden; pointer-events: none;">
          <div class="leaflet-popup-tip" style="width: 17px; height: 17px; padding: 1px; margin: -10px auto 0; transform: rotate(45deg);"></div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const desktopHtml = generateHtml(biHtmlWithAlert, "desktop");
const mobileHtml = generateHtml(biHtmlWithAlert, "mobile");

const outDesktopPath = path.resolve("public/bi-popup-preview-desktop.html");
const outMobilePath = path.resolve("public/bi-popup-preview-mobile.html");

fs.writeFileSync(outDesktopPath, desktopHtml, "utf-8");
fs.writeFileSync(outMobilePath, mobileHtml, "utf-8");

const screenshotDir = path.resolve("artifacts");
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const desktopScreenshot = path.join(screenshotDir, "bi-office-popup-desktop.png");
const mobileScreenshot = path.join(screenshotDir, "bi-office-popup-mobile.png");

console.log("Capturing BI Office Desktop screenshot (1440x900)...");
execSync(`"${chromePath}" --headless=new --screenshot="${desktopScreenshot}" --window-size=1440,900 --hide-scrollbars "file:///${outDesktopPath.replace(/\\/g, "/")}"`);

console.log("Capturing BI Office Mobile screenshot (430x920 viewport containing 390x844 device frame)...");
execSync(`"${chromePath}" --headless=new --screenshot="${mobileScreenshot}" --window-size=430,920 --hide-scrollbars "file:///${outMobilePath.replace(/\\/g, "/")}"`);

console.log(`BI Office Screenshots saved:\n  1. ${desktopScreenshot}\n  2. ${mobileScreenshot}`);
