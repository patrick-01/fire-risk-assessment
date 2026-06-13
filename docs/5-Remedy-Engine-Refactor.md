# Actionable Step: Remedy Engine Refactor

**Objective:** Extend the remedy rule shape and engine to carry the v2 fields (`legal_status`, `priority`, `applies_to`, `confidence`, `suppress_if`, `downgrade_if`), re-map existing rules into the five output groups, and guarantee D10 is never emitted as a legal duty for purpose-built buildings.

**Prerequisites:** Steps 1–4 (types, classification, question IDs, risk model).

**Action Items:**

1. Update `RemedyRule` in `src/data/rules/remedy-rules.ts` to the §16.1 shape: `id`, `title`, `legal_status` (5-value union from Step 1), `priority: 'P1_urgent' | 'P2_high' | 'P3_medium' | 'P4_low' | 'investigate'`, `applies_to: 'building' | 'common_parts' | 'ground_flat' | 'upper_flat'`, `condition`, `text`, `risk_basis`, `regulatory_refs`, `confidence: 'confirmed' | 'probable' | 'contingent' | 'unknown'`, optional `suppress_if`, optional `downgrade_if`.
2. Bump `RULES_VERSION` to `'2026-06-v1'` and update `RULES_DATE` (§19.2).
3. In `src/engine/remedyEngine.ts`, replace the v1 `tier`/`applies_when_separate_entrance` gating with `suppress_if`/`downgrade_if` evaluation using the existing `evaluateCondition` recursion (extend it for the new classification/risk fields).
4. Re-map every existing rule into the correct `legal_status` and `priority`. Replace `groupRemediesByTier`/`groupRemediesByLegalStatus` with grouping into the §16.2 five output groups: Legal requirements; LACORS / risk-based recommendations; Further investigation required; Advisory / management actions; Remediation schedule.
5. Enforce the §22 constraint: D10 / Table C4 alarm and converted-flat benchmark rules must carry `suppress_if` (or a condition) on `classification.case_study_d10 = 'not_applicable'` so they never appear as **legal_requirement** for purpose-built buildings — they may still appear as `risk_based_recommendation` (§13.2).
6. Implement the CO rule logic (§14.2): appliance present + no CO alarm ⇒ `legal_requirement`; appliance unknown ⇒ `further_investigation_required`; no appliance ⇒ no CO action.
7. Add the stair-compartmentation rules (`R-S01`–`R-S03` from `docs/stair-enclusure.md`) and the external-stair remediation/investigation rules (§10.2) mapped to the new fields.
8. Apply the §17.2 tone rules in rule `text`: "Required" only for true legal requirements; "Recommended" for LACORS/risk-based; "Further investigation required" where evidence is insufficient. Remove "mandatory" wording from non-statutory rules (§7.2).
9. Rewrite `remedyEngine.test.ts` covering Scenarios A, B, G, H and the D10-suppression invariant.

**Acceptance Criteria:**
- No rule emits `legal_requirement` for a purpose-built building's D10 benchmark (Scenario A; §22).
- CO appliance present + no alarm ⇒ a `legal_requirement` remedy (Scenario H; §20).
- Separate-private-entrance buildings receive no shared-route recommendations (§25.3) via `suppress_if`.
- Remedies group into the five §16.2 output groups; each rule carries `legal_status`, `priority`, `applies_to`, `confidence`.
- `npm test` and `npx tsc --noEmit` exit 0.

**Notes:**
- [Unverified] The current file holds ~1416 lines of rules; the full inventory must be read before re-mapping so no rule is dropped or mis-categorised.
- The v1 `RemedyBasis` codes and `risk_level_expressions` mechanism may be retained or folded into `regulatory_refs`/`downgrade_if`; decide during implementation to minimise churn.
