/**
 * remedyEngine.v2.test.ts — Unit tests for the FireRegs v2 remedy engine
 * (computeRemediesV2 / docs/5-Remedy-Engine-Refactor.md, §16).
 *
 * Pure tests: no React, no DOM, no localStorage.
 *
 * Covers the §25 acceptance criteria via Scenarios A, B, G, H plus the §22
 * D10-suppression invariant:
 *   - A: a purpose-built building's Case Study D10 benchmark recommendation
 *        is downgraded from a LACORS benchmark to a risk-based recommendation,
 *        and never appears as a legal requirement
 *   - (contrast) a converted §257 building keeps the D10 benchmark as a
 *        lacors_benchmark_recommendation (no downgrade)
 *   - B: separate-private-entrance buildings receive no shared-route
 *        recommendation (R-F01 suppressed) but do get its advisory
 *        counterpart (R-F01b)
 *   - G: a hollow-core door + no self-closer onto a shared route produces a
 *        P2_high risk-based recommendation (R-F01)
 *   - H: a fixed combustion appliance with no CO alarm is a legal requirement
 *        (R-G04); an uncertain appliance/alarm is further-investigation (R-G04b)
 *   - confidence downgrade: a 'confirmed' rule cannot be more certain than a
 *        'probable' classification
 *   - remediation_schedule: priority-ordered across all groups
 */

import { describe, it, expect } from 'vitest'
import { classify } from './classifier'
import { computeRisk } from './riskEngine'
import { computeRemediesV2 } from './remedyEngine.v2'
import type { AnswerMap, RemedySummary, ResolvedRemedy } from '../state/AppState'

// ---------------------------------------------------------------------------
// Test helpers (mirrors classifier.v2.test.ts / riskEngine.test.ts)
// ---------------------------------------------------------------------------

type Confidence = 'confirmed' | 'not_sure'

function a(value: string, confidence: Confidence = 'confirmed') {
  return { value, confidence, answered_at: '2026-01-01T00:00:00.000Z' }
}

/** Converted, pre-1991, two flats, both rented → confirmed §257, D10 applicable. */
function convertedS257(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
  }
}

/** Purpose-built two flats → not §257, case_study_d10 = 'not_applicable'. */
function purposeBuilt(): AnswerMap {
  return {
    A1: a('purpose-built'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
  }
}

function remediesFor(answers: AnswerMap): RemedySummary {
  const classification = classify(answers)
  const risk = computeRisk(answers, classification)
  return computeRemediesV2(answers, classification, risk)
}

function find(remedies: ResolvedRemedy[], id: string): ResolvedRemedy | undefined {
  return remedies.find((r) => r.rule_id === id)
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

describe('computeRemediesV2 — shape', () => {
  it('returns all five §16.2 output groups', () => {
    const summary = remediesFor(convertedS257())
    expect(summary.legal_requirements).toBeInstanceOf(Array)
    expect(summary.recommendations).toBeInstanceOf(Array)
    expect(summary.further_investigation).toBeInstanceOf(Array)
    expect(summary.advisory).toBeInstanceOf(Array)
    expect(summary.remediation_schedule).toBeInstanceOf(Array)
  })

  it('is pure — identical inputs produce identical output', () => {
    const answers = { ...convertedS257(), B1: a('communal') }
    expect(remediesFor(answers)).toEqual(remediesFor(answers))
  })

  it('remediation_schedule contains every active remedy, priority-ordered', () => {
    const summary = remediesFor({ ...convertedS257(), B1: a('communal'), D1: a('hardboard'), E1: a('none') })
    const allGrouped = [
      ...summary.legal_requirements,
      ...summary.recommendations,
      ...summary.further_investigation,
      ...summary.advisory,
    ]
    expect(summary.remediation_schedule).toHaveLength(allGrouped.length)
    expect(new Set(summary.remediation_schedule.map((r) => r.rule_id))).toEqual(
      new Set(allGrouped.map((r) => r.rule_id))
    )

    const PRIORITY_ORDER = ['P1_urgent', 'P2_high', 'P3_medium', 'P4_low', 'investigate']
    const indices = summary.remediation_schedule.map((r) => PRIORITY_ORDER.indexOf(r.priority))
    expect(indices).toEqual([...indices].sort((x, y) => x - y))
  })
})

// ---------------------------------------------------------------------------
// Scenario A — Purpose-built building, §22 D10 suppression invariant
// ---------------------------------------------------------------------------

describe('Scenario A — purpose-built building (§22 D10 suppression)', () => {
  it('the D10 stair-enclosure benchmark is downgraded to a risk-based recommendation, not a legal requirement', () => {
    const summary = remediesFor({ ...purposeBuilt(), B1: a('communal'), D1: a('hardboard') })

    const recommendation = find(summary.recommendations, 'R-D01-hardboard')
    expect(recommendation).toBeDefined()
    expect(recommendation?.legal_status).toBe('risk_based_recommendation')

    expect(find(summary.legal_requirements, 'R-D01-hardboard')).toBeUndefined()
  })

  it('no R-D0* rule ever appears as a legal requirement for a purpose-built building', () => {
    const summary = remediesFor({
      ...purposeBuilt(),
      B1: a('communal'),
      D1: a('hardboard'),
      D2: a('hardboard'),
      D4: a('present'),
      D5: a('present'),
    })
    expect(summary.legal_requirements.some((r) => r.rule_id.startsWith('R-D0'))).toBe(false)
  })

  it('statutory items (gas, smoke alarms) remain legal requirements regardless of building origin', () => {
    const summary = remediesFor({ ...purposeBuilt(), B1: a('communal'), G1: a('overdue'), E1: a('none') })
    expect(find(summary.legal_requirements, 'R-G01')).toBeDefined()
    expect(find(summary.legal_requirements, 'R-E04')).toBeDefined()
  })
})

describe('contrast — converted §257 building keeps the D10 benchmark undowngraded', () => {
  it('R-D01-hardboard remains a lacors_benchmark_recommendation when case_study_d10 is applicable', () => {
    const summary = remediesFor({ ...convertedS257(), B1: a('communal'), D1: a('hardboard') })
    const recommendation = find(summary.recommendations, 'R-D01-hardboard')
    expect(recommendation?.legal_status).toBe('lacors_benchmark_recommendation')
  })
})

// ---------------------------------------------------------------------------
// Scenario B / §25.3 — separate-private-entrance suppression
// ---------------------------------------------------------------------------

describe('Scenario B — separate-private-entrance suppression (§25.3)', () => {
  it('suppresses the shared-route door recommendation (R-F01) for separate entrances', () => {
    const summary = remediesFor({ ...purposeBuilt(), B1: a('separate'), F1b: a('not_fitted') })
    expect(find(summary.recommendations, 'R-F01')).toBeUndefined()
  })

  it('shows the separate-entrance advisory counterpart (R-F01b) instead', () => {
    const summary = remediesFor({ ...purposeBuilt(), B1: a('separate'), F1b: a('not_fitted') })
    const advisory = find(summary.advisory, 'R-F01b')
    expect(advisory).toBeDefined()
    expect(advisory?.legal_status).toBe('advisory_good_practice')
  })

  it('R-F01 is active (not suppressed) for the equivalent shared-entrance building', () => {
    const summary = remediesFor({ ...purposeBuilt(), B1: a('communal'), F6a: a('yes'), F1b: a('not_fitted') })
    const recommendation = find(summary.recommendations, 'R-F01')
    expect(recommendation).toBeDefined()
    expect(recommendation?.legal_status).toBe('risk_based_recommendation')
  })
})

// ---------------------------------------------------------------------------
// Scenario G — hollow-core door / no self-closer onto a shared route (§15.3)
// ---------------------------------------------------------------------------

describe('Scenario G — hollow-core door / no self-closer onto a shared route (§15.3)', () => {
  it('no self-closer on a shared route is a P2_high risk-based recommendation', () => {
    const summary = remediesFor({
      ...convertedS257(),
      B1: a('communal'),
      F6a: a('yes'),
      door_uf_construction: a('hollow_core'),
      F1b: a('not_fitted'),
    })
    const recommendation = find(summary.recommendations, 'R-F01')
    expect(recommendation).toBeDefined()
    expect(recommendation?.legal_status).toBe('risk_based_recommendation')
    expect(recommendation?.priority).toBe('P2_high')
  })
})

// ---------------------------------------------------------------------------
// Scenario H — CO appliance present, no CO alarm (§14.2, §20)
// ---------------------------------------------------------------------------

describe('Scenario H — CO appliance present, no CO alarm (§14.2)', () => {
  it('a fixed combustion appliance with no CO alarm is a P1_urgent legal requirement', () => {
    const summary = remediesFor({ ...convertedS257(), G4a: a('yes'), G4b: a('no') })
    const remedy = find(summary.legal_requirements, 'R-G04')
    expect(remedy).toBeDefined()
    expect(remedy?.priority).toBe('P1_urgent')
  })

  it('an unconfirmed appliance is further-investigation, not a legal requirement', () => {
    const summary = remediesFor({ ...convertedS257(), G4a: a('not_sure') })
    expect(find(summary.legal_requirements, 'R-G04')).toBeUndefined()
    expect(find(summary.further_investigation, 'R-G04b')).toBeDefined()
  })

  it('no appliance present triggers no CO remedy', () => {
    const summary = remediesFor({ ...convertedS257(), G4a: a('no') })
    expect(find(summary.legal_requirements, 'R-G04')).toBeUndefined()
    expect(find(summary.further_investigation, 'R-G04b')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Confidence downgrade
// ---------------------------------------------------------------------------

describe('confidence downgrade', () => {
  it('a confirmed-confidence rule is downgraded to probable when classification confidence is probable', () => {
    // A4 = one_owner_occupied → probable_section_257_hmo, classification.confidence = 'probable'.
    const answers: AnswerMap = { ...convertedS257(), A4: a('one_owner_occupied'), G1: a('overdue') }
    const classification = classify(answers)
    expect(classification.confidence).toBe('probable')

    const summary = remediesFor(answers)
    const remedy = find(summary.legal_requirements, 'R-G01')
    expect(remedy).toBeDefined()
    expect(remedy?.confidence).toBe('probable')
  })
})
