/**
 * Microsoft Graph OneDrive Synchronization Engine for Unjuk Rasa Monitoring
 * Worksheet: 'NEW UNRAS 2022-2026'
 * SCC - EAGLE EYES
 */

import { protestStore } from './protest-store';
import { ExcelProtestRow, ProtestSyncLog } from './types/protests';
import * as fs from 'fs';
import * as path from 'path';

export interface MsGraphConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  driveId?: string;
  itemId?: string;
  worksheetName?: string;
}

export interface SyncResult {
  success: boolean;
  status: 'completed' | 'failed' | 'partial' | 'skipped';
  log: ProtestSyncLog;
  message: string;
  source: 'microsoft_graph' | 'sample_fixture';
  durationMs: number;
}

// Global synchronization lock
let isSyncInProgress = false;
let syncStartedAt: number | null = null;
const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute lock timeout safeguard

/**
 * Normalizes Indonesian dates to YYYY-MM-DD
 * Handles:
 * - Excel serial numbers (e.g., 45609)
 * - DD/MM/YYYY, DD-MM-YYYY
 * - YYYY-MM-DD
 * - Indonesian text dates ("13 November 2026", "13 Nop 2026")
 */
export function normalizeExcelDate(val: any): string {
  if (val === null || val === undefined || val === '') {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // Handle Excel Serial Number (e.g., 45000+)
  if (typeof val === 'number' || (!isNaN(Number(val)) && !String(val).includes('-') && !String(val).includes('/'))) {
    const num = Number(val);
    if (num > 30000 && num < 60000) {
      // Excel base date: 1899-12-30 (due to 1900 leap year bug)
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + num * 86400000);
      return date.toISOString().split('T')[0];
    }
  }

  const str = String(val).trim();

  // Standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Indonesian month name parsing
  const idMonths: Record<string, string> = {
    jan: '01', januari: '01',
    feb: '02', februari: '02',
    mar: '03', maret: '03',
    apr: '04', april: '04',
    mei: '05', may: '05',
    jun: '06', juni: '06',
    jul: '07', juli: '07',
    agu: '08', agustus: '08', ags: '08',
    sep: '09', september: '09',
    okt: '10', oktober: '10',
    nop: '11', nov: '11', november: '11',
    des: '12', desember: '12'
  };

  const textMatch = str.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/i);
  if (textMatch) {
    const day = textMatch[1].padStart(2, '0');
    const mStr = textMatch[2].toLowerCase();
    const year = textMatch[3];
    const month = idMonths[mStr] || '01';
    return `${year}-${month}-${day}`;
  }

  // Fallback try standard Date.parse
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Normalizes time strings to clean Indonesian display time e.g., "09:00 WIB"
 */
export function normalizeExcelTime(val: any): string {
  if (val === null || val === undefined || val === '') return '09:00 WIB';

  // Excel serial time fraction (e.g. 0.375 = 09:00:00)
  if (typeof val === 'number') {
    const totalSeconds = Math.round(val * 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} WIB`;
  }

  const str = String(val).trim();
  // Dot to colon
  let clean = str.replace(/(\d{1,2})\.(\d{2})/, '$1:$2');
  if (!clean.toLowerCase().includes('wib') && !clean.toLowerCase().includes('wita') && !clean.toLowerCase().includes('wit')) {
    clean += ' WIB';
  }
  return clean;
}

/**
 * Extracts numeric crowd count from Indonesian phrases like:
 * "± 1.200 orang", "350 peserta", "100 - 200 org"
 */
export function normalizeCrowdEstimate(val: any): { count: number; raw: string } {
  if (val === null || val === undefined || val === '') {
    return { count: 0, raw: 'Belum terkonfirmasi' };
  }

  const raw = String(val).trim();
  if (typeof val === 'number') {
    return { count: Math.round(val), raw: `${val.toLocaleString('id-ID')} orang` };
  }

  // Strip thousands dots (e.g. 1.200 -> 1200)
  const sanitized = raw.replace(/\./g, '');
  const match = sanitized.match(/\d+/g);
  if (match && match.length > 0) {
    const num = parseInt(match[0], 10);
    return { count: isNaN(num) ? 0 : num, raw };
  }

  return { count: 0, raw };
}

/**
 * Validates whether latitude and longitude are within Indonesian territory
 * Bounding Box Indonesia: Lat [-11.5, 6.5], Lng [94.5, 141.5]
 */
export function validateIndonesianCoordinates(lat: any, lng: any): { lat: number | null; lng: number | null } {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return { lat: null, lng: null };
  }

  const nLat = typeof lat === 'number' ? lat : parseFloat(String(lat).replace(',', '.'));
  const nLng = typeof lng === 'number' ? lng : parseFloat(String(lng).replace(',', '.'));

  if (isNaN(nLat) || isNaN(nLng)) {
    return { lat: null, lng: null };
  }

  // Check 0,0 or outside Indonesia bounds
  if (nLat === 0 && nLng === 0) {
    return { lat: null, lng: null };
  }

  if (nLat >= -11.5 && nLat <= 6.5 && nLng >= 94.5 && nLng <= 141.5) {
    return { lat: Number(nLat.toFixed(6)), lng: Number(nLng.toFixed(6)) };
  }

  return { lat: null, lng: null };
}

/**
 * Automatically infers category code from issue / demanding party keywords
 */
export function inferProtestCategory(isu: string = '', organisasi: string = ''): string {
  const text = `${isu} ${organisasi}`.toLowerCase();

  if (text.includes('buruh') || text.includes('upah') || text.includes('kspi') || text.includes('fspmi') || text.includes('spsi') || text.includes('ketenagakerjaan') || text.includes('pesangon') || text.includes('pkwt')) {
    return 'ketenagakerjaan';
  }
  if (text.includes('dpr') || text.includes('mk') || text.includes('kpk') || text.includes('pemilu') || text.includes('uu') || text.includes('ruu') || text.includes('hukum') || text.includes('kejaksaan') || text.includes('polri')) {
    return 'politik_hukum';
  }
  if (text.includes('lingkungan') || text.includes('amdal') || text.includes('tambang') || text.includes('tanah') || text.includes('agraria') || text.includes('walhi') || text.includes('sawit') || text.includes('relokasi')) {
    return 'lingkungan_agraria';
  }
  if (text.includes('mahasiswa') || text.includes('bem') || text.includes('kampus') || text.includes('ukt') || text.includes('guru') || text.includes('pendidikan')) {
    return 'pendidikan_mahasiswa';
  }
  if (text.includes('driver') || text.includes('ojol') || text.includes('tarif') || text.includes('angkot') || text.includes('transportasi') || text.includes('terminal')) {
    return 'transportasi';
  }
  if (text.includes('ormas') || text.includes('fpi') || text.includes('agama') || text.includes('masjid') || text.includes('gereja')) {
    return 'keagamaan_ormas';
  }
  if (text.includes('pajak') || text.includes('umkm') || text.includes('pedagang') || text.includes('pasar') || text.includes('bbm') || text.includes('sembako') || text.includes('harga')) {
    return 'sosial_ekonomi';
  }

  return 'sosial_ekonomi';
}

/**
 * Normalizes column headers from arbitrary Indonesian formats
 */
export function mapHeaderIndex(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    if (!h) return;
    const clean = String(h).trim().toUpperCase().replace(/[_\-\.]/g, ' ');

    if (clean.includes('ID') && clean.includes('KEJADIAN')) map['ID_KEJADIAN'] = idx;
    else if (clean === 'ID' || clean === 'NO' || clean === 'NOMOR') map['ID_KEJADIAN'] = map['ID_KEJADIAN'] ?? idx;
    else if (clean.includes('KODE') || clean.includes('CODE')) map['KODE_UNRAS'] = idx;
    else if (clean.includes('TANGGAL') || clean === 'TGL' || clean === 'DATE') map['TANGGAL'] = idx;
    else if (clean.includes('WAKTU') || clean === 'JAM' || clean === 'TIME') map['WAKTU'] = idx;
    else if (clean.includes('LOKASI') || clean === 'TEMPAT' || clean.includes('TEMPAT AKSI')) map['LOKASI'] = idx;
    else if (clean.includes('TITIK KUMPUL') || clean.includes('TIKUM')) map['TITIK_KUMPUL'] = idx;
    else if (clean.includes('SASARAN') || clean.includes('TARGET') || clean.includes('TUJUAN')) map['SASARAN'] = idx;
    else if (clean.includes('ISU') || clean.includes('TUNTUTAN') || clean.includes('PERIHAL') || clean.includes('MASALAH')) map['ISU'] = idx;
    else if (clean.includes('MASSA') || clean.includes('JUMLAH') || clean.includes('ESTIMASI')) map['JUMLAH_MASSA'] = idx;
    else if (clean.includes('ORGANISASI') || clean.includes('ELEMEN') || clean.includes('PELAKSANA') || clean.includes('ORMAWA')) map['ORGANISASI'] = idx;
    else if (clean.includes('KORLAP') || clean.includes('PENANGGUNG') || clean.includes('PJ')) map['KORLAP'] = idx;
    else if (clean.includes('WILAYAH') || clean.includes('POLRES') || clean.includes('POLDA') || clean.includes('HUKUM')) map['WILAYAH_HUKUM'] = idx;
    else if (clean.includes('PROVINSI') || clean === 'PROV') map['PROVINSI'] = idx;
    else if (clean.includes('KOTA') || clean.includes('KABUPATEN') || clean === 'KAB') map['KOTA_KABUPATEN'] = idx;
    else if (clean.includes('LAT') || clean === 'LATITUDE') map['LATITUDE'] = idx;
    else if (clean.includes('LNG') || clean.includes('LON') || clean === 'LONGITUDE') map['LONGITUDE'] = idx;
    else if (clean.includes('STATUS')) map['STATUS'] = idx;
    else if (clean.includes('KET') || clean.includes('KETERANGAN') || clean.includes('CATATAN')) map['KETERANGAN'] = idx;
  });
  return map;
}

/**
 * Microsoft Graph OneDrive Integration & Sync Runner
 */
export class MsGraphSyncService {
  private config: MsGraphConfig;

  constructor(customConfig?: Partial<MsGraphConfig>) {
    this.config = {
      tenantId: process.env.MS_GRAPH_TENANT_ID || process.env.AZURE_TENANT_ID,
      clientId: process.env.MS_GRAPH_CLIENT_ID || process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET,
      driveId: process.env.MS_GRAPH_DRIVE_ID,
      itemId: process.env.MS_GRAPH_ITEM_ID,
      worksheetName: process.env.MS_GRAPH_WORKSHEET_NAME || 'NEW UNRAS 2022-2026',
      ...customConfig
    };
  }

  /**
   * Check if live Microsoft Graph credentials are fully configured
   */
  public isConfigured(): boolean {
    return Boolean(
      this.config.tenantId &&
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.driveId &&
      this.config.itemId
    );
  }

  /**
   * Acquire OAuth2 App Token from Azure AD / Microsoft Entra ID
   */
  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Microsoft Graph credentials are incomplete.');
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
      scope: 'https://graph.microsoft.com/.default'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Microsoft OAuth2 token error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  /**
   * Fetch worksheet data using Microsoft Graph Workbook API:
   * GET /v1.0/drives/{driveId}/items/{itemId}/workbook/worksheets('{worksheetName}')/usedRange(valuesOnly=true)
   */
  public async fetchWorkbookRows(): Promise<ExcelProtestRow[]> {
    const accessToken = await this.getAccessToken();
    const encodedSheet = encodeURIComponent(this.config.worksheetName || 'NEW UNRAS 2022-2026');
    const url = `https://graph.microsoft.com/v1.0/drives/${this.config.driveId}/items/${this.config.itemId}/workbook/worksheets('${encodedSheet}')/usedRange(valuesOnly=true)`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Graph Workbook API error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    const values: any[][] = json.values || json.text || [];
    if (!values || values.length === 0) {
      return [];
    }

    return this.parseWorkbookGrid(values);
  }

  /**
   * Parses 2D Excel values array into normalized ExcelProtestRow objects
   */
  public parseWorkbookGrid(grid: any[][]): ExcelProtestRow[] {
    if (grid.length < 2) return [];

    const rawHeaders = grid[0].map(c => String(c || '').trim());
    const colMap = mapHeaderIndex(rawHeaders);

    const rows: ExcelProtestRow[] = [];

    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row || row.length === 0) continue;

      const getVal = (key: string): any => {
        const colIdx = colMap[key];
        return colIdx !== undefined && colIdx < row.length ? row[colIdx] : undefined;
      };

      const idKejadian = String(getVal('ID_KEJADIAN') || '').trim();
      const kodeUnras = String(getVal('KODE_UNRAS') || '').trim();
      const lokasi = String(getVal('LOKASI') || '').trim();
      const isu = String(getVal('ISU') || '').trim();
      const tanggalRaw = getVal('TANGGAL');

      // Skip row if it has neither an ID nor core content
      if (!idKejadian && !kodeUnras && !lokasi && !isu) {
        continue;
      }

      const rawCrowd = getVal('JUMLAH_MASSA');
      const crowd = normalizeCrowdEstimate(rawCrowd);
      const rawLat = getVal('LATITUDE');
      const rawLng = getVal('LONGITUDE');
      const coords = validateIndonesianCoordinates(rawLat, rawLng);

      const excelRow: ExcelProtestRow = {
        'ID KEJADIAN': idKejadian || undefined,
        'KODE_UNRAS': kodeUnras || undefined,
        'TANGGAL': normalizeExcelDate(tanggalRaw),
        'WAKTU': normalizeExcelTime(getVal('WAKTU')),
        'LOKASI': lokasi || 'Lokasi Belum Ditentukan',
        'TITIK KUMPUL': String(getVal('TITIK_KUMPUL') || '').trim() || undefined,
        'SASARAN': String(getVal('SASARAN') || '').trim() || undefined,
        'ISU': isu || 'Aksi Penyampaian Pendapat di Muka Umum',
        'JUMLAH MASSA': crowd.raw,
        'ORGANISASI': String(getVal('ORGANISASI') || '').trim() || undefined,
        'KORLAP': String(getVal('KORLAP') || '').trim() || undefined,
        'WILAYAH HUKUM': String(getVal('WILAYAH_HUKUM') || '').trim() || undefined,
        'PROVINSI': String(getVal('PROVINSI') || 'DKI Jakarta').trim(),
        'KOTA/KABUPATEN': String(getVal('KOTA_KABUPATEN') || '').trim() || undefined,
        'LATITUDE': coords.lat ?? undefined,
        'LONGITUDE': coords.lng ?? undefined,
        'STATUS': getVal('STATUS'),
        'KETERANGAN': String(getVal('KETERANGAN') || '').trim() || undefined
      };

      rows.push(excelRow);
    }

    return rows;
  }

  /**
   * Loads offline sample fixture for development, automated verification, or fallback
   */
  public loadLocalFixture(): ExcelProtestRow[] {
    const fixturePath = path.join(process.cwd(), 'data', 'sample-unras.json');
    if (fs.existsSync(fixturePath)) {
      const content = fs.readFileSync(fixturePath, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  }

  /**
   * Main synchronization execution method
   */
  public async executeSync(options: {
    syncType?: 'scheduled' | 'manual';
    triggeredBy?: string;
    forceFixture?: boolean;
  } = {}): Promise<SyncResult> {
    const { syncType = 'manual', triggeredBy = 'system', forceFixture = false } = options;
    const startTime = Date.now();

    const triggerType: ProtestSyncLog["triggered_by"] =
      syncType === 'scheduled'
        ? 'scheduler_cron'
        : (triggeredBy.includes('admin') || triggeredBy.includes('operator') ? 'manual_admin' : 'system');

    // Check concurrency guard lock
    if (isSyncInProgress) {
      if (syncStartedAt && Date.now() - syncStartedAt < SYNC_TIMEOUT_MS) {
        const skippedLog: ProtestSyncLog = {
          id: `sync-skip-${Date.now()}`,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: 'skipped',
          triggered_by: triggerType,
          triggered_by_user: triggeredBy,
          source_worksheet: this.config.worksheetName || 'NEW UNRAS 2022-2026',
          records_processed: 0,
          records_created: 0,
          records_updated: 0,
          records_skipped: 0,
          error_details: 'Penyelarasan dibatalkan: Proses sinkronisasi lain sedang berjalan.',
          duration_ms: 0
        };
        return {
          success: false,
          status: 'skipped',
          log: skippedLog,
          message: 'Penyelarasan sedang berlangsung di sesi lain. Silakan tunggu beberapa saat.',
          source: 'sample_fixture',
          durationMs: 0
        };
      }
    }

    // Acquire lock
    isSyncInProgress = true;
    syncStartedAt = Date.now();

    const initialLog = protestStore.createSyncLog({
      triggered_by: triggerType,
      triggered_by_user: triggeredBy,
      source_worksheet: this.config.worksheetName || 'NEW UNRAS 2022-2026'
    });

    let sourceUsed: 'microsoft_graph' | 'sample_fixture' = 'sample_fixture';
    let rows: ExcelProtestRow[] = [];
    const errors: string[] = [];

    try {
      if (this.isConfigured() && !forceFixture) {
        try {
          rows = await this.fetchWorkbookRows();
          sourceUsed = 'microsoft_graph';
        } catch (graphError: any) {
          errors.push(`Microsoft Graph API error: ${graphError.message || graphError}. Menggunakan sample fixture offline.`);
          rows = this.loadLocalFixture();
          sourceUsed = 'sample_fixture';
        }
      } else {
        rows = this.loadLocalFixture();
        sourceUsed = 'sample_fixture';
      }

      if (rows.length === 0) {
        throw new Error('Tidak ada baris data unjuk rasa yang ditemukan untuk diselaraskan.');
      }

      // Map rows into data store batch structure
      const mappedRecords = rows.map((r, index) => {
        const idKejadian = r['ID KEJADIAN'] || r['KODE_UNRAS'] || `UNR-${r.TANGGAL.replace(/[\/\-]/g, '')}-${String(index + 1).padStart(3, '0')}`;
        const kodeUnras = r['KODE_UNRAS'] || idKejadian;
        const crowd = typeof r['JUMLAH MASSA'] === 'number' ? r['JUMLAH MASSA'] : normalizeCrowdEstimate(r['JUMLAH MASSA']).count;
        const coords = validateIndonesianCoordinates(r.LATITUDE, r.LONGITUDE);

        return {
          id_kejadian: idKejadian,
          kode_unras: kodeUnras,
          tanggal: r.TANGGAL,
          waktu_mulai: r.WAKTU || '09:00 WIB',
          waktu_selesai: null,
          lokasi: r.LOKASI,
          titik_kumpul: r['TITIK KUMPUL'] || null,
          sasaran_aksi: r.SASARAN || null,
          isu_tuntutan: r.ISU,
          estimasi_massa_source: crowd || null,
          organisasi_kelompok: r.ORGANISASI || null,
          korlap_pimpinan: r.KORLAP || null,
          wilayah_hukum: r['WILAYAH HUKUM'] || null,
          provinsi: r.PROVINSI || 'DKI Jakarta',
          kota_kabupaten: r['KOTA/KABUPATEN'] || null,
          keterangan_source: r.KETERANGAN || null,
          validated_lat: coords.lat,
          validated_lng: coords.lng,
          category_id: inferProtestCategory(r.ISU, r.ORGANISASI),
          raw_source_payload: r as unknown as Record<string, unknown>
        };
      });

      // Perform idempotent upsert into store
      const upsertResult = protestStore.upsertFromExcelBatch(mappedRecords);

      const durationMs = Date.now() - startTime;
      const finalStatus: ProtestSyncLog["status"] =
        upsertResult.skipped > 0
          ? (upsertResult.created + upsertResult.updated > 0 ? 'partial' : 'failed')
          : 'success';

      const finalLog: ProtestSyncLog = {
        id: initialLog.id,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        status: finalStatus,
        triggered_by: triggerType,
        triggered_by_user: triggeredBy,
        source_worksheet: this.config.worksheetName || 'NEW UNRAS 2022-2026',
        records_processed: upsertResult.processed,
        records_created: upsertResult.created,
        records_updated: upsertResult.updated,
        records_skipped: upsertResult.skipped,
        error_details: errors.length > 0 ? errors.join('; ') : null,
        duration_ms: durationMs
      };

      protestStore.updateSyncLog(initialLog.id, finalLog);

      return {
        success: finalStatus !== 'failed',
        status: finalStatus === 'success' ? 'completed' : finalStatus,
        log: finalLog,
        message: `Penyelarasan berhasil (${sourceUsed === 'microsoft_graph' ? 'OneDrive Live' : 'Data Sample Fixture'}): ${upsertResult.processed} dipindai, ${upsertResult.created} baru, ${upsertResult.updated} diperbarui, ${upsertResult.skipped} tidak berubah/dilewati.`,
        source: sourceUsed,
        durationMs
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const failedLog: ProtestSyncLog = {
        id: initialLog.id,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'failed',
        triggered_by: triggerType,
        triggered_by_user: triggeredBy,
        source_worksheet: this.config.worksheetName || 'NEW UNRAS 2022-2026',
        records_processed: 0,
        records_created: 0,
        records_updated: 0,
        records_skipped: 0,
        error_details: `Gagal menjalankan sinkronisasi: ${err.message || String(err)}`,
        duration_ms: durationMs
      };

      protestStore.updateSyncLog(initialLog.id, failedLog);

      return {
        success: false,
        status: 'failed',
        log: failedLog,
        message: `Penyelarasan gagal: ${err.message || String(err)}`,
        source: sourceUsed,
        durationMs
      };
    } finally {
      // Release lock
      isSyncInProgress = false;
      syncStartedAt = null;
    }
  }
}

export const msGraphSyncService = new MsGraphSyncService();
