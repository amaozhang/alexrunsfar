import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '../lib/site';

/**
 * One feed for everything Alex writes: essays from the `writing` collection and
 * race reports typed into the body of a `races` file. Race files without a body
 * are results, not posts — they stay out until there's something to read.
 *
 * Items carry the description only, not the full post. Subscribers get the
 * headline and click through; nothing here needs a markdown renderer.
 */
export async function GET(context: { site?: URL }) {
  const essays = (await getCollection('writing'))
    .filter((p) => !p.data.draft)
    .map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      // External posts (old Medium pieces) link straight out; absolute URLs are
      // passed through by @astrojs/rss rather than joined onto the site origin.
      link: p.data.external ?? `/writing/${p.id}`,
      categories: p.data.tags,
    }));

  const reports = (await getCollection('races'))
    .filter((r) => r.body?.trim() && r.data.date)
    .map((r) => ({
      title: `${r.data.name} — race report`,
      description: r.data.blurb ?? `${r.data.distance} in ${r.data.city}, ${r.data.state}.`,
      pubDate: r.data.date!,
      link: `/races/${r.id}`,
      categories: ['race report'],
    }));

  const items = [...essays, ...reports].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime(),
  );

  return rss({
    title: site.title,
    description: 'Race reports and the occasional essay. Infrequent by design but more frequent than history would suggest.',
    site: context.site ?? site.url,
    items,
    customData: '<language>en-us</language>',
  });
}
