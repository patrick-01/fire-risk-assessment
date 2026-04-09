/**
 * reducer.ts — All application state transitions live here.
 *
 * Uses React's useReducer pattern. Every action is typed. The UI dispatches
 * actions; it never mutates state directly or calls localStorage.
 *
 * The reducer is responsible for:
 *   - Answer invalidation (§5.3) when an earlier answer changes value
 *   - Auto-save trigger (§5.4) — sets isSaving so the context layer can
 *     call localStorageAdapter.saveAssessment after dispatch
 *   - Classification re-computation after each answer
 *   - Advancing current_question_id after each answer
 *   - Syncing assessment.property when P1/P2 are answered
 */

import type {
  AppState,
  AppScreen,
  Assessment,
  AnswerValue,
  AnswerConfidence,
  AssessmentIndexEntry,
} from './AppState'
import { SCHEMA_VERSION, APP_VERSION } from './AppState'
import { classify } from '../engine/classifier'
import {
  getTransitivelyInvalidatedIds,
  getNextQuestion,
  getOutOfScopeReason,
} from '../engine/navigator'
import { RULES_VERSION } from '../data/rules/remedy-rules'

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: 'LOAD_SAVED_ASSESSMENTS'; payload: AssessmentIndexEntry[] }
  | { type: 'START_NEW_ASSESSMENT'; payload: Pick<Assessment, 'property'> }
  | { type: 'RESUME_ASSESSMENT'; payload: Assessment }
  | { type: 'DELETE_ASSESSMENT'; payload: { assessment_id: string } }
  | {
      type: 'ANSWER_QUESTION'
      payload: {
        question_id: string
        value: AnswerValue
        confidence: AnswerConfidence
      }
    }
  | { type: 'SET_CURRENT_QUESTION'; payload: string }
  | { type: 'NAVIGATE_TO_SCREEN'; payload: AppScreen }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_BANNER'; payload: string | null }
  | { type: 'MARK_REPORT_GENERATED' }
  /**
   * IMPORT_ASSESSMENT — loads an imported or shared assessment.
   *
   * Differences from RESUME_ASSESSMENT:
   *   - Always sets isSaving: true so the auto-save effect persists the assessment.
   *   - Shows a banner confirming the import (plus rules mismatch warning if applicable).
   *   - source distinguishes file imports from decoded share links.
   */
  | {
      type: 'IMPORT_ASSESSMENT'
      payload: {
        assessment: Assessment
        source: 'file_import' | 'share_link'
      }
    }

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const initialState: AppState = {
  activeAssessment: null,
  savedAssessments: [],
  screen: 'home',
  isSaving: false,
  bannerMessage: null,
  outOfScopeReason: null,
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // -----------------------------------------------------------------------
    case 'LOAD_SAVED_ASSESSMENTS':
      return { ...state, savedAssessments: action.payload }

    // -----------------------------------------------------------------------
    case 'START_NEW_ASSESSMENT': {
      const now = new Date().toISOString()
      const assessment: Assessment = {
        schema_version: SCHEMA_VERSION,
        rules_version: RULES_VERSION,
        app_version: APP_VERSION,
        assessment_id: generateUUID(),
        created_at: now,
        last_edited_at: now,
        property: action.payload.property,
        current_section: 'setup',
        current_question_id: 'P1',
        answers: {},
        invalidated_answers: {},
        classification: {
          type: 'unresolved',
          benchmark: 'unknown',
          communal_entrance: 'unknown',
          separate_entrance_mode: false,
          upper_flat_independent_exit: 'unknown',
          inner_room_present: 'unknown',
          escape_windows: {
            bedroom_1: 'unknown',
            bedroom_2: 'unknown',
            living_room: 'unknown',
          },
          confidence: 'unresolved',
          unresolved_reasons: ['Assessment not yet started.'],
          risk_level: 'unresolved',
          risk_score: 0,
          risk_factors_present: [],
        },
        report_generated_at: null,
      }
      return {
        ...state,
        activeAssessment: assessment,
        screen: 'property-setup',
      }
    }

    // -----------------------------------------------------------------------
    case 'RESUME_ASSESSMENT': {
      const assessment = action.payload
      const mismatch = assessment.rules_version !== RULES_VERSION
      const outOfScopeReason = getOutOfScopeReason(assessment.answers)
      // Re-classify on load to ensure the enriched Classification fields
      // (escape_windows, risk_level, etc.) are populated even for assessments
      // saved under an older schema.
      const freshClassification = classify(assessment.answers)

      // Route to the appropriate screen based on completion state.
      let screen: AppScreen = 'questionnaire'
      if (outOfScopeReason) {
        screen = 'out-of-scope'
      } else if (assessment.report_generated_at) {
        screen = 'report'
      } else if (getNextQuestion(assessment.answers) === null) {
        screen = 'review'
      }

      return {
        ...state,
        activeAssessment: { ...assessment, classification: freshClassification },
        screen,
        outOfScopeReason: outOfScopeReason ?? null,
        bannerMessage: mismatch && !outOfScopeReason
          ? `This assessment was saved under rules version ${assessment.rules_version}. ` +
            `It has been re-evaluated under the current rules version ${RULES_VERSION}. ` +
            `Review the results below.`
          : null,
      }
    }

    // -----------------------------------------------------------------------
    case 'DELETE_ASSESSMENT': {
      return {
        ...state,
        savedAssessments: state.savedAssessments.filter(
          (e) => e.assessment_id !== action.payload.assessment_id
        ),
        activeAssessment:
          state.activeAssessment?.assessment_id === action.payload.assessment_id
            ? null
            : state.activeAssessment,
      }
    }

    // -----------------------------------------------------------------------
    case 'ANSWER_QUESTION': {
      if (!state.activeAssessment) return state

      const { question_id, value, confidence } = action.payload
      const now = new Date().toISOString()

      // Only invalidate downstream answers when the value actually changes.
      // If the user re-selects the same answer, nothing downstream is affected.
      const existingAnswer = state.activeAssessment.answers[question_id]
      const valueChanged = !existingAnswer || existingAnswer.value !== value

      const invalidatedIds = valueChanged
        ? getTransitivelyInvalidatedIds(question_id, value, state.activeAssessment.answers)
        : []

      const newAnswers = { ...state.activeAssessment.answers }
      const newInvalidated = { ...state.activeAssessment.invalidated_answers }

      // Move invalidated answers out of the active map.
      for (const id of invalidatedIds) {
        if (newAnswers[id]) {
          newInvalidated[id] = {
            previous_value: newAnswers[id].value,
            invalidated_at: now,
            reason: `Answer to ${question_id} changed.`,
          }
          delete newAnswers[id]
        }
      }

      // Record the new answer.
      newAnswers[question_id] = { value, confidence, answered_at: now }

      // Re-classify after each answer.
      const newClassification = classify(newAnswers)

      // Advance current_question_id to the next unanswered applicable question.
      const nextQuestion = getNextQuestion(newAnswers)
      const nextQuestionId = nextQuestion?.id ?? 'results'

      // Sync assessment.property when the address question (P1) is answered.
      let updatedProperty = { ...state.activeAssessment.property }
      if (question_id === 'P1' && typeof value === 'string') {
        try {
          const parsed = JSON.parse(value) as Record<string, string>
          updatedProperty = {
            address_line_1: parsed.address_line_1 ?? '',
            address_line_2: parsed.address_line_2 || null,
            town: parsed.town ?? 'Richmond',
            postcode: parsed.postcode ?? '',
            postcode_normalised: normalisePostcode(parsed.postcode ?? ''),
            flat_ref: state.activeAssessment.property.flat_ref,
          }
        } catch {
          // Malformed JSON from the address input — keep existing property.
        }
      }
      // Sync flat_ref when the optional reference question (P2) is answered.
      if (question_id === 'P2') {
        updatedProperty = {
          ...updatedProperty,
          flat_ref: value ? String(value) : null,
        }
      }

      // Detect out-of-scope atomically — before returning so there is no
      // frame where the questionnaire screen renders with an OOS answer.
      const outOfScopeReason = getOutOfScopeReason(newAnswers)

      const updatedAssessment: Assessment = {
        ...state.activeAssessment,
        property: updatedProperty,
        answers: newAnswers,
        invalidated_answers: newInvalidated,
        classification: newClassification,
        current_question_id: nextQuestionId,
        last_edited_at: now,
        rules_version: RULES_VERSION,
      }

      return {
        ...state,
        activeAssessment: updatedAssessment,
        screen: outOfScopeReason ? 'out-of-scope' : state.screen,
        outOfScopeReason: outOfScopeReason ?? state.outOfScopeReason,
        isSaving: true,
      }
    }

    // -----------------------------------------------------------------------
    case 'SET_CURRENT_QUESTION': {
      if (!state.activeAssessment) return state
      return {
        ...state,
        activeAssessment: {
          ...state.activeAssessment,
          current_question_id: action.payload,
        },
      }
    }

    // -----------------------------------------------------------------------
    case 'NAVIGATE_TO_SCREEN':
      return { ...state, screen: action.payload }

    // -----------------------------------------------------------------------
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload }

    // -----------------------------------------------------------------------
    case 'SET_BANNER':
      return { ...state, bannerMessage: action.payload }

    // -----------------------------------------------------------------------
    case 'MARK_REPORT_GENERATED': {
      if (!state.activeAssessment) return state
      const now = new Date().toISOString()
      return {
        ...state,
        activeAssessment: {
          ...state.activeAssessment,
          report_generated_at: now,
          last_edited_at: now,
        },
        isSaving: true,
      }
    }

    // -----------------------------------------------------------------------
    case 'IMPORT_ASSESSMENT': {
      const { assessment, source } = action.payload
      const outOfScopeReason = getOutOfScopeReason(assessment.answers)
      const freshClassification = classify(assessment.answers)

      let screen: AppScreen = 'questionnaire'
      if (outOfScopeReason) {
        screen = 'out-of-scope'
      } else if (assessment.report_generated_at) {
        screen = 'report'
      } else if (getNextQuestion(assessment.answers) === null) {
        screen = 'review'
      }

      const bannerParts: string[] = [
        source === 'share_link' ? 'Assessment loaded from shared link.' : 'Assessment imported from file.',
      ]
      if (assessment.rules_version !== RULES_VERSION) {
        bannerParts.push(
          `It was saved under rules version ${assessment.rules_version} and has been ` +
          `re-evaluated under the current rules version ${RULES_VERSION}.`
        )
      }
      if (source === 'share_link') {
        bannerParts.push('A copy has been saved to your browser.')
      }

      return {
        ...state,
        activeAssessment: { ...assessment, classification: freshClassification },
        screen,
        outOfScopeReason: outOfScopeReason ?? null,
        bannerMessage: bannerParts.join(' '),
        isSaving: true, // Trigger auto-save so the imported assessment is persisted.
      }
    }

    // -----------------------------------------------------------------------
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a UUID v4. Uses crypto.randomUUID where available. */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback (older browsers)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Normalises a raw postcode string: strips whitespace, uppercases, inserts
 * a single space before the last three characters.
 * e.g. "tw94ha" → "TW9 4HA", "TW9 4HA" → "TW9 4HA"
 */
export function normalisePostcode(raw: string): string {
  const stripped = raw.replace(/\s+/g, '').toUpperCase()
  if (stripped.length < 4) return stripped
  return stripped.slice(0, stripped.length - 3) + ' ' + stripped.slice(-3)
}
