"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Search,
  MapPin,
  X,
  Check,
  Loader2,
  ChevronDown,
  Trash2,
  Building2,
  Landmark,
  ShieldAlert,
  Compass,
  RotateCcw,
  Plus,
  Minus,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from "lucide-react";
import { GeocodingCandidate, GeocodingConfidence } from "@/lib/geocoding/types";

export interface LocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  initialLocationName?: string;
  city?: string;
  province?: string;
  suggestedLat?: number | null;
  suggestedLng?: number | null;
  suggestedAddress?: string | null;
  suggestedConfidence?: GeocodingConfidence | null;
  onSelectLocation: (lat: number | null, lng: number | null, label?: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456]; // Jakarta Pusat
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export function ProtestLocationPicker({
  initialLat,
  initialLng,
  initialLocationName,
  city,
  province,
  suggestedLat,
  suggestedLng,
  suggestedAddress,
  suggestedConfidence,
  onSelectLocation,
  onClose,
  compact = false
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const suggestedMarkerRef = useRef<L.Marker | null>(null);

  // Active coordinates
  const [lat, setLat] = useState<string>(
    initialLat !== null && initialLat !== undefined
      ? String(initialLat)
      : suggestedLat !== null && suggestedLat !== undefined
      ? String(suggestedLat)
      : ""
  );
  const [lng, setLng] = useState<string>(
    initialLng !== null && initialLng !== undefined
      ? String(initialLng)
      : suggestedLng !== null && suggestedLng !== undefined
      ? String(suggestedLng)
      : ""
  );

  const [searchQuery, setSearchQuery] = useState(initialLocationName || "");
  const [selectedAddress, setSelectedAddress] = useState<string>(
    initialLocationName || suggestedAddress || ""
  );
  const [searchResults, setSearchResults] = useState<GeocodingCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeConfidence, setActiveConfidence] = useState<GeocodingConfidence | null>(
    suggestedConfidence || null
  );

  // Custom Primary Pin Icon (Red, Draggable)
  const createPrimaryIcon = () =>
    L.divIcon({
      className: "unras-picker-marker",
      html: `
        <div style="
          width: 36px;
          height: 36px;
          background: #EF4444;
          border: 3px solid #FFFFFF;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          transition: transform 0.15s ease;
        ">
          <div style="
            width: 10px;
            height: 10px;
            background: #FFFFFF;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });

  // Custom Suggested Ghost Pin Icon (Blue/Cyan, Dashed)
  const createSuggestedIcon = () =>
    L.divIcon({
      className: "unras-suggested-marker",
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #3B82F6;
          border: 2px dashed #93C5FD;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 12px rgba(59,130,246,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.85;
        ">
          <div style="
            width: 8px;
            height: 8px;
            background: #FFFFFF;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

  // Reverse Geocoding via Server API (Safe, cached, rate-limited)
  const fetchAddressForCoordinates = useCallback(async (rLat: number, rLng: number) => {
    setReverseGeocoding(true);
    try {
      const endpoint = `/api/geocoding/reverse?lat=${rLat}&lng=${rLng}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.address) {
          setSelectedAddress(json.data.address);
          return json.data.address;
        }
      }
    } catch {
      // Ignore network errors
    } finally {
      setReverseGeocoding(false);
    }
    return null;
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const startLat =
      initialLat !== null && initialLat !== undefined && !isNaN(Number(initialLat))
        ? Number(initialLat)
        : suggestedLat !== null && suggestedLat !== undefined && !isNaN(Number(suggestedLat))
        ? Number(suggestedLat)
        : DEFAULT_CENTER[0];

    const startLng =
      initialLng !== null && initialLng !== undefined && !isNaN(Number(initialLng))
        ? Number(initialLng)
        : suggestedLng !== null && suggestedLng !== undefined && !isNaN(Number(suggestedLng))
        ? Number(suggestedLng)
        : DEFAULT_CENTER[1];

    const hasInitial = (initialLat != null && initialLng != null) || (suggestedLat != null && suggestedLng != null);

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: hasInitial ? 16 : 13,
      zoomControl: false, // We render custom high-contrast controls
      scrollWheelZoom: "center"
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    // Initial Marker
    if (hasInitial) {
      const marker = L.marker([startLat, startLng], {
        icon: createPrimaryIcon(),
        draggable: true
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        const fLat = pos.lat.toFixed(6);
        const fLng = pos.lng.toFixed(6);
        setLat(fLat);
        setLng(fLng);
        setActiveConfidence(null); // Manual drag = operator verified position
        fetchAddressForCoordinates(pos.lat, pos.lng);
      });

      markerRef.current = marker;
      if (!initialLocationName && !suggestedAddress) {
        fetchAddressForCoordinates(startLat, startLng);
      }
    }

    // Map Click: place or reposition marker
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      const fLat = clickLat.toFixed(6);
      const fLng = clickLng.toFixed(6);
      setLat(fLat);
      setLng(fLng);
      setErrorMsg(null);
      setActiveConfidence(null); // Direct click = operator specified position

      if (markerRef.current) {
        markerRef.current.setLatLng([clickLat, clickLng]);
      } else {
        const marker = L.marker([clickLat, clickLng], {
          icon: createPrimaryIcon(),
          draggable: true
        }).addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setLat(pos.lat.toFixed(6));
          setLng(pos.lng.toFixed(6));
          setActiveConfidence(null);
          fetchAddressForCoordinates(pos.lat, pos.lng);
        });

        markerRef.current = marker;
      }

      fetchAddressForCoordinates(clickLat, clickLng);
    });

    mapInstanceRef.current = map;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [initialLat, initialLng, suggestedLat, suggestedLng, initialLocationName, suggestedAddress, fetchAddressForCoordinates]);

  // Debounced Forward Geocoding via Server API (/api/geocoding/search)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setErrorMsg(null);
      try {
        const url = new URL("/api/geocoding/search", window.location.origin);
        url.searchParams.set("q", searchQuery.trim());
        if (city) url.searchParams.set("city", city);
        if (province) url.searchParams.set("province", province);
        url.searchParams.set("limit", "6");

        const res = await fetch(url.toString());
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setSearchResults(json.data);
            setShowDropdown(json.data.length > 0);
          }
        }
      } catch {
        setErrorMsg("Gagal melakukan pencarian geocoding.");
      } finally {
        setSearching(false);
      }
    }, 380);

    return () => clearTimeout(timer);
  }, [searchQuery, city, province]);

  // Handle Search Result Selection
  const handleSelectCandidate = (item: GeocodingCandidate) => {
    const sLat = item.lat;
    const sLng = item.lng;

    setLat(sLat.toFixed(6));
    setLng(sLng.toFixed(6));
    setSelectedAddress(item.address);
    setSearchQuery(item.displayName.split(",")[0]);
    setShowDropdown(false);
    setErrorMsg(null);
    setActiveConfidence(item.confidence);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([sLat, sLng], 17, { duration: 1.0 });

      if (markerRef.current) {
        markerRef.current.setLatLng([sLat, sLng]);
      } else {
        const marker = L.marker([sLat, sLng], {
          icon: createPrimaryIcon(),
          draggable: true
        }).addTo(mapInstanceRef.current);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setLat(pos.lat.toFixed(6));
          setLng(pos.lng.toFixed(6));
          setActiveConfidence(null);
          fetchAddressForCoordinates(pos.lat, pos.lng);
        });
        markerRef.current = marker;
      }
    }
  };

  // Zoom Controls
  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };
  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  // Locate Selected Pin
  const handleLocateMarker = () => {
    if (!lat || !lng || !mapInstanceRef.current) {
      setErrorMsg("Belum ada pin lokasi yang ditentukan.");
      return;
    }
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (!isNaN(nLat) && !isNaN(nLng)) {
      mapInstanceRef.current.flyTo([nLat, nLng], 17, { duration: 0.8 });
    }
  };

  // Reset Center
  const handleResetCenter = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo(DEFAULT_CENTER, 12, { duration: 0.8 });
  };

  // Manual Coordinates Change
  const handleManualCoordChange = (newLatStr: string, newLngStr: string) => {
    setLat(newLatStr);
    setLng(newLngStr);
    const nLat = parseFloat(newLatStr);
    const nLng = parseFloat(newLngStr);

    if (!isNaN(nLat) && !isNaN(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180) {
      setErrorMsg(null);
      setActiveConfidence(null);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([nLat, nLng], 16);
        if (markerRef.current) {
          markerRef.current.setLatLng([nLat, nLng]);
        } else {
          const marker = L.marker([nLat, nLng], {
            icon: createPrimaryIcon(),
            draggable: true
          }).addTo(mapInstanceRef.current);
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            setLat(pos.lat.toFixed(6));
            setLng(pos.lng.toFixed(6));
            fetchAddressForCoordinates(pos.lat, pos.lng);
          });
          markerRef.current = marker;
        }
      }
    }
  };

  // Confirm Location
  const handleConfirm = () => {
    if (!lat || !lng) {
      setErrorMsg("Tentukan titik lokasi di peta atau pilih dari hasil pencarian.");
      return;
    }

    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);

    if (isNaN(nLat) || isNaN(nLng) || nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
      setErrorMsg("Koordinat tidak valid (-90 s/d 90, -180 s/d 180).");
      return;
    }

    onSelectLocation(nLat, nLng, selectedAddress || searchQuery || undefined);
    if (onClose) onClose();
  };

  // Clear Location
  const handleClear = () => {
    setLat("");
    setLng("");
    setSelectedAddress("");
    setSearchQuery("");
    setActiveConfidence(null);
    setErrorMsg(null);
    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    onSelectLocation(null, null);
  };

  const getConfidenceBadge = (conf: GeocodingConfidence | null) => {
    if (conf === "high") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Akurasi Tinggi (POI / Landmark)
        </span>
      );
    }
    if (conf === "medium") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Akurasi Sedang (Jalan / Kawasan)
        </span>
      );
    }
    if (conf === "low") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/15 text-[#98A4B8] border border-white/10 flex items-center gap-1">
          <HelpCircle className="w-3 h-3" />
          Akurasi Rendah (Kota / Wilayah)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1">
        <Check className="w-3 h-3" />
        Titik Dipilih Operator
      </span>
    );
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "government":
        return <Landmark className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />;
      case "police_military":
        return <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
      case "landmark":
        return <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      default:
        return <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xl">
      {/* Header & Advanced Search Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white tracking-wide block uppercase">
                Pilih Titik Lokasi Geospasial Aksi
              </span>
              <span className="text-[10px] text-[#98A4B8]">
                Cari nama gedung, jalan, landmark, atau geser pin langsung di peta
              </span>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#98A4B8] absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari gedung, kantor pemerintah, alun-alun (cth: Gedung DPR RI, Monas, Balai Kota, Simpang Lima)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 shadow-inner"
            />
            {searching && (
              <Loader2 className="w-4 h-4 text-blue-400 absolute right-3.5 animate-spin" />
            )}
            {!searching && searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setShowDropdown(false);
                }}
                className="absolute right-3.5 text-[#64748B] hover:text-white p-0.5 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete & Ranked Candidates Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#141A28] border border-[var(--border-default)] rounded-xl shadow-2xl z-[1000] max-h-64 overflow-y-auto divide-y divide-[var(--border-subtle)]">
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.lat}-${item.lng}-${idx}`}
                  type="button"
                  onClick={() => handleSelectCandidate(item)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-600/15 flex items-start gap-3 transition-colors cursor-pointer"
                >
                  {getCategoryIcon(item.category)}
                  <div className="truncate flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white block truncate">
                        {item.displayName.split(",")[0]}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.provider === "gazetteer" && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Gazetteer POI
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            item.confidence === "high"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : item.confidence === "medium"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-slate-500/20 text-slate-300"
                          }`}
                        >
                          {item.confidence === "high"
                            ? "Akurat (100%)"
                            : item.confidence === "medium"
                            ? "Kawasan"
                            : "Perkiraan"}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] text-[#98A4B8] block truncate mt-0.5">
                      {item.address}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Interactive Leaflet Map Surface (70-80% modal width, minimum 480px height) */}
      <div
        className={`relative w-full ${
          compact ? "h-[360px]" : "h-[460px] sm:h-[500px]"
        } rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-inner`}
      >
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Custom Map Control Buttons (Independent Zoom, Locate, Reset) */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-lg bg-[#0D121B]/90 backdrop-blur-md border border-white/15 text-white hover:bg-blue-600 flex items-center justify-center shadow-lg transition-all cursor-pointer"
            title="Perbesar Peta (+)"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-lg bg-[#0D121B]/90 backdrop-blur-md border border-white/15 text-white hover:bg-blue-600 flex items-center justify-center shadow-lg transition-all cursor-pointer"
            title="Perkecil Peta (-)"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="w-full h-[1px] bg-white/10 my-0.5" />
          <button
            type="button"
            onClick={handleLocateMarker}
            className="w-8 h-8 rounded-lg bg-[#0D121B]/90 backdrop-blur-md border border-white/15 text-white hover:text-red-400 hover:bg-white/10 flex items-center justify-center shadow-lg transition-all cursor-pointer"
            title="Arahkan ke Pin Terpilih"
          >
            <Crosshair className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetCenter}
            className="w-8 h-8 rounded-lg bg-[#0D121B]/90 backdrop-blur-md border border-white/15 text-white hover:text-blue-400 hover:bg-white/10 flex items-center justify-center shadow-lg transition-all cursor-pointer"
            title="Pusatkan Peta (DKI Jakarta)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tactical Guidance Badge */}
        <div className="absolute bottom-3 left-3 z-[400] bg-[#0D121B]/90 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] text-[#98A4B8] border border-white/10 pointer-events-none flex items-center gap-2 shadow-lg">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>Klik lokasi di peta atau geser marker merah untuk presisi level gedung</span>
        </div>
      </div>

      {/* Selected Address & Accuracy Card */}
      <div className="p-3 bg-[#141A28] rounded-xl border border-[var(--border-subtle)] flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5">
          {reverseGeocoding ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <MapPin className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-[#98A4B8] font-bold uppercase tracking-wider block">
              Titik Koordinat & Alamat Terpilih:
            </span>
            {lat && lng && getConfidenceBadge(activeConfidence)}
          </div>
          <p className="text-xs font-semibold text-white truncate mt-1">
            {selectedAddress ||
              (lat && lng
                ? `Titik Terpetakan (${lat}, ${lng})`
                : "Belum ada titik yang dipilih pada peta")}
          </p>
          {lat && lng && (
            <p className="text-[11px] font-mono text-emerald-400 mt-0.5">
              Latitude: {lat} | Longitude: {lng}
            </p>
          )}
        </div>
      </div>

      {/* Collapsible Manual Coordinate Adjustment */}
      <div className="border border-[var(--border-subtle)] rounded-xl bg-[#111622] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-[#98A4B8] hover:text-white flex items-center justify-between select-none cursor-pointer"
        >
          <span>Opsi Lanjutan: Tinjau & Sesuaikan Koordinat Manual</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              showAdvanced ? "rotate-180 text-blue-400" : ""
            }`}
          />
        </button>

        {showAdvanced && (
          <div className="p-3.5 border-t border-[var(--border-subtle)] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#98A4B8] mb-1">
                  Latitude (-90 s/d 90)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: -6.2115"
                  value={lat}
                  onChange={(e) => handleManualCoordChange(e.target.value, lng)}
                  className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#98A4B8] mb-1">
                  Longitude (-180 s/d 180)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 106.8016"
                  value={lng}
                  onChange={(e) => handleManualCoordChange(lat, e.target.value)}
                  className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
            <p className="text-[10px] text-[#64748B]">
              Input koordinat manual opsional. Menggeser marker di peta secara otomatis memperbarui angka di atas.
            </p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-2 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Titik (Unmapped)</span>
        </button>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white bg-[#141A28] border border-[var(--border-subtle)] hover:bg-white/5 transition-colors cursor-pointer"
            >
              Batal
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Terapkan Titik Lokasi</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProtestLocationPicker;
