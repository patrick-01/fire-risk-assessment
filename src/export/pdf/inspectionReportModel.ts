import type { ReportV2 } from '../../engine/reportGenerator.v2'
import type {
  InspectionReviewHistoryEntry,
  LegalFrameworkAssessment,
  LegalStatus,
  RemedyPriority,
  RemedyScope,
  RemediationStatus,
  ResolvedRemedy,
  RiskDomain,
  RiskFactor,
  RiskKnowledge,
  RiskSeverity,
} from '../../state/AppState'
import {
  DEFAULT_DECLARATION,
  INSPECTION_PURPOSE_TEXT,
  INSPECTION_TYPE_LABELS,
  REMEDIATION_STATUS_LABELS,
  REVIEW_FREQUENCY_TEXT,
  formatPropertyAddress,
} from '../../state/reportMetadata'
import type {
  InspectionReportModel,
  PdfActionItem,
  PdfFieldRow,
  PdfReviewHistoryRow,
  PdfRiskAreaRow,
  PdfTextSection,
} from './pdfTypes'

const ORIGIN_LABELS = {
  purpose_built_two_flats: 'Purpose-built, two self-contained flats',
  converted_from_single_house: 'Converted from a single dwelling house',
  unknown: 'Not yet established',
} as const

const HMO_LABELS = {
  not_hmo: 'Not a Section 257 HMO',
  section_257_hmo: 'Section 257 HMO (confirmed)',
  probable_section_257_hmo: 'Probable Section 257 HMO',
  unresolved: 'Unresolved - insufficient information',
} as const

const ENTRANCE_LABELS = {
  separate_private_entrances: 'Separate private entrances for each flat',
  shared_entrance_hall: 'Shared entrance hall serving both flats',
  shared_hall_and_shared_stair: 'Shared entrance hall and shared staircase',
  unknown: 'Not yet established',
} as const

const APPLICABILITY_LABELS = {
  applicable: 'Applicable',
  not_applicable: 'Not applicable',
  unknown: 'Not yet established',
} as const

const FRAMEWORK_STATUS_LABELS = {
  applies: 'Applies',
  not_applicable: 'Not applicable',
  unknown: 'To confirm',
} as const

const LACORS_USE_LABELS: Record<LegalFrameworkAssessment['lacors_guidance_use'], string> = {
  direct_benchmark: 'Direct compliance benchmark (Case Study D10 applies)',
  risk_reference: 'Risk-assessment reference only',
  not_applicable: 'Not applicable',
  unknown: 'Not yet established',
}

const DOMAIN_LABELS: Record<RiskDomain, string> = {
  escape: 'Escape routes',
  doors: 'Doors and route protection',
  detection: 'Detection and alarms',
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
  risk_based_recommendation: 'Risk-based recommendation',
  advisory_good_practice: 'Advisory / good practice',
  further_investigation_required: 'Further investigation required',
}

const PRIORITY_LABELS: Record<RemedyPriority, string> = {
  P1_urgent: 'P1 - Urgent',
  P2_high: 'P2 - High',
  P3_medium: 'P3 - Medium',
  P4_low: 'P4 - Low',
  investigate: 'Investigate',
}

const PRIORITY_RANK: Record<RemedyPriority, number> = {
  P1_urgent: 0,
  P2_high: 1,
  P3_medium: 2,
  P4_low: 3,
  investigate: 4,
}

const SCOPE_LABELS: Record<RemedyScope, string> = {
  building: 'Whole building',
  common_parts: 'Common parts',
  ground_flat: 'Ground-floor flat',
  upper_flat: 'Upper-floor flat',
}

const DOMAIN_ORDER: RiskDomain[] = [
  'escape',
  'doors',
  'detection',
  'compartmentation',
  'common_parts',
  'management',
]

function dateOnly(value: string): string {
  return value.slice(0, 10)
}

function optional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function reportId(report: ReportV2): string {
  const postcode = (report.property.postcode_normalised || report.property.postcode || 'unknown')
    .replace(/\s+/g, '')
    .toLowerCase()
  return `${report.report_metadata.reportVersion}-${postcode}-${dateOnly(report.generated_at)}`
}

function inspectionId(report: ReportV2): string {
  const postcode = (report.property.postcode_normalised || report.property.postcode || 'unknown')
    .replace(/\s+/g, '')
    .toLowerCase()
  return `inspection-${postcode}-${report.report_metadata.inspectionDate || dateOnly(report.generated_at)}`
}

function actionItem(report: ReportV2, remedy: ResolvedRemedy): PdfActionItem {
  const tracking = report.report_metadata.remediationTracking[remedy.rule_id]
  const status: RemediationStatus = tracking?.status ?? 'outstanding'
  return {
    action_reference: remedy.rule_id,
    action_title: remedy.title,
    action_text: remedy.text,
    legal_classification: LEGAL_STATUS_LABELS[remedy.legal_status],
    priority: PRIORITY_LABELS[remedy.priority],
    applies_to: SCOPE_LABELS[remedy.applies_to],
    status: REMEDIATION_STATUS_LABELS[status],
    target_date: tracking?.targetDate ?? '',
    completed_date: tracking?.completedDate ?? '',
    evidence_notes: tracking?.evidenceNotes ?? '',
    risk_basis: remedy.risk_basis,
    regulatory_refs: remedy.regulatory_refs,
  }
}

function sortedActions(report: ReportV2, remedies: ResolvedRemedy[]): PdfActionItem[] {
  return [...remedies]
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.rule_id.localeCompare(b.rule_id))
    .map((remedy) => actionItem(report, remedy))
}

function classificationRows(report: ReportV2): PdfFieldRow[] {
  const c = report.classification
  return [
    { label: 'Building origin', value: ORIGIN_LABELS[c.origin] },
    { label: 'HMO / Section 257 status', value: HMO_LABELS[c.hmo] },
    { label: 'Entrance configuration', value: ENTRANCE_LABELS[c.entrance_configuration] },
    { label: 'Common parts present', value: c.fso_common_parts === 'unknown' ? 'Not yet established' : c.fso_common_parts ? 'Yes' : 'No' },
    { label: 'Case Study D10 benchmark', value: APPLICABILITY_LABELS[c.case_study_d10] },
    { label: 'General LACORS guidance', value: APPLICABILITY_LABELS[c.general_lacors_risk_guidance] },
    { label: 'Classification confidence', value: c.confidence },
  ]
}

function legalFrameworkRows(report: ReportV2): PdfFieldRow[] {
  const f = report.legal_framework
  return [
    {
      label: 'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020',
      value: FRAMEWORK_STATUS_LABELS[f.electrical_safety],
    },
    { label: 'HHSRS / Housing Act 2004 fire hazard', value: FRAMEWORK_STATUS_LABELS[f.hhsrs_fire_hazard] },
    { label: 'Smoke and Carbon Monoxide Alarm Regulations', value: FRAMEWORK_STATUS_LABELS[f.smoke_co_alarm_regulations] },
    { label: 'Gas Safety Regulations', value: FRAMEWORK_STATUS_LABELS[f.gas_safety] },
    { label: 'Regulatory Reform (Fire Safety) Order 2005 common parts', value: FRAMEWORK_STATUS_LABELS[f.fire_safety_order_common_parts] },
    { label: 'Housing Act 2004 Section 257', value: FRAMEWORK_STATUS_LABELS[f.section_257_hmo] },
    { label: 'LACORS role', value: LACORS_USE_LABELS[f.lacors_guidance_use] },
  ]
}

function riskRows(report: ReportV2): PdfRiskAreaRow[] {
  return DOMAIN_ORDER.map((domain) => {
    const row = report.risk.domains[domain]
    return {
      area: DOMAIN_LABELS[domain],
      severity: SEVERITY_LABELS[row.severity],
      knowledge_state: KNOWLEDGE_LABELS[row.knowledge],
      factor_count: row.factors.length,
    }
  })
}

function riskFactorLine(factor: RiskFactor): string {
  return `${SEVERITY_LABELS[factor.severity]} ${KNOWLEDGE_LABELS[factor.knowledge].toLowerCase()} risk: ${factor.description}`
}

function factorDescriptions(factors: RiskFactor[], emptyText: string): string[] {
  return factors.length === 0 ? [emptyText] : factors.map(riskFactorLine)
}

function domainSummary(report: ReportV2, domain: RiskDomain, factorFilter?: (factor: RiskFactor) => boolean): string[] {
  const domainRisk = report.risk.domains[domain]
  const factors = report.risk.risk_factors.filter((factor) => factor.domain === domain && (!factorFilter || factorFilter(factor)))
  return [
    `Status: ${SEVERITY_LABELS[domainRisk.severity]} severity; ${KNOWLEDGE_LABELS[domainRisk.knowledge].toLowerCase()} knowledge state.`,
    ...factorDescriptions(factors, 'No specific risk factors recorded for this area.'),
  ]
}

function areaAssessments(report: ReportV2): PdfTextSection[] {
  const c = report.classification
  return [
    {
      title: 'Common parts',
      body: [
        `Entrance configuration: ${ENTRANCE_LABELS[c.entrance_configuration]}.`,
        `Fire Safety Order common-parts duty: ${
          c.fso_common_parts === 'unknown' ? 'not yet confirmed' : c.fso_common_parts ? 'applies' : 'does not apply'
        }.`,
        ...domainSummary(report, 'common_parts'),
      ],
    },
    {
      title: 'Ground-floor flat',
      body: domainSummary(report, 'escape', (factor) => factor.id.includes('-GF-')),
    },
    {
      title: 'Upper-floor flat',
      body: domainSummary(report, 'escape', (factor) => !factor.id.includes('-GF-')),
    },
    {
      title: 'External escape route',
      body: factorDescriptions(
        report.risk.risk_factors.filter((factor) => factor.id.includes('ESC') || factor.id.includes('LOFT-ESCAPE')),
        'No independent external escape route risk factors recorded.'
      ),
    },
    {
      title: 'Door and route protection',
      body: domainSummary(report, 'doors'),
    },
    {
      title: 'Stair compartmentation',
      body: domainSummary(report, 'compartmentation'),
    },
    {
      title: 'Fire detection strategy',
      body: domainSummary(report, 'detection'),
    },
  ]
}

function scopeAndLimitations(report: ReportV2): string[] {
  const lacors =
    report.legal_framework.lacors_guidance_use === 'direct_benchmark'
      ? 'LACORS is used as a direct benchmark for the applicable converted-building case-study guidance.'
      : report.legal_framework.lacors_guidance_use === 'risk_reference'
        ? 'LACORS is used as a risk reference, not as a direct compliance benchmark.'
        : 'The role of LACORS guidance is not fully established from the recorded facts.'
  return [
    'The assessment covers the whole two-flat building and separates findings for common parts, the ground-floor flat, the upper-floor flat, and building-wide duties.',
    lacors,
    'The report records inspection findings and recommended actions. It is not a statutory compliance certificate or confirmation from the local authority.',
  ]
}

function knownRisks(report: ReportV2): string[] {
  return factorDescriptions(
    report.risk.risk_factors.filter((factor) => factor.knowledge === 'known_risk'),
    'No known risks were identified.'
  )
}

function potentialRisks(report: ReportV2): string[] {
  return factorDescriptions(
    report.risk.risk_factors.filter((factor) => factor.knowledge === 'potential_risk'),
    'No potential risks were identified.'
  )
}

function unknownRisks(report: ReportV2): string[] {
  const factors = report.risk.risk_factors
    .filter((factor) => factor.knowledge === 'unknown_risk')
    .map((factor) => `${SEVERITY_LABELS[factor.severity]} unverified risk: ${factor.description}`)
  const investigations = report.remedies.further_investigation.map(
    (remedy) => `${remedy.title}: ${remedy.text} (${SCOPE_LABELS[remedy.applies_to]})`
  )
  const items = [...factors, ...investigations]
  return items.length > 0 ? items : ['No unknown risks or further-investigation items were identified.']
}

function evidenceAndAssumptions(report: ReportV2): string[] {
  const items: string[] = []
  for (const reason of report.classification.unresolved_reasons) {
    items.push(`Classification item requiring confirmation: ${reason}`)
  }
  for (const remedy of report.remedies.further_investigation) {
    items.push(`Verification required before works are specified: ${remedy.title}.`)
  }
  return items.length > 0 ? items : ['No outstanding assumptions or evidence gaps were recorded.']
}

function reviewHistory(report: ReportV2): PdfReviewHistoryRow[] {
  const metadata = report.report_metadata
  const outstanding = report.remedies.remediation_schedule.filter((remedy) => {
    const status = metadata.remediationTracking[remedy.rule_id]?.status ?? 'outstanding'
    return status === 'outstanding' || status === 'in_progress'
  })
  const currentActions =
    outstanding.length === 0
      ? 'None recorded'
      : outstanding.slice(0, 3).map((remedy) => remedy.title).join('; ') + (outstanding.length > 3 ? `; +${outstanding.length - 3} more` : '')
  const fallback: InspectionReviewHistoryEntry = {
    inspectionDate: metadata.inspectionDate,
    inspectionType: metadata.inspectionType,
    assessor: metadata.assessorName,
    overallRisk: report.risk.overall_severity,
    keyOutstandingActions: currentActions,
    nextReviewDue: metadata.nextReviewDue,
  }
  return (metadata.reviewHistory.length > 0 ? metadata.reviewHistory : [fallback]).map((row) => ({
    inspection_date: row.inspectionDate,
    inspection_type: INSPECTION_TYPE_LABELS[row.inspectionType],
    assessor: row.assessor,
    overall_risk: row.overallRisk,
    key_outstanding_actions: row.keyOutstandingActions,
    next_review_due: row.nextReviewDue,
  }))
}

export function buildInspectionReportModel(report: ReportV2): InspectionReportModel {
  const metadata = report.report_metadata
  const address = formatPropertyAddress(report.property)

  return {
    title: 'Fire Safety Inspection Report',
    report_id: reportId(report),
    report_version: metadata.reportVersion,
    inspection_id: inspectionId(report),
    generated_at: report.generated_at,
    app_version: report.app_version,
    rules_version: report.rules_version,
    rules_date: report.rules_date,
    property: {
      address,
      unit_reference: optional(report.property.flat_ref),
      postcode: report.property.postcode_normalised || report.property.postcode,
    },
    inspection: {
      inspection_date: metadata.inspectionDate,
      inspection_type: INSPECTION_TYPE_LABELS[metadata.inspectionType],
      report_generated_date: dateOnly(report.generated_at),
      assessor_name: metadata.assessorName,
      assessor_role: metadata.assessorRole,
      organisation: metadata.organisation,
      responsible_person: metadata.responsiblePerson,
      assessor_email: optional(metadata.assessorEmail),
      review_frequency: REVIEW_FREQUENCY_TEXT,
      review_cycle_months: metadata.reviewCycleMonths,
      next_review_due: metadata.nextReviewDue,
      storage_path: optional(metadata.storagePath),
    },
    assessor_competence_statement: metadata.assessorCompetenceStatement,
    scope_and_limitations: scopeAndLimitations(report),
    classification: {
      source: report.classification,
      rows: classificationRows(report),
      unresolved_reasons: report.classification.unresolved_reasons,
    },
    legal_framework: {
      source: report.legal_framework,
      rows: legalFrameworkRows(report),
    },
    risk_summary: {
      overall_risk: report.risk.overall_severity,
      knowledge_state: report.risk.overall_knowledge,
      areas: riskRows(report),
    },
    area_assessments: areaAssessments(report),
    known_risks: knownRisks(report),
    potential_risks: potentialRisks(report),
    unknown_risks: unknownRisks(report),
    legal_requirements: sortedActions(report, report.remedies.legal_requirements),
    recommendations: sortedActions(report, report.remedies.recommendations),
    further_investigation: sortedActions(report, report.remedies.further_investigation),
    advisory_items: sortedActions(report, report.remedies.advisory),
    remediation_schedule: sortedActions(report, report.remedies.remediation_schedule),
    evidence_and_assumptions: evidenceAndAssumptions(report),
    review_history: reviewHistory(report),
    declaration: {
      statement: metadata.declaration || DEFAULT_DECLARATION,
      assessor_name: metadata.assessorName,
      signature: metadata.signature,
      date_signed: metadata.dateSigned ?? '',
      assessor_role: metadata.assessorRole,
      next_review_due: metadata.nextReviewDue,
    },
    disclaimer: INSPECTION_PURPOSE_TEXT,
  }
}
