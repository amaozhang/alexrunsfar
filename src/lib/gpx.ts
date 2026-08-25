import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface Point { lat: number; lon: number; ele?: number }
export interface Track {
  name?: string;
  points: Point[];
  waypoints: { lat: number; lon: number; name: string }[];
  miles: number;
  gainFt?: number;
  /** Cumulative miles at each point, parallel to `points`. */
  dist: number[];
  hasElevation: boolean;
}

const M_TO_FT = 3.280839895;
const KM_TO_MI = 0.621371;

/** Great-circle distance in km. */
function haversine(a: Point, b: Point) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Read a GPX file from src/data/tracks/.
 *
 * Deliberately a light regex parse rather than an XML dependency: GPX track
 * points are a flat, predictable shape and these files run to ~12k points.
 */
export function loadTrack(filename: string, gainOverride?: number): Track | undefined {
  // Resolve from the project root, not import.meta.url — Astro bundles this
  // module during build and the relative URL no longer points at src/.
  const path = join(process.cwd(), 'src/data/tracks', filename);
  if (!existsSync(path)) return undefined;
  const xml = readFileSync(path, 'utf8');

  const name = xml.match(/<metadata>[\s\S]*?<name>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/name>/)?.[1]?.trim();

  const points: Point[] = [];
  const re = /<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  for (const m of xml.matchAll(re)) {
    const ele = m[3]?.match(/<ele>([-\d.]+)<\/ele>/)?.[1];
    points.push({ lat: +m[1], lon: +m[2], ele: ele !== undefined ? +ele : undefined });
  }

  const waypoints: Track['waypoints'] = [];
  const wre = /<wpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*>([\s\S]*?)<\/wpt>/g;
  for (const m of xml.matchAll(wre)) {
    const wn = m[3].match(/<name>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/name>/)?.[1]?.trim();
    if (wn) waypoints.push({ lat: +m[1], lon: +m[2], name: wn });
  }

  if (points.length < 2) return undefined;

  // Cumulative distance.
  const dist: number[] = [0];
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversine(points[i - 1], points[i]);
    dist.push(km * KM_TO_MI);
  }

  // Total gain, with a noise floor. Raw GPS elevation jitters by a metre or two
  // per sample; summing every positive delta inflates gain badly on a long course.
  const withEle = points.filter((p) => typeof p.ele === 'number');

  // Elevation has to be *trustworthy*, not merely present. KML-derived course
  // files often carry elevation that was clamped or interpolated: long runs of
  // an identical value, a handful of distinct readings. Summing those produces
  // a gain figure that is confidently wrong, so reject the series instead.
  const eles = withEle.map((p) => p.ele!);
  let flat = 0;
  for (let i = 1; i < eles.length; i++) if (eles[i] === eles[i - 1]) flat++;
  const flatRatio = eles.length > 1 ? flat / (eles.length - 1) : 1;
  const distinctRatio = eles.length ? new Set(eles).size / eles.length : 0;
  const trustworthy = flatRatio < 0.5 && distinctRatio > 0.1;

  const hasElevation = withEle.length > points.length * 0.5 && trustworthy;
  let gainFt: number | undefined;
  if (hasElevation) {
    const NOISE_M = 3;
    let gain = 0;
    let ref = points.find((p) => p.ele !== undefined)!.ele!;
    for (const p of points) {
      if (p.ele === undefined) continue;
      const d = p.ele - ref;
      if (d > NOISE_M) { gain += d; ref = p.ele; }
      else if (d < -NOISE_M) { ref = p.ele; }
    }
    gainFt = Math.round(gain * M_TO_FT);
  }

  return { name, points, waypoints, dist, miles: km * KM_TO_MI, gainFt: gainOverride ?? gainFt, hasElevation };
}

/** Even-stride downsample that always keeps the first and last point. */
export function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

export const feet = (m: number) => Math.round(m * M_TO_FT);
