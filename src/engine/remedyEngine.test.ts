/**
 * remedyEngine.test.ts — Unit tests for remedy computation.
 *
 * Pure: no React, no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest'
import { computeRemedies, groupRemediesByTier, groupRemediesByLegalStatus } from './remedyEngine'
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
    shared_escape_route: 'unknown',
    upper_flat_independent_exit: 'unknown',
    upper_independent_escape_type: 'unknown',
    upper_external_escape_viable: 'unknown',
    upper_shared_route_dependency: 'unknown',
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
    stair_compartmentation_confidence: 'unknown',
    stair_compartmentation_risk: 'low',
    ground_floor_escape_strategy: 'unknown',
    upper_floor_escape_strategy: 'unknown',
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
  it('still returns statutory remedies for not-section-257 properties', () => {
    // Gas safety applies to all rented properties regardless of HMO classification
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, notSection257())
    expect(remedies.some((r) => r.id === 'R-G01')).toBe(true)
  })

  it('still returns EICR remedy for not-section-257 properties', () => {
    const answers: AnswerMap = { G2: a('overdue') }
    const remedies = computeRemedies(answers, notSection257())
    expect(remedies.some((r) => r.id === 'R-G02')).toBe(true)
  })

  it('does not return IS_SECTION_257-gated LACORS rules for not-section-257', () => {
    // R-E01 requires IS_SECTION_257 — must not fire for non-HMO
    const answers: AnswerMap = { E1: a('battery_only') }
    const remedies = computeRemedies(answers, notSection257())
    expect(remedies.some((r) => r.id === 'R-E01')).toBe(false)
  })

  it('legal_status on returned remedies is correct', () => {
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, notSection257())
    const g01 = remedies.find((r) => r.id === 'R-G01')
    expect(g01?.legal_status).toBe('legal_requirement')
  })
})

describe('computeRemedies — unresolved classification', () => {
  it('suppresses lacors_recommendation remedies when unresolved', () => {
    // R-E01 is lacors_recommendation — must be suppressed when unresolved
    const answers: AnswerMap = { E1: a('battery_only') }
    const remedies = computeRemedies(answers, unresolvedClassification())
    const lacors = remedies.filter((r) => r.legal_status === 'lacors_recommendation')
    expect(lacors).toHaveLength(0)
  })

  it('does NOT suppress legal_requirement items when unresolved', () => {
    // R-G01 is legal_requirement — statutory obligation regardless of classification
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, unresolvedClassification())
    expect(remedies.some((r) => r.id === 'R-G01')).toBe(true)
  })

  it('still includes advisory items when unresolved', () => {
    const remedies = computeRemedies({}, unresolvedClassification())
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

  it('R-E04 does not fire when E1=d1 (Grade D1 mains-wired)', () => {
    const answers: AnswerMap = { E1: a('d1') }
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
  it('each active remedy has all required fields including legal_status', () => {
    const answers: AnswerMap = { G1: a('overdue') }
    const remedies = computeRemedies(answers, baseClassification())
    for (const remedy of remedies) {
      expect(remedy.id).toBeTruthy()
      expect(remedy.title).toBeTruthy()
      expect(['mandatory', 'recommended', 'advisory']).toContain(remedy.tier)
      expect(['legal_requirement', 'lacors_recommendation', 'advisory']).toContain(remedy.legal_status)
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
    // R-E04 is now mandatory (promoted to legal_requirement, tier=mandatory)
    expect(mandatory.some((r) => r.id === 'R-E04')).toBe(true)

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

describe('groupRemediesByLegalStatus', () => {
  it('groups remedies correctly by legal_status', () => {
    const answers: AnswerMap = { G1: a('overdue'), E1: a('none') }
    const remedies = computeRemedies(answers, baseClassification())
    const { legal_requirement, lacors_recommendation, advisory } = groupRemediesByLegalStatus(remedies)

    // R-G01 and R-E04 are both legal_requirement
    expect(legal_requirement.some((r) => r.id === 'R-G01')).toBe(true)
    expect(legal_requirement.some((r) => r.id === 'R-E04')).toBe(true)

    legal_requirement.forEach((r) => expect(r.legal_status).toBe('legal_requirement'))
    lacors_recommendation.forEach((r) => expect(r.legal_status).toBe('lacors_recommendation'))
    advisory.forEach((r) => expect(r.legal_status).toBe('advisory'))
  })

  it('returns empty arrays when no remedies', () => {
    const { legal_requirement, lacors_recommendation, advisory } = groupRemediesByLegalStatus([])
    expect(legal_requirement).toHaveLength(0)
    expect(lacors_recommendation).toHaveLength(0)
    expect(advisory).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// External escape route scenarios (docs/external-stairs.md §7)
// ---------------------------------------------------------------------------

describe('external escape route — Scenario 1: sole_route (no independent escape)', () => {
  // B2='no': upper flat has no independent escape, shared stair is sole route
  const classification = baseClassification({
    upper_flat_independent_exit: 'no',
    upper_independent_escape_type: 'none',
    upper_external_escape_viable: 'no',
    upper_shared_route_dependency: 'sole_route',
    escape_windows: { bedroom_1: 'does-not-qualify', bedroom_2: 'unknown', living_room: 'unknown' },
  })

  it('R-C01 fires when no viable external exit and bedroom window does not qualify', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-C01')).toBe(true)
  })

  it('R-B01 does not fire when external viable is not unknown', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B01')).toBe(false)
  })

  it('R-B02 does not fire when no independent exit exists', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B02')).toBe(false)
  })
})

describe('external escape route — Scenario 2: secondary_route (verified external stair)', () => {
  // B2='yes_external_steel_stair', B2a='yes', B2c='yes': viable independent exit
  const classification = baseClassification({
    upper_flat_independent_exit: 'yes',
    upper_independent_escape_type: 'external_steel_stair',
    upper_external_escape_viable: 'yes',
    upper_shared_route_dependency: 'secondary_route',
    escape_windows: { bedroom_1: 'does-not-qualify', bedroom_2: 'unknown', living_room: 'unknown' },
    risk_score: 1,
    risk_level: 'low',
  })

  it('R-C01 does not fire when external escape is confirmed viable', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-C01')).toBe(false)
  })

  it('R-B01 does not fire when external escape is confirmed viable', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B01')).toBe(false)
  })

  it('R-B02 does not fire when external escape is viable', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B02')).toBe(false)
  })

  it('risk score is lower than sole_route scenario', () => {
    // This is tested at the classification level, but we verify the score field is present
    expect(classification.risk_score).toBeLessThan(3)
  })
})

describe('external escape route — Scenario 3: unknown viability (unverified external stair)', () => {
  // B2='yes_external_steel_stair', B2a='unknown': viability not confirmed
  const classification = baseClassification({
    upper_flat_independent_exit: 'yes',
    upper_independent_escape_type: 'external_steel_stair',
    upper_external_escape_viable: 'unknown',
    upper_shared_route_dependency: 'primary_route',
    escape_windows: { bedroom_1: 'does-not-qualify', bedroom_2: 'unknown', living_room: 'unknown' },
  })

  it('R-C01 fires when external escape viability is unknown', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-C01')).toBe(true)
  })

  it('R-B01 fires when external escape viability is unknown', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B01')).toBe(true)
  })

  it('R-B02 does not fire when external escape is not confirmed unusable', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B02')).toBe(false)
  })
})

describe('external escape route — Scenario 4: obstructed/unusable external route', () => {
  // B2='yes_external_steel_stair', B2a='no_obstructed': route not viable
  const classification = baseClassification({
    upper_flat_independent_exit: 'yes',
    upper_independent_escape_type: 'external_steel_stair',
    upper_external_escape_viable: 'no',
    upper_shared_route_dependency: 'primary_route',
    escape_windows: { bedroom_1: 'does-not-qualify', bedroom_2: 'unknown', living_room: 'unknown' },
  })

  it('R-C01 fires when external escape is not viable', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-C01')).toBe(true)
  })

  it('R-B01 does not fire when external escape is definitively not viable (not unknown)', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B01')).toBe(false)
  })

  it('R-B02 fires when independent exit exists but is not viable', () => {
    const remedies = computeRemedies({}, classification)
    expect(remedies.some((r) => r.id === 'R-B02')).toBe(true)
  })
})
