/**
 * IncompatibleLegacyPage.tsx — Clean-break screen for pre-v2 saved assessments (§19, Step 7).
 *
 * Shown when the user tries to open a saved assessment whose schema_version
 * does not match the current SCHEMA_VERSION. The v2 clean break performs no
 * field migration, so the assessment cannot be opened or repaired — this
 * screen explains why and offers a fresh start.
 *
 * Thin shell: makes no compliance decisions, dispatches typed actions only.
 */

import { useAppContext } from '../state/AppContext'

export default function IncompatibleLegacyPage() {
  const { dispatch } = useAppContext()

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

  return (
    <main className="page page--incompatible-legacy">
      <h1>This assessment can't be opened</h1>
      <p>
        This saved assessment was created in an earlier version of the tool and uses a different
        data format. The current version cannot convert or open it.
      </p>
      <p>
        Your saved data has not been changed or deleted. You can return to the home screen to
        delete it, or start a new assessment using the current version of the tool.
      </p>
      <div className="incompatible-legacy-actions">
        <button className="btn btn--primary" onClick={handleStartNew}>
          Start new assessment
        </button>
        <button
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}
        >
          Return home
        </button>
      </div>
    </main>
  )
}
