import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://alexrunsfar.com',
  integrations: [sitemap()],
  image: {
    // Build-time responsive derivatives; originals never ship.
    responsiveStyles: true,
    layout: 'constrained',
  },
});
