# Improving the tool for TW9 property fire-safety checks

**Status:** analysis / recommendations only. No code changes accompany this document.
**Date:** 2026-06-30
**Author:** Claude (Opus 4.8), at the request of the project owner.

---

## 1. Purpose and sources

This document analyses how the Richmond fire-compliance tool can be improved to do fire-safety
checks **specifically for TW9 properties**, grounded in the LACORS *Housing – Fire Safety* guidance
(`docs/Lacors_Fire_Safety_Guide.pdf`) and the current implementation.

Sources used:

- The LACORS guide (read in full): escape routes (§9), inner rooms (§12), escape windows (§14),
  protected routes / stairs / cupboards / meters (§15), fire separation & floor/ceiling (§19–20),
  fire doors (§21), automatic fire detection (§22), and **Case Study D10 — "Two-storey building
  converted into self-contained flats"** (§37), which is the LACORS archetype this tool targets.
- The real-world review notes in `docs/fire_tool_issues_from_meeting_2026_04_10.md` (a walk-through
  of actual TW9 properties — 7 Darell Road TW9 4LF, "43", "37A").
- The two worked TW9 examples in `docs/fire-assessment-tw94lf-converted.json` and
  `…-pupose.json` (7/7a Darell Road).
- The current code (`questions.ts`, `classifier.ts`, `riskEngine.ts`, `remedy-rules.v2.ts`,
  `reportGenerator.v2.ts`, etc.) and `CLAUDE.md`.
- `docs/TW9-AI-context.md` — the owner's "FireRegs v2 – Upcoming Changes" note. (It was originally
  attached from a macOS-protected location and could not be read; it has since been placed in the
  repo and is incorporated below.)

> **Note on the owner's context document.** `docs/TW9-AI-context.md` is a stakeholder-facing
> description of the v2 changes rather than a detailed property inventory. It **confirms** the
> direction the tool has already taken (per-scope Building / Common parts / Ground flat / Upper flat
> assessment; the three-tier Legal / LACORS-benchmark / Further-investigation split; explicit
> Known / Potential / Unknown uncertainty) and, usefully, **names the portfolio's property types** —
> including two now treated below as facts rather than inference: *upper flats with external steel
> escape staircases* and *loft-converted upper flats* (see §2 and §4.9). It does **not** give a stock
> breakdown or confirm conservation-area prevalence, so those points remain labelled `[Inference]`.

---

## 2. The TW9 assessment context

The owner's context document states the portfolio comprises these property types: **purpose-built
two-flat buildings; houses converted into two self-contained flats; buildings with shared entrance
halls; buildings with separate private entrances; upper flats with external steel escape staircases;
and loft-converted upper flats.** The tool's building-type and entrance-configuration model already
covers the first four well. The last two — external steel stairs and **loft conversions** — are the
features that most stretch the current two-storey (Case Study D10) assumptions, and are picked up in
§4.9.

[Inference] Beyond those stated types, TW9 (Kew, North Sheen, and parts of Richmond/Mortlake) is
dominated by **Victorian and Edwardian terraced and semi-detached houses converted into two
self-contained flats** — the exact shape of the worked example (7/7a Darell Road) and of the
properties in the review meeting. The
fire-safety consequences that follow are not speculative; they are what LACORS and the meeting notes
both point at:

- **Most stock is "converted, pre-1991" → Section 257 / Case Study D10 territory.** The single
  original staircase usually serves the upper flat and forms the shared protected route. This is the
  highest-value path in the tool and the one to get right for TW9.
- **Period construction means uncertain compartmentation.** Lath-and-plaster, 9mm board, timber
  floors and concealed voids are the norm (LACORS §19.5–19.6, §20.3). Exact construction often can't
  be confirmed without opening up — so "investigate, don't assume" is the correct LACORS posture
  (§19.6), which the tool's Part-A mixed-construction model now reflects.
- **Conservation areas and listed buildings are common in TW9** (e.g. the Kew Gardens conservation
  area). [Inference] This materially changes which remedies are *feasible*: LACORS §21.8 explicitly
  contemplates **upgrading rather than replacing** doors "in buildings of special architectural
  interest and certainly in listed buildings", and original sash/casement windows often cannot be
  replaced to meet §14 escape-window geometry. The tool currently does not capture this, and it is
  the single most TW9-specific gap (see §4.2).
- **The enforcing authority is Richmond upon Thames, which works to LACORS + HHSRS.** Reports that
  cite the specific LACORS section behind each finding are more useful for engaging the council and
  for the landlord's own audit trail (meeting issue 10.1).

---

## 3. Where the tool already fits TW9 well

Much of what the 2026-04-10 meeting flagged has since been built. Recommendations should **not**
re-litigate these:

| Meeting issue (TW9 field review) | Current state |
|---|---|
| 9.1 — purpose-built maisonette returns "unresolved" | **Resolved.** Building type now selects the framework independently of risk; purpose-built ⇒ not Section 257 but still fully assessed (not "out of scope"). |
| 2.1 — no "which unit am I assessing?" scoping | **Done.** A *"Currently assessing: Ground-floor flat / Upper flat / Common parts"* scope badge renders on every question (`QuestionnairePage.tsx`, `QuestionCard.tsx`). |
| 6.1 — Grade D1 vs D2 not captured | **Done.** Per-flat smoke/heat questions offer none / battery-only (Grade F) / mains D1 / mains D2 / unknown, with help text. |
| 6.2–6.3 — smoke vs heat, per-flat alarm inventory | **Done (Part B).** Detection is captured separately for the ground flat, the upper flat, and the common parts. |
| 6.4 — within-flat vs between-flat interlinking conflated | **Done.** Split into within-flat (per flat) and cross-flat / common-parts interlinking. |
| 6.5 — "not yet verified" distinct from "not sure" | **Done.** Both states exist for interlinking. |
| 6.6 / 13.1 — cross-flat interlinking required? | **Handled correctly.** Cross-flat interlinking is reported as **advisory**, not a breach — matching Case Study D10, which keeps flats stand-alone to avoid whole-house false alarms. |
| Mixed staircase construction; under-stairs gas-meter cupboard | **Done (Part A).** Upper vs lower enclosure, stud insulation (Rockwool ≠ proof), and a full under-stairs cupboard sub-model, with risk driven by the **weakest** component, not a single material. |
| 10.1 — findings should cite LACORS | **Partly done.** Every remedy carries `regulatory_refs`; the report renders them per item. |
| 3.3 — window type / Juliet doors | **Partly done.** `C1_type` captures top-hung-only and full-height/Juliet glazed doors. |

The tool is, in short, already a good fit for the **converted two-flat, shared-stair, Section-257**
case that dominates TW9. The improvements below target the parts that the meeting and LACORS show
still matter for this stock.

---

## 4. TW9-specific improvement opportunities

### 4.1 Close the upper-flat bias in per-flat escape assessment (highest priority)

**Evidence.** Question scopes are skewed: 36 questions scoped `upper`, only 8 scoped `ground`. The
escape-window battery (C1–C5, C7–C9), inner-room logic (C10/C13), second-bedroom branch (C6 —
literally "second bedroom **in the upper flat**") and mobility (C12) are written around the **upper
flat**, because in the classic conversion the upper flat depends on the stair. The ground flat is
assessed mainly through its rear exit (B3) and doors.

**Why it matters for TW9.** In many TW9 conversions the ground flat has **no rear/garden exit** (mid-
terrace, or the garden belongs to the upper flat) and its bedrooms rely on front windows onto the
street, while its only door route is the shared hall. The meeting hit this exactly when reviewing the
ground floor of "43": *"downstairs may not have qualifying escape windows, but may still have a direct
garden exit"* (issue 3.2) and *"bedroom count must be captured separately for each flat"* (issue 4.1).
LACORS §14 (escape windows) and §12 (inner rooms) apply to **each** dwelling, not just the upper one.

**Recommendation.** Make the C-section symmetric per flat, but **gated by need** so it isn't asked
where it doesn't apply:

- Assess the ground flat's bedroom escape windows / inner rooms **only when it has no direct final
  exit or rear exit** (B3). Where a §15 direct exit exists, keep the current behaviour of not driving
  window remedies (this hierarchy — direct exit → protected route → escape window — is meeting issue
  3.2 and is correct).
- Capture bedroom count per flat (the upper-flat-only `C6` branch should have a ground-flat twin).
- Keep the existing escape hierarchy in the risk engine; just feed it ground-flat facts symmetrically.

**Architecture note.** This stays within the existing model: add `scope: 'ground'` twins of the
relevant C-questions with `show_when` gated on "ground flat has no rear/final exit", and extend the
risk engine's escape factors to run per flat (mirroring how Part B made detection per-flat). No new
framework, no React logic.

### 4.2 Add conservation-area / listed-building awareness (most TW9-distinctive)

**Evidence / basis.** LACORS §21.8 — *"upgrading rather than replacement … will apply in buildings of
special architectural interest and certainly in listed buildings where it is important to maintain the
appearance or original features"*; §21.6 — existing well-fitted solid timber/panelled doors can be
acceptable in lower-risk premises; §19.6 / §20.3 — original lath-and-plaster can be acceptable in
lower-risk premises **with compensatory measures** (enhanced detection); Case Study D10 — 30-minute
separation is the *ideal* but "sound, traditional construction + additional compensatory detection"
can suffice.

**Why it matters for TW9.** [Inference] A large share of TW9 stock is period property in conservation
areas, where landlords cannot freely replace original front doors, fit modern FD30 sets, or swap
sash windows for compliant escape windows. The tool today will tend to recommend "replace/upgrade"
without recognising that the LACORS-sanctioned route for these buildings is **upgrade-in-situ +
compensatory detection**, and that planning consent may constrain the work.

**Recommendation.** Add a single building-level question — *"Is the building listed or in a
conservation area?"* (yes / no / unknown) — and use it to **steer remedy wording**, not to relax the
risk:

- For affected buildings, fire-door and window findings should present the LACORS §21.8 / §21.6
  upgrade-in-situ option and the §19.6 / D10 "sound construction + compensatory detection" option
  *alongside* replacement, and flag that listed-building consent / conservation-area planning advice
  may be required.
- Keep this as guidance-tone (LACORS / risk-based), never as a relaxation of statute, and never as
  an excuse to lower detection standards (compensatory detection is the trade, per D10).

This is the clearest "TW9 vs generic Richmond" improvement and has a direct LACORS basis.

### 4.3 Make the report explicitly a **building** report with per-flat sections

**Evidence.** Meeting issues 1.1–1.3 — the dominant complaint was the tool "switching between upper
and lower flat without warning", and Patrick's suggestion of *one building report with separate
findings by flat*. The v2 report already has a ground-floor section (6), an upper-floor section (7),
and common-parts (5), so the spine exists — but the per-flat depth is uneven (tied to §4.1 above).

**Recommendation.** Once §4.1 lands, ensure the report's narrative states up front *"This is one
assessment of the whole building, with findings grouped by: ground-floor flat / upper-floor flat /
common parts / building-wide"*, and that each flat's section is populated symmetrically. This is
mostly a presentation/labelling change on top of the per-flat data.

### 4.4 Surface LACORS / legal citations prominently for council auditability

**Evidence.** Meeting issue 10.1 — *"the report should reference the sections in the LACORS document
so the users can verify it"*. Remedies already carry `regulatory_refs`; the opportunity is to make
them **prominent and checkable**, because TW9 landlords will use these reports when corresponding
with Richmond's housing-enforcement team.

**Recommendation.** In the report, render each finding as: plain-English explanation → tier/basis tag
(legal requirement / LACORS benchmark / risk-based / further investigation) → **specific LACORS §
reference** → (for converted/s257) a note that the benchmark is Case Study D10. The data is already
present; this is a formatting/QA emphasis, plus a short "How to read this report / what LACORS is"
preamble for non-specialist landlords.

### 4.5 "As-it-exists-today" framing and a planned-works note

**Evidence.** Meeting issue 11.1 — reviewers were answering based on works they *intended* to do
(e.g. keyed locks "to be" changed to thumb-turns). LACORS assessment is of the property **as it is**.

**Recommendation.** Add a one-line instruction at the start of the questionnaire — *"Answer for the
property as it exists today, not planned changes"* — and, optionally, a free-text "planned remedial
works / notes" field on the report so intended works can be recorded without distorting the
assessment. Low effort, prevents a systematic data-quality error.

### 4.6 A TW9 archetype regression pack

**Evidence.** Meeting issue 12.1 — the owners want to run a handful of representative properties and
compare outputs to expected results. The scenario tests in the engine cover archetypes A–H, and the
Darell Road JSONs are real fixtures.

**Recommendation.** Create a `docs/tw9-test-cases.md` (and/or engine fixtures) capturing the TW9
archetypes and their expected classification / key findings:

1. Converted Victorian two-flat, shared hall, pre-1991 → Section 257 / D10, high risk (the Darell
   Road case).
2. Same building made purpose-built → not Section 257, identical physical risk (the existing
   parity guarantee).
3. Ground flat with rear exit + non-qualifying windows → no window remedy (escape hierarchy).
4. Ground flat with **no** rear exit + non-qualifying windows → escape-window finding (the §4.1 gap).
5. Listed/conservation conversion with original doors/windows → upgrade-in-situ + compensatory
   detection wording (the §4.2 improvement).
6. Mixed staircase: masonry upper + stud/Rockwool lower + under-stairs gas meter → weakest component
   = cupboard, not "whole stair weak" (the Part-A behaviour).

This gives the owners a repeatable, TW9-specific acceptance checklist.

### 4.7 Keep genuinely unresolved regulatory points advisory

**Evidence.** Meeting research points 13.1 (cross-flat interlinking) and 13.4 (occupancy/mobility
without medical judgement). 13.1 is already handled (advisory). For mobility (C12), the landlord
should not be making medical judgements.

**Recommendation.** Confirm the mobility question is framed as an observable/known fact with an
explicit "not assessed / prefer not to assume" path that drives *conservative* escape-window logic
(don't rely on a window for a known mobility-impaired occupant) without requiring the landlord to
diagnose anyone. Continue to mark cross-flat interlinking as advisory.

### 4.8 Documentation hygiene (small but real)

`README.md` still describes the **v1** architecture (the three-layer `classifier → remedyEngine →
reportGenerator` model and an "out-of-scope" purpose-built flow). That has been superseded by the v2
engine and the building-type decoupling. It should be brought in line with `CLAUDE.md` so a future
contributor isn't misled. (Doc-only; flagged here, not actioned.)

### 4.9 Loft-converted upper flats and external escape staircases (portfolio-confirmed)

**Evidence / basis.** The owner's context document explicitly lists **loft-converted upper flats**
and **upper flats with external steel escape staircases** as portfolio types. These are the two
property features least well served by the current model, which is built around the two-storey
Case Study D10 case.

**Loft conversions — the more important gap.** The questionnaire already asks (B6) whether the upper
flat is *"single-storey"* or a *"two-level maisonette with its own internal staircase"* — the typical
loft-conversion shape — but **the engine does nothing with the answer**: B6 is captured and then
referenced by no risk factor or classification rule. The tool collects the fact and ignores it.
Depending on configuration, a loft conversion either makes the building three-storey (moving it from
LACORS **Case Study D10** toward **D11**, "three- or four-storey building converted into
self-contained flats") or turns the upper flat into an internal maisonette with its own inner rooms
and travel distance. The consequences the tool should — but does not — draw:

- A loft room with a floor more than ~4.5m above ground cannot rely on an escape window (LACORS §14).
  The tool *does* correctly disqualify too-high windows (B4 = "above 4.5m" → window does not qualify),
  but it does not then **require a protected internal route or a secondary means of escape** (§17) for
  the loft level — it just records the window as non-qualifying and moves on.
- A three-storey result should be benchmarked against **D11**, not D10; the classification machinery
  only models D10.
- The loft level should feed the upper-flat travel-distance (B8) and inner-room (§12) assessment.

**Recommendation.** Make B6 *do something*: where the upper flat is a two-level maisonette / loft,
drive the escape logic to require a protected internal route or confirmed secondary escape for any
level above 4.5m, select the D11 benchmark for an effectively three-storey building, and escalate the
travel-distance / inner-room evaluation. This needs **no new question** — B6 already exists — only
engine logic that consumes it.

**External steel escape staircases — largely already handled.** The tool already models an
independent upper-flat exit (B2 = external steel stair), confirms its **viability** (B2a/B2c →
`deriveUpperExternalEscapeViable`), and emits "verify usability" / "restore — currently unusable"
findings (`RF-ESC-VERIFY` / `RF-ESC-RESTORE`); a confirmed-viable route correctly suppresses the
"sole route" escape factor. The only enhancement worth adding is a LACORS **§18.2** prompt on weather
protection / non-slip treads and external-stair condition, since these routes degrade outdoors. That
is a minor criteria/wording addition, not a structural gap.

---

## 5. Suggested priority order for a TW9 rollout

Ordered to put **portfolio-confirmed** facts ahead of items that rest on inference about the stock:

1. **§4.1 Symmetric ground-flat escape assessment** — the review meeting's number-one complaint, for
   the real ground-floor cases; medium effort, stays in-architecture.
2. **§4.9 Loft-converted upper flats** — a portfolio-confirmed type whose data (B6) is already
   collected but ignored; direct LACORS §14/§17 + D10→D11 basis. (External steel stairs are already
   handled bar a minor §18.2 note.)
3. **§4.2 Conservation/listed awareness** — high value and well-grounded in LACORS §21.8/§19.6, but
   rests on an *inference* that period/listed stock is prevalent in the portfolio; confirm prevalence
   first (§7).
4. **§4.4 / §4.3 Report citations + explicit building framing** — high trust value with Richmond
   enforcement, mostly presentation.
5. **§4.6 TW9 regression pack** — lets the owners validate the above on their own stock (add a
   loft-converted and an external-steel-stair archetype to those already listed).
6. **§4.5 As-is framing, §4.7 advisory points, §4.8 README** — quick, low-risk polish.

---

## 6. Constraints honoured by these recommendations

- **No expansion of regulatory scope.** Every recommendation maps to a LACORS section already in
  scope; none invents a requirement.
- **Guidance vs statute preserved.** Conservation-area handling and compartmentation upgrades are
  LACORS / risk-based (or "further investigation"), never presented as statute. Battery-only alarms
  and absent cross-flat interlinking remain risk-based / advisory, not breaches.
- **Architecture preserved.** All proposals fit the existing layering (declarative questions/rules,
  pure engine, no business logic in React, no backend, no new framework).
- **Rockwool / "sound construction" never treated as proof.** Compensatory detection is the LACORS
  trade for accepting period construction (Case Study D10), and the tool already encodes this.

---

## 7. Open items (need the project owner's input)

- How prevalent **listed / conservation-area** buildings actually are in the TW9 portfolio — the
  context document does not say, so the priority of §4.2 rests on inference until confirmed.
- How many upper flats are **loft-converted** or have **external steel escape stairs**, to size §4.9
  and the regression archetypes in §4.6.
- A policy decision on whether to assess "reasonably foreseeable sleeping use" of non-bedroom rooms
  (meeting issue 4.2) — deliberately left out above as potential overreach.
