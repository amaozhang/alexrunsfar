import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * A race is one markdown file. Frontmatter carries the result; the body is the
 * race report and is OPTIONAL — most older races have no report, and that's fine.
 * Writing a report later means typing into the body of a file that already exists.
 */
const races = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/_*.md'], base: './src/content/races' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      // Optional: a "someday" entry is an idea, not a date on the calendar.
      date: z.date().optional(),
      // "100 Miler", "100K", "50K" — how the race itself labels the distance.
      distance: z.string(),
      // Numeric miles, for sorting and for the lifetime-mileage tally.
      miles: z.number(),
      city: z.string().optional(),
      state: z.string().optional(),
      // Looser place for ideas that aren't pinned to a start line yet,
      // e.g. "Mt. Rainier, WA". Falls back to city/state when absent.
      area: z.string().optional(),
      status: z.enum(['finished', 'upcoming', 'someday', 'dnf', 'dns']).default('finished'),
      time: z.string().optional(),
      placeOverall: z.number().optional(),
      placeGender: z.number().optional(),
      // UltraSignup's 0–1 performance rank for this result.
      ultrasignupRank: z.number().optional(),
      // event_distance_id → results page on ultrasignup.com
      ultrasignupId: z.number().optional(),
      // Overrides the UltraSignup link when results live somewhere else.
      resultsUrl: z.string().url().optional(),
      resultsLabel: z.string().optional(),
      // Size of the finishing field, so a placing has context.
      finishers: z.number().optional(),
      divisionPlace: z.number().optional(),
      division: z.string().optional(),
      stravaActivityId: z.string().optional(),
      // Filename in src/data/tracks/ — a course or recorded GPX. Renders a
      // route map and, if the file carries elevation, a profile.
      track: z.string().optional(),
      trackLabel: z.string().optional(),
      // Feet of climb, measured on the full-resolution GPX before simplifying.
      gainFt: z.number().optional(),
      // Set when the recording doesn't cover the whole race (dead watch, etc).
      trackNote: z.string().optional(),
      // Races Alex made up himself rather than signed up for.
      selfCreated: z.boolean().default(false),
      featured: z.boolean().default(false),
      cover: image().optional(),
      blurb: z.string().optional(),
    })
    .superRefine((d, ctx) => {
      if (d.status !== 'someday' && !d.date) {
        ctx.addIssue({ code: 'custom', message: '`date` is required unless status is "someday"', path: ['date'] });
      }
      if (d.status !== 'someday' && !(d.city && d.state)) {
        ctx.addIssue({ code: 'custom', message: '`city` and `state` are required unless status is "someday"', path: ['city'] });
      }
    }),
});

/**
 * Writing. `external` points at a Medium post (or anywhere else) instead of a
 * local body — lets old Medium pieces sit in the same index as new local ones.
 */
const writing = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/_*.md'], base: './src/content/writing' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.date(),
      description: z.string(),
      external: z.string().url().optional(),
      draft: z.boolean().default(false),
      cover: image().optional(),
      tags: z.array(z.string()).default([]),
    }),
});

/**
 * Photos are grouped into albums — one file per outing. Cheaper to maintain than
 * one file per photo when the count runs to hundreds.
 */
const albums = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/_*.md'], base: './src/content/albums' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.date(),
      location: z.string().optional(),
      kind: z.enum(['race', 'training', 'hike', 'travel', 'other']).default('other'),
      // Optional link back to a race slug, so a race page can show its album.
      race: z.string().optional(),
      cover: image().optional(),
      photos: z
        .array(
          z.object({
            src: image(),
            alt: z.string().default(''),
            caption: z.string().optional(),
            // Capture date, so /photos can be one chronological stream that
            // ignores which album a photo happens to live in.
            date: z.date().optional(),
            // Rounded to ~1km. Precise enough to place on a map, too coarse to
            // pin a doorstep. Sourced from Apple Photos, not from the image
            // files — the importer strips EXIF.
            lat: z.number().optional(),
            lon: z.number().optional(),
            // Opt a photo into the homepage hero carousel. When nothing is
            // flagged the build falls back to picking landscape shots.
            hero: z.boolean().default(false),
          }),
        )
        .default([]),
    }),
});

export const collections = { races, writing, albums };
