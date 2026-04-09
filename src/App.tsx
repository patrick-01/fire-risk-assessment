/**
 * App.tsx — Top-level screen switcher.
 *
 * Simple state-driven switch. All screens live in src/pages/. The questionnaire
 * flow starts at P1 (address question), so 'property-setup' and 'questionnaire'
 * both render QuestionnairePage — the distinction exists in state for routing
 * clarity but is not visible to the user.
 *
 * GlobalBanner is rendered above the active screen so it is always visible,
 * regardless of which screen is showing.
 */

import { useAppContext, GlobalBanner } from './state/AppContext'
import HomePage from './pages/HomePage'
import QuestionnairePage from './pages/QuestionnairePage'
import ReviewPage from './pages/ReviewPage'
import ReportPage from './pages/ReportPage'

export default function App() {
  const { state, dispatch } = useAppContext()

  function renderScreen() {
    switch (state.screen) {
      case 'home':
        return <HomePage />

      case 'property-setup':
      case 'questionnaire':
        return <QuestionnairePage />

      case 'review':
        return <ReviewPage />

      case 'report':
        return <ReportPage />

      case 'out-of-scope':
        return (
          <main className="page page--out-of-scope">
            <h1>Property outside scope</h1>
            {state.outOfScopeReason ? (
              <p>{state.outOfScopeReason}</p>
            ) : (
              <>
                <p>
                  Based on your answers, this property does not fall within the scope of
                  Version 1 of this tool, which supports only:
                </p>
                <ul>
                  <li>Buildings converted from a single dwelling into exactly two self-contained flats</li>
                  <li>Conversions pre-dating 1991 or evidenced as non-compliant with Building Regulations 1991</li>
                  <li>Both flats privately rented</li>
                  <li>Located in the London Borough of Richmond upon Thames</li>
                </ul>
              </>
            )}
            <p>
              For properties outside this scope, contact Richmond upon Thames Council Housing
              Enforcement for guidance, or engage a qualified fire risk assessor.
            </p>
            <div className="out-of-scope-actions">
              <button
                className="btn btn--secondary"
                onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}
              >
                Return home
              </button>
            </div>
          </main>
        )

      default:
        return <HomePage />
    }
  }

  return (
    <>
      <GlobalBanner />
      {renderScreen()}
    </>
  )
}
