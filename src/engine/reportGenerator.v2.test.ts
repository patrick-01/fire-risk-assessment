/**
 * reportGenerator.v2.test.ts — Unit tests for the FireRegs v2 report
 * generator (generateReportV2 / docs/6-Report-Refactor.md, §17.1).
 *
 * Pure tests: no React, no DOM, no localStorage.
 *
 * Covers the §25.7/§25.8 acceptance criteria:
 *   - all 19 §17.1 sections render, in order, with the correct titles
 *   - statutory requirements (§17.2 "Required"), LACORS/risk recommendations
 *     ("Recommended"), and advisories ("Advisory") appear in separate,
 *     correctly-toned blocks
 *   - known/potential/unknown risk factors are partitioned into sections
 *     12/13/14 correctly
 *   - the remediation schedule (section 17) is priority-ordered
 *   - Scenario A's D10 downgrade (purpose-built building) surfaces as
 *     "Recommended" in section 16, never "Required" in section 15
 */

import { describe, it, expect } from 'vitest'
import { classify, deriveLegalFramework } from './classifier'
import { computeRisk } from './riskEngine'
import { computeRemediesV2 } from './remedyEngine.v2'
import { generateReportV2 } from './reportGenerator.v2'
import type { AnswerMap, PropertyIdentity } from '../state/AppState'
import { APP_VERSION } from '../state/AppState'
import { RULES_VERSION_V2, RULES_DATE_V2 } from '../data/rules/remedy-rules.v2'

// ---------------------------------------------------------------------------
// Test helpers (mirrors remedyEngine.v2.test.ts)
// ---------------------------------------------------------------------------

type Confidence = 'confirmed' | 'not_sure'

function a(value: string, confidence: Confidence = 'confirmed') {
  return { value, confidence, answered_at: '2026-01-01T00:00:00.000Z' }
}

const PROPERTY: PropertyIdentity = {
  address_line_1: '1 Test Street',
  address_line_2: null,
  town: 'Richmond',
  postcode: 'TW9 1AA',
  postcode_normalised: 'TW9 1AA',
  flat_ref: null,
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

function reportFor(answers: AnswerMap) {
  const classification = classify(answers)
  const risk = computeRisk(answers, classification)
  const legalFramework = deriveLegalFramework(answers, classification)
  const remedies = computeRemediesV2(answers, classification, risk)
  return generateReportV2(PROPERTY, answers, classification, legalFramework, risk, remedies)
}

function section(report: ReturnType<typeof reportFor>, title: string) {
  const found = report.sections.find((s) => s.title === title)
  if (!found) throw new Error(`Missing report section: ${title}`)
  return found
}

// ---------------------------------------------------------------------------
// §17.1 — 19 sections, in order, with correct titles
// ---------------------------------------------------------------------------

const EXPECTED_TITLES = [
  'Property details',
  'Inspection details',
  'Assessor competence statement',
  'Assessment scope and limitations',
  'Property classification',
  'Applicable legal framework',
  'Common parts assessment',
  'Ground-floor flat assessment',
  'Upper-floor flat assessment',
  'External escape route assessment',
  'Door and route protection assessment',
  'Stair compartmentation assessment',
  'Fire detection strategy',
  'Known risks',
  'Potential risks',
  'Unknown risks / further investigation',
  'Legal requirements',
  'LACORS / risk-based recommendations',
  'Remediation schedule',
  'Evidence and assumptions',
  'Inspection and review history',
  'Assessor declaration and signature',
  'Report purpose and limitations',
]

describe('generateReportV2 — §17.1 section structure', () => {
  it('produces all report sections, numbered in order', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    expect(report.sections).toHaveLength(EXPECTED_TITLES.length)
    report.sections.forEach((section, index) => {
      expect(section.id).toBe(index + 1)
    })
  })

  it('uses the §17.1 section titles in order', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    expect(report.sections.map((s) => s.title)).toEqual(EXPECTED_TITLES)
  })

  it('every section has non-empty body text', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    for (const section of report.sections) {
      expect(section.body.trim().length).toBeGreaterThan(0)
    }
  })

  it('carries report metadata (app/rules version, property, classification, risk, remedies)', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    expect(report.app_version).toBe(APP_VERSION)
    expect(report.rules_version).toBe(RULES_VERSION_V2)
    expect(report.rules_date).toBe(RULES_DATE_V2)
    expect(report.property).toEqual(PROPERTY)
    expect(report.classification.section_257).toBe(true)
    expect(report.risk.risk_factors).toBeInstanceOf(Array)
    expect(report.remedies.remediation_schedule).toBeInstanceOf(Array)
  })

  it('uses the professional inspection report title', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') }) as ReturnType<typeof reportFor> & {
      title?: string
    }
    expect(report.title).toBe('Fire Safety Inspection Report')
  })
})

describe('generateReportV2 — inspection record wording and metadata', () => {
  it('replaces the old self-assessment disclaimer with inspection-purpose wording', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    const fullText = report.sections.map((s) => `${s.title}\n${s.body}`).join('\n\n')

    expect(fullText).toContain(
      'This report records the findings of a fire safety inspection carried out by the assessor'
    )
    expect(fullText).toContain('It is not a statutory compliance certificate or confirmation from the local authority.')
    expect(fullText).not.toMatch(/self-assessment tool/i)
    expect(fullText).not.toMatch(/does not constitute a formal fire risk assessment/i)
    expect(fullText).not.toMatch(/guidance only/i)
  })

  it('renders inspection details, next review due, and editable competence statement defaults', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    const details = report.sections.find((s) => s.title === 'Inspection details')!
    const competence = report.sections.find((s) => s.title === 'Assessor competence statement')!

    expect(details.body).toContain('Property address: 1 Test Street, Richmond, TW9 1AA')
    expect(details.body).toContain('Inspection type: Initial')
    expect(details.body).toContain('Next review due:')
    expect(details.body).toContain('Review frequency: normally 12 months')
    expect(competence.body).toContain('The inspection was completed by the named assessor')
  })

  it('renders declaration, signature fields, and review history for the current report', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal'), D1: a('hardboard') })
    const history = report.sections.find((s) => s.title === 'Inspection and review history')!
    const declaration = report.sections.find((s) => s.title === 'Assessor declaration and signature')!

    expect(history.body).toContain('Inspection date | Inspection type | Assessor | Overall risk | Key outstanding actions | Next review due')
    expect(history.body).toContain('Initial')
    expect(declaration.body).toContain('I confirm that this report accurately records the inspection findings')
    expect(declaration.body).toContain('Signature:')
    expect(declaration.body).toContain('Date signed:')
    expect(declaration.body).toContain('Role / capacity:')
    expect(declaration.body).toContain('Next review due:')
  })

  it('adds remediation tracking fields without removing legal classification or priority', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal'), D1: a('hardboard') })
    const schedule = report.sections.find((s) => s.title === 'Remediation schedule')!

    expect(report.remedies.remediation_schedule.length).toBeGreaterThan(0)
    expect(schedule.body).toContain('Action reference')
    expect(schedule.body).toContain('Status')
    expect(schedule.body).toContain('Target date')
    expect(schedule.body).toContain('Completed date')
    expect(schedule.body).toContain('Evidence / notes')
    expect(schedule.body).toContain('Legal classification')
    expect(schedule.body).toContain(report.remedies.remediation_schedule[0].legal_status)
    expect(schedule.body).toContain(report.remedies.remediation_schedule[0].priority)
  })
})

// ---------------------------------------------------------------------------
// Section 3 / 4 — classification and legal framework
// ---------------------------------------------------------------------------

describe('generateReportV2 — sections 3-4', () => {
  it('section 3 reflects the building classification', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    const section3 = section(report, 'Property classification')
    expect(section3.body).toContain('Section 257 HMO: Yes.')
    expect(section3.body).toContain('Case Study D10 stair-enclosure benchmark: applicable.')
  })

  it('section 4 marks always-applicable statutes as "Required" and renders lacors_guidance_use', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    const section4 = section(report, 'Applicable legal framework')
    expect(section4.body).toContain('Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020 — Required: applies to this property.')
    expect(section4.body).toContain('Housing Health and Safety Rating System — fire hazard (Housing Act 2004) — Required: applies to this property.')
    expect(section4.body).toMatch(/LACORS guidance is used as:/)
  })
})

// ---------------------------------------------------------------------------
// Sections 12-14 — known / potential / unknown risk partitioning
// ---------------------------------------------------------------------------

describe('generateReportV2 — sections 12-14 risk partitioning', () => {
  it('a known risk (no smoke alarms) appears in section 12, not 13 or 14', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal'), E1g: a('none'), E1u: a('none') })
    const known = section(report, 'Known risks')
    const potential = section(report, 'Potential risks')
    const unknown = section(report, 'Unknown risks / further investigation')

    expect(known.body).toMatch(/smoke/i)
    expect(potential.body).not.toMatch(/RF-DET-NONE/)
    expect(unknown.body).not.toMatch(/no smoke/i)
  })

  it('an unknown risk factor (uncertain alarm type) appears in section 14, tagged "Further investigation required"', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal'), E1g: a('unknown'), E1u: a('unknown') })
    const unknown = section(report, 'Unknown risks / further investigation')
    expect(unknown.body).toMatch(/Further investigation required:/)
  })

  it('section 14 includes RemedySummary.further_investigation items alongside unknown risk factors', () => {
    const report = reportFor({ ...convertedS257(), G4a: a('not_sure') })
    const unknown = section(report, 'Unknown risks / further investigation')
    expect(report.remedies.further_investigation.length).toBeGreaterThan(0)
    for (const remedy of report.remedies.further_investigation) {
      expect(unknown.body).toContain(remedy.text)
    }
  })
})

// ---------------------------------------------------------------------------
// Sections 15-17 — legal requirements, recommendations, remediation schedule
// ---------------------------------------------------------------------------

describe('generateReportV2 — sections 15-17 tone and ordering', () => {
  it('section 15 only contains "Required:" remedy lines', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal'), G1: a('overdue'), E1g: a('none'), E1u: a('none') })
    const section15 = section(report, 'Legal requirements')
    expect(report.remedies.legal_requirements.length).toBeGreaterThan(0)
    for (const remedy of report.remedies.legal_requirements) {
      expect(section15.body).toContain(`Required: ${remedy.text}`)
    }
    expect(section15.body).not.toContain('Recommended:')
    expect(section15.body).not.toContain('Advisory:')
  })

  it('section 16 separates "Recommended" and "Advisory" blocks', () => {
    const report = reportFor({ ...purposeBuilt(), B1: a('separate'), F1b: a('not_fitted') })
    const section16 = section(report, 'LACORS / risk-based recommendations')

    const recIndex = section16.body.indexOf('LACORS / risk-based recommendations:')
    const advIndex = section16.body.indexOf('Advisory / good practice (separate from the recommendations above):')
    expect(recIndex).toBeGreaterThanOrEqual(0)
    expect(advIndex).toBeGreaterThan(recIndex)

    // R-F01b is the separate-entrance advisory counterpart (Scenario B).
    expect(report.remedies.advisory.some((r) => r.rule_id === 'R-F01b')).toBe(true)
    const advisoryBlock = section16.body.slice(advIndex)
    expect(advisoryBlock).toContain('Advisory:')
  })

  it('section 17 lists the remediation schedule in priority order', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal'), D1: a('hardboard'), E1g: a('none'), E1u: a('none') })
    const section17 = section(report, 'Remediation schedule')
    const PRIORITY_ORDER = ['P1_urgent', 'P2_high', 'P3_medium', 'P4_low', 'investigate']

    expect(report.remedies.remediation_schedule.length).toBeGreaterThan(0)

    // The schedule order itself is the source of truth — verify it's priority-sorted.
    const indices = report.remedies.remediation_schedule.map((r) => PRIORITY_ORDER.indexOf(r.priority))
    expect(indices).toEqual([...indices].sort((x, y) => x - y))

    // Every scheduled item appears in section 17's body, numbered, with its priority and tone.
    report.remedies.remediation_schedule.forEach((remedy, index) => {
      expect(section17.body).toContain(`${index + 1}. [${remedy.priority}] (`)
      expect(section17.body).toContain(remedy.title)
    })
  })
})

// ---------------------------------------------------------------------------
// Scenario A — §22 D10 downgrade reflected in the report
// ---------------------------------------------------------------------------

describe('generateReportV2 — Scenario A (§22 D10 downgrade)', () => {
  it('a purpose-built building shows the D10 benchmark as "Recommended" in section 16, never "Required" in section 15', () => {
    const report = reportFor({ ...purposeBuilt(), B1: a('communal'), D1: a('hardboard') })

    const recommendation = report.remedies.recommendations.find((r) => r.rule_id === 'R-D01-hardboard')
    expect(recommendation).toBeDefined()
    expect(recommendation?.legal_status).toBe('risk_based_recommendation')
    expect(report.remedies.legal_requirements.some((r) => r.rule_id === 'R-D01-hardboard')).toBe(false)

    const section15 = section(report, 'Legal requirements')
    const section16 = section(report, 'LACORS / risk-based recommendations')
    expect(section15.body).not.toContain(recommendation!.text)
    expect(section16.body).toContain(`Recommended: ${recommendation!.text}`)
  })

  it('a converted §257 building keeps the D10 benchmark as "Recommended" (LACORS benchmark, not downgraded further)', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal'), D1: a('hardboard') })
    const recommendation = report.remedies.recommendations.find((r) => r.rule_id === 'R-D01-hardboard')
    expect(recommendation?.legal_status).toBe('lacors_benchmark_recommendation')

    const section16 = section(report, 'LACORS / risk-based recommendations')
    expect(section16.body).toContain(`Recommended: ${recommendation!.text}`)
  })
})

// ---------------------------------------------------------------------------
// Section 10 — stair compartmentation not-applicable path
// ---------------------------------------------------------------------------

describe('generateReportV2 — section 10 (stair compartmentation)', () => {
  it('is marked not applicable for a separate-entrance property', () => {
    const report = reportFor({ ...purposeBuilt(), B1: a('separate') })
    const section10 = section(report, 'Stair compartmentation assessment')
    expect(section10.body).toMatch(/Not applicable/)
  })

  it('assesses the shared staircase for a communal-entrance property', () => {
    const report = reportFor({ ...convertedS257(), B1: a('communal') })
    const section10 = section(report, 'Stair compartmentation assessment')
    expect(section10.body).not.toMatch(/Not applicable/)
    expect(section10.body).toMatch(/Overall for this area:/)
  })
})

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe('generateReportV2 — purity', () => {
  it('is deterministic given identical inputs (excluding generated_at)', () => {
    const answers = { ...convertedS257(), B1: a('communal') }
    const classification = classify(answers)
    const risk = computeRisk(answers, classification)
    const legalFramework = deriveLegalFramework(answers, classification)
    const remedies = computeRemediesV2(answers, classification, risk)

    const r1 = generateReportV2(PROPERTY, answers, classification, legalFramework, risk, remedies)
    const r2 = generateReportV2(PROPERTY, answers, classification, legalFramework, risk, remedies)

    // Property and inspection details embed `generated_at`, which legitimately differs between calls.
    expect(r1.sections.filter((s) => !['Property details', 'Inspection details'].includes(s.title))).toEqual(
      r2.sections.filter((s) => !['Property details', 'Inspection details'].includes(s.title))
    )
    expect(r1.classification).toEqual(r2.classification)
    expect(r1.remedies).toEqual(r2.remedies)
  })
})
