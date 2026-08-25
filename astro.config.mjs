import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alexrunsfar.com',
  image: {
    // Build-time responsive derivatives; originals never ship.
    responsiveStyles: true,
    layout: 'constrained',
  },
});
