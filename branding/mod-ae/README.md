# ModAE Branding Reference

Official source material scraped from mod-ae.com for product copy, brand positioning, contact details, and visual assets.

**Changed 20 August 2026.** This file used to say the app's colours and fonts should
stay as they were and the website palette was reference-only. The client reversed that
in the 20 Aug review: the UI adopts ModAE's *full* brand identity — colours and buttons
— from the website, not just the logo and font.

The palette now lives in `src/branding/modae.js` as `MODAE_COLORS` and `MODAE_TYPE`,
read off the site's own theme stylesheet (`wp-content/themes/Qfactum/assets/css/style.css`),
and is mirrored into the `:root` block of `src/styles.css`. `raw/*.html` remains the
capture those values came from.

One deliberate departure: the brand colour is a red, and the app also uses red to mean
*lost*, *overdue* and *Red-class customer*. Those keep a separate hue so a destructive
state never reads as a primary button.

## Contact

- Company: Modae Private Limited
- Email: ceo@mod-ae.com
- Phone: +91 97315 77119
- Location: Bengaluru, Karnataka, India
- Opening hours: 10 AM - 6 PM, Monday to Friday
- Directions: https://maps.app.goo.gl/tNP83Vh7aYmB4xjJ6
- LinkedIn: https://www.linkedin.com/company/modae/

## Brand Notes

- Tagline: Empowering Safety in Aerospace and Energy
- Positioning: Building safer, reliable, and efficient solutions for safety-critical operations across energy, aerospace, and defence.
- Vision: To be a pioneer in providing solutions and services that enable customers to achieve safer operations and high availability of assets at competitive costs.
- Mission: To deliver innovative, reliable, and high-quality solutions by fostering continuous learning and growth, while acting as a trusted partner for operational excellence through technology, innovation, and strategic solutions.
- Sectors: Energy, Aerospace, Defence

## Products

- [Antisurge Control System](https://mod-ae.com/products/antisurge-control-system/) - ModAE’s Antisurge Control Systems are designed to protect compressors from dangerous surge conditions that can cause severe damage to turbomachinery.
- [Asset Health Management](https://mod-ae.com/products/asset-health-management/) - ModAE’s Asset Health Management (AHM) solutions provide industry-leading tools for maintaining the reliability, availability and performance of critical machinery across energy sectors.
- [Machinery Diagnostics](https://mod-ae.com/products/machinery-diagnostics/) - ModAE’s Machinery Diagnostics solutions offer advanced tools and software for assessing the condition of rotating equipment.
- [Monitoring Systems](https://mod-ae.com/products/monitoring-systems/) - ModAE provides a range of sophisticated monitoring systems designed to ensure the safety, reliability, and performance of critical rotating equipment in energy sectors.
- [OverSpeed Detection System](https://mod-ae.com/products/overspeed-detection-system/) - ModAE’s OverSpeed Detection Systems are designed to safeguard critical rotating machinery by monitoring and controlling speed conditions, preventing catastrophic equipment failure due to overspeed events.
- [Sensors](https://mod-ae.com/products/sensors/) - ModAE offers a comprehensive range of industrial sensors for real-time condition monitoring and protection of critical rotating equipment in energy systems.
- [Turbine Control System](https://mod-ae.com/products/turbine-control-system/) - ModAE’s Turbine Control Systems provide precise control and monitoring solutions for various turbine applications, including gas, steam, and hydro turbines.

## Folder Contents

- data/products.json: structured product catalog.
- data/contact.json: normalized contact information.
- data/brand-profile.json: normalized brand summary.
- data/site-map.json: Firecrawl-discovered official URLs.
- data/asset-manifest.json: downloaded asset source mapping (see Asset manifest below).
- raw/: raw HTML/API captures and per-product markdown.
- raw/wp-media.json: archived media-library API response, the input to the asset capture.
- assets/: full-resolution originals — logos, brand imagery, product, service and industry photography.
- assets/web/: the same images at <=1024px on the long edge, under identical base filenames, so `assets/X.jpg` and `assets/web/X.jpg` always pair.

Nine assets are resolved by literal path from `src/branding/modae.js` and asserted in
`tests/mobile-deploy.test.mjs`. **Do not rename or move anything in `assets/`** — the manifest
marks those entries `consumed_by_app: true`.

`assets/modae-official-logo.png` is not a separate upload: it is a re-encode of
`assets/red-logo.png` (identical 1770x485 RGBA canvas, every pixel with alpha>0 byte-identical,
differing only in the RGB beneath fully transparent pixels). It is the file the app consumes
as `logoUrl` / `letterheadUrl` / `officialLogoUrl`.

## Capture

    node scripts/fetch-modae-assets.mjs [--force]

Re-downloads the image archive from the WordPress media library and regenerates
`data/asset-manifest.json`. Notes on its behaviour:

- **Only `2024/06/` and `2024/10/` uploads are ModAE's.** The ~113 items under `2024/05/` are
  leftover demo content from the purchased Qfactum theme (stock digital-marketing and contracts
  imagery, `QFACTUM-PRESENTATION.pdf`) and are deliberately excluded. Filenames alone do not
  separate them; upload month does.
- **Throttled.** mod-ae.com sits behind Cloudflare and starts serving `Just a moment...`
  interstitials under a burst, so requests run one at a time with a ~2-3.5s gap. A full run takes
  several minutes.
- **Validated.** A challenge page returns HTTP 200 and would otherwise be saved as a corrupt
  `.jpg`. Nothing is written unless it passes a content-type, magic-byte, size and marker check.
  After two consecutive challenges the run aborts rather than writing junk.
- **Resumable.** Files already on disk and valid are skipped, so re-running after an abort is
  cheap. Use `--force` to refetch everything.
- Web variants come from each item's `media_details.sizes`, picking the largest whose *long edge*
  is <=1024 — never a guessed `-1024x576` filename, which finds only about half of them, and never
  a width-based rule, which picks the wrong tier for portrait images. If no such variant exists the
  original is downscaled locally with `sips` (macOS only). If the original is already <=1024 no
  duplicate is written and the manifest records `same_as_full`.

## Asset manifest

Each entry keeps `title`, `type`, `source_url` and `local_path`, plus:

- `wp_media_id`, `fetched_at`, `alt_text` where the library provides it.
- `full` and `web` blocks, each with `path`, `width`, `height`, `bytes`, `sha1`.
- `web.origin`: `wordpress_size` | `same_as_full` | `local_downscale_sips`.
- `provenance`: `wordpress_media`, or `verified_identical_artwork` for the official logo.
- `consumed_by_app: true` on the nine files the app resolves directly.

`type` is one of `logo`, `brand`, `product`, `service`, `industry`, `site`.

## Source URLs

- https://mod-ae.com/
- https://mod-ae.com/products/
- https://mod-ae.com/about-us/
- https://mod-ae.com/contact-us/
- https://mod-ae.com/products/antisurge-control-system/
- https://mod-ae.com/products/asset-health-management/
- https://mod-ae.com/products/machinery-diagnostics/
- https://mod-ae.com/products/monitoring-systems/
- https://mod-ae.com/products/overspeed-detection-system/
- https://mod-ae.com/products/sensors/
- https://mod-ae.com/products/turbine-control-system/
