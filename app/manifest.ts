import type { MetadataRoute } from 'next';

/**
 * Web App Manifest. Next 16 picks this file up automatically and serves it at
 * /manifest.webmanifest with the right Content-Type — no <link rel="manifest">
 * tag needed in layout.tsx.
 *
 * Why a typed manifest instead of public/manifest.json:
 *  - TypeScript catches typos and enum mistakes (e.g. display: "standalonr").
 *  - One source of truth so the icons referenced here cannot drift from the
 *    files we actually ship in /public/.
 *  - Easy to swap in tenant-specific values when multi-tenant routing lands
 *    in Phase 1.2-and-beyond.
 *
 * Lighthouse PWA criteria covered by this file:
 *  - name + short_name set
 *  - 192x192 + 512x512 icons (any AND maskable)
 *  - theme_color matches the in-app primary
 *  - background_color matches the splash screen we want shown during launch
 *  - start_url scoped so taps from the home-screen always open the guest flow
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` is what browsers use to deduplicate installs across path changes.
    // Pin it explicitly so changing start_url later doesn't orphan installed
    // PWAs on existing devices.
    id: '/?source=pwa',

    name: 'Bistro Nordic Review',
    short_name: 'Bistro Review',
    description:
      'Real-time guest feedback for Bistro Nordic. Rate your visit, leave a tip, or message the manager privately.',

    // Stable language hint helps SR + translation tools when the manifest
    // itself is parsed (Chrome reads description aloud during install).
    lang: 'en',
    dir: 'ltr',

    // start_url + scope together pin the PWA to the guest review flow. If a
    // user navigates outside this scope while installed, the browser opens
    // a regular tab instead of the standalone window — exactly what we want.
    start_url: '/',
    scope: '/',

    // display_override is the modern fallback ladder (window-controls-overlay
    // → standalone → minimal-ui). Falls back gracefully on browsers that
    // don't support the newer modes.
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],

    orientation: 'portrait',

    // Splash screen tokens — should match globals.css theme-good defaults so
    // the launch flash from PWA splash → first paint is invisible.
    background_color: '#F5EDE0',
    theme_color: '#6B1F2A',

    // Categories help Android's Play Store / installer suggest the app in
    // the right grouping when surfaced in app launchers.
    categories: ['food', 'business', 'productivity'],

    icons: [
      // "any" purpose — browsers downsample as needed for tabs, splash, etc.
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // "maskable" purpose — Android's adaptive icon system. Has extra safe
      // area so the central mark survives circular / squircle masks.
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
