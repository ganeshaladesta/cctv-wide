"use client";

import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, MapPin, X, Check, Loader2, Navigation } from "lucide-react";

interface LocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  initialLocationName?: string;
  onSelectLocation: (lat: number | null, lng: number | null, label?: string) => void;
  onClose?: () => void;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456]; // Jakarta Pusat
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function ProtestLocationPicker({
  initialLat,
  initialLng,
  initialLocationName,
  onSelectLocation,
  onClose
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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Custom marker icon
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
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
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

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const startLat = initialLat !== null && initialLat !== undefined ? Number(initialLat) : DEFAULT_CENTER[0];
    const startLng = initialLng !== null && initialLng !== undefined ? Number(initialLng) : DEFAULT_CENTER[1];
    const hasInitial = initialLat !== null && initialLat !== undefined && initialLng !== null && initialLng !== undefined;

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: hasInitial ? 15 : 12,
      zoomControl: true
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    // Initial marker if coordinates present
    if (hasInitial) {
      const marker = L.marker([startLat, startLng], {
        icon: createMarkerIcon(),
        draggable: true
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setLat(pos.lat.toFixed(6));
        setLng(pos.lng.toFixed(6));
      });

      markerRef.current = marker;
    }

    // Map Click Handler: Place/move marker
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      setLat(clickLat.toFixed(6));
      setLng(clickLng.toFixed(6));

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
        });

        markerRef.current = marker;
      }
    });

    mapInstanceRef.current = map;

    // Invalidate size once rendered
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map when manual coordinates change
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
          });
          markerRef.current = marker;
        }
      }
    }
  };

  // Debounced Place Search (Nominatim OSM)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&countrycodes=id&limit=5&addressdetails=1`;

        const res = await fetch(endpoint, {
          headers: {
            "Accept-Language": "id,en"
          }
        });

        if (res.ok) {
          const data: SearchResult[] = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        }
      } catch {
        // Ignored
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSearchResult = (result: SearchResult) => {
    const sLat = parseFloat(result.lat);
    const sLng = parseFloat(result.lon);

    setLat(sLat.toFixed(6));
    setLng(sLng.toFixed(6));
    setSearchQuery(result.display_name);
    setShowDropdown(false);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([sLat, sLng], 16);
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
        });
        markerRef.current = marker;
      }
    }
  };

  const handleConfirm = () => {
    if (!lat || !lng) {
      setErrorMsg("Pilih titik di peta atau masukkan koordinat terlebih dahulu.");
      return;
    }

    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);

    if (isNaN(nLat) || isNaN(nLng) || nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
      setErrorMsg("Koordinat tidak valid. Latitude harus antara -90 s/d 90, Longitude antara -180 s/d 180.");
      return;
    }

    onSelectLocation(nLat, nLng, searchQuery || undefined);
    if (onClose) onClose();
  };

  const handleClear = () => {
    setLat("");
    setLng("");
    setErrorMsg(null);
    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    onSelectLocation(null, null);
  };

  return (
    <div className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-2xl p-4 space-y-3 shadow-xl">
      {/* Search Header */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#98A4B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari gedung, landmark, jalan (contoh: Gedung DPR RI, Monas, Patung Kuda)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500"
            />
            {searching && (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
            )}
            {!searching && searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[#98A4B8] hover:text-white hover:bg-white/5 border border-[var(--border-subtle)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#141A28] border border-[var(--border-default)] rounded-xl shadow-2xl z-[1000] max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {searchResults.map((item) => (
              <button
                key={item.place_id}
                type="button"
                onClick={() => handleSelectSearchResult(item)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-blue-600/10 flex items-start gap-2.5 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
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

      {/* Interactive Map Container */}
      <div className="relative w-full h-64 sm:h-72 rounded-xl overflow-hidden border border-[var(--border-subtle)]">
        <div ref={mapContainerRef} className="w-full h-full z-0" />
        <div className="absolute bottom-2 left-2 z-[500] bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-[#98A4B8] border border-white/10 pointer-events-none">
          Klik peta atau geser marker merah untuk menentukan titik lokasi
        </div>
      </div>

      {/* Manual Coordinates Input & Validation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
            Latitude Geospasial
          </label>
          <input
            type="text"
            placeholder="Contoh: -6.2088"
            value={lat}
            onChange={(e) => handleManualCoordChange(e.target.value, lng)}
            className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
            Longitude Geospasial
          </label>
          <input
            type="text"
            placeholder="Contoh: 106.8456"
            value={lng}
            onChange={(e) => handleManualCoordChange(lat, e.target.value)}
            className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
      </div>

      {errorMsg && (
        <p className="text-[11px] text-red-400 font-medium">{errorMsg}</p>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors"
        >
          Hapus Titik
        </button>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white bg-[#141A28] border border-[var(--border-subtle)]"
            >
              Batal
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Terapkan Titik Lokasi</span>
          </button>
        </div>
      </div>
    </div>
  );
}
