# CHANGELOG

All notable changes to @silasdevs/core will be documented in this file.

## Unreleased

### Added

- Deep proxy writes now invalidate ancestor subscribers and `useProxy` consumers.
- Optional strict schema classification with atomic validation.
- Optional `AbortSignal` support for `useQuery`; stale requests are aborted and ignored.
- Latest-invoked mutation state ownership and effect-time paginated view activation.

### Fixed

- Paginated collections deduplicate repeated IDs within a single page and dispose views through their owning store.
- `__source` replacement filters reserved keys.
- Compat proxies use local synchronous batching without mutating the core global batch mode.
- Retained deep children preserve ancestor propagation through `__source` replacement.
- Coverage thresholds now protect the tested baseline.
- CI now runs the threshold-enforcing coverage suite.

## 0.3.0

### Minor Changes

- [#10](https://github.com/maldonadoj8/core/pull/10) [`ee15a6d`](https://github.com/maldonadoj8/core/commit/ee15a6d6d737e277fcf848644a0f34cfb43e1f60) Thanks [@maldonadoj8](https://github.com/maldonadoj8)! - Add runtime validation, performance optimizations, observability APIs, and CI/CD automation

  - Runtime safety: input validation, prototype pollution guards, cycle detection, error classes
  - Performance: O(n) schema resolution, paginated collection fix, useRecord optimization
  - Observability: `getPendingCount()`, `store.tables()`, `store.inspect()`, `onMutation` callback
  - Package: ESLint, Changesets, CI/CD workflows, public npm publishing

## 0.2.0

### Minor Changes

- [#8](https://github.com/maldonadoj8/core/pull/8) [`4ef2790`](https://github.com/maldonadoj8/core/commit/4ef27908dfadda79dadf0be00838939e8e370a5a) Thanks [@maldonadoj8](https://github.com/maldonadoj8)! - Add runtime validation, performance optimizations, observability APIs, and CI/CD automation

  - Runtime safety: input validation, prototype pollution guards, cycle detection, error classes
  - Performance: O(n) schema resolution, paginated collection fix, useRecord optimization
  - Observability: `getPendingCount()`, `store.tables()`, `store.inspect()`, `onMutation` callback
  - Package: ESLint, Changesets, CI/CD workflows, public npm publishing

## Legend

- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security vulnerability fixes

---

## Notes

- This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- For planned features and improvements, see [TODO.md](TODO.md)

---

_Last Updated: 2026-08-12_
