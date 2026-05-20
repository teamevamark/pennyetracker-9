import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Phone, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/components/map/useGoogleMaps";
import { GraphCanvas } from "@/components/marking/GraphCanvas";
import { loadCachedPoints, saveCachedPoints, type GeoPoint } from "@/lib/geoCache";
import { OfflineMap, type OfflineMarker } from "@/components/map/OfflineMap";
import { useServerFn } from "@tanstack/react-start";
import { getOfflineMbtilesSignedUrl } from "@/lib/offline-map.functions";

export const Route = createFileRoute("/map/panchayath")({
  component: PublicPanchayathMap,
  head: () => ({
    meta: [
      { title: "Panchayath Map — Penny-eTracker" },
      { name: "description", content: "Panchayath locations, neighbour connections, and delivery staff." },
    ],
  }),
});

const DEFAULT_CENTER = { lat: 10.85, lng: 76.27 };
const DEFAULT_ZOOM = 8;

function PublicPanchayathMap() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/landing"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Panchayath Map</h1>
        </div>

        <Tabs defaultValue="pin">
          <TabsList>
            <TabsTrigger value="pin">Pin map</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="staff">Delivery staff</TabsTrigger>
          </TabsList>
          <TabsContent value="pin" className="mt-4">
            <PinMapView />
          </TabsContent>
          <TabsContent value="connections" className="mt-4">
            <ConnectionsView />
          </TabsContent>
          <TabsContent value="staff" className="mt-4">
            <DeliveryStaffView />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

/* ---------------- Tab 1: Pin map ---------------- */

function PinMapView() {
  const { data: apiKey } = useQuery({
    queryKey: ["public_google_maps_key"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_google_maps_key");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const mapState = useGoogleMaps(apiKey ?? null);

  const fetchOfflineMeta = useServerFn(getOfflineMbtilesSignedUrl);
  const { data: offlineMeta } = useQuery({
    queryKey: ["offline_mbtiles_meta"],
    queryFn: () => fetchOfflineMeta(),
    staleTime: 5 * 60_000,
  });
  const hasOfflineMap = !!offlineMeta;
  const useOffline =
    hasOfflineMap && (!apiKey || mapState === "error" || (typeof navigator !== "undefined" && !navigator.onLine));

  const [cached, setCached] = useState<GeoPoint[]>([]);
  useEffect(() => {
    loadCachedPoints("panchayath").then((all) =>
      setCached(all.filter((p) => p.lat != null && p.lng != null)),
    );
  }, []);

  const { data: items = [] } = useQuery({
    queryKey: ["panchayaths", "public-marked"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("panchayaths")
        .select("id, name, district_id, latitude, longitude")
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!items.length) return;
    const points: GeoPoint[] = items.map((r: any) => ({
      id: r.id,
      name: r.name,
      parent_id: r.district_id ?? null,
      lat: r.latitude,
      lng: r.longitude,
    }));
    saveCachedPoints("panchayath", points);
    setCached(points);
  }, [items]);

  const visible: GeoPoint[] = items.length
    ? items.map((r: any) => ({
        id: r.id,
        name: r.name,
        parent_id: r.district_id ?? null,
        lat: r.latitude,
        lng: r.longitude,
      }))
    : cached;

  const mapRef = useRef<HTMLDivElement | null>(null);
  const gMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (mapState !== "ready" || !mapRef.current || gMapRef.current) return;
    const g = (window as any).google;
    gMapRef.current = new g.maps.Map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      mapTypeControl: false,
      streetViewControl: false,
    });
  }, [mapState]);

  useEffect(() => {
    if (mapState !== "ready" || !gMapRef.current) return;
    const g = (window as any).google;
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    const bounds = new g.maps.LatLngBounds();
    let count = 0;
    for (const p of visible) {
      if (p.lat == null || p.lng == null) continue;
      const info = new g.maps.InfoWindow({ content: `<div style="font:500 13px system-ui">${p.name}</div>` });
      const m = new g.maps.Marker({
        map: gMapRef.current,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
      });
      m.addListener("click", () => info.open({ map: gMapRef.current, anchor: m }));
      markersRef.current.push(m);
      bounds.extend({ lat: p.lat, lng: p.lng });
      count++;
    }
    if (count === 1) {
      gMapRef.current.setCenter(bounds.getCenter());
      gMapRef.current.setZoom(13);
    } else if (count > 1) {
      gMapRef.current.fitBounds(bounds, 48);
    }
  }, [visible, mapState]);

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground">{visible.length} marked</div>
      {useOffline ? (
        <OfflineMap
          markers={visible
            .filter((p) => p.lat != null && p.lng != null)
            .map<OfflineMarker>((p) => ({
              id: p.id,
              name: p.name,
              lat: p.lat as number,
              lng: p.lng as number,
            }))}
        />
      ) : !apiKey || mapState === "error" ? (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              {!apiKey
                ? "Map provider unavailable. Showing marked locations as a list with map links."
                : "Google Maps failed to load. Showing marked locations as a list with map links."}
            </div>
            {visible.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No panchayath locations have been marked yet.
              </div>
            ) : (
              <ul className="divide-y">
                {visible.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.lat?.toFixed(6)}, {p.lng?.toFixed(6)}
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
                        href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}>Google Maps</a>
                      <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
                        href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=15/${p.lat}/${p.lng}`}>OpenStreetMap</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="relative overflow-hidden">
          <CardContent className="p-0">
            {mapState === "loading" && (
              <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
                Loading map…
              </div>
            )}
            <div
              ref={mapRef}
              className="h-[70vh] w-full"
              style={{ display: mapState === "ready" ? "block" : "none" }}
            />
            {mapState === "ready" && visible.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-lg border bg-background/95 px-4 py-2 text-sm text-muted-foreground shadow">
                  No panchayath locations have been marked yet.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/* ---------------- Tab 2: Connections (panchayath -> ward drill-down) ---------------- */

function ConnectionsView() {
  const [wardOfPanchayathId, setWardOfPanchayathId] = useState<string | null>(null);
  const [wardOfPanchayathName, setWardOfPanchayathName] = useState<string>("");

  if (wardOfPanchayathId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={() => setWardOfPanchayathId(null)}>
            <ArrowLeft className="h-4 w-4" /> Back to panchayaths
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{wardOfPanchayathName} — wards</span>
        </div>
        <GraphCanvas
          cfg={{
            label: "Ward",
            nodesTable: "wards",
            edgesTable: "ward_connections",
            srcCol: "source_ward_id",
            tgtCol: "target_ward_id",
            parentRef: { key: "panchayath_id", label: "Panchayath", table: "panchayaths" },
            filter: { key: "panchayath_id", value: wardOfPanchayathId },
            subtitle: (n) => (n.ward_number ? `Ward #${n.ward_number}` : null),
            readOnly: true,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Search a panchayath to see its N/S/E/W neighbours. Click any panchayath card to drill into its wards.
      </p>
      <GraphCanvasWithDrill
        onDrillIn={(id, name) => {
          setWardOfPanchayathId(id);
          setWardOfPanchayathName(name);
        }}
      />
    </div>
  );
}

// Wrapper that intercepts the center-card click to drill into wards.
// We intercept by overlaying a small "View wards" button per centered panchayath.
function GraphCanvasWithDrill({ onDrillIn }: { onDrillIn: (id: string, name: string) => void }) {
  // We render the standard read-only GraphCanvas, with a small toolbar above
  // that lets the user jump to ward view for whichever panchayath is centered.
  // Since GraphCanvas owns centerId internally, we mirror the search here.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  const { data: panchayaths = [] } = useQuery({
    queryKey: ["panchayaths", "all-for-drill"],
    queryFn: async () => {
      const { data, error } = await supabase.from("panchayaths").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={picked?.id ?? ""}
          onChange={(e) => {
            const p = panchayaths.find((x) => x.id === e.target.value);
            setPicked(p ? { id: p.id, name: p.name } : null);
          }}
          className="h-9 min-w-[220px] rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Pick a panchayath to view wards…</option>
          {panchayaths.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!picked}
          onClick={() => picked && onDrillIn(picked.id, picked.name)}
        >
          View its wards →
        </Button>
      </div>
      <GraphCanvas
        cfg={{
          label: "Panchayath",
          nodesTable: "panchayaths",
          edgesTable: "panchayath_connections",
          srcCol: "source_panchayath_id",
          tgtCol: "target_panchayath_id",
          parentRef: { key: "district_id", label: "District", table: "districts" },
          readOnly: true,
        }}
      />
    </div>
  );
}

/* ---------------- Tab 3: Delivery staff over connections ---------------- */

type PartnerWard = { name: string; ward_number: string | null };
type Partner = { id: string; full_name: string; phone: string; alt_phone: string | null; wards: PartnerWard[] };
type PanchayathGroup = { panchayath_id: string; panchayath_name: string; partners: Partner[] };

function DeliveryStaffView() {
  const [openPanchayath, setOpenPanchayath] = useState<{ id: string; name: string } | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["public-delivery-partners"],
    queryFn: async (): Promise<PanchayathGroup[]> => {
      const { data, error } = await supabase.rpc("get_public_delivery_partners");
      if (error) throw error;
      return (data as PanchayathGroup[] | null) ?? [];
    },
  });

  const byPanchayath = useMemo(() => {
    const m = new Map<string, PanchayathGroup>();
    for (const g of groups) m.set(g.panchayath_id, g);
    return m;
  }, [groups]);

  const { data: panchayaths = [] } = useQuery({
    queryKey: ["panchayaths", "all-for-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("panchayaths").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={openPanchayath?.id ?? ""}
            onChange={(e) => {
              const p = panchayaths.find((x) => x.id === e.target.value);
              setOpenPanchayath(p ? { id: p.id, name: p.name } : null);
            }}
            className="h-9 min-w-[240px] rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Pick a panchayath to see its delivery staff…</option>
            {panchayaths.map((p) => {
              const count = byPanchayath.get(p.id)?.partners.length ?? 0;
              return (
                <option key={p.id} value={p.id}>
                  {p.name} {count ? `· ${count} staff` : "· no staff"}
                </option>
              );
            })}
          </select>
          <span className="text-xs text-muted-foreground">
            {groups.reduce((n, g) => n + g.partners.length, 0)} active staff across {groups.length} panchayaths
          </span>
        </div>
        <GraphCanvas
          cfg={{
            label: "Panchayath",
            nodesTable: "panchayaths",
            edgesTable: "panchayath_connections",
            srcCol: "source_panchayath_id",
            tgtCol: "target_panchayath_id",
            parentRef: { key: "district_id", label: "District", table: "districts" },
            subtitle: (n) => {
              const c = byPanchayath.get(n.id)?.partners.length ?? 0;
              return c ? `${c} delivery staff` : "no staff";
            },
            readOnly: true,
          }}
        />
      </div>

      <Card className="h-fit">
        <CardContent className="p-4">
          {!openPanchayath ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Pick a panchayath above to view its delivery staff.
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Delivery staff</div>
                  <div className="font-semibold">{openPanchayath.name}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setOpenPanchayath(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <StaffList partners={byPanchayath.get(openPanchayath.id)?.partners ?? []} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StaffList({ partners }: { partners: Partner[] }) {
  if (partners.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No active staff in this panchayath.</p>;
  }
  return (
    <ul className="space-y-2">
      {partners.map((p) => (
        <li key={p.id} className="rounded-md border bg-card p-3">
          <div className="font-medium">{p.full_name}</div>
          <a href={`tel:${p.phone}`} className="mt-1 flex items-center gap-1.5 text-sm text-primary hover:underline">
            <Phone className="h-3.5 w-3.5" /> {p.phone}
          </a>
          {p.alt_phone && (
            <a href={`tel:${p.alt_phone}`} className="mt-0.5 flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Phone className="h-3.5 w-3.5" /> {p.alt_phone}
            </a>
          )}
          {p.wards.length > 0 && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              Wards: <span className="font-medium text-foreground">
                {p.wards.map((w) => w.ward_number ?? w.name).join(", ")}
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
