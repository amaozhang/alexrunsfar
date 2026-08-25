import { getCollection, type CollectionEntry } from 'astro:content';

export type Race = CollectionEntry<'races'>;

const time = (r: Race) => r.data.date?.getTime() ?? 0;

/** All races that have a date, newest first. Someday ideas are excluded. */
export async function allRaces(): Promise<Race[]> {
  const races = await getCollection('races');
  return races.filter((r) => r.data.status !== 'someday').sort((a, b) => time(b) - time(a));
}

/** Ideas without a start line yet — Wonderland, Timberline, Hundy Hills. */
export async function somedayRaces(): Promise<Race[]> {
  const races = await getCollection('races');
  return races
    .filter((r) => r.data.status === 'someday')
    .sort((a, b) => b.data.miles - a.data.miles);
}

export function finished(races: Race[]) {
  return races.filter((r) => r.data.status === 'finished');
}

/** The next race on the calendar, if there is one. */
export function nextRace(races: Race[]) {
  const upcoming = races
    .filter((r) => r.data.status === 'upcoming')
    .sort((a, b) => time(a) - time(b));
  return upcoming[0];
}

/** Headline numbers for the site. Derived, never hand-maintained. */
export function careerStats(races: Race[]) {
  const done = finished(races);
  const years = done.map((r) => r.data.date?.getUTCFullYear()).filter(Boolean) as number[];
  return {
    count: done.length,
    miles: done.reduce((sum, r) => sum + r.data.miles, 0),
    longest: done.reduce((max, r) => Math.max(max, r.data.miles), 0),
    wins: done.filter((r) => r.data.placeOverall === 1).length,
    firstYear: years.length ? Math.min(...years) : undefined,
  };
}

export function resultsUrl(race: Race) {
  if (race.data.resultsUrl) return race.data.resultsUrl;
  return race.data.ultrasignupId
    ? `https://ultrasignup.com/results_event.aspx?did=${race.data.ultrasignupId}`
    : undefined;
}

/** Where the results link points, for the link text. */
export function resultsLabel(race: Race) {
  if (race.data.resultsLabel) return race.data.resultsLabel;
  return race.data.resultsUrl ? 'Full results' : 'Full results on UltraSignup';
}

/** "Issaquah, WA" for a real race; "Mt. Rainier, WA" for an idea. */
export function placeLabel(race: Race) {
  const { city, state, area } = race.data;
  if (city && state) return `${city}, ${state}`;
  return area ?? city ?? state ?? '';
}

export function place(race: Race) {
  const p = race.data.placeOverall;
  // Winning a race you invented and ran alone isn't a placing. The result is
  // kept in the data; it just doesn't get displayed as a rank.
  if (race.data.selfCreated) return undefined;
  if (!p) return undefined;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = p % 100;
  return `${p}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions = {}) =>
  d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', ...opts });

const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];

/** Spell a small number for prose; fall back to digits beyond twenty. */
export const spell = (n: number) => WORDS[n] ?? String(n);
