# Actionable Step: Classification and Legal-Framework Engine

**Objective:** Refactor `src/engine/classifier.ts` to derive a `BuildingClassification` plus a distinct `LegalFrameworkAssessment` from the answers, correctly separating "what type of building" from "what statutory duties apply".

**Prerequisites:** Step 1 (Data Model and Type Foundation).

**Action Items:**

1. Replace the single `classify(answers): Classification` export with `classify(answers): BuildingClassification` and add `deriveLegalFramework(answers, classification): LegalFrameworkAssessment`. Keep both pure (no React/DOM/storage — `CLAUDE.md` boundary).
2. Implement building-origin derivation (`purpose_built_two_flats | converted_from_single_house | unknown`) from the relevant setup/Section-A answers.
3. Implement HMO logic per §6.2 truth table. Enforce: two flats alone never imply Section 257; purpose-built ⇒ `hmo = 'not_hmo'`, `section_257 = false`; converted ⇒ at least `probable_section_257_hmo` subject to the owner-occupation threshold (50% owner-occupied stays in scope; ≥ two-thirds may exit).
4. Implement §6.3 purpose-built handling exactly: set `case_study_d10 = 'not_applicable'` but keep `general_lacors_risk_guidance = 'applicable'` and `fso_common_parts = common_parts.exists`. **Do not** set an overall "not applicable" fire benchmark.
5. Implement `entrance_configuration` derivation (`separate_private_entrances | shared_entrance_hall | shared_hall_and_shared_stair | unknown`) from the common-parts/entrance answers (replaces v1 `communal_entrance` + `separate_entrance_mode`).
6. Implement `deriveLegalFramework` per §7.1: `electrical_safety` and `hhsrs_fire_hazard` are always `'applies'`; `smoke_co_alarm_regulations`, `gas_safety`, `fire_safety_order_common_parts`, `section_257_hmo`, and `lacors_guidance_use` are derived from facts (e.g. FSO common parts `applies` iff common parts exist; `lacors_guidance_use = 'direct_benchmark'` for converted/§257 cases, `'risk_reference'` otherwise).
7. Preserve the null-sentinel pattern (`boolean | null`) for classification criteria where `null` = unanswered, `false` = explicitly not met (carried over from v1 classifier).
8. Carry forward the existing uncertainty handling (`BLOCK_CLASS` → `unresolved`, `unresolved_reasons`) from the v1 classifier into `BuildingClassification.confidence`.
9. Rewrite `src/engine/classifier.test.ts` against the new outputs, covering the §6.2 table rows and the §6.3 purpose-built invariant.

**Acceptance Criteria:**
- A purpose-built two-flat building classifies as `not_hmo` / `section_257 = false` while `general_lacors_risk_guidance` stays `'applicable'` (spec success criterion §25.1).
- A converted two-flat building can classify as `probable_section_257_hmo` or `section_257_hmo` where facts support it (§25.2).
- `LegalFrameworkAssessment` always reports `electrical_safety` and `hhsrs_fire_hazard` as `'applies'`.
- `classify()` and `deriveLegalFramework()` remain pure functions; `npm test` and `npx tsc --noEmit` exit 0.

**Notes:**
- The §6.2 owner-occupation thresholds depend on which answers capture owner-occupation. [Unverified] I have not yet read the full Section-A question definitions; the exact answer IDs must be confirmed against `questions.ts` during implementation (overlaps with Step 3).
