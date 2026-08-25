import type { StreamPhoto } from './photos';

export interface Cluster {
  id: string;
  name: string;
  /** Pins that would collide at world scale share a group. */
  group?: string;
  lat: number;
  lon: number;
  count: number;
  photos: StreamPhoto[];
}

/**
 * Named regions, matched by bounding box. Reverse geocoding would need a
 * network call at build time and would return administrative names ("Clallam
 * County") rather than the name a runner would use.
 */
const REGIONS: {
  name: string; id: string; group?: string; box: [number, number, number, number];
}[] = [
  // id,            [minLat, maxLat, minLon, maxLon]
  { id: 'olympics',  name: 'Olympic Peninsula',    group: 'washington', box: [47.2, 48.6, -124.9, -122.8] },
  { id: 'cascades',  name: 'Cascades',             group: 'washington', box: [46.4, 49.1, -122.8, -120.0] },
  { id: 'se-wa',     name: 'Southeast Washington', group: 'washington', box: [45.5, 47.0, -119.5, -117.0] },
  { id: 'lofoten',   name: 'Lofoten',              box: [67.0, 69.5, 12.0, 16.5] },
  { id: 'faroes',    name: 'Faroe Islands',        box: [61.3, 62.5, -7.8, -6.2] },
  { id: 'iceland',   name: 'Iceland',              box: [63.0, 66.6, -24.6, -13.0] },
  // Torres del Paine (Chile) and El Chaltén (Argentina) are ~200km apart — two
  // distinct places on the ground, one pin at world scale.
  { id: 'torres-del-paine', name: 'Torres del Paine', group: 'patagonia', box: [-52.5, -50.0, -74.5, -72.0] },
  { id: 'el-chalten',       name: 'El Chaltén',       group: 'patagonia', box: [-50.0, -49.0, -73.3, -72.4] },
  { id: 'black-canyon',     name: 'Black Canyon Trail', box: [33.9, 34.8, -112.7, -111.8] },
  { id: 'death-valley',     name: 'Death Valley',       box: [35.7, 37.0, -117.4, -116.2] },
  { id: 'tahoe',            name: 'Lake Tahoe',         box: [38.7, 39.5, -120.4, -119.7] },
  { id: 'manhattan', name: 'Manhattan',           box: [40.55, 40.95, -74.15, -73.70] },
];

export const GROUP_NAMES: Record<string, string> = { washington: 'Washington', patagonia: 'Patagonia' };

export function clusterPhotos(photos: StreamPhoto[]): Cluster[] {
  const located = photos.filter(
    (p) => typeof p.lat === 'number' && typeof p.lon === 'number',
  );
  const byId = new Map<string, Cluster>();
  const unplaced: StreamPhoto[] = [];

  for (const p of located) {
    const r = REGIONS.find(
      ({ box: [a, b, c, d] }) => p.lat! >= a && p.lat! <= b && p.lon! >= c && p.lon! <= d,
    );
    if (!r) { unplaced.push(p); continue; }
    let c = byId.get(r.id);
    if (!c) { c = { id: r.id, name: r.name, group: r.group, lat: 0, lon: 0, count: 0, photos: [] }; byId.set(r.id, c); }
    c.photos.push(p);
    c.count++;
  }

  // Anything outside a known box still gets a pin, grouped on a 2-degree grid,
  // so a new trip shows up on the map before anyone names it.
  for (const p of unplaced) {
    const id = `at-${Math.round(p.lat! / 2) * 2}-${Math.round(p.lon! / 2) * 2}`;
    let c = byId.get(id);
    if (!c) {
      c = { id, name: `${p.lat!.toFixed(1)}, ${p.lon!.toFixed(1)}`, lat: 0, lon: 0, count: 0, photos: [] };
      byId.set(id, c);
    }
    c.photos.push(p); c.count++;
  }

  for (const c of byId.values()) {
    c.lat = c.photos.reduce((s, p) => s + p.lat!, 0) / c.photos.length;
    c.lon = c.photos.reduce((s, p) => s + p.lon!, 0) / c.photos.length;
  }
  return [...byId.values()].sort((a, b) => b.count - a.count);
}

/**
 * Pins for the map. Regions closer together than the projection can separate —
 * the three Washington ones are ~3px apart at world scale — collapse into one
 * pin. The legend still lists them individually.
 */
export function mapPins(clusters: Cluster[]): Cluster[] {
  const out: Cluster[] = [];
  const grouped = new Map<string, Cluster[]>();
  for (const c of clusters) {
    if (!c.group) { out.push(c); continue; }
    const g = grouped.get(c.group) ?? [];
    g.push(c); grouped.set(c.group, g);
  }
  for (const [g, members] of grouped) {
    const photos = members.flatMap((m) => m.photos);
    out.push({
      id: members.map((m) => m.id).join(','),
      name: GROUP_NAMES[g] ?? g,
      lat: photos.reduce((s, p) => s + p.lat!, 0) / photos.length,
      lon: photos.reduce((s, p) => s + p.lon!, 0) / photos.length,
      count: photos.length,
      photos,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
