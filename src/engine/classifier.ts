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
}

// ---------------------------------------------------------------------------
// Default / empty structures
// ---------------------------------------------------------------------------

const DEFAULT_ESCAPE_WINDOWS: EscapeWindowAssessment = {
  bedroom_1: 'unknown',
  bedroom_2: 'unknown',
  living_room: 'unknown',
}

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

  // Step 2: Out-of-scope triggers → not-section-257 (no further scoring)
  const outOfScope =
    A2 === 'no' ||
    A3 === '3_or_more' ||
    A3 === 'not_flats' ||
    A4 === 'one_owner_occupied' ||
    A4 === 'social' ||
    A5 === 'no'

  if (outOfScope) {
    return {
      type: 'not-section-257',
      benchmark: 'not-applicable',
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      upper_flat_independent_exit: 'unknown',
      inner_room_present: 'unknown',
      escape_windows: DEFAULT_ESCAPE_WINDOWS,
      confidence: 'confirmed',
      unresolved_reasons: [],
      risk_level: 'unresolved',
      risk_score: 0,
      risk_factors_present: [],
    }
  }

  // Step 3: Evaluate s257 criteria
  // null = unanswered, true = criterion met, false = criterion explicitly not met
  const criteria: Array<[string, boolean | null]> = [
    ['A1 (converted dwelling)', A1 === 'converted' ? true : A1 !== undefined ? false : null],
    ['A2 (pre-1991 / non-compliant)', A2 === 'yes' ? true : A2 !== undefined ? false : null],
    ['A3 (exactly two flats)', A3 === '2' ? true : A3 !== undefined ? false : null],
    [
      'A4 (both privately rented)',
      A4 === 'none_owner_occupied' ? true : A4 !== undefined ? false : null,
    ],
    ['A5 (Richmond upon Thames)', A5 === 'yes' ? true : A5 !== undefined ? false : null],
  ]

  const hasUnanswered = criteria.some(([, v]) => v === null)

  // Derive escape windows and inner room for partial/full classification
  const escapeWindows = assessEscapeWindows(answers)
  const innerRoom = deriveInnerRoomPresent(answers)
  const upperFlatExit = deriveUpperFlatExit(B2)

  // Step 3a: Some criteria questions not yet answered → unresolved.
  // Note: 'blocked' alone (BLOCK_CLASS uncertainty on a non-criteria question) does NOT
  // cause unresolved here — it degrades confidence to 'probable' at Step 4 instead.
  if (hasUnanswered) {
    return {
      type: 'unresolved',
      benchmark: 'unknown',
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      upper_flat_independent_exit: upperFlatExit,
      inner_room_present: innerRoom,
      escape_windows: escapeWindows,
      confidence: 'unresolved',
      unresolved_reasons: ['Not all classification questions have been answered yet.'],
      risk_level: 'unresolved',
      risk_score: 0,
      risk_factors_present: [],
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
      upper_flat_independent_exit: upperFlatExit,
      inner_room_present: innerRoom,
      escape_windows: escapeWindows,
      confidence: 'unresolved',
      unresolved_reasons,
      risk_level: 'unresolved',
      risk_score: 0,
      risk_factors_present: [],
    }
  }

  const allMet = criteria.every(([, v]) => v === true)

  if (!allMet) {
    return {
      type: 'not-section-257',
      benchmark: 'not-applicable',
      communal_entrance: communalEntrance,
      separate_entrance_mode: separateEntranceMode,
      upper_flat_independent_exit: upperFlatExit,
      inner_room_present: innerRoom,
      escape_windows: escapeWindows,
      confidence: 'confirmed',
      unresolved_reasons: [],
      risk_level: 'unresolved',
      risk_score: 0,
      risk_factors_present: [],
    }
  }

  // Step 4: All s257 criteria met — compute risk.
  // If blocked=true here, it means a non-criteria BLOCK_CLASS question was uncertain
  // → classification is probable rather than confirmed.
  const classificationType = blocked ? 'probable-section-257' : 'section-257-hmo'
  const confidence = blocked ? 'probable' : 'confirmed'

  const { score, factors } = computeRiskFactors(answers, {
    communal_entrance: communalEntrance,
    separate_entrance_mode: separateEntranceMode,
    escape_windows: escapeWindows,
    inner_room_present: innerRoom,
    upper_flat_independent_exit: upperFlatExit,
  })

  return {
    type: classificationType,
    benchmark: 'D10',
    communal_entrance: communalEntrance,
    separate_entrance_mode: separateEntranceMode,
    upper_flat_independent_exit: upperFlatExit,
    inner_room_present: innerRoom,
    escape_windows: escapeWindows,
    confidence,
    unresolved_reasons,
    risk_level: scoreToRiskLevel(score),
    risk_score: score,
    risk_factors_present: factors,
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

function deriveUpperFlatExit(B2: AnswerValue): Classification['upper_flat_independent_exit'] {
  if (B2 === 'yes') return 'yes'
  if (B2 === 'no') return 'no'
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
  ableBodyied: boolean | null
): EscapeWindowStatus {
  const hasWindow = answers[questions.has_window]?.value
  if (!hasWindow) return 'unknown'
  if (hasWindow === 'no') return 'does-not-qualify'
  if (hasWindow === 'not_sure') return 'unknown'

  let hasUnknown = false

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
    ableBodyied
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

  // RF-C01: No qualifying bedroom window AND no rear exit
  const bed1OK = derived.escape_windows.bedroom_1 === 'qualifies'
  const bed2OK = derived.escape_windows.bedroom_2 === 'qualifies'
  const anyBedQualifies = bed1OK || bed2OK
  if (!anyBedQualifies && derived.upper_flat_independent_exit !== 'yes') {
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
  if (H4 === 'minimal') add('RF-H04', 2)
  else if (H4 === 'passive') add('RF-H04', 1)

  return { score, factors }
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score <= 2) return 'low'
  if (score <= 5) return 'normal'
  if (score <= 9) return 'elevated'
  return 'high'
}
