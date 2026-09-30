"use client";

import L from "leaflet";
import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Precedents } from "@/lib/types";
import { PRECEDENT_COLOR } from "./ui";

// Re-evaluated on every hot reload, so an edited module never reattaches to a torn-down Leaflet map.
const MODULE_INSTANCE = Math.random().toString(36).slice(2);

const UK_BOUNDS = L.latLngBounds([49.6, -9.0], [61.0, 2.2]);


const pinIcon = L.divIcon({ className: "", html: '<div class="site-pin"><span></span></div>', iconSize: [28, 28], iconAnchor: [14, 14] });

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 9), { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function MapView({
  selected,
  flyTarget,
  onPick,
  precedents,
}: {
  selected: { lat: number; lng: number } | null;
  flyTarget: { lat: number; lng: number; zoom?: number } | null;
  onPick: (lat: number, lng: number) => void;
  precedents: Precedents["precedents"];
}) {
  // A fresh id per mount gives each mount its own container div (React strict mode mounts twice in dev).
  const [mountId] = useState(() => Math.random().toString(36).slice(2));
  return (
    <MapContainer
      key={`${MODULE_INSTANCE}-${mountId}`}
      center={[53.8, -2.4]}
      zoom={6}
      minZoom={5}
      maxBounds={UK_BOUNDS.pad(0.3)}
      className="h-full w-full"
      zoomControl={false}
      attributionControl
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
        maxZoom={16}
      />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
      <ClickHandler onPick={onPick} />
      <FlyTo target={flyTarget} />
      <ResizeWatcher />

      {precedents.map((p, i) => (
        <CircleMarker
          key={`${p.name}-${i}`}
          center={[p.lat, p.lng]}
          radius={6}
          pathOptions={{ color: PRECEDENT_COLOR[p.status] ?? "#64748b", weight: 2, fillColor: "#fff", fillOpacity: 1, dashArray: "3 2" }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <div className="max-w-[240px] text-xs">
              <div className="font-semibold">{p.name}</div>
              <div className="capitalize" style={{ color: PRECEDENT_COLOR[p.status] }}>
                {p.status} {p.year && `· ${p.year}`}
              </div>
              <div className="whitespace-normal text-slate-600">{p.keyReasons[0]}</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {selected && <Marker position={[selected.lat, selected.lng]} icon={pinIcon} />}
    </MapContainer>
  );
}

