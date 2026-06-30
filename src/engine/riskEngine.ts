/**
 * riskEngine.ts — FireRegs v2 risk model (docs/4-Risk-Engine-Refactor.md, §15).
 *
 * computeRisk(answers, classification) -> RiskAssessment
 *
 * Pure function. No React, no DOM, no localStorage. Same inputs always
 * produce the same output.
 *
 * --- Two independent dimensions (§15.1) ---
 *   RiskSeverity:  low | normal | elevated | high
 *   RiskKnowledge: known_risk | potential_risk | unknown_risk
 *
 * A domain with no triggered factors defaults to severity 'low' and
 * knowledge 'known_risk' — nothing of concern was found, and that finding
 * is not in doubt. Per §15.4, an *unknown* fact must never be scored as
 * severity 'low' AND knowledge 'known_risk' together — it is surfaced as
 * its own factor with knowledge 'unknown_risk' (and severity 'normal' or
 * above), producing an investigation item rather than a clean bill of health.
 *
 * --- Roll-up rule ---
 *   overall_severity  = the highest severity across all six domains.
 *   overall_knowledge = the least-certain knowledge state across all six
 *   domains. [Inference] This is the roll-up rule proposed as a defensible
 *   default in docs/4-Risk-Engine-Refactor.md (Notes); it keeps the two
 *   dimensions independent (a property can be "normal known risk" overall
 *   but "high unknown risk" overall where one domain is unverified).
 *
 * This module is additive: it does not replace `classifyLegacy` /
 * `computeRiskFactors` (still consumed by the reducer and the v1 remedy/report
 * engines until Steps 5 and 7).
 */

import type {
  AnswerMap,
  BuildingClassification,
  RiskAssessment,
  RiskDomain,
  RiskDomainAssessment,
  RiskFactor,
  RiskKnowledge,
  RiskSeverity,
} from '../state/AppState'
import {
  assessEscapeWindows,
  computeStairCompartmentationConfidence,
  deriveInnerRoomPresent,
  deriveUpperExternalEscapeViable,
} from './classifier'

// ---------------------------------------------------------------------------
// Dimension ordering and roll-up helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<RiskSeverity, number> = { low: 0, normal: 1, elevated: 2, high: 3 }
const KNOWLEDGE_ORDER: Record<RiskKnowledge, number> = { known_risk: 0, potential_risk: 1, unknown_risk: 2 }

function higherSeverity(a: RiskSeverity, b: RiskSeverity): RiskSeverity {
  return SEVERITY_ORDER[b] > SEVERITY_ORDER[a] ? b : a
}

function higherKnowledge(a: RiskKnowledge, b: RiskKnowledge): RiskKnowledge {
  return KNOWLEDGE_ORDER[b] > KNOWLEDGE_ORDER[a] ? b : a
}

/** Constructs a single risk factor. Kept as a function so every factor is self-describing. */
function f(
  id: string,
  domain: RiskDomain,
  severity: RiskSeverity,
  knowledge: RiskKnowledge,
  description: string
): RiskFactor {
  return { id, domain, severity, knowledge, description }
}

function summariseDomain(factors: RiskFactor[]): RiskDomainAssessment {
  let severity: RiskSeverity = 'low'
  let knowledge: RiskKnowledge = 'known_risk'
  for (const factor of factors) {
    severity = higherSeverity(severity, factor.severity)
    knowledge = higherKnowledge(knowledge, factor.knowledge)
  }
  return { severity, knowledge, factors: factors.map((factor) => factor.id) }
}

// ---------------------------------------------------------------------------
// ESCAPE domain
// ---------------------------------------------------------------------------

/**
 * §10.2 / external-stairs.md — escape-route risk for the upper flat and
 * general bedroom/living-room escape-window adequacy.
 *
 * A viable independent external escape route (B2 confirmed usable) suppresses
 * RF-C01 ("sole route") entirely — the app must not require qualifying escape
 * windows solely to compensate for a route that already exists. An unverified
 * or non-viable external route does not reduce risk; it produces its own
 * investigation/remediation factor instead (Rules B/C of external-stairs.md).
 */
function computeEscapeFactors(answers: AnswerMap): RiskFactor[] {
  const factors: RiskFactor[] = []
  const escapeWindows = assessEscapeWindows(answers)
  const innerRoom = deriveInnerRoomPresent(answers)

  const B2 = answers['B2']?.value
  const hasClaimedExternalRoute =
    B2 === 'yes_external_steel_stair' || B2 === 'yes_rear_exit' || B2 === 'yes_other'
  const externalViable = deriveUpperExternalEscapeViable(answers, B2)

  const bed1Qualifies = escapeWindows.bedroom_1 === 'qualifies'
  const bed2Qualifies = escapeWindows.bedroom_2 === 'qualifies'
  const anyBedQualifies = bed1Qualifies || bed2Qualifies

  // RF-C01 — no qualifying bedroom escape window and no viable independent
  // escape route: the shared route is the sole means of escape.
  if (!anyBedQualifies && externalViable !== 'yes') {
    const anyBedUnknown =
      escapeWindows.bedroom_1 === 'unknown' || escapeWindows.bedroom_2 === 'unknown'
    factors.push(
      f(
        'RF-C01',
        'escape',
        'elevated',
        anyBedUnknown ? 'unknown_risk' : 'known_risk',
        'No qualifying bedroom escape window and no viable independent escape route for the ' +
          'upper flat — the shared route is the sole means of escape.'
      )
    )
  }

  // RF-ESC-VERIFY / RF-ESC-RESTORE — an independent external route is claimed
  // but its usability is unverified, or it is obstructed/locked/in poor
  // condition.
  if (hasClaimedExternalRoute && externalViable === 'unknown') {
    factors.push(
      f(
        'RF-ESC-VERIFY',
        'escape',
        'normal',
        'unknown_risk',
        'The upper flat appears to have an independent external escape route, but its usability ' +
          'has not been confirmed. Confirm that the route is permanently available, unobstructed, ' +
          'openable without a key, and in sound condition.'
      )
    )
  } else if (hasClaimedExternalRoute && externalViable === 'no') {
    factors.push(
      f(
        'RF-ESC-RESTORE',
        'escape',
        'elevated',
        'known_risk',
        "The upper flat's external escape route cannot currently be relied upon (obstructed, " +
          'locked, or in poor condition). Until repaired or confirmed usable, the shared route ' +
          'should be treated as the primary escape route.'
      )
    )
  }

  // RF-C02 — flat entrance opens directly into a habitable room, with no
  // protected lobby or hallway.
  if (answers['C14']?.value === 'habitable_room') {
    factors.push(
      f(
        'RF-C02',
        'escape',
        'normal',
        'known_risk',
        'The flat entrance opens directly into a habitable room rather than a protected lobby ' +
          'or hallway.'
      )
    )
  }

  // RF-C03 — inner room: a bedroom is only accessible by passing through
  // another habitable room.
  if (innerRoom === 'yes') {
    factors.push(
      f(
        'RF-C03',
        'escape',
        'normal',
        'known_risk',
        'At least one bedroom is an inner room — only accessible by passing through another ' +
          'habitable room.'
      )
    )
  }

  // RF-C04 — living room escape window does not qualify, or its status is unknown.
  if (escapeWindows.living_room === 'does-not-qualify') {
    factors.push(
      f(
        'RF-C04',
        'escape',
        'normal',
        'known_risk',
        'The living room window does not meet the LACORS §14 escape window criteria.'
      )
    )
  } else if (escapeWindows.living_room === 'unknown') {
    factors.push(
      f(
        'RF-C04',
        'escape',
        'normal',
        'unknown_risk',
        'Whether the living room window meets the LACORS §14 escape window criteria has not ' +
          'been fully confirmed.'
      )
    )
  }

  // RF-C05 — mobility-impaired occupant: escape via a bedroom window cannot
  // be relied upon.
  if (answers['C12']?.value === 'yes') {
    factors.push(
      f(
        'RF-C05',
        'escape',
        'elevated',
        'known_risk',
        'A mobility-impaired occupant is present — escape via a bedroom window cannot be ' +
          'relied upon.'
      )
    )
  }

  // RF-B01 — travel distance from the upper flat's bedrooms to the exit.
  const B8 = answers['B8']?.value
  if (B8 === 'long') {
    factors.push(
      f(
        'RF-B01',
        'escape',
        'elevated',
        'known_risk',
        "Travel distance from the upper flat's bedrooms to the exit is long (over 15m, or " +
          'multiple changes of direction).'
      )
    )
  } else if (B8 === 'medium') {
    factors.push(
      f(
        'RF-B01',
        'escape',
        'normal',
        'known_risk',
        "Travel distance from the upper flat's bedrooms to the exit is moderate (roughly 7-15m)."
      )
    )
  } else if (B8 === 'not_sure') {
    factors.push(
      f(
        'RF-B01',
        'escape',
        'normal',
        'unknown_risk',
        "Travel distance from the upper flat's bedrooms to the exit has not been estimated."
      )
    )
  }

  return factors
}

// ---------------------------------------------------------------------------
// DOORS domain
// ---------------------------------------------------------------------------

interface DoorLocationSpec {
  idPrefix: string
  label: string
  constructionId: string
  selfCloserId: string
  fitId: string
  sealsId: string
}

const GROUND_FLAT_DOOR: DoorLocationSpec = {
  idPrefix: 'GF',
  label: 'The ground-floor flat entrance door',
  constructionId: 'door_gf_construction',
  selfCloserId: 'F1a',
  fitId: 'door_gf_fit',
  sealsId: 'door_gf_seals',
}

const UPPER_FLAT_DOOR: DoorLocationSpec = {
  idPrefix: 'UF',
  label: 'The upper flat entrance door',
  constructionId: 'door_uf_construction',
  selfCloserId: 'F1b',
  fitId: 'door_uf_fit',
  sealsId: 'door_uf_seals',
}

/**
 * §15.3 — door risk weighting on shared routes:
 *   - hollow-core flat entrance door + shared route        ⇒ high
 *   - no self-closer + shared route                        ⇒ elevated/high
 *   - door gaps / poor fit + shared route                   ⇒ elevated
 *   - unknown construction                                  ⇒ unknown_risk, investigate (§15.4)
 */
function computeEntranceDoorFactors(
  answers: AnswerMap,
  spec: DoorLocationSpec,
  sharedRoute: boolean
): RiskFactor[] {
  const factors: RiskFactor[] = []
  const construction = answers[spec.constructionId]?.value
  const selfCloser = answers[spec.selfCloserId]?.value
  const fit = answers[spec.fitId]?.value
  const seals = answers[spec.sealsId]?.value
  const routeNote = sharedRoute ? ', opening onto the shared escape route,' : ''

  if (construction === 'hollow_core') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-CONSTR`,
        'doors',
        sharedRoute ? 'high' : 'elevated',
        'known_risk',
        `${spec.label} is hollow-core or lightweight${routeNote} and provides minimal fire resistance.`
      )
    )
  } else if (construction === 'unknown') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-CONSTR-UNK`,
        'doors',
        'normal',
        'unknown_risk',
        `${spec.label}'s construction has not been confirmed${routeNote}. Investigate and confirm ` +
          'the door construction.'
      )
    )
  }

  if (selfCloser === 'not_fitted') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-CLOSER`,
        'doors',
        sharedRoute ? 'elevated' : 'normal',
        'known_risk',
        `${spec.label} has no self-closing device fitted${routeNote}.`
      )
    )
  } else if (selfCloser === 'fitted_not_working') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-CLOSER-FAULT`,
        'doors',
        sharedRoute ? 'elevated' : 'normal',
        'known_risk',
        `${spec.label}'s self-closing device is fitted but does not pull the door fully shut${routeNote}.`
      )
    )
  } else if (selfCloser === 'not_sure') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-CLOSER-UNK`,
        'doors',
        'normal',
        'unknown_risk',
        `Whether ${spec.label.toLowerCase()} has a working self-closing device has not been confirmed.`
      )
    )
  }

  if (fit === 'no') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-FIT`,
        'doors',
        sharedRoute ? 'elevated' : 'normal',
        'known_risk',
        `${spec.label} does not fit and latch properly when closed${routeNote}.`
      )
    )
  } else if (fit === 'not_sure') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-FIT-UNK`,
        'doors',
        'normal',
        'unknown_risk',
        `Whether ${spec.label.toLowerCase()} fits and latches properly when closed has not been confirmed.`
      )
    )
  }

  if (seals === 'none') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-SEALS`,
        'doors',
        'normal',
        'known_risk',
        `${spec.label} has no intumescent or smoke seals fitted.`
      )
    )
  } else if (seals === 'not_sure') {
    factors.push(
      f(
        `RF-DR-${spec.idPrefix}-SEALS-UNK`,
        'doors',
        'low',
        'unknown_risk',
        `Whether ${spec.label.toLowerCase()} has intumescent or smoke seals has not been confirmed.`
      )
    )
  }

  return factors
}

/**
 * §15.3 — "key required to escape ⇒ high" applies to both the building final
 * exit door (common parts) and any internal escape-route door (within either
 * flat).
 */
function computeFinalExitAndInternalDoorFactors(answers: AnswerMap, sharedHall: boolean): RiskFactor[] {
  const factors: RiskFactor[] = []

  if (sharedHall) {
    const F6b = answers['F6b']?.value
    if (F6b === 'no' || F6b === 'fitted_not_working') {
      factors.push(
        f(
          'RF-DR-FINAL-CLOSER',
          'doors',
          'normal',
          'known_risk',
          'The building final exit door has no working self-closing device.'
        )
      )
    } else if (F6b === 'not_sure') {
      factors.push(
        f(
          'RF-DR-FINAL-CLOSER-UNK',
          'doors',
          'low',
          'unknown_risk',
          'Whether the building final exit door has a working self-closing device has not been confirmed.'
        )
      )
    }

    const finalKeyless = answers['door_final_keyless']?.value
    if (finalKeyless === 'no') {
      factors.push(
        f(
          'RF-DR-FINAL-KEY',
          'doors',
          'high',
          'known_risk',
          'The building final exit door requires a key to open from the inside — occupants ' +
            'escaping in an emergency may be unable to get out.'
        )
      )
    } else if (finalKeyless === 'not_sure') {
      factors.push(
        f(
          'RF-DR-FINAL-KEY-UNK',
          'doors',
          'elevated',
          'unknown_risk',
          'Whether the building final exit door can be opened from the inside without a key has not been confirmed.'
        )
      )
    }
  }

  const F5 = answers['F5']?.value
  if (F5 === 'yes') {
    factors.push(
      f(
        'RF-DR-INTERNAL-KEY',
        'doors',
        'high',
        'known_risk',
        'A door on the internal escape route (or a flat entrance door) requires a key to open from the inside.'
      )
    )
  } else if (F5 === 'not_sure') {
    factors.push(
      f(
        'RF-DR-INTERNAL-KEY-UNK',
        'doors',
        'elevated',
        'unknown_risk',
        'Whether all internal escape-route doors can be opened from the inside without a key has not been confirmed.'
      )
    )
  }

  return factors
}

function computeDoorFactors(answers: AnswerMap, sharedHall: boolean, sharedRoute: boolean): RiskFactor[] {
  return [
    ...computeEntranceDoorFactors(answers, GROUND_FLAT_DOOR, sharedRoute),
    ...computeEntranceDoorFactors(answers, UPPER_FLAT_DOOR, sharedRoute),
    ...computeFinalExitAndInternalDoorFactors(answers, sharedHall),
  ]
}

// ---------------------------------------------------------------------------
// DETECTION domain
// ---------------------------------------------------------------------------

/** Smoke-grade rank for comparing the two flats (mixed-provision detection). */
function smokeGradeRank(value: unknown): number | null {
  if (value === 'none') return 0
  if (value === 'battery_only') return 1
  if (value === 'd1' || value === 'd2') return 2
  return null // unknown / unanswered
}

/**
 * §13 / Case Study D10 — within-flat detection for ONE flat: smoke in the
 * hallway, heat in the kitchen, interlinking within the flat. A rented flat with
 * no smoke alarm is a statutory gap; battery-only is below the Grade D benchmark
 * (risk-based, not a breach in a non-HMO). Power source is captured at smoke level.
 */
function computeFlatDetectionFactors(
  answers: AnswerMap,
  prefix: 'GF' | 'UF',
  label: string,
  smokeId: string,
  heatId: string,
  linkId: string
): RiskFactor[] {
  const factors: RiskFactor[] = []

  const smoke = answers[smokeId]?.value
  if (smoke === 'none') {
    factors.push(f(`RF-DET-${prefix}-NONE`, 'detection', 'high', 'known_risk',
      `${label} has no smoke alarm in its hallway/lobby — a working smoke alarm on the storey is a statutory requirement for a rented dwelling.`))
  } else if (smoke === 'battery_only') {
    factors.push(f(`RF-DET-${prefix}-BATTERY`, 'detection', 'elevated', 'known_risk',
      `${label} relies on a battery-only (Grade F) smoke alarm rather than a mains-wired Grade D alarm.`))
  } else if (smoke === 'unknown') {
    factors.push(f(`RF-DET-${prefix}-UNK`, 'detection', 'normal', 'unknown_risk',
      `The smoke alarm provision in ${label.toLowerCase()} has not been confirmed.`))
  }

  const heat = answers[heatId]?.value
  if (heat === 'none') {
    factors.push(f(`RF-DET-${prefix}-KITCHEN`, 'detection', 'normal', 'known_risk',
      `${label} has no heat detector in the kitchen (LACORS LD2 / Case Study D10 includes kitchen detection).`))
  } else if (heat === 'unknown') {
    factors.push(f(`RF-DET-${prefix}-KITCHEN-UNK`, 'detection', 'low', 'unknown_risk',
      `Whether ${label.toLowerCase()} has a kitchen heat detector has not been confirmed.`))
  }

  const link = answers[linkId]?.value
  if (link === 'no') {
    factors.push(f(`RF-DET-${prefix}-LINK`, 'detection', 'normal', 'known_risk',
      `Alarms within ${label.toLowerCase()} are not interlinked with each other.`))
  } else if (link === 'unknown') {
    factors.push(f(`RF-DET-${prefix}-LINK-UNK`, 'detection', 'low', 'unknown_risk',
      `Whether alarms within ${label.toLowerCase()} are interlinked has not been verified.`))
  }

  return factors
}

/**
 * §13 — within-flat detection is assessed PER FLAT (E1g/E3g/E6g and
 * E1u/E3u/E6u), so a mixed provision is reported as such rather than collapsed
 * to one building-wide grade. Common-parts detection (E4, E5, E6b) is only
 * assessed where common parts exist; cross-flat interlinking (E6b) stays
 * advisory — it is NOT a blanket requirement (D10 keeps flats stand-alone).
 */
function computeDetectionFactors(answers: AnswerMap, sharedHall: boolean): RiskFactor[] {
  const factors: RiskFactor[] = [
    ...computeFlatDetectionFactors(answers, 'GF', 'The ground-floor flat', 'E1g', 'E3g', 'E6g'),
    ...computeFlatDetectionFactors(answers, 'UF', 'The upper flat', 'E1u', 'E3u', 'E6u'),
  ]

  // Mixed detection provision — the two flats differ in smoke-alarm grade.
  const gRank = smokeGradeRank(answers['E1g']?.value)
  const uRank = smokeGradeRank(answers['E1u']?.value)
  if (gRank !== null && uRank !== null && gRank !== uRank) {
    const weaker = gRank < uRank ? 'ground-floor flat' : 'upper flat'
    const stronger = gRank < uRank ? 'upper flat' : 'ground-floor flat'
    factors.push(f('RF-DET-MIXED-PROVISION', 'detection', 'normal', 'known_risk',
      `Detection provision is mixed: the ${weaker} has weaker smoke detection than the ${stronger}. ` +
        'The building should not be assessed as having a single uniform alarm grade.'))
  }

  const E7 = answers['E7']?.value
  if (E7 === 'over_year') {
    factors.push(
      f(
        'RF-DET-STALE',
        'detection',
        'normal',
        'potential_risk',
        'The fire alarms were last tested more than a year ago — their current working condition is unconfirmed.'
      )
    )
  } else if (E7 === 'never_unknown') {
    factors.push(
      f(
        'RF-DET-NEVER',
        'detection',
        'elevated',
        'unknown_risk',
        'The fire alarms have never been tested, or testing history is unknown.'
      )
    )
  }

  if (sharedHall) {
    const E4 = answers['E4']?.value
    if (E4 === 'yes_battery') {
      factors.push(
        f(
          'RF-DET-COMMON-BATTERY',
          'detection',
          'normal',
          'known_risk',
          'The alarm in the shared entrance hall is battery-only rather than mains-wired.'
        )
      )
    } else if (E4 === 'no') {
      factors.push(
        f(
          'RF-DET-COMMON-NONE',
          'detection',
          'elevated',
          'known_risk',
          'There is no alarm in the shared entrance hall or common escape route.'
        )
      )
    } else if (E4 === 'not_sure') {
      factors.push(
        f(
          'RF-DET-COMMON-UNK',
          'detection',
          'normal',
          'unknown_risk',
          'Whether there is an alarm in the shared entrance hall has not been confirmed.'
        )
      )
    }

    const E5 = answers['E5']?.value
    if (E5 === 'yes_one') {
      factors.push(
        f(
          'RF-DET-LOBBY-PARTIAL',
          'detection',
          'low',
          'known_risk',
          "A heat detector interlinked with the common-parts alarm is fitted in only one flat's entrance lobby."
        )
      )
    } else if (E5 === 'no') {
      factors.push(
        f(
          'RF-DET-LOBBY-NONE',
          'detection',
          'normal',
          'known_risk',
          'Neither flat has a heat detector in its entrance lobby interlinked with the common-parts alarm.'
        )
      )
    } else if (E5 === 'not_sure') {
      factors.push(
        f(
          'RF-DET-LOBBY-UNK',
          'detection',
          'low',
          'unknown_risk',
          'Whether either flat has a heat detector interlinked with the common-parts alarm has not been confirmed.'
        )
      )
    }

    const E6b = answers['E6b']?.value
    if (E6b === 'no') {
      factors.push(
        f(
          'RF-DET-CROSSLINK',
          'detection',
          'low',
          'known_risk',
          'Alarms in the two flats are not interlinked with each other or with the common parts.'
        )
      )
    } else if (E6b === 'not_sure') {
      factors.push(
        f(
          'RF-DET-CROSSLINK-UNK',
          'detection',
          'low',
          'unknown_risk',
          'Whether alarms are interlinked between the flats or with the common parts has not been confirmed.'
        )
      )
    }
  }

  return factors
}

// ---------------------------------------------------------------------------
// COMPARTMENTATION domain
// ---------------------------------------------------------------------------

/**
 * §12.1/§12.2 — carries over the RF-S01-RF-S06 stair-compartmentation
 * sub-scoring (docs/stair-enclusure.md). Only relevant where a shared stair
 * enclosure exists (B1='communal').
 *
 * §25.6 — unknown compartmentation must surface as unknown_risk requiring
 * investigation, never as 'low' simply because no defects are visible.
 */
function computeCompartmentationFactors(answers: AnswerMap, sharedHall: boolean): RiskFactor[] {
  if (!sharedHall) return []

  const factors: RiskFactor[] = []

  const D10 = answers['D10']?.value
  const D11 = answers['D11']?.value
  const D12 = answers['D12']?.value
  const D14 = answers['D14']?.value
  const D15 = answers['D15']?.value
  const D16 = answers['D16']?.value
  const D17 = answers['D17']?.value

  if (D10 === 'timber_panelling') {
    factors.push(
      f(
        'RF-S01',
        'compartmentation',
        'high',
        'known_risk',
        'The stair enclosure is lined with timber panelling, which provides negligible fire resistance.'
      )
    )
  }
  if (D12 === 'under_9_5') {
    factors.push(
      f(
        'RF-S02',
        'compartmentation',
        'elevated',
        'known_risk',
        'The stair enclosure lining is under 9.5mm — below the minimum effective thickness for fire resistance.'
      )
    )
  }
  if (D15 === 'unsealed') {
    factors.push(
      f(
        'RF-S03',
        'compartmentation',
        'elevated',
        'known_risk',
        'There are unsealed penetrations through the stair enclosure walls or ceiling.'
      )
    )
  }
  if (D16 === 'no') {
    factors.push(
      f(
        'RF-S04',
        'compartmentation',
        'high',
        'known_risk',
        'The stair enclosure is not continuous — there are gaps or breaks in the fire separation.'
      )
    )
  }
  if (D17 === 'yes') {
    factors.push(
      f(
        'RF-S05',
        'compartmentation',
        'elevated',
        'potential_risk',
        'Hidden voids are present or suspected within or alongside the stair enclosure, which may allow concealed fire spread.'
      )
    )
  }
  if (D11 === '1950_1970' && D14 === 'visual_only') {
    factors.push(
      f(
        'RF-S06',
        'compartmentation',
        'normal',
        'unknown_risk',
        'This 1950-1970 building has only been inspected visually — construction standards from this period are inconsistent.'
      )
    )
  }

  // Lower / ground-floor continuation of the protected route (D19), assessed
  // separately from the upper enclosure (D10): a weaker or unverified lower
  // section is "partial compartmentation uncertainty", not "whole stair weak".
  const D19 = answers['D19']?.value
  if (D19 === 'stud_plasterboard' || D19 === 'lath_plaster' || D19 === 'mixed') {
    const lowerUnverified = D14 === 'visual_only' || D12 === 'unknown' || D12 === undefined
    factors.push(
      f(
        'RF-S-LOWER',
        'compartmentation',
        'normal',
        lowerUnverified ? 'unknown_risk' : 'known_risk',
        lowerUnverified
          ? 'The lower / ground-floor section of the protected route is stud/plasterboard or lath and plaster and its fire resistance has not been confirmed by inspection — partial compartmentation uncertainty, separate from the upper enclosure.'
          : 'The lower / ground-floor section of the protected route is a lighter stud/plasterboard or lath-and-plaster construction — confirm it provides 30-minute fire resistance continuous with the masonry section (LACORS §19.4).'
      )
    )
  } else if (D19 === 'unknown') {
    factors.push(
      f(
        'RF-S-LOWER-UNK',
        'compartmentation',
        'normal',
        'unknown_risk',
        'The construction of the lower / ground-floor section of the protected route has not been confirmed.'
      )
    )
  }

  // Mixed-construction transition: where the upper enclosure is masonry but the
  // lower section is stud/plasterboard, the junction is the point to inspect for
  // continuity, gaps and fire stopping (LACORS §19.4/§19.7).
  if (D10 === 'masonry' && (D19 === 'stud_plasterboard' || D19 === 'lath_plaster' || D19 === 'mixed')) {
    factors.push(
      f(
        'RF-S-TRANSITION',
        'compartmentation',
        'normal',
        'potential_risk',
        'The protected route changes construction (masonry to stud/plasterboard) along its length; inspect the transition for continuity, gaps and fire stopping.'
      )
    )
  }

  // §12.2 — do not output "low risk" merely because no defects are visible:
  // if the enclosure construction is unverified and no other factor has
  // already flagged it, emit an investigation factor.
  const confidence = computeStairCompartmentationConfidence(answers, false)
  if (confidence === 'unknown' && factors.length === 0) {
    factors.push(
      f(
        'RF-S-INVESTIGATE',
        'compartmentation',
        'normal',
        'unknown_risk',
        'Further investigation required: confirm staircase enclosure construction and continuity.'
      )
    )
  }

  return factors
}

// ---------------------------------------------------------------------------
// COMMON_PARTS domain
// ---------------------------------------------------------------------------

/**
 * General communal construction and housekeeping (D1-D9, B7) — distinct from
 * the evidence-led stair-compartmentation sub-model (compartmentation domain).
 * Only relevant where common parts exist (B1='communal').
 */
function computeCommonPartsFactors(answers: AnswerMap, sharedHall: boolean): RiskFactor[] {
  if (!sharedHall) return []

  const factors: RiskFactor[] = []

  const D1 = answers['D1']?.value
  if (D1 === 'hardboard') {
    factors.push(
      f('RF-D01', 'common_parts', 'elevated', 'known_risk', 'The stair side panelling is hardboard, which has no fire resistance.')
    )
  } else if (D1 === 'open_bannisters') {
    factors.push(
      f(
        'RF-D01-OPEN',
        'common_parts',
        'elevated',
        'known_risk',
        'The stair has open bannisters with no solid panelling enclosing it.'
      )
    )
  } else if (D1 === 'mixed') {
    factors.push(
      f('RF-D01-MIXED', 'common_parts', 'normal', 'known_risk', 'The stair side panelling is a mix of materials in different sections.')
    )
  } else if (D1 === '9mm') {
    factors.push(
      f(
        'RF-D01B',
        'common_parts',
        'normal',
        'known_risk',
        'The stair side panelling is 9mm plasterboard — below the approximately 30-minute, 12.5mm benchmark.'
      )
    )
  } else if (D1 === 'unknown') {
    factors.push(
      f('RF-D01-UNK', 'common_parts', 'normal', 'unknown_risk', 'The construction of the stair side panelling has not been confirmed.')
    )
  }

  const D2 = answers['D2']?.value
  const D7 = answers['D7']?.value
  if (D2 === 'exposed_timber' || D7 === 'timber_exposed') {
    factors.push(
      f(
        'RF-D02',
        'common_parts',
        'elevated',
        'known_risk',
        'Exposed timber soffit or floor/ceiling joists between the flats provide a direct fire path with no fire-resisting lining.'
      )
    )
  } else if (D2 === 'unknown' || D7 === 'unknown') {
    factors.push(
      f(
        'RF-D02-UNK',
        'common_parts',
        'low',
        'unknown_risk',
        'The construction of the staircase soffit or the floor/ceiling between the flats has not been confirmed.'
      )
    )
  }

  const D9 = answers['D9']?.value
  if (typeof D9 === 'string' && D9) {
    try {
      const items = JSON.parse(D9) as string[]
      if (Array.isArray(items)) {
        const harmful = items.filter((item) => item !== 'none' && item !== 'not_sure')
        if (harmful.length >= 2) {
          factors.push(
            f(
              'RF-D03',
              'common_parts',
              'elevated',
              'known_risk',
              'Multiple combustible items (e.g. bicycles, rubbish, unprotected electrical intake) are present in the shared entrance hall or common escape route.'
            )
          )
        } else if (harmful.length === 1) {
          factors.push(
            f(
              'RF-D03',
              'common_parts',
              'normal',
              'known_risk',
              'A combustible item is present in the shared entrance hall or common escape route.'
            )
          )
        } else if (items.includes('not_sure')) {
          factors.push(
            f(
              'RF-D03-UNK',
              'common_parts',
              'low',
              'unknown_risk',
              'Whether combustible items are present in the shared entrance hall or common escape route has not been confirmed.'
            )
          )
        }
      }
    } catch {
      // malformed JSON — skip
    }
  }

  const D4 = answers['D4']?.value
  if (D4 === 'yes') {
    factors.push(
      f('RF-D04', 'common_parts', 'normal', 'known_risk', 'Visible gaps or penetrations through the staircase enclosure were observed.')
    )
  } else if (D4 === 'not_sure') {
    factors.push(
      f(
        'RF-D04-UNK',
        'common_parts',
        'low',
        'unknown_risk',
        'Whether there are visible gaps or penetrations through the staircase enclosure has not been confirmed.'
      )
    )
  }

  // Under-stairs / escape-route cupboard. Prefer the detailed sub-model
  // (D21-D25); fall back to the coarse D5 fire-door question otherwise.
  const D5 = answers['D5']?.value
  const D22 = answers['D22']?.value
  const cupboardExists = D5 === 'yes_fire_door' || D5 === 'yes_no_fire_door'

  if (cupboardExists && D22 !== undefined) {
    const D21raw = answers['D21']?.value
    let contents: string[] = []
    if (typeof D21raw === 'string' && D21raw) {
      try {
        const parsed = JSON.parse(D21raw)
        if (Array.isArray(parsed)) contents = parsed as string[]
      } catch {
        // malformed JSON — skip
      }
    }
    const hasMeter = contents.includes('gas_meter') || contents.includes('electricity_meter')
    const hasCombustibleContent = contents.includes('storage_combustible')
    const D23 = answers['D23']?.value
    const D24 = answers['D24']?.value
    const D25 = answers['D25']?.value
    const notFireResisting = D22 === 'no_door' || D22 === 'lightweight_timber' || D22 === 'solid_timber'

    if (hasMeter && notFireResisting) {
      factors.push(f('RF-CUP-METER', 'common_parts', 'elevated', 'known_risk',
        'A gas or electricity meter is housed in the under-stairs cupboard opening onto the escape route without a fire-resisting enclosure. LACORS §15.5 considers it best practice to enclose such equipment in fire-resisting construction.'))
    } else if (notFireResisting) {
      factors.push(f('RF-CUP-ENCLOSURE', 'common_parts', 'normal', 'known_risk',
        'The under-stairs cupboard opening onto the escape route does not have a fire-resisting (FD30) door and enclosure (LACORS §15.4).'))
    } else if (D22 === 'unknown') {
      factors.push(f('RF-CUP-UNK', 'common_parts', 'normal', 'unknown_risk',
        'The fire resistance of the under-stairs cupboard door / enclosure has not been confirmed.'))
    }
    if (D25 === 'yes' || hasCombustibleContent) {
      factors.push(f('RF-CUP-COMBUST', 'common_parts', 'elevated', 'known_risk',
        'Combustible materials are stored in the under-stairs cupboard within the escape route (LACORS §15.3).'))
    }
    if (D24 === 'no') {
      factors.push(f('RF-CUP-SEAL', 'common_parts', 'normal', 'known_risk',
        'Service penetrations around the cupboard or meters are not fire-stopped (LACORS §19.7).'))
    } else if (D24 === 'unknown') {
      factors.push(f('RF-CUP-SEAL-UNK', 'common_parts', 'low', 'unknown_risk',
        'Whether service penetrations around the cupboard or meters are sealed has not been confirmed.'))
    }
    if (D23 === 'no' && (D22 === 'fd30' || D22 === 'solid_timber')) {
      factors.push(f('RF-CUP-CLOSER', 'common_parts', 'normal', 'known_risk',
        'The under-stairs cupboard door is not self-closing and may be left open across the escape route.'))
    }
    if (contents.includes('unknown')) {
      factors.push(f('RF-CUP-CONTENTS-UNK', 'common_parts', 'low', 'unknown_risk',
        'The contents of the under-stairs cupboard have not been confirmed.'))
    }
  } else if (D5 === 'yes_no_fire_door') {
    factors.push(f('RF-D05', 'common_parts', 'normal', 'known_risk',
      'A cupboard or meter cupboard opens onto the shared entrance hall without a fire-resisting door.'))
  } else if (D5 === 'not_sure') {
    factors.push(f('RF-D05-UNK', 'common_parts', 'low', 'unknown_risk',
      'Whether a cupboard or meter cupboard opening onto the shared entrance hall has a fire-resisting door has not been confirmed.'))
  }

  const D6 = answers['D6']?.value
  if (D6 === 'poor') {
    factors.push(
      f('RF-D06', 'common_parts', 'elevated', 'known_risk', 'The overall condition of the staircase enclosure is poor, with significant deterioration visible.')
    )
  } else if (D6 === 'some_defects') {
    factors.push(
      f('RF-D06-SOME', 'common_parts', 'normal', 'known_risk', 'The staircase enclosure has some visible defects.')
    )
  } else if (D6 === 'not_assessed') {
    factors.push(
      f('RF-D06-UNK', 'common_parts', 'low', 'unknown_risk', 'The overall condition of the staircase enclosure has not been assessed.')
    )
  }

  const D8 = answers['D8']?.value
  if (D8 === 'yes') {
    factors.push(
      f(
        'RF-D08',
        'common_parts',
        'normal',
        'known_risk',
        'Visible penetrations, open chases, or gaps through the walls or floor between the two flats were observed.'
      )
    )
  } else if (D8 === 'not_sure') {
    factors.push(
      f(
        'RF-D08-UNK',
        'common_parts',
        'low',
        'unknown_risk',
        'Whether there are penetrations through the walls or floor between the two flats has not been confirmed.'
      )
    )
  }

  const D3 = answers['D3']?.value
  if (D3 === 'unknown') {
    factors.push(
      f(
        'RF-D09-UNK',
        'common_parts',
        'low',
        'unknown_risk',
        'The construction of the wall between the ground-floor flat and the shared entrance hall has not been confirmed.'
      )
    )
  }

  const B7 = answers['B7']?.value
  if (B7 === 'no') {
    factors.push(
      f(
        'RF-D07',
        'common_parts',
        'normal',
        'known_risk',
        'The final exit door is not directly accessible from the foot of the stair — an intermediate space or door intervenes.'
      )
    )
  } else if (B7 === 'not_sure') {
    factors.push(
      f(
        'RF-D07-UNK',
        'common_parts',
        'low',
        'unknown_risk',
        'Whether the final exit door is directly accessible from the foot of the stair has not been confirmed.'
      )
    )
  }

  return factors
}

// ---------------------------------------------------------------------------
// MANAGEMENT domain
// ---------------------------------------------------------------------------

/**
 * Management and maintenance quality (H1-H4), plus the statutory gas/
 * electrical/CO checks (G1, G2, G4a/G4b) — both reflect ongoing landlord
 * management of the property's fire safety provisions.
 */
function computeManagementFactors(answers: AnswerMap, sharedHall: boolean): RiskFactor[] {
  const factors: RiskFactor[] = []

  const G1 = answers['G1']?.value
  if (G1 === 'overdue') {
    factors.push(f('RF-MGT-GAS', 'management', 'elevated', 'known_risk', 'The annual gas safety check is overdue.'))
  } else if (G1 === 'not_sure') {
    factors.push(
      f('RF-MGT-GAS-UNK', 'management', 'normal', 'unknown_risk', 'Whether the annual gas safety check is current has not been confirmed.')
    )
  }

  const G2 = answers['G2']?.value
  if (G2 === 'overdue') {
    factors.push(
      f('RF-MGT-EICR', 'management', 'elevated', 'known_risk', 'The Electrical Installation Condition Report (EICR) is overdue (more than 5 years).')
    )
  } else if (G2 === 'unknown') {
    factors.push(
      f(
        'RF-MGT-EICR-UNK',
        'management',
        'normal',
        'unknown_risk',
        'Whether the Electrical Installation Condition Report (EICR) is current has not been confirmed.'
      )
    )
  }

  const G4a = answers['G4a']?.value
  const G4b = answers['G4b']?.value
  if (G4a === 'yes' && G4b === 'no') {
    factors.push(
      f(
        'RF-MGT-CO',
        'management',
        'high',
        'known_risk',
        'A fixed combustion appliance is present without a carbon monoxide alarm in the same room — ' +
          'a legal requirement under the Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022.'
      )
    )
  } else if (G4a === 'yes' && G4b === 'not_sure') {
    factors.push(
      f(
        'RF-MGT-CO-UNK',
        'management',
        'normal',
        'unknown_risk',
        'Whether a carbon monoxide alarm is fitted in every room containing a fixed combustion appliance has not been confirmed.'
      )
    )
  } else if (G4a === 'not_sure') {
    factors.push(
      f('RF-MGT-CO-APPLIANCE-UNK', 'management', 'normal', 'unknown_risk', 'Whether fixed combustion appliances are present has not been confirmed.')
    )
  }

  if (sharedHall) {
    const H1 = answers['H1']?.value
    if (H1 === 'no') {
      factors.push(
        f('RF-MGT-H1', 'management', 'elevated', 'known_risk', 'Items are regularly stored in the shared entrance hall and stair.')
      )
    } else if (H1 === 'mostly') {
      factors.push(
        f(
          'RF-MGT-H1-MOSTLY',
          'management',
          'normal',
          'known_risk',
          'The shared entrance hall and stair are mostly kept clear, with occasional items left temporarily.'
        )
      )
    }
  }

  const H2 = answers['H2']?.value
  if (H2 === 'no') {
    factors.push(f('RF-MGT-H2', 'management', 'normal', 'known_risk', 'Tenants are not briefed on fire escape arrangements.'))
  } else if (H2 === 'partially') {
    factors.push(
      f(
        'RF-MGT-H2-PARTIAL',
        'management',
        'low',
        'known_risk',
        'Tenants are briefed on fire escape arrangements at the start of tenancy only, without periodic reminders.'
      )
    )
  } else if (H2 === 'not_sure') {
    factors.push(
      f('RF-MGT-H2-UNK', 'management', 'low', 'unknown_risk', 'Whether tenants are briefed on fire escape arrangements has not been confirmed.')
    )
  }

  const H3 = answers['H3']?.value
  if (H3 === 'no') {
    factors.push(
      f(
        'RF-MGT-H3',
        'management',
        'normal',
        'known_risk',
        'There is no maintenance arrangement for fire safety items (alarms, self-closers, doors, staircase).'
      )
    )
  } else if (H3 === 'ad_hoc') {
    factors.push(
      f('RF-MGT-H3-ADHOC', 'management', 'low', 'known_risk', 'Maintenance of fire safety items is ad hoc, with no regular schedule.')
    )
  } else if (H3 === 'not_sure') {
    factors.push(
      f('RF-MGT-H3-UNK', 'management', 'normal', 'unknown_risk', 'Whether there is a maintenance schedule for fire safety items has not been confirmed.')
    )
  }

  const H4 = answers['H4']?.value
  if (H4 === 'none') {
    factors.push(f('RF-MGT-H4', 'management', 'high', 'known_risk', 'No maintenance or management arrangement is in place for the property.'))
  } else if (H4 === 'minimal') {
    factors.push(
      f(
        'RF-MGT-H4-MINIMAL',
        'management',
        'elevated',
        'known_risk',
        'Maintenance is addressed only when noticed or reported, with no proactive checking.'
      )
    )
  } else if (H4 === 'passive') {
    factors.push(
      f(
        'RF-MGT-H4-PASSIVE',
        'management',
        'normal',
        'known_risk',
        'Maintenance checks happen periodically but without a documented schedule or written records.'
      )
    )
  }

  return factors
}

// ---------------------------------------------------------------------------
// computeRisk — top-level entry point
// ---------------------------------------------------------------------------

const RISK_DOMAINS: RiskDomain[] = ['escape', 'doors', 'detection', 'compartmentation', 'common_parts', 'management']

export function computeRisk(answers: AnswerMap, classification: BuildingClassification): RiskAssessment {
  const sharedHall =
    classification.entrance_configuration === 'shared_entrance_hall' ||
    classification.entrance_configuration === 'shared_hall_and_shared_stair'

  // §15.3 — door weighting refers to a "shared route": a shared hall whose
  // escape route is actually used by both households (F6a). A shared hall
  // where each flat has confirmed it does not rely on it (F6a='no') is not a
  // shared escape route for door-weighting purposes.
  const sharedRoute = sharedHall && answers['F6a']?.value !== 'no'

  const domainFactors: Record<RiskDomain, RiskFactor[]> = {
    escape: computeEscapeFactors(answers),
    doors: computeDoorFactors(answers, sharedHall, sharedRoute),
    detection: computeDetectionFactors(answers, sharedHall),
    compartmentation: computeCompartmentationFactors(answers, sharedHall),
    common_parts: computeCommonPartsFactors(answers, sharedHall),
    management: computeManagementFactors(answers, sharedHall),
  }

  const domains = {} as Record<RiskDomain, RiskDomainAssessment>
  let overall_severity: RiskSeverity = 'low'
  let overall_knowledge: RiskKnowledge = 'known_risk'
  const risk_factors: RiskFactor[] = []

  for (const domain of RISK_DOMAINS) {
    const factors = domainFactors[domain]
    const assessment = summariseDomain(factors)
    domains[domain] = assessment
    overall_severity = higherSeverity(overall_severity, assessment.severity)
    overall_knowledge = higherKnowledge(overall_knowledge, assessment.knowledge)
    risk_factors.push(...factors)
  }

  return { overall_severity, overall_knowledge, domains, risk_factors }
}
