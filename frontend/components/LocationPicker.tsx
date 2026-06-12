'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';

const INDORE_CENTER: [number, number] = [22.7196, 75.8577];

// Leaflet's default marker images don't resolve under bundlers; use a CDN icon.
const pin = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// MapContainer's `center` prop only applies on first render, so pan the map
// whenever the selected location changes (e.g. after "Use my location").
function Recenter({ value }: { value: { lat: number; lng: number } | null }) {
  const map = useMap();
  const last = useRef<string>('');
  useEffect(() => {
    if (!value) return;
    const key = `${value.lat},${value.lng}`;
    if (key === last.current) return;
    last.current = key;
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), 16));
  }, [value, map]);
  return null;
}

export default function LocationPicker({
  value,
  onPick,
}: {
  value: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-300" style={{ height: 280 }}>
      <MapContainer center={value ? [value.lat, value.lng] : INDORE_CENTER} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onPick={onPick} />
        <Recenter value={value} />
        {value ? <Marker position={[value.lat, value.lng]} icon={pin} /> : null}
      </MapContainer>
    </div>
  );
}
