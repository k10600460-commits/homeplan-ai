# Multi-Market P0 Implementation Notes

## Deviations

- Branch creation could not be completed in this sandbox because `.git/index.lock` cannot be created. The checked-out tree matched `origin/main` before edits (`git diff origin/main..HEAD` was empty), so file changes were made against the same code tree.
- `shared_links.market` is added as a migration file only. Runtime insert/select code includes compatibility fallbacks where practical so an unapplied migration does not immediately break share creation.
- Per-market build-cost constants are intentionally `null` with `TODO(market-figure)` comments until sourced country figures are approved.

## Unknowns

- `profiles.market` is referenced as a resolver input, but no existing migration for that column was present. Code treats it as optional and falls back without failing if unavailable.
- AU/NZ/CA finance defaults are scaffolding values only, not sourced market figures.
- Full per-market copy/legal localization is not part of P0; `MarketPack.legalFooter` centralizes the seam for later phases.
