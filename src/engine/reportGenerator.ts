/**
 * reportGenerator.ts — Generates the structured report object from
 * classification, active remedies, and the raw assessment.
 *
 * The report object is what the ReportPage renders. The UI does not make
 * compliance decisions of its own — it only renders what this module produces.
 *
 * This module has NO React, NO DOM, NO localStorage.
 *
 * TODO: Add PDF export trigger (pass report object to a pdf-lib renderer).
 * TODO: Add shareable link generation (compress report JSON → base64 → URL hash).
 */

import type {
  Assessment,
  AnswerMap,
  Classification,
  RiskLevel,
} from '../state/AppState'
import type { ActiveRemedy } from './remedyEngine'
import { groupRemediesByTier } from './remedyEngine'
import { RISK_FACTOR_DIMENSIONS } from './classifier'
import { RULES_VERSION, RULES_DATE } from '../data/rules/remedy-rules'
import { APP_VERSION } from '../state/AppState'
import { QUESTION_MAP } from '../data/schema/questions'
import { shouldShowQuestion } from './navigator'

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface UnresolvedFact {
  question_id: string
  question_text: string
  /** The raw value given — typically 'not_sure' or 'unknown'. */
  answer_given: string
  /** The uncertainty behaviour code that applies (e.g. BLOCK_CLASS). */
  uncertainty_behaviour: string
  /** Plain-language description of what needs to be physically verified. */
  verification_needed: string
}

export interface ReportSection {
  title: string
  body: string
}

export type RiskDimensionStatus = 'adequate' | 'compromised' | 'unknown'

export interface RiskDimensionSummary {
  escape: RiskDimensionStatus
  construction: RiskDimensionStatus
  detection: RiskDimensionStatus
  management: RiskDimensionStatus
}

export interface Report {
  // Metadata
  generated_at: string // ISO 8601
  app_version: string
  rules_version: string
  rules_date: string

  // Property
  address_display: string
  flat_ref: string | null

  // Classification
  classification: Classification
  classification_summary: string
  classification_basis: string

  // Risk level (primary output)
  risk_level: RiskLevel
  risk_score: number
  risk_factors_present: string[]
  risk_summary: string
  risk_dimension_summary: RiskDimensionSummary
  /** Non-null when 3+ dimensions are compromised simultaneously. */
  risk_stacking_warning: string | null

  // Completeness
  /** 0–100. Below 70 → amber warning banner. */
  completeness_score: number
  confirmed_facts: number
  total_applicable_facts: number

  // Remedies grouped by tier
  mandatory_remedies: ActiveRemedy[]
  recommended_remedies: ActiveRemedy[]
  advisory_items: ActiveRemedy[]

  // Facts requiring verification (§6.2)
  unresolved_facts: UnresolvedFact[]

  // Interpretive assumptions the outputs rest on
  assumptions: string[]

  // Boilerplate
  disclaimer: ReportSection

  // Non-null when rules version has changed since this assessment was saved.
  rules_version_banner: string | null
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generates the full report object.
 *
 * @param assessment       — The saved assessment (answers + classification)
 * @param remedies         — Active remedies from computeRemedies()
 * @param savedRulesVersion — Rules version the assessment was last saved under
 */
export function generateReport(
  assessment: Assessment,
  remedies: ActiveRemedy[],
  savedRulesVersion: string
): Report {
  const { mandatory, recommended, advisory } = groupRemediesByTier(remedies)
  const answers: AnswerMap = assessment.answers
  const classification: Classification = assessment.classification

  const addressDisplay = formatAddress(assessment)

  // --- Completeness (§6.3) ---
  const applicableIds = Object.values(QUESTION_MAP)
    .filter((q) => shouldShowQuestion(q, answers))
    .map((q) => q.id)

  const totalApplicable = applicableIds.length
  const confirmedFacts = applicableIds.filter(
    (id) => answers[id] && answers[id].confidence === 'confirmed'
  ).length
  const completenessScore =
    totalApplicable === 0 ? 0 : Math.round((confirmedFacts / totalApplicable) * 100)

  // --- Unresolved facts (§6.2) ---
  const unresolvedFacts: UnresolvedFact[] = []
  for (const id of applicableIds) {
    const answer = answers[id]
    if (!answer) continue
    const question = QUESTION_MAP[id]
    if (!question?.uncertainty_behaviour) continue
    const isUncertain =
      answer.value === 'not_sure' ||
      answer.value === 'unknown' ||
      answer.confidence === 'not_sure' ||
      answer.confidence === 'unknown'
    if (!isUncertain) continue
    unresolvedFacts.push({
      question_id: id,
      question_text: question.text,
      answer_given: String(answer.value),
      uncertainty_behaviour: question.uncertainty_behaviour,
      verification_needed: verificationText(question.uncertainty_behaviour, question.text),
    })
  }

  // --- Risk level ---
  const riskLevel = classification.risk_level
  const riskFactors = classification.risk_factors_present

  const riskDimensions = buildRiskDimensionSummary(riskFactors)
  const riskStackingWarning = buildRiskStackingWarning(riskDimensions)
  const riskSummary = buildRiskSummary(riskLevel, riskFactors, classification)

  // --- Assumptions ---
  const assumptions = buildAssumptions(classification, answers)

  // --- Rules version mismatch banner ---
  const rulesVersionBanner =
    savedRulesVersion !== RULES_VERSION
      ? `This assessment was saved under rules version ${savedRulesVersion}. ` +
        `It has been re-evaluated under the current rules version ${RULES_VERSION}. ` +
        `Review the results below.`
      : null

  return {
    generated_at: new Date().toISOString(),
    app_version: APP_VERSION,
    rules_version: RULES_VERSION,
    rules_date: RULES_DATE,

    address_display: addressDisplay,
    flat_ref: assessment.property.flat_ref,

    classification,
    classification_summary: buildClassificationSummary(classification),
    classification_basis: buildClassificationBasis(classification, answers),

    risk_level: riskLevel,
    risk_score: classification.risk_score,
    risk_factors_present: riskFactors,
    risk_summary: riskSummary,
    risk_dimension_summary: riskDimensions,
    risk_stacking_warning: riskStackingWarning,

    completeness_score: completenessScore,
    confirmed_facts: confirmedFacts,
    total_applicable_facts: totalApplicable,

    mandatory_remedies: mandatory,
    recommended_remedies: recommended,
    advisory_items: advisory,

    unresolved_facts: unresolvedFacts,

    assumptions,

    disclaimer: {
      title: 'Important — limitations of this assessment',
      body:
        'This report is produced by a self-assessment tool and does not constitute a formal ' +
        'fire risk assessment, a legally binding compliance certificate, or advice from ' +
        'Richmond upon Thames Council. It does not replace a qualified fire risk assessor or ' +
        'written confirmation from the council. All recommendations should be read as general ' +
        'guidance grounded in LACORS principles, not as definitive legal requirements specific ' +
        'to this property. A competent person should verify all findings and specify any works ' +
        'before they are carried out. The tool uses "should" and "generally expected" language ' +
        'for LACORS guidance and reserves "required by law" for direct statutory obligations only.',
    },

    rules_version_banner: rulesVersionBanner,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAddress(assessment: Assessment): string {
  const p = assessment.property
  const parts = [p.address_line_1, p.address_line_2, p.town, p.postcode_normalised].filter(
    Boolean
  )
  return parts.join(', ')
}

function buildClassificationSummary(c: Classification): string {
  if (c.type === 'not-section-257') {
    return 'This property does not fall within the scope of this assessment tool.'
  }
  if (c.type === 'unresolved') {
    return (
      'The property classification could not be determined from the answers provided. ' +
      (c.unresolved_reasons[0] ?? 'Additional information is required.')
    )
  }

  const typeLabel =
    c.type === 'probable-section-257'
      ? 'probable Section 257 HMO (one or more facts are unconfirmed)'
      : 'Section 257 HMO'

  const entranceNote =
    c.communal_entrance === 'false'
      ? ' with separate individual entrances'
      : c.communal_entrance === 'true'
        ? ' with a shared communal entrance and staircase'
        : ''

  const benchmarkNote =
    c.benchmark === 'D10'
      ? ' The configuration is typical of LACORS Case Study D10. The principles of that case ' +
        'study inform this assessment — it does not mean D10 is a mandatory prescriptive standard.'
      : ''

  return (
    `This property is classified as a ${typeLabel} under the Housing Act 2004 (s.257)` +
    `${entranceNote}.${benchmarkNote}`
  )
}

function buildClassificationBasis(_c: Classification, answers: AnswerMap): string {
  const parts: string[] = []

  const A1 = answers['A1']?.value
  const A2 = answers['A2']?.value
  const A3 = answers['A3']?.value
  const A4 = answers['A4']?.value
  const A5 = answers['A5']?.value

  if (A1 === 'converted') parts.push('originally a single dwelling, later converted')
  if (A2 === 'yes') parts.push('conversion pre-dates 1991 or is evidenced as non-compliant')
  if (A3 === '2') parts.push('contains exactly two self-contained flats')
  if (A4 === 'none_owner_occupied') parts.push('both flats privately rented')
  if (A5 === 'yes') parts.push('located in London Borough of Richmond upon Thames')

  if (parts.length === 0) return 'Classification criteria not yet fully answered.'

  return 'Classification based on: ' + parts.join('; ') + '.'
}

function buildRiskDimensionSummary(riskFactors: string[]): RiskDimensionSummary {
  const dims = {
    escape: { count: 0, hasHeavy: false },
    construction: { count: 0, hasHeavy: false },
    detection: { count: 0, hasHeavy: false },
    management: { count: 0, hasHeavy: false },
  }

  // RF-E04 has weight 3 — counts as heavy
  const HEAVY_FACTORS = new Set(['RF-E04', 'RF-C01', 'RF-C05', 'RF-D01', 'RF-D02', 'RF-D06'])

  for (const factor of riskFactors) {
    const dim = RISK_FACTOR_DIMENSIONS[factor]
    if (!dim) continue
    dims[dim].count++
    if (HEAVY_FACTORS.has(factor)) dims[dim].hasHeavy = true
  }

  function status(d: { count: number; hasHeavy: boolean }): RiskDimensionStatus {
    if (d.count === 0) return 'adequate'
    if (d.hasHeavy || d.count >= 2) return 'compromised'
    return 'compromised' // any factor present = compromised
  }

  return {
    escape: status(dims.escape),
    construction: status(dims.construction),
    detection: status(dims.detection),
    management: status(dims.management),
  }
}

function buildRiskStackingWarning(dims: RiskDimensionSummary): string | null {
  const compromised = (Object.values(dims) as RiskDimensionStatus[]).filter(
    (s) => s === 'compromised'
  ).length
  if (compromised < 3) return null
  return (
    'This assessment has identified risk factors across multiple dimensions ' +
    `(${Object.entries(dims)
      .filter(([, s]) => s === 'compromised')
      .map(([k]) => k)
      .join(', ')}). ` +
    'Where multiple factors coincide, the combined risk is greater than any single factor in ' +
    'isolation. This warrants particular attention from a qualified fire risk assessor before ' +
    'remedial works are specified.'
  )
}

const RISK_LEVEL_DESCRIPTIONS: Record<RiskLevel, string> = {
  low:
    'Low — escape routes appear viable, construction is adequate, detection is in place, and ' +
    'the property appears well managed. Minor improvements may be recommended but the overall ' +
    'risk profile is acceptable.',
  normal:
    'Normal — a typical risk profile for this property type. Some improvements are expected. ' +
    'No single factor presents an unacceptable risk in isolation, but the identified items ' +
    'should be addressed.',
  elevated:
    'Elevated — one or more significant risk factors are present, or several minor factors in ' +
    'combination. Remedial attention is clearly warranted. A formal fire risk assessment by a ' +
    'competent person is strongly recommended.',
  high:
    'High — multiple serious risk factors are present in combination. Significant remedial works ' +
    'are likely required. A formal fire risk assessment by a competent person should be ' +
    'commissioned promptly before any works are specified.',
  unresolved:
    'Risk level unresolved — insufficient information to compute an overall risk level. Complete ' +
    'the questionnaire and resolve any uncertain answers to obtain a risk assessment.',
}

function buildRiskSummary(
  riskLevel: RiskLevel,
  riskFactors: string[],
  classification: Classification
): string {
  const base = RISK_LEVEL_DESCRIPTIONS[riskLevel]

  if (riskFactors.length === 0) {
    return base + ' No specific risk factors were identified from the answers provided.'
  }

  const factorCount = riskFactors.length
  const scoreNote = `Total risk score: ${classification.risk_score}.`

  if (riskLevel === 'unresolved') return base

  return `${base} ${factorCount} risk factor${factorCount === 1 ? '' : 's'} contributed to this level. ${scoreNote}`
}

function buildAssumptions(classification: Classification, answers: AnswerMap): string[] {
  const assumptions: string[] = []

  if (classification.type === 'section-257-hmo') {
    assumptions.push(
      'The property is treated as a confirmed Section 257 HMO under the Housing Act 2004. ' +
        'Recommendations reflect this classification.'
    )
  } else if (classification.type === 'probable-section-257') {
    assumptions.push(
      'The property is treated as a probable Section 257 HMO. One or more classification ' +
        'facts are uncertain — the classification may change if those facts are resolved.'
    )
  }

  if (classification.communal_entrance === 'true') {
    assumptions.push(
      'The property has a communal entrance and staircase. Communal-specific requirements ' +
        '(staircase enclosure, communal alarm, common parts fire risk assessment) apply.'
    )
  }

  if (classification.separate_entrance_mode) {
    assumptions.push(
      'The property has separate individual entrances (no communal staircase). ' +
        'Communal-specific requirements are suppressed. Richmond Council has not issued ' +
        'definitive written guidance for this configuration; recommendations are based on ' +
        'general LACORS principles pending council confirmation.'
    )
  }

  // Conservative assumptions where uncertain
  const uncertain = Object.values(QUESTION_MAP).filter((q) => {
    const ans = answers[q.id]
    return (
      ans &&
      q.uncertainty_behaviour === 'CONSERVATIVE' &&
      (ans.value === 'not_sure' || ans.confidence === 'not_sure')
    )
  })
  if (uncertain.length > 0) {
    assumptions.push(
      `Conservative assumption applied to ${uncertain.length} uncertain answer${uncertain.length === 1 ? '' : 's'}: ` +
        'where the answer to a physical question was "not sure", the stricter (worse-case) ' +
        'interpretation has been used in risk scoring. Verify these facts on site.'
    )
  }

  if (classification.escape_windows.bedroom_1 === 'unknown') {
    assumptions.push(
      'Bedroom 1 escape window status is uncertain — it is treated as not qualifying for risk ' +
        'scoring purposes (conservative assumption). Physically measure and verify the window.'
    )
  }

  assumptions.push(
    'All recommendations in this report use "should" or "generally expected" language for ' +
      'LACORS guidance. Only items marked "Required by law" impose a direct statutory obligation. ' +
      'The appropriate standard for this specific property must be confirmed by a competent person.'
  )

  return assumptions
}

/**
 * Returns a plain-language description of what the user needs to physically
 * verify or confirm, given the uncertainty behaviour code.
 */
function verificationText(behaviour: string, questionText: string): string {
  switch (behaviour) {
    case 'BLOCK_CLASS':
      return `Physical inspection or documentary evidence required to answer: "${questionText}"`
    case 'CONSERVATIVE':
      return `Physical inspection recommended to confirm the safe interpretation for: "${questionText}"`
    case 'ADVISORY_ONLY':
      return `Advisory check required — confirm with a qualified person: "${questionText}"`
    case 'DEFER':
      return `All dependent items deferred until confirmed: "${questionText}"`
    case 'RISK_ELEVATE':
      return `This unknown is treated as a risk factor. Confirm and document: "${questionText}"`
    default:
      return `Verification required for: "${questionText}"`
  }
}
