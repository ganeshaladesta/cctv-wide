# Deployment Guide — PANTAU NUSANTARA

**Project:** PANTAU NUSANTARA — Indonesia Public CCTV Aggregator  
**Author:** Developed by Ganesha Ladesta  

---

## 1. Local Development & Production Run

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` / `v24.x` (verified on `v24.21.0`)
- **npm**: `v10+`
- Zero external API keys or paid services required.

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. (Optional) Rebuild normalized 38-province datasets & SQLite DB
npm run sync:data

# 3. Start development server
npm run dev

# 4. Build & run production server
npm run build
npm run start
```

Open `http://localhost:3000` in your browser.

---

## 2. Zero-Cost Cloud Deployment Options

### Option A: Cloudflare Pages / Workers (Recommended — $0/month)
1. Push the repository to GitHub.
2. In the Cloudflare Dashboard, go to **Workers & Pages -> Create Application -> Pages -> Connect to Git**.
3. Configure build settings:
   - **Framework Preset**: `Next.js` (`@cloudflare/next-on-pages` or OpenNext Cloudflare adapter)
   - **Build Command**: `npm run build`
4. Optional D1 Database binding:
   ```bash
   npx wrangler d1 create pantau-nusantara-db
   npx wrangler d1 execute pantau-nusantara-db --file=src/lib/db/schema.sql
   ```

### Option B: Vercel Hobby Tier ($0/month)
1. Import the GitHub repository on [vercel.com/new](https://vercel.com/new).
2. Leave all environment variables blank (none required).
3. Click **Deploy** — `/data/*.json` files are bundled automatically with the serverless/edge routes.

### Option C: Self-Hosted Docker / Free Tier ARM VM ($0/month)
```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 3. Scheduled CCTV Source Sync & Health Check (GitHub Actions)

Create `.github/workflows/sync-cctv.yml` to run the provider discovery and stream verification engine every 6 hours within GitHub Actions' free tier:

```yaml
name: Sync Indonesia Public CCTV Sources
on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run health:check
```

