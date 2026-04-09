/**
 * CookieConsentGate.tsx — Full-screen consent overlay.
 *
 * Rendered as the outermost wrapper in main.tsx, outside AppProvider.
 * Renders nothing but the overlay until the user clicks OK, which means
 * AppProvider never mounts and no localStorage reads or writes occur
 * before consent is given.
 *
 * After clicking OK:
 *   - Writes cookie_consent = 'true' to localStorage (try/catch safe).
 *   - Falls back to an in-memory flag if localStorage is unavailable.
 *   - Renders children, allowing the app to initialise normally.
 *
 * On subsequent visits the flag is already present so the overlay is
 * skipped and children render immediately (no flash).
 */

import { useState, type ReactNode } from 'react'

const CONSENT_KEY = 'cookie_consent'

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true'
  } catch {
    return false
  }
}

function writeConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, 'true')
  } catch {
    // localStorage unavailable — consent is held in component state for
    // the duration of this session only. The overlay will reappear on next
    // visit, which is acceptable.
  }
}

export default function CookieConsentGate({ children }: { children: ReactNode }) {
  const [consented, setConsented] = useState<boolean>(readConsent)

  if (consented) {
    return <>{children}</>
  }

  function handleOk() {
    writeConsent()
    setConsented(true)
  }

  return (
    <div className="consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="consent-modal">
        <h1 className="consent-modal__title" id="consent-title">Cookie use</h1>

        <div className="consent-modal__body">
          <p>
            This site uses local browser storage (sometimes referred to as cookies)
            to allow it to function.
          </p>
          <p>It is used only to:</p>
          <ul>
            <li>save your progress while completing an assessment</li>
            <li>store assessment data on your device so you can return to it later</li>
            <li>enable export and sharing features you choose to use</li>
          </ul>
          <p>No personal data is collected or transmitted to any server.</p>
          <p>No tracking, analytics, or advertising cookies are used.</p>
          <p>
            All data remains on your device unless you explicitly choose to export
            or share it.
          </p>
          <p>
            By clicking OK, you consent to the use of this storage for these
            purposes.
          </p>
        </div>

        <button className="btn btn--primary consent-modal__ok" onClick={handleOk}>
          OK
        </button>
      </div>
    </div>
  )
}
