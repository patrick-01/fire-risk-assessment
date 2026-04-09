/**
 * AppContext.tsx — React Context provider wrapping the entire app.
 *
 * Responsibilities:
 *   - Holds global app state via useReducer
 *   - Wires the auto-save side effect (§5.4): persists to localStorage
 *     after every ANSWER_QUESTION dispatch
 *   - Loads the saved assessment index on mount
 *   - Detects share link URL hash (#share=...) on mount and dispatches
 *     IMPORT_ASSESSMENT if a valid encoded assessment is found
 *   - Exposes dispatch and derived helpers to all child components
 *   - Renders a global dismissible banner (state.bannerMessage)
 *
 * Components should import useAppContext() rather than accessing the context
 * object directly.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { appReducer, initialState, type AppAction } from './reducer'
import type { AppState } from './AppState'
import {
  loadIndex,
  saveAssessment,
  deleteAssessment,
  isStorageNearlyFull,
  decodeAssessmentFromUrl,
} from '../persistence/localStorageAdapter'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  // Load saved assessment index on first mount.
  // Also detect share link URL hash (#share=...) and load the encoded
  // assessment if found.
  useEffect(() => {
    const index = loadIndex()
    dispatch({ type: 'LOAD_SAVED_ASSESSMENTS', payload: index })

    const hash = window.location.hash
    if (hash.startsWith('#share=')) {
      const encoded = hash.slice('#share='.length)
      decodeAssessmentFromUrl(encoded)
        .then((assessment) => {
          if (assessment) {
            dispatch({
              type: 'IMPORT_ASSESSMENT',
              payload: { assessment, source: 'share_link' },
            })
          } else {
            dispatch({
              type: 'SET_BANNER',
              payload:
                'The shared link could not be decoded. It may be corrupted, truncated, ' +
                'or from an incompatible version of the tool.',
            })
          }
        })
        .catch(() => {
          dispatch({
            type: 'SET_BANNER',
            payload: 'The shared link could not be decoded.',
          })
        })

      // Clear the hash so refreshing the page does not reload the shared
      // assessment a second time, and so the URL looks clean.
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  // Auto-save side effect (§5.4): fires whenever isSaving is set to true.
  useEffect(() => {
    if (!state.isSaving || !state.activeAssessment) return

    saveAssessment(state.activeAssessment)
    dispatch({ type: 'SET_SAVING', payload: false })

    // Reload index so the home screen list stays in sync.
    const index = loadIndex()
    dispatch({ type: 'LOAD_SAVED_ASSESSMENTS', payload: index })

    // Warn user if storage is nearly full (§5.5).
    if (isStorageNearlyFull()) {
      dispatch({
        type: 'SET_BANNER',
        payload:
          'Storage is nearly full. Consider exporting your assessments as JSON to free up space.',
      })
    }
  }, [state.isSaving, state.activeAssessment])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

// ---------------------------------------------------------------------------
// Global banner component
// ---------------------------------------------------------------------------

/**
 * Renders state.bannerMessage as a dismissible info banner.
 * Mount this once near the top of the layout (in main.tsx or App.tsx).
 */
export function GlobalBanner() {
  const { state, dispatch } = useAppContext()
  if (!state.bannerMessage) return null

  return (
    <div className="global-banner" role="alert">
      <span>{state.bannerMessage}</span>
      <button
        className="global-banner__dismiss"
        aria-label="Dismiss"
        onClick={() => dispatch({ type: 'SET_BANNER', payload: null })}
      >
        ✕
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useAppContext must be used inside <AppProvider>')
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Action creator helpers (keeps dispatch calls readable in UI)
// ---------------------------------------------------------------------------

export function useDeleteAssessment() {
  const { dispatch } = useAppContext()
  return useCallback(
    (id: string) => {
      deleteAssessment(id) // Remove from localStorage
      dispatch({ type: 'DELETE_ASSESSMENT', payload: { assessment_id: id } })
    },
    [dispatch]
  )
}
