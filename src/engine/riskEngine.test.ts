/**
 * riskEngine.test.ts — Unit tests for the FireRegs v2 risk model
 * (computeRisk / docs/4-Risk-Engine-Refactor.md, §15).
 *
 * Pure tests: no React, no DOM, no localStorage.
 *
 * Covers the §25.4-§25.6 acceptance criteria via Scenarios E, F, G:
 *   - E: a viable external steel staircase reduces "sole shared route" risk
 *        without zeroing out common-parts/compartmentation risk (§10.2)
 *   - F: unknown stair compartmentation surfaces as unknown_risk requiring
 *        investigation, never as "low risk" (§12.2)
 *   - G: a hollow-core flat entrance door onto a shared route is High
 *        severity (§15.3)
 */

import { describe, it, expect } from 'vitest'
import { classify } from './classifier'
import { computeRisk } from './riskEngine'
import type { AnswerMap, RiskAssessment, RiskFactor, RiskKnowledge, RiskSeverity } from '../state/AppState'

// ---------------------------------------------------------------------------
// Test helpers (mirrors classifier.v2.test.ts)
// ---------------------------------------------------------------------------

type Confidence = 'confirmed' | 'not_sure'

function a(value: string, confidence: Confidence = 'confirmed') {
  return { value, confidence, answered_at: '2026-01-01T00:00:00.000Z' }
}

/** Converted, pre-1991, two flats, both rented, in Richmond → confirmed §257. */
function convertedS257(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
  }
}

function riskFor(answers: AnswerMap): RiskAssessment {
  return computeRisk(answers, classify(answers))
}

function factor(result: RiskAssessment, id: string): RiskFactor | undefined {
  return result.risk_factors.find((rf) => rf.id === id)
}

const SEVERITY_ORDER: Record<RiskSeverity, number> = { low: 0, normal: 1, elevated: 2, high: 3 }
const KNOWLEDGE_ORDER: Record<RiskKnowledge, number> = { known_risk: 0, potential_risk: 1, unknown_risk: 2 }

// ---------------------------------------------------------------------------
// Shape and roll-up
// ---------------------------------------------------------------------------

describe('computeRisk — shape and roll-up', () => {
  it('returns all six domains, and overall is the worst across them', () => {
    const answers = { ...convertedS257(), B1: a('communal') }
    const result = riskFor(answers)

    const domains = result.domains
    for (const domain of ['escape', 'doors', 'detection', 'compartmentation', 'common_parts', 'management'] as const) {
      expect(domains[domain]).toBeDefined()
      expect(domains[domain].factors).toEqual(
        result.risk_factors.filter((rf) => rf.domain === domain).map((rf) => rf.id)
      )
    }

    const maxSeverity = Object.values(domains).reduce(
      (acc, d) => (SEVERITY_ORDER[d.severity] > SEVERITY_ORDER[acc] ? d.severity : acc),
      'low' as RiskSeverity
    )
    const maxKnowledge = Object.values(domains).reduce(
      (acc, d) => (KNOWLEDGE_ORDER[d.knowledge] > KNOWLEDGE_ORDER[acc] ? d.knowledge : acc),
      'known_risk' as RiskKnowledge
    )
    expect(result.overall_severity).toBe(maxSeverity)
    expect(result.overall_knowledge).toBe(maxKnowledge)
  })

  it('is pure — identical inputs produce identical output', () => {
    const answers = { ...convertedS257(), B1: a('communal'), E1: a('none') }
    const classification = classify(answers)
    expect(computeRisk(answers, classification)).toEqual(computeRisk(answers, classification))
  })
})

// ---------------------------------------------------------------------------
// Scenario E — external steel staircase (§10.2, §25.4)
// ---------------------------------------------------------------------------

describe('Scenario E — external steel staircase (§10.2, §25.4)', () => {
  it('a viable external escape route suppresses the sole-shared-route escape factor', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      B2: a('yes_external_steel_stair'),
      B2a: a('yes'),
      B2c: a('yes'),
    }
    const result = riskFor(answers)
    expect(factor(result, 'RF-C01')).toBeUndefined()
  })

  it('an unverified external escape route does not reduce risk and requires verification', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      B2: a('yes_external_steel_stair'),
      // B2a / B2c unanswered -> viability cannot be confirmed
    }
    const result = riskFor(answers)
    // Sole-route risk is NOT suppressed when the route is unverified.
    expect(factor(result, 'RF-C01')).toBeDefined()
    const verify = factor(result, 'RF-ESC-VERIFY')
    expect(verify?.knowledge).toBe('unknown_risk')
  })

  it('an obstructed external escape route is treated as not viable and needs remediation', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      B2: a('yes_external_steel_stair'),
      B2a: a('no_obstructed'),
    }
    const result = riskFor(answers)
    expect(factor(result, 'RF-C01')).toBeDefined()
    const restore = factor(result, 'RF-ESC-RESTORE')
    expect(restore?.severity).toBe('elevated')
    expect(restore?.knowledge).toBe('known_risk')
  })

  it('a viable external stair does not zero out common-parts or compartmentation risk', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      B2: a('yes_external_steel_stair'),
      B2a: a('yes'),
      B2c: a('yes'),
      D1: a('hardboard'),
    }
    const result = riskFor(answers)
    expect(result.domains.common_parts.severity).toBe('elevated')
    expect(factor(result, 'RF-D01')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario F — unknown stair compartmentation (§12.2, §25.6)
// ---------------------------------------------------------------------------

describe('Scenario F — unknown stair compartmentation (§12.2, §25.6)', () => {
  it('unanswered stair enclosure construction yields unknown_risk requiring investigation, not low', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      // D10-D17 left unanswered
    }
    const result = riskFor(answers)
    const investigate = factor(result, 'RF-S-INVESTIGATE')
    expect(investigate).toBeDefined()
    expect(investigate?.severity).toBe('normal')
    expect(investigate?.knowledge).toBe('unknown_risk')
    expect(result.domains.compartmentation.severity).not.toBe('low')
    expect(result.domains.compartmentation.knowledge).toBe('unknown_risk')
  })

  it('a confirmed continuous masonry enclosure with no defects scores as genuinely low/known', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      D10: a('masonry'),
      D11: a('post_1991'),
      D12: a('12_5'),
      D13: a('fire_resistant'),
      D14: a('intrusive_confirmed'),
      D15: a('sealed'),
      D16: a('yes'),
      D17: a('no'),
    }
    const result = riskFor(answers)
    expect(factor(result, 'RF-S-INVESTIGATE')).toBeUndefined()
    expect(result.domains.compartmentation.severity).toBe('low')
    expect(result.domains.compartmentation.knowledge).toBe('known_risk')
  })

  it('separate-entrance properties have no shared stair compartmentation to assess', () => {
    const answers: AnswerMap = { ...convertedS257(), B1: a('separate') }
    const result = riskFor(answers)
    expect(result.domains.compartmentation.severity).toBe('low')
    expect(result.domains.compartmentation.factors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Scenario G — hollow-core doors onto shared route (§15.3, §25.5)
// ---------------------------------------------------------------------------

describe('Scenario G — hollow-core flat entrance doors onto a shared route (§15.3, §25.5)', () => {
  it('a hollow-core upper flat entrance door onto a shared route is High severity', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      F6a: a('yes'),
      door_uf_construction: a('hollow_core'),
    }
    const result = riskFor(answers)
    const doorFactor = factor(result, 'RF-DR-UF-CONSTR')
    expect(doorFactor?.severity).toBe('high')
    expect(doorFactor?.knowledge).toBe('known_risk')
    expect(result.domains.doors.severity).toBe('high')
  })

  it('the same hollow-core door is only Elevated when the route is not shared', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      F6a: a('no'),
      door_uf_construction: a('hollow_core'),
    }
    const result = riskFor(answers)
    expect(factor(result, 'RF-DR-UF-CONSTR')?.severity).toBe('elevated')
  })

  it('unknown door construction is flagged for investigation, never scored as low', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      F6a: a('yes'),
      door_gf_construction: a('unknown'),
    }
    const result = riskFor(answers)
    const doorFactor = factor(result, 'RF-DR-GF-CONSTR-UNK')
    expect(doorFactor?.severity).toBe('normal')
    expect(doorFactor?.knowledge).toBe('unknown_risk')
  })
})

// ---------------------------------------------------------------------------
// §15.3 — door risk weighting table
// ---------------------------------------------------------------------------

describe('§15.3 — door risk weighting', () => {
  it('no self-closer on a shared route is Elevated', () => {
    const answers: AnswerMap = { ...convertedS257(), B1: a('communal'), F6a: a('yes'), F1b: a('not_fitted') }
    const result = riskFor(answers)
    expect(factor(result, 'RF-DR-UF-CLOSER')?.severity).toBe('elevated')
  })

  it('door gaps / poor fit on a shared route is Elevated', () => {
    const answers: AnswerMap = { ...convertedS257(), B1: a('communal'), F6a: a('yes'), door_gf_fit: a('no') }
    const result = riskFor(answers)
    expect(factor(result, 'RF-DR-GF-FIT')?.severity).toBe('elevated')
  })

  it('a key required to escape via the building final exit is High', () => {
    const answers: AnswerMap = { ...convertedS257(), B1: a('communal'), door_final_keyless: a('no') }
    const result = riskFor(answers)
    const keyFactor = factor(result, 'RF-DR-FINAL-KEY')
    expect(keyFactor?.severity).toBe('high')
    expect(result.domains.doors.severity).toBe('high')
  })

  it('a key required on an internal escape route is High', () => {
    const answers: AnswerMap = { ...convertedS257(), F5: a('yes') }
    const result = riskFor(answers)
    expect(factor(result, 'RF-DR-INTERNAL-KEY')?.severity).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Detection domain
// ---------------------------------------------------------------------------

describe('detection domain', () => {
  it('no smoke/heat alarms fitted is High severity', () => {
    const answers: AnswerMap = { ...convertedS257(), E1: a('none') }
    const result = riskFor(answers)
    expect(result.domains.detection.severity).toBe('high')
    expect(factor(result, 'RF-DET-NONE')).toBeDefined()
  })

  it('alarms that have never been tested produce an unknown_risk factor, not a clean bill of health', () => {
    const answers: AnswerMap = { ...convertedS257(), E1: a('d1'), E7: a('never_unknown') }
    const result = riskFor(answers)
    const stale = factor(result, 'RF-DET-NEVER')
    expect(stale?.knowledge).toBe('unknown_risk')
    expect(result.domains.detection.knowledge).toBe('unknown_risk')
  })
})

// ---------------------------------------------------------------------------
// Management domain
// ---------------------------------------------------------------------------

describe('management domain', () => {
  it('a fixed combustion appliance without a CO alarm is High severity (legal requirement)', () => {
    const answers: AnswerMap = { ...convertedS257(), G4a: a('yes'), G4b: a('no') }
    const result = riskFor(answers)
    const co = factor(result, 'RF-MGT-CO')
    expect(co?.severity).toBe('high')
    expect(co?.description).toMatch(/2022/)
  })

  it('no management/maintenance arrangement at all is High severity', () => {
    const answers: AnswerMap = { ...convertedS257(), H4: a('none') }
    const result = riskFor(answers)
    expect(factor(result, 'RF-MGT-H4')?.severity).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Compartmentation — stair sub-scoring carryover (RF-S01-S06)
// ---------------------------------------------------------------------------

describe('compartmentation — stair sub-scoring carryover (RF-S01-S06)', () => {
  it('timber panelling stair enclosure lining is High severity', () => {
    const answers: AnswerMap = { ...convertedS257(), B1: a('communal'), D10: a('timber_panelling') }
    const result = riskFor(answers)
    expect(factor(result, 'RF-S01')?.severity).toBe('high')
  })

  it('suspected hidden voids are a potential (not yet confirmed) compartmentation risk', () => {
    const answers: AnswerMap = { ...convertedS257(), B1: a('communal'), D10: a('masonry'), D17: a('yes') }
    const result = riskFor(answers)
    const voids = factor(result, 'RF-S05')
    expect(voids?.severity).toBe('elevated')
    expect(voids?.knowledge).toBe('potential_risk')
  })
})

// ---------------------------------------------------------------------------
// §15.1 — independence of severity and knowledge dimensions
// ---------------------------------------------------------------------------

describe('overall_severity / overall_knowledge independence (§15.1)', () => {
  it('overall severity and overall knowledge can be driven by different domains', () => {
    const answers: AnswerMap = {
      ...convertedS257(),
      B1: a('communal'),
      F6a: a('yes'),
      // Doors domain: known, high severity.
      door_uf_construction: a('hollow_core'),
      // Common-parts domain: low severity, but unconfirmed.
      D3: a('unknown'),
    }
    const result = riskFor(answers)

    expect(result.domains.doors.severity).toBe('high')
    expect(result.domains.doors.knowledge).toBe('known_risk')

    expect(result.domains.common_parts.severity).toBe('low')
    expect(result.domains.common_parts.knowledge).toBe('unknown_risk')

    expect(result.overall_severity).toBe('high')
    expect(result.overall_knowledge).toBe('unknown_risk')
  })
})
