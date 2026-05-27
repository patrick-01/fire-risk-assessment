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
import { groupRemediesByLegalStatus } from './remedyEngine'
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

/**
 * Summary of the applicable regulatory framework for this specific property.
 * Shown at the top of the report so readers understand what legal basis applies
 * before reading the findings.
 */
export interface PropertyTypeSummary {
  /** Plain-English label, e.g. "Section 257 HMO" or "Non-Section-257 rented property" */
  classification_label: string
  common_parts_present: boolean
  /** Statutory instruments that apply to this property. */
  applicable_legal_frameworks: string[]
  /** True when LACORS is being used as a risk-assessment benchmark. */
  lacors_benchmark_applied: boolean
  /**
   * Short note on how LACORS is being used — important for non-257 properties
   * where LACORS is guidance only, not a directly applicable standard.
   */
  lacors_application_note: string
}

export interface UpperFlatEscapeStrategySummary {
  shared_route_exists: string
  independent_escape: string
  escape_type: string
  viability: string
  shared_route_dependency: string
  narrative: string
}

export interface StairCompartmentationSummary {
  /** False when property has no shared entrance (separate entrance mode). */
  applicable: boolean
  /** Human-readable label for D10 answer, or 'Not assessed'. */
  construction: string
  /** Human-readable label for D12 answer, or null when question was not shown. */
  board_thickness: string | null
  /** Human-readable label for D14 answer, or 'Not assessed'. */
  inspection_confidence: string
  /** Human-readable label for D15 answer, or 'Not assessed'. */
  penetrations: string
  /** Derived confidence level from classifier. */
  compartmentation_confidence: string
  /** Stair-specific risk level derived from RF-S sub-score. */
  risk_level: string
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

  // Regulatory framework applicable to this property
  property_type_summary: PropertyTypeSummary

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

  // Remedies grouped by legal status (primary report grouping)
  legal_requirement_remedies: ActiveRemedy[]
  lacors_recommendation_remedies: ActiveRemedy[]
  advisory_items: ActiveRemedy[]

  // Facts requiring verification (§6.2)
  unresolved_facts: UnresolvedFact[]

  // Interpretive assumptions the outputs rest on
  assumptions: string[]

  // Boilerplate
  disclaimer: ReportSection

  // Stair compartmentation evidence summary
  stair_compartmentation: StairCompartmentationSummary

  // Upper flat escape strategy summary (§5 of external-stairs spec)
  upper_flat_escape_strategy: UpperFlatEscapeStrategySummary

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
  const { legal_requirement, lacors_recommendation, advisory } = groupRemediesByLegalStatus(remedies)
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

    property_type_summary: buildPropertyTypeSummary(classification, answers),

    legal_requirement_remedies: legal_requirement,
    lacors_recommendation_remedies: lacors_recommendation,
    advisory_items: advisory,

    stair_compartmentation: buildStairCompartmentationSummary(classification, answers),

    upper_flat_escape_strategy: buildUpperFlatEscapeStrategySummary(classification),

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

function buildPropertyTypeSummary(
  c: Classification,
  answers: AnswerMap
): PropertyTypeSummary {
  const isHmo = c.type === 'section-257-hmo' || c.type === 'probable-section-257'
  const isNotHmo = c.type === 'not-section-257'
  const hasCommunal = c.communal_entrance === 'true'

  // Always-applicable statutes for all privately rented properties
  const frameworks: string[] = [
    'Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022',
    'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020',
    'Gas Safety (Installation and Use) Regulations 1998',
    'Housing Health and Safety Rating System (HHSRS) — Housing Act 2004',
  ]

  if (hasCommunal) {
    frameworks.push('Regulatory Reform (Fire Safety) Order 2005 — common parts')
  }

  if (isHmo) {
    frameworks.push('Housing Act 2004 s.257 — Section 257 HMO regime')
  }

  let classificationLabel: string
  if (c.type === 'section-257-hmo') {
    classificationLabel = 'Section 257 HMO (confirmed)'
  } else if (c.type === 'probable-section-257') {
    classificationLabel = 'Probable Section 257 HMO (one or more facts unconfirmed)'
  } else if (c.type === 'not-section-257') {
    classificationLabel = 'Non-Section-257 privately rented residential property'
  } else {
    classificationLabel = 'Classification unresolved — additional information required'
  }

  let lacorsNote: string
  if (isNotHmo) {
    lacorsNote =
      'LACORS fire safety guidance is applied as a risk-assessment benchmark for this ' +
      'property. LACORS expressly covers a range of residential premises beyond HMOs. For ' +
      'non-Section-257 properties, items derived from LACORS are presented as recommendations ' +
      'rather than legal requirements — the legal baseline is narrower and consists of the ' +
      'statutes listed above.'
  } else if (c.type === 'probable-section-257') {
    lacorsNote =
      'LACORS fire safety guidance for converted buildings is applied as the primary ' +
      'risk-assessment benchmark. Because the Section 257 classification is probable rather ' +
      'than confirmed, some LACORS-based recommendations carry probable rather than confirmed ' +
      'confidence and may change if unconfirmed facts are resolved.'
  } else if (c.type === 'unresolved') {
    lacorsNote =
      'The Section 257 classification is unresolved. LACORS-based recommendations are shown ' +
      'with unresolved confidence — they may or may not apply depending on the final classification. ' +
      'Statutory items (gas safety, EICR, alarms) apply regardless of classification.'
  } else {
    lacorsNote =
      'LACORS fire safety guidance for converted buildings applies as the primary risk-assessment ' +
      'benchmark for this Section 257 HMO. The LACORS guidance is not a standalone statute but ' +
      'informs what the council and fire safety assessors expect for this property type.'
  }

  void answers

  return {
    classification_label: classificationLabel,
    common_parts_present: hasCommunal,
    applicable_legal_frameworks: frameworks,
    lacors_benchmark_applied: true,
    lacors_application_note: lacorsNote,
  }
}

function buildClassificationSummary(c: Classification): string {
  if (c.type === 'not-section-257') {
    return (
      'This property does not meet the criteria for a Section 257 HMO under the Housing ' +
      'Act 2004. The assessment continues under the applicable statutory framework for ' +
      'privately rented residential properties. LACORS fire safety guidance is applied as a ' +
      'risk-assessment benchmark where relevant, but LACORS-based items are presented as ' +
      'recommendations rather than legal requirements for this property type.'
    )
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
        ? ' with a shared entrance hall'
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
  if (A4 === 'one_owner_occupied')
    parts.push(
      'one flat owner-occupied, one privately rented (50% owner occupation — below the ' +
      'Schedule 14 two-thirds threshold; classification proceeds as probable Section 257)'
    )
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
      'The property has a shared entrance hall. Communal-specific requirements ' +
        '(staircase enclosure, communal alarm, common parts fire risk assessment) apply.'
    )
  }

  if (classification.separate_entrance_mode) {
    assumptions.push(
      'The property has separate individual entrances (no shared entrance hall). ' +
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
    'This report uses three categories: "Legal requirement" items reflect direct statutory ' +
      'obligations; "LACORS / risk-based recommendation" items reflect what LACORS guidance and ' +
      'council expectations indicate for this property type but are not universal statutory ' +
      'minimums; "Advisory" items are good practice, management actions, or points requiring ' +
      'professional confirmation. The appropriate standard for this specific property must be ' +
      'confirmed by a competent person.'
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

// ---------------------------------------------------------------------------
// Stair compartmentation summary builder
// ---------------------------------------------------------------------------

const D10_LABELS: Record<string, string> = {
  masonry: 'Brick or masonry',
  plasterboard: 'Plasterboard',
  lath_plaster: 'Lath and plaster',
  timber_panelling: 'Timber panelling',
  mixed: 'Mixed materials',
  unknown: 'Unknown',
}

const D12_LABELS: Record<string, string> = {
  under_9_5: 'Under 9.5mm',
  '9_5': '9.5mm',
  '12_5': '12.5mm',
  double_layer: 'Double layer / over 25mm',
  unknown: 'Unknown',
}

const D14_LABELS: Record<string, string> = {
  visual_only: 'Visual only',
  edge_visible: 'Edge visible',
  inspection_opening: 'Inspection opening',
  intrusive_confirmed: 'Intrusive inspection confirmed',
}

const D15_LABELS: Record<string, string> = {
  none: 'None visible',
  sealed: 'Present but sealed',
  unsealed: 'Unsealed penetrations',
  unknown: 'Unknown',
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  unknown: 'Unknown',
}

const STAIR_RISK_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  elevated: 'Elevated',
  high: 'High',
}

function buildUpperFlatEscapeStrategySummary(
  classification: Classification
): UpperFlatEscapeStrategySummary {
  const {
    shared_escape_route,
    upper_flat_independent_exit,
    upper_independent_escape_type,
    upper_external_escape_viable,
    upper_shared_route_dependency,
  } = classification

  const sharedRouteExists =
    shared_escape_route === 'yes' ? 'Yes'
    : shared_escape_route === 'no' ? 'No'
    : 'Unknown'

  const independentEscape =
    upper_flat_independent_exit === 'yes' ? 'Yes'
    : upper_flat_independent_exit === 'no' ? 'No'
    : 'Unknown'

  const escapeTypeLabels: Record<string, string> = {
    external_steel_stair: 'External steel staircase',
    rear_exit: 'Rear exit / direct external route',
    other: 'Other independent external route',
    none: 'None',
    unknown: 'Unknown',
  }
  const escapeType = escapeTypeLabels[upper_independent_escape_type] ?? 'Unknown'

  const viabilityLabels: Record<string, string> = {
    yes: 'Confirmed viable',
    no: 'Not viable (obstructed, locked, or poor condition)',
    unknown: 'Not confirmed',
  }
  const viability = viabilityLabels[upper_external_escape_viable] ?? 'Unknown'

  const dependencyLabels: Record<string, string> = {
    sole_route: 'Sole escape route — upper flat depends entirely on shared entrance/stair',
    primary_route: 'Primary route — independent escape exists but is unverified',
    secondary_route: 'Secondary route only — independent external exit confirmed viable',
    not_relied_on: 'Not relied upon — no shared communal entrance',
    unknown: 'Unknown',
  }
  const sharedRouteDependency = dependencyLabels[upper_shared_route_dependency] ?? 'Unknown'

  let narrative: string
  if (upper_shared_route_dependency === 'secondary_route') {
    const typeStr =
      upper_independent_escape_type === 'external_steel_stair' ? 'external steel staircase to the rear'
      : upper_independent_escape_type === 'rear_exit' ? 'rear exit / direct external route'
      : 'independent external escape route'
    narrative =
      `The upper flat has a verified ${typeStr}. This reduces reliance on the shared entrance ` +
      'hall and internal staircase as the sole escape route. Shared-route compartmentation ' +
      'remains relevant, but the escape strategy is materially stronger than a single-route ' +
      'upper flat.'
  } else if (upper_shared_route_dependency === 'primary_route') {
    narrative =
      'The upper flat may have an independent external escape route, but it has not been ' +
      'verified as usable. The app has not reduced shared-route risk until this route is ' +
      'confirmed usable. Verify usability, obstruction status, and structural condition on site.'
  } else if (upper_shared_route_dependency === 'sole_route') {
    narrative =
      'The upper flat depends on the shared entrance hall and internal staircase as its sole ' +
      'escape route. Compartmentation and fire door standards for the shared route are directly ' +
      'relevant. Any fire in the communal area significantly compromises this escape route.'
  } else if (upper_shared_route_dependency === 'not_relied_on') {
    narrative =
      'The property has separate individual entrances. The upper flat does not rely on a shared ' +
      'communal entrance hall or staircase.'
  } else {
    narrative =
      'Insufficient information to determine the upper flat escape strategy. Complete Section B ' +
      'of the questionnaire.'
  }

  return {
    shared_route_exists: sharedRouteExists,
    independent_escape: independentEscape,
    escape_type: escapeType,
    viability,
    shared_route_dependency: sharedRouteDependency,
    narrative,
  }
}

function buildStairCompartmentationSummary(
  classification: Classification,
  answers: AnswerMap
): StairCompartmentationSummary {
  if (classification.separate_entrance_mode) {
    return {
      applicable: false,
      construction: 'Not applicable',
      board_thickness: null,
      inspection_confidence: 'Not applicable',
      penetrations: 'Not applicable',
      compartmentation_confidence: 'Not applicable',
      risk_level: 'Not applicable',
    }
  }

  const D10 = answers['D10']?.value as string | undefined
  const D12 = answers['D12']?.value as string | undefined
  const D14 = answers['D14']?.value as string | undefined
  const D15 = answers['D15']?.value as string | undefined

  // D12 is only shown for board-type materials — null when not applicable
  const boardThicknessApplicable =
    D10 === 'plasterboard' || D10 === 'lath_plaster' || D10 === 'mixed' || D10 === 'unknown'

  return {
    applicable: true,
    construction: D10 ? (D10_LABELS[D10] ?? D10) : 'Not assessed',
    board_thickness: boardThicknessApplicable
      ? (D12 ? (D12_LABELS[D12] ?? D12) : 'Not assessed')
      : null,
    inspection_confidence: D14 ? (D14_LABELS[D14] ?? D14) : 'Not assessed',
    penetrations: D15 ? (D15_LABELS[D15] ?? D15) : 'Not assessed',
    compartmentation_confidence:
      CONFIDENCE_LABELS[classification.stair_compartmentation_confidence] ?? 'Unknown',
    risk_level:
      STAIR_RISK_LABELS[classification.stair_compartmentation_risk] ?? 'Unknown',
  }
}
