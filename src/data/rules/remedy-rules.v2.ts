/**
 * remedy-rules.v2.ts — FireRegs v2 remedy rule set (docs/5-Remedy-Engine-Refactor.md, §16).
 *
 * Re-maps every rule from `remedy-rules.ts` (v1) onto the §16.1 `RemedyRule`
 * shape: `legal_status` (5-value union), `priority`, `applies_to`,
 * `confidence`, and the new `condition` / `suppress_if` / `downgrade_if`
 * conditions built on the v2 `RuleCondition` AST (`AppState.ts`), which
 * consume `BuildingClassification` (Step 2) and `RiskAssessment.risk_factors`
 * (Step 4) rather than the v1 `Classification` shape.
 *
 * Additive: this module does not replace `remedy-rules.ts`. `text`,
 * `risk_basis`, and `regulatory_refs` are reused verbatim from the v1 rules
 * (the underlying LACORS/statutory reasoning is unchanged by this refactor)
 * via the `v1()` lookup below; only `legal_status`/`priority`/`applies_to`/
 * `confidence`/`condition`/`suppress_if`/`downgrade_if` and a small number of
 * `text` overrides (§17.2 tone) are new.
 *
 * §22 / item 5 — D10 suppression: rules tied to the Section-257 "Case Study
 * D10" stair-enclosure benchmark carry `downgrade_if:
 * classification.case_study_d10 === 'not_applicable'`, which the engine maps
 * `lacors_benchmark_recommendation -> risk_based_recommendation`. No rule in
 * this file has a base `legal_status` of `legal_requirement` tied to that
 * benchmark, so the D10 benchmark can never surface as a legal duty for a
 * purpose-built building (Scenario A).
 *
 * §25.3 — separate-private-entrance suppression: `R-F01` carries
 * `suppress_if: entrance_configuration === 'separate_private_entrances'`;
 * `R-F01b` is its separate-entrance advisory counterpart. Other
 * communal-only v1 rules (R-E02/E03/E06/E06b's common-parts factors,
 * R-D01 variants, D02, D04, D05, D07, D09, R-S01-S03, R-F06) map onto risk
 * factors that `riskEngine.ts` already gates on `sharedHall`, so no further
 * suppression is needed for those.
 */

import type { RemedyRule, RuleCondition } from '../../state/AppState'
import { REMEDY_RULES } from './remedy-rules'

export const RULES_VERSION_V2 = '2026-07-v1' as const
export const RULES_DATE_V2 = '2026-07-01' as const

// ---------------------------------------------------------------------------
// v1 lookup — reuse title/text/risk_basis/regulatory_refs verbatim
// ---------------------------------------------------------------------------

const v1ById = new Map(REMEDY_RULES.map((rule) => [rule.id, rule]))

function v1(id: string) {
  const rule = v1ById.get(id)
  if (!rule) throw new Error(`remedy-rules.v2: no v1 rule found for id ${id}`)
  return rule
}

// ---------------------------------------------------------------------------
// Shared condition fragments
// ---------------------------------------------------------------------------

const SEPARATE_ENTRANCE: RuleCondition = {
  type: 'classification',
  field: 'entrance_configuration',
  in_values: ['separate_private_entrances'],
}

const D10_NOT_APPLICABLE: RuleCondition = {
  type: 'classification',
  field: 'case_study_d10',
  in_values: ['not_applicable'],
}

function rf(factor_id: string): RuleCondition {
  return { type: 'risk_factor', factor_id }
}

function anyOf(...conditions: RuleCondition[]): RuleCondition {
  return { type: 'or', conditions }
}

function allOf(...conditions: RuleCondition[]): RuleCondition {
  return { type: 'and', conditions }
}

// ---------------------------------------------------------------------------
// Rule set
// ---------------------------------------------------------------------------

export const REMEDY_RULES_V2: RemedyRule[] = [
  // =========================================================================
  // Statutory — gas, electrical, smoke/CO alarms, common-parts FRA
  // =========================================================================

  {
    id: 'R-G01',
    title: v1('R-G01').title,
    legal_status: 'legal_requirement',
    priority: 'P1_urgent',
    applies_to: 'building',
    condition: { type: 'leaf', question_id: 'G1', in_values: ['overdue'] },
    text: v1('R-G01').text,
    risk_basis: v1('R-G01').risk_basis,
    regulatory_refs: v1('R-G01').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-G02',
    title: v1('R-G02').title,
    legal_status: 'legal_requirement',
    priority: 'P1_urgent',
    applies_to: 'building',
    condition: { type: 'leaf', question_id: 'G2', in_values: ['overdue', 'unknown'] },
    text: v1('R-G02').text,
    risk_basis: v1('R-G02').risk_basis,
    regulatory_refs: v1('R-G02').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-E04',
    title: v1('R-E04').title,
    legal_status: 'legal_requirement',
    priority: 'P1_urgent',
    applies_to: 'building',
    condition: anyOf(rf('RF-DET-GF-NONE'), rf('RF-DET-UF-NONE')),
    text: v1('R-E04').text,
    risk_basis: v1('R-E04').risk_basis,
    regulatory_refs: v1('R-E04').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-G03',
    title: v1('R-G03').title,
    legal_status: 'legal_requirement',
    priority: 'P1_urgent',
    applies_to: 'common_parts',
    condition: allOf(
      { type: 'classification', field: 'fso_common_parts', in_values: [true] },
      { type: 'leaf', question_id: 'G3', in_values: ['no', 'not_sure'] }
    ),
    text: v1('R-G03').text,
    risk_basis: v1('R-G03').risk_basis,
    regulatory_refs: v1('R-G03').regulatory_refs,
    confidence: 'confirmed',
  },

  // §14.2 — CO rule logic: appliance present + no alarm => legal_requirement;
  // appliance/alarm presence uncertain => further_investigation_required (R-G04b below).
  {
    id: 'R-G04',
    title: v1('R-G04').title,
    legal_status: 'legal_requirement',
    priority: 'P1_urgent',
    applies_to: 'building',
    condition: allOf(
      { type: 'leaf', question_id: 'G4a', in_values: ['yes'] },
      { type: 'leaf', question_id: 'G4b', in_values: ['no'] }
    ),
    text: v1('R-G04').text,
    risk_basis: v1('R-G04').risk_basis,
    regulatory_refs: v1('R-G04').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-G04b',
    title: v1('R-G04b').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'building',
    condition: anyOf(rf('RF-MGT-CO-APPLIANCE-UNK'), rf('RF-MGT-CO-UNK')),
    text: v1('R-G04b').text,
    risk_basis: v1('R-G04b').risk_basis,
    regulatory_refs: v1('R-G04b').regulatory_refs,
    confidence: 'unknown',
  },

  // =========================================================================
  // Detection / alarms — within-flat and common parts
  // =========================================================================

  {
    id: 'R-E01',
    title: v1('R-E01').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P2_high',
    applies_to: 'building',
    condition: anyOf(rf('RF-DET-GF-BATTERY'), rf('RF-DET-UF-BATTERY')),
    text: v1('R-E01').text,
    risk_basis: v1('R-E01').risk_basis,
    regulatory_refs: v1('R-E01').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-E02',
    title: v1('R-E02').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P2_high',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-DET-COMMON-BATTERY'), rf('RF-DET-COMMON-NONE'), rf('RF-DET-COMMON-UNK')),
    text: v1('R-E02').text,
    risk_basis: v1('R-E02').risk_basis,
    regulatory_refs: v1('R-E02').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-E03',
    title: v1('R-E03').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-DET-LOBBY-PARTIAL'), rf('RF-DET-LOBBY-NONE'), rf('RF-DET-LOBBY-UNK')),
    text: v1('R-E03').text,
    risk_basis: v1('R-E03').risk_basis,
    regulatory_refs: v1('R-E03').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-E05',
    title: v1('R-E05').title,
    legal_status: 'advisory_good_practice',
    priority: 'P4_low',
    applies_to: 'building',
    condition: anyOf(rf('RF-DET-STALE'), rf('RF-DET-NEVER')),
    text: v1('R-E05').text,
    risk_basis: v1('R-E05').risk_basis,
    regulatory_refs: v1('R-E05').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-E06',
    title: v1('R-E06').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P3_medium',
    applies_to: 'building',
    condition: anyOf(rf('RF-DET-GF-LINK'), rf('RF-DET-UF-LINK')),
    text: v1('R-E06').text,
    risk_basis: v1('R-E06').risk_basis,
    regulatory_refs: v1('R-E06').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-E06b',
    title: v1('R-E06b').title,
    legal_status: 'advisory_good_practice',
    priority: 'P4_low',
    applies_to: 'building',
    condition: anyOf(rf('RF-DET-CROSSLINK'), rf('RF-DET-CROSSLINK-UNK')),
    text: v1('R-E06b').text,
    risk_basis: v1('R-E06b').risk_basis,
    regulatory_refs: v1('R-E06b').regulatory_refs,
    confidence: 'probable',
  },

  // Per-flat detection (Part B) — mixed provision, kitchen heat, and the
  // within-flat investigation gap. Inline text (new rules).
  {
    id: 'R-E07',
    title: 'Assess detection per flat and level up the weaker flat',
    legal_status: 'advisory_good_practice',
    priority: 'P4_low',
    applies_to: 'building',
    condition: rf('RF-DET-MIXED-PROVISION'),
    text:
      'The flats have different standards of detection. Assess and record detection per flat rather ' +
      'than assigning the building a single alarm grade, and bring the weaker flat up to the same ' +
      'mains-wired (Grade D) standard as the stronger flat.',
    risk_basis:
      'LACORS / BS 5839-6 treat detection per dwelling. Where one flat has mains-interlinked alarms ' +
      'and the other battery-only, the building has no uniform standard and the weaker flat is the ' +
      'limiting factor.',
    regulatory_refs: ['LACORS §22', 'BS 5839-6'],
    confidence: 'confirmed',
  },
  {
    id: 'R-E08',
    title: 'Provide an interlinked heat detector in the kitchen',
    legal_status: 'risk_based_recommendation',
    priority: 'P3_medium',
    applies_to: 'building',
    condition: anyOf(rf('RF-DET-GF-KITCHEN'), rf('RF-DET-UF-KITCHEN')),
    text:
      'Provide a heat detector (not a smoke alarm, to avoid nuisance alarms from cooking) in the ' +
      'kitchen of the affected flat, interlinked with that flat\'s other alarms.',
    risk_basis:
      'LACORS LD2 / Case Study D10 include detection in the kitchen as a higher-risk room. A heat ' +
      'detector gives early warning of a kitchen fire — the most common ignition point — without the ' +
      'nuisance alarms a smoke detector would cause.',
    regulatory_refs: ['LACORS §22.11', 'BS 5839-6 LD2'],
    confidence: 'probable',
  },
  {
    id: 'R-E09',
    title: 'Confirm the within-flat detection provision',
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'building',
    condition: anyOf(
      rf('RF-DET-GF-UNK'),
      rf('RF-DET-UF-UNK'),
      rf('RF-DET-GF-KITCHEN-UNK'),
      rf('RF-DET-UF-KITCHEN-UNK'),
      rf('RF-DET-GF-LINK-UNK'),
      rf('RF-DET-UF-LINK-UNK')
    ),
    text:
      'Confirm the smoke and heat alarm provision and interlinking within each flat (type, power ' +
      'source, and whether the alarms sound together). Detection cannot be fully assessed until this ' +
      'is known.',
    risk_basis:
      'The within-flat detection could not be confirmed from the answers given. LACORS / BS 5839-6 ' +
      'specify detection per dwelling on the basis of fire risk assessment.',
    regulatory_refs: ['LACORS §22', 'BS 5839-6'],
    confidence: 'unknown',
  },

  // =========================================================================
  // Doors
  // =========================================================================

  // §25.3 — suppressed for separate-private-entrance buildings; R-F01b is the
  // advisory counterpart for that configuration.
  {
    id: 'R-F01',
    title: v1('R-F01').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P2_high',
    applies_to: 'common_parts',
    condition: anyOf(
      rf('RF-DR-GF-CLOSER'),
      rf('RF-DR-UF-CLOSER'),
      rf('RF-DR-GF-CLOSER-FAULT'),
      rf('RF-DR-UF-CLOSER-FAULT')
    ),
    suppress_if: SEPARATE_ENTRANCE,
    text: v1('R-F01').text,
    risk_basis: v1('R-F01').risk_basis,
    regulatory_refs: v1('R-F01').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-F01b',
    title: v1('R-F01b').title,
    legal_status: 'advisory_good_practice',
    priority: 'P4_low',
    applies_to: 'building',
    condition: allOf(
      SEPARATE_ENTRANCE,
      anyOf(rf('RF-DR-GF-CLOSER'), rf('RF-DR-UF-CLOSER'), rf('RF-DR-GF-CLOSER-FAULT'), rf('RF-DR-UF-CLOSER-FAULT'))
    ),
    text: v1('R-F01b').text,
    risk_basis: v1('R-F01b').risk_basis,
    regulatory_refs: v1('R-F01b').regulatory_refs,
    confidence: 'probable',
  },

  // Re-points the v1 R-F02 condition (escape-window/sole-route adequacy) onto
  // RF-C01 plus unconfirmed door construction — the door-specific
  // investigation prompt that sits alongside R-C01's general route adequacy.
  {
    id: 'R-F02',
    title: v1('R-F02').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'upper_flat',
    condition: allOf(rf('RF-C01'), anyOf(rf('RF-DR-GF-CONSTR-UNK'), rf('RF-DR-UF-CONSTR-UNK'))),
    text: v1('R-F02').text,
    risk_basis: v1('R-F02').risk_basis,
    regulatory_refs: v1('R-F02').regulatory_refs,
    confidence: 'probable',
  },

  // Step 3 re-point: v1 condition referenced the removed `F3` question id
  // (see step3-question-schema-id-stability) — re-pointed to
  // door_gf_fit/door_uf_fit via RF-DR-*-FIT.
  {
    id: 'R-F03',
    title: v1('R-F03').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P2_high',
    applies_to: 'building',
    condition: anyOf(rf('RF-DR-GF-FIT'), rf('RF-DR-UF-FIT')),
    text: v1('R-F03').text,
    risk_basis: v1('R-F03').risk_basis,
    regulatory_refs: v1('R-F03').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-F05',
    title: v1('R-F05').title,
    legal_status: 'legal_requirement',
    priority: 'P1_urgent',
    applies_to: 'building',
    condition: rf('RF-DR-INTERNAL-KEY'),
    text: v1('R-F05').text,
    risk_basis: v1('R-F05').risk_basis,
    regulatory_refs: v1('R-F05').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-F06',
    title: v1('R-F06').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-DR-FINAL-CLOSER'), rf('RF-DR-FINAL-CLOSER-UNK')),
    text: v1('R-F06').text,
    risk_basis: v1('R-F06').risk_basis,
    regulatory_refs: v1('R-F06').regulatory_refs,
    confidence: 'probable',
  },

  // =========================================================================
  // Common parts / stair construction — Case Study D10 benchmark
  //
  // §22 — base legal_status is `lacors_benchmark_recommendation` (the D10
  // stair-enclosure benchmark); `downgrade_if` maps this to
  // `risk_based_recommendation` for purpose-built buildings
  // (case_study_d10 === 'not_applicable'), per §13.2 / Scenario A. The
  // underlying risk factors are already gated on a shared hall/stair by
  // riskEngine.ts, so no separate-entrance suppress_if is needed.
  // =========================================================================

  {
    id: 'R-D01-hardboard',
    title: v1('R-D01-hardboard').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P2_high',
    applies_to: 'common_parts',
    condition: rf('RF-D01'),
    text: v1('R-D01-hardboard').text,
    risk_basis: v1('R-D01-hardboard').risk_basis,
    regulatory_refs: v1('R-D01-hardboard').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-D01-9mm',
    title: v1('R-D01-9mm').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-D01B'),
    text: v1('R-D01-9mm').text,
    risk_basis: v1('R-D01-9mm').risk_basis,
    regulatory_refs: v1('R-D01-9mm').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-D01-unknown',
    title: v1('R-D01-unknown').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-D01-UNK'), rf('RF-D01-MIXED'), rf('RF-D01-OPEN')),
    text: v1('R-D01-unknown').text,
    risk_basis: v1('R-D01-unknown').risk_basis,
    regulatory_refs: v1('R-D01-unknown').regulatory_refs,
    confidence: 'unknown',
  },

  {
    id: 'R-D02',
    title: v1('R-D02').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-D02'),
    text: v1('R-D02').text,
    risk_basis: v1('R-D02').risk_basis,
    regulatory_refs: v1('R-D02').regulatory_refs,
    confidence: 'probable',
  },

  // Re-mapped from the v1 D7-driven half of R-D07 (the D2-driven half is
  // covered by R-D02 via RF-D02): unconfirmed soffit/floor-ceiling
  // construction is a further-investigation item, not a benchmark recommendation.
  {
    id: 'R-D07',
    title: v1('R-D07').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'common_parts',
    condition: rf('RF-D02-UNK'),
    text: v1('R-D07').text,
    risk_basis: v1('R-D07').risk_basis,
    regulatory_refs: v1('R-D07').regulatory_refs,
    confidence: 'unknown',
  },

  {
    id: 'R-D04',
    title: v1('R-D04').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-D04'),
    text: v1('R-D04').text,
    risk_basis: v1('R-D04').risk_basis,
    regulatory_refs: v1('R-D04').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-D05',
    title: v1('R-D05').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-D05'),
    text: v1('R-D05').text,
    risk_basis: v1('R-D05').risk_basis,
    regulatory_refs: v1('R-D05').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-D09',
    title: v1('R-D09').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-D03'),
    text: v1('R-D09').text,
    risk_basis: v1('R-D09').risk_basis,
    regulatory_refs: v1('R-D09').regulatory_refs,
    confidence: 'confirmed',
  },

  // =========================================================================
  // Stair compartmentation — docs/stair-enclusure.md R-S01-R-S03
  // §22 D10-suppression applies to R-S02 (the LACORS benchmark recommendation);
  // R-S01/R-S03 are investigation items regardless of building type.
  // =========================================================================

  {
    id: 'R-S01',
    title: v1('R-S01').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-S06'), rf('RF-S-INVESTIGATE')),
    text: v1('R-S01').text,
    risk_basis: v1('R-S01').risk_basis,
    regulatory_refs: v1('R-S01').regulatory_refs,
    confidence: 'unknown',
  },

  {
    id: 'R-S02',
    title: v1('R-S02').title,
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P2_high',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-S01'), rf('RF-S04'), rf('RF-S03')),
    text: v1('R-S02').text,
    risk_basis: v1('R-S02').risk_basis,
    regulatory_refs: v1('R-S02').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-S03',
    title: v1('R-S03').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'common_parts',
    condition: rf('RF-S05'),
    text: v1('R-S03').text,
    risk_basis: v1('R-S03').risk_basis,
    regulatory_refs: v1('R-S03').regulatory_refs,
    confidence: 'probable',
  },

  // =========================================================================
  // External escape route — docs/external-stairs.md §10.2
  // =========================================================================

  {
    id: 'R-B01',
    title: v1('R-B01').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'upper_flat',
    condition: rf('RF-ESC-VERIFY'),
    text: v1('R-B01').text,
    risk_basis: v1('R-B01').risk_basis,
    regulatory_refs: v1('R-B01').regulatory_refs,
    confidence: 'unknown',
  },

  {
    id: 'R-B02',
    title: v1('R-B02').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P2_high',
    applies_to: 'upper_flat',
    condition: rf('RF-ESC-RESTORE'),
    text: v1('R-B02').text,
    risk_basis: v1('R-B02').risk_basis,
    regulatory_refs: v1('R-B02').regulatory_refs,
    confidence: 'confirmed',
  },

  {
    id: 'R-B03',
    title: 'Confirm weather-safe external stair condition',
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'upper_flat',
    condition: anyOf(rf('RF-ESC-WEATHER'), rf('RF-ESC-WEATHER-UNK')),
    text:
      'Confirm that the external steel escape stair remains usable in wet weather, including ' +
      'slip-resistant treads, sound landings and handrails, drainage and general condition. Repair ' +
      'or maintain the route where those features are not adequate.',
    risk_basis:
      'An external escape stair only reduces escape-route risk if it can be safely used when needed. ' +
      'LACORS §18.2 highlights weather protection and safe condition for external stairs.',
    regulatory_refs: ['LACORS §18.2'],
    confidence: 'unknown',
  },

  // =========================================================================
  // Escape route adequacy / inner rooms
  // =========================================================================

  {
    id: 'R-C01',
    title: v1('R-C01').title,
    legal_status: 'risk_based_recommendation',
    priority: 'P2_high',
    applies_to: 'upper_flat',
    condition: rf('RF-C01'),
    text: v1('R-C01').text,
    risk_basis: v1('R-C01').risk_basis,
    regulatory_refs: v1('R-C01').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-GF-C01',
    title: 'No qualifying bedroom escape window and no rear exit for the ground-floor flat',
    legal_status: 'risk_based_recommendation',
    priority: 'P2_high',
    applies_to: 'ground_flat',
    condition: rf('RF-GF-C01'),
    text:
      'Review the ground-floor flat escape strategy. Where there is no rear exit and no qualifying ' +
      'bedroom escape window, the flat may rely on the shared/front route as the practical means of ' +
      'escape; upgrade the route, provide a qualifying alternative, or obtain competent-person advice.',
    risk_basis:
      'LACORS §14 escape-window criteria and §9 escape-route principles apply to each dwelling. ' +
      'A ground-floor rear exit suppresses this finding; without one, non-qualifying bedroom windows ' +
      'are a material escape-route risk.',
    regulatory_refs: ['LACORS §9', 'LACORS §14'],
    confidence: 'probable',
  },

  {
    id: 'R-C10',
    title: v1('R-C10').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'upper_flat',
    condition: rf('RF-C03'),
    text: v1('R-C10').text,
    risk_basis: v1('R-C10').risk_basis,
    regulatory_refs: v1('R-C10').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-GF-C10',
    title: 'Ground-floor bedroom inner-room condition requires review',
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'ground_flat',
    condition: anyOf(rf('RF-GF-C03'), rf('RF-GF-C03-UNK')),
    text:
      'Review the ground-floor flat layout for inner-room risk. A bedroom reached only through a ' +
      'habitable room may need a protected route, a qualifying escape window, altered layout, or ' +
      'competent-person confirmation that the existing arrangement is acceptable.',
    risk_basis:
      'LACORS §12 treats inner rooms as a material risk because a fire in the outer room can block ' +
      'escape before occupants in the inner room are aware of it.',
    regulatory_refs: ['LACORS §12', 'LACORS §14'],
    confidence: 'probable',
  },

  {
    id: 'R-LOFT',
    title: 'Confirm protected escape from the loft / upper level',
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P2_high',
    applies_to: 'upper_flat',
    condition: rf('RF-LOFT-ESCAPE'),
    text:
      'Provide or verify a protected internal escape route, or a separate secondary means of escape, ' +
      'for the loft / upper level of the upper flat. Rooms above about 4.5m should not be treated as ' +
      'adequately served by escape windows alone.',
    risk_basis:
      'A two-level upper flat or loft conversion can move the benchmark from Case Study D10 toward ' +
      'Case Study D11. LACORS §14 limits reliance on escape windows above 4.5m, and §17 addresses ' +
      'protected routes and alternative escape from higher-risk layouts.',
    regulatory_refs: ['LACORS §14', 'LACORS §17', 'LACORS Case Study D11'],
    confidence: 'probable',
  },

  {
    id: 'R-CONSERVATION',
    title: 'Plan fire-safety upgrades around listed-building / conservation constraints',
    legal_status: 'advisory_good_practice',
    priority: 'P4_low',
    applies_to: 'building',
    condition: allOf(
      { type: 'leaf', question_id: 'A6', in_values: ['yes'] },
      anyOf(
        rf('RF-C01'),
        rf('RF-GF-C01'),
        rf('RF-LOFT-ESCAPE'),
        rf('RF-DR-GF-CONSTR'),
        rf('RF-DR-UF-CONSTR'),
        rf('RF-DR-GF-FIT'),
        rf('RF-DR-UF-FIT'),
        rf('RF-S01'),
        rf('RF-S02'),
        rf('RF-S03'),
        rf('RF-S04'),
        rf('RF-S-LOWER')
      )
    ),
    text:
      'Because the building is listed or in a conservation area, specify fire-safety works in a way ' +
      'that preserves significance where possible: consider upgrade-in-situ, evidence-led repair, ' +
      'and compensatory detection before wholesale replacement. Listed-building consent or ' +
      'conservation planning advice may be required.',
    risk_basis:
      'Conservation status affects how works are designed and consented, not whether fire risk is ' +
      'ignored. LACORS recognises upgrade-in-situ and compensatory detection options for existing ' +
      'construction where replacement is not straightforward.',
    regulatory_refs: ['LACORS §19.6', 'LACORS §21.8'],
    confidence: 'confirmed',
  },

  // =========================================================================
  // Mixed staircase construction & under-stairs cupboards (LACORS Part A).
  // Text is inline (these rules are new in this pass, not reused from v1).
  // The D10-benchmark rules carry downgrade_if so they become
  // risk_based_recommendation for purpose-built buildings (case_study_d10 ===
  // 'not_applicable'); none are legal_requirement — a meter enclosure or
  // 30-minute separation upgrade is LACORS guidance, not statute.
  // =========================================================================

  {
    id: 'R-CUP01',
    title: 'Provide a fire-resisting enclosure to the under-stairs / meter cupboard',
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P2_high',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-CUP-METER'), rf('RF-CUP-ENCLOSURE'), rf('RF-CUP-CLOSER')),
    text:
      'Form the under-stairs cupboard opening onto the shared escape route as a fire-resisting ' +
      '(FD30) enclosure with a self-closing door. Where it houses a gas or electricity meter, LACORS ' +
      '§15.5 regards a fire-resisting enclosure as best practice (the meter may remain provided it is ' +
      'installed to the gas-safety / IEE regulations); otherwise obtain a competent-person review.',
    risk_basis:
      'A cupboard — especially a gas or electricity meter — opening onto the sole protected escape ' +
      'route is a potential ignition source within the route. LACORS §15.4 requires cupboards in ' +
      'protected routes to be fire-resisting and kept shut; §15.5 treats fire-resisting enclosure of ' +
      'meters as best practice.',
    regulatory_refs: ['LACORS §15.4', 'LACORS §15.5', 'LACORS §21.1'],
    confidence: 'confirmed',
  },
  {
    id: 'R-CUP02',
    title: 'Remove combustible storage from the under-stairs cupboard / escape route',
    legal_status: 'risk_based_recommendation',
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-CUP-COMBUST'),
    text:
      'Remove combustible materials stored in the under-stairs cupboard. A protected escape route ' +
      'should be kept free of storage and fuel load so a fire cannot start in, or be fed by, materials ' +
      'within the route.',
    risk_basis:
      'LACORS §15.3 requires protected routes to be kept free of storage and fire risks. Combustible ' +
      'materials in an under-stairs cupboard within the escape route add fuel load to the one route ' +
      'occupants depend on.',
    regulatory_refs: ['LACORS §15.3'],
    confidence: 'confirmed',
  },
  {
    id: 'R-CUP03',
    title: 'Fire-stop service penetrations around the cupboard / meters',
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-CUP-SEAL'),
    text:
      'Seal (fire-stop) the openings around pipes, cables and meter tails passing through the cupboard ' +
      'enclosure, using a product providing at least the same fire resistance as the surrounding ' +
      'construction.',
    risk_basis:
      'LACORS §19.7 requires openings around services passing through fire-resisting construction to be ' +
      'fire-stopped; otherwise smoke and fire bypass the enclosure.',
    regulatory_refs: ['LACORS §19.7'],
    confidence: 'confirmed',
  },
  {
    id: 'R-CUP04',
    title: 'Confirm the under-stairs cupboard construction and contents',
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-CUP-UNK'), rf('RF-CUP-SEAL-UNK'), rf('RF-CUP-CONTENTS-UNK')),
    text:
      'Confirm the fire resistance of the under-stairs cupboard door and enclosure, what it contains, ' +
      'and whether service penetrations are sealed. Do not assume adequacy until checked.',
    risk_basis:
      'The cupboard opens onto the protected escape route but its construction or contents have not ' +
      'been confirmed (LACORS §15.4). The finding cannot be resolved without inspection.',
    regulatory_refs: ['LACORS §15.4'],
    confidence: 'unknown',
  },
  {
    id: 'R-S04',
    title: 'Confirm or upgrade the lower / ground-floor section of the protected route',
    legal_status: 'lacors_benchmark_recommendation',
    downgrade_if: D10_NOT_APPLICABLE,
    priority: 'P3_medium',
    applies_to: 'common_parts',
    condition: rf('RF-S-LOWER'),
    text:
      'The lower / ground-floor section of the protected route is a lighter stud/plasterboard or ' +
      'lath-and-plaster construction. Confirm by inspection, or upgrade, so it provides 30-minute fire ' +
      'resistance continuous with the rest of the route. Mineral-wool insulation in the stud void can ' +
      'help but is not on its own proof of a 30-minute construction.',
    risk_basis:
      'LACORS §19.4 requires the protected route to be enclosed to 30-minute fire resistance at all ' +
      'points; a lighter lower section is a partial weakness separate from the upper stair walls. ' +
      '§19.3 — a fire-resistance rating depends on a complete tested construction, not on insulation alone.',
    regulatory_refs: ['LACORS §19.3', 'LACORS §19.4'],
    confidence: 'probable',
  },
  {
    id: 'R-S05',
    title: 'Inspect the lower-route construction and any masonry-to-stud transition',
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'common_parts',
    condition: anyOf(rf('RF-S-LOWER-UNK'), rf('RF-S-TRANSITION')),
    text:
      'Inspect the construction of the lower / ground-floor section of the protected route, and any ' +
      'point where the construction changes (for example masonry to stud/plasterboard), for continuity, ' +
      'gaps and fire-stopping. Determining the exact construction may require a concealed inspection ' +
      'opening or borescope rather than visual inspection alone.',
    risk_basis:
      'LACORS §19.6 notes the exact construction of an existing partition is difficult to determine ' +
      'without invasive inspection; §19.4/§19.7 require continuity and fire-stopping at junctions. This ' +
      'is an evidence gap to resolve, not grounds to replace construction by default.',
    regulatory_refs: ['LACORS §19.4', 'LACORS §19.6', 'LACORS §19.7'],
    confidence: 'unknown',
  },
]
