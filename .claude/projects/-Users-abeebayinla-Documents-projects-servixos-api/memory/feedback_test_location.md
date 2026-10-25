---
name: feedback_test_location
description: Test files must always live in the test/ directory, never in src/modules/
metadata:
  type: feedback
---

Always place spec files in `test/` (mirroring the module structure), never inside `src/modules/`.

**Why:** Tests should be co-located with the test suite, not scattered through the source tree. This is a hard rule enforced by the project owner.

**How to apply:** When writing new spec files or moving existing ones, the destination is always `test/<module-name>/<file>.spec.ts`. Convert any relative imports to `src/` path aliases to account for the different directory depth.
