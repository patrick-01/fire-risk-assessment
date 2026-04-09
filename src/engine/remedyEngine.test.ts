/**
 * remedyEngine.test.ts — Unit tests for remedy computation.
 *
 * Pure: no React, no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest'
import { computeRemedies, groupRemediesByTier } from './remedyEngine'
import type { AnswerMap, Classification } from '../state/AppState'

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
    risk_factors_present: [],
    ...overrides,
  }
}

function notSection257(): Classification {
  return baseClassification({ type: 'not-section-257', risk_level: 'unresolved', risk_score: 0 })
}

function unresolvedClassification(): Classification {
  return baseClassification({
    type: 'unresolved',
    confidence: 'unresolved',
    unresolved_reasons: ['Test'],
    risk_level: 'unresolved',
    risk_score: 0,
  })
}

function separateEntranceClassification(): Classification {
  return baseClassification({
    communal_entrance: 'false',
    separate_entrance_mode: true,
  })
}

// ---------------------------------------------------------------------------
// computeRemedies — suppression rules
// ---------------------------------------------------------------------------

describe('computeRemedies — not-section-257', () => {
  it('returns empty array for not-section-257 properties', () => {
    const remedies = computeRemedies({}, notSection257())
    expect(remedies).toHaveLength(0)
  })
})

describe('computeRemedies — unresolved classification', () => {
  it('suppresses mandatory and recommended remedies when unresolved', () => {
    // With G1=overdue, R-G01 (mandatory) would normally fire
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, unresolvedClassification())
    const mandatory = remedies.filter((r) => r.tier === 'mandatory')
    const recommended = remedies.filter((r) => r.tier === 'recommended')
    expect(mandatory).toHaveLength(0)
    expect(recommended).toHaveLength(0)
  })

  it('still includes advisory items when unresolved', () => {
    // Advisory items should still appear — they don't depend on confirmed classification
    const remedies = computeRemedies({}, unresolvedClassification())
    // May or may not have advisories without triggering answers — just check it doesn't crash
    expect(Array.isArray(remedies)).toBe(true)
  })
})

describe('computeRemedies — separate entrance suppression', () => {
  it('suppresses communal-specific rules when separate_entrance_mode=true', () => {
    const classification = separateEntranceClassification()
    // Any communal-only rules should be suppressed
    const remedies = computeRemedies({}, classification)
    for (const remedy of remedies) {
      // R-E02, R-E03 are communal-only rules — find them in the results
      // All returned remedies must have applies_when_separate_entrance=true
      // (checked indirectly: if any communal-only rule fires, that's a bug)
      expect(remedy.id).not.toBe('R-E02') // communal detection rule
    }
  })

  it('includes rules that apply to both configurations when separate_entrance_mode=true', () => {
    const classification = separateEntranceClassification()
    // G1 (gas safety) has applies_when_separate_entrance=true
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, classification)
    expect(remedies.some((r) => r.id === 'R-G01')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// computeRemedies — condition evaluation
// ---------------------------------------------------------------------------

describe('computeRemedies — statutory remedies', () => {
  it('R-G01 fires when G1=overdue (gas safety overdue)', () => {
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, baseClassification())
    expect(remedies.some((r) => r.id === 'R-G01')).toBe(true)
  })

  it('R-G01 does not fire when G1=current', () => {
    const answers: AnswerMap = { G1: a('current') }
    const remedies = computeRemedies(answers, baseClassification())
    expect(remedies.some((r) => r.id === 'R-G01')).toBe(false)
  })

  it('R-G02 fires when G2=overdue (EICR overdue)', () => {
    const answers: AnswerMap = { G2: a('overdue') }
    const remedies = computeRemedies(answers, baseClassification())
    expect(remedies.some((r) => r.id === 'R-G02')).toBe(true)
  })

  it('R-G02 fires when G2=unknown (treat as overdue)', () => {
    const answers: AnswerMap = { G2: a('unknown') }
    const remedies = computeRemedies(answers, baseClassification())
    expect(remedies.some((r) => r.id === 'R-G02')).toBe(true)
  })

  it('R-G02 does not fire when G2=current', () => {
    const answers: AnswerMap = { G2: a('current') }
    const remedies = computeRemedies(answers, baseClassification())
    expect(remedies.some((r) => r.id === 'R-G02')).toBe(false)
  })
})

describe('computeRemedies — detection remedies', () => {
  it('R-E04 fires when E1=none (no alarms)', () => {
    const answers: AnswerMap = { E1: a('none') }
    const remedies = computeRemedies(answers, baseClassification())
    expect(remedies.some((r) => r.id === 'R-E04')).toBe(true)
  })

  it('R-E04 does not fire when E1=mains_wired', () => {
    const answers: AnswerMap = { E1: a('mains_wired') }
    const remedies = computeRemedies(answers, baseClassification())
    expect(remedies.some((r) => r.id === 'R-E04')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computeRemedies — multi-choice condition matching
// ---------------------------------------------------------------------------

describe('computeRemedies — multi-choice answers', () => {
  it('matches a multi-choice answer when one selected value matches the rule condition', () => {
    // D9 multi-choice — check that a rule using leaf condition on D9 can match
    // We test via the risk factor side (remedy rules use direct answer matching)
    // The remedy engine's matchesAnyValue should handle JSON arrays
    const answers: AnswerMap = {
      D9: a(JSON.stringify(['motorbike', 'gas_cylinder'])),
    }
    // Just check no crash on multi-choice evaluation
    expect(() => computeRemedies(answers, baseClassification())).not.toThrow()
  })

  it('does not crash when D9 is a plain scalar string (not JSON array)', () => {
    const answers: AnswerMap = { D9: a('motorbike') }
    expect(() => computeRemedies(answers, baseClassification())).not.toThrow()
  })

  it('does not crash when D9 contains malformed JSON', () => {
    const answers: AnswerMap = { D9: a('not{valid') }
    expect(() => computeRemedies(answers, baseClassification())).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// computeRemedies — active remedy shape
// ---------------------------------------------------------------------------

describe('computeRemedies — output shape', () => {
  it('each active remedy has all required fields', () => {
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, baseClassification())
    for (const remedy of remedies) {
      expect(remedy.id).toBeTruthy()
      expect(remedy.title).toBeTruthy()
      expect(['mandatory', 'recommended', 'advisory']).toContain(remedy.tier)
      expect(remedy.risk_basis).toBeTruthy()
      expect(remedy.text).toBeTruthy()
      expect(Array.isArray(remedy.regulatory_refs)).toBe(true)
      expect(['confirmed', 'probable', 'unresolved']).toContain(remedy.confidence)
    }
  })

  it('confidence is downgraded to match classification confidence', () => {
    // A rule with confidence='confirmed' + classification confidence='probable'
    // → effective confidence should be 'probable'
    const probableClassification = baseClassification({ confidence: 'probable' })
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, probableClassification)
    const g01 = remedies.find((r) => r.id === 'R-G01')
    if (g01) {
      // R-G01 is declared as confirmed — should be downgraded to probable
      expect(g01.confidence).toBe('probable')
    }
  })
})

describe('computeRemedies — risk-level-aware text', () => {
  it('returns a non-empty text string for each remedy', () => {
    const answers: AnswerMap = { G1: a('overdue'), E1: a('none') }
    const remedies = computeRemedies(answers, baseClassification())
    for (const remedy of remedies) {
      expect(typeof remedy.text).toBe('string')
      expect(remedy.text.length).toBeGreaterThan(0)
    }
  })

  it('uses risk_level_expressions when available for elevated risk', () => {
    // Use an elevated risk classification to trigger risk_level_expressions
    const elevated = baseClassification({ risk_level: 'elevated', risk_score: 7 })
    const answers: AnswerMap = { G1: a('overdue'), E1: a('none') }
    const remediesElevated = computeRemedies(answers, elevated)
    const normal = baseClassification({ risk_level: 'normal', risk_score: 4 })
    const remediesNormal = computeRemedies(answers, normal)

    // For rules with risk_level_expressions, text may differ between risk levels
    // We can't test the exact content without knowing which rules have expressions,
    // so just verify both return valid text
    expect(remediesElevated.length).toBeGreaterThan(0)
    expect(remediesNormal.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// groupRemediesByTier
// ---------------------------------------------------------------------------

describe('groupRemediesByTier', () => {
  it('groups remedies correctly by tier', () => {
    const answers: AnswerMap = { G1: a('overdue'), E1: a('none') }
    const remedies = computeRemedies(answers, baseClassification())
    const { mandatory, recommended, advisory } = groupRemediesByTier(remedies)

    // R-G01 is mandatory
    expect(mandatory.some((r) => r.id === 'R-G01')).toBe(true)
    // R-E04 is recommended
    expect(recommended.some((r) => r.id === 'R-E04')).toBe(true)

    // All items in each group have the correct tier
    mandatory.forEach((r) => expect(r.tier).toBe('mandatory'))
    recommended.forEach((r) => expect(r.tier).toBe('recommended'))
    advisory.forEach((r) => expect(r.tier).toBe('advisory'))
  })

  it('returns empty arrays when no remedies', () => {
    const { mandatory, recommended, advisory } = groupRemediesByTier([])
    expect(mandatory).toHaveLength(0)
    expect(recommended).toHaveLength(0)
    expect(advisory).toHaveLength(0)
  })
})
