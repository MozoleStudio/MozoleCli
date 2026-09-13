# Changelog

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
