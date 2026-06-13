/**
 * scenarios.ts — Fixture answer maps for the §20 test scenarios A-H
 * (docs/7-Clean-Break-and-Regression-Tests.md, action item 5).
 *
 * Each function returns a minimal `AnswerMap` containing only the answers
 * needed to exercise the scenario's classification/risk/remedy behaviour.
 * Pure data: no React, no DOM, no localStorage.
 */

import type { AnswerMap } from '../../state/AppState'

type Confidence = 'confirmed' | 'not_sure'

function a(value: string, confidence: Confidence = 'confirmed') {
  return { value, confidence, answered_at: '2026-01-01T00:00:00.000Z' }
}

/**
 * A — Purpose-built two-flat building, shared entrance (§20.A / §25.1).
 *
 * Purpose-built → not Section 257, case_study_d10 not applicable. Shared
 * entrance hall (B1='communal') → fso_common_parts applies. A hollow-core
 * upper-flat entrance door with no working self-closer onto the (default)
 * shared route produces high-priority, risk-based door recommendations.
 */
export function scenarioA(): AnswerMap {
  return {
    A1: a('purpose-built'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    D1: a('hardboard'),
    door_uf_construction: a('hollow_core'),
    F1b: a('not_fitted'),
  }
}

/**
 * B — Purpose-built two-flat building, separate entrances (§20.B / §25.3).
 *
 * Not Section 257. Separate private entrances → no FSO common-parts duty,
 * LACORS guidance used only as a risk reference. The shared-route door
 * recommendation (R-F01) is suppressed in favour of its advisory
 * counterpart (R-F01b).
 */
export function scenarioB(): AnswerMap {
  return {
    A1: a('purpose-built'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('separate'),
    F1b: a('not_fitted'),
  }
}

/**
 * C — Converted two-flat building, shared entrance (§20.C / §25.2).
 *
 * All Section 257 criteria met → confirmed Section 257 HMO, case_study_d10
 * applicable (LACORS used as a direct benchmark). Shared entrance hall with
 * a timber-panelled stair soffit and no smoke alarms produces strong
 * common-parts/stair and alarm findings.
 */
export function scenarioC(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    D1: a('hardboard'),
    D10: a('timber_panelling'),
    E1: a('none'),
  }
}

/**
 * D — Converted two-flat building, separate entrances (§20.D / §25.2/§25.3).
 *
 * Same Section 257 criteria as C → confirmed Section 257 HMO, case_study_d10
 * still applicable (driven by A1-A5, independent of entrance configuration).
 * Separate entrances → no shared hall/stair, so the common_parts and
 * compartmentation risk domains are empty (no shared infrastructure to
 * assess) — but flat-level statutory duties (gas, CO alarm, etc.) still
 * apply and are still assessed.
 */
export function scenarioD(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('separate'),
    G1: a('within_12_months'),
    G4a: a('yes'),
    G4b: a('no'),
  }
}

/**
 * E — Upper flat with a viable external steel staircase (§20.E / §25.4).
 *
 * A confirmed, usable, sound-condition external escape route for the upper
 * flat (B2/B2a/B2c) suppresses RF-C01 ("sole means of escape is the shared
 * route") — the tool must not over-prescribe escape-window/sole-route
 * remedies when an independent route already exists.
 */
export function scenarioE(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    B2: a('yes_external_steel_stair'),
    B2a: a('yes'),
    B2c: a('yes'),
  }
}

/**
 * F — Unknown stair compartmentation (§20.F / §25.6).
 *
 * Shared entrance hall (sharedHall=true) but D10 (stair soffit/wall
 * construction) is unanswered. computeStairCompartmentationConfidence
 * returns 'unknown' and none of RF-S01-S06 are triggered by other D-section
 * answers, so the fallback RF-S-INVESTIGATE factor fires — surfacing as
 * "unknown risk requiring investigation", never as a clean ("low") result.
 */
export function scenarioF(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
  }
}

/**
 * G — Hollow-core flat entrance doors onto a shared route (§20.G / §25.5).
 *
 * Shared entrance hall with the upper-flat entrance door confirmed as a
 * shared escape route (F6a='yes'). The door's hollow-core construction is a
 * known high-severity risk factor (RF-DR-UF-CONSTR); combined with no
 * working self-closer (F1b='not_fitted') it produces a P2_high risk-based
 * door recommendation (R-F01).
 */
export function scenarioG(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    F6a: a('yes'),
    door_uf_construction: a('hollow_core'),
    F1b: a('not_fitted'),
  }
}

/**
 * H — Fixed combustion appliance present, no CO alarm (§20.H / §25.7).
 *
 * G4a='yes' (appliance present) + G4b='no' (no CO alarm) is a legal
 * requirement under the Smoke and Carbon Monoxide Alarm (Amendment)
 * Regulations 2022 (R-G04, P1_urgent).
 */
export function scenarioH(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    G4a: a('yes'),
    G4b: a('no'),
  }
}
