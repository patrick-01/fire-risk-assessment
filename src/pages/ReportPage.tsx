/**
 * ReportPage.tsx — Compliance report output screen (v2 engine).
 *
 * Recomputes the full v2 pipeline from `answers` (the source of truth) inside a
 * useMemo and renders it as a rich report:
 *
 *   classify → deriveLegalFramework → computeRisk → computeRemediesV2
 *
 * Makes no compliance decisions of its own — all logic lives in the engine.
 * The report is keyed off building origin / legal framework / risk SEPARATELY,
 * so a purpose-built building shows the same risk as an identical converted one
 * but a different legal framework and no Section-257 / conversion wording.
 *
 * Sections:
 *   - Property header
 *   - Overall risk (severity + knowledge + per-domain breakdown)
 *   - Property classification (origin, HMO, Case Study D10 vs general LACORS)
 *   - Applicable legal framework
 *   - Completeness indicator
 *   - Legal requirements / Recommendations / Further investigation / Advisory
 *   - Remediation schedule
 *   - Disclaimer
 */

import { useMemo, useState } from 'react'
import { useAppContext } from '../state/AppContext'
import { classify, deriveLegalFramework } from '../engine/classifier'
import { computeRisk } from '../engine/riskEngine'
import { computeRemediesV2 } from '../engine/remedyEngine.v2'
import { QUESTION_MAP } from '../data/schema/questions'
import { shouldShowQuestion } from '../engine/navigator'
import {
  downloadAssessmentJson,
  encodeAssessmentForUrl,
  isShareLinkSupported,
} from '../persistence/localStorageAdapter'
import type {
  BuildingClassification,
  BuildingOrigin,
  EntranceConfiguration,
  HmoClassification,
  LegalFrameworkAssessment,
  LegalStatus,
  RemedyPriority,
  RemedyScope,
  RemedySummary,
  ResolvedRemedy,
  RiskAssessment,
  RiskDomain,
  RiskKnowledge,
  RiskSeverity,
} from '../state/AppState'

type ShareStatus = 'idle' | 'copying' | 'copied' | 'too-large' | 'error' | 'unsupported'

// ---------------------------------------------------------------------------
// Label maps (presentational only)
// ---------------------------------------------------------------------------

const ORIGIN_LABELS: Record<BuildingOrigin, string> = {
  purpose_built_two_flats: 'Purpose-built, two self-contained flats',
  converted_from_single_house: 'Converted from a single dwelling house',
  unknown: 'Not yet established',
}

const HMO_LABELS: Record<HmoClassification, string> = {
  not_hmo: 'Not a Section 257 HMO',
  section_257_hmo: 'Section 257 HMO (confirmed)',
  probable_section_257_hmo: 'Probable Section 257 HMO',
  unresolved: 'Unresolved — insufficient information',
}

const ENTRANCE_LABELS: Record<EntranceConfiguration, string> = {
  separate_private_entrances: 'Separate private entrances for each flat',
  shared_entrance_hall: 'Shared entrance hall serving both flats',
  shared_hall_and_shared_stair: 'Shared entrance hall and shared staircase',
  unknown: 'Not yet established',
}

const APPLICABILITY_LABELS: Record<'applicable' | 'not_applicable' | 'unknown', string> = {
  applicable: 'Applicable',
  not_applicable: 'Not applicable',
  unknown: 'Not yet established',
}

const LACORS_USE_LABELS: Record<LegalFrameworkAssessment['lacors_guidance_use'], string> = {
  direct_benchmark: 'Direct compliance benchmark (Case Study D10 applies to this property)',
  risk_reference: 'Risk-assessment reference only — not a direct compliance benchmark',
  not_applicable: 'Not applicable to this property',
  unknown: 'Not yet established',
}

const DOMAIN_LABELS: Record<RiskDomain, string> = {
  escape: 'Escape routes',
  doors: 'Doors & route protection',
  detection: 'Detection & alarms',
  compartmentation: 'Stair compartmentation',
  common_parts: 'Common parts',
  management: 'Management',
}

const SEVERITY_LABELS: Record<RiskSeverity, string> = {
  low: 'Low',
  normal: 'Normal',
  elevated: 'Elevated',
  high: 'High',
}

const KNOWLEDGE_LABELS: Record<RiskKnowledge, string> = {
  known_risk: 'Known',
  potential_risk: 'Potential',
  unknown_risk: 'Unverified',
}

const LEGAL_STATUS_LABELS: Record<LegalStatus, string> = {
  legal_requirement: 'Legal requirement',
  lacors_benchmark_recommendation: 'LACORS benchmark',
  risk_based_recommendation: 'Risk-based',
  advisory_good_practice: 'Advisory',
  further_investigation_required: 'Investigate',
}

const PRIORITY_LABELS: Record<RemedyPriority, string> = {
  P1_urgent: 'P1 — Urgent',
  P2_high: 'P2 — High',
  P3_medium: 'P3 — Medium',
  P4_low: 'P4 — Low',
  investigate: 'Investigate',
}

const SCOPE_LABELS: Record<RemedyScope, string> = {
  building: 'Whole building',
  common_parts: 'Common parts',
  ground_flat: 'Ground-floor flat',
  upper_flat: 'Upper-floor flat',
}

const LEGAL_FRAMEWORK_ROWS: Array<{ key: keyof LegalFrameworkAssessment; name: string }> = [
  { key: 'electrical_safety', name: 'Electrical Safety Standards (Private Rented Sector) Regulations 2020' },
  { key: 'hhsrs_fire_hazard', name: 'Housing Health & Safety Rating System — fire hazard (Housing Act 2004)' },
  { key: 'smoke_co_alarm_regulations', name: 'Smoke & Carbon Monoxide Alarm (Amendment) Regulations 2022' },
  { key: 'gas_safety', name: 'Gas Safety (Installation and Use) Regulations 1998' },
  { key: 'fire_safety_order_common_parts', name: 'Regulatory Reform (Fire Safety) Order 2005 — common parts' },
  { key: 'section_257_hmo', name: 'Housing Act 2004, Section 257 (HMO common parts)' },
]

const FRAMEWORK_STATUS_LABELS: Record<'applies' | 'not_applicable' | 'unknown', string> = {
  applies: 'Applies',
  not_applicable: 'Not applicable',
  unknown: 'To confirm',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportPage() {
  const { state, dispatch } = useAppContext()
  const [shareStatus, setShareStatus] = useState<ShareStatus>('idle')

  const model = useMemo(() => {
    const assessment = state.activeAssessment
    if (!assessment) return null
    const answers = assessment.answers
    const classification = classify(answers)
    const legalFramework = deriveLegalFramework(answers, classification)
    const risk = computeRisk(answers, classification)
    const remedies = computeRemediesV2(answers, classification, risk)

    // Completeness — applicable questions answered with confirmed certainty.
    const applicable = Object.values(QUESTION_MAP).filter((q) => shouldShowQuestion(q, answers))
    const confirmed = applicable.filter((q) => answers[q.id]?.confidence === 'confirmed').length
    const completeness = applicable.length === 0 ? 0 : Math.round((confirmed / applicable.length) * 100)

    return { classification, legalFramework, risk, remedies, completeness, confirmed, total: applicable.length }
  }, [state.activeAssessment])

  if (!model || !state.activeAssessment) {
    return (
      <main className="page page--report">
        <p>
          No assessment loaded.{' '}
          <button className="btn btn--link" onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}>
            Return home
          </button>
        </p>
      </main>
    )
  }

  const assessment = state.activeAssessment
  const { classification, legalFramework, risk, remedies, completeness, confirmed, total } = model
  const property = assessment.property
  const addressLine = [property.address_line_1, property.address_line_2, property.town, property.postcode_normalised]
    .filter(Boolean)
    .join(', ')
  const generatedAt = assessment.report_generated_at ?? new Date().toISOString()
  const lowCompleteness = completeness < 70
  const noRemedies =
    remedies.legal_requirements.length === 0 &&
    remedies.recommendations.length === 0 &&
    remedies.further_investigation.length === 0 &&
    remedies.advisory.length === 0

  return (
    <main className="page page--report">
      {/* Property header */}
      <header className="report-header">
        <h1>Fire Safety Assessment Report</h1>
        <p className="report-meta">{addressLine}{property.flat_ref ? ` — ${property.flat_ref}` : ''}</p>
        <p className="report-meta report-meta--small">
          Generated: {new Date(generatedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
          {' · '}Rules: {assessment.rules_version}
          {' · '}App: {assessment.app_version}
        </p>
        <p className="report-meta report-meta--small report-disclaimer-inline">
          This report is guidance only. It does not constitute a formal fire risk assessment or a
          legally binding compliance certificate. See disclaimer below.
        </p>
      </header>

      {/* Overall risk */}
      <RiskOverview risk={risk} />

      {/* Classification */}
      <ClassificationPanel classification={classification} />

      {/* Legal framework */}
      <LegalFrameworkPanel legalFramework={legalFramework} />

      {/* Completeness */}
      {lowCompleteness && (
        <div className="banner banner--amber" role="alert">
          This report is based on incomplete information. {total - confirmed} item
          {total - confirmed === 1 ? '' : 's'} require verification before works are specified.
        </div>
      )}
      <section className="report-section report-section--completeness">
        <p className="completeness-score">
          Report completeness:{' '}
          <strong className={completeness >= 70 ? 'completeness-score--good' : 'completeness-score--warn'}>
            {completeness}%
          </strong>{' '}
          ({confirmed} of {total} facts confirmed)
        </p>
      </section>

      {/* Remedy tiers */}
      {remedies.legal_requirements.length > 0 && (
        <RemedyTier
          className="report-section--statutory"
          title="Legal Requirements"
          description="Direct statutory obligations. They apply to this property regardless of risk level or HMO classification. Non-compliance may result in enforcement action."
          remedies={remedies.legal_requirements}
        />
      )}

      {remedies.recommendations.length > 0 && (
        <RemedyTier
          title="Recommendations"
          description="Recommended based on LACORS fire-safety guidance and the assessed risk for this property. Items shown as 'LACORS benchmark' reflect the Section-257 Case Study D10 benchmark; 'Risk-based' items are driven purely by the evidence and apply to any building of this type."
          remedies={remedies.recommendations}
        />
      )}

      {remedies.further_investigation.length > 0 && (
        <RemedyTier
          title="Further Investigation Required"
          description="The evidence for these items could not be confirmed from the answers given. A competent person should resolve them before works are specified."
          remedies={remedies.further_investigation}
        />
      )}

      {remedies.advisory.length > 0 && (
        <RemedyTier
          title="Advisory / Good Practice"
          description="Good-practice actions and management measures. Not statutory minimums, but they reduce risk and support compliance."
          remedies={remedies.advisory}
        />
      )}

      {noRemedies && (
        <section className="report-section">
          <p className="report-no-remedies">
            No recommendations were triggered by the answers given. This may indicate the
            questionnaire is incomplete or the classification is unresolved — check the completeness
            score and classification above.
          </p>
        </section>
      )}

      {/* Remediation schedule */}
      {remedies.remediation_schedule.length > 0 && (
        <RemediationSchedule remedies={remedies.remediation_schedule} />
      )}

      {/* Disclaimer */}
      <section className="report-section report-section--disclaimer">
        <h2>Disclaimer</h2>
        <p>
          This report is produced by a self-assessment tool and does not constitute a formal fire
          risk assessment, a legally binding compliance certificate, or advice from Richmond upon
          Thames Council. All recommendations should be read as general guidance grounded in LACORS
          principles, except where explicitly marked “Required”. A competent person should verify all
          findings and specify any works before they are carried out.
        </p>
      </section>

      {/* Actions */}
      <div className="report-actions">
        <button className="btn btn--secondary" onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'review' })}>
          ← Edit answers
        </button>
        <button
          className="btn btn--secondary"
          onClick={() => downloadAssessmentJson(assessment)}
          title="Download this assessment as a JSON file for archiving or sharing"
        >
          Export JSON
        </button>
        <ShareButton
          status={shareStatus}
          onShare={async () => {
            if (!isShareLinkSupported()) {
              setShareStatus('unsupported')
              return
            }
            setShareStatus('copying')
            try {
              const encoded = await encodeAssessmentForUrl(assessment)
              const url = window.location.origin + window.location.pathname + '#share=' + encoded
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
        />
        <button className="btn btn--secondary" onClick={() => dispatch({ type: 'NAVIGATE_TO_SCREEN', payload: 'home' })}>
          Home
        </button>
      </div>
      {shareStatus === 'too-large' && (
        <p className="share-error" role="alert">
          This assessment is too large to share via URL. Use <strong>Export JSON</strong> to download
          the file and share it directly.
        </p>
      )}
      {shareStatus === 'error' && (
        <p className="share-error" role="alert">
          Could not copy to clipboard. Try again or use Export JSON.
        </p>
      )}
      {shareStatus === 'unsupported' && (
        <p className="share-error" role="alert">
          Share links are not supported in this browser. Use <strong>Export JSON</strong> instead.
        </p>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sub-components (presentational only)
// ---------------------------------------------------------------------------

const RISK_DOMAIN_ORDER: RiskDomain[] = [
  'escape',
  'doors',
  'detection',
  'compartmentation',
  'common_parts',
  'management',
]

function RiskOverview({ risk }: { risk: RiskAssessment }) {
  return (
    <section className="report-section report-section--risk">
      <h2>Overall Risk</h2>
      <div className={`risk-level-badge risk-level-badge--${risk.overall_severity}`}>
        <span className="risk-level-badge__label">{SEVERITY_LABELS[risk.overall_severity].toUpperCase()}</span>
        <span className="risk-level-badge__score">
          Confidence: {KNOWLEDGE_LABELS[risk.overall_knowledge].toLowerCase()}
        </span>
      </div>
      {risk.overall_knowledge === 'unknown_risk' && (
        <p className="risk-summary-text">
          One or more areas could not be verified from the answers given. The overall risk may change
          once the items in “Further investigation required” are resolved.
        </p>
      )}
      <table className="risk-dimension-table">
        <thead>
          <tr>
            <th>Area</th>
            <th>Severity</th>
            <th>Knowledge</th>
            <th>Factors</th>
          </tr>
        </thead>
        <tbody>
          {RISK_DOMAIN_ORDER.map((domain) => {
            const d = risk.domains[domain]
            return (
              <tr key={domain}>
                <td>{DOMAIN_LABELS[domain]}</td>
                <td>
                  <span className={`dimension-status dimension-status--${d.severity}`}>
                    {SEVERITY_LABELS[d.severity]}
                  </span>
                </td>
                <td>
                  <span className={`knowledge-badge knowledge-badge--${d.knowledge}`}>
                    {KNOWLEDGE_LABELS[d.knowledge]}
                  </span>
                </td>
                <td>{d.factors.length}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function ClassificationPanel({ classification }: { classification: BuildingClassification }) {
  return (
    <section className="report-section">
      <h2>Property Classification</h2>
      <dl className="framework-summary">
        <dt>Building type</dt>
        <dd>{ORIGIN_LABELS[classification.origin]}</dd>
        <dt>Legal classification</dt>
        <dd>{HMO_LABELS[classification.hmo]}</dd>
        <dt>Entrance configuration</dt>
        <dd>{ENTRANCE_LABELS[classification.entrance_configuration]}</dd>
        <dt>Case Study D10 benchmark</dt>
        <dd>{APPLICABILITY_LABELS[classification.case_study_d10]}</dd>
        <dt>General LACORS guidance</dt>
        <dd>{APPLICABILITY_LABELS[classification.general_lacors_risk_guidance]}</dd>
        <dt>Classification confidence</dt>
        <dd>
          <span className={`confidence-badge confidence-badge--${classification.confidence}`}>
            {classification.confidence}
          </span>
        </dd>
      </dl>
      {classification.unresolved_reasons.length > 0 && (
        <ul className="unresolved-reasons">
          {classification.unresolved_reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LegalFrameworkPanel({ legalFramework }: { legalFramework: LegalFrameworkAssessment }) {
  return (
    <section className="report-section report-section--framework">
      <h2>Applicable Legal Framework</h2>
      <p className="tier-description">
        The statutory regimes below are determined by the building’s facts, independently of its
        Section 257 status. This states which regimes apply — not whether the property complies.
      </p>
      <dl className="framework-summary">
        {LEGAL_FRAMEWORK_ROWS.map((row) => {
          const status = legalFramework[row.key] as 'applies' | 'not_applicable' | 'unknown'
          return (
            <FrameworkRow key={row.key} name={row.name} status={status} />
          )
        })}
        <dt>LACORS guidance is used as</dt>
        <dd>{LACORS_USE_LABELS[legalFramework.lacors_guidance_use]}</dd>
      </dl>
    </section>
  )
}

function FrameworkRow({ name, status }: { name: string; status: 'applies' | 'not_applicable' | 'unknown' }) {
  return (
    <>
      <dt>{name}</dt>
      <dd>
        <span className={`framework-status framework-status--${status}`}>{FRAMEWORK_STATUS_LABELS[status]}</span>
      </dd>
    </>
  )
}

function RemedyTier({
  title,
  description,
  remedies,
  className,
}: {
  title: string
  description: string
  remedies: ResolvedRemedy[]
  className?: string
}) {
  return (
    <section className={`report-section${className ? ` ${className}` : ''}`}>
      <h2>{title}</h2>
      <p className="tier-description">{description}</p>
      <ul className="remedy-list">
        {remedies.map((remedy) => (
          <RemedyCard key={remedy.rule_id} remedy={remedy} />
        ))}
      </ul>
    </section>
  )
}

function RemedyCard({ remedy }: { remedy: ResolvedRemedy }) {
  return (
    <li className={`remedy-item remedy-item--${remedy.confidence}`}>
      <div className="remedy-item__header">
        <span className="remedy-item__id">{remedy.rule_id}</span>
        <span className={`legal-status-badge legal-status-badge--${remedy.legal_status}`}>
          {LEGAL_STATUS_LABELS[remedy.legal_status]}
        </span>
        <span className={`confidence-badge confidence-badge--${remedy.confidence}`}>{remedy.confidence}</span>
        <span className="remedy-item__basis">
          {PRIORITY_LABELS[remedy.priority]} · {SCOPE_LABELS[remedy.applies_to]}
        </span>
      </div>
      <h3 className="remedy-item__title">{remedy.title}</h3>
      <p className="remedy-item__text">{remedy.text}</p>
      {remedy.risk_basis && (
        <details className="remedy-item__risk-basis">
          <summary>Why this matters</summary>
          <p>{remedy.risk_basis}</p>
        </details>
      )}
      {remedy.regulatory_refs.length > 0 && (
        <p className="remedy-item__refs">Ref: {remedy.regulatory_refs.join(' · ')}</p>
      )}
    </li>
  )
}

function RemediationSchedule({ remedies }: { remedies: RemedySummary['remediation_schedule'] }) {
  return (
    <section className="report-section">
      <h2>Remediation Schedule</h2>
      <p className="tier-description">
        All identified actions in priority order (most urgent first). See the sections above for the
        full detail and reasoning behind each item.
      </p>
      <ol className="schedule-list">
        {remedies.map((remedy) => (
          <li key={remedy.rule_id} className="schedule-item">
            <span className={`legal-status-badge legal-status-badge--${remedy.legal_status}`}>
              {LEGAL_STATUS_LABELS[remedy.legal_status]}
            </span>
            <span className="schedule-item__priority">{PRIORITY_LABELS[remedy.priority]}</span>
            <span className="schedule-item__title">{remedy.title}</span>
            <span className="schedule-item__scope">{SCOPE_LABELS[remedy.applies_to]}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ShareButton({ onShare, status }: { onShare: () => void; status: ShareStatus }) {
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
