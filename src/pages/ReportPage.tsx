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
import type { UnresolvedFact, RiskDimensionSummary, PropertyTypeSummary } from '../engine/reportGenerator'

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
      {/* Property type and applicable framework                               */}
      {/* ------------------------------------------------------------------ */}
      <PropertyFrameworkSummary summary={report.property_type_summary} />

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
      {/* Legal requirements                                                   */}
      {/* ------------------------------------------------------------------ */}
      {report.legal_requirement_remedies.length > 0 && (
        <section className="report-section report-section--statutory">
          <h2>Legal Requirements</h2>
          <p className="tier-description">
            The following items are direct statutory obligations. They apply to this property
            regardless of risk level or HMO classification. Non-compliance may result in
            enforcement action.
          </p>
          <RemedyList remedies={report.legal_requirement_remedies} />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* LACORS / risk-based recommendations                                  */}
      {/* ------------------------------------------------------------------ */}
      {report.lacors_recommendation_remedies.length > 0 && (
        <section className="report-section">
          <h2>LACORS / Risk-Based Recommendations</h2>
          <p className="tier-description">
            The following items are recommended based on LACORS fire safety guidance and
            the assessed risk level for this property type. They are not universal statutory
            minimums but reflect what the council and fire safety assessors expect for this
            property configuration. The strength of each recommendation reflects the overall
            risk level.
          </p>
          <RemedyList remedies={report.lacors_recommendation_remedies} />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Advisory / good practice                                             */}
      {/* ------------------------------------------------------------------ */}
      {report.advisory_items.length > 0 && (
        <section className="report-section">
          <h2>Advisory / Good Practice</h2>
          <p className="tier-description">
            These items are good practice actions, management obligations, or points that
            require physical verification, professional input, or council confirmation.
          </p>
          <RemedyList remedies={report.advisory_items} />
        </section>
      )}

      {/* No output at all */}
      {report.legal_requirement_remedies.length === 0 &&
        report.lacors_recommendation_remedies.length === 0 &&
        report.advisory_items.length === 0 && (
          <section className="report-section">
            <p className="report-no-remedies">
              No recommendations were triggered by the answers given. This may indicate that the
              questionnaire is incomplete or the property classification is unresolved. Check
              the completeness score and classification above.
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

const LEGAL_STATUS_LABELS: Record<string, string> = {
  legal_requirement: 'Legal requirement',
  lacors_recommendation: 'LACORS benchmark',
  advisory: 'Advisory',
}

function RemedyList({ remedies }: { remedies: ActiveRemedy[] }) {
  return (
    <ul className="remedy-list">
      {remedies.map((remedy) => (
        <li key={remedy.id} className={`remedy-item remedy-item--${remedy.confidence}`}>
          <div className="remedy-item__header">
            <span className="remedy-item__id">{remedy.id}</span>
            <span className={`legal-status-badge legal-status-badge--${remedy.legal_status}`}>
              {LEGAL_STATUS_LABELS[remedy.legal_status] ?? remedy.legal_status}
            </span>
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

function PropertyFrameworkSummary({ summary }: { summary: PropertyTypeSummary }) {
  return (
    <section className="report-section report-section--framework">
      <h2>Applicable Regulatory Framework</h2>
      <dl className="framework-summary">
        <dt>Property type</dt>
        <dd>{summary.classification_label}</dd>
        <dt>Common parts present</dt>
        <dd>{summary.common_parts_present ? 'Yes' : 'No'}</dd>
        <dt>Applicable statutory instruments</dt>
        <dd>
          <ul className="framework-summary__list">
            {summary.applicable_legal_frameworks.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </dd>
        <dt>LACORS benchmark applied</dt>
        <dd>{summary.lacors_benchmark_applied ? 'Yes' : 'No'}</dd>
        <dt>How LACORS is used</dt>
        <dd>{summary.lacors_application_note}</dd>
      </dl>
    </section>
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
