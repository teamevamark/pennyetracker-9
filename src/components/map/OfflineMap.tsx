import { useEffect, useRef, useState } from "react";
import initSqlJs, { type Database } from "sql.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOfflineMbtilesSignedUrl } from "@/lib/offline-map.functions";
import { getOrFetchMbtiles } from "@/lib/mbtilesCache";

export type OfflineMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  subtitle?: string | null;
};

type Props = {
  markers: OfflineMarker[];
  className?: string;
  emptyState?: React.ReactNode;
};

/** Renders Leaflet over a user-supplied MBTiles file (cached in IndexedDB). */
export function OfflineMap({ markers, className, emptyState }: Props) {
  const fetchMeta = useServerFn(getOfflineMbtilesSignedUrl);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const dbRef = useRef<Database | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "missing">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  const { data: meta } = useQuery({
    queryKey: ["offline_mbtiles_meta"],
    queryFn: () => fetchMeta(),
    staleTime: 5 * 60_000,
  });

  // Load mbtiles -> sql.js -> build leaflet TileLayer
  useEffect(() => {
    if (meta === undefined) return;
    if (!meta) {
      setLoadState("missing");
      return;
    }
    if (!containerRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadState("loading");
        const [SQL, blob] = await Promise.all([
          initSqlJs({
            locateFile: (file) => `https://sql.js.org/dist/${file}`,
          }),
          getOrFetchMbtiles(meta.url, meta.meta.uploaded_at, meta.meta.size),
        ]);
        if (cancelled) return;
        const buf = new Uint8Array(await blob.arrayBuffer());
        const db = new SQL.Database(buf);
        dbRef.current = db;

        // Read tile format + bounds + center from metadata
        const metaRows = db.exec("SELECT name, value FROM metadata");
        const metaMap: Record<string, string> = {};
        if (metaRows.length) {
          for (const row of metaRows[0].values as [string, string][]) {
            metaMap[row[0]] = row[1];
          }
        }
        const format = (metaMap.format || "png").toLowerCase();
        const mime = format === "jpg" || format === "jpeg" ? "image/jpeg" : `image/${format}`;
        const minZ = Number(metaMap.minzoom ?? 0);
        const maxZ = Number(metaMap.maxzoom ?? 18);
        const center = (metaMap.center || "76.27,10.85,8").split(",").map(Number);

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const map = L.map(containerRef.current!, {
          center: [center[1] || 10.85, center[0] || 76.27],
          zoom: Math.min(Math.max(Math.round(center[2] || 10), minZ), maxZ),
          minZoom: minZ,
          maxZoom: maxZ,
        });
        mapRef.current = map;

        const MbtilesLayer = L.GridLayer.extend({
          createTile(coords: L.Coords, done: (err: Error | null, tile: HTMLElement) => void) {
            const tile = document.createElement("img");
            tile.alt = "";
            // MBTiles uses TMS y-axis (flipped)
            const y = (1 << coords.z) - 1 - coords.y;
            try {
              const stmt = db.prepare(
                "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
              );
              stmt.bind([coords.z, coords.x, y] as any);
              if (stmt.step()) {
                const row = stmt.get();
                const bytes = row[0] as Uint8Array;
                const b64 = btoa(String.fromCharCode(...bytes));
                tile.src = `data:${mime};base64,${b64}`;
              } else {
                tile.src =
                  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
              }
              stmt.free();
              done(null, tile);
            } catch (e) {
              done(e as Error, tile);
            }
            return tile;
          },
        });
        new MbtilesLayer({ minZoom: minZ, maxZoom: maxZ, tileSize: 256 }).addTo(map);

        markerLayerRef.current = L.layerGroup().addTo(map);
        setLoadState("ready");
      } catch (e: any) {
        if (!cancelled) {
          setErrorMsg(e?.message ?? String(e));
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (dbRef.current) {
        dbRef.current.close();
        dbRef.current = null;
      }
    };
  }, [meta]);

  // Sync markers
  useEffect(() => {
    const layer = markerLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    const valid = markers.filter((m) => m.lat != null && m.lng != null);
    for (const m of valid) {
      const popup = `<div style="font:500 13px system-ui">${escapeHtml(m.name)}${
        m.subtitle ? `<div style="font:400 12px system-ui;color:#666">${escapeHtml(m.subtitle)}</div>` : ""
      }</div>`;
      L.marker([m.lat, m.lng]).addTo(layer).bindPopup(popup);
    }
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 14);
    } else if (valid.length > 1) {
      const b = L.latLngBounds(valid.map((m) => [m.lat, m.lng] as [number, number]));
      map.fitBounds(b, { padding: [32, 32] });
    }
  }, [markers, loadState]);

  if (loadState === "missing") {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        {emptyState ?? "No offline map uploaded. Set one in Admin → Settings."}
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-md border bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load offline map: {errorMsg}
      </div>
    );
  }
  return (
    <div className={className ?? "relative h-[70vh] w-full overflow-hidden rounded-md border"}>
      {loadState === "loading" && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
          Loading offline map…
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}