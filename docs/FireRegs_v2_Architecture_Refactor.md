# FireRegs v2 Architecture Refactor Specification

**Project:** FireRegs fire-risk assessment tool  
**Audience:** Claude Code / developer implementation  
**Status:** Draft technical specification  
**Prepared for:** TW9 property portfolio  
**Date:** 2026-06-12  

---

## 1. Executive summary

FireRegs v1 has reached the limit of an incremental questionnaire/rules approach. The current model still treats property classification, LACORS guidance, statutory requirements, and risk scoring as too tightly coupled. This creates incorrect outputs for buildings that are **not Section 257 HMOs** but still have meaningful fire risk, particularly purpose-built two-flat terrace buildings with shared entrance halls.

FireRegs v2 should refactor the assessment model around the actual property structure:

```text
Building
├── Common parts
├── Ground-floor flat
└── Upper-floor flat
```

The core design goal is to separate:

1. **Property classification** — what type of building is this?
2. **Legal framework** — what statutory duties apply?
3. **Risk assessment** — what fire risks exist in each part of the building?
4. **Uncertainty handling** — what is known, potential, or unknown?
5. **Remedies** — what must be done, what is recommended, what requires investigation?

The tool should support the portfolio’s real building stock: two-storey early-20th-century terraced buildings, usually built around 1910–1912, either purpose-built as two flats or converted later into two self-contained flats, with either private entrances or a shared entrance hall. Some upper flats have external steel rear staircases. Most flats are single-floor dwellings.

FireRegs v2 should remain a **client-side static application** and should not attempt to replace a professional fire risk assessment. It should produce a structured internal fire-risk assessment and remediation schedule suitable for landlord decision-making and record-keeping.

---

## 2. Regulatory and guidance basis

### 2.1 LACORS scope

The LACORS fire safety guide is not limited to HMOs. Its scope includes a range of existing residential premises, including single household properties, shared houses, bedsit HMOs, and self-contained flats. It is therefore appropriate to use LACORS as a **risk-assessment benchmark** across the portfolio, provided the app does not incorrectly present all LACORS recommendations as statutory requirements.

### 2.2 HHSRS

The Housing Health and Safety Rating System is a risk-based tool used by local authorities to identify hazards in residential properties. Fire risk is one of the hazards considered. FireRegs should therefore treat fire safety as a **risk-based assessment**, not a rigid checklist.

### 2.3 Fire Safety Order and common parts

The Regulatory Reform (Fire Safety) Order 2005 applies to the common parts of buildings containing two or more domestic premises. Where a building has a shared entrance hall, shared corridor, shared stair, meter cupboard, shared plant area, or similar common part, the app should recognise that common-parts fire-risk assessment duties may apply.

### 2.4 Purpose-built blocks / purpose-built two-flat buildings

Purpose-built blocks of flats have their own fire-safety guidance. A purpose-built two-flat terrace building is not a Section 257 HMO merely because it contains two flats, but common parts and flat entrance doors can still be relevant under general fire safety principles, the Fire Safety Order, and HHSRS.

### 2.5 Statutory landlord duties

The app must clearly distinguish true statutory duties from LACORS or risk-based recommendations. Examples of statutory duties include:

- Smoke alarm on every storey used as living accommodation, under the Smoke and Carbon Monoxide Alarm Regulations.
- Carbon monoxide alarm in rooms with fixed combustion appliances, subject to the relevant statutory definitions and exclusions.
- Annual gas safety checks where gas appliances/flues are provided.
- Electrical safety inspection/testing at least every five years in rented property.
- Fire risk assessment duties for common parts under the Fire Safety Order where common parts exist.

---

## 3. Product objective

FireRegs v2 should support two levels of use:

### 3.1 Basic assessment assistant

Help a knowledgeable landlord identify obvious defects, record observations, and decide where further investigation or remedial works are needed.

### 3.2 Internal competent-person assessment support

Produce a structured internal fire-risk assessment with:

- property classification;
- statutory legal requirements;
- LACORS/risk-based recommendations;
- further investigation items;
- remediation schedule;
- priority ranking;
- evidence and assumptions.

The tool should **not** claim to produce a statutory compliance certificate or replace a qualified fire risk assessor.

---

## 4. Portfolio scope

FireRegs v2 should be designed around the actual TW9 property portfolio:

### 4.1 Supported building form

- Terraced buildings, typically built circa 1910–1912.
- Two storeys.
- Usually one flat per floor.
- Ground-floor flat occupies ground floor.
- Upper flat occupies first floor.
- Some upper flats have rear external steel staircases.
- Some have shared front entrance halls.
- Some have fully private entrances.
- Some are purpose-built as two flats.
- Some are converted from a single two-storey house into two flats.

### 4.2 Building variants to support

| Variant | Description | Must support? |
|---|---|---:|
| V1 | Purpose-built two-flat building, shared entrance hall | Yes |
| V2 | Purpose-built two-flat building, separate entrances | Yes |
| V3 | Converted two-flat building, shared entrance hall | Yes |
| V4 | Converted two-flat building, separate entrances | Yes |
| V5 | Section 257 HMO, shared entrance/common parts | Yes |
| V6 | Section 257 HMO, separate entrances | Yes, but outputs should be cautious |
| V7 | Upper flat with external steel staircase | Yes |
| V8 | Upper flat with loft extension | Yes, flagged as increased complexity |
| V9 | Three or more flats | Not v2 core scope; detect and stop or warning |
| V10 | Classic shared-house / bedsit HMO | Not v2 core scope |

---

## 5. Core v2 architecture

### 5.1 Assessment object

Replace the effective single-hybrid assessment model with a structured building assessment.

```ts
interface AssessmentV2 {
  schema_version: '2.0';
  app_version: string;
  rules_version: string;
  assessment_id: string;
  created_at: string;
  last_edited_at: string;

  property: PropertyIdentity;
  building: BuildingAssessment;
  common_parts: CommonPartsAssessment;
  flats: {
    ground: FlatAssessment;
    upper: FlatAssessment;
  };

  classification: BuildingClassification;
  legal_framework: LegalFrameworkAssessment;
  risk: RiskAssessment;
  remedies: RemedySummary;

  evidence: EvidenceRecord[];
  assumptions: Assumption[];
  unanswered_or_unknown: UnknownItem[];
}
```

### 5.2 Separation of concerns

The codebase should preserve the current architectural separation:

```text
src/data/schema/        Question definitions
src/data/rules/         Rule definitions
src/engine/             Classification, risk, remedies, report generation
src/persistence/        localStorage/import/export/share
src/state/              reducer/context/types
src/pages/              UI pages only
src/components/         presentational components only
```

Business logic must not move into React components.

---

## 6. Building classification model

### 6.1 Required classification outputs

```ts
type BuildingOrigin =
  | 'purpose_built_two_flats'
  | 'converted_from_single_house'
  | 'unknown';

type HmoClassification =
  | 'not_hmo'
  | 'section_257_hmo'
  | 'probable_section_257_hmo'
  | 'unresolved';

type EntranceConfiguration =
  | 'separate_private_entrances'
  | 'shared_entrance_hall'
  | 'shared_hall_and_shared_stair'
  | 'unknown';
```

### 6.2 Building classification rules

The app must not assume that a two-flat building is Section 257 merely because there are two flats.

| Building fact | Classification effect |
|---|---|
| Built as two flats | Not Section 257 |
| Converted from single house into flats | Potential Section 257 |
| Converted and pre-1991 / below 1991 Building Regulations standard | Section 257 likely if owner-occupation threshold also met |
| One of two flats owner-occupied | 50% owner occupation; not automatically outside Section 257 |
| Two-thirds or more owner-occupied | Section 257 may not apply |
| Purpose-built but shared entrance | Not Section 257, but common-parts fire-risk assessment still relevant |

### 6.3 Correct handling of purpose-built flats

If the building is purpose-built as two flats:

```ts
classification.hmo = 'not_hmo';
classification.section_257 = false;
classification.case_study_d10 = 'not_applicable';
classification.general_lacors_risk_guidance = 'applicable';
classification.fso_common_parts = common_parts.exists;
```

Do **not** set the overall fire benchmark to “not applicable”. Only the Section 257/D10 benchmark is not applicable.

---

## 7. Legal framework model

### 7.1 Required output

```ts
interface LegalFrameworkAssessment {
  smoke_co_alarm_regulations: 'applies' | 'not_applicable' | 'unknown';
  gas_safety: 'applies' | 'not_applicable' | 'unknown';
  electrical_safety: 'applies';
  hhsrs_fire_hazard: 'applies';
  fire_safety_order_common_parts: 'applies' | 'not_applicable' | 'unknown';
  section_257_hmo: 'applies' | 'not_applicable' | 'unknown';
  lacors_guidance_use: 'direct_benchmark' | 'risk_reference' | 'not_applicable' | 'unknown';
}
```

### 7.2 Legal vs benchmark vs advisory

Every remedy must carry:

```ts
type LegalStatus =
  | 'legal_requirement'
  | 'lacors_benchmark_recommendation'
  | 'risk_based_recommendation'
  | 'advisory_good_practice'
  | 'further_investigation_required';
```

Do not use “mandatory” unless the rule is genuinely statutory or an unavoidable common-parts duty.

---

## 8. Common parts model

### 8.1 Required fields

```ts
interface CommonPartsAssessment {
  exists: boolean | 'unknown';
  type: 'none' | 'shared_entrance_hall' | 'shared_corridor' | 'shared_stair' | 'meter_cupboard_only' | 'mixed' | 'unknown';
  used_by_ground_flat: boolean | 'unknown';
  used_by_upper_flat: boolean | 'unknown';
  shared_escape_route: boolean | 'unknown';
  upper_route_dependency: 'sole_route' | 'primary_route' | 'secondary_route' | 'not_relied_on' | 'unknown';
  final_exit_door_keyless: boolean | 'unknown';
  combustible_storage: 'none' | 'present' | 'unknown';
  meter_or_service_cupboard: 'none' | 'present_fire_resisting' | 'present_not_fire_resisting' | 'unknown';
  common_area_detection: DetectionAssessment;
}
```

### 8.2 Shared hall vs shared stair

The app must stop using “communal staircase” as a default phrase. Many properties have:

```text
Front entrance → small shared hall → ground-floor flat door + stair serving upper flat only
```

This is not the same as a communal stair serving multiple dwellings. The app should use more precise terms:

- shared entrance hall;
- shared corridor;
- stair serving upper flat;
- common escape route;
- final exit door.

---

## 9. Flat assessment model

### 9.1 Required flat structure

```ts
interface FlatAssessment {
  level: 'ground' | 'upper';
  bedrooms: BedroomAssessment[];
  habitable_rooms: HabitableRoomAssessment[];
  flat_entrance_door: DoorAssessment;
  internal_escape_route: InternalEscapeAssessment;
  external_escape: ExternalEscapeAssessment;
  detection: DetectionAssessment;
  co: COAssessment;
  gas: GasAssessment;
  electrical: ElectricalAssessment;
}
```

### 9.2 Ground-floor flat

The ground-floor flat must be assessed separately. Its escape strategy may rely on:

- front final exit;
- rear garden door;
- internal hallway;
- escape windows only if no better route exists.

Do not drive unnecessary window-remedy logic where a ground-floor flat has a direct final exit or rear exit.

### 9.3 Upper-floor flat

The upper flat may rely on:

- internal stair/shared hall;
- qualifying escape windows;
- rear external steel staircase;
- rear external door route;
- a combination of these.

The app must explicitly distinguish whether the shared route is the **sole**, **primary**, or **secondary** escape route.

---

## 10. External steel staircase / independent upper escape

### 10.1 Required fields

```ts
interface ExternalEscapeAssessment {
  exists: boolean | 'unknown';
  type: 'external_steel_stair' | 'rear_door_to_garden' | 'juliet_or_full_height_escape_opening' | 'none' | 'unknown';
  accessible_from: 'hall_or_landing' | 'kitchen' | 'living_room' | 'bedroom' | 'unknown';
  keyless_egress: boolean | 'unknown';
  unobstructed: boolean | 'unknown';
  condition: 'sound' | 'minor_defects' | 'poor' | 'unknown';
  lighting: 'adequate' | 'not_required' | 'poor' | 'unknown';
  viable: 'yes' | 'no' | 'unknown';
}
```

### 10.2 Risk effect

If the upper flat has a viable external steel staircase:

- reduce “sole shared route” risk;
- reduce dependence on escape windows;
- reduce urgency of door upgrades that are triggered only by lack of alternative escape;
- do not eliminate common-parts or compartmentation risk entirely.

If the external escape exists but is unverified:

- do not reduce risk fully;
- create a further-investigation item.

If it is obstructed, locked, or in poor condition:

- treat it as not viable;
- create a remediation item to restore/repair the escape route.

---

## 11. Door model

### 11.1 Required fields

```ts
interface DoorAssessment {
  location: 'ground_flat_entrance' | 'upper_flat_entrance' | 'building_final_exit' | 'internal_escape_route';
  construction: 'fd30s_confirmed' | 'solid_timber' | 'hollow_core' | 'panel_door' | 'unknown';
  thickness_mm: number | 'unknown';
  frame_condition: 'good' | 'gaps' | 'poor' | 'unknown';
  self_closer_present: boolean | 'unknown';
  self_closer_effective: boolean | 'unknown' | 'not_applicable';
  latches_when_closed: boolean | 'unknown';
  intumescent_strips: boolean | 'unknown';
  smoke_seals: boolean | 'unknown';
  letterplate: 'none' | 'present_protected' | 'present_unprotected' | 'unknown';
  keyless_egress: boolean | 'unknown';
}
```

### 11.2 Door risk weighting

The risk engine must weight doors more strongly than v1.

High-weight factors:

- hollow-core flat entrance door opening onto a shared route;
- no self-closer on flat entrance door opening onto a shared route;
- visible gaps / poor frame fit;
- key-required final exit from inside;
- no latch or ineffective closer.

The app must distinguish:

- flat entrance door;
- building final exit door;
- internal doors within a flat.

Do not ask “entrance door” without context.

---

## 12. Staircase enclosure / compartmentation model

### 12.1 Required fields

```ts
interface StairCompartmentationAssessment {
  relevant: boolean | 'unknown';
  stair_serves: 'upper_flat_only' | 'multiple_dwellings' | 'unknown';
  enclosure_material: 'masonry' | 'plasterboard' | 'lath_and_plaster' | 'timber_panelling' | 'mixed' | 'unknown';
  board_thickness: '9_5mm' | '12_5mm' | 'double_layer' | 'unknown' | 'not_applicable';
  board_type: 'standard' | 'fire_resistant' | 'unknown' | 'not_applicable';
  inspection_method: 'visual_only' | 'edge_visible' | 'inspection_opening' | 'intrusive_confirmed';
  hidden_voids: 'none_known' | 'suspected' | 'unknown';
  penetrations: 'none' | 'sealed' | 'unsealed' | 'unknown';
  continuity: 'continuous' | 'gaps_or_openings' | 'unknown';
  confidence: 'high' | 'moderate' | 'low' | 'unknown';
  risk: 'known_risk' | 'potential_risk' | 'unknown_risk' | 'low_concern';
}
```

### 12.2 Investigation-led approach

Do not automatically prescribe replacement where construction is unknown.

If the stair enclosure is visually inspected only and board type/voids are unknown, output:

```text
Further investigation required: confirm staircase enclosure construction and continuity.
```

Do not output “low risk” simply because no defects are visible.

---

## 13. Alarm and detection model

### 13.1 Separate by flat/common parts

Detection must be assessed separately:

```ts
interface DetectionAssessment {
  smoke_alarms: AlarmDevice[];
  heat_alarms: AlarmDevice[];
  grade: 'D1' | 'D2' | 'F' | 'A' | 'mixed' | 'unknown';
  within_area_interlinked: boolean | 'unknown';
  linked_to_other_flat: boolean | 'unknown' | 'not_applicable';
  linked_to_common_parts: boolean | 'unknown' | 'not_applicable';
  tested_recently: 'monthly' | 'within_year' | 'over_year' | 'unknown';
}
```

### 13.2 Alarm output principles

- For Section 257 / converted-flat D10 cases, D10/Table C4 benchmark recommendations may be strong.
- For purpose-built non-Section-257 two-flat buildings, D10 is not directly applicable, but common-parts and flat detection should still be assessed as risk-based recommendations.
- Do not require cross-flat interlinking unless the rule is explicitly justified by the selected benchmark/risk case.
- Distinguish within-flat interlinking from between-flat/common-parts interlinking.

---

## 14. CO alarm model

### 14.1 Required split

Do not ask one compressed question. Use:

```ts
fixed_combustion_appliance_present: boolean | 'unknown';
co_alarm_present_in_same_room: boolean | 'unknown' | 'not_applicable';
```

### 14.2 Rule logic

- Appliance present + no CO alarm = legal requirement.
- Appliance unknown = further investigation/advisory.
- No appliance = no CO alarm action under this rule.

---

## 15. Risk model

### 15.1 Three risk knowledge states

Replace a simple low/normal/high model with two dimensions:

```ts
type RiskSeverity = 'low' | 'normal' | 'elevated' | 'high';
type RiskKnowledge = 'known_risk' | 'potential_risk' | 'unknown_risk';
```

A property may have “normal known risk” but “high unknown risk” where hidden compartmentation is unverified.

### 15.2 Risk domains

Calculate risk across domains:

```ts
interface RiskAssessment {
  overall_severity: RiskSeverity;
  overall_knowledge: RiskKnowledge;
  domains: {
    escape: RiskDomainAssessment;
    doors: RiskDomainAssessment;
    detection: RiskDomainAssessment;
    compartmentation: RiskDomainAssessment;
    common_parts: RiskDomainAssessment;
    management: RiskDomainAssessment;
  };
  risk_factors: RiskFactor[];
}
```

### 15.3 Door weighting

Door defects must receive higher weighting where there is a shared route:

| Condition | Severity impact |
|---|---:|
| Hollow-core flat entrance door + shared route | High |
| No self-closer + shared route | Elevated/high |
| Door gaps / poor fit + shared route | Elevated |
| Key required to escape | High |

### 15.4 Unknown risk

Unknown risk should not be scored as low. It should produce investigation actions.

Examples:

| Unknown fact | Output |
|---|---|
| Stair board type unknown, visual only | Further investigation required |
| Hidden voids unknown in old terrace conversion | Potential compartmentation risk |
| Door construction unknown | Investigate/confirm door construction |

---

## 16. Remedy model

### 16.1 Required remedy fields

```ts
interface RemedyRule {
  id: string;
  title: string;
  legal_status: LegalStatus;
  priority: 'P1_urgent' | 'P2_high' | 'P3_medium' | 'P4_low' | 'investigate';
  applies_to: 'building' | 'common_parts' | 'ground_flat' | 'upper_flat';
  condition: RuleCondition;
  text: string;
  risk_basis: string;
  regulatory_refs: string[];
  confidence: 'confirmed' | 'probable' | 'contingent' | 'unknown';
  suppress_if?: RuleCondition;
  downgrade_if?: RuleCondition;
}
```

### 16.2 Output groups

The report must group outputs under:

1. **Legal requirements**
2. **LACORS / risk-based recommendations**
3. **Further investigation required**
4. **Advisory / management actions**
5. **Remediation schedule**

---

## 17. Report structure

### 17.1 Required report sections

1. Property details
2. Assessment scope and limitations
3. Property classification
4. Applicable legal framework
5. Common parts assessment
6. Ground-floor flat assessment
7. Upper-floor flat assessment
8. External escape route assessment
9. Door and route protection assessment
10. Stair compartmentation assessment
11. Alarm and detection assessment
12. Known risks
13. Potential risks
14. Unknown risks / further investigation
15. Legal requirements
16. LACORS / risk-based recommendations
17. Remediation schedule
18. Evidence and assumptions
19. Disclaimer

### 17.2 Tone requirements

Avoid overstatement.

Use:

- “Required” only for true legal requirements.
- “Recommended” for LACORS/risk-based actions.
- “Further investigation required” where evidence is insufficient.
- “Assumption” where the assessment depends on a user-supplied fact.

---

## 18. Question flow

### 18.1 Proposed sequence

```text
Setup
Building classification
Common parts / entrance configuration
Ground-floor flat
Upper-floor flat
External escape routes
Doors and route protection
Stair compartmentation
Detection and alarms
Gas / electrical / CO
Management
Review
Report
```

### 18.2 Question scope label

Every question must visibly show one of:

- Building
- Common parts
- Ground-floor flat
- Upper flat
- Both flats

---

## 19. Migration strategy

### 19.1 Existing v1 assessments

Existing schema v1.2 assessments should not be silently loaded into v2 as valid assessments.

Options:

1. Open in read-only legacy mode; or
2. Import answers where mapping is safe, then mark assessment as “requires review”; or
3. Require a fresh v2 assessment.

Recommended:

```text
Import v1.2 → create v2 assessment draft → prefill safe fields → require user review.
```

### 19.2 Version bump

Set:

```ts
SCHEMA_VERSION = '2.0';
RULES_VERSION = '2026-06-v1';
APP_VERSION = '0.4.0';
```

Adjust exact values to match the release process.

---

## 20. Test scenarios

Create regression scenarios for:

### Scenario A — Purpose-built two-flat building with shared entrance

Expected:

- Not Section 257.
- Common parts duties may apply.
- D10 not directly applicable.
- Shared route, hollow-core doors, no self-closers should produce high-priority risk-based recommendations.

### Scenario B — Purpose-built two-flat building with separate entrances

Expected:

- Not Section 257.
- No common-parts FSO duty unless shared services/common parts exist.
- Legal requirements still apply per flat.
- LACORS guidance used as risk reference only.

### Scenario C — Converted two-flat building with shared entrance

Expected:

- Potential or confirmed Section 257 depending on conversion facts.
- D10 benchmark likely applicable.
- Common parts, flat doors, alarms, stair compartmentation assessed strongly.

### Scenario D — Converted two-flat building with separate entrances

Expected:

- Possible Section 257 classification but no shared route.
- Lower common-parts risk.
- Flat-level legal duties and compartmentation risks still assessed.

### Scenario E — Upper flat with external steel staircase

Expected:

- Shared route may still exist.
- Upper route dependency reduced if external stair viable.
- External stair condition must be assessed.
- Do not over-prescribe escape-window/sole-route remedies.

### Scenario F — Unknown stair compartmentation

Expected:

- Unknown risk, not low risk.
- Further investigation recommended.

### Scenario G — Hollow-core doors onto shared route

Expected:

- High-priority door recommendation.
- Strong risk basis.

### Scenario H — CO appliance present, no CO alarm

Expected:

- Legal requirement.

---

## 21. Implementation phases

### Phase 1 — Data model and classification refactor

- Introduce `AssessmentV2`.
- Introduce building/common/flat structures.
- Update classification engine.
- Implement legal-framework output.

### Phase 2 — Question schema refactor

- Add scope labels.
- Split building/common/ground/upper questions.
- Split CO questions.
- Split alarm questions by scope.
- Split door questions by location.

### Phase 3 — Risk engine refactor

- Implement domain risk model.
- Add known/potential/unknown risk distinction.
- Increase door weighting.
- Add stair-compartmentation unknown-risk logic.
- Add external steel stair logic.

### Phase 4 — Remedy engine refactor

- Add `legal_status`, `priority`, `applies_to`, `confidence`.
- Re-map existing rules into correct categories.
- Prevent D10 requirements being applied as legal duties to purpose-built buildings.

### Phase 5 — Report refactor

- Add required report sections.
- Show legal framework clearly.
- Show known/potential/unknown risk.
- Produce remediation schedule.

### Phase 6 — Migration and regression tests

- Add v1.2 import/migration behaviour.
- Add scenario tests.
- Add fixture assessments.

---

## 22. Claude Code implementation prompt

Use the following prompt when starting the v2 refactor:

```text
Implement the FireRegs v2 Architecture Refactor from docs/FireRegs_v2_Architecture_Refactor.md.

This is a structural correctness refactor, not a UI redesign.

Primary goals:
1. Replace the hybrid single-assessment model with Building → Common parts → Ground-floor flat → Upper-floor flat.
2. Separate classification, legal framework, risk assessment, uncertainty, and remedies.
3. Support both purpose-built two-flat buildings and converted/Section 257 buildings.
4. Treat LACORS as direct benchmark only where appropriate, and as risk guidance elsewhere.
5. Introduce known risk / potential risk / unknown risk.
6. Increase weighting for flat entrance doors opening onto shared routes.
7. Add proper handling of external steel staircases as upper-flat independent escape routes.
8. Preserve static client-side architecture.

Before coding:
- read the specification fully;
- identify the smallest safe implementation sequence;
- list files to change;
- identify any migration risks.

Do not move business logic into React components.
Do not invent regulations.
Do not make D10 apply to purpose-built non-Section-257 buildings as a legal duty.
Do not suppress fire risk assessment merely because a property is not Section 257.

Implement in phases and keep the build green after each phase.
```

---

## 23. References

- LACORS / CIEH, *Guidance on fire safety provisions for certain types of existing housing*: https://www.cieh.org/media/1244/guidance-on-fire-safety-provisions-for-certain-types-of-existing-housing.pdf
- GOV.UK, *Housing health and safety rating system guidance*: https://www.gov.uk/government/publications/housing-health-and-safety-rating-system-guidance-for-landlords-and-property-related-professionals
- GOV.UK, *Fire safety legislation: guidance for those with legal duties*: https://www.gov.uk/government/collections/fire-safety-legislation-guidance-for-those-with-legal-duties
- GOV.UK, *Fire safety in purpose-built blocks of flats*: https://www.gov.uk/government/publications/fire-safety-in-purpose-built-blocks-of-flats
- GOV.UK, *A guide to making your small block of flats safe from fire*: https://www.gov.uk/government/publications/making-your-small-block-of-flats-safe-from-fire/a-guide-to-making-your-small-block-of-flats-safe-from-fire-accessible
- GOV.UK, *Smoke and Carbon Monoxide Alarm Regulations: explanatory booklet for landlords*: https://www.gov.uk/government/publications/smoke-and-carbon-monoxide-alarms-explanatory-booklet-for-landlords
- GOV.UK, *Electrical safety standards in the private and social rented sectors: guidance*: https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance
- GOV.UK, *Private renting: landlord safety responsibilities*: https://www.gov.uk/private-renting/your-landlords-safety-responsibilities
- HSE, *Gas safety - landlords and letting agents*: https://www.hse.gov.uk/gas/domestic/faqlandlord.htm

---

## 24. Non-goals

FireRegs v2 must not:

- become a professional FRA certification tool;
- claim legal compliance certification;
- support arbitrary complex blocks in v2;
- support bedsit/shared-house HMOs in v2;
- require a backend;
- require accounts;
- add analytics/tracking;
- make every LACORS recommendation sound statutory.

---

## 25. Success criteria

FireRegs v2 is successful when:

1. A purpose-built two-flat building with shared entrance is assessed as **not Section 257** but still receives meaningful common-parts and door-risk assessment.
2. A converted two-flat building can be assessed as probable/confirmed Section 257 where facts support it.
3. A building with separate private entrances does not receive inappropriate shared-route recommendations.
4. An upper flat with a viable external steel staircase receives reduced shared-route dependency risk.
5. Hollow-core flat entrance doors onto shared routes are treated as high-priority risk-based recommendations.
6. Unknown stair compartmentation is treated as **unknown risk requiring investigation**, not low risk.
7. Statutory requirements, LACORS/risk recommendations, and advisories are clearly separated in the report.
8. The report produces a usable remediation schedule with priority ranking.
