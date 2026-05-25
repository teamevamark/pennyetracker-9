import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon paths (Vite/bundler quirk — point to CDN copies).
// Only patch once.
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";
// @ts-expect-error — leaflet's internal _getIconUrl getter
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const draftIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#22c55e;border:3px solid #15803d;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export type LeafletMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  label?: string | number | null;
};

type Props = {
  markers?: LeafletMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  /** If set, clicking the map drops a draft marker at that point */
  onPick?: (lat: number, lng: number) => void;
  draft?: { lat: number; lng: number } | null;
  onDraftDrag?: (lat: number, lng: number) => void;
  /** When set, pan/zoom to this point on change */
  focus?: { lat: number; lng: number } | null;
  fitToMarkers?: boolean;
};

const DEFAULT_CENTER = { lat: 10.85, lng: 76.27 };
const DEFAULT_ZOOM = 8;

function ClickHandler({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      if (onPick) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Focuser({ focus }: { focus?: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [focus, map]);
  return null;
}

function FitBounds({ markers, enabled }: { markers: LeafletMarker[]; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || markers.length === 0) return;
    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 13);
      return;
    }
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [markers, enabled, map]);
  return null;
}

export function LeafletMap({
  markers = [],
  center,
  zoom,
  height = "60vh",
  onPick,
  draft,
  onDraftDrag,
  focus,
  fitToMarkers = true,
}: Props) {
  const initialCenter = useMemo(
    () => center ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : DEFAULT_CENTER),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialZoom = zoom ?? (markers[0] ? 12 : DEFAULT_ZOOM);
  if (typeof window === "undefined") {
    return <div style={{ height, width: "100%" }} className="rounded-md bg-muted" />;
  }

  return (
    <div style={{ height, width: "100%" }} className="overflow-hidden rounded-md">
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={initialZoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ClickHandler onPick={onPick} />
        <Focuser focus={focus} />
        <FitBounds markers={markers} enabled={fitToMarkers && !draft && !focus} />
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]}>
            <Popup>
              <div style={{ font: "500 13px system-ui" }}>
                {m.name}
                {m.label != null ? <span style={{ opacity: 0.6 }}> · #{m.label}</span> : null}
              </div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                {m.lat.toFixed(6)}, {m.lng.toFixed(6)}
              </div>
            </Popup>
          </Marker>
        ))}
        {draft && (
          <Marker
            position={[draft.lat, draft.lng]}
            icon={draftIcon}
            draggable={!!onDraftDrag}
            eventHandlers={
              onDraftDrag
                ? {
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      onDraftDrag(ll.lat, ll.lng);
                    },
                  }
                : undefined
            }
          />
        )}
      </MapContainer>
    </div>
  );
}
