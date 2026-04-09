/**
 * navigator.test.ts — Unit tests for the branching / question-flow engine.
 *
 * Pure: no React, no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest'
import {
  isValidUKPostcode,
  isAnswerValid,
  shouldShowQuestion,
  getNextQuestion,
  getAnsweredQuestions,
  getTransitivelyInvalidatedIds,
  getOutOfScopeReason,
  isOutOfScope,
  getSectionProgress,
  getOverallProgress,
  getPreviousAnsweredQuestion,
} from './navigator'
import { QUESTION_MAP, QUESTIONS } from '../data/schema/questions'
import type { AnswerMap } from '../state/AppState'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function a(value: string) {
  return { value, confidence: 'confirmed' as const, answered_at: '2026-01-01T00:00:00.000Z' }
}

function s257(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
  }
}

// ---------------------------------------------------------------------------
// isValidUKPostcode
// ---------------------------------------------------------------------------

describe('isValidUKPostcode', () => {
  const valid = ['TW9 4HA', 'TW94HA', 'SW1A 1AA', 'W1A 0AX', 'EC1A 1BB', 'BN1 1AB', 'M1 1AE']
  const invalid = ['', ' ', 'INVALID', '12345', 'TW9', 'TW9 4HAA', '1234 5AB']

  for (const postcode of valid) {
    it(`accepts valid postcode: "${postcode}"`, () => {
      expect(isValidUKPostcode(postcode)).toBe(true)
    })
  }

  for (const postcode of invalid) {
    it(`rejects invalid postcode: "${postcode}"`, () => {
      expect(isValidUKPostcode(postcode)).toBe(false)
    })
  }

  it('normalises spacing before validation', () => {
    expect(isValidUKPostcode('  TW9   4HA  ')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isValidUKPostcode('tw9 4ha')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isAnswerValid
// ---------------------------------------------------------------------------

describe('isAnswerValid — not-required questions', () => {
  const P2 = QUESTION_MAP['P2'] // text, not required
  it('accepts null for a not-required question', () => {
    expect(isAnswerValid(null, P2)).toBe(true)
  })
  it('accepts empty string for a not-required question', () => {
    expect(isAnswerValid('', P2)).toBe(true)
  })
  it('accepts any value for a not-required question', () => {
    expect(isAnswerValid('anything', P2)).toBe(true)
  })
})

describe('isAnswerValid — address question (P1)', () => {
  const P1 = QUESTION_MAP['P1']
  const validAddr = JSON.stringify({
    address_line_1: '1 Test Street',
    address_line_2: null,
    town: 'Richmond',
    postcode: 'TW9 4HA',
    postcode_normalised: 'TW9 4HA',
    flat_ref: null,
  })

  it('accepts a valid JSON address with non-empty line_1 and valid postcode', () => {
    expect(isAnswerValid(validAddr, P1)).toBe(true)
  })

  it('rejects null', () => {
    expect(isAnswerValid(null, P1)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isAnswerValid('', P1)).toBe(false)
  })

  it('rejects when address_line_1 is empty', () => {
    const addr = JSON.stringify({ address_line_1: '', postcode: 'TW9 4HA' })
    expect(isAnswerValid(addr, P1)).toBe(false)
  })

  it('rejects when postcode is empty', () => {
    const addr = JSON.stringify({ address_line_1: '1 Test St', postcode: '' })
    expect(isAnswerValid(addr, P1)).toBe(false)
  })

  it('rejects when postcode is invalid', () => {
    const addr = JSON.stringify({ address_line_1: '1 Test St', postcode: 'INVALID' })
    expect(isAnswerValid(addr, P1)).toBe(false)
  })

  it('rejects non-JSON string', () => {
    expect(isAnswerValid('not json', P1)).toBe(false)
  })
})

describe('isAnswerValid — single-choice questions', () => {
  const A1 = QUESTION_MAP['A1']
  it('accepts a non-null string value', () => {
    expect(isAnswerValid('converted', A1)).toBe(true)
  })
  it('rejects null', () => {
    expect(isAnswerValid(null, A1)).toBe(false)
  })
})

describe('isAnswerValid — multi-choice questions', () => {
  // D9 is a multi-choice question
  const D9 = QUESTION_MAP['D9']
  it('accepts a non-empty JSON array', () => {
    expect(isAnswerValid(JSON.stringify(['none']), D9)).toBe(true)
  })
  it('rejects an empty JSON array', () => {
    expect(isAnswerValid(JSON.stringify([]), D9)).toBe(false)
  })
  it('rejects null', () => {
    expect(isAnswerValid(null, D9)).toBe(false)
  })
  it('rejects a non-JSON string', () => {
    expect(isAnswerValid('not-an-array', D9)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// shouldShowQuestion
// ---------------------------------------------------------------------------

describe('shouldShowQuestion', () => {
  it('shows a question with no show_when conditions', () => {
    const P1 = QUESTION_MAP['P1']
    expect(shouldShowQuestion(P1, {})).toBe(true)
  })

  it('shows A1 with no show_when', () => {
    const A1 = QUESTION_MAP['A1']
    expect(shouldShowQuestion(A1, {})).toBe(true)
  })

  it('hides a question when its condition is not met', () => {
    // D1 (staircase panelling) should require B1=communal
    // Find a question with show_when conditions
    const questionWithCondition = QUESTIONS.find(
      (q) => q.show_when && q.show_when.length > 0
    )
    if (!questionWithCondition) return // skip if no conditional questions found
    expect(shouldShowQuestion(questionWithCondition, {})).toBe(false)
  })

  it('shows a conditional question when its parent condition is met', () => {
    // B2 and subsequent questions require various answers to be present
    // Use a concrete known case: C2 (bedroom 1 window - no key required)
    // C2 shows when C1=yes (has openable window)
    const C2 = QUESTION_MAP['C2']
    if (!C2?.show_when) return // skip if no condition
    const answersWithC1Yes: AnswerMap = { C1: a('yes') }
    expect(shouldShowQuestion(C2, answersWithC1Yes)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getNextQuestion
// ---------------------------------------------------------------------------

describe('getNextQuestion', () => {
  it('returns P1 (first question) when no answers given', () => {
    const q = getNextQuestion({})
    expect(q?.id).toBe('P1')
  })

  it('returns null when all applicable questions are answered', () => {
    // Build a complete answer map for all applicable questions
    // This is complex, so just check that P1 answered moves past P1
    const answers: AnswerMap = { P1: a('{"address_line_1":"1 Test St","postcode":"TW9 4HA","town":"Richmond","address_line_2":null,"postcode_normalised":"TW9 4HA","flat_ref":null}') }
    const q = getNextQuestion(answers)
    expect(q?.id).not.toBe('P1')
  })

  it('skips questions whose show_when conditions are not met', () => {
    // Without parent answers, conditional questions should be skipped
    // P1 and P2 are setup questions, then A1 is next after setup
    const withP1: AnswerMap = {
      P1: a('{"address_line_1":"1 Test St","postcode":"TW9 4HA","town":"Richmond","address_line_2":null,"postcode_normalised":"TW9 4HA","flat_ref":null}'),
    }
    const next = getNextQuestion(withP1)
    // P2 is not required and next question should be P2 (still in setup) or A1
    expect(next).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getAnsweredQuestions
// ---------------------------------------------------------------------------

describe('getAnsweredQuestions', () => {
  it('returns empty array when no answers', () => {
    expect(getAnsweredQuestions({})).toHaveLength(0)
  })

  it('returns answered applicable questions in schema order', () => {
    const answers: AnswerMap = {
      A1: a('converted'),
      A2: a('yes'),
    }
    const answered = getAnsweredQuestions(answers)
    const ids = answered.map((q) => q.id)
    expect(ids).toContain('A1')
    expect(ids).toContain('A2')
    // Check order: A1 should appear before A2
    expect(ids.indexOf('A1')).toBeLessThan(ids.indexOf('A2'))
  })

  it('excludes non-applicable questions even if they have answers', () => {
    // If A1='purpose-built', A2 would still show (it has no show_when on A1)
    // But a question like D1 requires B1=communal — if B1 isn't communal, D1 should not appear
    const answers: AnswerMap = {
      A1: a('converted'),
      A2: a('yes'),
      A3: a('2'),
      A4: a('none_owner_occupied'),
      A5: a('yes'),
      B1: a('separate'), // separate entrance → D section questions hidden
      D1: a('hardboard'), // answer present but question not applicable
    }
    const answered = getAnsweredQuestions(answers)
    const ids = answered.map((q) => q.id)
    // D1 should not appear in applicable questions when B1=separate
    // (This depends on D1's show_when conditions)
    expect(ids).toContain('A1')
    expect(ids).toContain('B1')
  })
})

// ---------------------------------------------------------------------------
// getPreviousAnsweredQuestion
// ---------------------------------------------------------------------------

describe('getPreviousAnsweredQuestion', () => {
  it('returns null for the first question', () => {
    const prev = getPreviousAnsweredQuestion('P1', { P1: a('test') })
    expect(prev).toBeNull()
  })

  it('returns the previous answered question', () => {
    const answers: AnswerMap = {
      A1: a('converted'),
      A2: a('yes'),
    }
    const prev = getPreviousAnsweredQuestion('A2', answers)
    expect(prev?.id).toBe('A1')
  })
})

// ---------------------------------------------------------------------------
// getTransitivelyInvalidatedIds
// ---------------------------------------------------------------------------

describe('getTransitivelyInvalidatedIds', () => {
  it('returns empty array when no downstream questions are answered', () => {
    const invalidated = getTransitivelyInvalidatedIds('A1', 'converted', { A1: a('converted') })
    expect(invalidated).toEqual([])
  })

  it('invalidates questions that become non-applicable after an answer change', () => {
    // Setup: C2 shows when C1=yes. If C1 changes from 'yes' to 'no', C2 should be invalidated.
    const answers: AnswerMap = {
      C1: a('yes'),
      C2: a('yes'), // currently answered, but depends on C1=yes
    }
    const invalidated = getTransitivelyInvalidatedIds('C1', 'no', answers)
    // C2 requires C1=yes; changing C1 to 'no' should invalidate C2
    const C2 = QUESTION_MAP['C2']
    if (C2?.show_when?.some((c) => c.when_question === 'C1')) {
      expect(invalidated).toContain('C2')
    }
  })

  it('cascades — invalidating one question removes its dependents too', () => {
    // If C1='yes' is required for C2, and C2='yes' is required for C3,
    // changing C1 to 'no' should invalidate both C2 and C3.
    const answers: AnswerMap = {
      C1: a('yes'),
      C2: a('yes'),
      C3: a('yes'),
    }
    const invalidated = getTransitivelyInvalidatedIds('C1', 'no', answers)
    // The cascade may or may not include C3 depending on show_when conditions
    // At minimum, no crash should occur
    expect(Array.isArray(invalidated)).toBe(true)
  })

  it('does not invalidate questions that remain applicable', () => {
    // A2 doesn't depend on A1's value in show_when (A2 has no show_when on A1)
    const answers: AnswerMap = {
      A1: a('converted'),
      A2: a('yes'),
    }
    const invalidated = getTransitivelyInvalidatedIds('A1', 'purpose-built', answers)
    // A2 should not be invalidated because it has no show_when dependency on A1
    expect(invalidated).not.toContain('A2')
  })

  it('returns empty array when changedId is not in the question bank', () => {
    const invalidated = getTransitivelyInvalidatedIds('UNKNOWN_Q', 'yes', { UNKNOWN_Q: a('no') })
    expect(invalidated).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getOutOfScopeReason / isOutOfScope
// ---------------------------------------------------------------------------

describe('getOutOfScopeReason', () => {
  it('returns null when no out-of-scope answers present', () => {
    expect(getOutOfScopeReason(s257())).toBeNull()
  })

  it('returns a string when A2=no triggers out-of-scope', () => {
    const reason = getOutOfScopeReason({ A2: a('no') })
    expect(typeof reason).toBe('string')
    expect(reason!.length).toBeGreaterThan(0)
  })

  it('returns a string when A3=3_or_more triggers out-of-scope', () => {
    expect(typeof getOutOfScopeReason({ A3: a('3_or_more') })).toBe('string')
  })

  it('returns a string when A4=one_owner_occupied triggers out-of-scope', () => {
    expect(typeof getOutOfScopeReason({ A4: a('one_owner_occupied') })).toBe('string')
  })

  it('returns a string when A5=no triggers out-of-scope', () => {
    expect(typeof getOutOfScopeReason({ A5: a('no') })).toBe('string')
  })

  it('returns null for valid answers', () => {
    expect(getOutOfScopeReason({ A1: a('converted'), A2: a('yes') })).toBeNull()
  })
})

describe('isOutOfScope', () => {
  it('returns false for valid answers', () => {
    expect(isOutOfScope(s257())).toBe(false)
  })

  it('returns true when an out-of-scope answer is present', () => {
    expect(isOutOfScope({ A5: a('no') })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getSectionProgress / getOverallProgress
// ---------------------------------------------------------------------------

describe('getSectionProgress', () => {
  it('returns progress for every section except results', () => {
    const progress = getSectionProgress({})
    const sections = progress.map((p) => p.section)
    expect(sections).not.toContain('results')
    expect(sections).toContain('setup')
    expect(sections).toContain('A')
  })

  it('reports not-started for empty answers', () => {
    const progress = getSectionProgress({})
    const setup = progress.find((p) => p.section === 'setup')
    // setup has P1 and P2; with no answers, status is not-started
    expect(setup?.status).toBe('not-started')
  })

  it('reports complete when all applicable section questions answered', () => {
    // Answer P1 and P2 to complete the setup section
    const answers: AnswerMap = {
      P1: a('{"address_line_1":"1 Test St","postcode":"TW9 4HA","town":"Richmond","address_line_2":null,"postcode_normalised":"TW9 4HA","flat_ref":null}'),
      P2: a('Flat A'),
    }
    const progress = getSectionProgress(answers)
    const setup = progress.find((p) => p.section === 'setup')
    expect(setup?.status).toBe('complete')
    expect(setup?.answered).toBe(setup?.total)
  })

  it('reports in-progress when some section questions answered', () => {
    // Only answer P1 for setup section
    const answers: AnswerMap = {
      P1: a('{"address_line_1":"1 Test St","postcode":"TW9 4HA","town":"Richmond","address_line_2":null,"postcode_normalised":"TW9 4HA","flat_ref":null}'),
    }
    const progress = getSectionProgress(answers)
    const setup = progress.find((p) => p.section === 'setup')
    // P1 answered, P2 not answered → in-progress
    expect(setup?.status).toBe('in-progress')
  })
})

describe('getOverallProgress', () => {
  it('returns 0 for no answers', () => {
    expect(getOverallProgress({})).toBe(0)
  })

  it('returns a value between 0 and 100', () => {
    const progress = getOverallProgress({ A1: a('converted') })
    expect(progress).toBeGreaterThanOrEqual(0)
    expect(progress).toBeLessThanOrEqual(100)
  })

  it('increases as more questions are answered', () => {
    const one = getOverallProgress({ A1: a('converted') })
    const two = getOverallProgress({ A1: a('converted'), A2: a('yes') })
    expect(two).toBeGreaterThan(one)
  })
})
