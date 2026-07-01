/**
 * reportGenerator.v2.ts — Generates the 19-section FireRegs v2 report
 * (docs/6-Report-Refactor.md, §17.1) from the v2 classification, legal
 * framework, risk assessment, and remedy summary.
 *
 * Additive: this module does not replace `reportGenerator.ts`. The v1
 * `generateReport`/`Report` continue to serve `ReportPage.tsx` until Step 7's
 * clean break, when the page is rewired to `classify` -> `computeRisk` ->
 * `computeRemediesV2` -> `generateReportV2`.
 *
 * This module has NO React, NO DOM, NO localStorage.
 *
 * --- §17.1 / §25.7 reconciliation ---
 * §17.1 lists exactly 19 numbered sections, with only ONE section each for
 * "Legal requirements" (15) and "LACORS / risk-based recommendations" (16) —
 * there is no section 1-19 named "Advisory". §25.7 separately requires that
 * statutory requirements, LACORS/risk recommendations, and advisories appear
 * in SEPARATE sections. [Inference] resolved here by keeping section 16's
 * title as written in §17.1, but giving "LACORS / risk-based recommendations"
 * and "Advisory / good practice" their own clearly-labelled, independently
 * tone-worded blocks within that section's body — satisfying both "19
 * sections in order" and "advisories are separated from recommendations" at
 * the sub-section level. Similarly, section 14 ("Unknown risks / further
 * investigation") combines `RiskAssessment` factors with `knowledge ===
 * 'unknown_risk'` and `RemedySummary.further_investigation` remedies, since
 * both represent the same "further investigation required" category.
 */

import type {
  AnswerMap,
  BuildingClassification,
  BuildingOrigin,
  EntranceConfiguration,
  HmoClassification,
  LegalFrameworkAssessment,
  LegalStatus,
  PropertyIdentity,
  RemedyScope,
  RemedySummary,
  ResolvedRemedy,
  RiskAssessment,
  RiskDomainAssessment,
  RiskFactor,
  RiskKnowledge,
  RiskSeverity,
  ComponentStatus,
  StairCompartmentationSummary,
  DetectionStrategySummary,
  ReportMetadata,
  RemediationTracking,
} from '../state/AppState'
import { APP_VERSION } from '../state/AppState'
import { RULES_VERSION_V2, RULES_DATE_V2 } from '../data/rules/remedy-rules.v2'
import { QUESTION_MAP } from '../data/schema/questions'
import { shouldShowQuestion } from './navigator'
import { deriveStairCompartmentation, deriveDetectionStrategy, deriveEscapeStrategy } from './classifier'
import {
  DEFAULT_DECLARATION,
  INSPECTION_PURPOSE_TEXT,
  INSPECTION_TYPE_LABELS,
  REMEDIATION_STATUS_LABELS,
  REPORT_TITLE,
  REVIEW_FREQUENCY_TEXT,
  formatPropertyAddress,
  normalizeReportMetadataFromContext,
} from '../state/reportMetadata'

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface ReportSectionV2 {
  /** 1-19, per §17.1 order. */
  id: number
  title: string
  body: string
}

export interface ReportV2 {
  title: string
  generated_at: string // ISO 8601
  app_version: string
  rules_version: string
  rules_date: string
  report_metadata: ReportMetadata

  property: PropertyIdentity
  classification: BuildingClassification
  legal_framework: LegalFrameworkAssessment
  risk: RiskAssessment
  remedies: RemedySummary

  /** The 19 §17.1 sections, in order. */
  sections: ReportSectionV2[]
}

// ---------------------------------------------------------------------------
// Labels
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
  unresolved: 'Unresolved — insufficient information to classify',
}

const ENTRANCE_LABELS: Record<EntranceConfiguration, string> = {
  separate_private_entrances: 'Separate private entrances for each flat',
  shared_entrance_hall: 'Shared entrance hall serving both flats',
  shared_hall_and_shared_stair: 'Shared entrance hall and shared staircase',
  unknown: 'Not yet established',
}

const LACORS_USE_LABELS: Record<LegalFrameworkAssessment['lacors_guidance_use'], string> = {
  direct_benchmark:
    'a direct compliance benchmark — Case Study D10 and related LACORS guidance apply to this property',
  risk_reference: 'a risk-assessment reference only, not a direct compliance benchmark for this property',
  not_applicable: 'not applicable to this property',
  unknown: 'not yet established',
}

const SCOPE_LABELS: Record<RemedyScope, string> = {
  building: 'Whole building',
  common_parts: 'Common parts',
  ground_flat: 'Ground-floor flat',
  upper_flat: 'Upper-floor flat',
}

/** §17.2 tone — the word a remedy line opens with, by `legal_status`. */
function toneWord(status: LegalStatus): string {
  switch (status) {
    case 'legal_requirement':
      return 'Required'
    case 'lacors_benchmark_recommendation':
    case 'risk_based_recommendation':
      return 'Recommended'
    case 'further_investigation_required':
      return 'Further investigation required'
    case 'advisory_good_practice':
      return 'Advisory'
  }
}

function legalFrameworkLine(name: string, status: 'applies' | 'not_applicable' | 'unknown'): string {
  switch (status) {
    case 'applies':
      return `${name} — Required: applies to this property.`
    case 'not_applicable':
      return `${name} — Not applicable to this property.`
    case 'unknown':
      return `${name} — Further investigation required: applicability not yet confirmed.`
  }
}

// ---------------------------------------------------------------------------
// Risk factor / domain helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<RiskSeverity, number> = { low: 0, normal: 1, elevated: 2, high: 3 }
const KNOWLEDGE_ORDER: Record<RiskKnowledge, number> = { known_risk: 0, potential_risk: 1, unknown_risk: 2 }

function summariseFactors(factors: RiskFactor[]): { severity: RiskSeverity; knowledge: RiskKnowledge } {
  let severity: RiskSeverity = 'low'
  let knowledge: RiskKnowledge = 'known_risk'
  for (const factor of factors) {
    if (SEVERITY_ORDER[factor.severity] > SEVERITY_ORDER[severity]) severity = factor.severity
    if (KNOWLEDGE_ORDER[factor.knowledge] > KNOWLEDGE_ORDER[knowledge]) knowledge = factor.knowledge
  }
  return { severity, knowledge }
}

function listFactors(factors: RiskFactor[], noneText: string): string {
  if (factors.length === 0) return noneText
  return factors.map((factor) => `- [${factor.severity}/${factor.knowledge}] ${factor.description}`).join('\n')
}

function domainOverviewLine(summary: { severity: RiskSeverity; knowledge: RiskKnowledge }): string {
  return `Overall for this area: ${summary.severity} severity, ${summary.knowledge}.`
}

function domainSection(
  id: number,
  title: string,
  intro: string,
  domain: RiskDomainAssessment,
  factors: RiskFactor[],
  noneText: string
): ReportSectionV2 {
  return {
    id,
    title,
    body: [intro, domainOverviewLine(domain), listFactors(factors, noneText)].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Remedy line formatting
// ---------------------------------------------------------------------------

function formatRemedyLine(remedy: ResolvedRemedy): string {
  const refs = remedy.regulatory_refs.length > 0 ? remedy.regulatory_refs.join('; ') : 'none'
  const caseStudyTag = remedy.regulatory_refs.some((ref) => ref.includes('D11'))
    ? 'D11'
    : remedy.regulatory_refs.some((ref) => ref.includes('D10'))
      ? 'D10'
      : 'not case-study-specific'
  return [
    `${toneWord(remedy.legal_status)}: ${remedy.text}`,
    `  Applies to: ${SCOPE_LABELS[remedy.applies_to]}. Priority: ${remedy.priority}. Confidence: ${remedy.confidence}.`,
    `  Risk basis: ${remedy.risk_basis}`,
    `  Regulatory refs: ${refs}`,
    `  Case-study tag: ${caseStudyTag}`,
  ].join('\n')
}

function formatMaybeDate(value: string | null): string {
  return value || ''
}

function formatScheduleLine(remedy: ResolvedRemedy, index: number, tracking?: RemediationTracking): string {
  const status = tracking?.status ?? 'outstanding'
  return [
    `${index + 1}. [${remedy.priority}] (${toneWord(remedy.legal_status)}) ${remedy.title} — ${SCOPE_LABELS[remedy.applies_to]}.`,
    `  Action reference: ${remedy.rule_id}`,
    `  Action: ${remedy.text}`,
    `  Legal classification: ${remedy.legal_status}`,
    `  Priority: ${remedy.priority}`,
    `  Status: ${REMEDIATION_STATUS_LABELS[status]}`,
    `  Target date: ${formatMaybeDate(tracking?.targetDate ?? null)}`,
    `  Completed date: ${formatMaybeDate(tracking?.completedDate ?? null)}`,
    `  Evidence / notes: ${tracking?.evidenceNotes ?? ''}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Sections 1-4 — property, scope, classification, legal framework
// ---------------------------------------------------------------------------

function section1PropertyDetails(property: PropertyIdentity, generatedAt: string): ReportSectionV2 {
  const addressParts = [property.address_line_1, property.address_line_2, property.town, property.postcode_normalised].filter(
    (part): part is string => Boolean(part)
  )
  const lines = [`Address: ${addressParts.join(', ')}`]
  if (property.flat_ref) lines.push(`Unit: ${property.flat_ref}`)
  lines.push(`Report generated: ${generatedAt}`)
  return { id: 1, title: 'Property details', body: lines.join('\n') }
}

function sectionInspectionDetails(
  property: PropertyIdentity,
  generatedAt: string,
  metadata: ReportMetadata
): ReportSectionV2 {
  const lines = [
    `Property address: ${formatPropertyAddress(property)}`,
    `Unit / building reference: ${property.flat_ref ?? ''}`,
    `Inspection date: ${metadata.inspectionDate}`,
    `Report generated date: ${generatedAt.slice(0, 10)}`,
    `Assessor name: ${metadata.assessorName}`,
    `Assessor role: ${metadata.assessorRole}`,
    `Organisation: ${metadata.organisation}`,
    `Responsible person / landlord: ${metadata.responsiblePerson}`,
    `Inspection type: ${INSPECTION_TYPE_LABELS[metadata.inspectionType]}`,
    `Previous inspection date: ${metadata.previousInspectionDate ?? ''}`,
    `Next review due: ${metadata.nextReviewDue}`,
    `Review frequency: ${REVIEW_FREQUENCY_TEXT}`,
    `Review cycle months: ${metadata.reviewCycleMonths}`,
    `Source: ${metadata.source}`,
    `Folder target: ${metadata.folderTarget ?? ''}`,
    `Storage path: ${metadata.storagePath ?? ''}`,
    `Report version: ${metadata.reportVersion}`,
    `Rules version: ${metadata.rulesVersion}`,
    `App version: ${metadata.appVersion}`,
  ]
  return { id: 2, title: 'Inspection details', body: lines.join('\n') }
}

function sectionAssessorCompetence(metadata: ReportMetadata): ReportSectionV2 {
  return {
    id: 3,
    title: 'Assessor competence statement',
    body: metadata.assessorCompetenceStatement,
  }
}

function section2ScopeAndLimitations(answers: AnswerMap): ReportSectionV2 {
  const applicableIds = Object.values(QUESTION_MAP)
    .filter((question) => shouldShowQuestion(question, answers))
    .map((question) => question.id)
  const total = applicableIds.length
  const confirmed = applicableIds.filter((id) => answers[id]?.confidence === 'confirmed').length
  const completeness = total === 0 ? 0 : Math.round((confirmed / total) * 100)

  const body = [
    'This is one assessment of the whole two-flat building, grouped by ground-floor flat, ' +
      'upper-floor flat, common parts and building-wide duties.',
    'How to read this report: LACORS is used either as a direct benchmark where the legal framework ' +
      'supports that, or as a risk-assessment reference. Findings are separated into four practical tiers: ' +
      'legal requirements, LACORS / risk-based recommendations, further investigation, and advisory good practice.',
    'This report is based on the inspection information recorded by the assessor. ' +
      `${confirmed} of ${total} applicable questions (${completeness}%) were answered with confirmed certainty; ` +
      'the remainder are recorded as assumptions or further-investigation items in sections 14 and 18.',
  ].join('\n')

  return { id: 2, title: 'Assessment scope and limitations', body }
}

function section3PropertyClassification(classification: BuildingClassification): ReportSectionV2 {
  const lines = [
    `Building origin: ${ORIGIN_LABELS[classification.origin]}.`,
    `HMO classification: ${HMO_LABELS[classification.hmo]}.`,
    `Section 257 HMO: ${classification.section_257 ? 'Yes' : 'No'}.`,
    `Entrance configuration: ${ENTRANCE_LABELS[classification.entrance_configuration]}.`,
    `Effective storeys for LACORS benchmarking: ${classification.effective_storeys}.`,
    `Case Study D10 stair-enclosure benchmark: ${classification.case_study_d10}.`,
    `Case Study D11 loft / three-storey benchmark: ${classification.case_study_d11}.`,
    `General LACORS risk guidance: ${classification.general_lacors_risk_guidance}.`,
    `Classification confidence: ${classification.confidence}.`,
  ]
  if (classification.unresolved_reasons.length > 0) {
    lines.push('Outstanding questions affecting this classification:')
    for (const reason of classification.unresolved_reasons) lines.push(`- ${reason}`)
  }
  return { id: 3, title: 'Property classification', body: lines.join('\n') }
}

function section4LegalFramework(legalFramework: LegalFrameworkAssessment): ReportSectionV2 {
  const lines = [
    legalFrameworkLine(
      'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020',
      legalFramework.electrical_safety
    ),
    legalFrameworkLine('Housing Health and Safety Rating System — fire hazard (Housing Act 2004)', legalFramework.hhsrs_fire_hazard),
    legalFrameworkLine('Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022', legalFramework.smoke_co_alarm_regulations),
    legalFrameworkLine('Gas Safety (Installation and Use) Regulations 1998', legalFramework.gas_safety),
    legalFrameworkLine('Regulatory Reform (Fire Safety) Order 2005 — common parts', legalFramework.fire_safety_order_common_parts),
    legalFrameworkLine('Housing Act 2004, Section 257 (HMO common parts)', legalFramework.section_257_hmo),
    `LACORS guidance is used as: ${LACORS_USE_LABELS[legalFramework.lacors_guidance_use]}.`,
  ]
  return { id: 4, title: 'Applicable legal framework', body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Sections 5-11 — domain assessments
// ---------------------------------------------------------------------------

function section5CommonParts(classification: BuildingClassification, risk: RiskAssessment): ReportSectionV2 {
  const fsoStatus =
    classification.fso_common_parts === 'unknown'
      ? 'not yet confirmed'
      : classification.fso_common_parts
        ? 'applies'
        : 'does not apply'
  const intro =
    `Entrance configuration: ${ENTRANCE_LABELS[classification.entrance_configuration]}. ` +
    `Fire Safety Order common-parts duty: ${fsoStatus}.`
  const factors = risk.risk_factors.filter((factor) => factor.domain === 'common_parts')
  return domainSection(
    5,
    'Common parts assessment',
    intro,
    risk.domains.common_parts,
    factors,
    'No common-parts risk factors identified.'
  )
}

const GROUND_ESCAPE_FACTOR_IDS = new Set(['RF-GF-C01', 'RF-GF-C03', 'RF-GF-C03-UNK'])
const UPPER_ESCAPE_FACTOR_IDS = new Set(['RF-C01', 'RF-C02', 'RF-C03', 'RF-C04', 'RF-C05', 'RF-B01', 'RF-LOFT-ESCAPE'])

const ESCAPE_ROUTE_LABELS: Record<string, string> = {
  direct_or_rear_exit: 'direct / rear exit available',
  protected_route: 'protected or shared route relied upon',
  window_dependent: 'window-dependent if the front/shared route is blocked',
  external_escape: 'verified independent external escape route',
  unverified_external_escape: 'claimed external escape route not yet verified',
  unknown: 'not yet established',
}

function section6GroundFloorFlat(
  classification: BuildingClassification,
  risk: RiskAssessment,
  answers: AnswerMap
): ReportSectionV2 {
  const escape = deriveEscapeStrategy(answers, classification).ground_flat
  const intro =
    'The ground-floor flat is assessed for its entrance door and, where no rear/direct exit exists, ' +
    'its bedroom escape-window and inner-room position.'
  const escapeLines = [
    `Escape strategy: ${ESCAPE_ROUTE_LABELS[escape.route]}.`,
    `Bedroom 1 escape window: ${escape.bedroom_1_window}.`,
    `Bedroom 2 escape window: ${escape.bedroom_2_window}.`,
    `Bedroom inner-room condition: ${escape.inner_room}.`,
  ].join('\n')
  const factors = risk.risk_factors.filter(
    (factor) =>
      (factor.domain === 'doors' && factor.id.includes('-GF-')) ||
      GROUND_ESCAPE_FACTOR_IDS.has(factor.id)
  )
  const summary = summariseFactors(factors)
  return {
    id: 6,
    title: 'Ground-floor flat assessment',
    body: [intro, escapeLines, domainOverviewLine(summary), listFactors(factors, 'No ground-floor-flat-specific risk factors identified.')].join(
      '\n'
    ),
  }
}

function section7UpperFloorFlat(
  classification: BuildingClassification,
  risk: RiskAssessment,
  answers: AnswerMap
): ReportSectionV2 {
  const escape = deriveEscapeStrategy(answers, classification).upper_flat
  const intro =
    'The upper-floor flat depends on its entrance door and, where no independent escape route ' +
    'exists, the shared staircase or hall for escape.'
  const escapeLines = [
    `Escape strategy: ${ESCAPE_ROUTE_LABELS[escape.route]}.`,
    `Bedroom 1 escape window: ${escape.bedroom_1_window}.`,
    `Bedroom 2 escape window: ${escape.bedroom_2_window}.`,
    `Bedroom inner-room condition: ${escape.inner_room}.`,
    `Relevant LACORS case-study benchmark: ${deriveEscapeStrategy(answers, classification).benchmark_case_study}.`,
  ].join('\n')
  const doorFactors = risk.risk_factors.filter((factor) => factor.domain === 'doors' && factor.id.includes('-UF-'))
  const escapeFactors = risk.risk_factors.filter((factor) => UPPER_ESCAPE_FACTOR_IDS.has(factor.id))
  const factors = [...doorFactors, ...escapeFactors]
  const summary = summariseFactors(factors)
  return {
    id: 7,
    title: 'Upper-floor flat assessment',
    body: [intro, escapeLines, domainOverviewLine(summary), listFactors(factors, 'No upper-floor-flat-specific risk factors identified.')].join(
      '\n'
    ),
  }
}

const EXTERNAL_ESCAPE_FACTOR_IDS = new Set([
  'RF-ESC-VERIFY',
  'RF-ESC-RESTORE',
  'RF-ESC-WEATHER',
  'RF-ESC-WEATHER-UNK',
  'RF-B01',
  'RF-C01',
])

function section8ExternalEscapeRoute(classification: BuildingClassification, risk: RiskAssessment): ReportSectionV2 {
  const intro =
    classification.entrance_configuration === 'separate_private_entrances'
      ? 'Each flat has its own private entrance; this section covers any additional independent escape routes.'
      : 'This section covers any independent escape route serving the upper-floor flat, alongside the shared route.'
  const factors = risk.risk_factors.filter((factor) => EXTERNAL_ESCAPE_FACTOR_IDS.has(factor.id))
  const summary = summariseFactors(factors)
  return {
    id: 8,
    title: 'External escape route assessment',
    body: [intro, domainOverviewLine(summary), listFactors(factors, 'No independent external escape route risk factors identified.')].join(
      '\n'
    ),
  }
}

function section9DoorsAndRouteProtection(risk: RiskAssessment): ReportSectionV2 {
  const intro = 'Assessment of all flat entrance doors, the building final exit door, and internal escape-route doors.'
  const factors = risk.risk_factors.filter((factor) => factor.domain === 'doors')
  return domainSection(9, 'Door and route protection assessment', intro, risk.domains.doors, factors, 'No door or route-protection risk factors identified.')
}

const COMPONENT_LABELS: Record<ComponentStatus, string> = {
  adequate: 'appears adequate',
  weak: 'weak / below benchmark',
  uncertain: 'not confirmed',
  none: 'none present',
  not_assessed: 'not assessed',
}

const WEAKEST_COMPONENT_LABELS: Record<StairCompartmentationSummary['weakest_component'], string> = {
  upper_enclosure: 'the upper stair enclosure',
  lower_route: 'the lower / ground-floor section of the route',
  under_stairs_cupboard: 'the under-stairs cupboard',
  none_identified: 'no single weak component identified',
  unknown: 'not yet established',
}

function section10StairCompartmentation(
  classification: BuildingClassification,
  risk: RiskAssessment,
  answers: AnswerMap
): ReportSectionV2 {
  if (classification.entrance_configuration === 'separate_private_entrances') {
    return {
      id: 10,
      title: 'Stair compartmentation assessment',
      body: 'Not applicable — this property has separate private entrances and no shared staircase.',
    }
  }

  const sc = deriveStairCompartmentation(answers)
  const insulationText =
    sc.insulation === 'mineral_wool'
      ? 'mineral wool / Rockwool present (supporting evidence only — not proof of fire resistance)'
      : sc.insulation === 'none'
        ? 'none'
        : sc.insulation === 'not_applicable'
          ? 'not applicable'
          : 'not confirmed'

  const summary = [
    'The protected route is assessed by component (LACORS §19.4 requires 30-minute fire resistance ' +
      'at all points, so it is not treated as a single material):',
    `- Upper stair enclosure: ${COMPONENT_LABELS[sc.upper_stair_enclosure]}.`,
    `- Lower / ground-floor section: ${COMPONENT_LABELS[sc.lower_route_enclosure]}.`,
    `- Under-stairs cupboard: ${COMPONENT_LABELS[sc.under_stairs_cupboard]}.`,
    `- Stud-void insulation: ${insulationText}.`,
    `Weakest assessed component: ${WEAKEST_COMPONENT_LABELS[sc.weakest_component]}. ` +
      `Inspection confidence: ${sc.confidence}.` +
      (sc.investigation_required
        ? ' Further investigation is recommended before relying on the compartmentation.'
        : ''),
  ].join('\n')

  const factors = risk.risk_factors.filter((factor) => factor.domain === 'compartmentation')
  return {
    id: 10,
    title: 'Stair compartmentation assessment',
    body: [
      summary,
      domainOverviewLine(risk.domains.compartmentation),
      listFactors(factors, 'No stair-compartmentation risk factors identified.'),
    ].join('\n'),
  }
}

const DETECTION_GRADE_LABELS: Record<DetectionStrategySummary['common_parts'], string> = {
  mains: 'mains-wired (Grade D)',
  battery: 'battery-only (Grade F)',
  none: 'none',
  not_applicable: 'not applicable',
  unknown: 'not confirmed',
}

const INTERLINK_LABELS: Record<string, string> = {
  both: 'both flats',
  partial: 'one flat / via common parts only',
  neither: 'neither flat',
  yes: 'yes',
  no: 'no',
  not_applicable: 'not applicable',
  unknown: 'not confirmed',
}

function section11AlarmAndDetection(
  classification: BuildingClassification,
  risk: RiskAssessment,
  answers: AnswerMap
): ReportSectionV2 {
  const ds = deriveDetectionStrategy(answers, classification)
  const lines = [
    'Detection is assessed per scope (LACORS §22 / Case Study D10 expects a mixed system, not a ' +
      'single building-wide grade):',
    `- Common parts: ${DETECTION_GRADE_LABELS[ds.common_parts]}.`,
    `- Ground-floor flat (hallway smoke): ${DETECTION_GRADE_LABELS[ds.ground_flat]}.`,
    `- Upper flat (hallway smoke): ${DETECTION_GRADE_LABELS[ds.upper_flat]}.`,
    `- Interlinking within flats: ${INTERLINK_LABELS[ds.within_flat_interlink]}.`,
    `- Cross-flat / common-parts interlinking: ${INTERLINK_LABELS[ds.cross_or_common_interlink]} ` +
      '(reported for information — cross-flat interlinking is not a blanket LACORS requirement).',
    ds.mixed_provision
      ? 'Provision is MIXED between the flats — the building must not be assessed as having a single uniform alarm grade.'
      : '',
  ].filter(Boolean)

  const factors = risk.risk_factors.filter((factor) => factor.domain === 'detection')
  return {
    id: 11,
    title: 'Fire detection strategy',
    body: [
      lines.join('\n'),
      domainOverviewLine(risk.domains.detection),
      listFactors(factors, 'No alarm or detection risk factors identified.'),
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Sections 12-14 — known / potential / unknown risks
// ---------------------------------------------------------------------------

function section12KnownRisks(risk: RiskAssessment): ReportSectionV2 {
  const factors = risk.risk_factors.filter((factor) => factor.knowledge === 'known_risk')
  return { id: 12, title: 'Known risks', body: listFactors(factors, 'No known risks were identified.') }
}

function section13PotentialRisks(risk: RiskAssessment): ReportSectionV2 {
  const factors = risk.risk_factors.filter((factor) => factor.knowledge === 'potential_risk')
  return { id: 13, title: 'Potential risks', body: listFactors(factors, 'No potential risks were identified.') }
}

function section14UnknownRisks(risk: RiskAssessment, remedies: RemedySummary): ReportSectionV2 {
  const unknownFactors = risk.risk_factors.filter((factor) => factor.knowledge === 'unknown_risk')
  const lines: string[] = []
  for (const factor of unknownFactors) {
    lines.push(`Further investigation required: [${factor.severity}] ${factor.description}`)
  }
  for (const remedy of remedies.further_investigation) {
    lines.push(`Further investigation required: ${remedy.text} (${SCOPE_LABELS[remedy.applies_to]})`)
  }
  if (lines.length === 0) {
    lines.push('No unknown risks or further-investigation items were identified.')
  }
  return { id: 14, title: 'Unknown risks / further investigation', body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Sections 15-17 — legal requirements, recommendations, remediation schedule
// ---------------------------------------------------------------------------

function section15LegalRequirements(remedies: RemedySummary): ReportSectionV2 {
  const body =
    remedies.legal_requirements.length === 0
      ? 'No outstanding legal requirements were identified.'
      : remedies.legal_requirements.map(formatRemedyLine).join('\n\n')
  return { id: 15, title: 'Legal requirements', body }
}

function section16Recommendations(remedies: RemedySummary): ReportSectionV2 {
  const lines: string[] = ['LACORS / risk-based recommendations:']
  lines.push(remedies.recommendations.length === 0 ? 'None.' : remedies.recommendations.map(formatRemedyLine).join('\n\n'))
  lines.push('')
  lines.push('Advisory / good practice (separate from the recommendations above):')
  lines.push(remedies.advisory.length === 0 ? 'None.' : remedies.advisory.map(formatRemedyLine).join('\n\n'))
  return { id: 16, title: 'LACORS / risk-based recommendations', body: lines.join('\n') }
}

function section17RemediationSchedule(remedies: RemedySummary, metadata: ReportMetadata): ReportSectionV2 {
  const body =
    remedies.remediation_schedule.length === 0
      ? 'No remediation items were identified.'
      : [
          'Action reference | Action | Legal classification | Priority | Status | Target date | Completed date | Evidence / notes',
          remedies.remediation_schedule
            .map((remedy, index) => formatScheduleLine(remedy, index, metadata.remediationTracking[remedy.rule_id]))
            .join('\n\n'),
        ].join('\n') +
        '\n\nSee sections 15 and 16 for full detail on each item.'
  return { id: 17, title: 'Remediation schedule', body }
}

// ---------------------------------------------------------------------------
// Sections 18-19 — evidence/assumptions, disclaimer
// ---------------------------------------------------------------------------

function section18EvidenceAndAssumptions(classification: BuildingClassification, remedies: RemedySummary): ReportSectionV2 {
  const lines: string[] = []
  if (classification.unresolved_reasons.length > 0) {
    lines.push('Assumptions affecting the property classification above:')
    for (const reason of classification.unresolved_reasons) lines.push(`- Assumption: ${reason}`)
  } else {
    lines.push('No outstanding classification assumptions were recorded.')
  }
  if (remedies.further_investigation.length > 0) {
    lines.push(
      'Items recorded in section 14 as "Further investigation required" should be resolved by a ' +
        'competent person before relying on the recommendations in sections 15-17.'
    )
  }
  return { id: 18, title: 'Evidence and assumptions', body: lines.join('\n') }
}

function sectionInspectionReviewHistory(
  metadata: ReportMetadata,
  risk: RiskAssessment,
  remedies: RemedySummary
): ReportSectionV2 {
  const outstanding = remedies.remediation_schedule.filter((remedy) => {
    const status = metadata.remediationTracking[remedy.rule_id]?.status ?? 'outstanding'
    return status === 'outstanding' || status === 'in_progress'
  })
  const currentActions =
    outstanding.length === 0
      ? 'None recorded'
      : outstanding.slice(0, 3).map((remedy) => remedy.title).join('; ') + (outstanding.length > 3 ? `; +${outstanding.length - 3} more` : '')
  const currentRow = {
    inspectionDate: metadata.inspectionDate,
    inspectionType: metadata.inspectionType,
    assessor: metadata.assessorName,
    overallRisk: risk.overall_severity,
    keyOutstandingActions: currentActions,
    nextReviewDue: metadata.nextReviewDue,
  }
  const rows = metadata.reviewHistory.length > 0 ? metadata.reviewHistory : [currentRow]
  const body = [
    'Inspection date | Inspection type | Assessor | Overall risk | Key outstanding actions | Next review due',
    ...rows.map((row) =>
      [
        row.inspectionDate,
        INSPECTION_TYPE_LABELS[row.inspectionType],
        row.assessor,
        row.overallRisk,
        row.keyOutstandingActions,
        row.nextReviewDue,
      ].join(' | ')
    ),
  ].join('\n')
  return { id: 19, title: 'Inspection and review history', body }
}

function sectionAssessorDeclaration(metadata: ReportMetadata): ReportSectionV2 {
  const lines = [
    metadata.declaration || DEFAULT_DECLARATION,
    '',
    `Assessor name: ${metadata.assessorName}`,
    `Signature: ${metadata.signature}`,
    `Date signed: ${metadata.dateSigned ?? ''}`,
    `Role / capacity: ${metadata.assessorRole}`,
    `Next review due: ${metadata.nextReviewDue}`,
  ]
  return { id: 20, title: 'Assessor declaration and signature', body: lines.join('\n') }
}

function sectionReportPurposeAndLimitations(): ReportSectionV2 {
  return { id: 21, title: 'Report purpose and limitations', body: INSPECTION_PURPOSE_TEXT }
}

function renumberSections(sections: ReportSectionV2[]): ReportSectionV2[] {
  return sections.map((section, index) => ({ ...section, id: index + 1 }))
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generates the 19-section v2 report (§17.1) from the v2 classification,
 * legal framework, risk assessment, and remedy summary.
 */
export function generateReportV2(
  property: PropertyIdentity,
  answers: AnswerMap,
  classification: BuildingClassification,
  legalFramework: LegalFrameworkAssessment,
  risk: RiskAssessment,
  remedies: RemedySummary,
  reportMetadata?: Partial<ReportMetadata>
): ReportV2 {
  const generatedAt = new Date().toISOString()
  const metadata = normalizeReportMetadataFromContext({
    createdAt: generatedAt,
    reportGeneratedAt: generatedAt,
    rulesVersion: RULES_VERSION_V2,
    appVersion: APP_VERSION,
    existing: reportMetadata,
  })

  const sections: ReportSectionV2[] = renumberSections([
    section1PropertyDetails(property, generatedAt),
    sectionInspectionDetails(property, generatedAt, metadata),
    sectionAssessorCompetence(metadata),
    section2ScopeAndLimitations(answers),
    section3PropertyClassification(classification),
    section4LegalFramework(legalFramework),
    section5CommonParts(classification, risk),
    section6GroundFloorFlat(classification, risk, answers),
    section7UpperFloorFlat(classification, risk, answers),
    section8ExternalEscapeRoute(classification, risk),
    section9DoorsAndRouteProtection(risk),
    section10StairCompartmentation(classification, risk, answers),
    section11AlarmAndDetection(classification, risk, answers),
    section12KnownRisks(risk),
    section13PotentialRisks(risk),
    section14UnknownRisks(risk, remedies),
    section15LegalRequirements(remedies),
    section16Recommendations(remedies),
    section17RemediationSchedule(remedies, metadata),
    section18EvidenceAndAssumptions(classification, remedies),
    sectionInspectionReviewHistory(metadata, risk, remedies),
    sectionAssessorDeclaration(metadata),
    sectionReportPurposeAndLimitations(),
  ])

  return {
    title: REPORT_TITLE,
    generated_at: generatedAt,
    app_version: APP_VERSION,
    rules_version: RULES_VERSION_V2,
    rules_date: RULES_DATE_V2,
    report_metadata: metadata,
    property,
    classification,
    legal_framework: legalFramework,
    risk,
    remedies,
    sections,
  }
}
