/**
 * building-type-parity.test.ts — §12 regression (FireRegs_v2 spec item 12 /
 * success criteria item 13).
 *
 * The central guarantee of the purpose-built vs converted refactor: changing
 * ONLY the building type must change the legal framework and report wording,
 * while leaving the assessed PHYSICAL fire risk untouched. Building type
 * selects the regulatory framework; evidence determines the risk.
 *
 * Both answer maps below carry identical physical evidence (Sections B–H). They
 * differ only in the Section-A classification inputs:
 *   - converted     → A1='converted' plus the conversion-only A2='yes'
 *   - purpose-built → A1='purpose-built' (A2 does not exist for this type)
 *
 * Reconciliation of spec items 6 and 12: item 6 wants the report to STATE
 * "Non Section 257" and list the applicable framework; item 12 wants "no
 * Section 257 / D10 / conversion wording". These are reconciled as: the
 * purpose-built report may transparently record Section 257 / Case Study D10
 * as *not applicable*, but must never (a) assert the building IS a Section 257
 * HMO, (b) present D10 as a direct applicable benchmark, or (c) carry any
 * conversion narrative. The assertions below encode that reading.
 *
 * Pure tests: no React, no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest'
import { classify, deriveLegalFramework } from './classifier'
import { computeRisk } from './riskEngine'
import { computeRemediesV2 } from './remedyEngine.v2'
import { generateReportV2 } from './reportGenerator.v2'
import type {
  AnswerMap,
  PropertyIdentity,
  RemedySummary,
  ResolvedRemedy,
} from '../state/AppState'

const ISO = '2026-01-01T00:00:00.000Z'

function a(value: string, confidence: 'confirmed' | 'not_sure' = 'confirmed') {
  return { value, confidence, answered_at: ISO }
}

const PROPERTY: PropertyIdentity = {
  address_line_1: '7 Darell Road',
  address_line_2: 'North Sheen',
  town: 'Richmond',
  postcode: 'TW9 4LF',
  postcode_normalised: 'TW9 4LF',
  flat_ref: '7-7a Darell',
}

/**
 * Identical PHYSICAL evidence for both building types. A shared entrance hall
 * with: a hollow-core upper-flat door and no self-closer onto the shared route;
 * hardboard stair panelling and timber-panelled stair enclosure (Case Study D10
 * territory for a converted building); a 1950–1970 construction era inspected
 * only visually; no alarms; and a combustion appliance with no CO alarm. This
 * spans the escape, doors, detection, compartmentation, common-parts and
 * management risk domains.
 */
function sharedEvidence(): AnswerMap {
  return {
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    F6a: a('yes'),
    door_uf_construction: a('hollow_core'),
    F1b: a('not_fitted'),
    D1: a('hardboard'),
    D10: a('timber_panelling'),
    D11: a('1950_1970'),
    D14: a('visual_only'),
    E1g: a('none'), E1u: a('none'),
    G4a: a('yes'),
    G4b: a('no'),
  }
}

function convertedAnswers(): AnswerMap {
  return { A1: a('converted'), A2: a('yes'), ...sharedEvidence() }
}

function purposeBuiltAnswers(): AnswerMap {
  return { A1: a('purpose-built'), ...sharedEvidence() }
}

function evaluate(answers: AnswerMap) {
  const classification = classify(answers)
  const legalFramework = deriveLegalFramework(answers, classification)
  const risk = computeRisk(answers, classification)
  const remedies = computeRemediesV2(answers, classification, risk)
  const report = generateReportV2(PROPERTY, answers, classification, legalFramework, risk, remedies)
  return { classification, legalFramework, risk, remedies, report }
}

/** Every active remedy appears exactly once in remediation_schedule. */
function allRemedyIds(remedies: RemedySummary): string[] {
  return remedies.remediation_schedule.map((r) => r.rule_id).sort()
}

function findRemedy(remedies: RemedySummary, id: string): ResolvedRemedy | undefined {
  return remedies.remediation_schedule.find((r) => r.rule_id === id)
}

function reportText(report: ReturnType<typeof evaluate>['report']): string {
  return report.sections.map((s) => `${s.title}\n${s.body}`).join('\n\n')
}

describe('Building-type parity — converted vs purpose-built, identical evidence', () => {
  it('the legal classification and framework differ correctly', () => {
    const conv = evaluate(convertedAnswers())
    const pb = evaluate(purposeBuiltAnswers())

    // Converted: confirmed Section 257 HMO, D10 a direct benchmark.
    expect(conv.classification.hmo).toBe('section_257_hmo')
    expect(conv.classification.section_257).toBe(true)
    expect(conv.classification.case_study_d10).toBe('applicable')
    expect(conv.legalFramework.section_257_hmo).toBe('applies')
    expect(conv.legalFramework.lacors_guidance_use).toBe('direct_benchmark')

    // Purpose-built: not a Section 257 HMO, D10 not applicable — but general
    // LACORS risk guidance still applies (it is never switched off by type).
    expect(pb.classification.hmo).toBe('not_hmo')
    expect(pb.classification.section_257).toBe(false)
    expect(pb.classification.case_study_d10).toBe('not_applicable')
    expect(pb.classification.general_lacors_risk_guidance).toBe('applicable')
    expect(pb.legalFramework.section_257_hmo).toBe('not_applicable')
    expect(pb.legalFramework.lacors_guidance_use).toBe('risk_reference')
  })

  it('the assessed physical fire risk is identical (risk is evidence-based, not type-based)', () => {
    const conv = evaluate(convertedAnswers())
    const pb = evaluate(purposeBuiltAnswers())

    expect(pb.risk.overall_severity).toBe(conv.risk.overall_severity)
    expect(pb.risk.overall_knowledge).toBe(conv.risk.overall_knowledge)

    const ids = (r: typeof conv.risk) => r.risk_factors.map((f) => f.id).sort()
    expect(ids(pb.risk)).toEqual(ids(conv.risk))
  })

  it('the same set of remedies fires for both — only the legal basis changes', () => {
    const conv = evaluate(convertedAnswers())
    const pb = evaluate(purposeBuiltAnswers())
    expect(allRemedyIds(pb.remedies)).toEqual(allRemedyIds(conv.remedies))
  })

  it('Case Study D10 stair remedies are a LACORS benchmark when converted, risk-based when purpose-built', () => {
    const conv = evaluate(convertedAnswers())
    const pb = evaluate(purposeBuiltAnswers())

    for (const id of ['R-D01-hardboard', 'R-S02']) {
      expect(findRemedy(conv.remedies, id)?.legal_status).toBe('lacors_benchmark_recommendation')
      expect(findRemedy(pb.remedies, id)?.legal_status).toBe('risk_based_recommendation')
    }
  })

  it('legal requirements are unaffected by building type (no-alarms stays a legal requirement for both)', () => {
    const conv = evaluate(convertedAnswers())
    const pb = evaluate(purposeBuiltAnswers())

    for (const result of [conv, pb]) {
      const e04 = result.remedies.legal_requirements.find((r) => r.rule_id === 'R-E04')
      expect(e04).toBeDefined()
      expect(e04?.priority).toBe('P1_urgent')
    }
  })

  it('the purpose-built report carries no conversion narrative and never asserts Section 257 / D10', () => {
    const pb = evaluate(purposeBuiltAnswers())
    const text = reportText(pb.report)

    // No conversion narrative anywhere in the report. The stem `conver(t|sion)`
    // catches converted / conversion / conversions (note "convert" is NOT a
    // substring of "conversion", so a naive /convert/ would miss it).
    expect(text).not.toMatch(/conver(t|sion)/i)
    // Correct classification stated, but never asserted as a Section 257 HMO.
    expect(text).toContain('Not a Section 257 HMO')
    expect(text).not.toMatch(/Section 257 HMO \(confirmed\)/)
    expect(text).not.toMatch(/Probable Section 257 HMO/)
    // D10 never presented as a direct applicable benchmark.
    expect(text).not.toMatch(/Case Study D10 and related LACORS guidance apply/)
  })

  it('the converted report DOES carry the Section 257 / D10 framing', () => {
    const conv = evaluate(convertedAnswers())
    const text = reportText(conv.report)

    expect(text).toContain('Section 257 HMO (confirmed)')
    expect(text).toMatch(/Case Study D10 and related LACORS guidance apply/)
  })
})
