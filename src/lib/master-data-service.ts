import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import {
  MasterKpKpw,
  MasterRegional,
  MasterProvinsi,
  MasterLokasi,
  MasterDataAuditReview
} from "./master-data-types";
import {
  GROUNDED_KP_KPW,
  GROUNDED_REGIONAL,
  GROUNDED_PROVINSI,
  GROUNDED_LOKASI
} from "./master-data-hierarchy";

export class MasterDataService {
  /**
   * 1. Get List of KP / KPw
   */
  async getKpKpwList(): Promise<MasterKpKpw[]> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from("master_kp_kpw")
            .select("*")
            .eq("is_active", true)
            .order("code", { ascending: true });
          if (!error && data && data.length > 0) {
            return data as MasterKpKpw[];
          }
        } catch (err) {
          console.warn("[MasterDataService] Supabase fetch failed, fallback to grounded:", err);
        }
      }
    }
    return GROUNDED_KP_KPW.filter((x) => x.is_active);
  }

  /**
   * 2. Get List of Regional filtered by KP / KPw (by ID or Code)
   */
  async getRegionalList(kpKpwIdOrCode?: string): Promise<MasterRegional[]> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        try {
          let query = supabase.from("master_regional").select("*").eq("is_active", true);

          if (kpKpwIdOrCode) {
            // Find parent KP ID if code was passed
            const kpList = await this.getKpKpwList();
            const matchedKp = kpList.find(
              (k) => k.id === kpKpwIdOrCode || k.code.toLowerCase() === kpKpwIdOrCode.toLowerCase()
            );
            if (matchedKp) {
              query = query.eq("kp_kpw_id", matchedKp.id);
            } else {
              query = query.eq("kp_kpw_id", kpKpwIdOrCode);
            }
          }

          const { data, error } = await query.order("name", { ascending: true });
          if (!error && data && data.length > 0) {
            return data as MasterRegional[];
          }
        } catch (err) {
          console.warn("[MasterDataService] Supabase regional fetch failed, fallback to grounded:", err);
        }
      }
    }

    if (!kpKpwIdOrCode) {
      return GROUNDED_REGIONAL.filter((x) => x.is_active);
    }

    const kp = GROUNDED_KP_KPW.find(
      (k) => k.id === kpKpwIdOrCode || k.code.toLowerCase() === kpKpwIdOrCode.toLowerCase()
    );
    if (!kp) return [];

    return GROUNDED_REGIONAL.filter((r) => r.kp_kpw_id === kp.id && r.is_active);
  }

  /**
   * 3. Get List of Provinsi filtered by Regional (by ID or Name)
   */
  async getProvinsiList(regionalIdOrName?: string): Promise<MasterProvinsi[]> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        try {
          let query = supabase.from("master_provinsi").select("*").eq("is_active", true);

          if (regionalIdOrName) {
            const regionalList = await this.getRegionalList();
            const matchedReg = regionalList.find(
              (r) =>
                r.id === regionalIdOrName ||
                r.name.toLowerCase() === regionalIdOrName.toLowerCase() ||
                r.normalized_name.toLowerCase() === regionalIdOrName.toLowerCase()
            );
            if (matchedReg) {
              query = query.eq("regional_id", matchedReg.id);
            } else {
              query = query.eq("regional_id", regionalIdOrName);
            }
          }

          const { data, error } = await query.order("name", { ascending: true });
          if (!error && data && data.length > 0) {
            return data as MasterProvinsi[];
          }
        } catch (err) {
          console.warn("[MasterDataService] Supabase provinsi fetch failed, fallback to grounded:", err);
        }
      }
    }

    if (!regionalIdOrName) {
      return GROUNDED_PROVINSI.filter((x) => x.is_active);
    }

    const reg = GROUNDED_REGIONAL.find(
      (r) =>
        r.id === regionalIdOrName ||
        r.name.toLowerCase() === regionalIdOrName.toLowerCase() ||
        r.normalized_name.toLowerCase() === regionalIdOrName.toLowerCase()
    );
    if (!reg) return [];

    return GROUNDED_PROVINSI.filter((p) => p.regional_id === reg.id && p.is_active);
  }

  /**
   * 4. Get List of Lokasi filtered by Provinsi (by ID or Name) and optionally Regional
   */
  async getLokasiList(provinsiIdOrName?: string, regionalIdOrName?: string): Promise<MasterLokasi[]> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        try {
          let query = supabase.from("master_lokasi").select("*").eq("is_active", true);

          if (provinsiIdOrName) {
            const provList = await this.getProvinsiList(regionalIdOrName);
            const matchedProv = provList.find(
              (p) =>
                p.id === provinsiIdOrName ||
                p.name.toLowerCase() === provinsiIdOrName.toLowerCase() ||
                p.normalized_name.toLowerCase() === provinsiIdOrName.toLowerCase()
            );
            if (matchedProv) {
              query = query.eq("provinsi_id", matchedProv.id);
            } else {
              query = query.eq("provinsi_id", provinsiIdOrName);
            }
          }

          const { data, error } = await query.order("name", { ascending: true });
          if (!error && data && data.length > 0) {
            return data as MasterLokasi[];
          }
        } catch (err) {
          console.warn("[MasterDataService] Supabase lokasi fetch failed, fallback to grounded:", err);
        }
      }
    }

    if (!provinsiIdOrName) {
      return GROUNDED_LOKASI.filter((x) => x.is_active);
    }

    let provCandidates = GROUNDED_PROVINSI.filter(
      (p) =>
        p.id === provinsiIdOrName ||
        p.name.toLowerCase() === provinsiIdOrName.toLowerCase() ||
        p.normalized_name.toLowerCase() === provinsiIdOrName.toLowerCase()
    );

    if (regionalIdOrName) {
      const reg = GROUNDED_REGIONAL.find(
        (r) =>
          r.id === regionalIdOrName ||
          r.name.toLowerCase() === regionalIdOrName.toLowerCase() ||
          r.normalized_name.toLowerCase() === regionalIdOrName.toLowerCase()
      );
      if (reg) {
        provCandidates = provCandidates.filter((p) => p.regional_id === reg.id);
      }
    }

    if (provCandidates.length === 0) return [];
    const provIds = new Set(provCandidates.map((p) => p.id));
    return GROUNDED_LOKASI.filter((l) => provIds.has(l.provinsi_id) && l.is_active);
  }

  /**
   * 5. Server-Side Hierarchy Validation
   * Ensures that the submitted combination of KP/KPw -> Regional -> Provinsi -> Lokasi is valid.
   */
  async validateHierarchy(
    kpKpw: string,
    regional: string,
    provinsi: string,
    lokasi?: string | null
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!kpKpw || !regional || !provinsi) {
      return { valid: false, reason: "KP/KPw, Regional, dan Provinsi wajib diisi." };
    }

    const kpList = await this.getKpKpwList();
    const kp = kpList.find((k) => k.code.toLowerCase() === kpKpw.trim().toLowerCase());
    if (!kp) {
      return { valid: false, reason: `KP/KPw '${kpKpw}' tidak dikenali dalam master data.` };
    }

    const regList = await this.getRegionalList(kp.code);
    const reg = regList.find(
      (r) =>
        r.name.toLowerCase() === regional.trim().toLowerCase() ||
        r.normalized_name.toLowerCase() === regional.trim().toLowerCase()
    );
    if (!reg) {
      return {
        valid: false,
        reason: `Regional '${regional}' tidak valid untuk ${kp.code}. Pilihan yang diizinkan: ${regList.map((r) => r.name).join(", ")}`
      };
    }

    const provList = await this.getProvinsiList(reg.name);
    const prov = provList.find(
      (p) =>
        p.name.toLowerCase() === provinsi.trim().toLowerCase() ||
        p.normalized_name.toLowerCase() === provinsi.trim().toLowerCase()
    );
    if (!prov) {
      return {
        valid: false,
        reason: `Provinsi '${provinsi}' tidak valid untuk Regional ${reg.name}.`
      };
    }

    if (lokasi && lokasi.trim()) {
      const lokList = await this.getLokasiList(prov.name);
      const lok = lokList.find(
        (l) =>
          l.name.toLowerCase() === lokasi.trim().toLowerCase() ||
          l.normalized_name.toLowerCase() === lokasi.trim().toLowerCase()
      );
      // If lokasi not in standard list, allow custom text if required by operational flexibility, but flag if KPBI
      if (!lok && kp.code === "KPBI") {
        return {
          valid: false,
          reason: `Lokasi '${lokasi}' tidak valid untuk KPBI di ${prov.name}. Pilihan resmi: ${lokList.map((l) => l.name).join(", ")}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * 6. Retrieve Audit Log of Normalized / Flagged Source Records
   */
  async getAuditReviews(limit: number = 100): Promise<MasterDataAuditReview[]> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from("master_data_audit_review")
            .select("*")
            .order("row_number", { ascending: true })
            .limit(limit);
          if (!error && data) return data as MasterDataAuditReview[];
        } catch {}
      }
    }

    // Fallback: Read from local JSON if generated
    try {
      const fs = require("node:fs");
      if (fs.existsSync("scripts/master-hierarchy-clean.json")) {
        const raw = JSON.parse(fs.readFileSync("scripts/master-hierarchy-clean.json", "utf8"));
        return (raw.auditLog || []).slice(0, limit);
      }
    } catch {}

    return [];
  }
}

export const masterDataService = new MasterDataService();
