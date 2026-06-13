/**
 * scenarios.test.ts — §20 scenario regression tests (docs/7-Clean-Break-and-
 * Regression-Tests.md, action item 6 / §25 success criteria).
 *
 * Each scenario drives the full v2 pipeline:
 *   classify -> deriveLegalFramework -> computeRisk -> computeRemediesV2 -> generateReportV2
 *
 * Pure tests: no React, no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest'
import { classify, deriveLegalFramework } from './classifier'
import { computeRisk } from './riskEngine'
import { computeRemediesV2 } from './remedyEngine.v2'
import { generateReportV2 } from './reportGenerator.v2'
import type { AnswerMap, PropertyIdentity, RiskFactor, ResolvedRemedy } from '../state/AppState'
import {
  scenarioA,
  scenarioB,
  scenarioC,
  scenarioD,
  scenarioE,
  scenarioF,
  scenarioG,
  scenarioH,
} from './__fixtures__/scenarios'

const PROPERTY: PropertyIdentity = {
  address_line_1: '1 Test Street',
  address_line_2: null,
  town: 'Richmond',
  postcode: 'TW9 1AA',
  postcode_normalised: 'TW9 1AA',
  flat_ref: null,
}

function evaluate(answers: AnswerMap) {
  const classification = classify(answers)
  const risk = computeRisk(answers, classification)
  const legalFramework = deriveLegalFramework(answers, classification)
  const remedies = computeRemediesV2(answers, classification, risk)
  const report = generateReportV2(PROPERTY, answers, classification, legalFramework, risk, remedies)
  return { classification, risk, legalFramework, remedies, report }
}

function findRemedy(remedies: ResolvedRemedy[], id: string): ResolvedRemedy | undefined {
  return remedies.find((r) => r.rule_id === id)
}

function findFactor(factors: RiskFactor[], id: string): RiskFactor | undefined {
  return factors.find((f) => f.id === id)
}

// ---------------------------------------------------------------------------
// Scenario A — Purpose-built two-flat building, shared entrance (§20.A / §25.1)
// ---------------------------------------------------------------------------

describe('Scenario A — purpose-built, shared entrance', () => {
  it('is not Section 257, but common-parts duties may apply', () => {
    const { classification, legalFramework } = evaluate(scenarioA())
    expect(classification.hmo).toBe('not_hmo')
    expect(classification.section_257).toBe(false)
    expect(legalFramework.section_257_hmo).toBe('not_applicable')
    expect(legalFramework.fire_safety_order_common_parts).toBe('applies')
  })

  it('D10 is not applicable as a legal duty', () => {
    const { classification } = evaluate(scenarioA())
    expect(classification.case_study_d10).toBe('not_applicable')
  })

  it('the shared route + hollow-core door + no self-closer produces a high-priority risk-based recommendation', () => {
    const { risk, remedies, report } = evaluate(scenarioA())

    const constr = findFactor(risk.risk_factors, 'RF-DR-UF-CONSTR')
    expect(constr?.severity).toBe('high')
    expect(constr?.knowledge).toBe('known_risk')

    const closerRemedy = findRemedy(remedies.recommendations, 'R-F01')
    expect(closerRemedy).toBeDefined()
    expect(closerRemedy?.legal_status).toBe('risk_based_recommendation')
    expect(closerRemedy?.priority).toBe('P2_high')

    const section16 = report.sections.find((s) => s.id === 16)!
    expect(section16.body).toContain(`Recommended: ${closerRemedy!.text}`)
  })

  it('the D10 stair-enclosure benchmark is downgraded to risk-based, never a legal requirement', () => {
    const { remedies } = evaluate(scenarioA())
    const recommendation = findRemedy(remedies.recommendations, 'R-D01-hardboard')
    expect(recommendation?.legal_status).toBe('risk_based_recommendation')
    expect(findRemedy(remedies.legal_requirements, 'R-D01-hardboard')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario B — Purpose-built two-flat building, separate entrances (§20.B / §25.3)
// ---------------------------------------------------------------------------

describe('Scenario B — purpose-built, separate entrances', () => {
  it('is not Section 257; no FSO common-parts duty; LACORS is a risk reference only', () => {
    const { classification, legalFramework } = evaluate(scenarioB())
    expect(classification.hmo).toBe('not_hmo')
    expect(classification.entrance_configuration).toBe('separate_private_entrances')
    expect(legalFramework.fire_safety_order_common_parts).toBe('not_applicable')
    expect(legalFramework.lacors_guidance_use).toBe('risk_reference')
  })

  it('per-flat statutory duties (smoke/CO, electrical, HHSRS) still apply', () => {
    const { legalFramework } = evaluate(scenarioB())
    expect(legalFramework.smoke_co_alarm_regulations).toBe('applies')
    expect(legalFramework.electrical_safety).toBe('applies')
    expect(legalFramework.hhsrs_fire_hazard).toBe('applies')
  })

  it('suppresses the shared-route door recommendation (R-F01) in favour of its advisory counterpart (R-F01b)', () => {
    const { remedies, report } = evaluate(scenarioB())
    expect(findRemedy(remedies.recommendations, 'R-F01')).toBeUndefined()

    const advisory = findRemedy(remedies.advisory, 'R-F01b')
    expect(advisory).toBeDefined()
    expect(advisory?.legal_status).toBe('advisory_good_practice')

    const section16 = report.sections.find((s) => s.id === 16)!
    expect(section16.body).toContain(`Advisory: ${advisory!.text}`)
  })
})

// ---------------------------------------------------------------------------
// Scenario C — Converted two-flat building, shared entrance (§20.C / §25.2)
// ---------------------------------------------------------------------------

describe('Scenario C — converted, shared entrance', () => {
  it('is a confirmed Section 257 HMO with the D10 benchmark applicable', () => {
    const { classification, legalFramework } = evaluate(scenarioC())
    expect(classification.hmo).toBe('section_257_hmo')
    expect(classification.section_257).toBe(true)
    expect(classification.confidence).toBe('confirmed')
    expect(classification.case_study_d10).toBe('applicable')
    expect(legalFramework.section_257_hmo).toBe('applies')
    expect(legalFramework.lacors_guidance_use).toBe('direct_benchmark')
  })

  it('the D10 benchmark recommendation is NOT downgraded (stays a LACORS benchmark)', () => {
    const { remedies } = evaluate(scenarioC())
    const recommendation = findRemedy(remedies.recommendations, 'R-D01-hardboard')
    expect(recommendation?.legal_status).toBe('lacors_benchmark_recommendation')
  })

  it('a timber-panelled stair soffit produces a strong stair-compartmentation recommendation', () => {
    const { risk, remedies } = evaluate(scenarioC())
    expect(findFactor(risk.risk_factors, 'RF-S01')?.severity).toBe('high')
    const stairRecommendation = findRemedy(remedies.recommendations, 'R-S02')
    expect(stairRecommendation?.legal_status).toBe('lacors_benchmark_recommendation')
    expect(stairRecommendation?.priority).toBe('P2_high')
  })

  it('no smoke alarms present is a legal requirement (R-E04)', () => {
    const { remedies, report } = evaluate(scenarioC())
    const remedy = findRemedy(remedies.legal_requirements, 'R-E04')
    expect(remedy).toBeDefined()
    expect(remedy?.priority).toBe('P1_urgent')

    const section15 = report.sections.find((s) => s.id === 15)!
    expect(section15.body).toContain(`Required: ${remedy!.text}`)
  })
})

// ---------------------------------------------------------------------------
// Scenario D — Converted two-flat building, separate entrances (§20.D / §25.2/25.3)
// ---------------------------------------------------------------------------

describe('Scenario D — converted, separate entrances', () => {
  it('can still be a confirmed Section 257 HMO with D10 applicable, independent of entrance configuration', () => {
    const { classification } = evaluate(scenarioD())
    expect(classification.hmo).toBe('section_257_hmo')
    expect(classification.case_study_d10).toBe('applicable')
    expect(classification.entrance_configuration).toBe('separate_private_entrances')
  })

  it('no FSO common-parts duty for a separate-entrance building, even when Section 257 applies', () => {
    const { legalFramework } = evaluate(scenarioD())
    expect(legalFramework.fire_safety_order_common_parts).toBe('not_applicable')
    expect(legalFramework.section_257_hmo).toBe('applies')
  })

  /**
   * [Inference] The v2 risk engine gates ALL compartmentation and common_parts
   * risk factors on `sharedHall` (entrance_configuration), so a
   * separate-entrance building always reports these two domains as empty/low/
   * known — there is no separate "between-flats compartmentation" risk model.
   * This is "lower common-parts risk" per §20.D; D-section answers are simply
   * not assessed in this configuration.
   */
  it('the common_parts and compartmentation risk domains are empty (no shared infrastructure to assess)', () => {
    const { risk } = evaluate(scenarioD())
    expect(risk.domains.common_parts.factors).toEqual([])
    expect(risk.domains.compartmentation.factors).toEqual([])
    expect(risk.domains.common_parts.severity).toBe('low')
    expect(risk.domains.compartmentation.severity).toBe('low')
  })

  it('flat-level statutory duties (gas, CO alarm) are still assessed', () => {
    const { legalFramework, remedies } = evaluate(scenarioD())
    expect(legalFramework.gas_safety).toBe('applies')

    const coRemedy = findRemedy(remedies.legal_requirements, 'R-G04')
    expect(coRemedy).toBeDefined()
    expect(coRemedy?.priority).toBe('P1_urgent')
  })
})

// ---------------------------------------------------------------------------
// Scenario E — Upper flat with a viable external steel staircase (§20.E / §25.4)
// ---------------------------------------------------------------------------

describe('Scenario E — upper flat, external steel staircase', () => {
  it('a confirmed-viable external route suppresses the sole-route escape factor (RF-C01)', () => {
    const { risk, remedies } = evaluate(scenarioE())
    expect(findFactor(risk.risk_factors, 'RF-C01')).toBeUndefined()
    expect(findFactor(risk.risk_factors, 'RF-ESC-VERIFY')).toBeUndefined()
    expect(findFactor(risk.risk_factors, 'RF-ESC-RESTORE')).toBeUndefined()
    expect(findRemedy(remedies.recommendations, 'R-C01')).toBeUndefined()
    expect(findRemedy(remedies.further_investigation, 'R-B01')).toBeUndefined()
    expect(findRemedy(remedies.recommendations, 'R-B02')).toBeUndefined()
  })

  it('a poor-condition external stair is flagged for restoration, and does not suppress RF-C01', () => {
    const answers: AnswerMap = { ...scenarioE(), B2c: { value: 'poor_condition', confidence: 'confirmed', answered_at: '2026-01-01T00:00:00.000Z' } }
    const { risk, remedies } = evaluate(answers)

    const restore = findFactor(risk.risk_factors, 'RF-ESC-RESTORE')
    expect(restore?.severity).toBe('elevated')
    expect(restore?.knowledge).toBe('known_risk')

    const restoreRemedy = findRemedy(remedies.recommendations, 'R-B02')
    expect(restoreRemedy?.legal_status).toBe('risk_based_recommendation')
    expect(restoreRemedy?.priority).toBe('P2_high')

    // External route no longer viable -> sole-route factor (RF-C01) now applies.
    expect(findFactor(risk.risk_factors, 'RF-C01')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario F — Unknown stair compartmentation (§20.F / §25.6)
// ---------------------------------------------------------------------------

describe('Scenario F — unknown stair compartmentation', () => {
  it('reports the compartmentation domain as unknown risk, never as a clean "low" result', () => {
    const { risk } = evaluate(scenarioF())
    expect(risk.domains.compartmentation.knowledge).toBe('unknown_risk')
    expect(risk.domains.compartmentation.severity).not.toBe('low')
    expect(risk.domains.compartmentation.factors).toContain('RF-S-INVESTIGATE')
  })

  it('recommends further investigation rather than no action', () => {
    const { remedies, report } = evaluate(scenarioF())
    const remedy = findRemedy(remedies.further_investigation, 'R-S01')
    expect(remedy).toBeDefined()
    expect(remedy?.legal_status).toBe('further_investigation_required')

    const section14 = report.sections.find((s) => s.id === 14)!
    expect(section14.body).toContain(`Further investigation required: ${remedy!.text}`)
  })
})

// ---------------------------------------------------------------------------
// Scenario G — Hollow-core flat entrance doors onto a shared route (§20.G / §25.5)
// ---------------------------------------------------------------------------

describe('Scenario G — hollow-core doors onto a shared route', () => {
  it('the hollow-core upper-flat door is a known high-severity risk factor', () => {
    const { risk } = evaluate(scenarioG())
    const constr = findFactor(risk.risk_factors, 'RF-DR-UF-CONSTR')
    expect(constr?.severity).toBe('high')
    expect(constr?.knowledge).toBe('known_risk')
    expect(constr?.description).toContain('hollow-core')
  })

  it('produces a high-priority (P2_high) risk-based door recommendation with a stated risk basis', () => {
    const { remedies, report } = evaluate(scenarioG())
    const remedy = findRemedy(remedies.recommendations, 'R-F01')
    expect(remedy).toBeDefined()
    expect(remedy?.legal_status).toBe('risk_based_recommendation')
    expect(remedy?.priority).toBe('P2_high')
    expect(remedy?.risk_basis.length).toBeGreaterThan(0)

    const section12 = report.sections.find((s) => s.id === 12)!
    expect(section12.body).toMatch(/hollow-core/i)
  })
})

// ---------------------------------------------------------------------------
// Scenario H — CO appliance present, no CO alarm (§20.H / §25.7)
// ---------------------------------------------------------------------------

describe('Scenario H — CO appliance present, no CO alarm', () => {
  it('is a P1_urgent legal requirement', () => {
    const { remedies, report } = evaluate(scenarioH())
    const remedy = findRemedy(remedies.legal_requirements, 'R-G04')
    expect(remedy).toBeDefined()
    expect(remedy?.priority).toBe('P1_urgent')
    expect(remedy?.legal_status).toBe('legal_requirement')

    const section15 = report.sections.find((s) => s.id === 15)!
    expect(section15.body).toContain(`Required: ${remedy!.text}`)
  })
})
