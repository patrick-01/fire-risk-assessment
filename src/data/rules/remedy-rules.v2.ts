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

export const RULES_VERSION_V2 = '2026-06-v1' as const
export const RULES_DATE_V2 = '2026-06-12' as const

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
    condition: rf('RF-DET-NONE'),
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
    condition: anyOf(rf('RF-DET-BATTERY'), rf('RF-DET-MIXED'), rf('RF-DET-TYPE-UNK')),
    text: v1('R-E01').text,
    risk_basis: v1('R-E01').risk_basis,
    regulatory_refs: v1('R-E01').regulatory_refs,
    confidence: 'probable',
  },

  {
    id: 'R-E02',
    title: v1('R-E02').title,
    legal_status: 'risk_based_recommendation',
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
    legal_status: 'risk_based_recommendation',
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
    condition: anyOf(rf('RF-DET-LINK'), rf('RF-DET-LINK-UNK')),
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
    id: 'R-C10',
    title: v1('R-C10').title,
    legal_status: 'further_investigation_required',
    priority: 'investigate',
    applies_to: 'ground_flat',
    condition: rf('RF-C03'),
    text: v1('R-C10').text,
    risk_basis: v1('R-C10').risk_basis,
    regulatory_refs: v1('R-C10').regulatory_refs,
    confidence: 'probable',
  },
]
