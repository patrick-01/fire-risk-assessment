/**
 * ReportPage.tsx — Compliance report output screen.
 *
 * Calls generateReport() and renders its structured output. Makes no
 * compliance decisions of its own — all logic is in the engine.
 *
 * Sections rendered:
 *   - Rules version mismatch banner
 *   - Property header
 *   - Risk level (primary output — shown prominently before remedies)
 *   - Classification summary
 *   - Completeness indicator
 *   - Statutory obligations
 *   - Generally expected recommendations
 *   - Advisory and verification items
 *   - Facts requiring verification
 *   - Interpretive assumptions
 *   - Disclaimer
 *
 * TODO: Add PDF download button (§12)
 * TODO: Add JSON export button (§12)
 * TODO: Add shareable link button (§12)
 */

import { useMemo, useState } from 'react'
import { useAppContext } from '../state/AppContext'
import { computeRemedies } from '../engine/remedyEngine'
import { generateReport } from '../engine/reportGenerator'
import {
  downloadAssessmentJson,
  encodeAssessmentForUrl,
  isShareLinkSupported,
} from '../persistence/localStorageAdapter'
import type { ActiveRemedy } from '../engine/remedyEngine'
import type { UnresolvedFact, RiskDimensionSummary } from '../engine/reportGenerator'

type ShareStatus = 'idle' | 'copying' | 'copied' | 'too-large' | 'error' | 'unsupported'

export default function ReportPage() {
  const { state, dispatch } = useAppContext()
  const [shareStatus, setShareStatus] = useState<ShareStatus>('idle')

  const report = useMemo(() => {
    if (!state.activeAssessment) return null
    const remedies = computeRemedies(
      state.activeAssessment.answers,
      state.activeAssessment.classification
    )
    return generateReport(
      state.activeAssessment,
      remedies,
      state.activeAssessment.rules_version
    )
  }, [state.activeAssessment])

  if (!report) {
    return (
      <main className="page page--report">
        <p>
          No assessment loaded.{' '}
          <button
            className="btn btn--link"
            onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}
          >
            Return home
          </button>
        </p>
      </main>
    )
  }

  const lowCompleteness = report.completeness_score < 70

  return (
    <main className="page page--report">
      {/* Rules version mismatch banner */}
      {report.rules_version_banner && (
        <div className="banner banner--info" role="alert">
          {report.rules_version_banner}
        </div>
      )}

      {/* Property header */}
      <header className="report-header">
        <h1>Fire Safety Assessment Report</h1>
        <p className="report-meta">
          {report.address_display}
          {report.flat_ref ? ` — ${report.flat_ref}` : ''}
        </p>
        <p className="report-meta report-meta--small">
          Generated:{' '}
          {new Date(report.generated_at).toLocaleDateString('en-GB', { dateStyle: 'long' })}
          {' · '}Rules: {report.rules_version}
          {' · '}App: {report.app_version}
        </p>
        <p className="report-meta report-meta--small report-disclaimer-inline">
          This report is guidance only. It does not constitute a formal fire risk assessment
          or a legally binding compliance certificate. See disclaimer below.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* RISK LEVEL — primary output, shown before everything else           */}
      {/* ------------------------------------------------------------------ */}
      <section className="report-section report-section--risk">
        <h2>Overall Risk Level</h2>
        <div className={`risk-level-badge risk-level-badge--${report.risk_level}`}>
          <span className="risk-level-badge__label">
            {report.risk_level === 'unresolved' ? 'Risk level unresolved' : report.risk_level.toUpperCase()}
          </span>
          {report.risk_level !== 'unresolved' && (
            <span className="risk-level-badge__score">
              Score: {report.risk_score}
            </span>
          )}
        </div>
        <p className="risk-summary-text">{report.risk_summary}</p>

        {/* Risk stacking warning */}
        {report.risk_stacking_warning && (
          <div className="banner banner--amber" role="alert">
            {report.risk_stacking_warning}
          </div>
        )}

        {/* Dimension summary */}
        {report.risk_level !== 'unresolved' && (
          <RiskDimensionTable dimensions={report.risk_dimension_summary} />
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Classification                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="report-section">
        <h2>Property Classification</h2>
        <p>{report.classification_summary}</p>
        <p className="report-meta report-meta--small">{report.classification_basis}</p>
        {report.classification.unresolved_reasons.length > 0 && (
          <ul className="unresolved-reasons">
            {report.classification.unresolved_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Completeness indicator                                               */}
      {/* ------------------------------------------------------------------ */}
      {lowCompleteness && (
        <div className="banner banner--amber" role="alert">
          This report is based on incomplete information.{' '}
          {report.total_applicable_facts - report.confirmed_facts} items require verification
          before works are specified.
        </div>
      )}
      <section className="report-section report-section--completeness">
        <p className="completeness-score">
          Report completeness:{' '}
          <strong
            className={
              report.completeness_score >= 70
                ? 'completeness-score--good'
                : 'completeness-score--warn'
            }
          >
            {report.completeness_score}%
          </strong>{' '}
          ({report.confirmed_facts} of {report.total_applicable_facts} facts confirmed)
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Statutory obligations                                                */}
      {/* ------------------------------------------------------------------ */}
      {report.mandatory_remedies.length > 0 && (
        <section className="report-section report-section--statutory">
          <h2>Statutory Obligations — Required by Law</h2>
          <p className="tier-description">
            The following items are direct legal requirements regardless of risk level or
            property configuration.
          </p>
          <RemedyList remedies={report.mandatory_remedies} />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Generally expected recommendations                                   */}
      {/* ------------------------------------------------------------------ */}
      {report.recommended_remedies.length > 0 && (
        <section className="report-section">
          <h2>Recommendations — Generally Expected</h2>
          <p className="tier-description">
            The following items are expected under LACORS guidance for this property type.
            The strength of the recommendation reflects the overall risk level.
            These are expressed as "should" or "strongly recommended" — not as definitive
            legal requirements.
          </p>
          <RemedyList remedies={report.recommended_remedies} />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Advisory items                                                        */}
      {/* ------------------------------------------------------------------ */}
      {report.advisory_items.length > 0 && (
        <section className="report-section">
          <h2>Advisory Items — Verify or Investigate Further</h2>
          <p className="tier-description">
            These items require physical verification, professional input, or council
            confirmation before any remedial works can be specified.
          </p>
          <RemedyList remedies={report.advisory_items} />
        </section>
      )}

      {/* No output at all */}
      {report.mandatory_remedies.length === 0 &&
        report.recommended_remedies.length === 0 &&
        report.advisory_items.length === 0 && (
          <section className="report-section">
            <p className="report-no-remedies">
              No recommendations were triggered by the answers given. This may indicate that the
              questionnaire is incomplete, that the property classification is unresolved, or
              that the property is out of scope. Check the completeness score and classification
              above.
            </p>
          </section>
        )}

      {/* ------------------------------------------------------------------ */}
      {/* Facts requiring verification                                         */}
      {/* ------------------------------------------------------------------ */}
      {report.unresolved_facts.length > 0 && (
        <section className="report-section">
          <h2>Facts Requiring Verification</h2>
          <p className="tier-description">
            The following questions were answered as "not sure" or "unknown". Physical inspection
            or documentary evidence is needed to resolve them. This assessment has applied
            conservative assumptions where relevant.
          </p>
          <UnresolvedFactsTable facts={report.unresolved_facts} />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Interpretive assumptions                                             */}
      {/* ------------------------------------------------------------------ */}
      {report.assumptions.length > 0 && (
        <section className="report-section">
          <h2>Assumptions and Interpretations</h2>
          <ul className="assumptions-list">
            {report.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Disclaimer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="report-section report-section--disclaimer">
        <h2>{report.disclaimer.title}</h2>
        <p>{report.disclaimer.body}</p>
      </section>

      {/* Actions */}
      <div className="report-actions">
        <button
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'review' })}
        >
          ← Edit answers
        </button>
        <button
          className="btn btn--secondary"
          onClick={() => downloadAssessmentJson(state.activeAssessment!)}
          title="Download this assessment as a JSON file for archiving or sharing"
        >
          Export JSON
        </button>
        <ShareButton
          onShare={async () => {
            if (!state.activeAssessment) return
            if (!isShareLinkSupported()) {
              setShareStatus('unsupported')
              return
            }
            setShareStatus('copying')
            try {
              const encoded = await encodeAssessmentForUrl(state.activeAssessment)
              const url =
                window.location.origin +
                window.location.pathname +
                '#share=' +
                encoded
              await navigator.clipboard.writeText(url)
              setShareStatus('copied')
              setTimeout(() => setShareStatus('idle'), 3_000)
            } catch (err) {
              if (err instanceof Error && err.message.startsWith('This assessment is too large')) {
                setShareStatus('too-large')
              } else {
                setShareStatus('error')
              }
            }
          }}
          status={shareStatus}
        />
        <button
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}
        >
          Home
        </button>
      </div>
      {shareStatus === 'too-large' && (
        <p className="share-error" role="alert">
          This assessment is too large to share via URL. Use <strong>Export JSON</strong> to
          download the file and share it directly.
        </p>
      )}
      {shareStatus === 'error' && (
        <p className="share-error" role="alert">
          Could not copy to clipboard. Try again or use Export JSON.
        </p>
      )}
      {shareStatus === 'unsupported' && (
        <p className="share-error" role="alert">
          Share links are not supported in this browser. Use <strong>Export JSON</strong> to
          download and share the assessment file instead.
        </p>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sub-components (presentational only)
// ---------------------------------------------------------------------------

function ShareButton({
  onShare,
  status,
}: {
  onShare: () => void
  status: ShareStatus
}) {
  const labels: Record<ShareStatus, string> = {
    idle: 'Copy share link',
    copying: 'Copying…',
    copied: '✓ Link copied!',
    'too-large': 'Too large for URL',
    error: 'Copy failed',
    unsupported: 'Browser not supported',
  }
  return (
    <button
      className={`btn btn--secondary${status === 'copied' ? ' btn--success' : ''}`}
      onClick={onShare}
      disabled={status === 'copying'}
      title="Copy a shareable link to this assessment to your clipboard"
    >
      {labels[status]}
    </button>
  )
}

function RiskDimensionTable({ dimensions }: { dimensions: RiskDimensionSummary }) {
  const rows: Array<[string, string]> = [
    ['Escape routes', dimensions.escape],
    ['Construction', dimensions.construction],
    ['Fire detection', dimensions.detection],
    ['Management', dimensions.management],
  ]

  return (
    <table className="risk-dimension-table">
      <thead>
        <tr>
          <th>Dimension</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, status]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>
              <span className={`dimension-status dimension-status--${status}`}>
                {status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RemedyList({ remedies }: { remedies: ActiveRemedy[] }) {
  return (
    <ul className="remedy-list">
      {remedies.map((remedy) => (
        <li key={remedy.id} className={`remedy-item remedy-item--${remedy.confidence}`}>
          <div className="remedy-item__header">
            <span className="remedy-item__id">{remedy.id}</span>
            <span className={`confidence-badge confidence-badge--${remedy.confidence}`}>
              {remedy.confidence}
            </span>
            <span className="remedy-item__basis">{remedy.basis.join(', ')}</span>
          </div>
          <h3 className="remedy-item__title">{remedy.title}</h3>
          {remedy.risk_basis && (
            <details className="remedy-item__risk-basis">
              <summary>Why this matters</summary>
              <p>{remedy.risk_basis}</p>
            </details>
          )}
          <p className="remedy-item__text">{remedy.text}</p>
          {remedy.regulatory_refs.length > 0 && (
            <p className="remedy-item__refs">
              Ref: {remedy.regulatory_refs.join(' · ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

function UnresolvedFactsTable({ facts }: { facts: UnresolvedFact[] }) {
  return (
    <table className="unresolved-table">
      <thead>
        <tr>
          <th>Question</th>
          <th>Answer given</th>
          <th>Behaviour</th>
          <th>Verification needed</th>
        </tr>
      </thead>
      <tbody>
        {facts.map((fact) => (
          <tr key={fact.question_id}>
            <td className="unresolved-table__question">{fact.question_text}</td>
            <td>
              <span className="confidence-badge confidence-badge--unresolved">
                {fact.answer_given.replace('_', ' ')}
              </span>
            </td>
            <td>
              <code className="behaviour-code">{fact.uncertainty_behaviour}</code>
            </td>
            <td className="unresolved-table__action">{fact.verification_needed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
