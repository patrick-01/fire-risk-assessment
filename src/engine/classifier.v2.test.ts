/**
 * classifier.v2.test.ts — Unit tests for the FireRegs v2 classification and
 * legal-framework engine (classify / deriveLegalFramework).
 *
 * Pure tests: no React, no DOM, no localStorage. Covers the §6.2 HMO truth
 * table, the §6.3 purpose-built invariant, and the §7 legal-framework rules.
 */

import { describe, it, expect } from 'vitest'
import { classify, deriveLegalFramework } from './classifier'
import type { AnswerMap } from '../state/AppState'

// ---------------------------------------------------------------------------
// Test helpers
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

/** Purpose-built two-flat building, otherwise complete. */
function purposeBuilt(): AnswerMap {
  return {
    A1: a('purpose-built'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
  }
}

// ---------------------------------------------------------------------------
// §6.2 — HMO truth table
// ---------------------------------------------------------------------------

describe('classify — §6.2 HMO truth table', () => {
  it('purpose-built two-flat building is never Section 257', () => {
    const c = classify(purposeBuilt())
    expect(c.origin).toBe('purpose_built_two_flats')
    expect(c.hmo).toBe('not_hmo')
    expect(c.section_257).toBe(false)
    expect(c.confidence).toBe('confirmed')
  })

  it('two flats alone do not imply Section 257 (purpose-built, shared entrance)', () => {
    const c = classify({ ...purposeBuilt(), B1: a('communal') })
    expect(c.hmo).toBe('not_hmo')
    expect(c.section_257).toBe(false)
    // …but common parts still relevant.
    expect(c.fso_common_parts).toBe(true)
  })

  it('converted pre-1991 two-flat building is a confirmed Section 257 HMO', () => {
    const c = classify(convertedS257())
    expect(c.origin).toBe('converted_from_single_house')
    expect(c.hmo).toBe('section_257_hmo')
    expect(c.section_257).toBe(true)
    expect(c.confidence).toBe('confirmed')
  })

  it('converted post-1991 compliant conversion is not a Section 257 HMO', () => {
    const c = classify({ ...convertedS257(), A2: a('no') })
    expect(c.origin).toBe('converted_from_single_house')
    expect(c.hmo).toBe('not_hmo')
    expect(c.section_257).toBe(false)
  })

  it('one owner-occupied flat (50%) stays in scope as probable Section 257', () => {
    const c = classify({ ...convertedS257(), A4: a('one_owner_occupied') })
    expect(c.hmo).toBe('probable_section_257_hmo')
    expect(c.section_257).toBe(false) // not definitively confirmed
    expect(c.confidence).toBe('probable')
    expect(c.unresolved_reasons.join(' ')).toMatch(/owner-occupied/i)
  })

  it('social-landlord let is treated as not a Section 257 HMO', () => {
    const c = classify({ ...convertedS257(), A4: a('social') })
    expect(c.hmo).toBe('not_hmo')
    expect(c.section_257).toBe(false)
  })

  it('three or more flats is outside scope → not_hmo', () => {
    const c = classify({ ...convertedS257(), A3: a('3_or_more') })
    expect(c.hmo).toBe('not_hmo')
  })

  it('unanswered criteria → unresolved', () => {
    const c = classify({ A1: a('converted') })
    expect(c.hmo).toBe('unresolved')
    expect(c.confidence).toBe('unresolved')
  })

  it('a "not sure" answer on a BLOCK_CLASS criterion → unresolved', () => {
    const c = classify({ ...convertedS257(), A1: a('not_sure', 'not_sure') })
    expect(c.hmo).toBe('unresolved')
    expect(c.confidence).toBe('unresolved')
  })
})

// ---------------------------------------------------------------------------
// §6.3 — purpose-built invariant (§25.1 success criterion)
// ---------------------------------------------------------------------------

describe('classify — §6.3 purpose-built invariant', () => {
  it('purpose-built: D10 not applicable but general LACORS guidance still applicable', () => {
    const c = classify(purposeBuilt())
    expect(c.case_study_d10).toBe('not_applicable')
    expect(c.general_lacors_risk_guidance).toBe('applicable')
  })

  it('general LACORS risk guidance is applicable for converted Section 257 too', () => {
    const c = classify(convertedS257())
    expect(c.case_study_d10).toBe('applicable')
    expect(c.general_lacors_risk_guidance).toBe('applicable')
  })

  it('general LACORS risk guidance is never switched off for not_hmo buildings', () => {
    const c = classify({ ...convertedS257(), A2: a('no') })
    expect(c.general_lacors_risk_guidance).toBe('applicable')
  })
})

// ---------------------------------------------------------------------------
// Entrance configuration (§6.1) — replaces v1 communal_entrance
// ---------------------------------------------------------------------------

describe('classify — entrance configuration', () => {
  it('separate entrances', () => {
    expect(classify({ ...convertedS257(), B1: a('separate') }).entrance_configuration).toBe(
      'separate_private_entrances'
    )
  })

  it('communal entrance → shared_entrance_hall', () => {
    expect(classify({ ...convertedS257(), B1: a('communal') }).entrance_configuration).toBe(
      'shared_entrance_hall'
    )
  })

  it('unknown when B1 not answered', () => {
    expect(classify(convertedS257()).entrance_configuration).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// §7 — legal framework
// ---------------------------------------------------------------------------

describe('deriveLegalFramework — §7', () => {
  it('electrical safety and HHSRS fire hazard always apply', () => {
    const lf = deriveLegalFramework(purposeBuilt(), classify(purposeBuilt()))
    expect(lf.electrical_safety).toBe('applies')
    expect(lf.hhsrs_fire_hazard).toBe('applies')
  })

  it('FSO common-parts applies for a shared entrance, not for separate entrances', () => {
    const sharedAnswers = { ...convertedS257(), B1: a('communal') }
    const shared = deriveLegalFramework(sharedAnswers, classify(sharedAnswers))
    expect(shared.fire_safety_order_common_parts).toBe('applies')

    const sepAnswers = { ...convertedS257(), B1: a('separate') }
    const sep = deriveLegalFramework(sepAnswers, classify(sepAnswers))
    expect(sep.fire_safety_order_common_parts).toBe('not_applicable')
  })

  it('gas safety derives from G1 (no gas → not applicable, appliances → applies)', () => {
    const noGas = { ...convertedS257(), G1: a('no_gas') }
    expect(deriveLegalFramework(noGas, classify(noGas)).gas_safety).toBe('not_applicable')

    const overdue = { ...convertedS257(), G1: a('overdue') }
    expect(deriveLegalFramework(overdue, classify(overdue)).gas_safety).toBe('applies')

    expect(deriveLegalFramework(convertedS257(), classify(convertedS257())).gas_safety).toBe(
      'unknown'
    )
  })

  it('section_257_hmo applies for confirmed §257, not_applicable for not_hmo', () => {
    const s257 = deriveLegalFramework(convertedS257(), classify(convertedS257()))
    expect(s257.section_257_hmo).toBe('applies')

    const pb = deriveLegalFramework(purposeBuilt(), classify(purposeBuilt()))
    expect(pb.section_257_hmo).toBe('not_applicable')
  })

  it('lacors_guidance_use is a direct benchmark for converted/§257, risk reference for purpose-built', () => {
    expect(
      deriveLegalFramework(convertedS257(), classify(convertedS257())).lacors_guidance_use
    ).toBe('direct_benchmark')

    expect(
      deriveLegalFramework(purposeBuilt(), classify(purposeBuilt())).lacors_guidance_use
    ).toBe('risk_reference')
  })
})
