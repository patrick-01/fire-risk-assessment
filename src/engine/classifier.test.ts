/**
 * classifier.test.ts — Unit tests for the classification and risk scoring engine.
 *
 * Tests are pure: no React, no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest'
import { classify, computeRiskFactors, RISK_FACTOR_DIMENSIONS } from './classifier'
import type { AnswerMap } from '../state/AppState'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type Confidence = 'confirmed' | 'not_sure'

function a(value: string, confidence: Confidence = 'confirmed') {
  return { value, confidence, answered_at: '2026-01-01T00:00:00.000Z' }
}

/** Minimal answers to produce a confirmed Section 257 HMO. */
function s257(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
  }
}

/** Full escape window criteria for bedroom 1 — all confirming. */
function qualifyingBed1(): AnswerMap {
  return {
    B4: a('2.5_4m'),   // floor height ok
    C1: a('yes'),       // window openable
    C2: a('yes'),       // no key required
    C3: a('yes'),       // sill ≤ 1100mm
    C4: a('yes'),       // area ≥ 0.33m²
    C5: a('no'),        // no obstruction ('no' = no obstruction = PASS)
    C12: a('no'),       // no mobility impairment
  }
}

// ---------------------------------------------------------------------------
// classify()
// ---------------------------------------------------------------------------

describe('classify — Section 257 HMO (confirmed)', () => {
  it('returns section-257-hmo when all A criteria are met', () => {
    const c = classify(s257())
    expect(c.type).toBe('section-257-hmo')
    expect(c.confidence).toBe('confirmed')
    expect(c.benchmark).toBe('D10')
  })

  it('sets communal_entrance=true when B1=communal', () => {
    const c = classify({ ...s257(), B1: a('communal') })
    expect(c.communal_entrance).toBe('true')
    expect(c.separate_entrance_mode).toBe(false)
  })

  it('sets separate_entrance_mode=true when B1=separate', () => {
    const c = classify({ ...s257(), B1: a('separate') })
    expect(c.communal_entrance).toBe('false')
    expect(c.separate_entrance_mode).toBe(true)
  })

  it('communal_entrance is unknown when B1 not answered', () => {
    const c = classify(s257())
    expect(c.communal_entrance).toBe('unknown')
  })

  it('produces a risk level (not unresolved) for confirmed s257', () => {
    const c = classify(s257())
    expect(c.risk_level).not.toBe('unresolved')
    expect(c.risk_score).toBeGreaterThanOrEqual(0)
  })

  it('unresolved_reasons is empty for confirmed classification', () => {
    const c = classify(s257())
    expect(c.unresolved_reasons).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// probable-section-257
// NOTE: In the current implementation, 'probable-section-257' is only produced
// when blocked=true but all classification criteria are still answered 'confirmed'.
// This requires a BLOCK_CLASS question that is NOT a Section A criterion to be
// answered 'not_sure'. With current question bank (only A1, A2, A4 as BLOCK_CLASS
// and all three being criteria), this state is unreachable in practice.
// The bug: the early-return `if (hasUnanswered || blocked)` prevents Step 4
// from ever running with blocked=true.
// ---------------------------------------------------------------------------

describe('classify — unresolved', () => {
  it('returns unresolved when no questions answered', () => {
    const c = classify({})
    expect(c.type).toBe('unresolved')
    expect(c.confidence).toBe('unresolved')
    expect(c.risk_level).toBe('unresolved')
    expect(c.risk_score).toBe(0)
  })

  it('returns unresolved when only some A criteria answered', () => {
    const c = classify({ A1: a('converted'), A2: a('yes') })
    expect(c.type).toBe('unresolved')
  })

  it('unresolved includes a reason string', () => {
    const c = classify({})
    expect(c.unresolved_reasons.length).toBeGreaterThan(0)
    expect(c.unresolved_reasons[0].length).toBeGreaterThan(0)
  })

  it('A1=not_sure (BLOCK_CLASS) with all other criteria present returns unresolved', () => {
    // 'not_sure' on A1 fails the A1 criterion (not === 'converted'), so hasUnanswered=false
    // but criterion is false → allMet=false... except BLOCK_CLASS also triggers.
    // Current behaviour: returns 'unresolved' (blocked path).
    const answers: AnswerMap = {
      ...s257(),
      A1: a('not_sure'),
    }
    const c = classify(answers)
    // 'not_sure' on A1 triggers BLOCK_CLASS (blocked=true) AND makes criterion false (allMet=false)
    // hasUnanswered=false, but blocked=true → early return 'unresolved'
    expect(c.type).toBe('unresolved')
  })
})

// ---------------------------------------------------------------------------
// not-section-257 — criteria explicitly not met
// ---------------------------------------------------------------------------

describe('classify — not-section-257 (criteria not met)', () => {
  it('returns not-section-257 when A1=purpose-built', () => {
    const c = classify({ ...s257(), A1: a('purpose-built') })
    expect(c.type).toBe('not-section-257')
  })

  it('returns not-section-257 with risk_level=unresolved (out-of-scope scoring suppressed)', () => {
    const c = classify({ ...s257(), A1: a('purpose-built') })
    expect(c.risk_level).toBe('unresolved')
    expect(c.risk_score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// not-section-257 — out-of-scope triggers
// ---------------------------------------------------------------------------

describe('classify — not-section-257 (out-of-scope)', () => {
  it('A2=no triggers out-of-scope → not-section-257', () => {
    const c = classify({ ...s257(), A2: a('no') })
    expect(c.type).toBe('not-section-257')
  })

  it('A3=3_or_more triggers out-of-scope → not-section-257', () => {
    const c = classify({ ...s257(), A3: a('3_or_more') })
    expect(c.type).toBe('not-section-257')
  })

  it('A3=not_flats triggers out-of-scope → not-section-257', () => {
    const c = classify({ ...s257(), A3: a('not_flats') })
    expect(c.type).toBe('not-section-257')
  })

  it('A4=one_owner_occupied triggers out-of-scope → not-section-257', () => {
    const c = classify({ ...s257(), A4: a('one_owner_occupied') })
    expect(c.type).toBe('not-section-257')
  })

  it('A4=social triggers out-of-scope → not-section-257', () => {
    const c = classify({ ...s257(), A4: a('social') })
    expect(c.type).toBe('not-section-257')
  })

  it('A5=no triggers out-of-scope → not-section-257', () => {
    const c = classify({ ...s257(), A5: a('no') })
    expect(c.type).toBe('not-section-257')
  })

  it('out-of-scope classification has confidence=confirmed', () => {
    const c = classify({ ...s257(), A5: a('no') })
    expect(c.confidence).toBe('confirmed')
  })
})

// ---------------------------------------------------------------------------
// Escape window assessment
// ---------------------------------------------------------------------------

describe('classify — escape window assessment', () => {
  it('bedroom_1 qualifies when ALL LACORS §14 criteria confirmed', () => {
    const c = classify({ ...s257(), ...qualifyingBed1() })
    expect(c.escape_windows.bedroom_1).toBe('qualifies')
  })

  it('bedroom_1 does-not-qualify when window absent (C1=no)', () => {
    const c = classify({ ...s257(), C1: a('no') })
    expect(c.escape_windows.bedroom_1).toBe('does-not-qualify')
  })

  it('bedroom_1 does-not-qualify when key required (C2=no)', () => {
    const c = classify({ ...s257(), C1: a('yes'), C2: a('no') })
    expect(c.escape_windows.bedroom_1).toBe('does-not-qualify')
  })

  it('bedroom_1 does-not-qualify when sill too high (C3=no)', () => {
    const c = classify({
      ...s257(),
      B4: a('2.5_4m'), C1: a('yes'), C2: a('yes'), C3: a('no'), C12: a('no'),
    })
    expect(c.escape_windows.bedroom_1).toBe('does-not-qualify')
  })

  it('bedroom_1 does-not-qualify when area insufficient (C4=no)', () => {
    const c = classify({
      ...s257(),
      B4: a('2.5_4m'), C1: a('yes'), C2: a('yes'), C3: a('yes'), C4: a('no'), C12: a('no'),
    })
    expect(c.escape_windows.bedroom_1).toBe('does-not-qualify')
  })

  it('bedroom_1 does-not-qualify when obstruction present (C5=yes)', () => {
    // C5='yes' means obstruction IS present — this is a FAIL (inverted semantics)
    const c = classify({
      ...s257(),
      B4: a('2.5_4m'), C1: a('yes'), C2: a('yes'), C3: a('yes'), C4: a('yes'),
      C5: a('yes'), // obstruction present = FAIL
      C12: a('no'),
    })
    expect(c.escape_windows.bedroom_1).toBe('does-not-qualify')
  })

  it('bedroom_1 does-not-qualify when floor too high (B4=above_4.5m)', () => {
    const c = classify({
      ...s257(),
      B4: a('above_4.5m'),
      C1: a('yes'), C2: a('yes'), C3: a('yes'), C4: a('yes'), C5: a('no'),
      C12: a('no'),
    })
    expect(c.escape_windows.bedroom_1).toBe('does-not-qualify')
  })

  it('bedroom_1 does-not-qualify when occupant mobility-impaired (C12=yes)', () => {
    // C12='yes' = mobility impaired → cannot rely on window
    const c = classify({
      ...s257(),
      B4: a('2.5_4m'),
      C1: a('yes'), C2: a('yes'), C3: a('yes'), C4: a('yes'), C5: a('no'),
      C12: a('yes'),
    })
    expect(c.escape_windows.bedroom_1).toBe('does-not-qualify')
  })

  it('bedroom_1 unknown when any criterion is not_sure', () => {
    const c = classify({
      ...s257(),
      C1: a('yes'),
      C2: a('not_sure'), // uncertain — conservative → unknown
    })
    expect(c.escape_windows.bedroom_1).toBe('unknown')
  })

  it('bedroom_1 unknown when C1 not yet answered', () => {
    const c = classify(s257())
    expect(c.escape_windows.bedroom_1).toBe('unknown')
  })

  it('bedroom_2 is not-applicable when C6=no (single bedroom)', () => {
    const c = classify({ ...s257(), C6: a('no') })
    expect(c.escape_windows.bedroom_2).toBe('not-applicable')
  })

  it('bedroom_2 is unknown when C6 not answered', () => {
    const c = classify(s257())
    expect(c.escape_windows.bedroom_2).toBe('unknown')
  })

  it('bedroom_2 is assessed when C6=yes', () => {
    const c = classify({ ...s257(), C6: a('yes'), C7: a('no') })
    expect(c.escape_windows.bedroom_2).toBe('does-not-qualify')
  })
})

// ---------------------------------------------------------------------------
// Inner room detection
// ---------------------------------------------------------------------------

describe('classify — inner room detection', () => {
  it('inner_room_present=yes when C10=yes', () => {
    const c = classify({ ...s257(), C10: a('yes') })
    expect(c.inner_room_present).toBe('yes')
  })

  it('inner_room_present=yes when C13=no (bed1 accessible only through habitable room)', () => {
    const c = classify({ ...s257(), C10: a('no'), C13: a('no') })
    expect(c.inner_room_present).toBe('yes')
  })

  it('inner_room_present=no when C10=no and C13=yes', () => {
    const c = classify({ ...s257(), C10: a('no'), C13: a('yes') })
    expect(c.inner_room_present).toBe('no')
  })

  it('inner_room_present=unknown when C10 not answered', () => {
    const c = classify(s257())
    expect(c.inner_room_present).toBe('unknown')
  })

  it('inner_room_present=unknown when C10=not_sure', () => {
    const c = classify({ ...s257(), C10: a('not_sure') })
    expect(c.inner_room_present).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// Upper flat independent exit
// ---------------------------------------------------------------------------

describe('classify — upper flat independent exit', () => {
  it('returns yes when B2=yes', () => {
    const c = classify({ ...s257(), B2: a('yes') })
    expect(c.upper_flat_independent_exit).toBe('yes')
  })

  it('returns no when B2=no', () => {
    const c = classify({ ...s257(), B2: a('no') })
    expect(c.upper_flat_independent_exit).toBe('no')
  })

  it('returns unknown when B2 not answered', () => {
    const c = classify(s257())
    expect(c.upper_flat_independent_exit).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// Risk level thresholds
// ---------------------------------------------------------------------------

/** Qualifying living room escape window answers. */
function qualifyingLivingRoom(): AnswerMap {
  return {
    C11: a('yes'),   // window present
    C11a: a('yes'),  // no key required
    C11b: a('yes'),  // sill ≤ 1100mm
    C11c: a('yes'),  // area ≥ 0.33m²
    C11d: a('no'),   // no obstruction
  }
}

describe('classify — risk level thresholds', () => {
  it('returns low risk (score 0) for s257 with all escape windows qualifying', () => {
    // s257() base alone has unknown escape windows (score=3, normal).
    // Add qualifying windows to reach a true zero-risk baseline.
    const c = classify({
      ...s257(),
      ...qualifyingBed1(),
      ...qualifyingLivingRoom(),
      C6: a('no'),  // no second bedroom → bedroom_2 = not-applicable
    })
    expect(c.risk_score).toBe(0)
    expect(c.risk_level).toBe('low')
  })

  it('returns unresolved risk for out-of-scope property', () => {
    const c = classify({ ...s257(), A5: a('no') })
    expect(c.risk_level).toBe('unresolved')
  })

  it('returns elevated risk (≥6) with several stacked factors', () => {
    // Qualifying windows give 0 baseline.
    // RF-E04 (no alarm) = 3, RF-D01 (hardboard) = 2, RF-H01 (no compliance docs) = 2 → total 7 = elevated.
    const answers: AnswerMap = {
      ...s257(),
      ...qualifyingBed1(),
      ...qualifyingLivingRoom(),
      C6: a('no'),
      B1: a('communal'),
      E1: a('none'),       // RF-E04 weight 3
      D1: a('hardboard'),  // RF-D01 weight 2
      H1: a('no'),         // RF-H01 weight 2
    }
    const c = classify(answers)
    expect(c.risk_level).toBe('elevated')
    expect(c.risk_score).toBeGreaterThanOrEqual(6)
  })

  it('returns high risk (≥10) with many stacked factors', () => {
    const answers: AnswerMap = {
      ...s257(),
      B1: a('communal'),
      E1: a('none'),            // RF-E04 = 3
      D1: a('hardboard'),       // RF-D01 = 2
      D2: a('exposed_timber'),  // RF-D02 = 2
      D6: a('poor'),            // RF-D06 = 2
      H1: a('no'),              // RF-H01 = 2
    }
    const c = classify(answers)
    expect(c.risk_level).toBe('high')
    expect(c.risk_score).toBeGreaterThanOrEqual(10)
  })

  it('risk_factors_present is populated', () => {
    const answers: AnswerMap = { ...s257(), B1: a('communal'), E1: a('none') }
    const c = classify(answers)
    expect(c.risk_factors_present).toContain('RF-E04')
  })
})

// ---------------------------------------------------------------------------
// computeRiskFactors()
// ---------------------------------------------------------------------------

// Communal context with all escape windows qualifying and no escape risk factors —
// so we can test individual construction/detection/management factors in isolation.
const communalCtx = {
  communal_entrance: 'true' as const,
  separate_entrance_mode: false,
  escape_windows: {
    bedroom_1: 'qualifies' as const,
    bedroom_2: 'not-applicable' as const,
    living_room: 'qualifies' as const,
  },
  inner_room_present: 'no' as const,
  upper_flat_independent_exit: 'yes' as const,
}

const separateCtx = { ...communalCtx, separate_entrance_mode: true }

describe('computeRiskFactors — detection', () => {
  it('RF-E04 (weight 3) for no alarms (E1=none)', () => {
    const { score, factors } = computeRiskFactors({ E1: a('none') }, communalCtx)
    expect(factors).toContain('RF-E04')
    expect(score).toBeGreaterThanOrEqual(3)
  })

  it('RF-E01 (weight 2) for battery-only alarms (E1=battery_only)', () => {
    const { factors } = computeRiskFactors({ E1: a('battery_only') }, communalCtx)
    expect(factors).toContain('RF-E01')
    expect(factors).not.toContain('RF-E04')
  })

  it('RF-E01 (weight 1) for mixed alarms (E1=mixed)', () => {
    const { factors } = computeRiskFactors({ E1: a('mixed') }, communalCtx)
    expect(factors).toContain('RF-E01')
  })

  it('no detection factor for mains-wired alarms (E1=mains_wired)', () => {
    const { factors } = computeRiskFactors({ E1: a('mains_wired') }, communalCtx)
    expect(factors).not.toContain('RF-E01')
    expect(factors).not.toContain('RF-E04')
  })
})

describe('computeRiskFactors — construction', () => {
  it('RF-D01 (weight 2) for hardboard panelling', () => {
    const { factors } = computeRiskFactors({ D1: a('hardboard') }, communalCtx)
    expect(factors).toContain('RF-D01')
  })

  it('RF-D01b (weight 1) for 9mm panelling', () => {
    const { factors } = computeRiskFactors({ D1: a('9mm') }, communalCtx)
    expect(factors).toContain('RF-D01b')
  })

  it('RF-D02 for exposed timber soffit (D2=exposed_timber)', () => {
    const { factors } = computeRiskFactors({ D2: a('exposed_timber') }, communalCtx)
    expect(factors).toContain('RF-D02')
  })

  it('RF-D02 for exposed floor joists between flats (D7=timber_exposed)', () => {
    const { factors } = computeRiskFactors({ D7: a('timber_exposed') }, communalCtx)
    expect(factors).toContain('RF-D02')
  })

  it('RF-D04 for penetrations through enclosure (D4=yes)', () => {
    const { factors } = computeRiskFactors({ D4: a('yes') }, communalCtx)
    expect(factors).toContain('RF-D04')
  })

  it('RF-D06 (weight 2) for poor staircase condition (D6=poor)', () => {
    const { factors } = computeRiskFactors({ D6: a('poor') }, communalCtx)
    expect(factors).toContain('RF-D06')
  })

  it('construction factors suppressed in separate-entrance mode', () => {
    const answers: AnswerMap = {
      D1: a('hardboard'),
      D2: a('exposed_timber'),
      D4: a('yes'),
      D6: a('poor'),
    }
    const { factors } = computeRiskFactors(answers, separateCtx)
    expect(factors).not.toContain('RF-D01')
    expect(factors).not.toContain('RF-D02')
    expect(factors).not.toContain('RF-D04')
    expect(factors).not.toContain('RF-D06')
  })
})

describe('computeRiskFactors — D9 multi-choice (combustibles)', () => {
  it('RF-D03 (weight 2) for 2 or more harmful items', () => {
    const { factors } = computeRiskFactors(
      { D9: a(JSON.stringify(['motorbike', 'gas_cylinder'])) },
      communalCtx
    )
    expect(factors).toContain('RF-D03')
  })

  it('RF-D03 (weight 1) for exactly 1 harmful item', () => {
    const { factors } = computeRiskFactors(
      { D9: a(JSON.stringify(['motorbike'])) },
      communalCtx
    )
    expect(factors).toContain('RF-D03')
  })

  it('no RF-D03 when D9 contains only "none"', () => {
    const { factors } = computeRiskFactors(
      { D9: a(JSON.stringify(['none'])) },
      communalCtx
    )
    expect(factors).not.toContain('RF-D03')
  })

  it('does not throw on malformed D9 JSON', () => {
    expect(() =>
      computeRiskFactors({ D9: a('not{valid}json') }, communalCtx)
    ).not.toThrow()
  })

  it('construction factors (including RF-D03) suppressed in separate-entrance mode', () => {
    const { factors } = computeRiskFactors(
      { D9: a(JSON.stringify(['motorbike', 'gas_cylinder'])) },
      separateCtx
    )
    expect(factors).not.toContain('RF-D03')
  })
})

describe('computeRiskFactors — escape', () => {
  it('RF-C01 (weight 2) when no bedroom qualifies and no rear exit', () => {
    const ctx = {
      ...communalCtx,
      escape_windows: {
        bedroom_1: 'does-not-qualify' as const,
        bedroom_2: 'does-not-qualify' as const,
        living_room: 'unknown' as const,
      },
      upper_flat_independent_exit: 'no' as const,
    }
    const { factors } = computeRiskFactors({}, ctx)
    expect(factors).toContain('RF-C01')
  })

  it('RF-C01 not added when a bedroom window qualifies', () => {
    const ctx = {
      ...communalCtx,
      escape_windows: {
        bedroom_1: 'qualifies' as const,
        bedroom_2: 'unknown' as const,
        living_room: 'unknown' as const,
      },
    }
    const { factors } = computeRiskFactors({}, ctx)
    expect(factors).not.toContain('RF-C01')
  })

  it('RF-C03 for inner room present', () => {
    const ctx = { ...communalCtx, inner_room_present: 'yes' as const }
    const { factors } = computeRiskFactors({}, ctx)
    expect(factors).toContain('RF-C03')
  })

  it('RF-C05 (weight 2) for mobility-impaired occupant (C12=yes)', () => {
    const { factors } = computeRiskFactors({ C12: a('yes') }, communalCtx)
    expect(factors).toContain('RF-C05')
  })
})

describe('computeRiskFactors — management', () => {
  it('RF-H01 (weight 2) for no compliance documentation (H1=no)', () => {
    const { factors } = computeRiskFactors({ H1: a('no') }, communalCtx)
    expect(factors).toContain('RF-H01')
  })

  it('RF-H01 (weight 1) for partial compliance (H1=mostly)', () => {
    const { factors } = computeRiskFactors({ H1: a('mostly') }, communalCtx)
    expect(factors).toContain('RF-H01')
  })

  it('RF-H04 (weight 2) for minimal management engagement (H4=minimal)', () => {
    const { factors } = computeRiskFactors({ H4: a('minimal') }, communalCtx)
    expect(factors).toContain('RF-H04')
  })
})

describe('computeRiskFactors — zero score baseline', () => {
  it('returns score=0 and no factors when no risk answers given', () => {
    const { score, factors } = computeRiskFactors({}, communalCtx)
    expect(score).toBe(0)
    expect(factors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// RISK_FACTOR_DIMENSIONS export
// ---------------------------------------------------------------------------

describe('RISK_FACTOR_DIMENSIONS', () => {
  it('maps known factors to the correct dimensions', () => {
    expect(RISK_FACTOR_DIMENSIONS['RF-E04']).toBe('detection')
    expect(RISK_FACTOR_DIMENSIONS['RF-D01']).toBe('construction')
    expect(RISK_FACTOR_DIMENSIONS['RF-C01']).toBe('escape')
    expect(RISK_FACTOR_DIMENSIONS['RF-H01']).toBe('management')
  })

  it('does not have unknown factor IDs', () => {
    expect(RISK_FACTOR_DIMENSIONS['RF-XXXX']).toBeUndefined()
  })
})
