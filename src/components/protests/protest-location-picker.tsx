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
  Building,
  RotateCcw
} from "lucide-react";

export interface LocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  initialLocationName?: string;
  onSelectLocation: (lat: number | null, lng: number | null, label?: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  type?: string;
}

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456]; // Jakarta Pusat
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export function ProtestLocationPicker({
  initialLat,
  initialLng,
  initialLocationName,
  onSelectLocation,
  onClose,
  compact = false
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [lat, setLat] = useState<string>(
    initialLat !== null && initialLat !== undefined ? String(initialLat) : ""
  );
  const [lng, setLng] = useState<string>(
    initialLng !== null && initialLng !== undefined ? String(initialLng) : ""
  );

  const [searchQuery, setSearchQuery] = useState(initialLocationName || "");
  const [selectedAddress, setSelectedAddress] = useState<string>(initialLocationName || "");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Custom Leaflet Pin Icon
  const createMarkerIcon = () =>
    L.divIcon({
      className: "unras-picker-marker",
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #EF4444;
          border: 3px solid #FFFFFF;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 14px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
        ">
          <div style="
            width: 9px;
            height: 9px;
            background: #FFFFFF;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

  // Reverse Geocoding Helper (Nominatim OSM)
  const fetchAddressForCoordinates = useCallback(async (rLat: number, rLng: number) => {
    setReverseGeocoding(true);
    try {
      const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${rLat}&lon=${rLng}&zoom=18&addressdetails=1`;
      const res = await fetch(endpoint, {
        headers: { "Accept-Language": "id,en" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          setSelectedAddress(data.display_name);
          return data.display_name;
        }
      }
    } catch {
      // Ignore network errors on reverse geocoding
    } finally {
      setReverseGeocoding(false);
    }
    return null;
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const startLat =
      initialLat !== null && initialLat !== undefined && !isNaN(Number(initialLat))
        ? Number(initialLat)
        : DEFAULT_CENTER[0];
    const startLng =
      initialLng !== null && initialLng !== undefined && !isNaN(Number(initialLng))
        ? Number(initialLng)
        : DEFAULT_CENTER[1];
    const hasInitial =
      initialLat !== null &&
      initialLat !== undefined &&
      initialLng !== null &&
      initialLng !== undefined &&
      !isNaN(Number(initialLat)) &&
      !isNaN(Number(initialLng));

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: hasInitial ? 16 : 12,
      zoomControl: true,
      scrollWheelZoom: "center"
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    // Initial Marker
    if (hasInitial) {
      const marker = L.marker([startLat, startLng], {
        icon: createMarkerIcon(),
        draggable: true
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        const fLat = pos.lat.toFixed(6);
        const fLng = pos.lng.toFixed(6);
        setLat(fLat);
        setLng(fLng);
        fetchAddressForCoordinates(pos.lat, pos.lng);
      });

      markerRef.current = marker;
      if (!initialLocationName) {
        fetchAddressForCoordinates(startLat, startLng);
      }
    }

    // Map Click: Place or move marker
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      const fLat = clickLat.toFixed(6);
      const fLng = clickLng.toFixed(6);
      setLat(fLat);
      setLng(fLng);
      setErrorMsg(null);

      if (markerRef.current) {
        markerRef.current.setLatLng([clickLat, clickLng]);
      } else {
        const marker = L.marker([clickLat, clickLng], {
          icon: createMarkerIcon(),
          draggable: true
        }).addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setLat(pos.lat.toFixed(6));
          setLng(pos.lng.toFixed(6));
          fetchAddressForCoordinates(pos.lat, pos.lng);
        });

        markerRef.current = marker;
      }

      fetchAddressForCoordinates(clickLat, clickLng);
    });

    mapInstanceRef.current = map;

    // Handle initial Leaflet size calculation
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [initialLat, initialLng, initialLocationName, fetchAddressForCoordinates]);

  // Debounced Forward Geocoding Search (Nominatim OSM)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setErrorMsg(null);
      try {
        const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&countrycodes=id&limit=6&addressdetails=1`;

        const res = await fetch(endpoint, {
          headers: { "Accept-Language": "id,en" }
        });

        if (res.ok) {
          const data: SearchResult[] = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        } else {
          setErrorMsg("Pencarian geocoding sedang tidak merespons, coba klik titik langsung di peta.");
        }
      } catch {
        setErrorMsg("Gagal melakukan pencarian lokasi geospasial.");
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Selecting a Search Suggestion
  const handleSelectSearchResult = (result: SearchResult) => {
    const sLat = parseFloat(result.lat);
    const sLng = parseFloat(result.lon);

    setLat(sLat.toFixed(6));
    setLng(sLng.toFixed(6));
    setSelectedAddress(result.display_name);
    setSearchQuery(result.name || result.display_name.split(",")[0]);
    setShowDropdown(false);
    setErrorMsg(null);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([sLat, sLng], 16, { duration: 1.0 });

      if (markerRef.current) {
        markerRef.current.setLatLng([sLat, sLng]);
      } else {
        const marker = L.marker([sLat, sLng], {
          icon: createMarkerIcon(),
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
  };

  // Manual Coordinates Update (Advanced Section)
  const handleManualCoordChange = (newLatStr: string, newLngStr: string) => {
    setLat(newLatStr);
    setLng(newLngStr);

    const nLat = parseFloat(newLatStr);
    const nLng = parseFloat(newLngStr);

    if (!isNaN(nLat) && !isNaN(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180) {
      setErrorMsg(null);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([nLat, nLng], 15);
        if (markerRef.current) {
          markerRef.current.setLatLng([nLat, nLng]);
        } else {
          const marker = L.marker([nLat, nLng], {
            icon: createMarkerIcon(),
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

  // Confirm and Apply Location
  const handleConfirm = () => {
    if (!lat || !lng) {
      setErrorMsg("Tentukan titik lokasi di peta atau cari nama tempat terlebih dahulu.");
      return;
    }

    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);

    if (isNaN(nLat) || isNaN(nLng) || nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
      setErrorMsg("Koordinat tidak valid. Latitude harus antara -90 s/d 90, Longitude antara -180 s/d 180.");
      return;
    }

    onSelectLocation(nLat, nLng, selectedAddress || searchQuery || undefined);
    if (onClose) onClose();
  };

  // Clear Location (Unmapped)
  const handleClear = () => {
    setLat("");
    setLng("");
    setSelectedAddress("");
    setSearchQuery("");
    setErrorMsg(null);
    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    onSelectLocation(null, null);
  };

  return (
    <div className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-2xl">
      {/* Title & Search Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-red-400" />
            Pilih Lokasi Aksi di Peta Interaktif
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 text-[#98A4B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari gedung, landmark, jalan (contoh: Gedung DPR RI, Monas, Patung Kuda)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 shadow-inner"
            />
            {searching && (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
            )}
            {!searching && searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setShowDropdown(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#141A28] border border-[var(--border-default)] rounded-xl shadow-2xl z-[1000] max-h-52 overflow-y-auto divide-y divide-[var(--border-subtle)]">
              {searchResults.map((item) => (
                <button
                  key={item.place_id}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-blue-600/15 flex items-start gap-2.5 transition-colors cursor-pointer"
                >
                  <Building className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <div className="truncate">
                    <span className="text-xs font-semibold text-white block truncate">
                      {item.name || item.display_name.split(",")[0]}
                    </span>
                    <span className="text-[10px] text-[#98A4B8] block truncate">
                      {item.display_name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Leaflet Map Surface */}
      <div className={`relative w-full ${compact ? "h-56" : "h-64 sm:h-72"} rounded-xl overflow-hidden border border-[var(--border-subtle)]`}>
        <div ref={mapContainerRef} className="w-full h-full z-0" />
        <div className="absolute bottom-2 left-2 z-[400] bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-[#98A4B8] border border-white/10 pointer-events-none flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-red-400" />
          <span>Klik peta atau geser marker merah untuk menentukan titik presisi</span>
        </div>
      </div>

      {/* Selected Location / Address Card */}
      <div className="p-2.5 bg-[#141A28] rounded-xl border border-[var(--border-subtle)] flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5">
          {reverseGeocoding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
          ) : (
            <MapPin className="w-3.5 h-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#98A4B8] font-bold uppercase tracking-wider block">
              Alamat & Titik Koordinat Terpilih:
            </span>
            {lat && lng && (
              <span className="text-[10px] text-emerald-400 font-mono">
                {lat}, {lng}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-white truncate mt-0.5">
            {selectedAddress || (lat && lng ? `Titik Terpetakan (${lat}, ${lng})` : "Belum ada titik yang dipilih pada peta")}
          </p>
        </div>
      </div>

      {/* Collapsible Advanced Section: Manual Coordinate Entry */}
      <div className="border border-[var(--border-subtle)] rounded-xl bg-[#111622] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="w-full px-3 py-2 text-left text-[11px] font-semibold text-[#98A4B8] hover:text-white flex items-center justify-between select-none cursor-pointer"
        >
          <span>Opsi Lanjutan: Tinjau & Sesuaikan Koordinat Manual</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              showAdvanced ? "rotate-180 text-blue-400" : ""
            }`}
          />
        </button>

        {showAdvanced && (
          <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#98A4B8] mb-1">
                  Latitude (-90 s/d 90)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: -6.2088"
                  value={lat}
                  onChange={(e) => handleManualCoordChange(e.target.value, lng)}
                  className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#98A4B8] mb-1">
                  Longitude (-180 s/d 180)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 106.8456"
                  value={lng}
                  onChange={(e) => handleManualCoordChange(lat, e.target.value)}
                  className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
            <p className="text-[10px] text-[#64748B]">
              Input manual koordinat opsional. Menggeser marker di peta secara otomatis memperbarui angka di atas.
            </p>
          </div>
        )}
      </div>

      {errorMsg && <p className="text-xs text-red-400 font-medium">{errorMsg}</p>}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Titik (Unmapped)</span>
        </button>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white bg-[#141A28] border border-[var(--border-subtle)] hover:bg-white/5 transition-colors cursor-pointer"
            >
              Batal
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Terapkan Titik Lokasi</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProtestLocationPicker;
