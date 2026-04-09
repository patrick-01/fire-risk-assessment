# Requirements Specification v1.2
## Richmond Upon Thames — Rented Property Fire Compliance Assessment Tool

**Version**: 1.2 | **Date**: April 2026
**Status**: Draft for development
**Supersedes**: v1.1 (April 2026)

---

## Revision Notes (v1.1 → v1.2)

This version corrects five confirmed inaccuracies against LACORS guidance and closes six identified coverage gaps.

**Defects corrected:**
- D1: Self-closers softened from absolute mandate to general requirement subject to risk assessment (§21.5 is not absolute law)
- D2: Alarm upgrade downgraded from blanket Tier 1 to classification-conditional — LACORS says Grade F is "not recommended," not automatically unlawful
- D3: D10 no longer described as "primary benchmark" — corrected to "typical reference scenario" (case studies are illustrative, not prescriptive)
- D4: FD30S trigger logic made holistic — window fail alone does not mandate FD30S; overall risk assessment required
- D5: Hardboard replacement qualified — "unless equivalent fire resistance can be demonstrated by the enclosure as a whole"

**Gaps closed:**
- G1: Travel distance proxy added to Section B
- G2: Ignition and fuel load risk in common parts added to Section D
- G3: Management quality added as new Section H
- G4: Fire separation between flats added to Section D
- G5: Risk aggregation engine introduced — remedies now derive from cumulative risk, not individual fails
- G6: Overall risk level classification (low / normal / elevated / high) added as primary output layer

**Tone correction across the document:**
- "Mandatory / required / must" replaced with "should / generally expected / subject to risk assessment" wherever LACORS does not impose an absolute statutory obligation
- Each remedy now carries a "Risk basis" field explaining the reasoning behind it in LACORS terms
- The tool is described throughout as risk-informed decision support, not a compliance certification engine

---

## Table of Contents

1. Purpose and Scope
2. Architecture Overview
3. Rules Engine Architecture
4. Data Model and Schema
5. Persistence and State Management
6. Uncertainty Engine
7. Application Flow
8. Question Bank
9. Classification and Risk Level Logic
10. Risk Aggregation Engine
11. Remedies Logic
12. Report Structure
13. Share, Export, and Import
14. Offline Requirements
15. Rules Versioning
16. Design and UX
17. Security and Privacy
18. Acceptance Criteria
19. Out of Scope
20. Regulatory Reference Index

---

## 1. Purpose and Scope

### 1.1 Purpose

A client-side web application that guides a landlord or property manager through a structured questionnaire about a rented residential property and produces a risk-informed guidance report identifying fire safety considerations relevant to Richmond upon Thames council requirements under the Housing Act 2004 (HHSRS) and the LACORS Fire Safety Guidance for Existing Housing.

The tool's primary output is a risk level assessment (Section 9). Specific recommendations follow from that risk level and are explicitly grounded in the facts gathered. The tool supports judgment — it does not replace it.

### 1.2 What the tool does

- Collects facts about a property through a branching questionnaire
- Derives an overall risk level (low / normal / elevated / high) from the aggregate of all factors
- Classifies the property into a legal/regulatory category with an explicit confidence level
- Identifies unresolved facts that affect the assessment and must be physically verified
- Produces graded guidance recommendations anchored to the risk level and the collected facts
- Saves state in the browser to support on-site use across multiple visits

### 1.3 What the tool does not do

- It does not produce a formal fire risk assessment
- It does not produce a legally binding compliance certificate
- It does not replace a qualified fire risk assessor or competent person
- It does not replace written confirmation from Richmond Council
- Its outputs are guidance only — they do not in themselves establish compliance or non-compliance with any legal standard

### 1.4 Scope of supported property types (Version 1)

Version 1 supports only:
- Buildings converted into two self-contained flats (ground and upper floor)
- Conversions pre-dating 1991 or evidenced as non-compliant with Building Regulations 1991
- Both flats privately rented
- Two storeys only
- Located in the London Borough of Richmond upon Thames

Properties outside this scope are detected by the questionnaire and the tool stops gracefully, directing the user to appropriate professional resources.

---

## 2. Architecture Overview

### 2.1 Four-layer model

v1.2 introduces a fourth layer between classification and remedies:

**Layer 1 — Facts**: Raw answers from the user, each with a value and confidence marker.

**Layer 2 — Classification**: Legal classification and applicable reference scenario, with confidence level.

**Layer 3 — Risk Level**: The aggregate risk position derived from all gathered facts across escape, construction, detection, and management dimensions. This layer is new in v1.2 and is the primary output before recommendations. Recommendations are calibrated to this layer, not generated independently.

**Layer 4 — Guidance Recommendations**: Derived from Layers 2 and 3 together. Each recommendation is tagged with its basis, confidence, and the risk reasoning behind it. Recommendations are expressed as "should" or "generally expected" except where a direct statutory obligation applies.

### 2.2 Confidence levels (unchanged from v1.1)

- **Confirmed**: Established with certainty from answers given
- **Probable**: Most likely, but depends on an uncertain fact
- **Unresolved**: Cannot be determined without additional information

### 2.3 Language policy

The following language rules apply throughout the tool's outputs:

| Situation | Language to use |
|---|---|
| Direct statutory obligation (e.g. EICR, gas safety) | "Required by law" |
| LACORS guidance as strong general expectation | "Should" / "generally expected" |
| LACORS guidance subject to risk assessment | "Recommended subject to risk assessment" |
| Council-confirmed for a specific comparable property | "Confirmed for comparable properties in this area — verify for this property" |
| Advisory / uncertain | "Consider" / "Verify" / "Seek professional assessment" |

The words "mandatory," "must," and "required" are reserved for direct statutory obligations only. LACORS guidance is never described as "mandatory" in this tool's outputs.

### 2.4 Separate-entrance branch (unchanged from v1.1)

If a property has entirely separate entrances, `separate_entrance_mode` = true. Communal-specific recommendations are suppressed. A prominent notice explains that the council has not issued definitive written guidance for this configuration and that the outputs are based on general LACORS principles pending council confirmation.

---

## 3. Rules Engine Architecture

### 3.1 Separation requirement

All of the following must be independently editable without touching UI code:

- Question schema (definitions, answer options, help text, branching conditions)
- Classification rules (conditions → classification + confidence)
- Risk scoring rules (conditions → risk factor contributions)
- Recommendation rules (risk level + conditions → recommendation + tier + basis)
- Report templates (section structure, explanatory text, disclaimer text)

### 3.2 Risk factor scoring schema

Each risk factor has the following structure in the rules file:

```json
{
  "id": "RF-C01",
  "name": "No qualifying bedroom escape window — upper flat only exit is staircase",
  "dimension": "escape",
  "weight": 2,
  "condition": "bedroom_1_escape_window_qualifies == false AND B3 == 'no'",
  "description": "Upper flat occupant has no alternative escape if staircase is compromised"
}
```

Weights are 1 (minor), 2 (significant), or 3 (severe). Total score feeds the risk level output (Section 10).

### 3.3 Recommendation rule schema

```json
{
  "id": "R-F01",
  "title": "Fit self-closing devices to flat entrance doors",
  "tier": "should",
  "basis": ["LACORS-benchmark"],
  "condition": "F1 != 'functioning_self_closer'",
  "risk_basis_text": "Flat entrance doors without self-closers allow fire and smoke to pass from the flat into the escape route. LACORS §21.5 states that entrance doors to flats should be fitted with self-closers. In a Section 257 HMO this is a general expectation; in higher-risk configurations it becomes more pressing.",
  "confidence": "probable",
  "applies_in_separate_entrance_mode": true,
  "suppress_if_risk_level": [],
  "elevate_if_risk_level": ["elevated", "high"],
  "regulatory_ref": ["LACORS §21.5"]
}
```

Note the `risk_basis_text` field. This is displayed in the report alongside every recommendation. It explains — in plain English — the fire safety reasoning, not just the regulatory citation.

---

## 4. Data Model and Schema

### 4.1 Assessment object

```json
{
  "schema_version": "1.2",
  "rules_version": "2026-04-v2",
  "assessment_id": "<uuid-v4>",
  "created_at": "<ISO 8601>",
  "last_edited_at": "<ISO 8601>",
  "property": {
    "address_line_1": "string",
    "address_line_2": "string | null",
    "town": "string",
    "postcode": "string",
    "postcode_normalised": "string",
    "flat_ref": "string | null"
  },
  "current_section": "A | B | C | D | E | F | G | H | results",
  "current_question_id": "string",
  "answers": {
    "<question_id>": {
      "value": "string | number | boolean | null",
      "confidence": "confirmed | not_sure | unknown",
      "answered_at": "<ISO 8601>"
    }
  },
  "invalidated_answers": {
    "<question_id>": {
      "previous_value": "...",
      "invalidated_at": "...",
      "reason": "string"
    }
  },
  "classification": {
    "type": "section-257-hmo | probable-section-257 | not-section-257 | unresolved",
    "reference_scenario": "D10-typical | unknown | not-applicable",
    "communal_entrance": "yes | no | unknown",
    "confidence": "confirmed | probable | unresolved",
    "unresolved_reasons": ["string"]
  },
  "risk_assessment": {
    "risk_level": "low | normal | elevated | high | unresolved",
    "risk_score": 0,
    "risk_factors_present": ["RF-C01", "RF-D01"],
    "risk_dimensions": {
      "escape": "adequate | compromised | unknown",
      "construction": "adequate | compromised | unknown",
      "detection": "adequate | compromised | unknown",
      "management": "adequate | compromised | unknown"
    },
    "confidence": "confirmed | probable | unresolved"
  },
  "report_generated_at": "<ISO 8601> | null"
}
```

### 4.2 Address normalisation (unchanged from v1.1)

`postcode_normalised` = raw input stripped of whitespace, uppercased, space inserted before last three characters. Resume detection uses `postcode_normalised` + `address_line_1` lowercased and stripped of punctuation.

### 4.3 Risk level derivation

`risk_level` is a derived field computed by the risk aggregation engine (Section 10). It is not entered by the user and cannot be overridden by a single question answer.

---

## 5. Persistence and State Management

*Unchanged from v1.1.* Up to ten saved assessments in `localStorage`, keyed by UUID, with a lightweight index. On launch, existing assessments are listed with address, date, and completion status. Answer invalidation on change moves affected answers to `invalidated_answers` and routes the user forward to the first unanswered question.

---

## 6. Uncertainty Engine

### 6.1 Uncertainty behaviour codes (extended from v1.1)

| Code | Meaning | Used for |
|---|---|---|
| `BLOCK_CLASS` | Prevents classification being confirmed | Key factual unknowns |
| `CONSERVATIVE` | Apply stricter interpretation in risk scoring | Physical unknowns (dimensions, materials) |
| `ADVISORY_ONLY` | Generate advisory item only, do not contribute to risk score | Lower-stakes unknowns |
| `DEFER` | Do not generate outputs for this question's dependencies until resolved | Branching unknowns |
| `RISK_ELEVATE` | **New in v1.2.** Unknown answer is treated as a risk factor contribution (weight 1) on the basis that the unknown itself is a management concern | Maintenance and management questions |

### 6.2 Risk level under uncertainty

When one or more questions affecting the risk score are answered "Not sure" or "Unknown," the risk level is computed on the conservative assumption. However, it is displayed as "Probable [level] — based on conservative assumptions where facts are unknown" rather than as a confirmed verdict.

### 6.3 Completeness and uncertainty summary (unchanged from v1.1)

The report includes a "Facts requiring verification" section and an overall completeness indicator.

---

## 7. Application Flow

```
Launch screen
  ↓
[Saved assessments list if any exist]
  ↓
Property Setup
  ↓
Section A: Building Origin and Classification (5 questions)
  ↓
[Out-of-scope stop if triggered]
  ↓
Section B: Building Configuration and Travel Distance (8 questions)
  ↓
[Classification intermediate result — with confidence]
  ↓
Section C: Escape Routes (adaptive — 4 to 12 questions)
  ↓
Section D: Construction — Staircase, Separation, and Ignition Risk (9 questions)
  ↓
Section E: Fire Detection and Alarms (7 questions)
  ↓
Section F: Doors and Egress (6 questions)
  ↓
Section G: General Legal Obligations (3 questions)
  ↓
Section H: Management and Maintenance (4 questions)  ← NEW IN v1.2
  ↓
Review screen
  ↓
[Risk Level computed — displayed before report]
  ↓
Results — Risk-Informed Guidance Report
  ↓
[Print / PDF / Export JSON / Copy shareable link]
```

---

## 8. Question Bank

### Property Setup (unchanged from v1.1)

P1: Structured address fields. P2: Optional flat reference.

---

### Section A — Building Origin and Classification (unchanged from v1.1)

A1–A5 as specified in v1.1. Classification checkpoint after A5 uses "typical reference scenario" language rather than "primary benchmark."

---

### Section B — Building Configuration and Travel Distance

**B1**: Do the two flats share a communal internal entrance hall or staircase?
- Yes — shared communal entrance
- No — completely separate external entrances

**B2**: Does the upper flat have an independent rear exit not using the main staircase?
- Yes — external rear staircase or door to garden / outside
- No — staircase and front door only

**B3**: Does the ground floor flat have a rear exit?
- Yes / No

**B4**: What floor level is the upper flat at, approximately, above external ground?
- 2.5–4 metres (typical two-storey Victorian)
- Above 4.5 metres
- Not sure
- *Uncertainty behaviour*: `CONSERVATIVE`

**B5**: Is the ground floor raised significantly above street or garden level? (e.g. the entrance is up several steps)
- No — roughly at ground level
- Yes — raised ground floor
- Not sure

**B6**: Is the upper flat single-storey or does it extend across two levels internally (maisonette with own stair)?
- Single-storey
- Two-level maisonette with internal stair
- Not sure

**B7**: Is there direct access to outside from the foot of the main staircase without passing through any other room?
- Yes — front door opens direct to street or garden
- No — intermediate space or door intervenes
- Not sure

**B8 — Travel distance proxy (new in v1.2)**: In the upper flat, approximately how far is it from the furthest point of any bedroom to the flat's front door (or to the top of the staircase)?
- Short — appears to be under 7 metres (most rooms open directly off a short hallway)
- Medium — roughly 7–15 metres (longer corridor or route through several rooms)
- Long — appears to be over 15 metres or involves multiple changes of direction
- Not sure
- *Help*: "This is an estimate to help assess whether the escape route is straightforward or extended. LACORS considers the complexity and length of the route in its risk assessment."
- *Uncertainty behaviour*: `CONSERVATIVE` — assume medium if not sure
- *Risk factor contribution*: Medium = RF-B01 (weight 1); Long = RF-B01 (weight 2)

---

### Section C — Escape Routes

*Adaptive — between 4 and 12 questions depending on flat configuration and bedroom count. Unchanged in structure from v1.1 (C1–C13) with the following addition:*

**C14 — New in v1.2**: Does the upper flat entrance room (the first room entered from the communal staircase or own front door) function as a dedicated entrance hall or lobby, or is it a habitable room (e.g. the living room is directly entered)?
- Dedicated entrance hall or lobby — not used as a living space
- The living room or another habitable room is entered directly on arrival
- Not sure
- *Help*: "If occupants must pass through a habitable room to reach the staircase, any fire starting in that room blocks the escape route. A dedicated entrance lobby improves compartmentation."
- *Risk factor contribution*: Habitable room entered directly = RF-C02 (weight 1)

---

### Section D — Construction: Staircase, Separation, and Ignition Risk

*Show only if B1 = communal shared entrance. Skip and mark not applicable if separate entrances.*

**D1**: What is the stair side panelling made of?
- 12.5mm plasterboard — confirmed
- 12.5mm plasterboard — probable but not measured
- 9mm plasterboard
- Hardboard
- Open bannisters — no solid panelling
- Mixed — different materials in different sections
- Unknown
- *Help*: "Hardboard has no fire resistance. 12.5mm plasterboard gives approximately 30-minute fire resistance (LACORS §19.5). If unknown, answer Unknown — do not guess."
- *Uncertainty behaviour*: `CONSERVATIVE`

**D2**: What is the staircase soffit (the surface beneath the stair treads visible from below)?
- Plasterboard lined
- Exposed timber
- Unknown
- *Uncertainty behaviour*: `CONSERVATIVE`

**D3**: What is the wall between the ground floor flat and the communal corridor?
- Brick or masonry
- Plasterboard or stud partition
- Unknown
- *Uncertainty behaviour*: `ADVISORY_ONLY`

**D4**: Are there visible gaps or penetrations through the staircase enclosure?
- No visible gaps
- Yes — visible gaps around pipes, cables, or redundant holes
- Not sure

**D5**: Is there a cupboard, storage space, or meter cupboard within or directly off the communal staircase?
- No
- Yes — and it has a fire-resisting door and enclosure
- Yes — and it does not have a fire-resisting door
- Not sure

**D6**: What is the overall condition of the staircase enclosure?
- Sound — no visible damage or deterioration
- Some defects — visible cracks, gaps, or areas of concern
- Poor condition
- Not assessed

**D7 — Fire separation between flats (new in v1.2)**: What is the floor and ceiling construction between the ground floor flat and the upper flat?
- Concrete or reinforced floor — appears solid, heavy construction
- Timber joists with plasterboard ceiling below — typical Victorian construction, generally acceptable
- Timber joists with no plasterboard — exposed joists visible in ground floor ceiling
- Unknown
- *Help*: "The floor/ceiling between the two flats is the fire separation between two separate households. If there is no plasterboard ceiling lining to the joists, fire and smoke can spread rapidly between flats. This is separate from the staircase enclosure."
- *Uncertainty behaviour*: `CONSERVATIVE`
- *Risk factor contribution*: Exposed joists = RF-D02 (weight 2); Unknown = RF-D02 (weight 1)

**D8 — Wall integrity between flats (new in v1.2)**: Are there any visible penetrations, open chases, or gaps through the walls or floor between the two flats?
- No — walls and floor appear intact with no obvious penetrations
- Yes — visible gaps, old pipe chases, or penetrations visible
- Not sure
- *Uncertainty behaviour*: `ADVISORY_ONLY`

**D9 — Ignition and fuel load risk in communal areas (new in v1.2)**: Are any of the following present in the communal staircase or entrance area? (Select all that apply)
- Bicycles or pushchairs stored in the communal area
- Rubbish or cardboard stored in the communal area
- Electrical intake or consumer unit in or opening onto the communal area without a fire-resisting enclosure
- Combustible materials or furniture in the communal area
- None of the above
- Not sure
- *Help*: "LACORS explicitly considers ignition risk and fuel load in the escape route. Any combustible material stored in the communal area materially increases risk because it provides fuel for a fire that would block the only escape."
- *Risk factor contribution*: Each item present = RF-D03 (weight 1 each, up to weight 2 cumulative)

---

### Section E — Fire Detection and Alarms

**E1**: What type of alarms are currently fitted in the building?
- Battery-only (Grade F) — no mains wiring
- Mains-wired with integral battery backup (Grade D)
- Mixed — some mains, some battery-only
- No alarms at all
- Not sure

**E2**: Where are alarms currently located? (Select all that apply)
- In the communal hallway or staircase
- In the entrance lobby/hallway of the ground floor flat
- In the entrance lobby/hallway of the upper flat
- In a living room
- In a kitchen
- In a bedroom
- Elsewhere / other locations
- None / not sure

**E3**: Are any of the alarms heat detectors (as opposed to smoke detectors)?
- All are smoke detectors
- Mix of smoke and heat detectors
- All are heat detectors
- Not sure

**E4** *(if B1 = communal entrance)*: Is there a mains-wired alarm in the communal hallway or staircase?
- Yes — mains-wired smoke alarm
- Yes — battery-only alarm
- No alarm in communal area
- Not sure

**E5** *(if B1 = communal entrance)*: Is there a heat detector in each flat's entrance lobby, interlinked with the communal alarm?
- Yes — in both flats
- Yes — in one flat only
- No
- Not sure

**E6**: Are the alarms interlinked so that all trigger together?
- Yes — all alarm together
- No — independent
- Partially interlinked
- Not sure

**E7**: When were the alarms last tested?
- Within the last month
- Within the last year
- More than a year ago
- Never tested / not known
- *Uncertainty behaviour*: `RISK_ELEVATE` if more than a year or never

---

### Section F — Doors and Egress (unchanged from v1.1)

F1–F6 as specified in v1.1.

---

### Section G — General Legal Obligations (unchanged from v1.1)

G1–G3 as specified in v1.1.

---

### Section H — Management and Maintenance (new in v1.2)

*Applies to all properties. Not skipped for any configuration.*

LACORS places significant weight on management quality as a risk factor. A well-managed property with engaged landlords and informed tenants can justify a lower standard of physical protection in some circumstances. A poorly managed property cannot rely on physical measures alone.

**H1**: Are the communal areas (if present) kept clear of combustible materials and obstructions at all times?
- Yes — consistently maintained clear
- Mostly, but occasional items left temporarily
- No — items regularly stored in communal areas
- Not applicable — no communal areas
- *Risk factor contribution*: No = RF-H01 (weight 2); Mostly = RF-H01 (weight 1)

**H2**: Are tenants made aware of the fire escape arrangements for their flat — how to exit, what to do if the alarm sounds, not to store materials in communal areas?
- Yes — tenants are briefed at the start of tenancy and reminded periodically
- Partially — mentioned at start of tenancy but not actively maintained
- No — tenants are not specifically briefed on fire safety
- Not sure
- *Risk factor contribution*: No = RF-H02 (weight 1)

**H3**: Is there a regular maintenance schedule for fire safety items — alarms, self-closers, door condition, staircase integrity?
- Yes — documented schedule with records
- Informal — checks happen but are not documented
- No formal schedule
- Not sure
- *Risk factor contribution*: No formal schedule = RF-H03 (weight 1); `RISK_ELEVATE` if Not sure

**H4**: How would you describe the management engagement level for this property?
- Actively managed — regular visits, prompt response to maintenance
- Passively managed — repairs addressed when reported, infrequent visits
- Minimal management — tenant largely self-managing with limited landlord engagement
- *Risk factor contribution*: Minimal = RF-H04 (weight 2); Passive = RF-H04 (weight 1)

---

## 9. Classification and Risk Level Logic

### 9.1 Classification layer (corrected from v1.1)

The classification layer runs after Section A and produces:

```json
{
  "classification": "section-257-hmo | probable-section-257 | not-section-257 | unresolved",
  "reference_scenario": "D10-typical | unknown | not-applicable",
  "communal_entrance": "yes | no | unknown",
  "upper_flat_independent_exit": "yes | no | unknown",
  "escape_windows": {
    "bedroom_1": "qualifies | does-not-qualify | unknown",
    "bedroom_2": "qualifies | does-not-qualify | unknown | not-applicable",
    "living_room": "qualifies | does-not-qualify | unknown"
  },
  "inner_room_present": "yes | no | unknown",
  "confidence": "confirmed | probable | unresolved",
  "unresolved_reasons": []
}
```

**Correction from v1.1**: The `reference_scenario` field replaces `benchmark`. The value "D10-typical" means the property configuration is typical of the LACORS Case Study D10 scenario and that case study's principles inform the assessment. It does not mean D10 is a mandatory prescriptive standard that the property must pass item by item. Report language reads: "This property's configuration is typical of LACORS Case Study D10 (two-storey converted self-contained flats). The principles of that case study inform this assessment."

### 9.2 Escape window qualification (unchanged from v1.1)

A window qualifies as an escape window under LACORS §14 only when ALL of the following are confirmed:
- Openable without a key
- Sill ≤ 1,100mm from floor
- Clear opening ≥ 0.33m²
- Floor ≤ 4.5m above external ground
- No obstructing railings, conservatory, or basement well below
- Accessible without passing through another habitable room with a lockable door
- Occupants are able-bodied

Any of these unknown = window classified as "unknown" (not qualifying) under conservative assumption.

---

## 10. Risk Aggregation Engine

### 10.1 Purpose

The risk aggregation engine computes an overall risk level from all gathered facts. It runs after all sections are complete (or at any point for a partial report). No single factor determines the risk level — the level is a function of the cumulative score across four dimensions.

### 10.2 Risk dimensions

| Dimension | Covers |
|---|---|
| Escape | Escape window viability, travel distance, rear exits, inner rooms, route complexity |
| Construction | Staircase enclosure, soffit, floor/ceiling separation, wall integrity, penetrations |
| Detection | Alarm grade, coverage, interlinking, maintenance |
| Management | Communal area upkeep, tenant briefing, maintenance schedule, engagement level |

### 10.3 Risk factor register

Each risk factor specifies which dimension it contributes to and its weight (1 = minor, 2 = significant, 3 = severe).

| ID | Description | Dimension | Weight |
|---|---|---|---|
| RF-C01 | No qualifying bedroom escape window + no rear exit | Escape | 2 |
| RF-C02 | Living room or habitable room entered directly on arrival (no lobby) | Escape | 1 |
| RF-C03 | Inner room present — bedroom accessible only via outer room | Escape | 1 |
| RF-C04 | Living room escape window unknown or does not qualify | Escape | 1 |
| RF-C05 | Mobility-impaired occupant — escape windows cannot be relied on | Escape | 2 |
| RF-B01 | Medium or long travel distance to exit | Escape | 1–2 |
| RF-D01 | Hardboard or unknown stair panelling | Construction | 2 |
| RF-D01b | 9mm plasterboard panelling | Construction | 1 |
| RF-D02 | Exposed timber soffit OR exposed floor/ceiling joists between flats | Construction | 2 |
| RF-D03 | Combustible material, ignition risk, or fuel load in communal area | Construction | 1–2 |
| RF-D04 | Visible penetrations in staircase enclosure | Construction | 1 |
| RF-D05 | Unenclosed cupboard or meter box in communal staircase | Construction | 1 |
| RF-D06 | Poor overall condition of staircase enclosure | Construction | 2 |
| RF-E01 | Battery-only alarms (Grade F) | Detection | 2 |
| RF-E02 | No alarm in communal hallway (communal entrance only) | Detection | 2 |
| RF-E03 | No heat detector in flat lobby interlinked with communal alarm | Detection | 1 |
| RF-E04 | No alarms at all | Detection | 3 |
| RF-E05 | Alarms not tested in over a year | Detection | 1 |
| RF-H01 | Communal areas not kept clear | Management | 1–2 |
| RF-H02 | Tenants not briefed on fire escape | Management | 1 |
| RF-H03 | No formal maintenance schedule | Management | 1 |
| RF-H04 | Minimal or passive management | Management | 1–2 |

### 10.4 Risk level thresholds

| Risk level | Total score | Description |
|---|---|---|
| Low | 0–2 | Escape routes are viable, construction is adequate, detection is in place, and the property is well managed. Minor improvements may be recommended but the overall risk profile is acceptable. |
| Normal | 3–5 | Typical risk profile for this property type. Some improvements are expected. No single factor presents an unacceptable risk in isolation, but attention is warranted. |
| Elevated | 6–9 | One or more significant risk factors present, or several minor factors in combination. Remedial attention is clearly warranted. A formal fire risk assessment is strongly recommended. |
| High | 10+ | Multiple serious risk factors present in combination. Significant remedial works are likely required. A formal fire risk assessment by a competent person should be commissioned promptly. |

### 10.5 Dimension-level risk position

In addition to the overall score, each dimension is classified separately as "adequate," "compromised," or "unknown" for display in the report. This helps the user and any assessor understand where the risk is concentrated.

A dimension is "compromised" if it contains any factor with weight ≥ 2, or two or more factors of any weight. A dimension is "unknown" if one or more key questions for that dimension are unanswered.

### 10.6 Risk stacking warning

**New in v1.2.** When three or more risk factors from different dimensions are present simultaneously, the report displays a risk stacking warning: *"This assessment has identified risk factors across multiple dimensions (escape, construction, detection, management). Where multiple factors coincide, the combined risk is greater than any single factor in isolation. This warrants particular attention from a qualified fire risk assessor."*

---

## 11. Remedies Logic

### 11.1 Recommendation tiers (revised from v1.1)

The term "Tier 1 Mandatory" is replaced. The three tiers are now:

**Tier 1 — Statutory obligation**: A direct legal requirement regardless of risk level or property configuration. Expressed as "Required by law."

**Tier 2 — Generally expected**: Recommended under LACORS guidance as normal practice for this property type. The risk level determines how strongly this is expressed: at "normal" risk, it is expressed as "should"; at "elevated" or "high" risk, it is expressed as "strongly recommended, subject to risk assessment."

**Tier 3 — Advisory and verification**: Physical checks, professional input, or council confirmations needed. Not remedial works until the underlying fact is resolved.

### 11.2 Statutory obligations (Tier 1)

These apply regardless of risk level, classification, or configuration:

| ID | Condition | Recommendation | Legal basis |
|---|---|---|---|
| R-G01 | G1 = overdue + gas appliances present | Annual gas safety inspection by Gas Safe registered engineer — required by law | Gas Safety (Installation and Use) Regulations 1998 |
| R-G02 | G2 = overdue | EICR within last 5 years — required by law for private rented properties | Electrical Safety Standards Regulations 2020 |

### 11.3 Generally expected recommendations (Tier 2)

Each recommendation carries a risk basis explanation and states the condition under which it applies. Confidence is calibrated to the classification and risk level.

---

**R-E01 — Alarm upgrade** *(corrected from v1.1)*

| Field | Value |
|---|---|
| Title | Review and upgrade fire detection to Grade D mains-wired standard |
| Tier | 2 (Statutory if classification = confirmed section-257-hmo; otherwise strongly expected) |
| Condition | E1 = battery-only, mixed, or none |
| Risk basis | LACORS Table C2 states that Grade F (battery-only) alarms are "not recommended" in HMOs. They are not independently unlawful, but for a Section 257 HMO they fall below the expected standard. Where classification is confirmed, upgrading to Grade D mains-wired with integral battery backup is the expected approach. Richmond Council confirmed Grade D as the applicable standard for a directly comparable property at 8 & 8a North Road (council letter, March 2026). |
| Confidence | Confirmed where classification = section-257-hmo; Probable where classification = probable-section-257 |
| Applies in separate entrance mode | Yes (per-flat requirement) |

---

**R-E02 — Communal smoke alarm**

| Field | Value |
|---|---|
| Title | Install mains-wired smoke alarm in communal hallway |
| Tier | 2 |
| Condition | E4 ≠ mains-wired AND communal_entrance = yes |
| Risk basis | Richmond Council confirmed a Grade D, LD2 mixed alarm system as the applicable standard for communal-entrance Section 257 HMOs in this area. This includes a mains-wired smoke alarm in the communal hallway interlinked with heat detectors in each flat's entrance lobby. This recommendation is council-confirmed for comparable properties, not solely a general LACORS benchmark. |
| Confidence | Council-confirmed for comparable property; verify for this property |

---

**R-E03 — Flat lobby heat detectors**

| Field | Value |
|---|---|
| Title | Install mains-wired heat detector in entrance lobby of each flat, interlinked with communal alarm |
| Tier | 2 |
| Condition | E5 ≠ yes-both AND communal_entrance = yes |
| Risk basis | Part of the Grade D, LD2 mixed system confirmed by Richmond Council. Heat detectors (not smoke) are specified in flat lobbies to reduce false alarm risk from cooking, while still providing early warning of a fire starting within the flat. |
| Confidence | Council-confirmed for comparable property |

---

**R-F01 — Self-closers** *(corrected from v1.1)*

| Field | Value |
|---|---|
| Title | Fit self-closing devices to flat entrance doors |
| Tier | 2 |
| Condition | F1 ≠ functioning self-closer |
| Risk basis | LACORS §21.5 states that entrance doors to self-contained flats should be fitted with self-closers. This is a general expectation for Section 257 HMOs, not an absolute statutory requirement. Its importance increases with risk level: at normal risk, a well-fitting solid door without a closer may be tolerated in practice; at elevated or high risk, a functioning closer becomes more pressing because it limits fire and smoke spread to the escape route if the front door is left open. |
| Confidence | Probable — elevated to strongly expected at elevated or high risk level |
| Elevated expression | At elevated or high risk: "A functioning self-closer on the flat entrance door is strongly recommended and should be fitted as a priority." |

---

**R-F02 — Flat entrance door standard** *(corrected from v1.1)*

| Field | Value |
|---|---|
| Title | Assess flat entrance door construction against the risk level |
| Tier | 2 |
| Condition | escape_windows qualify for all habitable rooms = false OR unknown, AND B3 (rear exit) = no |
| Risk basis | Where the staircase is the sole escape route and escape windows do not fully qualify, the flat entrance door plays a critical role in limiting fire and smoke spread to that route. LACORS §21.5 and D10 address this: at lower risk (sound construction, good detection, engaged management), a solid well-fitted door with a self-closer is generally acceptable (§21.6). At higher risk, an FD30S fire doorset may be warranted. This is not a binary door-upgrade trigger — it is a holistic risk assessment finding. |
| Confidence | Depends on overall risk level |
| Expression by risk level | Normal: "A solid, well-fitted timber door with a functioning self-closer is generally expected." Elevated: "Subject to a fire risk assessment, an FD30S fire doorset with intumescent seals, smoke seal, and self-closer should be considered." High: "An FD30S fire doorset is strongly recommended. Commission a formal fire risk assessment to confirm the specification." |
| Note | FD30S is never expressed as a definite requirement from this tool alone. It is an escalating recommendation subject to professional assessment. |

---

**R-D01 — Staircase panelling** *(corrected from v1.1)*

| Field | Value |
|---|---|
| Title | Assess and if necessary improve staircase side panelling |
| Tier | 2 |
| Condition | D1 ≠ 12.5mm plasterboard confirmed |
| Risk basis | LACORS §19.5 specifies 12.5mm plasterboard as the standard for achieving nominal 30-minute fire resistance in a staircase enclosure. Hardboard has no fire resistance and is not an acceptable substitute. However, what matters is the fire resistance of the staircase enclosure as a system, not any single element in isolation. In some cases, where the overall enclosure construction is sound and the detection and management compensate, an assessor may reach a different judgment. This tool cannot substitute for that assessment. |
| Expressions by material | Hardboard: "Should be replaced with 12.5mm plasterboard unless equivalent fire resistance of the enclosure as a whole can be demonstrated by a competent assessor." 9mm plasterboard: "Falls below the §19.5 standard. Acceptable in lower-risk premises subject to assessor confirmation (§19.6)." Unknown: "Must be identified before any other staircase assessment can conclude." |

---

**R-D02 — Soffit**

| Field | Value |
|---|---|
| Title | Line staircase soffit with plasterboard |
| Tier | 2 |
| Condition | D2 = exposed timber |
| Risk basis | An exposed timber soffit beneath the staircase provides fuel for a fire in the communal area and compromises the enclosure. Lining with 12.5mm plasterboard is the standard corrective measure. |
| Confidence | Probable |

---

**R-D07 — Floor/ceiling separation between flats** *(new in v1.2)*

| Field | Value |
|---|---|
| Title | Assess floor/ceiling fire separation between the two flats |
| Tier | 2 |
| Condition | D7 = exposed joists OR unknown |
| Risk basis | The floor between the ground floor flat and the upper flat is the primary fire separation between two separate households. Where timber joists are exposed with no plasterboard ceiling lining below, fire can spread rapidly between flats. LACORS expects adequate separation between dwellings as part of the overall risk assessment for converted buildings. |
| Confidence | Probable |
| Expression | "Inspect and if necessary fit a plasterboard ceiling lining beneath the upper flat's floor joists. This improves fire separation between the two flats and should be assessed as part of any construction works on the property." |

---

**R-D09 — Ignition risk in communal areas** *(new in v1.2)*

| Field | Value |
|---|---|
| Title | Remove combustible materials and address ignition risks from communal areas |
| Tier | 2 |
| Condition | D9 contains any item other than "none" |
| Risk basis | LACORS explicitly considers the ignition risk and fuel load in the escape route as part of the risk assessment. A fire starting in the communal area — particularly one fuelled by stored bicycles, prams, cardboard, or an unenclosed electrical intake — would directly compromise the escape route. Keeping the communal area clear of combustible materials is one of the most cost-effective risk reductions available. |
| Confidence | Confirmed (management measure, no physical uncertainty) |

---

**R-G03 — Fire risk assessment for common parts** *(new basis in v1.2)*

| Field | Value |
|---|---|
| Title | Commission a documented fire risk assessment for common parts |
| Tier | 2 — elevated to Tier 1 statutory at elevated or high risk level |
| Condition | G3 = No AND communal_entrance = yes |
| Risk basis | The Regulatory Reform (Fire Safety) Order 2005 applies to the common parts of multi-occupied residential buildings. A formal documented fire risk assessment by a responsible person or competent assessor is a legal requirement where common parts exist. At elevated or high risk, this is particularly pressing. |

---

### 11.4 Advisory items (Tier 3)

Advisory items are unchanged from v1.1, with the following additions:

| ID | Condition | Advisory |
|---|---|---|
| A-11 | RF-D03 present (ignition risk items in common areas) | Maintain an ongoing communal area clear policy. Consider including a clear-communal-areas clause in tenancy agreements. |
| A-12 | H4 = minimal or passive management | LACORS explicitly considers management quality as a risk factor. Increasing management engagement — regular visits, documented checks, tenant communication — can improve the overall risk profile and may influence the standard of physical measures required by an assessor. |
| A-13 | Risk stacking (3+ risk factors across different dimensions) | A formal fire risk assessment by a competent person is strongly recommended before specifying remedial works. The combination of factors present in this assessment is best evaluated holistically by a qualified assessor. |

---

## 12. Report Structure

### 12.1 Header block

- Property address and flat reference
- Date generated
- App version and rules version
- Assessment completeness score

### 12.2 Disclaimer (full text — verbatim, see Section 17)

Displayed before any findings.

### 12.3 Overall risk level — the primary output

Displayed prominently before any other findings. Shows:
- Risk level: [Low / Normal / Elevated / High] — with confidence qualifier if any facts are uncertain
- Risk score and contributing factors (collapsible list)
- Risk dimension summary (escape / construction / detection / management — each shown as adequate, compromised, or unknown)
- Risk stacking warning if applicable

This section is the headline output of the tool. It frames everything that follows.

### 12.4 Classification summary

- Classification and confidence
- Reference scenario ("typical D10 configuration" or "not determinable")
- Communal entrance / separate entrance mode
- Classification basis (which answers support it)

### 12.5 Facts gathered

Table of all answers with question summary, answer value, and confidence level. Unanswered questions listed separately.

### 12.6 Facts requiring verification

Dedicated section listing all "Not sure" / "Unknown" answers, uncertainty behaviour applied, and required physical check or confirmation.

### 12.7 Statutory obligations (Tier 1)

Shown first in recommendations, in a red-bordered section. Expressed as "Required by law."

### 12.8 Generally expected recommendations (Tier 2)

Shown in amber. Each item includes:
- Recommendation text (calibrated to risk level)
- Risk basis explanation (why this matters in fire safety terms)
- Basis tag (STATUTE / COUNCIL-CONFIRMED / LACORS-BENCHMARK)
- Regulatory reference

### 12.9 Advisory and verification items (Tier 3)

Shown in blue. Physical checks, professional input, council confirmations.

### 12.10 Key assumptions

Plain-English list of interpretive assumptions the recommendations rest on, including: Section 257 classification assumed, conservative assumptions applied where facts are unknown, and which recommendations are pending council confirmation.

### 12.11 What this tool has not assessed

Brief statement of exclusions — three-storey buildings, maisonette internal stairs, below-ground spaces, non-typical layouts — with recommendation to commission a formal fire risk assessment.

---

## 13. Share, Export, and Import (unchanged from v1.1)

JSON export, JSON import with schema version check, shareable link with LZ-string compression and `v[schema_version]:` prefix, print CSS, PDF via `window.print()`. Maximum URL length warning at 8,000 characters.

---

## 14. Offline Requirements (unchanged from v1.1)

Service Worker for hosted version with cache-busting on rules version change. Single-file version carries version string in title. Offline status indicator. Stale rules warning on launch when online.

---

## 15. Rules Versioning (unchanged from v1.1)

Every report carries `app_version` and `rules_version`. Opening a saved assessment under a newer rules version triggers a re-evaluation banner. Previous report is not deleted.

---

## 16. Design and UX (unchanged from v1.1)

Mobile-first, one question per screen on mobile, large tap targets, progress bar, help text behind toggle, neutral professional palette, semantic colour for risk levels only, minimum 16px body text. Desktop sidebar with section outline. Desktop review/edit panel.

---

## 17. Disclaimer Text (mandatory — use verbatim)

> **GUIDANCE ONLY — NOT A FIRE RISK ASSESSMENT**
>
> This tool is provided for general guidance and decision support only. It does not constitute a formal fire risk assessment, professional fire safety advice, or a legal compliance determination. The outputs reflect a structured analysis of the answers you have provided and general principles drawn from the LACORS Fire Safety Guidance for Existing Housing and relevant legislation. They do not establish compliance or non-compliance with any legal standard.
>
> Risk levels and recommendations produced by this tool are indicative. They are not a substitute for professional judgment. A qualified fire risk assessor should be commissioned before specifying, relying on, or presenting any compliance works to a council or enforcement authority.
>
> In Richmond upon Thames, contact the Regulatory Services Partnership (serving Richmond, Merton and Wandsworth Councils) for formal guidance.
>
> The creator of this tool accepts no liability whatsoever for any loss, damage, enforcement action, penalty, injury, or death arising from reliance on this tool or its outputs.

---

## 18. Security and Privacy (unchanged from v1.1)

No personal tenant data. localStorage disclosure in footer and setup screen. Shareable link one-time privacy notice. No analytics, no tracking, no third-party scripts.

---

## 19. Acceptance Criteria

Carries forward all 15 AC items from v1.1, with the following additions and changes:

| ID | Criterion |
|---|---|
| AC-01 to AC-13 | As specified in v1.1 |
| AC-14 | A mobility-impaired occupant (C13 = No) does not produce a qualifying escape window result |
| AC-15 | An out-of-scope property stops the assessment with an appropriate message |
| AC-16 | A property with three or more risk factors from different dimensions displays the risk stacking warning |
| AC-17 | A property with poor management (H4 = minimal) shows a higher risk score than an identical property with active management |
| AC-18 | The FD30S recommendation is never expressed as a definite requirement — always as "subject to risk assessment" or stronger language calibrated to risk level |
| AC-19 | A property with risk level = high produces a Tier 1 recommendation to commission a formal fire risk assessment for common parts (where communal entrance exists) |
| AC-20 | Self-closer recommendation wording varies correctly between "should" (normal risk) and "strongly recommended" (elevated/high risk) |
| AC-21 | Alarm upgrade recommendation is expressed as statutory where classification = confirmed section-257-hmo, and as "strongly expected" where classification = probable |

---

## 20. Out of Scope (unchanged from v1.1, reproduced for completeness)

Version 1 hard-stops gracefully for: three or more storeys, post-1991 compliant conversions, three or more flats, properties outside England. These are not partial support with warnings — they are stop points. Multi-property portfolio management is out of scope; up to ten saved assessments is not portfolio management.

---

## 21. Regulatory Reference Index (updated from v1.1)

| Reference | Topic | Used in |
|---|---|---|
| Housing Act 2004, s.257 | Section 257 HMO definition | Classification |
| Housing Act 2004, Part 1 (HHSRS) | Housing health and safety rating system | All properties |
| LACORS, Case Study D10 | Two-storey converted flats — typical reference scenario (not prescriptive benchmark) | Classification, risk basis |
| LACORS §9.7 | Conditions for accepting lower standard of staircase protection | Risk level, R-F02 |
| LACORS §12 | Inner rooms | RF-C03, R-C01 |
| LACORS §14.1–14.2 | Escape window criteria | Section C, escape dimension |
| LACORS §19.5 | 12.5mm plasterboard — nominal 30-minute fire resistance | D1, R-D01 |
| LACORS §19.6 | 9mm plasterboard — lesser standard, subject to assessor judgment | D1, R-D01 |
| LACORS §19.7 | Fire-stopping around service penetrations | D4 |
| LACORS §21.5 | Self-closers on flat entrance doors — general expectation, not absolute | F1, R-F01 |
| LACORS §21.6 | Solid conventional doors acceptable at lower risk | F2, R-F02 |
| LACORS Table C2 | Alarm grades — Grade F not recommended in HMOs | E1, R-E01 |
| LACORS Table C4 | Recommended alarm grade and coverage by property type | Section E |
| LACORS A.33 | Section 257 statutory definition | Classification |
| LACORS A.46 | HMO Management Regulations 2006 — excludes Section 257 | Excluded from all outputs |
| LACORS A.51–A.58 | Fire Safety Order — common parts duties | G3, R-G03 |
| Regulatory Reform (Fire Safety) Order 2005 | Common parts of multi-occupied buildings | G3, R-G03 |
| Electrical Safety Standards Regulations 2020 | 5-year EICR | R-G02 |
| Gas Safety (Installation and Use) Regulations 1998 | Annual gas safety inspection | R-G01 |
| HMO Management Regulations 2006 | Expressly excluded for Section 257 | Not cited in outputs |

---

*End of Requirements Specification v1.2*
