# Actionable Step: Report Refactor

**Objective:** Rebuild `src/engine/reportGenerator.ts` and `src/pages/ReportPage.tsx` to produce the 19 required report sections with correctly separated legal/benchmark/advisory framing and a priority-ranked remediation schedule.

**Prerequisites:** Steps 1–5 (full v2 data + remedy model).

**Action Items:**

1. Refactor `generateReport(assessment, remedies)` to emit the 19 sections in §17.1 order: Property details; Assessment scope and limitations; Property classification; Applicable legal framework; Common parts; Ground-floor flat; Upper-floor flat; External escape route; Door and route protection; Stair compartmentation; Alarm and detection; Known risks; Potential risks; Unknown risks / further investigation; Legal requirements; LACORS / risk-based recommendations; Remediation schedule; Evidence and assumptions; Disclaimer.
2. Render the `LegalFrameworkAssessment` explicitly (§17 section 4), clearly distinguishing statutory duties from LACORS/risk recommendations.
3. Drive the three risk sections (Known / Potential / Unknown) from `RiskAssessment.overall_knowledge` and per-domain knowledge, so unknown items become "further investigation required" entries (§17 sections 12–14).
4. Build the Remediation schedule from active remedies ordered by `priority` (`P1_urgent` → `investigate`), each showing `legal_status`, `applies_to`, `risk_basis`, and `regulatory_refs` (§16, §17 section 17).
5. Apply §17.2 tone in all generated prose: "Required" only for legal requirements, "Recommended" for LACORS/risk, "Further investigation required" for insufficient evidence, "Assumption" for user-supplied dependencies. Surface `assumptions` and `evidence` in section 18.
6. Keep `ReportPage.tsx` a thin shell (`CLAUDE.md` boundary): it calls `computeRemedies()` + `computeRisk()` + `generateReport()` inside `useMemo` and renders; no compliance decisions in the component.
7. Update the risk badge / summary UI to show severity **and** knowledge as two values (not a single level).
8. Update `ReviewPage.tsx` section list to match the new section grouping if it mirrors the questionnaire sections.
9. Rewrite `reportGenerator.test.ts` to assert all 19 sections render and that tone words map to the correct `legal_status`.

**Acceptance Criteria:**
- Report contains all 19 §17.1 sections in order.
- Statutory requirements, LACORS/risk recommendations, and advisories appear in separate sections (§25.7).
- A usable priority-ranked remediation schedule is produced (§25.8).
- No compliance logic lives in `ReportPage.tsx`/`ReviewPage.tsx`.
- `npm test` and `npx tsc --noEmit` exit 0.

**Notes:**
- [Unverified] `reportGenerator.ts` is ~793 lines and `ReportPage.tsx` ~582 lines; read both fully before refactoring to preserve export/share/print affordances.
- PDF export remains deferred (README "Deferred work"); do not add it here.
