# Reverse Engineering Report: `atcsindonesia.com` ("Matadewa")

**Project:** PANTAU NUSANTARA — Indonesia Public CCTV Aggregator  
**Author:** Developed by Ganesha Ladesta  
**Phase:** Phase 1 — Black-Box Reverse Engineering & Technical Ecosystem Investigation  
**Target Reference:** `https://atcsindonesia.com/`  
**Investigation Date:** November 2026  

---

## 1. Executive Summary

A black-box technical investigation of `https://atcsindonesia.com/` (internally codenamed **`Matadewa`** across its JavaScript bundles, `localStorage` keys, custom DOM events, and Video.js controls) was conducted using HTTP header inspection, React Server Component (RSC) payload analysis, client-side bundle decompilation, and public API endpoint probing.

Key findings:
1. **Runtime & Hosting Stack**: Built with **vinext** (`self.__VINEXT_RSC_PARAMS__`, `/_vinext/image`), an experimental Next.js App Router implementation compiled via **Vite / Rolldown** (`rolldown-runtime-XKyaHtl9.js`, `worker-entry-CxX8Iqee.js`) and deployed onto **Cloudflare Workers** behind Cloudflare CDN.
2. **Dataset Scale**: `GET /api/cctv` publicly serves a **15.35 MB JSON payload** containing **24,472 camera records** (`21,970` live, `2,485` offline, `17` undefined) across **614 distinct source identifiers** and **421 regional slugs**, covering all **38 Indonesian provinces** (plus 898 non-Indonesian test/international feeds such as `london-tfl` and `singapore-lta` filtered out on the frontend).
3. **Hybrid Seed + Live API Delivery**: To reduce initial load latency, the client fetches an AES-CBC encrypted seed manifest (`/api/cctv/seed/manifest`) and 5 progressive shards (`/api/cctv/seed/shard/0..4`), decrypts them in the browser using a public key embedded in `worker-entry-CxX8Iqee.js`, caches per-provider camera arrays in `localStorage` (`cctv_cache_<provider>`), and refreshes from `/api/cctv?limit=all` in the background.
4. **Crowdsourced Health Monitoring**: In addition to server-side multi-round cron audits (documented inside each camera's `auditComment` field), the browser video player actively reports stream failures (after a 30-second playback timeout) and recoveries via `POST /api/cctv/[id]/status`.
5. **Artificial Paywalls & Adware on Reference Site**: `atcsindonesia.com` restricts free users to **3 simultaneous cameras** in Multi-View, enforces a **30-minute daily watch limit** via `localStorage` (`matadewa_watch_time_minutes_YYYY-MM-DD`), hides 1,188 Jakarta BaliTower cameras behind an admin/secret key (`balitower`), and injects aggressive popunder ad scripts (`omg10.com`, `n6wxm.com/vignette.min.js`) alongside a Rp 30,000/month Midtrans paywall. **PANTAU NUSANTARA** will eliminate all paywalls, watch-time limits, and adware while remaining 100% free and zero-cost to host.

---

## 2. Frontend Investigation (15-Point Audit)

### 2.1 Website Structure & Page Hierarchy
Confirmed via `sitemap.xml` (2,547 lines, 425 URLs) and RSC route chunks:
- `/` — Main interactive Command Center (Fullscreen Leaflet Map + Collapsible Sidebar + Floating Top Bar + Multi-View Portal Overlay).
- `/cctv` — Dedicated CCTV Grid view.
- `/kamera` — Master SEO Regional Directory listing all provinces, cities/regencies, and camera counts (`786 KB` static-rendered HTML with `ItemList` and `CollectionPage` JSON-LD).
- `/kamera/[region]` — ~420+ dynamic SEO regional landing pages (e.g., `/kamera/bandung`, `/kamera/jakarta`, `/kamera/surabaya`) containing `LocalBusiness`, `FAQPage`, and `BreadcrumbList` JSON-LD structured data.
- `/about`, `/contact`, `/privacy-policy`, `/terms-of-service`, `/disclaimer` — Informational and legal pages.
- `/login` — Authentication page (`better-auth` + Google OAuth).
- `/admin/dashboard`, `/admin/repool` — Internal administration routes (referenced in `DashboardSettingsPanel-Dgha8TNJ.js`).

### 2.2 Navigation & Routing
- Uses Next.js App Router client-side navigation (`next/navigation` shimmed by `vinext`) with URL query state synchronization:
  - `?camera=<id>` — Opens and centers a specific camera on the map.
  - `?region=<slug>` — Filters map and directory to a specific region and auto-fits bounds.
  - `?q=<search>` — Synchronizes search query with URL parameters.
  - `?multi=<id1>,<id2>,...` — Launches the Multi-View grid pre-populated with the specified camera IDs.

### 2.3 Camera Search Functionality
Inspected in `worker-entry-CxX8Iqee.js` (`uu`, `du`, `fu`, `wu` functions) and `DashboardCameraDirectory-7XAPYMd1.js`:
- **Scoring Algorithm (`uu`)**: Ranks matches from `0` (best) to `7`:
  - `0`: Exact title match
  - `1`: Title prefix match
  - `2`: Word-boundary match in title (`!/[\p{L}\p{N}]/u.test(prevChar)`)
  - `3`: Substring match in title
  - `4`: Substring match in `location`
  - `5`: Exact match in `[region, province, regency, city]`
  - `6`: Substring match in `[region, province, regency, city]`
  - `7`: Substring match in `id`
- **Tie-Breaking**: Secondary sort by Haversine distance (`pu`) if user geolocation `origin` is active, followed by original array index.
- **Debouncing**: 150ms debounce on search input (`E.trim().length >= 2`), returning top 200 matches or falling back to `GET /api/cctv?q=...` and `GET /api/cctv/suggestions?q=...`.

### 2.4 Region & City Filtering
- Hierarchical filtering by **Province** (`province`) -> **City/Regency** (`city` / `regency` / `region`) -> **Category/Source** (`source`) -> **Status** (`live` / `offline`).
- The sidebar directory (`DashboardCameraDirectory-7XAPYMd1.js`) explicitly excludes international feeds (`london`, `singapore`, `israel`, `mecca`) and groups Indonesian cameras into collapsible Province and City accordions with live/total badges.

### 2.5 Camera Detail Views
- Clicking a camera marker or directory item opens a detail view:
  - **Desktop (`>= 1024px`)**: Renders a custom Leaflet `<Popup>` (`minWidth: 320, maxWidth: 320`) directly anchored to the marker, containing the live player, status badge (`LIVE` emerald vs `OFFLINE` red), region/city subtitle, source attribution, "Add to Multi-View" button, and "Share Link" button.
  - **Mobile (`< 1024px`)**: Renders a **Vaul** bottom sheet drawer (`Drawer.Root` in `Map-CUTP_kai.js`) with swipe-to-dismiss gesture support.

### 2.6 Interactive Map Implementation
Inspected in `Map-CUTP_kai.js` (`278 KB`):
- **Engine**: `leaflet` + `react-leaflet` with `preferCanvas: true` and `zoomControl: false`.
- **Tile Layers**:
  - Light (Default): OpenStreetMap (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)
  - Dark: MapTiler Dark (`https://api.maptiler.com/maps/toner-v2/{z}/{x}/{y}.png?key=...`, fallback to OSM)
  - Satellite: MapTiler Satellite (`https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=...`)
  - Terrain: OpenTopoMap (`https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`)
- **Clustering & Viewport Culling**:
  - Uses custom grid-based spatial clustering when `clusteringEnabled` is true (`zoom < 15`), grouping nearby markers and displaying cluster count pills.
  - When clustering is disabled (`zoom >= 15`), filters rendered markers strictly to `map.getBounds()` to avoid DOM overload across 24,000+ points.
  - Detects co-located cameras (`Math.abs(lat1 - lat2) < 0.0005 && Math.abs(lng1 - lng2) < 0.0005`, e.g., multiple cameras on one intersection pole) and renders a camera switcher pill inside the popup/drawer.

### 2.7 Camera Player Implementation
Inspected in `cctv-stream-CYmacsGn.js` (`46.3 KB`):
The player (`CCTVStream` / `VideoPlayer`) automatically detects the streaming protocol from `streamingUrl` and dispatches to one of **6 specialized playback engines**:
1. **Standard HLS (`.m3u8`) & MP4**: Rendered via **Video.js** (`video.es-DNxDbItb.js`) with VHS (`@videojs/http-streaming`), configured with `liveui: true`, `lowLatencyMode: true`, `backBufferLength: 30`, and custom `MatadewaSettingsButton` for resolution switching.
2. **MPEG-TS / HTTP-FLV (`dishubstreaming.mojokertokab.go.id`, `.ts`)**: Rendered via **mpegts.js** (`mpegts-CefjjrfW.js`) attached to an HTML5 `<video>` element (`isLive: true`, `enableStashBuffer: false`).
3. **WebSocket JSMpeg (`cctv.villabs.id`, `/streamer-jsmpeg/` for Kota Madiun)**: Dynamically loads `/jsmpeg.min.js` and renders MPEG1 video over WebSocket onto an HTML5 `<canvas>`.
4. **WebSocket RTSP-to-MSE (`rtsp.pekalongankota.go.id`, `/ws/pekalongan`)**: Opens a binary WebSocket (`arraybuffer`), reads the first payload `[9, ...mimeCodecBytes]` to initialize a browser `MediaSource` (`video/mp4; codecs="..."`), and feeds incoming fMP4 chunks into a `SourceBuffer` with a 150-chunk queue cap.
5. **MJPEG / Periodic JPEG Snapshot (`<LiveImage>`)**:
   - Detects ZoneMinder (`nph-zms`), `mode=jpeg`, `mjpg`, `cam.pasuruankota.go.id`, `cctv.langkatkab.go.id`, `cctv.ub.ac.id`, etc.
   - For snapshot endpoints (`cctv.langkatkab.go.id`, `SmartRTSP` `/snapshot.jpg`, `singapore-lta`), polls with `?cachebust=${Date.now()}` every 5–10 seconds, pausing automatically when `document.hidden` is true, and preloading each frame in an offscreen `new Image()` before swapping `src` to prevent flicker.
6. **YouTube / External Embed (`<iframe>`)**: Converts `youtube.com/watch?v=...`, `youtu.be/...`, and `youtube.com/embed/...` into an autoplay muted embed `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`.

### 2.8 Multi-View Functionality
Inspected in `CCTVMultiView-yrsZsmXP.js` (`81.7 KB`):
- Built on **`react-grid-layout`** (`ResponsiveGridLayout`) rendered into `document.body` via `createPortal`.
- **Grid Presets**: `1` (Single Focus), `4` (2×2 Quad), `6` (3×2 Six), `9` (3×3 Nine), `12` (4×3 Twelve), `13` (Hotspot 1 large + 12 small), `16` (4×4 Sixteen).
- **Drag-to-Swap**: Dragging one camera tile onto another swaps their positions in the layout (`onDragStop`).
- **Lazy Playback via `IntersectionObserver`**: Each tile is wrapped in `<LazyStreamCell>`, which observes viewport intersection (`rootMargin: "200px 0px"`). Video decoders are only mounted when a tile is visible on screen.

### 2.9 Responsive Behavior
- Uses a custom `useIsMobile` hook (`window.innerWidth < 1024`) to switch between:
  - Desktop: Left vertical icon rail + collapsible 360px directory panel + floating search bar + Leaflet popups.
  - Mobile: Bottom navigation bar + full-width mobile search header + Vaul bottom-sheet drawers for camera details and directory lists.

### 2.10 Loading States & Error Handling
- **30-Second Watchdog Timer**: Every stream starts a 30s timeout (`30000ms`). If neither `playing` nor `loadeddata` fires within 30s, the player transitions to an error state (`Stream timeout - camera may be offline`).
- **Warming State Polling**: For on-demand transcoding proxies (e.g. `/api/proxy/cctv/surabaya/...`), the endpoint returns `{ warming: true, warmingStatusUrl, pollAfterMs: 1500 }`, and the player displays `"Menyiapkan stream CCTV..."` while polling until `warming === false`.
- **Automatic Retry**: In Multi-View mode, failed streams automatically schedule a retry (`retryCount + 1`).

### 2.11 Data Displayed for Each Camera
Each camera object in `GET /api/cctv` conforms to the following TypeScript interface:
```typescript
interface MatadewaCamera {
  id: string;              // e.g. "bandung-alun-alun-01"
  title: string;           // e.g. "CCTV Alun-Alun 01 (Banceuy)"
  name?: string;           // Optional alias
  lat: number;             // WGS84 Latitude (-11.0 to +6.1 for Indonesia)
  lng: number;             // WGS84 Longitude (95.0 to 141.0 for Indonesia)
  streamingUrl: string;    // Direct .m3u8 / ws:// / jpeg URL or /api/proxy/cctv/...
  status: "live" | "offline";
  source: string;          // Provider identifier, e.g. "PELINDUNG Diskominfo Kota Bandung"
  region: string;          // Regional slug, e.g. "bandung"
  province: string;        // Province name, e.g. "Jawa Barat"
  city?: string;           // City name, e.g. "Bandung"
  regency?: string;        // Regency name, e.g. "Kabupaten Bandung"
  location?: string;       // Street or address description
  category?: string;       // Optional category
  auditComment?: string;   // Detailed technical verification & geotag provenance log
  lastVerified?: string;   // ISO timestamp
}
```

### 2.12 Pagination & Virtualization
- Rather than traditional pagination in the sidebar, `atcsindonesia.com` uses custom virtualized scrolling (`VirtualList` and `VirtualGrid` in `virtual-grid-D8k7WEe8.js`) that calculates visible row indices based on `scrollTop` and `containerHeight` (`overscan = 3`), allowing smooth scrolling through 24,000+ cameras at 60 FPS.

### 2.13 Network Requests Made by the Frontend
| Method | Endpoint | Purpose | Caching |
|---|---|---|---|
| `GET` | `/api/cctv/seed/manifest` | Fetches AES-CBC encrypted shard manifest (5 shards, 23,284 seeded items) | `public, max-age=86400, stale-while-revalidate=604800` |
| `GET` | `/api/cctv/seed/shard/[0..4]` | Fetches encrypted camera seed shards for instant cold start | `public, max-age=86400` |
| `GET` | `/api/cctv?limit=all` | Bulk fetches all 24,472 cameras (15.35 MB JSON) | `private, no-store` |
| `GET` | `/api/cctv/[region]/[provider]` | Fetches cameras for a specific region & provider | `private, no-store` |
| `GET` | `/api/cctv/suggestions?q=...` | Search autocomplete suggestions | `private, no-store` |
| `POST` | `/api/cctv/[id]/status` | Crowdsourced client-side stream live/offline status report | No cache |
| `GET` | `/api/proxy/cctv/[...]` | Server-side CORS/Referer/TLS proxy for restricted streams | Stream |
| `GET` | `/api/summary` | Dashboard summary counters | LocalStorage cached |
| `GET` | `/api/stats/public-online-users` | Active online user counter (polled every 60s) | No cache |
| `POST` | `/api/stats/heartbeat` | Visitor session heartbeat (`matadewa_visitor_id`) | No cache |

### 2.14 JavaScript Bundles & Publicly Exposed Configuration
- **Entry Bundle (`worker-entry-CxX8Iqee.js`, `328 KB`)**:
  - Contains the complete `vu` region-to-provider registry mapping **300+ regional slugs** to **600+ provider IDs**.
  - Contains `Fl` (WebCrypto `AES-GCM` / `RSA-OAEP` / `AES-CBC` helper) and the public key `jl` (`MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAokrXBA72zoMMKJkFClWz...`). Note: For `localStorage` and `/api/cctv/seed/*` decryption (`decryptFromStorage`), it uses the first 16 ASCII bytes of the PEM string (`"-----BEGIN PUBLI"`) as a static `AES-CBC` key!
  - Contains an Easter egg keyboard listener in `Wu`: typing `"balitower"` anywhere on the page toggles `matadewa_hidden_cctv_unlocked = "1"` and loads 1,188 hidden Jakarta BaliTower cameras (`/api/cctv/jakarta/balitower-m?unlock=balitower-m`).

### 2.15 Third-Party Libraries & Integrations
- **Core**: React 19, Next.js App Router (`vinext` on Vite/Rolldown), TypeScript.
- **UI**: Tailwind CSS, Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@radix-ui/react-switch`), Vaul (mobile drawer), Lucide React, `react-toastify`.
- **Map**: `leaflet` (`1.9.4`), `react-leaflet`.
- **Video**: `video.js` + `@videojs/http-streaming`, `mpegts.js`, `jsmpeg.min.js`.
- **Layout**: `react-grid-layout`, `react-resizable`.
- **Auth / Payments / Ads (on reference site)**: `better-auth`, Midtrans Snap, Google Analytics (`G-T09BFMJJ3G`), Google AdSense (`ca-pub-7984487158899375`), Monetag/PropellerAds (`omg10.com`, `n6wxm.com`).

---

## 3. Backend Investigation: Observations vs. Inferences vs. Unknowns

In accordance with strict black-box reverse engineering methodology, findings are categorized by evidentiary certainty:

### 3.1 Confirmed Observations (Verified via Public Responses & Bundles)
1. **Edge Runtime**: HTTP headers (`Server: cloudflare`, `cf-ray`, `Vary: RSC, Accept`) and client bundle filenames (`worker-entry-CxX8Iqee.js`) confirm the application runs on **Cloudflare Workers** using `vinext`.
2. **Provider Adapter Pattern**: Error messages and `auditComment` strings inside `GET /api/cctv` explicitly reference internal TypeScript paths:
   - `src/lib/cctv/index.ts` (provider registry, e.g., `MagelangKotaCCTVProvider`)
   - `Provider bandung.ts`
   - `src/server/wss-proxy.ts` (standalone WebSocket proxy service)
3. **Origin Proxy Routes (`/api/proxy/cctv/*`)**: Confirmed 4,214 camera records route through `/api/proxy/cctv/<provider>/<path>`. As documented inside `auditComment`, the proxy is used strictly when an upstream government media server:
   - Lacks `Access-Control-Allow-Origin: *` (CORS restriction),
   - Enforces a `Referer` hotlink check (e.g. `lampung-cctv` requiring `Referer: https://*.bandarlampungkota.go.id`),
   - Serves over plain `http://` or has an incomplete SSL certificate chain (`TLS incomplete` / self-signed cert on `.go.id` host), or
   - Requires a single-use session token or CSRF handshake (e.g., Surabaya SITS warming, BaliTower molecool API).
4. **Automated Multi-Round Liveness Auditing**: The `auditComment` field on thousands of records reveals an automated background cron pipeline (`fix-cities cron`, `seed-heal`, `newcity onboarding`) that verifies streams across **2 to 6 spaced time windows (20+ minutes apart)** by checking:
   - Master playlist HTTP `200`,
   - Variant playlist `#EXTM3U` without `#EXT-X-ENDLIST`,
   - Advancing `#EXT-X-MEDIA-SEQUENCE` (`MSEQ`) across rounds, and
   - Downloading the freshest media segment via HTTP `Range: bytes=0-262143` (`206 Partial Content`) to verify the **MPEG-TS sync byte (`0x47` at byte 0 and byte 188)** or **fMP4 `moof` box magic**, plus distinct MD5 hashes across rounds to detect frozen capture loops!

### 3.2 Technical Inferences (High-Confidence Architectural Deductions)
1. **Flat Seed + Dynamic Overlay Storage**: Because `auditComment` repeatedly mentions *"seed row missed the flip"*, *"flat seed"*, and *"batch-merge ate the heal"*, the primary camera catalog is maintained as a versioned seed dataset in git/object storage (compiled into the 5 encrypted shards at `/api/cctv/seed/shard/0..4`), combined with a lightweight database or KV/D1 store that records dynamic live/offline status flips from `POST /api/cctv/[id]/status` and cron runs.
2. **Stateless Edge Proxy**: Most `/api/proxy/cctv/*` routes act as stateless Cloudflare Worker `fetch()` pass-throughs that rewrite `Origin`/`Referer`/`User-Agent` headers and rewrite relative paths inside `.m3u8` playlists to point back through `/api/proxy/cctv/*`.

### 3.3 Unknown Internal Implementation Details
1. Exact database engine backing `/api/auth`, `/api/premium`, and dynamic status overrides (likely Cloudflare D1 or Turso/LibSQL given the Cloudflare Workers deployment).
2. Scheduling host for the Python-based auditing scripts referenced in `auditComment` (`python-urllib`, `openssl verify`, `cron`) — likely GitHub Actions or an external worker runner, since `auditComment` notes *"reverse-Nominatim egress-blocked (datacenter policy)"*.

---

## 4. Investigation of Known Starting Portals

| Portal | URL | Technical Stack & Findings |
|---|---|---|
| **1. Pemkot Yogyakarta** | `https://cctv.jogjakota.go.id/` | Bootstrap + jQuery + Leaflet (`1.9.4`) + `hls.js`. Fetches camera JSON via `GET /home/getdata` (`cctv_title`, `cctv_latitude`, `cctv_longitude`, `cctv_link`, `cctv_status`). Streams are served via Wowza/Nginx HLS on `https://cctvjss.jogjakota.go.id/atcs/<stream>.stream/playlist.m3u8` and `mam.jogjaprov.go.id` (154 cameras). |
| **2. Pemprov DI Yogyakarta** | `https://cctv.jogjaprov.go.id/` (and `mam.jogjaprov.go.id`) | Vue 3 + Vite SPA (`/assets/index-ZdikN5bq.js`). Aggregates **620 cameras** across DIY (Kota Jogja, Sleman, Bantul, Kulon Progo, Gunungkidul) via `https://cctv.jogjaprov.go.id/cctv-proxy/cctv-<agency>/streams/<id>.stream.m3u8` with `Access-Control-Allow-Origin: *`. |
| **3. ATCS Dishub Kota Bandung** | `https://atcs-dishub.bandung.go.id/` (plus `pelindung.bandung.go.id`) | Bootstrap 5 + jQuery + Leaflet + Video.js (`7.20.3`). Fetches marker coordinates via `POST /ajax/lokasi`, camera list per intersection via `POST /ajax/cctv-list`, and HLS stream URL via `POST /ajax/cctv-info`. Additionally, Diskominfo Kota Bandung operates **PELINDUNG** (`https://pelindung.bandung.go.id:8443/api/cek` & `:3443/video/<GROUP>/<id>.m3u8`), providing **756 cameras** across Bandung. |
| **4. ATCS Indonesia** | `https://atcsindonesia.com/` | `vinext` (Next.js App Router on Vite/Rolldown) + Cloudflare Workers. Aggregates 24,472 cameras from 614 sources via `/api/cctv`. |
| **5. OpenCCTV** | `https://opencctv.org/` | React + Vite SPA (`/assets/main-Dx0NZvWN.js`) on Cloudflare. Preloads `/api/cameras/markers` with `leaflet.markercluster` across 130,000+ global cameras. |

---

## 5. How PANTAU NUSANTARA Improves Upon the Reference Platform

| Feature / Aspect | `atcsindonesia.com` (Reference) | **PANTAU NUSANTARA** (Target) |
|---|---|---|
| **Cost to Users** | Freemium paywall (Rp 30,000/mo Pro tier) | **100% Free Forever** (No login or paywall) |
| **Daily Watch Time Limit** | 30 minutes/day limit for free users | **Unlimited watch time** |
| **Multi-View Capacity** | Capped at 3 cameras for free users | **1, 2, 4, 6, and 9 cameras free for everyone** |
| **Advertisements** | Intrusive popunders (`omg10.com`) + AdSense | **Zero ads, zero trackers, clean UI** |
| **Hidden Cameras** | 1,188 Jakarta cameras hidden behind secret code | **All verifiable public sources accessible by default** |
| **Data Transparency** | Obfuscated AES seed shards | **Open, documented JSON/SQLite catalog & modular provider adapters** |
| **Protocol Support** | Video.js + mpegts.js + JSMpeg + LiveImage | **Lightweight HLS.js + Native HLS + MJPEG/Snapshot + YouTube/Iframe + Optional Edge CORS Proxy** |

