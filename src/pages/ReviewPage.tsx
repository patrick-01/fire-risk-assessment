/**
 * ReviewPage.tsx — "Review Answers" screen (§7.2).
 *
 * Shows all answered questions grouped by section. Each answer can be clicked
 * to edit, which sets current_question_id and navigates back to the
 * questionnaire (triggering edit mode via the pre-populated draft logic).
 *
 * Sections with no applicable questions are shown as "Not applicable".
 * Sections with applicable but unanswered questions are shown with a warning.
 */

import { useAppContext } from '../state/AppContext'
import { QUESTION_MAP, SECTION_ORDER } from '../data/schema/questions'
import { getSectionProgress, shouldShowQuestion, getAnsweredQuestions } from '../engine/navigator'
import { downloadAssessmentJson } from '../persistence/localStorageAdapter'
import type { SectionId } from '../state/AppState'

const SECTION_LABELS: Record<SectionId, string> = {
  setup: 'Property Setup',
  A: 'Section A — Building Origin and Classification',
  B: 'Section B — Building Configuration and Travel Distance',
  C: 'Section C — Escape Routes',
  D: 'Section D — Construction, Staircase, and Ignition Risk',
  E: 'Section E — Fire Detection and Alarms',
  F: 'Section F — Doors and Egress',
  G: 'Section G — General Legal Obligations',
  H: 'Section H — Management and Maintenance',
  results: 'Results',
}

export default function ReviewPage() {
  const { state, dispatch } = useAppContext()
  const assessment = state.activeAssessment
  const answers = assessment?.answers ?? {}

  if (!assessment) {
    return (
      <main className="page">
        <p>No assessment loaded. <button className="btn btn--link" onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}>Return home</button></p>
      </main>
    )
  }

  const sectionProgress = getSectionProgress(answers)

  function handleEdit(questionId: string) {
    dispatch({ type: 'SET_CURRENT_QUESTION', payload: questionId })
    dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'questionnaire' })
  }

  function handleGenerateReport() {
    dispatch({ type: 'MARK_REPORT_GENERATED' })
    dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'report' })
  }

  // Build the address display value for P1 (stored as JSON string).
  function formatAnswerDisplay(questionId: string, rawValue: unknown): string {
    const question = QUESTION_MAP[questionId]
    if (!question) return String(rawValue)

    if (question.type === 'address' && typeof rawValue === 'string') {
      try {
        const addr = JSON.parse(rawValue) as Record<string, string>
        return [addr.address_line_1, addr.address_line_2, addr.town, addr.postcode]
          .filter(Boolean)
          .join(', ')
      } catch {
        return rawValue
      }
    }

    // For multi-choice, show the labels for each selected value.
    if (question.type === 'multi-choice' && typeof rawValue === 'string') {
      try {
        const selected = JSON.parse(rawValue) as string[]
        if (Array.isArray(selected) && question.options) {
          const labels = selected.map((v) => {
            const opt = question.options!.find((o) => o.value === v)
            return opt ? opt.label : v
          })
          return labels.join('; ')
        }
      } catch {
        // fall through
      }
    }

    // For single-choice, show the label text instead of the raw value.
    if (question.options) {
      const option = question.options.find((o) => o.value === String(rawValue))
      if (option) return option.label
    }

    return String(rawValue ?? '')
  }

  return (
    <main className="page page--review">
      <h1>Review your answers</h1>
      <p className="review-intro">
        Check your answers before generating the compliance report. Click{' '}
        <strong>Edit</strong> next to any answer to change it. Changing an earlier
        answer may require re-answering later questions.
      </p>

      {SECTION_ORDER.filter((s) => s !== 'results').map((section) => {
        const sp = sectionProgress.find((p) => p.section === section)
        const sectionQuestions = Object.keys(QUESTION_MAP)
          .map((id) => QUESTION_MAP[id])
          .filter((q) => q.section === section)
          .sort((a, b) => a.section_position - b.section_position)

        if (sp?.status === 'not-applicable') {
          return (
            <section key={section} className="review-section review-section--skipped">
              <h2 className="review-section__title">{SECTION_LABELS[section]}</h2>
              <p className="review-section__na">Not applicable based on earlier answers.</p>
            </section>
          )
        }

        // Only show questions that are applicable (show_when passes).
        const applicableQuestions = sectionQuestions.filter((q) =>
          shouldShowQuestion(q, answers)
        )
        if (applicableQuestions.length === 0) return null

        return (
          <section key={section} className="review-section">
            <h2 className="review-section__title">{SECTION_LABELS[section]}</h2>
            <table className="review-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Answer</th>
                  <th>Confidence</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {applicableQuestions.map((question) => {
                  const answer = answers[question.id]
                  if (!answer) {
                    // Applicable but unanswered — show a warning row.
                    return (
                      <tr key={question.id} className="review-table__row--unanswered">
                        <td>{question.text}</td>
                        <td colSpan={2}>
                          <span className="review-unanswered">Not answered</span>
                        </td>
                        <td>
                          <button
                            className="btn btn--link"
                            onClick={() => handleEdit(question.id)}
                          >
                            Answer
                          </button>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={question.id}>
                      <td className="review-table__question">{question.text}</td>
                      <td className="review-table__answer">
                        {formatAnswerDisplay(question.id, answer.value)}
                      </td>
                      <td>
                        <span className={`confidence-badge confidence-badge--${answer.confidence}`}>
                          {answer.confidence.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn--link"
                          onClick={() => handleEdit(question.id)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}

      <div className="review-actions">
        <button
          className="btn btn--secondary"
          onClick={() => {
            // Set current_question_id to the last answered question before
            // navigating — prevents the questionnaire from bouncing straight
            // back to review when current_question_id = 'results'.
            const lastAnswered = getAnsweredQuestions(answers)
            const lastQ = lastAnswered[lastAnswered.length - 1]
            if (lastQ) {
              dispatch({ type: 'SET_CURRENT_QUESTION', payload: lastQ.id })
            }
            dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'questionnaire' })
          }}
        >
          ← Back to questions
        </button>
        <button
          className="btn btn--secondary"
          onClick={() => downloadAssessmentJson(assessment)}
          title="Download your answers as a JSON file"
        >
          Export JSON
        </button>
        <button className="btn btn--primary" onClick={handleGenerateReport}>
          Generate compliance report
        </button>
      </div>
    </main>
  )
}
