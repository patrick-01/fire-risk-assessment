/**
 * classifier.ts — Layer 2: building classification + shared evidence helpers.
 *
 * Two responsibilities, both pure functions (no React, no DOM, no localStorage):
 *
 *   - classify(answers)         -> BuildingClassification (origin / HMO /
 *                                  Section-257 / Case Study D10 vs general LACORS
 *                                  guidance / entrance configuration)
 *   - deriveLegalFramework(...) -> LegalFrameworkAssessment (which statutory
 *                                  regimes apply, and how LACORS is used)
 *
 * It also exports the evidence-derivation helpers consumed by the risk engine
 * (riskEngine.ts): assessEscapeWindows, deriveInnerRoomPresent,
 * deriveUpperExternalEscapeViable, computeStairCompartmentationConfidence.
 *
 * Risk is computed separately in riskEngine.ts and keys off evidence only —
 * building type selects the legal framework, evidence determines the risk.
 */

import type {
  AnswerMap,
  AnswerValue,
  BuildingClassification,
  BuildingOrigin,
  EntranceConfiguration,
  EscapeWindowAssessment,
  EscapeWindowStatus,
  HmoClassification,
  LegalFrameworkAssessment,
} from '../state/AppState'
import { QUESTION_MAP } from '../data/schema/questions'
import { hasUncertaintyBehaviour } from './uncertainty'
import type { UncertaintyBehaviour } from '../data/schema/questions'

// ---------------------------------------------------------------------------
// Uncertainty map (BLOCK_CLASS questions affect classification confidence)
// ---------------------------------------------------------------------------

const UNCERTAINTY_MAP: Record<string, UncertaintyBehaviour> = Object.fromEntries(
  Object.entries(QUESTION_MAP)
    .filter(([, q]) => q.uncertainty_behaviour)
    .map(([id, q]) => [id, q.uncertainty_behaviour!])
)

// ---------------------------------------------------------------------------
// Derived field helpers
// ---------------------------------------------------------------------------

export function deriveUpperExternalEscapeViable(
  answers: AnswerMap,
  B2: AnswerValue
): 'yes' | 'no' | 'unknown' {
  if (!B2 || B2 === 'no') return 'no'
  if (B2 === 'unknown') return 'unknown'
  // B2 is a yes_* value — check follow-up answers for actual viability
  const B2a = answers['B2a']?.value
  const B2c = answers['B2c']?.value
  // Explicitly not viable
  if (B2a === 'no_obstructed' || B2a === 'no_locked_or_unavailable') return 'no'
  if (B2c === 'poor_condition') return 'no'
  // Viable when usability confirmed and condition is acceptable
  if (B2a === 'yes' && (B2c === 'yes' || B2c === 'minor_defects' || B2c === undefined || B2c === null)) return 'yes'
  return 'unknown'
}

export function deriveInnerRoomPresent(answers: AnswerMap): 'yes' | 'no' | 'unknown' {
  const C10 = answers['C10']?.value
  const C13 = answers['C13']?.value
  // C10 = 'yes' means at least one bedroom is an inner room
  // C13 = 'no' means bedroom 1 is only accessible through a habitable room
  if (C10 === 'yes' || C13 === 'no') return 'yes'
  if (C10 === 'no' && C13 !== undefined && C13 !== 'not_sure') return 'no'
  if (C10 === 'not_sure' || C13 === 'not_sure') return 'unknown'
  if (C10 === 'no') return 'no'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Escape window assessment
// ---------------------------------------------------------------------------

interface WindowQuestions {
  has_window: string    // question: does room have openable window?
  no_key: string       // question: openable without key?
  sill_ok: string      // question: sill ≤ 1100mm?
  size_ok: string      // question: clear area ≥ 0.33m²?
  no_obstruction: string // question: no external obstruction?
}

/**
 * Assesses whether a window meets the LACORS §14 escape window criteria.
 * ALL of the following must be confirmed:
 *   - window is openable
 *   - no key needed
 *   - sill ≤ 1100mm
 *   - clear area ≥ 0.33m²
 *   - no external obstruction
 *   - floor ≤ 4.5m (from B4)
 *   - occupants are able-bodied (from C12)
 *
 * Any uncertain answer → 'unknown' (conservative — does not qualify).
 * Any explicit failure → 'does-not-qualify'.
 */
function assessSingleWindow(
  answers: AnswerMap,
  questions: WindowQuestions,
  floorHeightOk: boolean | null,
  ableBodyied: boolean | null,
  windowTypeQuestionId?: string
): EscapeWindowStatus {
  const hasWindow = answers[questions.has_window]?.value
  if (!hasWindow) return 'unknown'
  if (hasWindow === 'no') return 'does-not-qualify'
  if (hasWindow === 'not_sure') return 'unknown'

  let hasUnknown = false

  // C1_type: a top-hung-only window may not allow a person to climb through even if
  // the nominal opening area passes. Treat as unknown pending professional verification.
  if (windowTypeQuestionId) {
    const windowType = answers[windowTypeQuestionId]?.value
    if (windowType === 'top_hung_only') hasUnknown = true
  }

  // Check: no key required
  const noKey = answers[questions.no_key]?.value
  if (!noKey || noKey === 'not_sure') hasUnknown = true
  else if (noKey === 'no') return 'does-not-qualify'

  // Check: sill height
  const sillOk = answers[questions.sill_ok]?.value
  if (!sillOk || sillOk === 'not_sure') hasUnknown = true
  else if (sillOk === 'no') return 'does-not-qualify'

  // Check: clear area
  const sizeOk = answers[questions.size_ok]?.value
  if (!sizeOk || sizeOk === 'not_sure') hasUnknown = true
  else if (sizeOk === 'no') return 'does-not-qualify'

  // Check: no obstruction (note: question answer 'yes' = obstruction present = fail)
  const noObstruction = answers[questions.no_obstruction]?.value
  if (!noObstruction || noObstruction === 'not_sure') hasUnknown = true
  else if (noObstruction === 'yes') return 'does-not-qualify'

  // Check: floor height ≤ 4.5m (from B4)
  if (floorHeightOk === false) return 'does-not-qualify'
  if (floorHeightOk === null) hasUnknown = true

  // Check: able-bodied occupants (from C12)
  // C12='yes' means mobility-impaired → cannot rely on window for escape
  if (ableBodyied === false) return 'does-not-qualify'
  if (ableBodyied === null) hasUnknown = true

  return hasUnknown ? 'unknown' : 'qualifies'
}

export function assessEscapeWindows(answers: AnswerMap): EscapeWindowAssessment {
  const B4 = answers['B4']?.value
  const floorHeightOk: boolean | null =
    B4 === '2.5_4m' ? true : B4 === 'above_4.5m' ? false : null

  const C12 = answers['C12']?.value
  // ableBodyied = true means no mobility impairment, false means impaired
  const ableBodyied: boolean | null =
    C12 === 'no' ? true : C12 === 'yes' ? false : null

  const bedroom1 = assessSingleWindow(
    answers,
    { has_window: 'C1', no_key: 'C2', sill_ok: 'C3', size_ok: 'C4', no_obstruction: 'C5' },
    floorHeightOk,
    ableBodyied,
    'C1_type'
  )

  // Bedroom 2 — only applicable if C6 = 'yes' (second bedroom exists)
  const C6 = answers['C6']?.value
  let bedroom2: EscapeWindowStatus = 'not-applicable'
  if (C6 === 'yes') {
    bedroom2 = assessSingleWindow(
      answers,
      {
        has_window: 'C7',
        no_key: 'C9a',
        sill_ok: 'C9b',
        size_ok: 'C9c',
        no_obstruction: 'C9d',
      },
      floorHeightOk,
      ableBodyied
    )
  } else if (C6 === undefined || C6 === null) {
    bedroom2 = 'unknown'
  }

  const livingRoom = assessSingleWindow(
    answers,
    { has_window: 'C11', no_key: 'C11a', sill_ok: 'C11b', size_ok: 'C11c', no_obstruction: 'C11d' },
    floorHeightOk,
    ableBodyied
  )

  return { bedroom_1: bedroom1, bedroom_2: bedroom2, living_room: livingRoom }
}

// ---------------------------------------------------------------------------
// Stair compartmentation derived fields
// ---------------------------------------------------------------------------

/**
 * Derives compartmentation confidence from observable evidence (D10–D17).
 * Evaluated high → moderate → low → unknown in order.
 */
export function computeStairCompartmentationConfidence(
  answers: AnswerMap,
  separateEntranceMode: boolean
): 'high' | 'moderate' | 'low' | 'unknown' {
  if (separateEntranceMode) return 'unknown'

  const D10 = answers['D10']?.value
  const D11 = answers['D11']?.value
  const D12 = answers['D12']?.value
  const D13 = answers['D13']?.value
  const D14 = answers['D14']?.value
  const D15 = answers['D15']?.value
  const D16 = answers['D16']?.value
  const D17 = answers['D17']?.value

  if (!D10 || D10 === 'unknown') return 'unknown'

  // High: masonry or confirmed 12.5mm+ fire-resistant board, intrusive inspection,
  // no unsealed penetrations, continuous, no hidden voids
  if (
    (D10 === 'masonry' || D10 === 'plasterboard') &&
    D14 !== undefined && (D14 === 'inspection_opening' || D14 === 'intrusive_confirmed') &&
    (D12 === '12_5' || D12 === 'double_layer' || D10 === 'masonry') &&
    (D13 === 'fire_resistant' || D10 === 'masonry') &&
    (D15 === 'none' || D15 === 'sealed') &&
    D16 === 'yes' &&
    D17 === 'no'
  ) {
    return 'high'
  }

  // Low: any of the strong negative indicators
  if (
    D10 === 'timber_panelling' ||
    D12 === 'under_9_5' ||
    D14 === 'visual_only' ||
    D15 === 'unsealed' ||
    D16 === 'no' ||
    D17 === 'yes' ||
    // Pre-1991 with low inspection confidence
    ((D11 === 'pre_1950' || D11 === '1950_1970') && D14 === 'visual_only')
  ) {
    return 'low'
  }

  // Moderate: adequate material, some inspection evidence, no major defects
  if (
    (D10 === 'masonry' || D10 === 'plasterboard' || D10 === 'lath_plaster') &&
    D14 !== undefined && D14 !== 'visual_only' &&
    D12 !== 'under_9_5' && D12 !== 'unknown' &&
    (D15 === 'none' || D15 === 'sealed' || D15 === undefined) &&
    D16 === 'yes'
  ) {
    return 'moderate'
  }

  return 'unknown'
}

// ===========================================================================
// FireRegs v2 classification engine (docs/2-Classification-and-Legal-Framework)
//
// Separates "what kind of building is this" (BuildingClassification) from
// "what statutory duties apply" (LegalFrameworkAssessment). Both are pure
// functions of the answer map. The §6.2 HMO truth table is enforced here:
//   - two flats alone NEVER imply Section 257;
//   - purpose-built  ⇒ not_hmo, section_257 = false, D10 not_applicable, but
//                       general LACORS risk guidance stays applicable (§6.3);
//   - converted      ⇒ at least probable_section_257_hmo where the pre-1991 /
//                       owner-occupation facts support it.
//
// Answer-ID note: derived from the current Section-A/B questions.ts. The
// question schema is itself refactored in Step 3; these IDs are re-confirmed
// there. (See docs Step 2 Notes.)
// ===========================================================================

/** Maps the Section-A1 construction answer to the v2 building origin. */
function deriveBuildingOrigin(A1: AnswerValue): BuildingOrigin {
  if (A1 === 'purpose-built') return 'purpose_built_two_flats'
  if (A1 === 'converted') return 'converted_from_single_house'
  return 'unknown'
}

/**
 * Derives entrance configuration from B1 (replaces v1 communal_entrance +
 * separate_entrance_mode).
 *
 * The supported portfolio is one-flat-per-floor, so a communal building has a
 * shared hall with a stair serving the UPPER FLAT ONLY (§8.2) — that is
 * `shared_entrance_hall`, not a communal stair serving multiple dwellings.
 * `shared_hall_and_shared_stair` is reserved for a stair serving multiple
 * dwellings (3+ flats — outside v2 core scope); the Step 3 question schema may
 * add a discriminating question. No current answer distinguishes it.
 */
function deriveEntranceConfiguration(B1: AnswerValue): EntranceConfiguration {
  if (B1 === 'separate') return 'separate_private_entrances'
  if (B1 === 'communal') return 'shared_entrance_hall'
  return 'unknown'
}

/** Common parts exist iff the building has a shared (communal) entrance. */
function deriveFsoCommonParts(B1: AnswerValue): boolean | 'unknown' {
  if (B1 === 'communal') return true
  if (B1 === 'separate') return false
  return 'unknown'
}

/**
 * §6 — derives the building classification from the answer map.
 *
 * Mirrors the legacy Section-257 criteria evaluation (so the two stay
 * consistent during the transition) but emits the v2 `BuildingClassification`
 * shape, keeping the D10/Section-257 benchmark distinct from the general LACORS
 * risk guidance.
 */
export function classify(answers: AnswerMap): BuildingClassification {
  const A1 = answers['A1']?.value
  const A2 = answers['A2']?.value
  const A3 = answers['A3']?.value
  const A4 = answers['A4']?.value
  const A5 = answers['A5']?.value
  const B1 = answers['B1']?.value

  const origin = deriveBuildingOrigin(A1)
  const entrance_configuration = deriveEntranceConfiguration(B1)
  const fso_common_parts = deriveFsoCommonParts(B1)

  // Shared fields for every outcome. General LACORS risk guidance is always
  // applicable across the portfolio (§2.1) — it is never switched off merely
  // because a building is not a Section 257 HMO.
  const base = {
    origin,
    entrance_configuration,
    fso_common_parts,
    general_lacors_risk_guidance: 'applicable' as const,
  }

  function build(
    hmo: HmoClassification,
    confidence: BuildingClassification['confidence'],
    case_study_d10: BuildingClassification['case_study_d10'],
    unresolved_reasons: string[]
  ): BuildingClassification {
    return {
      ...base,
      hmo,
      section_257: hmo === 'section_257_hmo',
      case_study_d10,
      confidence,
      unresolved_reasons,
    }
  }

  const blocked = hasUncertaintyBehaviour('BLOCK_CLASS', answers, UNCERTAINTY_MAP)

  // ---- Definitely NOT a Section 257 HMO -----------------------------------
  // Purpose-built (two flats never imply 257), post-1991 compliant conversion,
  // 3+ flats / not flats (out of 2-flat scope), social landlord, or outside
  // Richmond. D10 / Case Study D10 is a Section-257 benchmark, so it is not
  // applicable in any of these cases — but general LACORS guidance still is.
  const notHmo =
    A1 === 'purpose-built' ||
    A2 === 'no' ||
    A3 === '3_or_more' ||
    A3 === 'not_flats' ||
    A4 === 'social' ||
    A5 === 'no'

  if (notHmo) {
    return build('not_hmo', 'confirmed', 'not_applicable', [])
  }

  // ---- Section 257 criteria (converted-flat candidates) -------------------
  // null = unanswered, true = met, false = explicitly not met. Mirrors the v1
  // criteria, including the A2 guard (hidden when A1 ≠ converted) and the
  // 50%-owner-occupation (one_owner_occupied) handling.
  const oneOwnerOccupied = A4 === 'one_owner_occupied'

  const criteria: Array<boolean | null> = [
    A1 === 'converted' ? true : A1 !== undefined ? false : null,
    A1 !== 'converted'
      ? false
      : A2 === 'yes'
        ? true
        : A2 !== undefined
          ? false
          : null,
    A3 === '2' ? true : A3 !== undefined ? false : null,
    A4 === 'none_owner_occupied' || oneOwnerOccupied
      ? true
      : A4 !== undefined
        ? false
        : null,
    A5 === 'yes' ? true : A5 !== undefined ? false : null,
  ]

  const hasUnanswered = criteria.some((v) => v === null)

  // Not all criteria answered, or a BLOCK_CLASS criterion answered "not sure":
  // classification cannot yet be resolved.
  if (hasUnanswered || blocked) {
    return build('unresolved', 'unresolved', 'unknown', [
      blocked
        ? 'One or more key questions were answered as "not sure". ' +
          'Classification cannot be confirmed until these are resolved.'
        : 'Not all classification questions have been answered yet.',
    ])
  }

  const allMet = criteria.every((v) => v === true)

  if (!allMet) {
    // Criteria explicitly not met → not a Section 257 HMO.
    return build('not_hmo', 'confirmed', 'not_applicable', [])
  }

  // ---- All criteria met ---------------------------------------------------
  // 50% owner occupation keeps the building in scope (below the Schedule 14
  // two-thirds threshold) but reduces confidence → probable_section_257_hmo.
  const unresolved_reasons: string[] = []
  if (oneOwnerOccupied) {
    unresolved_reasons.push(
      'One flat is owner-occupied. One owner-occupied flat in a two-flat building ' +
        'represents 50% owner occupation — below the Schedule 14 two-thirds threshold ' +
        '— so the property is not automatically excluded from Section 257. The practical ' +
        'regulatory treatment may differ from a wholly privately rented building; confirm ' +
        'with Richmond Council or a qualified assessor.'
    )
  }

  const hmo: HmoClassification = oneOwnerOccupied
    ? 'probable_section_257_hmo'
    : 'section_257_hmo'
  const confidence: BuildingClassification['confidence'] = oneOwnerOccupied
    ? 'probable'
    : 'confirmed'

  return build(hmo, confidence, 'applicable', unresolved_reasons)
}

/**
 * §7 — derives the applicable statutory framework from the answer map and the
 * building classification.
 *
 * Electrical safety and HHSRS fire-hazard duties always apply to rented
 * residential property; the remaining duties are derived from facts. This is a
 * statement of WHICH regimes apply, not of compliance.
 */
export function deriveLegalFramework(
  answers: AnswerMap,
  classification: BuildingClassification
): LegalFrameworkAssessment {
  const A4 = answers['A4']?.value
  const G1 = answers['G1']?.value

  // Smoke & CO alarm regs apply to rented residential premises. Every A4 option
  // (privately rented / one owner-occupied / social) involves a rented flat.
  const smoke_co_alarm_regulations: LegalFrameworkAssessment['smoke_co_alarm_regulations'] =
    A4 !== undefined ? 'applies' : 'unknown'

  // Annual gas safety check applies where gas appliances are provided (G1).
  const gas_safety: LegalFrameworkAssessment['gas_safety'] =
    G1 === 'within_12_months' || G1 === 'overdue'
      ? 'applies'
      : G1 === 'no_gas'
        ? 'not_applicable'
        : 'unknown'

  // FSO common-parts duty bites iff common parts exist.
  const fire_safety_order_common_parts: LegalFrameworkAssessment['fire_safety_order_common_parts'] =
    classification.fso_common_parts === true
      ? 'applies'
      : classification.fso_common_parts === false
        ? 'not_applicable'
        : 'unknown'

  // Section 257 HMO regime: applies when confirmed; uncertain while probable or
  // unresolved; not applicable once the building is determined not to be one.
  const section_257_hmo: LegalFrameworkAssessment['section_257_hmo'] =
    classification.hmo === 'section_257_hmo'
      ? 'applies'
      : classification.hmo === 'not_hmo'
        ? 'not_applicable'
        : 'unknown'

  // LACORS is a direct benchmark for converted / Section-257 cases, and a risk
  // reference elsewhere; unknown only while origin and HMO status are unresolved.
  const lacors_guidance_use: LegalFrameworkAssessment['lacors_guidance_use'] =
    classification.origin === 'converted_from_single_house' ||
    classification.hmo === 'section_257_hmo' ||
    classification.hmo === 'probable_section_257_hmo'
      ? 'direct_benchmark'
      : classification.origin === 'unknown' && classification.hmo === 'unresolved'
        ? 'unknown'
        : 'risk_reference'

  return {
    smoke_co_alarm_regulations,
    gas_safety,
    electrical_safety: 'applies',
    hhsrs_fire_hazard: 'applies',
    fire_safety_order_common_parts,
    section_257_hmo,
    lacors_guidance_use,
  }
}
