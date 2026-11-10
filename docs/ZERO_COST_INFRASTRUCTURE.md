# Zero-Cost Infrastructure & Architecture Evaluation

**Project:** PANTAU NUSANTARA — Indonesia Public CCTV Aggregator  
**Author:** Developed by Ganesha Ladesta  
**Phase:** Phase 1 — Zero-Cost Architecture & Hosting Plan  

---

## 1. Zero-Cost Design Principles

A national CCTV aggregator serving **23,500+ cameras across all 38 Indonesian provinces** can incur massive bandwidth and compute bills if architected naively (e.g., transcoding video streams on a central server or running unindexed database queries on every map pan).

To guarantee **Rp 0 / $0 monthly operating cost** while matching or exceeding `atcsindonesia.com`, **PANTAU NUSANTARA** follows four strict engineering rules:
1. **Direct-to-Browser Video Delivery (98%+ Bandwidth Offload)**:
   - Over 83% of Indonesian government CCTV streams (Jasa Marga, Hutama Karya, Pemprov DIY, Pemkot Jogja, Pelindung Bandung, Medan ATCS, Denpasar ATCS, Samarinda, Badilag ACO, ZoneMinder MJPEG, YouTube) send `Access-Control-Allow-Origin: *` or render natively in `<img>`/`<iframe>`. The user's browser connects directly to the government media server via `hls.js` or `<img>`.
   - For the ~15% of streams that lack CORS headers or require a specific `Referer` header, a lightweight stateless Edge/API proxy rewrites only the `.m3u8` manifest and forwards requests without server-side FFmpeg transcoding.
2. **Pre-Indexed Static / Edge Catalog + SQLite**:
   - Camera coordinates and metadata change on a timescale of hours/days, not milliseconds.
   - Storing normalized data in `/data/provinces.json`, `/data/cities.json`, `/data/sources.json`, and `/data/cameras.json` (backed by a local/edge **SQLite** database via `better-sqlite3` / Cloudflare D1 / Turso Free) allows instant zero-cost reads and sub-10ms filtering.
3. **Viewport-Culled Canvas Map + Lazy Multi-View**:
   - Rendering 23,500+ DOM markers crashes browsers. Using **Leaflet with Canvas rendering + Supercluster / spatial grid clustering** and **`IntersectionObserver` lazy player mounting** keeps client RAM low and prevents unnecessary upstream stream requests.
4. **Scheduled Ingestion via GitHub Actions Free Tier**:
   - Provider adapter syncs and multi-round stream health checks run on a scheduled GitHub Actions workflow (`cron: '0 */6 * * *'`), committing updated status snapshots or syncing to Cloudflare D1 / Turso Free within free-tier quotas.

---

## 2. Zero-Cost Stack Evaluation Matrix

| Layer | Selected Technology | Free Tier Quota | Why Selected |
|---|---|---|---|
| **Frontend Framework** | **Next.js (App Router) + TypeScript** | Open Source (MIT) | Supports both Server/API routes (for stream CORS proxy and dynamic API endpoints) and static generation for SEO regional directory pages. |
| **Styling & UI** | **Tailwind CSS + shadcn/ui + Lucide Icons** | Open Source (MIT) | Zero-runtime CSS overhead, accessible Radix primitives, dark-mode-first command center aesthetic. |
| **Interactive Map** | **Leaflet + OpenStreetMap + CartoDB Dark Matter / Esri World Imagery** | **100% Free** (No API key or billing required) | Eliminates paid Google Maps or Mapbox bills while providing Street, Dark Command-Center, Terrain, and Satellite views. |
| **Video Playback** | **HLS.js + Native HTML5 Video + Buffered MJPEG/Snapshot + Iframe** | Open Source (Apache 2.0) | Handles HLS (`.m3u8`), MP4, MJPEG (`nph-zms`), periodic JPEG snapshots, and YouTube embeds natively in browser. |
| **Database & Catalog** | **SQLite (`better-sqlite3` / Drizzle or raw SQL) + Normalized JSON (`/data/*.json`)** | **100% Free** (Local/bundled SQLite + compatible with Cloudflare D1 5GB Free / Turso 9GB Free) | Zero external database latency, works 100% offline/locally out of the box, and deploys seamlessly to Cloudflare D1 or Turso Free. |
| **Hosting & Edge** | **Cloudflare Pages / Workers Free** (or Vercel Free / Self-hosted Docker) | **100,000 req/day free**, unlimited static bandwidth | Same edge network used by `atcsindonesia.com`, zero bandwidth fees for static assets and catalog shards. |
| **Automated Ingestion & Health Monitoring** | **Node.js / TypeScript CLI + GitHub Actions Cron** | **2,000 CI minutes/month free** (Unlimited on public repos) | Runs modular provider adapters (`JogjaATCSProvider`, `BandungATCSProvider`, `JakartaCCTVProvider`, etc.) and stream health probes on schedule. |

---

## 3. Recommended Database & Data Architecture

We will implement both:
1. **Normalized JSON Datasets in `/data/`** (required deliverable, human-inspectable, zero-config):
   - `/data/provinces.json` — All 38 Indonesian provinces with ISO codes, slugs, bounding boxes/centroids, and camera counts.
   - `/data/cities.json` — All 420+ Indonesian cities and regencies linked to `province_id`.
   - `/data/sources.json` — All 600+ government agencies and CCTV portals (`id`, `name`, `institution`, `province_id`, `city_id`, `official_url`, `protocol`, `requires_proxy`).
   - `/data/cameras.json` — Normalized, clean catalog of verified Indonesian public CCTV cameras (`id`, `name`, `province_id`, `city_id`, `source_id`, `latitude`, `longitude`, `stream_url`, `source_url`, `protocol`, `status`, `last_checked_at`).
2. **Modular SQLite Schema (`src/lib/db/schema.sql`)**:
   - Tables: `provinces`, `cities`, `sources`, `cameras`, `camera_status`, `camera_checks`, `source_sync_logs`.
   - Seeded automatically from `/data/*.json` and queryable via `/api/cameras`, `/api/provinces`, `/api/sources`, `/api/stats`, and `/api/health`.

