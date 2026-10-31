"use client";

// ============================================================
// LocaBénin — Mini-carte Leaflet (OpenStreetMap)
// Marqueur APPROXIMATIF + cercle de flou volontaire : la position
// exacte n'est jamais révélée publiquement. Pin émeraude en SVG
// inline (évite le problème d'icônes marker manquantes).
// Chargé en dynamic(..., { ssr: false }) depuis la fiche offre.
// ============================================================

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MiniMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([latitude, longitude], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map);

    // Pin émeraude en SVG inline — pas de dépendance aux images du paquet leaflet.
    const pin = L.divIcon({
      className: "",
      iconSize: [26, 36],
      iconAnchor: [13, 34],
      html: `<div style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));line-height:0;" aria-hidden="true">
        <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 11.4 21.6 11.9 22.1a1.5 1.5 0 0 0 2.2 0C14.6 34.6 26 22.2 26 13 26 5.8 20.2 0 13 0z" fill="#059669"/>
          <circle cx="13" cy="13" r="5.5" fill="#ffffff"/>
        </svg>
      </div>`,
    });
    L.marker([latitude, longitude], { icon: pin, title: "Localisation approximative", keyboard: false }).addTo(map);

    // Cercle de flou : la position exacte du bien n'est pas dévoilée.
    L.circle([latitude, longitude], {
      radius: 320,
      color: "#059669",
      weight: 1.5,
      fillColor: "#10b981",
      fillOpacity: 0.12,
    }).addTo(map);

    return () => {
      map.remove();
    };
  }, [latitude, longitude]);

  return (
    <div className="relative z-0 overflow-hidden rounded-xl border">
      <div
        ref={containerRef}
        className="h-64 w-full bg-muted"
        role="img"
        aria-label="Carte du quartier — position approximative pour préserver la confidentialité du bien"
      />
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 shadow-soft dark:bg-black/70 dark:text-emerald-200">
        Localisation approximative
      </span>
    </div>
  );
}
