# Actionable Step: Data Model and Type Foundation

**Objective:** Replace the v1 `Assessment`/`Classification` types in `src/state/` with the `AssessmentV2` object graph and supporting interfaces from the spec, and bump the version constants, so the rest of the refactor builds on correct types.

**Prerequisites:** None. (Note: this step is tightly coupled to Step 2 — see *Notes*. The green-build checkpoint for the engine may legitimately fall at the end of Step 2.)

**Action Items:**

1. In `src/state/AppState.ts`, bump `SCHEMA_VERSION` from `'1.2'` to `'2.0'` and `APP_VERSION` from `'0.3.0'` to `'0.4.0'` (spec §19.2).
2. Add the classification literal unions from §6.1: `BuildingOrigin`, `HmoClassification`, `EntranceConfiguration`.
3. Add `BuildingClassification` interface carrying §6.3 fields: `origin`, `hmo`, `section_257: boolean`, `case_study_d10: 'applicable' | 'not_applicable' | 'unknown'`, `general_lacors_risk_guidance`, `fso_common_parts`, `entrance_configuration`, `confidence`, and `unresolved_reasons: string[]`.
4. Add `LegalFrameworkAssessment` (§7.1) and the 5-value `LegalStatus` union (§7.2: `legal_requirement | lacors_benchmark_recommendation | risk_based_recommendation | advisory_good_practice | further_investigation_required`). **Reconcile** with the existing 3-value `LegalStatus` in `remedy-rules.ts` — this file becomes the single source; Step 5 migrates the rules.
5. Add `CommonPartsAssessment` (§8.1) and `DetectionAssessment` (§13.1, shared by flats and common parts).
6. Add `FlatAssessment` (§9.1) and its members: `BedroomAssessment`, `HabitableRoomAssessment`, `DoorAssessment` (§11.1), `InternalEscapeAssessment`, `ExternalEscapeAssessment` (§10.1), `COAssessment` (§14.1 fields), `GasAssessment`, `ElectricalAssessment`.
7. Add `StairCompartmentationAssessment` (§12.1).
8. Add the risk model types (§15): `RiskSeverity`, `RiskKnowledge`, `RiskDomainAssessment`, `RiskFactor`, and `RiskAssessment` with the six domains (`escape, doors, detection, compartmentation, common_parts, management`).
9. Add `RemedyRule` (§16.1) and `RemedySummary`, plus `EvidenceRecord`, `Assumption`, `UnknownItem`.
10. Add the top-level `AssessmentV2` interface (§5.1) and make it the persisted shape. **Design decision to encode and document in the file header:** `AnswerMap` remains the Layer-1 source of truth (the question bank still drives data collection); `building`, `common_parts`, `flats`, `classification`, `legal_framework`, `risk`, and `remedies` are *derived snapshots* recomputed from answers on load (mirroring how v1 re-runs `classify()` on `RESUME_ASSESSMENT`). This preserves the existing "answers in, derived structures out" architecture and keeps the engine pure.
11. Update `AssessmentIndexEntry`, `CompletionStatus`, and `AppScreen`: add an `'incompatible-legacy'` screen value (consumed by Step 7) and keep `schema_version` on index entries.
12. Apply the minimum transitional edits to `reducer.ts`, `classifier.ts`, and `AppContext.tsx` needed for `npx tsc --noEmit` to pass — e.g. a temporary `classify()` signature returning the new `BuildingClassification`/`RiskAssessment` skeleton. Full derivation logic lands in Steps 2 and 4.

**Acceptance Criteria:**
- `npx tsc --noEmit` exits 0.
- `SCHEMA_VERSION === '2.0'`, `APP_VERSION === '0.4.0'`.
- All `AssessmentV2` member interfaces from spec §5–§16 exist and are exported from `src/state/AppState.ts`.
- No business logic added to type files (per `CLAUDE.md` boundary rules).

**Notes:**
- [Inference] Because the central `Assessment` type is consumed by every engine module and page, a strict "green after every step" cannot apply *within* Step 1 in isolation; the realistic checkpoint is "tsc green at end of Step 1 via transitional stubs, full test suite green at end of Step 2." This is consistent with the spec grouping data model + classification together in Phase 1 (§21).
- The existing v1 `Classification` type is deleted, not retained (user decision: replace in place, fresh-v2-only — no migration mapping needed).
