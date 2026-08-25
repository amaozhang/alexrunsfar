import { getCollection } from 'astro:content';

export interface StreamPhoto {
  src: any;
  alt: string;
  caption?: string;
  date?: Date;
  hero: boolean;
  album: string;
  albumDate: Date;
}

/**
 * Every photo across every album as one list, newest first. Albums still exist
 * as a grouping for race pages; the photo stream deliberately ignores them.
 */
export async function photoStream(): Promise<StreamPhoto[]> {
  const albums = await getCollection('albums');
  const all = albums.flatMap((a) =>
    a.data.photos.map((p) => ({
      ...p,
      alt: p.alt ?? '',
      hero: p.hero ?? false,
      album: a.data.title,
      albumDate: a.data.date,
    })),
  );
  return all.sort((x, y) => {
    const a = (x.date ?? x.albumDate).getTime();
    const b = (y.date ?? y.albumDate).getTime();
    return b - a;
  });
}

/** Landscape shots read best in a full-width hero. */
export const isLandscape = (p: StreamPhoto) => p.src.width > p.src.height;

/**
 * Hero picks: curated `hero: true` photos if any exist, otherwise a spread of
 * landscape shots sampled across the whole library rather than clustered in
 * whichever week Alex last went out.
 */
export function heroPicks(stream: StreamPhoto[], count = 5): StreamPhoto[] {
  const flagged = stream.filter((p) => p.hero);
  if (flagged.length) return flagged.slice(0, count);
  const land = stream.filter(isLandscape);
  if (land.length <= count) return land;
  const step = land.length / count;
  return Array.from({ length: count }, (_, i) => land[Math.floor(i * step)]);
}
