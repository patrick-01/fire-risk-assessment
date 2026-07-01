# Plan — implement the TW9 fire-safety improvements

## Context

`docs/TW9-Fire-Safety-Improvements.md` sets out nine improvements (§4.1–§4.9) to make the
fire-compliance tool more accurate for the owner's TW9 property portfolio. They are grounded in the
LACORS *Housing – Fire Safety* guide, the 2026-04-10 property-review meeting notes
(`docs/fire_tool_issues_from_meeting_2026_04_10.md`), and the owner's v2 context note
(`docs/TW9-AI-context.md`). This plan turns that document into an executable implementation.

Decisions confirmed with the owner (this session):
- **Scope: implement all nine (§4.1–§4.9).**
- **Conservation/listed buildings are rare** in the portfolio → §4.2 stays minimal and low priority.
- **Loft conversions are occasional** → §4.9 is medium priority (worth doing).
- **Formal layout only** → do **not** add a "reasonably foreseeable sleeping use" question (closes
  meeting issue 4.2 / the §4.7 policy point).

Two gaps were verified in code and drive the largest work:
- **§4.1** — `computeEscapeFactors` / `assessEscapeWindows` / `RF-C01` / `RF-B01` are entirely
  **upper-flat-centric**, and **`B3` (ground-floor rear exit) is captured but consumed by no engine
  code** → the ground flat currently receives *no* escape assessment.
- **§4.9** — `B6` ("two-level maisonette") is inert (no engine reference), and the classifier has
  **no storey / Case-Study-D11 concept** (only D10 applicable/not).

## Architecture constraints (unchanged — from `CLAUDE.md`)

Declarative data in `src/data/`, pure functions in `src/engine/`, no compliance logic in React, no
backend, no new framework. Keep the guidance-vs-statute distinction (LACORS ⇒
`lacors_benchmark_recommendation` with `downgrade_if: D10_NOT_APPLICABLE` for the D10 family; never
relax risk). Increment `RULES_VERSION_V2` when rules change. Add tests for every behaviour.

## Build order

### 1. §4.1 — Symmetric ground-floor-flat escape assessment (largest)

Mirror the upper-flat escape logic for the ground flat, honouring the escape hierarchy
(direct/rear exit → protected route → qualifying window; meeting issue 3.2).

- **Questions** (`src/data/schema/questions.ts`, `scope: 'ground'`): add ground-flat bedroom
  presence + bedroom escape-window criteria (mirror `C1`–`C5`/`C1_type`) + inner-room (mirror
  `C10`/`C13`), **gated `show_when` B3 ∈ [no] and no direct final exit** so they are only asked when
  the ground flat actually depends on windows. Do **not** ask them where a rear/final exit exists.
- **Engine** (`src/engine/riskEngine.ts`): add `computeGroundFlatEscapeFactors(answers)` mirroring
  `computeEscapeFactors`, emitting `RF-GF-C01` (sole-route/no qualifying window), inner-room, etc.,
  and **finally consuming `B3`** (rear exit ⇒ adequate ⇒ suppress window factors). Reuse the existing
  pure helper **`assessSingleWindow(...)`** (classifier.ts) — it is already parameterised by question
  ids, so pass the ground-flat window ids. Register the domain in `computeRisk`.
- **Derived (optional but recommended)**: `deriveEscapeStrategy(answers)` in `classifier.ts`
  (mirroring `deriveStairCompartmentation` / `deriveDetectionStrategy`) returning a per-flat escape
  summary, for the report.
- **Remedies** (`remedy-rules.v2.ts`): ground-flat escape rules with `applies_to: 'ground_flat'`
  (mirror `R-C01`/`R-C10`), risk-based/further-investigation per evidence.
- **Report** (`reportGenerator.v2.ts`): populate section 6 (ground-floor flat) with the new escape
  factors + the escape-strategy summary (today it shows only door factors).

Critical files: `questions.ts`, `classifier.ts` (reuse `assessSingleWindow`), `riskEngine.ts`,
`remedy-rules.v2.ts`, `reportGenerator.v2.ts`.

### 2. §4.9 — Loft-converted upper flats (+ external-stair §18.2 note) — medium

- **Make `B6` drive logic.** Add an upper-flat question (`scope: 'upper'`,
  `show_when: B6 = two_level_maisonette`): *"Is the loft / upper level served by a protected internal
  stair, or does it have its own secondary means of escape?"*
- **Engine** (`riskEngine.ts`): `RF-LOFT-ESCAPE` — where `B6 = two_level_maisonette` and the level is
  above 4.5m (`B4 = above_4.5m`) **without** a confirmed protected internal route / secondary escape
  ⇒ escape factor (LACORS §14/§17: a too-high room cannot rely on a window). Note `assessSingleWindow`
  already disqualifies windows above 4.5m.
- **Classification** (`classifier.ts`): expose an effective-storeys / benchmark distinction (D10
  two-storey vs **D11** three-storey) derived from `B6`; remedy text cites Case Study D11 for the
  three-storey result. Keep it additive to `BuildingClassification` (recomputed, not persisted).
- **Remedy** (`remedy-rules.v2.ts`): `R-LOFT` — protected internal route / secondary escape for loft
  rooms; LACORS §14/§17; `lacors_benchmark_recommendation` + `downgrade_if: D10_NOT_APPLICABLE`.
- **External steel stairs (minor)**: add a LACORS **§18.2** weather-protection / non-slip-tread /
  condition criterion — fold into the `B2c` condition handling or the external-escape report section
  (section 8). Small; the core external-stair modelling (`deriveUpperExternalEscapeViable`,
  `RF-ESC-VERIFY`/`RESTORE`) already exists.

### 3. §4.3 building-report framing + §4.4 citation prominence (presentation)

- `reportGenerator.v2.ts` `section2ScopeAndLimitations`: add an explicit statement — *"one assessment
  of the whole building, grouped by ground-floor flat / upper-floor flat / common parts /
  building-wide"* — plus a short "how to read this report / what LACORS is / the four tiers" preamble.
- `formatRemedyLine` already renders `Regulatory refs:` per remedy; add the Case-Study (D10/D11) tag
  to each finding. Ensure section 6 is symmetric (depends on §4.1). Low effort.

### 4. §4.2 conservation / listed awareness (LOW priority — rare in portfolio; keep minimal)

- One building-level question (`scope: 'building'`): *"Is the building listed or in a conservation
  area?"* (yes/no/unknown).
- One advisory rule `R-CONSERVATION` (`remedy-rules.v2.ts`) that fires when yes **and** a
  door/window/compartmentation replacement recommendation is present, presenting the LACORS **§21.8**
  upgrade-in-situ and **§19.6** "sound construction + compensatory detection" options and a
  "listed-building consent / conservation planning advice may be required" note. Guidance-tone;
  **never relaxes risk or detection**. Given rarity, do not build per-remedy variant text — one
  advisory note is enough.

### 5. §4.5 as-is framing / §4.7 advisory & mobility / §4.8 README (quick polish)

- **§4.5**: add *"Answer for the property as it exists today, not planned changes."* to the
  questionnaire intro (`src/pages/QuestionnairePage.tsx`). A "planned works / notes" free-text field
  is **optional/deferred** (would touch the `Assessment` type + persistence).
- **§4.7**: verify `C12` (mobility) offers a conservative "not assessed / don't assume" path (no
  medical judgement); **no** foreseeable-sleeping-use question (per decision). Cross-flat interlinking
  is already advisory (Part B).
- **§4.8**: rewrite `README.md` to the v2 architecture (it still describes the removed v1
  `classifier → remedyEngine → reportGenerator` model and the old "purpose-built ⇒ out-of-scope"
  flow). Align with `CLAUDE.md`. Doc-only.

### 6. §4.6 TW9 regression pack (tests — lock all of the above)

- New `src/engine/tw9-scenarios.test.ts` (+ fixtures, mirroring `scenarios.test.ts` /
  `__fixtures__/scenarios.ts`) covering the archetypes:
  1. Converted Victorian two-flat, shared hall, pre-1991 → §257 / D10, high risk (Darell Road).
  2. Same made purpose-built → not §257, identical physical risk (existing parity guarantee).
  3. Ground flat with rear exit + non-qualifying windows → **no** window remedy (hierarchy).
  4. Ground flat, **no** rear exit + non-qualifying windows → window finding (tests §4.1).
  5. Loft-converted upper flat above 4.5m without protected route → loft-escape / D11 finding
     (tests §4.9).
  6. Mixed staircase (Part A) and mixed detection (Part B) regressions.
- New `docs/tw9-test-cases.md` documenting each archetype and its expected classification / findings.

## Cross-cutting

- Bump `RULES_VERSION_V2` (rules change). No `SCHEMA_VERSION` bump expected — new derived fields are
  recomputed on load, not persisted, and the answer map already tolerates new question ids.
- Update `CLAUDE.md` (question/rule notes) once the questions/rules land.

## Verification

- `npx tsc --noEmit` clean; `npx vitest run` all green including the new `tw9-scenarios.test.ts`.
- The regression pack **is** the acceptance test: each archetype asserts the expected classification,
  the correct legal/LACORS/investigation tier, and the presence/absence of the key remedies
  (e.g. archetype 3 asserts **no** ground-flat window remedy; archetype 4 asserts one; archetype 5
  asserts the loft/D11 finding).
- Use throwaway pipeline checks (as in Parts A/B) to eyeball the ground-flat and loft scenarios end
  to end (`classify → deriveEscapeStrategy → computeRisk → computeRemediesV2 → generateReportV2`).
- `npm run build` succeeds (static `dist/`).
- Manual browser smoke: a ground-flat-only escape path asks the new ground questions only when B3=no;
  the loft question appears only for a two-level maisonette; the report shows per-flat escape sections
  and the building-level framing.
