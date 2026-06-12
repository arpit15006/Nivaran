'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { STATUS_META, prettyCategory } from '@/lib/format';
import type { MapPoint } from '@/lib/types';

const INDORE_CENTER: [number, number] = [22.7196, 75.8577];

export default function CityMap({ points, height = '70vh' }: { points: MapPoint[]; height?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200" style={{ height }}>
      <MapContainer center={INDORE_CENTER} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => {
          const meta = STATUS_META[p.status];
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={p.severity === 'CRITICAL' ? 11 : p.severity === 'HIGH' ? 9 : 7}
              pathOptions={{ color: meta.color, fillColor: meta.color, fillOpacity: 0.7, weight: 2 }}
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold">{prettyCategory(p.category)}</p>
                  <p className="text-sm">
                    Status: <span style={{ color: meta.color }}>{meta.label}</span>
                  </p>
                  <p className="text-xs text-slate-500">{p.ward ?? 'Outside known wards'}</p>
                  {p.escalationLevel > 0 ? (
                    <p className="text-xs font-semibold text-orange-700">Escalation level {p.escalationLevel}</p>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
