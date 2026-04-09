/**
 * navigator.ts — Branching / next-question logic (Layer 1 of engine).
 *
 * Given the current answer map, this module determines:
 *   - The next question to show
 *   - Which sections are complete / skipped / not applicable
 *   - Whether the questionnaire is complete
 *   - Which answers are transitively invalidated when an earlier answer changes
 *   - Whether a given answer value is valid for a question
 *   - Whether a given answer triggers an out-of-scope condition
 *
 * This module is a pure function library. No React, no DOM, no localStorage.
 * It reads from questions.ts (schema) and answers (state) only.
 */

import type { AnswerMap, AnswerValue, SectionId } from '../state/AppState'
import {
  QUESTIONS,
  QUESTION_MAP,
  SECTION_ORDER,
  type Question,
  type BranchCondition,
} from '../data/schema/questions'

// ---------------------------------------------------------------------------
// UK postcode regex (used in isAnswerValid for address questions)
// ---------------------------------------------------------------------------

/**
 * Validates a UK postcode string (normalised or raw).
 * Accepts formats: SW1A 1AA, W1A 0AX, EC1A 1BB, TW9 4HA etc.
 * Returns true if valid, false otherwise.
 */
export function isValidUKPostcode(postcode: string): boolean {
  const normalised = postcode.replace(/\s+/g, '').toUpperCase()
  // Standard UK postcode regex (covers all valid outward + inward code formats)
  return /^[A-Z]{1,2}[0-9][0-9A-Z]?[0-9][A-BD-HJLNP-UW-Z]{2}$/.test(normalised)
}

// ---------------------------------------------------------------------------
// Condition evaluation (internal)
// ---------------------------------------------------------------------------

function evaluateCondition(condition: BranchCondition, answers: AnswerMap): boolean {
  const answer = answers[condition.when_question]
  if (!answer) return false

  const value = answer.value
  const matchValues = Array.isArray(condition.has_value)
    ? condition.has_value
    : [condition.has_value]

  // For multi-choice answers stored as JSON array strings, check if any
  // selected value matches the condition.
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        const matched = matchValues.some((mv) => (parsed as string[]).includes(mv))
        return condition.negate ? !matched : matched
      }
    } catch {
      // Not a JSON array — fall through to scalar comparison
    }
  }

  const matched = matchValues.includes(String(value))
  return condition.negate ? !matched : matched
}

export function shouldShowQuestion(question: Question, answers: AnswerMap): boolean {
  if (!question.show_when || question.show_when.length === 0) return true
  return question.show_when.every((cond) => evaluateCondition(cond, answers))
}

// ---------------------------------------------------------------------------
// Out-of-scope detection
// ---------------------------------------------------------------------------

/**
 * Returns true if any current answer has triggered an out-of-scope option.
 */
export function isOutOfScope(answers: AnswerMap): boolean {
  return getOutOfScopeReason(answers) !== null
}

/**
 * Returns the out-of-scope reason string for the first answer that triggers
 * an out-of-scope option, or null if none.
 */
export function getOutOfScopeReason(answers: AnswerMap): string | null {
  for (const [qid, answer] of Object.entries(answers)) {
    const question = QUESTION_MAP[qid]
    if (!question?.options) continue
    const selectedOption = question.options.find((o) => o.value === answer.value)
    if (selectedOption?.triggers_out_of_scope) {
      return (
        selectedOption.out_of_scope_reason ??
        'This property does not fall within the scope of Version 1 of this tool.'
      )
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Answer validity
// ---------------------------------------------------------------------------

/**
 * Returns true if the given value constitutes a valid answer for the question.
 *
 * Rules:
 *   - Not-required questions: any value (including null/empty string) is valid
 *   - Required text questions: non-empty string
 *   - Required single-choice: a non-null value
 *   - Required multi-choice: JSON array with at least one item
 *   - Required address (P1): JSON with non-empty address_line_1 and valid postcode
 */
export function isAnswerValid(value: AnswerValue, question: Question): boolean {
  if (!question.required) return true
  if (value === null) return false

  if (question.type === 'address') {
    if (typeof value !== 'string' || !value) return false
    try {
      const addr = JSON.parse(value) as Record<string, string>
      if (!addr.address_line_1?.trim()) return false
      if (!addr.postcode?.trim()) return false
      if (!isValidUKPostcode(addr.postcode)) return false
      return true
    } catch {
      return false
    }
  }

  if (question.type === 'text') {
    return typeof value === 'string' && value.trim().length > 0
  }

  if (question.type === 'multi-choice') {
    if (typeof value !== 'string' || !value) return false
    try {
      const arr = JSON.parse(value) as unknown[]
      return Array.isArray(arr) && arr.length > 0
    } catch {
      return false
    }
  }

  // single-choice, number: any non-null value is valid
  return true
}

// ---------------------------------------------------------------------------
// Next / previous question navigation
// ---------------------------------------------------------------------------

/**
 * Returns the first applicable unanswered question, or null if all applicable
 * questions have been answered (questionnaire complete).
 */
export function getNextQuestion(answers: AnswerMap): Question | null {
  for (const question of QUESTIONS) {
    if (!shouldShowQuestion(question, answers)) continue
    if (answers[question.id] !== undefined) continue
    return question
  }
  return null
}

/**
 * Returns the current in-progress question. Alias of getNextQuestion, named
 * for clarity when used in the questionnaire page.
 */
export function getCurrentQuestion(answers: AnswerMap): Question | null {
  return getNextQuestion(answers)
}

/**
 * Returns all answered applicable questions in schema order.
 * Used by the back-navigation logic and the review page.
 */
export function getAnsweredQuestions(answers: AnswerMap): Question[] {
  return QUESTIONS.filter(
    (q) => shouldShowQuestion(q, answers) && answers[q.id] !== undefined
  )
}

/**
 * Returns the answered applicable question that immediately precedes the
 * question with id `currentQuestionId` in schema order.
 *
 * Returns null if `currentQuestionId` is the first question or has no
 * answered predecessor.
 */
export function getPreviousAnsweredQuestion(
  currentQuestionId: string,
  answers: AnswerMap
): Question | null {
  const answered = getAnsweredQuestions(answers)
  const currentIdx = QUESTIONS.findIndex((q) => q.id === currentQuestionId)
  if (currentIdx <= 0) return null

  for (let i = answered.length - 1; i >= 0; i--) {
    const candidateIdx = QUESTIONS.findIndex((q) => q.id === answered[i].id)
    if (candidateIdx < currentIdx) return answered[i]
  }
  return null
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface SectionProgress {
  section: SectionId
  total: number       // applicable questions
  answered: number
  status: 'not-started' | 'in-progress' | 'complete' | 'not-applicable'
}

/**
 * Returns progress for every section.
 * A section is "not-applicable" if ALL its questions fail their show_when
 * conditions. This is surfaced in the UI as a skipped section.
 */
export function getSectionProgress(answers: AnswerMap): SectionProgress[] {
  return SECTION_ORDER.filter((s) => s !== 'results').map((section) => {
    const sectionQuestions = QUESTIONS.filter((q) => q.section === section)
    const applicable = sectionQuestions.filter((q) => shouldShowQuestion(q, answers))

    if (applicable.length === 0) {
      return { section, total: 0, answered: 0, status: 'not-applicable' as const }
    }

    const answered = applicable.filter((q) => answers[q.id] !== undefined).length

    let status: SectionProgress['status'] = 'not-started'
    if (answered === applicable.length) status = 'complete'
    else if (answered > 0) status = 'in-progress'

    return { section, total: applicable.length, answered, status }
  })
}

/** 0–100 overall completion percentage across all applicable questions. */
export function getOverallProgress(answers: AnswerMap): number {
  const applicable = QUESTIONS.filter((q) => shouldShowQuestion(q, answers))
  if (applicable.length === 0) return 0
  const answered = applicable.filter((q) => answers[q.id] !== undefined).length
  return Math.round((answered / applicable.length) * 100)
}

// ---------------------------------------------------------------------------
// Transitive answer invalidation (§5.3)
// ---------------------------------------------------------------------------

/**
 * Given that question `changedId` is about to receive `newValue`, returns
 * the IDs of all currently-answered questions whose applicability depends
 * (directly or transitively) on `changedId` and would change.
 *
 * Algorithm:
 *   1. Build a working answer map with the new value in place.
 *   2. Walk every question after `changedId` in schema order.
 *   3. If it has an answer AND it would no longer be shown, add it to the
 *      invalidated set AND remove it from the working map so that its own
 *      dependents cascade correctly.
 */
export function getTransitivelyInvalidatedIds(
  changedId: string,
  newValue: AnswerValue,
  answers: AnswerMap
): string[] {
  // Working copy that will simulate the new state
  const workingAnswers: AnswerMap = {
    ...answers,
    [changedId]: {
      value: newValue,
      confidence: 'confirmed',
      answered_at: new Date().toISOString(),
    },
  }

  const toInvalidate: string[] = []
  const changedIdx = QUESTIONS.findIndex((q) => q.id === changedId)
  if (changedIdx < 0) return []

  for (let i = changedIdx + 1; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]
    // Only questions that currently have an answer can be invalidated
    if (workingAnswers[q.id] === undefined) continue
    // If the question would no longer be shown under the new state, invalidate it
    if (!shouldShowQuestion(q, workingAnswers)) {
      toInvalidate.push(q.id)
      // Remove from working map so downstream questions cascade correctly
      delete workingAnswers[q.id]
    }
  }

  return toInvalidate
}

/**
 * @deprecated Use getTransitivelyInvalidatedIds for correct cascading behaviour.
 * Retained for backward compatibility — now delegates to the transitive version.
 */
export function getInvalidatedQuestionIds(
  changedQuestionId: string,
  answers: AnswerMap
): string[] {
  // The old call sites do not pass a new value; use empty string as sentinel.
  // The transitive version handles this gracefully — the working answer will
  // have an empty value and condition checks will fail for any real conditions.
  return getTransitivelyInvalidatedIds(changedQuestionId, null, answers)
}
