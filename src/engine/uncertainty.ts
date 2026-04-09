/**
 * uncertainty.ts — Uncertainty behaviour definitions and helpers.
 *
 * The four behaviour codes are defined in requirements §6.1.
 * This module provides typed constants and a lookup helper used by
 * the classifier and remedy engine.
 *
 * This module has NO imports from React, persistence, or UI.
 */

import type { UncertaintyBehaviour } from '../data/schema/questions'
import type { AnswerMap } from '../state/AppState'

/**
 * Returns the uncertainty behaviour code for a given question given the
 * current answer map.
 *
 * If the answer to `questionId` is "not_sure" or "unknown" AND the question
 * schema defines an uncertainty_behaviour, that code is returned.
 * Otherwise returns null.
 *
 * TODO: Wire in the full question schema lookup once QUESTION_MAP is imported.
 */
export function getUncertaintyBehaviour(
  questionId: string,
  answers: AnswerMap,
  uncertaintyMap: Record<string, UncertaintyBehaviour>
): UncertaintyBehaviour | null {
  const answer = answers[questionId]
  if (!answer) return null
  if (answer.value !== 'not_sure' && answer.confidence !== 'not_sure' && answer.confidence !== 'unknown') {
    return null
  }
  return uncertaintyMap[questionId] ?? null
}

/**
 * Returns true if any question answered "not_sure"/"unknown" has the given
 * behaviour code.
 *
 * Used by the classifier to detect BLOCK_CLASS conditions.
 */
export function hasUncertaintyBehaviour(
  behaviour: UncertaintyBehaviour,
  answers: AnswerMap,
  uncertaintyMap: Record<string, UncertaintyBehaviour>
): boolean {
  return Object.keys(answers).some(
    (qid) => getUncertaintyBehaviour(qid, answers, uncertaintyMap) === behaviour
  )
}
