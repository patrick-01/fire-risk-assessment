# Actionable Step: Risk Engine Refactor

**Objective:** Replace the single additive `risk_score`/`risk_level` model with the two-dimensional `RiskSeverity` × `RiskKnowledge` model computed across the six risk domains, with corrected door and compartmentation weighting.

**Prerequisites:** Steps 1–3 (types, classification, question IDs).

**Action Items:**

1. Add `computeRisk(answers, classification): RiskAssessment` to the engine (either in `classifier.ts` or a new `src/engine/riskEngine.ts`, kept pure). It returns `overall_severity`, `overall_knowledge`, the six `domains`, and `risk_factors: RiskFactor[]`.
2. Implement the two dimensions (§15.1): `RiskSeverity = low | normal | elevated | high` and `RiskKnowledge = known_risk | potential_risk | unknown_risk`. A property may carry "normal known risk" but "high unknown risk" — keep the dimensions independent, do not collapse them.
3. Implement per-domain assessment for `escape, doors, detection, compartmentation, common_parts, management`, each emitting its own severity + knowledge + contributing factors.
4. Implement door weighting (§15.3) on shared routes: hollow-core flat entrance door + shared route ⇒ High; no self-closer + shared route ⇒ Elevated/High; door gaps/poor fit + shared route ⇒ Elevated; key required to escape ⇒ High. Use the location-split door answers from Step 3.
5. Implement external-steel-stair logic (§10.2): a *viable* external stair reduces "sole shared route" severity, reduces escape-window dependence, and reduces urgency of escape-triggered door upgrades — but does **not** zero out common-parts/compartmentation risk. An *unverified* stair does not reduce risk and instead emits an investigation factor. An obstructed/locked/poor stair is treated as not viable and emits a remediation factor.
6. Implement unknown-risk handling (§12.2, §15.4): unknown stair board type / hidden voids / door construction ⇒ `unknown_risk` producing investigation actions — **never** scored as `low`. Do not output "low risk" merely because no defects are visible.
7. Carry over the stair-compartmentation sub-scoring (`RF-S01`–`RF-S06` from `docs/stair-enclusure.md`) into the `compartmentation` domain.
8. Map `risk_factors` to a stable registry (replaces the v1 `RISK_FACTOR_DIMENSIONS` map) so the report can group and explain them.
9. Rewrite the risk portions of `classifier.test.ts` (or a new `riskEngine.test.ts`) covering Scenarios E, F, G (external stair, unknown compartmentation, hollow-core doors).

**Acceptance Criteria:**
- Upper flat with a viable external steel staircase shows reduced shared-route dependency (§25.4).
- Hollow-core flat entrance doors onto a shared route surface as High severity (§25.5).
- Unknown stair compartmentation yields `unknown_risk` + investigation, not `low` (§25.6).
- `overall_severity` and `overall_knowledge` are reported independently.
- `computeRisk` is pure; `npm test` and `npx tsc --noEmit` exit 0.

**Notes:**
- The exact severity-combination rule (how six domain severities roll up to `overall_severity`) is not fully specified. [Inference] A defensible default is "overall = max domain severity, with knowledge = worst knowledge state across domains"; confirm with the user during implementation if a weighted roll-up is preferred.
