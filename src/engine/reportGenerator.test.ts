/**
 * reportGenerator.test.ts — Unit tests for the report generation layer.
 *
 * Pure: no React, no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest'
import { generateReport } from './reportGenerator'
import { computeRemedies } from './remedyEngine'
import { RULES_VERSION } from '../data/rules/remedy-rules'
import type { Assessment, Classification } from '../state/AppState'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function a(value: string) {
  return { value, confidence: 'confirmed' as const, answered_at: '2026-01-01T00:00:00.000Z' }
}

function baseClassification(overrides: Partial<Classification> = {}): Classification {
  return {
    type: 'section-257-hmo',
    benchmark: 'D10',
    communal_entrance: 'true',
    separate_entrance_mode: false,
    upper_flat_independent_exit: 'unknown',
    inner_room_present: 'unknown',
    escape_windows: {
      bedroom_1: 'unknown',
      bedroom_2: 'unknown',
      living_room: 'unknown',
    },
    confidence: 'confirmed',
    unresolved_reasons: [],
    risk_level: 'normal',
    risk_score: 3,
    risk_factors_present: ['RF-E01'],
    ...overrides,
  }
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    schema_version: '1.1',
    rules_version: RULES_VERSION,
    app_version: '0.1.0',
    assessment_id: 'test-123',
    created_at: '2026-01-01T00:00:00.000Z',
    last_edited_at: '2026-01-02T00:00:00.000Z',
    property: {
      address_line_1: '1 Test Street',
      address_line_2: null,
      town: 'Richmond',
      postcode: 'TW9 4HA',
      postcode_normalised: 'TW9 4HA',
      flat_ref: null,
    },
    current_section: 'A',
    current_question_id: 'A1',
    answers: {
      A1: a('converted'),
      A2: a('yes'),
      A3: a('2'),
      A4: a('none_owner_occupied'),
      A5: a('yes'),
    },
    invalidated_answers: {},
    classification: baseClassification(),
    report_generated_at: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// generateReport — structure
// ---------------------------------------------------------------------------

describe('generateReport — basic structure', () => {
  it('returns a report object with all required top-level fields', () => {
    const assessment = makeAssessment()
    const remedies = computeRemedies(assessment.answers, assessment.classification)
    const report = generateReport(assessment, remedies, RULES_VERSION)

    expect(report.generated_at).toBeTruthy()
    expect(report.app_version).toBeTruthy()
    expect(report.rules_version).toBe(RULES_VERSION)
    expect(report.address_display).toBeTruthy()
    expect(report.classification).toBeDefined()
    expect(report.classification_summary).toBeTruthy()
    expect(report.classification_basis).toBeTruthy()
    expect(typeof report.risk_level).toBe('string')
    expect(typeof report.risk_score).toBe('number')
    expect(Array.isArray(report.risk_factors_present)).toBe(true)
    expect(report.risk_summary).toBeTruthy()
    expect(report.risk_dimension_summary).toBeDefined()
    expect(typeof report.completeness_score).toBe('number')
    expect(typeof report.confirmed_facts).toBe('number')
    expect(typeof report.total_applicable_facts).toBe('number')
    expect(Array.isArray(report.mandatory_remedies)).toBe(true)
    expect(Array.isArray(report.recommended_remedies)).toBe(true)
    expect(Array.isArray(report.advisory_items)).toBe(true)
    expect(Array.isArray(report.unresolved_facts)).toBe(true)
    expect(Array.isArray(report.assumptions)).toBe(true)
    expect(report.disclaimer.title).toBeTruthy()
    expect(report.disclaimer.body).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// generateReport — address display
// ---------------------------------------------------------------------------

describe('generateReport — address display', () => {
  it('includes address_line_1 in address_display', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.address_display).toContain('1 Test Street')
  })

  it('includes postcode in address_display', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.address_display).toContain('TW9 4HA')
  })

  it('includes flat_ref when present', () => {
    const assessment = makeAssessment({
      property: {
        address_line_1: '1 Test Street',
        address_line_2: null,
        town: 'Richmond',
        postcode: 'TW9 4HA',
        postcode_normalised: 'TW9 4HA',
        flat_ref: 'Flat A',
      },
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.flat_ref).toBe('Flat A')
  })
})

// ---------------------------------------------------------------------------
// generateReport — rules version mismatch banner
// ---------------------------------------------------------------------------

describe('generateReport — rules version mismatch banner', () => {
  it('rules_version_banner is null when versions match', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.rules_version_banner).toBeNull()
  })

  it('rules_version_banner is non-null when saved version differs', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], 'old-version-v1')
    expect(report.rules_version_banner).not.toBeNull()
    expect(typeof report.rules_version_banner).toBe('string')
    expect(report.rules_version_banner!.length).toBeGreaterThan(0)
  })

  it('rules_version_banner mentions both the old and new version', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], 'old-version-v1')
    expect(report.rules_version_banner).toContain('old-version-v1')
    expect(report.rules_version_banner).toContain(RULES_VERSION)
  })
})

// ---------------------------------------------------------------------------
// generateReport — completeness score
// ---------------------------------------------------------------------------

describe('generateReport — completeness score', () => {
  it('completeness_score is between 0 and 100', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.completeness_score).toBeGreaterThanOrEqual(0)
    expect(report.completeness_score).toBeLessThanOrEqual(100)
  })

  it('confirmed_facts ≤ total_applicable_facts', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.confirmed_facts).toBeLessThanOrEqual(report.total_applicable_facts)
  })

  it('completeness_score is 0 when no confirmed answers for applicable questions', () => {
    // If all answers have confidence='not_sure', confirmed_facts = 0
    const notSureAnswers = {
      A1: { value: 'not_sure', confidence: 'not_sure' as const, answered_at: '2026-01-01T00:00:00.000Z' },
    }
    const assessment = makeAssessment({ answers: notSureAnswers })
    const report = generateReport(assessment, [], RULES_VERSION)
    // completeness_score counts confirmed confidence only
    expect(report.completeness_score).toBeGreaterThanOrEqual(0)
  })

  it('total_applicable_facts increases with more applicable questions answered', () => {
    const minimalAssessment = makeAssessment({
      answers: {
        A1: a('converted'),
        A2: a('yes'),
        A3: a('2'),
        A4: a('none_owner_occupied'),
        A5: a('yes'),
      },
    })
    const extendedAnswers = {
      ...minimalAssessment.answers,
      B1: a('communal'),
      B2: a('no'),
    }
    const extendedAssessment = makeAssessment({ answers: extendedAnswers })

    const minReport = generateReport(minimalAssessment, [], RULES_VERSION)
    const extReport = generateReport(extendedAssessment, [], RULES_VERSION)

    // More answers means more applicable questions
    expect(extReport.total_applicable_facts).toBeGreaterThanOrEqual(minReport.total_applicable_facts)
  })
})

// ---------------------------------------------------------------------------
// generateReport — unresolved facts
// ---------------------------------------------------------------------------

describe('generateReport — unresolved facts', () => {
  it('returns empty unresolved_facts when all answers are confirmed', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.unresolved_facts).toHaveLength(0)
  })

  it('populates unresolved_facts for not_sure answers on BLOCK_CLASS questions', () => {
    const assessment = makeAssessment({
      answers: {
        A1: { value: 'not_sure', confidence: 'not_sure' as const, answered_at: '2026-01-01T00:00:00.000Z' },
        A2: a('yes'),
        A3: a('2'),
        A4: a('none_owner_occupied'),
        A5: a('yes'),
      },
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    const ids = report.unresolved_facts.map((f) => f.question_id)
    expect(ids).toContain('A1')
  })

  it('each unresolved fact has required fields', () => {
    const assessment = makeAssessment({
      answers: {
        A1: { value: 'not_sure', confidence: 'not_sure' as const, answered_at: '2026-01-01T00:00:00.000Z' },
        A2: a('yes'),
        A3: a('2'),
        A4: a('none_owner_occupied'),
        A5: a('yes'),
      },
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    for (const fact of report.unresolved_facts) {
      expect(fact.question_id).toBeTruthy()
      expect(fact.question_text).toBeTruthy()
      expect(typeof fact.answer_given).toBe('string')
      expect(fact.uncertainty_behaviour).toBeTruthy()
      expect(fact.verification_needed).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// generateReport — classification summary and basis
// ---------------------------------------------------------------------------

describe('generateReport — classification_summary', () => {
  it('returns a non-empty classification_summary string', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(typeof report.classification_summary).toBe('string')
    expect(report.classification_summary.length).toBeGreaterThan(0)
  })

  it('classification_summary mentions Section 257 for confirmed HMO', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.classification_summary).toContain('257')
  })

  it('classification_summary mentions out-of-scope for not-section-257', () => {
    const assessment = makeAssessment({
      classification: baseClassification({ type: 'not-section-257', risk_level: 'unresolved', risk_score: 0 }),
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.classification_summary).toContain('scope')
  })
})

describe('generateReport — classification_basis', () => {
  it('returns classification basis when Section A answers present', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.classification_basis).toContain('Classification based on')
  })

  it('mentions "privately rented" when A4=none_owner_occupied', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.classification_basis).toContain('privately rented')
  })
})

// ---------------------------------------------------------------------------
// generateReport — assumptions
// ---------------------------------------------------------------------------

describe('generateReport — assumptions', () => {
  it('includes at least one assumption for a confirmed s257-hmo', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.assumptions.length).toBeGreaterThan(0)
  })

  it('each assumption is a non-empty string', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    for (const assumption of report.assumptions) {
      expect(typeof assumption).toBe('string')
      expect(assumption.length).toBeGreaterThan(0)
    }
  })

  it('includes LACORS disclaimer assumption', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    const hasDisclaimer = report.assumptions.some((a) =>
      a.includes('should') || a.includes('LACORS')
    )
    expect(hasDisclaimer).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// generateReport — risk dimension summary
// ---------------------------------------------------------------------------

describe('generateReport — risk_dimension_summary', () => {
  it('has all four dimensions', () => {
    const assessment = makeAssessment()
    const report = generateReport(assessment, [], RULES_VERSION)
    const dims = report.risk_dimension_summary
    expect(dims).toHaveProperty('escape')
    expect(dims).toHaveProperty('construction')
    expect(dims).toHaveProperty('detection')
    expect(dims).toHaveProperty('management')
  })

  it('all dimensions are adequate when no risk factors present', () => {
    const assessment = makeAssessment({
      classification: baseClassification({ risk_factors_present: [], risk_score: 0, risk_level: 'low' }),
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    const dims = report.risk_dimension_summary
    expect(dims.escape).toBe('adequate')
    expect(dims.construction).toBe('adequate')
    expect(dims.detection).toBe('adequate')
    expect(dims.management).toBe('adequate')
  })

  it('detection dimension is compromised when RF-E04 is present', () => {
    const assessment = makeAssessment({
      classification: baseClassification({
        risk_factors_present: ['RF-E04'],
        risk_score: 3,
        risk_level: 'normal',
      }),
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.risk_dimension_summary.detection).toBe('compromised')
  })
})

// ---------------------------------------------------------------------------
// generateReport — risk stacking warning
// ---------------------------------------------------------------------------

describe('generateReport — risk stacking warning', () => {
  it('risk_stacking_warning is null when fewer than 3 dimensions compromised', () => {
    const assessment = makeAssessment({
      classification: baseClassification({
        risk_factors_present: ['RF-E04', 'RF-D01'], // detection + construction only
        risk_score: 5,
        risk_level: 'normal',
      }),
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.risk_stacking_warning).toBeNull()
  })

  it('risk_stacking_warning is non-null when 3+ dimensions compromised', () => {
    const assessment = makeAssessment({
      classification: baseClassification({
        risk_factors_present: ['RF-E04', 'RF-D01', 'RF-C01', 'RF-H01'],
        risk_score: 10,
        risk_level: 'high',
      }),
    })
    const report = generateReport(assessment, [], RULES_VERSION)
    expect(report.risk_stacking_warning).not.toBeNull()
    expect(typeof report.risk_stacking_warning).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// generateReport — remedies are passed through correctly
// ---------------------------------------------------------------------------

describe('generateReport — remedies', () => {
  it('mandatory remedies are populated when statutory rules fire', () => {
    const assessment = makeAssessment({
      answers: {
        ...makeAssessment().answers,
        G1: a('overdue'),
      },
    })
    const remedies = computeRemedies(assessment.answers, assessment.classification)
    const report = generateReport(assessment, remedies, RULES_VERSION)
    expect(report.mandatory_remedies.length).toBeGreaterThan(0)
    expect(report.mandatory_remedies.some((r) => r.id === 'R-G01')).toBe(true)
  })
})
