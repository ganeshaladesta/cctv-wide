# API Documentation — PANTAU NUSANTARA

**Project:** PANTAU NUSANTARA — Indonesia Public CCTV Aggregator  
**Author:** Developed by Ganesha Ladesta  
**Base URL:** `http://localhost:3000` (Local) / Edge Deployment URL  

---

## 1. Overview

All API endpoints are publicly accessible, require **zero paid keys**, and return standard JSON responses (except `/api/proxy`, which streams binary HLS manifests, MPEG-TS segments, or MJPEG frames).

---

## 2. Endpoints Reference

### 2.1 `GET /api/stats`
Returns national dashboard telemetry across all 38 provinces.

**Response (`200 OK`):**
```json
{
  "total_cameras": 23355,
  "online_cameras": 21038,
  "offline_cameras": 2317,
  "total_provinces": 38,
  "total_cities": 557,
  "total_sources": 610,
  "protocols": {
    "HLS": 22618,
    "MJPEG": 344,
    "EMBED": 171,
    "WEBSOCKET": 141,
    "MP4": 71,
    "SNAPSHOT": 10
  },
  "last_updated": "2026-11-10T09:30:00.000Z"
}
```

---

### 2.2 `GET /api/provinces`
Returns all **38 Indonesian provinces** sorted by camera count, including coordinates, island group, and online/offline counts.

**Query Parameters:**
- `island` *(optional)*: Filter by island group (`Sumatera`, `Jawa`, `Bali & Nusa Tenggara`, `Kalimantan`, `Sulawesi`, `Maluku & Papua`).

---

### 2.3 `GET /api/cities`
Returns Indonesian cities and regencies (`Kota` / `Kabupaten`) with camera statistics.

**Query Parameters:**
- `province_id` *(optional)*: Filter by province ID (e.g., `prov-jabar`) or slug (`jawa-barat`).
- `q` *(optional)*: Search city name.

---

### 2.4 `GET /api/sources`
Returns official government CCTV source providers (`Dishub`, `Diskominfo`, `Bina Marga`, `Badilag ACO`, etc.) and their registered provider adapter status.

**Query Parameters:**
- `province_id` *(optional)*: Filter by province ID.
- `city_id` *(optional)*: Filter by city ID.
- `protocol` *(optional)*: Filter by streaming protocol (`HLS`, `MJPEG`, `SNAPSHOT`, `WEBSOCKET`, `MP4`, `EMBED`).

---

### 2.5 `GET /api/cameras`
Search, filter, paginate, or bulk-load cameras for the interactive map and directory.

**Query Parameters:**
- `q` *(optional)*: Search by camera name, street/location, city, province, or source agency.
- `province` *(optional)*: Province ID (`prov-diy`), slug (`di-yogyakarta`), or name (`DI Yogyakarta`).
- `city` *(optional)*: City ID (`city-di-yogyakarta-yogyakarta`), slug, or name.
- `source` *(optional)*: Source ID (`src-jogjaprov`) or name.
- `status` *(optional)*: `ONLINE` or `OFFLINE`.
- `protocol` *(optional)*: `HLS`, `MJPEG`, `SNAPSHOT`, `WEBSOCKET`, `MP4`, or `EMBED`.
- `bbox` *(optional)*: Map viewport bounding box `minLng,minLat,maxLng,maxLat`.
- `ids` *(optional)*: Comma-separated list of camera IDs (used by Multi-View URL hydration `?multi=id1,id2`).
- `mode` *(optional)*:
  - `markers`: Returns compact marker tuples `[id, lat, lng, statusCode, protocolCode, name, cityName, provinceId]` for ultra-fast map loading of all 23,355 cameras (~1.4 MB vs 15 MB).
  - `full` *(default)*: Returns paginated full camera objects.
- `page` *(optional, default `1`)* & `limit` *(optional, default `60`, max `5000`)*: Pagination controls.

---

### 2.6 `GET /api/cameras/[id]`
Returns full details for a single camera, including its source metadata, nearby cameras within 2 km, and live stream verification info.

---

### 2.7 `POST /api/cameras/[id]/status`
Crowdsourced client-side health reporting endpoint. When the browser player detects a stream timeout or successful recovery, it reports the status back to update the live state.

**Request Body:**
```json
{
  "status": "ONLINE",
  "reason": "Playback verified in HLS.js"
}
```

---

### 2.8 `GET /api/proxy`
Stateless CORS, Referer, and HLS playlist-rewriting proxy for government CCTV streams that do not send `Access-Control-Allow-Origin: *` or require a portal `Referer`.

**Query Parameters:**
- `url`: Direct upstream stream URL (validated against SSRF rules: public HTTP/HTTPS only, no private/loopback IPs).
- `upstream`: Relative proxy path (`/api/proxy/cctv/...`) resolved via the upstream edge gateway and rewritten so all nested `.m3u8` variant playlists and `.ts` / `.m4s` segments stream seamlessly in the browser.
- `referer` *(optional)*: Custom `Referer` header when required by municipal media servers (e.g., Bandar Lampung).

---

### 2.9 `GET /api/health`
Performs a live probe of a camera's stream URL (`HEAD` / `GET` with `Range: bytes=0-4095`), verifying HTTP status, `Content-Type`, `#EXTM3U` signature, and response latency in milliseconds.

**Query Parameters:**
- `id`: Camera ID to probe, or `url`: Stream URL to probe.

