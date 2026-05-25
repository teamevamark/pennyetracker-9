import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, MapPin, MapPinOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LeafletMap, type LeafletMarker } from "@/components/map/LeafletMap";

export const Route = createFileRoute("/marking/")({
  component: MarkingView,
  head: () => ({ meta: [{ title: "Marking — Pinned Locations" }] }),
});

function MarkingView() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Pinned Locations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view of saved panchayath and ward locations.
        </p>
      </div>
      <Tabs defaultValue="panchayath">
        <TabsList>
          <TabsTrigger value="panchayath">Panchayaths</TabsTrigger>
          <TabsTrigger value="ward">Wards</TabsTrigger>
        </TabsList>
        <TabsContent value="panchayath" className="mt-4">
          <PanchayathTab />
        </TabsContent>
        <TabsContent value="ward" className="mt-4">
          <WardTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function PanchayathTab() {
  const [q, setQ] = useState("");

  const { data: panchayaths = [], isLoading } = useQuery({
    queryKey: ["marking", "panchayaths-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("panchayaths")
        .select("id, name, latitude, longitude")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return panchayaths;
    return panchayaths.filter((p) => p.name.toLowerCase().includes(term));
  }, [panchayaths, q]);

  const pinned = filtered.filter(
    (p) => p.latitude != null && p.longitude != null,
  );

  const markers: LeafletMarker[] = pinned.map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.latitude!,
    lng: p.longitude!,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search panchayath…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {pinned.length} pinned · {filtered.length} match
          {isLoading ? " · loading…" : ""}
        </span>
      </div>

      {q.trim() && filtered.length > 0 && (
        <Card>
          <CardContent className="max-h-48 overflow-auto p-2">
            <ul className="divide-y">
              {filtered.slice(0, 50).map((p) => {
                const isPinned = p.latitude != null && p.longitude != null;
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm"
                  >
                    {isPinned ? (
                      <MapPin className="h-4 w-4 text-primary" />
                    ) : (
                      <MapPinOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={isPinned ? "" : "text-muted-foreground"}>
                      {p.name}
                    </span>
                    {!isPinned && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        not pinned
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <LeafletMap markers={markers} height="65vh" fitToMarkers />
        </CardContent>
      </Card>
    </div>
  );
}

function WardTab() {
  const [panchayathQ, setPanchayathQ] = useState("");
  const [panchayathId, setPanchayathId] = useState<string | null>(null);
  const [wardQ, setWardQ] = useState("");

  const { data: panchayaths = [] } = useQuery({
    queryKey: ["marking", "panchayaths-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("panchayaths")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: wards = [], isLoading: wardsLoading } = useQuery({
    queryKey: ["marking", "wards-all", panchayathId],
    enabled: !!panchayathId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wards")
        .select("id, name, ward_number, latitude, longitude")
        .eq("panchayath_id", panchayathId!)
        .order("ward_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const panchayathSuggestions = useMemo(() => {
    const term = panchayathQ.trim().toLowerCase();
    if (!term) return [];
    return panchayaths
      .filter((p) => p.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [panchayaths, panchayathQ]);

  const selectedPanchayath = panchayaths.find((p) => p.id === panchayathId);

  const filteredWards = useMemo(() => {
    const term = wardQ.trim().toLowerCase();
    if (!term) return wards;
    return wards.filter(
      (w) =>
        w.name.toLowerCase().includes(term) ||
        (w.ward_number ?? "").toString().toLowerCase().includes(term),
    );
  }, [wards, wardQ]);

  const pinnedWards = filteredWards.filter(
    (w) => w.latitude != null && w.longitude != null,
  );

  const markers: LeafletMarker[] = pinnedWards.map((w) => ({
    id: w.id,
    name: w.name,
    lat: w.latitude!,
    lng: w.longitude!,
    label: w.ward_number ?? null,
  }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search panchayath…"
            value={selectedPanchayath ? selectedPanchayath.name : panchayathQ}
            onChange={(e) => {
              setPanchayathQ(e.target.value);
              if (panchayathId) setPanchayathId(null);
            }}
          />
          {panchayathSuggestions.length > 0 && !panchayathId && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {panchayathSuggestions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPanchayathId(p.id);
                    setPanchayathQ("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={
              panchayathId ? "Search ward…" : "Pick a panchayath first"
            }
            value={wardQ}
            onChange={(e) => setWardQ(e.target.value)}
            disabled={!panchayathId}
          />
        </div>
      </div>

      {!panchayathId ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Search and select a panchayath above to see its wards.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {pinnedWards.length} pinned · {filteredWards.length} of {wards.length}{" "}
            ward{wards.length === 1 ? "" : "s"} in{" "}
            <span className="font-medium text-foreground">
              {selectedPanchayath?.name}
            </span>
            {wardsLoading ? " · loading…" : ""}
          </div>

          {filteredWards.length > 0 && (
            <Card>
              <CardContent className="max-h-48 overflow-auto p-2">
                <ul className="divide-y">
                  {filteredWards.map((w) => {
                    const isPinned = w.latitude != null && w.longitude != null;
                    return (
                      <li
                        key={w.id}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm"
                      >
                        {isPinned ? (
                          <MapPin className="h-4 w-4 text-primary" />
                        ) : (
                          <MapPinOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={isPinned ? "" : "text-muted-foreground"}>
                          {w.ward_number != null ? `#${w.ward_number} · ` : ""}
                          {w.name}
                        </span>
                        {!isPinned && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            not pinned
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <LeafletMap markers={markers} height="60vh" fitToMarkers />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
