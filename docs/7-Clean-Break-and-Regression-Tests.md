# Actionable Step: Clean Break and Regression Tests

**Objective:** Handle existing v1.2 `localStorage` assessments as incompatible (no field migration, per the fresh-v2-only decision) and add the eight scenario regression tests with fixtures so the v2 behaviour is locked in.

**Prerequisites:** Steps 1–6 (the full v2 engine, types, and report must exist).

**Action Items:**

1. In `src/persistence/localStorageAdapter.ts`, detect saved entries whose `schema_version !== '2.0'` on load. Do **not** attempt to map fields. Mark them so the UI can list them as "incompatible (created in an earlier version)".
2. In `importAssessmentJson()`, reject non-`2.0` schema with a clear user-readable message offering "start a new v2 assessment" (retain the existing throw-on-mismatch behaviour, updated wording).
3. Add the `'incompatible-legacy'` screen/flow (type added in Step 1): when a user opens an incompatible saved entry, route to an explanatory screen rather than crashing or silently loading. Offer "Start new assessment".
4. Confirm `encodeAssessmentForUrl`/`decodeAssessmentFromUrl` and the `#share=` flow round-trip the `AssessmentV2` shape; update the 7,500-char guard expectation if the larger object exceeds it (compression is `deflate-raw`).
5. Create fixture `AssessmentV2` objects (answer maps) for Scenarios A–H (§20) under a test fixtures location (e.g. `src/engine/__fixtures__/`).
6. Add regression tests asserting the §20 expected outcomes for each scenario:
   - A — purpose-built + shared entrance ⇒ not §257, common-parts duties may apply, D10 not a legal duty, hollow-core/no-self-closer ⇒ high-priority risk-based recommendations.
   - B — purpose-built + separate entrances ⇒ not §257, no FSO common-parts duty unless common parts exist, per-flat legal duties apply, LACORS as risk reference only.
   - C — converted + shared entrance ⇒ probable/confirmed §257, D10 benchmark applicable, strong common-parts/door/alarm/stair assessment.
   - D — converted + separate entrances ⇒ possible §257, lower common-parts risk, flat-level duties + compartmentation still assessed.
   - E — upper flat + external steel stair ⇒ reduced shared-route dependency when viable, stair condition assessed, no over-prescription of escape-window/sole-route remedies.
   - F — unknown stair compartmentation ⇒ unknown risk + further investigation, not low.
   - G — hollow-core doors onto shared route ⇒ high-priority door recommendation with strong risk basis.
   - H — CO appliance present, no CO alarm ⇒ legal requirement.
7. Update `localStorageAdapter.test.ts` for the incompatible-legacy path and the `2.0` schema guard.
8. Run the full release checklist (README): `npm run build` (exit 0, produces `dist/`), `npx tsc --noEmit` (0 errors), `npm test` (all pass).

**Acceptance Criteria:**
- Opening a v1.2 saved assessment routes to the incompatible-legacy screen — no crash, no silent/incorrect load.
- All eight §20 scenario tests exist and pass.
- `npm run build`, `npx tsc --noEmit`, and `npm test` all exit 0.
- The eight spec §25 success criteria are demonstrably covered by passing tests.

**Notes:**
- This step deliberately contains **no** v1→v2 field migration (user decision: fresh-v2-only).
- [Unverified] `localStorageAdapter.ts` is ~509 lines; read the import/export/share section fully before editing to avoid regressing the existing guards (10-assessment limit, postcode-based filename, share-length cap).
