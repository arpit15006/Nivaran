'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { DivIcon } from 'leaflet';
import { STATUS_META, SEVERITY_META, prettyCategory } from '@/lib/format';
import type { MapPoint, Status } from '@/lib/types';

const INDORE_CENTER: [number, number] = [22.7196, 75.8577];

// Pins as divIcons so escalated/breached can pulse via CSS (the signature moment).
function pinIcon(status: Status, severity: string): DivIcon {
  const color = STATUS_META[status].color;
  const big = severity === 'CRITICAL' || severity === 'HIGH';
  const pulsing = status === 'ESCALATED' || status === 'BREACHED';
  const size = big ? 20 : 16;
  return new DivIcon({
    className: '',
    html: `<span class="pin ${big ? 'pin--lg' : ''} ${pulsing ? `pin--${status.toLowerCase()}` : ''}" style="background:${color};--pin-glow:${color}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const LEGEND: Array<{ status: Status; label: string }> = [
  { status: 'ROUTED', label: 'Routed' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'ESCALATED', label: 'Escalated' },
  { status: 'BREACHED', label: 'Breached' },
  { status: 'RESOLVED', label: 'Resolved' },
];

export default function CityMap({ points, height = '70vh' }: { points: MapPoint[]; height?: string }) {
  const escalating = points.filter((p) => p.status === 'ESCALATED' || p.status === 'BREACHED').length;

  return (
    <div className="relative overflow-hidden rounded-lg border border-control-line shadow-control" style={{ height }}>
      {/* Tactical header strip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex items-center justify-between gap-3 bg-gradient-to-b from-control-bg/95 to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="live-dot" aria-hidden />
          <span className="font-mono text-2xs font-semibold uppercase tracking-[0.18em] text-control-text">
            City Operations · Live
          </span>
        </div>
        {escalating > 0 ? (
          <span className="pointer-events-none inline-flex items-center gap-1.5 rounded border border-status-breached/50 bg-status-breached/15 px-2 py-1 font-mono text-2xs font-semibold uppercase tracking-wider text-status-breached" style={{ color: '#FCA5A5' }}>
            {escalating} active escalation{escalating > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[400] rounded-md border border-control-line bg-control-panel/90 px-3 py-2.5 backdrop-blur">
        <p className="mb-1.5 font-mono text-2xs font-semibold uppercase tracking-wider text-control-muted">Status</p>
        <ul className="space-y-1">
          {LEGEND.map((l) => (
            <li key={l.status} className="flex items-center gap-2 text-xs text-control-text">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_META[l.status].color }} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <MapContainer center={INDORE_CENTER} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.status, p.severity)}>
            <Popup>
              <div className="space-y-1.5 font-body">
                <p className="font-heading text-sm font-semibold text-ink-900">{prettyCategory(p.category)}</p>
                <p className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_META[p.status].color }} aria-hidden />
                  <span style={{ color: STATUS_META[p.status].color }} className="font-semibold">{STATUS_META[p.status].label}</span>
                  <span className="text-ink-400">·</span>
                  <span style={{ color: SEVERITY_META[p.severity]?.color }}>{SEVERITY_META[p.severity]?.label ?? p.severity}</span>
                </p>
                <p className="font-mono text-2xs uppercase tracking-wider text-ink-500">{p.ward ?? 'Outside mapped wards'}</p>
                {p.escalationLevel > 0 ? (
                  <p className="font-mono text-2xs font-semibold uppercase tracking-wider text-status-escalated">▲ Escalation L{p.escalationLevel}</p>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
