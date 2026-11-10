# SCC - EAGLE EYES — Integrated Monitoring System

**Description:** Sistem pemantauan CCTV lalu lintas dan infrastruktur secara terintegrasi untuk mendukung monitoring situasi secara real-time.  
**Copyright:** Developed by Ganesha Ladesta.  
**Coverage:** 23,355+ Public Traffic & Municipal CCTV Cameras across all **38 Indonesian Provinces**, **557 Cities/Regencies**, and **610+ Government Sources** (`Dishub ATCS`, `Diskominfo`, `Bina Marga`, `Jasa Marga`, `Hutama Karya`, `Jakarta Smart City / BaliTower`, `Pemprov DIY`, `Badilag ACO`).

---

## Key Features
- **100% Free & Zero-Cost Architecture**: No paywalls, no daily watch-time limits, no popunder ads, and zero paid API dependencies.
- **Interactive Nusantara Map**: Powered by **Leaflet + OpenStreetMap** (Dark Command Center, Standard OSM, OpenTopoMap, Esri Satellite) with high-speed Canvas rendering and spatial marker clustering across 23,355+ coordinates.
- **Multi-View Monitoring Wall**: View **1, 2, 4, 6, or 9 cameras** simultaneously with `IntersectionObserver` lazy playback, regional presets, and shareable wall URLs.
- **Universal CCTV Player**: Automatic protocol detection for **HLS (`.m3u8`)**, **MJPEG**, **Periodic JPEG Snapshots**, **MP4**, **WebSocket**, and **Embedded Streams**, with automatic fallback to `/api/proxy` when a government media server lacks CORS headers.
- **Hierarchical 38-Province Directory**: Browse `Indonesia → Province → City/Regency → Camera → Live Stream` at `/kamera`.

---

## Documentation Index (`/docs`)
- [Reverse Engineering Report](docs/REVERSE_ENGINEERING_REPORT.md)
- [38-Province CCTV Source Inventory](docs/CCTV_SOURCE_INVENTORY.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Zero-Cost Infrastructure Evaluation](docs/ZERO_COST_INFRASTRUCTURE.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Testing & Verification Report](docs/TESTING_REPORT.md)

---

## Quick Start

```bash
# Install dependencies
npm install

# Run automated verification suite
npm test

# Start development server at http://localhost:3000
npm run dev

# Build for production
npm run build
npm start
```

