/**
 * SCC - EAGLE EYES — Bank Indonesia Offices Master Data Types
 * Geospatial Intelligence & Perimeter Security Model
 */

export type BIOfficeType = "Kantor Pusat" | "KPwDN" | "KOPERBI IKN";

export type BIOfficeValidationStatus = "verified" | "unverified" | "missing_coordinates" | "invalid_coordinates";

export interface BIOffice {
  id: string; // e.g. "bi-off-samarinda"
  office_id: string; // e.g. "KPW-SMD" or administrative code
  office_name: string; // Official full name
  short_name: string; // Short display name e.g. "Samarinda"
  office_type: BIOfficeType;
  regional: string; // "Sumatera" | "Jawa" | "KTI" | "Kantor Pusat"
  island_group: string; // "Sumatera" | "Jawa" | "Kalimantan" | "Sulawesi" | "Bali & Nusa Tenggara" | "Maluku & Papua"
  latitude: number | null;
  longitude: number | null;
  address: string;
  postal_code?: string | null;
  phone?: string | null;
  fax?: string | null;
  administrative_code?: string | null;
  source: string; // "koordinat (1).csv"
  validation_status: BIOfficeValidationStatus;
  validation_reason: string;
  raw_coordinates_text?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BIOfficeValidationAuditItem {
  index: number;
  office_name: string;
  office_type: BIOfficeType;
  raw_coordinates_text: string;
  raw_longitude_column: string;
  raw_latitude_column: string;
  swapped_column_headers: boolean;
  normalized_latitude: number | null;
  normalized_longitude: number | null;
  validation_status: BIOfficeValidationStatus;
  validation_reason: string;
  address: string;
  administrative_code?: string | null;
}

export interface BIOfficeAuditReport {
  total_records: number;
  verified_count: number;
  missing_count: number;
  invalid_count: number;
  kpbi_status: "available" | "missing_unverified";
  items: BIOfficeValidationAuditItem[];
}

