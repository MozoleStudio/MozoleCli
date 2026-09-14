# Changelog

## 2.2.2

- Support dual-stack (IPv4 `127.0.0.1` and IPv6 `::1`) port availability detection in dev server manager and doctor diagnostics.
- Prevent port collisions by dynamically reserving ports of actively running workspace dev servers.
- Add comprehensive dual-stack and port reservation unit tests.

## 2.2.1

- Check doctor ports concurrently while keeping diagnostic output in port order.
- Scan built HTML routes and CSS files concurrently for the live geometry probe,
  preserving stable route and stylesheet order.
- Cover doctor diagnostics when Git cannot be launched.

## 2.2.0

- Add repository hygiene audits, conservative signature cleanup, commit-message checks
  and a scheduled read-only maintenance report.
- Add static performance budgets for emitted HTML routes, transitive JS/CSS imports,
  compressed bundle sizes, media/fonts and total build output.
- Add performance baseline comparisons, machine-readable reports and explicit CI exit
  codes, plus TUI and optional verification integration.
- Include toolkit documentation in the npm package and rebuild from a clean dist
  directory before packing to prevent obsolete modules shipping in release archives.

## 2.1.2

- Improve filesystem handling, release packaging and workspace discovery.
