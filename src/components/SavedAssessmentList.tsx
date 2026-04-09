/**
 * SavedAssessmentList.tsx — Home screen list of saved assessments (§5.2).
 *
 * Purely presentational. Receives the list and callbacks from HomePage.
 */

import type { AssessmentIndexEntry } from '../state/AppState'

interface Props {
  assessments: AssessmentIndexEntry[]
  onResume: (id: string) => void
  onDelete: (id: string) => void
}

const STATUS_LABELS: Record<AssessmentIndexEntry['completion_status'], string> = {
  'in-progress': 'In progress',
  complete: 'Complete',
  'out-of-scope': 'Out of scope',
}

export default function SavedAssessmentList({ assessments, onResume, onDelete }: Props) {
  if (assessments.length === 0) return null

  return (
    <ul className="assessment-list">
      {assessments.map((entry) => (
        <li key={entry.assessment_id} className="assessment-list__item">
          <div className="assessment-list__info">
            <span className="assessment-list__address">{entry.address_display}</span>
            <span
              className={`assessment-list__status status-chip status-chip--${entry.completion_status}`}
            >
              {STATUS_LABELS[entry.completion_status]}
            </span>
            <span className="assessment-list__date">
              Last edited:{' '}
              {new Date(entry.last_edited_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
            </span>
          </div>
          <div className="assessment-list__actions">
            <button
              className="btn btn--primary btn--small"
              onClick={() => onResume(entry.assessment_id)}
            >
              {entry.completion_status === 'complete' ? 'View report' : 'Resume'}
            </button>
            <button
              className="btn btn--danger btn--small"
              onClick={() => onDelete(entry.assessment_id)}
              aria-label={`Delete assessment for ${entry.address_display}`}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
