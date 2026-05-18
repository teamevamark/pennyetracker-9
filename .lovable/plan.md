## Goal

On `/admin/mapping/panchayath` and `/admin/mapping/ward`, restore the old N/S/E/W neighbour marking next to the Google Map pin picker by splitting them into two tabs.

## Changes

### `src/routes/admin.mapping.panchayath.tsx`
Wrap the page body in a shadcn `Tabs` component:

- **Tab 1 — "Map pin"** (default): existing `<MapPicker kind="panchayath" .../>` flow.
- **Tab 2 — "Neighbours (N/S/E/W)"**: render `<GraphCanvas cfg={{ label: "Panchayath", nodesTable: "panchayaths", edgesTable: "panchayath_connections", srcCol: "source_panchayath_id", tgtCol: "target_panchayath_id", parentRef: { key: "district_id", label: "District", table: "districts" } }} />` — same config as `/marking/panchayath`.

### `src/routes/admin.mapping.ward.tsx`
Same pattern:

- **Tab 1 — "Map pin"**: existing `<MapPicker kind="ward" .../>`.
- **Tab 2 — "Neighbours (N/S/E/W)"**: `<GraphCanvas cfg={{ label: "Ward", nodesTable: "wards", edgesTable: "ward_connections", srcCol: "source_ward_id", tgtCol: "target_ward_id", parentRef: { key: "panchayath_id", label: "Panchayath", table: "panchayaths" }, subtitle: (n) => n.ward_number ? `Ward #${n.ward_number}` : null }} />`.

Both pages keep their current Back button + heading. Tab state is local (`useState`), no URL sync.

## Out of scope
- The standalone `/marking/panchayath` and `/marking/ward` routes stay as-is.
- No changes to `GraphCanvas`, `MapPicker`, or the DB.
