# TODO

This document tracks planned features, improvements, and known issues for @silas/core.

## Legend

- 🔴 High Priority
- 🟡 Medium Priority
- 🟢 Low Priority
- 🚧 In Progress
- ✅ Completed (moved to changelog)

---

## Upcoming Release (v0.0.1)

### Features

### Bug Fixes

### Documentation

---

## Backlog

### Features & Enhancements

#### Core Functionality
- [ ] 🟡 Predicate-based comparison for proxy upserts, allowing custom logic to determine if an incoming record should overwrite an existing one based on a user-defined function
- [ ] 🟡 Support for array of records in `store.classify()`, storing them in a generic fallback table
- [ ] 🟡 Strict mode for schema and classification errors, throwing detailed exceptions when records fail to classify or violate schema constraints

#### API Improvements

#### Developer Experience
- [ ] 🟡 Store devtools extension for inspecting cache state and classification logic

### Bugs & Issues

#### Critical

#### Normal

#### Minor

### Documentation

### Testing

### Infrastructure

---

## Future Considerations

These are ideas that need more discussion or are out of scope for near-term releases:

---

## Completed

Items completed in the current development cycle. These will be moved to CHANGELOG.md on release.

---

## Notes

- Breaking changes should be clearly marked and discussed in issues before implementation

---

*Last Updated: 2026-06-14*