/**
 * QuestionnairePage.tsx — Main question-by-question flow.
 *
 * Responsibilities:
 *   - Show the question at assessment.current_question_id
 *   - Pre-populate the draft from the saved answer when in edit mode
 *   - Gate the Next button until the answer is valid
 *   - Show an invalidation confirmation before re-answering a question that
 *     has downstream dependencies (§5.3)
 *   - Back button via getPreviousAnsweredQuestion
 *   - Transition to out-of-scope / review screens via useEffect (not during render)
 *   - "Saved" flash indicator on last_edited_at change
 *
 * This page contains NO compliance logic. All branching, progress, and
 * validation come from src/engine/navigator.ts.
 */

import { useState, useEffect, useRef } from 'react'
import { useAppContext } from '../state/AppContext'
import {
  getOverallProgress,
  getSectionProgress,
  getPreviousAnsweredQuestion,
  getTransitivelyInvalidatedIds,
  isAnswerValid,
  shouldShowQuestion,
} from '../engine/navigator'
import { QUESTION_MAP } from '../data/schema/questions'
import type { AnswerValue, AnswerConfidence } from '../state/AppState'
import QuestionCard from '../components/QuestionCard'
import ProgressBar from '../components/ProgressBar'

export default function QuestionnairePage() {
  const { state, dispatch } = useAppContext()
  const assessment = state.activeAssessment
  const answers = assessment?.answers ?? {}

  // Draft value for the current question (not yet committed to state).
  const [draftValue, setDraftValue] = useState<AnswerValue>(null)
  const [draftConfidence, setDraftConfidence] = useState<AnswerConfidence>('confirmed')

  // Pending invalidation confirmation state.
  const [pendingConfirm, setPendingConfirm] = useState<{
    invalidatedCount: number
    onConfirm: () => void
  } | null>(null)

  // "Saved" flash: show for 1.5 s after last_edited_at changes.
  const [showSaved, setShowSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastEditedRef = useRef<string | null>(assessment?.last_edited_at ?? null)

  useEffect(() => {
    const current = assessment?.last_edited_at ?? null
    if (current && current !== lastEditedRef.current) {
      lastEditedRef.current = current
      setShowSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setShowSaved(false), 1500)
    }
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [assessment?.last_edited_at])

  // --- Screen transition effects ---
  // Out-of-scope is now handled atomically in the reducer (ANSWER_QUESTION sets
  // screen = 'out-of-scope' before returning). This effect only handles the
  // questionnaire-complete → review transition.
  useEffect(() => {
    if (!assessment) return
    const currentQ = QUESTION_MAP[assessment.current_question_id]
    // All questions answered and not out-of-scope → go to review.
    if (assessment.current_question_id === 'results') {
      dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'review' })
      return
    }
    // Current question has become inapplicable → go to review.
    if (currentQ && !shouldShowQuestion(currentQ, answers)) {
      dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'review' })
    }
  }, [assessment, answers, dispatch])

  // --- Sync draft when the displayed question changes ---
  const currentQuestionId = assessment?.current_question_id
  useEffect(() => {
    if (!currentQuestionId || !assessment) return
    const existing = assessment.answers[currentQuestionId]
    if (existing) {
      // Edit mode: pre-populate from saved answer.
      setDraftValue(existing.value)
      setDraftConfidence(existing.confidence)
    } else {
      // Forward flow: start blank.
      setDraftValue(null)
      setDraftConfidence('confirmed')
    }
  // Re-run only when the question being displayed changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionId])

  if (!assessment) {
    return (
      <main className="page">
        <p>No assessment loaded. <button className="btn btn--link" onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}>Return home</button></p>
      </main>
    )
  }

  const currentQuestion = QUESTION_MAP[assessment.current_question_id]

  // current_question_id may be 'results' (all done) or a valid question ID.
  if (!currentQuestion || assessment.current_question_id === 'results') {
    // The useEffect above will handle the navigation; render nothing interim.
    return null
  }

  const progress = getOverallProgress(answers)
  const sectionProgress = getSectionProgress(answers)
  const valid = isAnswerValid(draftValue, currentQuestion)
  const isEditMode = answers[currentQuestion.id] !== undefined

  // --- Handlers ---

  function handleNext() {
    if (!valid) return

    // If editing a previously-answered question, check for downstream invalidation.
    if (isEditMode && draftValue !== answers[currentQuestion.id]?.value) {
      const invalidatedIds = getTransitivelyInvalidatedIds(currentQuestion.id, draftValue, answers)
      if (invalidatedIds.length > 0) {
        setPendingConfirm({
          invalidatedCount: invalidatedIds.length,
          onConfirm: commitAnswer,
        })
        return
      }
    }

    commitAnswer()
  }

  function commitAnswer() {
    setPendingConfirm(null)
    dispatch({
      type: 'ANSWER_QUESTION',
      payload: {
        question_id: currentQuestion.id,
        value: draftValue,
        confidence: draftConfidence,
      },
    })
  }

  function handleBack() {
    const prev = getPreviousAnsweredQuestion(currentQuestion.id, answers)
    if (!prev) return
    dispatch({ type: 'SET_CURRENT_QUESTION', payload: prev.id })
  }

  const hasPrevious = getPreviousAnsweredQuestion(currentQuestion.id, answers) !== null

  return (
    <main className="page page--questionnaire">
      {/* Banner (rules version mismatch, storage warning) */}
      {state.bannerMessage && (
        <div className="banner banner--warning" role="alert">
          <span>{state.bannerMessage}</span>
          <button
            className="banner__dismiss"
            onClick={() => dispatch({ type: 'SET_BANNER', payload: null })}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Progress */}
      <ProgressBar
        percent={progress}
        currentSection={currentQuestion.section}
        sectionProgress={sectionProgress}
      />

      {/* Saved indicator */}
      {showSaved && (
        <p className="saving-indicator" aria-live="polite">
          Saved
        </p>
      )}

      {/* Invalidation confirmation */}
      {pendingConfirm && (
        <div className="confirmation-banner" role="alertdialog" aria-modal="false">
          <p>
            Changing this answer will require you to re-answer{' '}
            <strong>{pendingConfirm.invalidatedCount}</strong>{' '}
            {pendingConfirm.invalidatedCount === 1 ? 'later question' : 'later questions'}.
          </p>
          <div className="confirmation-banner__actions">
            <button
              className="btn btn--primary btn--small"
              onClick={pendingConfirm.onConfirm}
            >
              Yes, change it
            </button>
            <button
              className="btn btn--secondary btn--small"
              onClick={() => setPendingConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Question */}
      <QuestionCard
        question={currentQuestion}
        value={draftValue}
        confidence={draftConfidence}
        onValueChange={setDraftValue}
        onConfidenceChange={setDraftConfidence}
      />

      {/* Navigation */}
      <div className="questionnaire-nav">
        <div className="questionnaire-nav__left">
          <button
            className="btn btn--secondary"
            onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}
          >
            Save &amp; exit
          </button>
          {hasPrevious && (
            <button className="btn btn--secondary" onClick={handleBack}>
              ← Back
            </button>
          )}
        </div>
        <button
          className="btn btn--primary"
          onClick={handleNext}
          disabled={!valid}
        >
          {currentQuestion.required ? 'Next' : 'Next →'}
        </button>
      </div>
    </main>
  )
}
