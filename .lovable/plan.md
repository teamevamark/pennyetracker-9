# Hybrid map provider: OpenStreetMap by default, Google Maps if key is set

## Why
Your custom domain `pennyekart.com` is not on the Lovable Google Maps key's allowlist, so Google Maps shows "Oops! Something went wrong." OpenStreetMap (via Leaflet) needs no API key and works on any domain. We'll use it as the default, and keep Google Maps as an optional upgrade for whoever later adds their own key.

## What changes (UI)

- **Public map pages** (`/map/panchayath`, `/map/ward`): render a Leaflet map with OSM tiles by default. If a Google Maps key is configured AND it loads successfully, use Google instead. If Google fails (wrong domain, quota, offline), automatically fall back to Leaflet — no more error screen.
- **Update Location pages** (`/update-location/panchayath`, `/update-location/ward`): the pin-on-map picker uses Leaflet by default — click anywhere on the map to drop a pin, or tap "Use my GPS". Google Maps version stays available when key works.
- **Admin mapping pages** (`/admin/mapping/panchayath`, `/admin/mapping/ward`): same hybrid behavior in `MapPicker`.
- **Offline `.mbtiles` map** still wins when uploaded — unchanged.

## What stays the same

- All data, RLS, GPS capture, "Use my location", marker popups, save flow.
- The `app_settings.google_maps_api_key` field still works — admins who want Google Maps just paste a domain-allowlisted key.
- The existing fallback list view (links to Google Maps / OSM) is no longer needed because Leaflet now always renders.

## Technical details

1. Add `leaflet` + `react-leaflet` (`bun add leaflet react-leaflet @types/leaflet`).
2. Create `src/components/map/LeafletMap.tsx` — generic component with props `{ markers, center, onPick?, height }`. Uses OSM tile URL `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` with proper attribution. Click handler invokes `onPick(lat, lng)` for picker mode.
3. Update `src/components/map/MapPicker.tsx`:
   - Try Google Maps first when `apiKey` present.
   - On `useGoogleMaps` returning `"error"` OR no key, render `LeafletMap` in picker mode instead of the current `FallbackPicker`.
   - GPS button + parent dropdown + save logic unchanged.
4. Update `src/routes/map.panchayath.tsx` and `src/routes/map.ward.tsx`:
   - Replace the "Card with error message + list" fallback branch with `<LeafletMap markers={visible} />`.
   - Offline mbtiles path unchanged (still preferred when uploaded and offline).
5. Leaflet CSS: import `leaflet/dist/leaflet.css` once in `src/styles.css` or at the top of `LeafletMap.tsx`. Fix the default marker icon path issue (well-known Leaflet+bundler quirk) inside `LeafletMap.tsx`.
6. No database changes. No new secrets. No edge functions.

## Out of scope

- Setting up a Google Cloud project / billing / your own API key (you can still do this anytime in Admin → Settings to upgrade tile quality).
- Changing the offline `.mbtiles` flow.
- Auth or role changes.
