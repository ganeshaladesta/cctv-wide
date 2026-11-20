export interface MasterKpKpw {
  id: string;
  code: string;
  name: string;
  normalized_name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MasterRegional {
  id: string;
  kp_kpw_id: string;
  name: string;
  normalized_name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MasterProvinsi {
  id: string;
  regional_id: string;
  name: string;
  normalized_name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MasterLokasi {
  id: string;
  provinsi_id: string;
  name: string;
  normalized_name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MasterDataAuditReview {
  id: string;
  row_number?: number;
  source_id_kejadian?: string;
  raw_kp_kpw?: string;
  raw_regional?: string;
  raw_provinsi?: string;
  raw_lokasi?: string;
  normalized_kp_kpw?: string;
  normalized_regional?: string;
  normalized_provinsi?: string;
  normalized_lokasi?: string;
  issues: string;
  review_status: "pending_review" | "approved" | "dismissed";
  created_at?: string;
}

export interface HierarchyLevelOption {
  id: string;
  name: string;
  code?: string;
  parent_id?: string;
}

