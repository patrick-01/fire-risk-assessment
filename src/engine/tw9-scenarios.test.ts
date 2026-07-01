import { describe, expect, it } from 'vitest'
import { classify, deriveLegalFramework } from './classifier'
import { computeRisk } from './riskEngine'
import { computeRemediesV2 } from './remedyEngine.v2'
import { generateReportV2 } from './reportGenerator.v2'
import type { AnswerMap, PropertyIdentity, ResolvedRemedy, RiskFactor } from '../state/AppState'

type Confidence = 'confirmed' | 'not_sure'

function a(value: string, confidence: Confidence = 'confirmed') {
  return { value, confidence, answered_at: '2026-07-01T00:00:00.000Z' }
}

const PROPERTY: PropertyIdentity = {
  address_line_1: '43 Darell Road',
  address_line_2: null,
  town: 'Richmond',
  postcode: 'TW9 4HA',
  postcode_normalised: 'TW9 4HA',
  flat_ref: null,
}

function convertedBase(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    A6: a('no'),
    B1: a('communal'),
    B4: a('2.5_4m'),
    B5: a('no'),
    B6: a('single_storey'),
  }
}

function purposeBuiltLike(answers: AnswerMap): AnswerMap {
  return { ...answers, A1: a('purpose-built') }
}

function withPoorGroundBedroomWindow(answers: AnswerMap): AnswerMap {
  return {
    ...answers,
    GF_C0: a('yes'),
    GF_C1: a('yes'),
    GF_C1_type: a('sash'),
    GF_C2: a('yes'),
    GF_C3: a('yes'),
    GF_C4: a('no'),
    GF_C5: a('no'),
    GF_C6: a('no'),
    GF_C10: a('no'),
    GF_C13: a('yes'),
  }
}

function evaluate(answers: AnswerMap) {
  const classification = classify(answers)
  const risk = computeRisk(answers, classification)
  const legalFramework = deriveLegalFramework(answers, classification)
  const remedies = computeRemediesV2(answers, classification, risk)
  const report = generateReportV2(PROPERTY, answers, classification, legalFramework, risk, remedies)
  return { classification, risk, legalFramework, remedies, report }
}

function factor(factors: RiskFactor[], id: string): RiskFactor | undefined {
  return factors.find((f) => f.id === id)
}

function remedy(remedies: ResolvedRemedy[], id: string): ResolvedRemedy | undefined {
  return remedies.find((r) => r.rule_id === id)
}

function section(report: ReturnType<typeof evaluate>['report'], title: string) {
  const found = report.sections.find((s) => s.title === title)
  if (!found) throw new Error(`Missing report section: ${title}`)
  return found
}

describe('TW9 archetype 1 — converted Victorian two-flat, shared hall, pre-1991', () => {
  it('classifies as Section 257 / D10 and produces high risk for weak shared-route evidence', () => {
    const { classification, risk, remedies } = evaluate({
      ...convertedBase(),
      D1: a('hardboard'),
      D10: a('timber_panelling'),
      E1g: a('none'),
      E1u: a('none'),
    })

    expect(classification.hmo).toBe('section_257_hmo')
    expect(classification.case_study_d10).toBe('applicable')
    expect(risk.overall_severity).toBe('high')
    expect(remedy(remedies.recommendations, 'R-S02')?.legal_status).toBe('lacors_benchmark_recommendation')
    expect(remedy(remedies.legal_requirements, 'R-E04')).toBeDefined()
  })
})

describe('TW9 archetype 2 — same physical facts, purpose-built', () => {
  it('keeps physical risk factors identical while changing the legal framework', () => {
    const physicalFacts: AnswerMap = {
      ...convertedBase(),
      B2: a('no'),
      C1: a('no'),
      C6: a('no'),
      C11: a('no'),
      C12: a('no'),
      B8: a('long'),
      D1: a('hardboard'),
    }

    const converted = evaluate(physicalFacts)
    const purposeBuilt = evaluate(purposeBuiltLike(physicalFacts))

    expect(converted.classification.case_study_d10).toBe('applicable')
    expect(purposeBuilt.classification.case_study_d10).toBe('not_applicable')
    expect(converted.risk.risk_factors.map((f) => f.id).sort()).toEqual(
      purposeBuilt.risk.risk_factors.map((f) => f.id).sort()
    )
  })
})

describe('TW9 archetypes 3 and 4 — ground-floor escape hierarchy', () => {
  it('does not emit a ground-flat window finding where a rear exit exists', () => {
    const { risk, remedies } = evaluate(withPoorGroundBedroomWindow({ ...convertedBase(), B3: a('yes') }))
    expect(factor(risk.risk_factors, 'RF-GF-C01')).toBeUndefined()
    expect(remedy(remedies.recommendations, 'R-GF-C01')).toBeUndefined()
  })

  it('emits a ground-flat window finding where no rear exit exists', () => {
    const { risk, remedies, report } = evaluate(withPoorGroundBedroomWindow({ ...convertedBase(), B3: a('no') }))
    expect(factor(risk.risk_factors, 'RF-GF-C01')).toBeDefined()
    expect(remedy(remedies.recommendations, 'R-GF-C01')).toBeDefined()
    expect(section(report, 'Ground-floor flat assessment').body).toContain('Bedroom 1 escape window: does-not-qualify')
  })
})

describe('TW9 archetype 5 — loft-converted upper flat above 4.5m', () => {
  it('emits the loft escape factor and a D11-tagged finding without a protected route', () => {
    const { classification, risk, remedies, report } = evaluate({
      ...convertedBase(),
      B4: a('above_4.5m'),
      B6: a('two_level_maisonette'),
      B6a: a('no'),
    })

    expect(classification.effective_storeys).toBe('three_storey')
    expect(classification.case_study_d11).toBe('applicable')
    expect(factor(risk.risk_factors, 'RF-LOFT-ESCAPE')).toBeDefined()
    expect(remedy(remedies.recommendations, 'R-LOFT')?.regulatory_refs).toContain('LACORS Case Study D11')
    expect(section(report, 'LACORS / risk-based recommendations').body).toContain('Case-study tag: D11')
  })
})

describe('TW9 archetype 6 — mixed staircase and mixed detection regressions', () => {
  it('keeps mixed lower-route construction distinct from upper stair construction', () => {
    const { risk, remedies, report } = evaluate({
      ...convertedBase(),
      D10: a('masonry'),
      D12: a('12_5'),
      D14: a('edge_visible'),
      D16: a('yes'),
      D19: a('stud_plasterboard'),
    })

    expect(factor(risk.risk_factors, 'RF-S-LOWER')).toBeDefined()
    expect(factor(risk.risk_factors, 'RF-S-TRANSITION')).toBeDefined()
    expect(remedy(remedies.recommendations, 'R-S04')).toBeDefined()
    expect(section(report, 'Stair compartmentation assessment').body).toContain('lower / ground-floor section')
  })

  it('reports mixed detection provision per flat', () => {
    const { risk, remedies, report } = evaluate({
      ...convertedBase(),
      E1g: a('battery_only'),
      E1u: a('d1'),
      E3g: a('none'),
      E3u: a('yes'),
      E6g: a('no'),
      E6u: a('yes'),
    })

    expect(factor(risk.risk_factors, 'RF-DET-MIXED-PROVISION')).toBeDefined()
    expect(remedy(remedies.advisory, 'R-E07')).toBeDefined()
    expect(section(report, 'Fire detection strategy').body).toContain('Provision is MIXED between the flats')
  })
})
