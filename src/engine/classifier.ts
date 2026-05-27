/**
 * classifier.ts — Layer 2: Classification and risk assessment engine.
 *
 * Takes the raw answer map (Layer 1 facts) and returns an enriched
 * Classification object that carries:
 *
 *   - Legal classification (Section 257 HMO or not)
 *   - Escape window assessment for each room
 *   - Inner room detection
 *   - Independent exit detection
 *   - Risk score and level across four dimensions
 *
 * This module is a pure function. No React, no DOM, no localStorage.
 * Same inputs always produce the same output.
 *
 * --- Layer model ---
 *   Layer 1 = answers (facts from user)     — input
 *   Layer 2 = classification + risk level   — THIS MODULE
 *   Layer 3 = remedies / report             — remedyEngine.ts, reportGenerator.ts
 */

import type {
  AnswerMap,
  AnswerValue,
  Classification,
  CommunalEntranceType,
  EscapeWindowAssessment,
  EscapeWindowStatus,
  RiskLevel,
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
// Risk factor register
// ---------------------------------------------------------------------------

/** Maps each risk factor ID to its dimension, for stacking-warning computation. */
export const RISK_FACTOR_DIMENSIONS: Record<
  string,
  'escape' | 'construction' | 'detection' | 'management'
> = {
  'RF-C01': 'escape',
  'RF-C02': 'escape',
  'RF-C03': 'escape',
  'RF-C04': 'escape',
  'RF-C05': 'escape',
  'RF-B01': 'escape',
  'RF-D01': 'construction',
  'RF-D01b': 'construction',
  'RF-D02': 'construction',
  'RF-D03': 'construction',
  'RF-D04': 'construction',
  'RF-D05': 'construction',
  'RF-D06': 'construction',
  'RF-E01': 'detection',
  'RF-E02': 'detection',
  'RF-E03': 'detection',
  'RF-E04': 'detection',
  'RF-E05': 'detection',
  'RF-H01': 'management',
  'RF-H02': 'management',
  'RF-H03': 'management',
  'RF-H04': 'management',
  'RF-S01': 'construction',
  'RF-S02': 'construction',
  'RF-S03': 'construction',
  'RF-S04': 'construction',
  'RF-S05': 'construction',
  'RF-S06': 'construction',
}

// ---------------------------------------------------------------------------
// Default / empty structures
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main classification function
// ---------------------------------------------------------------------------

export function classify(answers: AnswerMap): Classification {
  // Step 1: BLOCK_CLASS uncertainty on Section A questions
  const blocked = hasUncertaintyBehaviour('BLOCK_CLASS', answers, UNCERTAINTY_MAP)
  const unresolved_reasons: string[] = []
  if (blocked) {
    unresolved_reasons.push(
      'One or more key questions were answered as "not sure". ' +
        'Classification cannot be confirmed until these are resolved.'
    )
  }

  // Frequently used raw values
  const A1 = answers['A1']?.value
  const A2 = answers['A2']?.value
  const A3 = answers['A3']?.value
  const A4 = answers['A4']?.value
  const A5 = answers['A5']?.value
  const B1 = answers['B1']?.value
  const B2 = answers['B2']?.value

  const communalEntrance = deriveCommunalEntrance(B1)
  const separateEntranceMode = communalEntrance === 'false'
  const sharedEscapeRoute = deriveSharedEscapeRoute(answers, B1)

  // Step 2: Out-of-scope triggers → not-section-257 (with full risk scoring)
  // Note: A4='one_owner_occupied' is NO LONGER treated as out-of-scope.
  //   One owner-occupied flat in a two-flat building = 50% owner occupation,
  //   below the Schedule 14 two-thirds threshold. The property proceeds through
  //   criteria evaluation and may produce 'probable-section-257'.
  const outOfScope =
    A2 === 'no' ||
    A3 === '3_or_more' ||
    A3 === 'not_flats' ||
    A4 === 'social' ||
    A5 === 'no'

  if (outOfScope) {
    const escapeWindows = assessEscapeWindows(answers)
    const innerRoom = deriveInnerRoomPresent(answers)
    const upperFlatExit = deriveUpperFlatExit(B2)
    const upperIndependentEscapeType = deriveUpperIndependentEscapeType(B2)
    const upperExternalEscapeViable = deriveUpperExternalEscapeViable(answers, B2)
    const upperSharedRouteDependency = deriveUpperSharedRouteDependency(sharedEscapeRoute, upperFlatExit, upperExternalEscapeViable)
    const groundFloorEscape = deriveGroundFloorEscapeStrategy(answers)
    const upperFloorEscape = deriveUpperFloorEscapeStrategy(B2, escapeWindows)

    const { score, factors } = computeRiskFactors(answers, {
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      escape_windows: escapeWindows,
      inner_room_present: innerRoom,
      upper_flat_independent_exit: upperFlatExit,
      upper_external_escape_viable: upperExternalEscapeViable,
    })

    return {
      type: 'not-section-257',
      benchmark: 'not-applicable',
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      shared_escape_route: sharedEscapeRoute,
      upper_flat_independent_exit: upperFlatExit,
      upper_independent_escape_type: upperIndependentEscapeType,
      upper_external_escape_viable: upperExternalEscapeViable,
      upper_shared_route_dependency: upperSharedRouteDependency,
      inner_room_present: innerRoom,
      escape_windows: escapeWindows,
      confidence: 'confirmed',
      unresolved_reasons: [],
      risk_level: scoreToRiskLevel(score),
      risk_score: score,
      risk_factors_present: factors,
      stair_compartmentation_confidence: computeStairCompartmentationConfidence(answers, separateEntranceMode),
      stair_compartmentation_risk: computeStairCompartmentationRisk(factors, separateEntranceMode),
      ground_floor_escape_strategy: groundFloorEscape,
      upper_floor_escape_strategy: upperFloorEscape,
    }
  }

  // Step 3: Evaluate s257 criteria
  // null = unanswered, true = criterion met, false = criterion explicitly not met
  //
  // A4 special case: 'one_owner_occupied' represents 50% owner occupation — below the
  // Schedule 14 two-thirds threshold. The property is NOT automatically excluded from s257.
  // Treat 'one_owner_occupied' as criteria-met but flag for reduced confidence (Step 4).
  const oneOwnerOccupied = A4 === 'one_owner_occupied'

  const criteria: Array<[string, boolean | null]> = [
    ['A1 (converted dwelling)', A1 === 'converted' ? true : A1 !== undefined ? false : null],
    // A2 is only shown (and only meaningful) when A1='converted'.
    // If A1 is answered as anything other than 'converted', A2 is hidden by show_when
    // and will be undefined. Treating that undefined as null causes a false-positive
    // 'hasUnanswered' → 'unresolved'. Guard: when A1≠'converted', A2 criterion is false
    // (the building is already disqualified by A1), not null (unanswered).
    [
      'A2 (pre-1991 / non-compliant)',
      A1 !== 'converted'
        ? false
        : A2 === 'yes'
          ? true
          : A2 !== undefined
            ? false
            : null,
    ],
    ['A3 (exactly two flats)', A3 === '2' ? true : A3 !== undefined ? false : null],
    [
      'A4 (privately rented)',
      // 'none_owner_occupied' or 'one_owner_occupied' (50% — below Schedule 14 threshold) → true
      // 'social' was already handled as outOfScope above → never reaches here
      A4 === 'none_owner_occupied' || oneOwnerOccupied
        ? true
        : A4 !== undefined
          ? false
          : null,
    ],
    ['A5 (Richmond upon Thames)', A5 === 'yes' ? true : A5 !== undefined ? false : null],
  ]

  const hasUnanswered = criteria.some(([, v]) => v === null)

  // Derive escape windows and inner room for partial/full classification
  const escapeWindows = assessEscapeWindows(answers)
  const innerRoom = deriveInnerRoomPresent(answers)
  const upperFlatExit = deriveUpperFlatExit(B2)
  const upperIndependentEscapeType = deriveUpperIndependentEscapeType(B2)
  const upperExternalEscapeViable = deriveUpperExternalEscapeViable(answers, B2)
  const upperSharedRouteDependency = deriveUpperSharedRouteDependency(sharedEscapeRoute, upperFlatExit, upperExternalEscapeViable)

  // Step 3a: Some criteria questions not yet answered → unresolved.
  // Note: 'blocked' alone (BLOCK_CLASS uncertainty on a non-criteria question) does NOT
  // cause unresolved here — it degrades confidence to 'probable' at Step 4 instead.
  if (hasUnanswered) {
    return {
      type: 'unresolved',
      benchmark: 'unknown',
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      shared_escape_route: sharedEscapeRoute,
      upper_flat_independent_exit: upperFlatExit,
      upper_independent_escape_type: upperIndependentEscapeType,
      upper_external_escape_viable: upperExternalEscapeViable,
      upper_shared_route_dependency: upperSharedRouteDependency,
      inner_room_present: innerRoom,
      escape_windows: escapeWindows,
      confidence: 'unresolved',
      unresolved_reasons: ['Not all classification questions have been answered yet.'],
      risk_level: 'unresolved',
      risk_score: 0,
      risk_factors_present: [],
      stair_compartmentation_confidence: 'unknown',
      stair_compartmentation_risk: 'low',
      ground_floor_escape_strategy: deriveGroundFloorEscapeStrategy(answers),
      upper_floor_escape_strategy: deriveUpperFloorEscapeStrategy(B2, escapeWindows),
    }
  }

  // Step 3b: BLOCK_CLASS uncertainty on criteria questions that answered 'not_sure'
  // maps to criteria value = false (not true), so allMet below will be false.
  // BLOCK_CLASS on non-criteria questions (if any) triggers 'probable' at Step 4.
  if (blocked && unresolved_reasons.length > 0) {
    // At least one BLOCK_CLASS criteria question was answered 'not_sure' — treat as unresolved
    // because the criterion itself cannot be considered met.
    return {
      type: 'unresolved',
      benchmark: 'unknown',
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      shared_escape_route: sharedEscapeRoute,
      upper_flat_independent_exit: upperFlatExit,
      upper_independent_escape_type: upperIndependentEscapeType,
      upper_external_escape_viable: upperExternalEscapeViable,
      upper_shared_route_dependency: upperSharedRouteDependency,
      inner_room_present: innerRoom,
      escape_windows: escapeWindows,
      confidence: 'unresolved',
      unresolved_reasons,
      risk_level: 'unresolved',
      risk_score: 0,
      risk_factors_present: [],
      stair_compartmentation_confidence: 'unknown',
      stair_compartmentation_risk: 'low',
      ground_floor_escape_strategy: deriveGroundFloorEscapeStrategy(answers),
      upper_floor_escape_strategy: deriveUpperFloorEscapeStrategy(B2, escapeWindows),
    }
  }

  const allMet = criteria.every(([, v]) => v === true)

  if (!allMet) {
    // Criteria explicitly not met → not-section-257, but full risk scoring still applies.
    const { score, factors } = computeRiskFactors(answers, {
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      escape_windows: escapeWindows,
      inner_room_present: innerRoom,
      upper_flat_independent_exit: upperFlatExit,
      upper_external_escape_viable: upperExternalEscapeViable,
    })
    return {
      type: 'not-section-257',
      benchmark: 'not-applicable',
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      shared_escape_route: sharedEscapeRoute,
      upper_flat_independent_exit: upperFlatExit,
      upper_independent_escape_type: upperIndependentEscapeType,
      upper_external_escape_viable: upperExternalEscapeViable,
      upper_shared_route_dependency: upperSharedRouteDependency,
      inner_room_present: innerRoom,
      escape_windows: escapeWindows,
      confidence: 'confirmed',
      unresolved_reasons: [],
      risk_level: scoreToRiskLevel(score),
      risk_score: score,
      risk_factors_present: factors,
      stair_compartmentation_confidence: computeStairCompartmentationConfidence(answers, separateEntranceMode),
      stair_compartmentation_risk: computeStairCompartmentationRisk(factors, separateEntranceMode),
      ground_floor_escape_strategy: deriveGroundFloorEscapeStrategy(answers),
      upper_floor_escape_strategy: deriveUpperFloorEscapeStrategy(B2, escapeWindows),
    }
  }

  // Step 4: All s257 criteria met — compute risk.
  // Confidence is reduced when:
  //   - blocked=true (BLOCK_CLASS uncertainty on a non-criteria question), OR
  //   - oneOwnerOccupied=true (50% owner occupation — criteria met but confidence degraded
  //     because the full owner-occupation picture may affect regulatory treatment)
  const needsProbable = blocked || oneOwnerOccupied
  const classificationType = needsProbable ? 'probable-section-257' : 'section-257-hmo'
  const confidence = needsProbable ? 'probable' : 'confirmed'

  if (oneOwnerOccupied && !unresolved_reasons.some((r) => r.includes('owner'))) {
    unresolved_reasons.push(
      'One flat is owner-occupied. One owner-occupied flat in a two-flat building represents ' +
      '50% owner occupation — below the Schedule 14 two-thirds threshold — so the property ' +
      'is not automatically excluded from Section 257. However, the practical regulatory ' +
      'treatment may differ from a wholly privately rented building. This finding should be ' +
      'confirmed with Richmond Council or a qualified assessor.'
    )
  }

  const { score, factors } = computeRiskFactors(answers, {
    communal_entrance: communalEntrance,
    separate_entrance_mode: separateEntranceMode,
    escape_windows: escapeWindows,
    inner_room_present: innerRoom,
    upper_flat_independent_exit: upperFlatExit,
    upper_external_escape_viable: upperExternalEscapeViable,
  })

  return {
    type: classificationType,
    benchmark: 'D10',
    communal_entrance: communalEntrance,
    separate_entrance_mode: separateEntranceMode,
    shared_escape_route: sharedEscapeRoute,
    upper_flat_independent_exit: upperFlatExit,
    upper_independent_escape_type: upperIndependentEscapeType,
    upper_external_escape_viable: upperExternalEscapeViable,
    upper_shared_route_dependency: upperSharedRouteDependency,
    inner_room_present: innerRoom,
    escape_windows: escapeWindows,
    confidence,
    unresolved_reasons,
    risk_level: scoreToRiskLevel(score),
    risk_score: score,
    risk_factors_present: factors,
    stair_compartmentation_confidence: computeStairCompartmentationConfidence(answers, separateEntranceMode),
    stair_compartmentation_risk: computeStairCompartmentationRisk(factors, separateEntranceMode),
    ground_floor_escape_strategy: deriveGroundFloorEscapeStrategy(answers),
    upper_floor_escape_strategy: deriveUpperFloorEscapeStrategy(B2, escapeWindows),
  }
}

// ---------------------------------------------------------------------------
// Derived field helpers
// ---------------------------------------------------------------------------

function deriveCommunalEntrance(B1: AnswerValue): CommunalEntranceType {
  if (B1 === 'communal') return 'true'
  if (B1 === 'separate') return 'false'
  return 'unknown'
}

/**
 * Derives whether the shared entrance hall / staircase is used as an escape
 * route by more than one household (from F6a answer, or B1 for separate-entrance).
 */
function deriveSharedEscapeRoute(
  answers: AnswerMap,
  B1: AnswerValue
): Classification['shared_escape_route'] {
  if (B1 === 'separate') return 'no'
  if (B1 !== 'communal') return 'unknown'
  const F6a = answers['F6a']?.value
  if (F6a === 'yes') return 'yes'
  if (F6a === 'no') return 'no'
  return 'unknown'
}

function deriveUpperFlatExit(B2: AnswerValue): Classification['upper_flat_independent_exit'] {
  if (B2 === 'yes_external_steel_stair' || B2 === 'yes_rear_exit' || B2 === 'yes_other') return 'yes'
  if (B2 === 'no') return 'no'
  return 'unknown'
}

function deriveUpperIndependentEscapeType(B2: AnswerValue): Classification['upper_independent_escape_type'] {
  if (B2 === 'yes_external_steel_stair') return 'external_steel_stair'
  if (B2 === 'yes_rear_exit') return 'rear_exit'
  if (B2 === 'yes_other') return 'other'
  if (B2 === 'no') return 'none'
  return 'unknown'
}

function deriveUpperExternalEscapeViable(
  answers: AnswerMap,
  B2: AnswerValue
): Classification['upper_external_escape_viable'] {
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

function deriveUpperSharedRouteDependency(
  sharedEscapeRoute: Classification['shared_escape_route'],
  upperFlatIndependentExit: Classification['upper_flat_independent_exit'],
  upperExternalEscapeViable: Classification['upper_external_escape_viable']
): Classification['upper_shared_route_dependency'] {
  if (sharedEscapeRoute === 'no') return 'not_relied_on'
  if (upperFlatIndependentExit === 'no') return 'sole_route'
  if (upperFlatIndependentExit === 'yes' && upperExternalEscapeViable === 'yes') return 'secondary_route'
  if (upperFlatIndependentExit === 'yes') return 'primary_route'
  return 'unknown'
}

function deriveInnerRoomPresent(answers: AnswerMap): Classification['inner_room_present'] {
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
// Unit-aware escape strategy derivation (schema v1.2)
// ---------------------------------------------------------------------------

/**
 * Derives the ground-floor flat's primary escape strategy.
 *
 * Ground-floor occupants can exit via:
 *   1. A confirmed rear exit (B3='yes') — via_rear_exit
 *   2. The front door only (B3='no') — front_door_only
 *   3. Unknown (B3 not answered or 'not_sure') — unknown
 *
 * Note: For a communal-entrance building, "front door" is via the shared staircase.
 * For separate-entrance, it is the flat's own front door directly to the street.
 */
function deriveGroundFloorEscapeStrategy(
  answers: AnswerMap
): Classification['ground_floor_escape_strategy'] {
  const B3 = answers['B3']?.value
  if (B3 === 'yes') return 'via_rear_exit'
  if (B3 === 'no') return 'front_door_only'
  return 'unknown'
}

/**
 * Derives the upper flat's primary escape strategy.
 *
 * Upper-floor occupants can exit via:
 *   1. A confirmed independent rear exit (B2='yes') — via_rear_exit
 *   2. A qualifying bedroom escape window — via_window
 *   3. Front door / staircase only (no qualifying window, no rear exit) — front_door_only
 *   4. Unknown (B2 not answered, windows unknown) — unknown
 */
function deriveUpperFloorEscapeStrategy(
  B2: string | number | boolean | null | undefined,
  escapeWindows: EscapeWindowAssessment
): Classification['upper_floor_escape_strategy'] {
  if (B2 === 'yes_external_steel_stair' || B2 === 'yes_rear_exit' || B2 === 'yes_other') return 'via_rear_exit'
  const anyWindowQualifies =
    escapeWindows.bedroom_1 === 'qualifies' || escapeWindows.bedroom_2 === 'qualifies'
  if (anyWindowQualifies) return 'via_window'
  // Both windows unknown and no rear exit → genuinely unknown
  const anyWindowUnknown =
    escapeWindows.bedroom_1 === 'unknown' || escapeWindows.bedroom_2 === 'unknown'
  if (B2 === undefined && anyWindowUnknown) return 'unknown'
  // B2 is 'no' and no qualifying window → front door only
  if (B2 === 'no') return 'front_door_only'
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

function assessEscapeWindows(answers: AnswerMap): EscapeWindowAssessment {
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
// Risk scoring
// ---------------------------------------------------------------------------

interface DerivedEscapeContext {
  communal_entrance: CommunalEntranceType
  separate_entrance_mode: boolean
  escape_windows: EscapeWindowAssessment
  inner_room_present: 'yes' | 'no' | 'unknown'
  upper_flat_independent_exit: 'yes' | 'no' | 'unknown'
  upper_external_escape_viable: 'yes' | 'no' | 'unknown'
}

/**
 * Evaluates all risk factors and returns the total score and factor IDs present.
 *
 * Scores are additive across four dimensions: escape, construction, detection, management.
 * Construction factors are suppressed for separate-entrance properties (Section D is not asked).
 */
export function computeRiskFactors(
  answers: AnswerMap,
  derived: DerivedEscapeContext
): { score: number; factors: string[] } {
  const factors: string[] = []
  let score = 0
  const isCommunal = !derived.separate_entrance_mode

  function add(id: string, weight: number) {
    factors.push(id)
    score += weight
  }

  // -------------------------------------------------------------------------
  // ESCAPE dimension
  // -------------------------------------------------------------------------

  // RF-C01: No qualifying bedroom window AND no viable independent escape route.
  // Suppressed when a confirmed viable external escape route exists (reduces sole-route dependency).
  const bed1OK = derived.escape_windows.bedroom_1 === 'qualifies'
  const bed2OK = derived.escape_windows.bedroom_2 === 'qualifies'
  const anyBedQualifies = bed1OK || bed2OK
  const upperEscapeViable = derived.upper_external_escape_viable === 'yes'
  if (!anyBedQualifies && !upperEscapeViable) {
    add('RF-C01', 2)
  }

  // RF-C02: Living room or habitable room entered directly on arrival (no lobby)
  const C14 = answers['C14']?.value
  if (C14 === 'habitable_room') add('RF-C02', 1)

  // RF-C03: Inner room situation
  if (derived.inner_room_present === 'yes') add('RF-C03', 1)

  // RF-C04: Living room window unknown or does not qualify
  if (
    derived.escape_windows.living_room === 'does-not-qualify' ||
    derived.escape_windows.living_room === 'unknown'
  ) {
    add('RF-C04', 1)
  }

  // RF-C05: Mobility-impaired occupant
  const C12 = answers['C12']?.value
  if (C12 === 'yes') add('RF-C05', 2)

  // RF-B01: Travel distance from bedroom to exit
  const B8 = answers['B8']?.value
  if (B8 === 'not_sure' || B8 === 'medium') add('RF-B01', 1)
  else if (B8 === 'long') add('RF-B01', 2)

  // -------------------------------------------------------------------------
  // CONSTRUCTION dimension (communal entrance only — Section D not asked otherwise)
  // -------------------------------------------------------------------------
  if (isCommunal) {
    // RF-D01 / RF-D01b: Staircase panelling
    const D1 = answers['D1']?.value
    if (D1 === 'hardboard') {
      add('RF-D01', 2)
    } else if (D1 === 'unknown' || D1 === 'mixed' || D1 === 'open_bannisters') {
      add('RF-D01', 1)
    } else if (D1 === '9mm') {
      add('RF-D01b', 1)
    }

    // RF-D02: Exposed timber soffit OR exposed floor/ceiling joists between flats
    const D2 = answers['D2']?.value
    const D7 = answers['D7']?.value
    if (D2 === 'exposed_timber' || D7 === 'timber_exposed') add('RF-D02', 2)

    // RF-D03: Combustible/ignition items in communal area
    const D9 = answers['D9']?.value
    if (typeof D9 === 'string' && D9) {
      try {
        const items = JSON.parse(D9) as string[]
        if (Array.isArray(items)) {
          const harmful = items.filter((i) => i !== 'none' && i !== 'not_sure')
          if (harmful.length >= 2) add('RF-D03', 2)
          else if (harmful.length === 1) add('RF-D03', 1)
        }
      } catch {
        // malformed JSON — skip
      }
    }

    // RF-D04: Visible penetrations through staircase enclosure
    const D4 = answers['D4']?.value
    if (D4 === 'yes') add('RF-D04', 1)

    // RF-D05: Unenclosed cupboard / meter box in communal staircase
    const D5 = answers['D5']?.value
    if (D5 === 'yes_no_fire_door') add('RF-D05', 1)

    // RF-D06: Poor overall staircase condition
    const D6 = answers['D6']?.value
    if (D6 === 'poor') add('RF-D06', 2)

    // -------------------------------------------------------------------------
    // Stair compartmentation sub-model (D10–D18)
    // -------------------------------------------------------------------------

    // RF-S01: Timber panelling — negligible fire resistance
    const D10 = answers['D10']?.value
    if (D10 === 'timber_panelling') add('RF-S01', 3)

    // RF-S02: Under 9.5mm board — below minimum effective thickness
    const D12 = answers['D12']?.value
    if (D12 === 'under_9_5') add('RF-S02', 2)

    // RF-S03: Unsealed penetrations through the enclosure
    const D15 = answers['D15']?.value
    if (D15 === 'unsealed') add('RF-S03', 2)

    // RF-S04: Enclosure not continuous — significant gaps or breaks
    const D16 = answers['D16']?.value
    if (D16 === 'no') add('RF-S04', 3)

    // RF-S05: Hidden voids suspected — potential concealed fire path
    const D17 = answers['D17']?.value
    if (D17 === 'yes') add('RF-S05', 2)

    // RF-S06: 1950–1970 conversion inspected visually only — age + uncertainty
    const D11 = answers['D11']?.value
    const D14 = answers['D14']?.value
    if (D11 === '1950_1970' && D14 === 'visual_only') add('RF-S06', 1)
  }

  // -------------------------------------------------------------------------
  // DETECTION dimension
  // -------------------------------------------------------------------------
  const E1 = answers['E1']?.value

  if (E1 === 'none') {
    add('RF-E04', 3)
  } else if (E1 === 'battery_only') {
    add('RF-E01', 2)
  } else if (E1 === 'mixed') {
    add('RF-E01', 1)
  }

  if (isCommunal) {
    const E4 = answers['E4']?.value
    if (E4 !== undefined && E4 !== 'yes_mains') add('RF-E02', 2)

    const E5 = answers['E5']?.value
    if (E5 !== undefined && E5 !== 'yes_both') add('RF-E03', 1)
  }

  const E7 = answers['E7']?.value
  if (E7 === 'over_year' || E7 === 'never_unknown') add('RF-E05', 1)

  // -------------------------------------------------------------------------
  // MANAGEMENT dimension
  // -------------------------------------------------------------------------
  const H1 = answers['H1']?.value
  if (H1 === 'no') add('RF-H01', 2)
  else if (H1 === 'mostly') add('RF-H01', 1)

  const H2 = answers['H2']?.value
  if (H2 === 'no') add('RF-H02', 1)

  const H3 = answers['H3']?.value
  if (H3 === 'no') add('RF-H03', 1)

  const H4 = answers['H4']?.value
  if (H4 === 'none') add('RF-H04', 3)
  else if (H4 === 'minimal') add('RF-H04', 2)
  else if (H4 === 'passive') add('RF-H04', 1)

  return { score, factors }
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score <= 2) return 'low'
  if (score <= 5) return 'normal'
  if (score <= 9) return 'elevated'
  return 'high'
}

// ---------------------------------------------------------------------------
// Stair compartmentation derived fields
// ---------------------------------------------------------------------------

/**
 * Derives compartmentation confidence from observable evidence (D10–D17).
 * Evaluated high → moderate → low → unknown in order.
 */
function computeStairCompartmentationConfidence(
  answers: AnswerMap,
  separateEntranceMode: boolean
): Classification['stair_compartmentation_confidence'] {
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

/**
 * Derives stair-specific risk level from the RF-S sub-score (sum of triggered
 * RF-S01–RF-S06 weights within the overall risk factors list).
 */
function computeStairCompartmentationRisk(
  factors: string[],
  separateEntranceMode: boolean
): Classification['stair_compartmentation_risk'] {
  if (separateEntranceMode) return 'low'

  const S_WEIGHTS: Record<string, number> = {
    'RF-S01': 3,
    'RF-S02': 2,
    'RF-S03': 2,
    'RF-S04': 3,
    'RF-S05': 2,
    'RF-S06': 1,
  }
  const sScore = factors.reduce((acc, id) => acc + (S_WEIGHTS[id] ?? 0), 0)
  if (sScore === 0) return 'low'
  if (sScore <= 2) return 'normal'
  if (sScore <= 5) return 'elevated'
  return 'high'
}
