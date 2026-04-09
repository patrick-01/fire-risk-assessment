/**
 * HomePage.tsx — Launch screen and saved assessments list.
 *
 * Shows:
 *   - If no saved assessments: a start button.
 *   - If saved assessments exist: the list first, then a start-new option.
 *   - Import from JSON file button (Step 5B/C).
 *
 * This page dispatches actions; it does not contain any compliance logic.
 */

import { useRef, useState } from 'react'
import { useAppContext, useDeleteAssessment } from '../state/AppContext'
import {
  loadAssessment,
  loadIndex,
  importAssessmentJson,
} from '../persistence/localStorageAdapter'
import type { Assessment } from '../state/AppState'
import SavedAssessmentList from '../components/SavedAssessmentList'

const MAX_ASSESSMENTS = 10

export default function HomePage() {
  const { state, dispatch } = useAppContext()
  const deleteAssessment = useDeleteAssessment()

  // --- Import from file state ---
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  function handleStartNew() {
    dispatch({
      type: 'START_NEW_ASSESSMENT',
      payload: {
        property: {
          address_line_1: '',
          address_line_2: null,
          town: 'Richmond',
          postcode: '',
          postcode_normalised: '',
          flat_ref: null,
        },
      },
    })
  }

  function handleResume(assessmentId: string) {
    const assessment: Assessment | null = loadAssessment(assessmentId)
    if (!assessment) {
      console.error(`[HomePage] Assessment ${assessmentId} not found in storage.`)
      return
    }
    dispatch({ type: 'RESUME_ASSESSMENT', payload: assessment })
    dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'questionnaire' })
  }

  function handleDelete(assessmentId: string) {
    if (!window.confirm('Delete this assessment? This cannot be undone.')) return
    deleteAssessment(assessmentId)
  }

  // --- Import from file ---

  function handleImportClick() {
    setImportError(null)
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset the input so the same file can be re-selected after an error.
    e.target.value = ''

    // Check the assessment limit before attempting to import.
    const currentCount = loadIndex().length
    if (currentCount >= MAX_ASSESSMENTS) {
      setImportError(
        `You have reached the maximum of ${MAX_ASSESSMENTS} saved assessments. ` +
        'Delete one before importing.'
      )
      return
    }

    setIsImporting(true)
    const reader = new FileReader()

    reader.onload = (event) => {
      setIsImporting(false)
      const json = event.target?.result
      if (typeof json !== 'string') {
        setImportError('Could not read the file.')
        return
      }
      try {
        const assessment = importAssessmentJson(json)
        dispatch({
          type: 'IMPORT_ASSESSMENT',
          payload: { assessment, source: 'file_import' },
        })
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Import failed.')
      }
    }

    reader.onerror = () => {
      setIsImporting(false)
      setImportError('Could not read the file. Try again.')
    }

    reader.readAsText(file)
  }

  return (
    <main className="page page--home">
      <header className="home-header">
        <h1>Richmond Fire Compliance Tool</h1>
        <p className="home-subtitle">
          Self-assessment for rented residential properties in the London Borough of Richmond upon
          Thames, based on the LACORS Fire Safety Guidance for Existing Housing.
        </p>
        <p className="home-disclaimer">
          This tool does not produce a formal fire risk assessment or a legally binding compliance
          certificate. It does not replace a qualified fire risk assessor.
        </p>
      </header>

      {state.savedAssessments.length > 0 && (
        <section className="home-section">
          <h2>My Saved Assessments</h2>
          <SavedAssessmentList
            assessments={state.savedAssessments}
            onResume={handleResume}
            onDelete={handleDelete}
          />
        </section>
      )}

      <section className="home-section">
        <h2>Start a new assessment</h2>
        <p>
          You can save your answers at any point and return later. Assessments are stored in your
          browser only — they are not sent anywhere.
        </p>
        {state.savedAssessments.length >= MAX_ASSESSMENTS && (
          <p className="warning-text">
            You have reached the maximum of {MAX_ASSESSMENTS} saved assessments. Please delete one
            before starting a new assessment.
          </p>
        )}
        <button
          className="btn btn--primary"
          onClick={handleStartNew}
          disabled={state.savedAssessments.length >= MAX_ASSESSMENTS}
        >
          Start new assessment
        </button>
      </section>

      {/* Import from JSON file (Step 5C) */}
      <section className="home-section">
        <h2>Import from file</h2>
        <p>
          Load a previously exported assessment JSON file. The imported assessment will be
          re-evaluated under the current rules version and saved to your browser.
        </p>
        {importError && (
          <p className="import-error" role="alert">
            {importError}
          </p>
        )}
        <button
          className="btn btn--secondary"
          onClick={handleImportClick}
          disabled={isImporting || state.savedAssessments.length >= MAX_ASSESSMENTS}
        >
          {isImporting ? 'Importing…' : 'Import assessment JSON…'}
        </button>
        {/* Hidden file input — triggered programmatically */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </section>
    </main>
  )
}
