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

function sectionBody(report: ReportV2, title: string): string[] {
  const found = report.sections.find((section) => section.title === title)
  if (!found) return []
  return found.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
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

function areaAssessments(report: ReportV2): PdfTextSection[] {
  const titles = [
    'Common parts assessment',
    'Ground-floor flat assessment',
    'Upper-floor flat assessment',
    'External escape route assessment',
    'Door and route protection assessment',
    'Stair compartmentation assessment',
    'Fire detection strategy',
  ]
  return titles.map((title) => ({ title, body: sectionBody(report, title) }))
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
    scope_and_limitations: sectionBody(report, 'Assessment scope and limitations'),
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
    known_risks: sectionBody(report, 'Known risks'),
    potential_risks: sectionBody(report, 'Potential risks'),
    unknown_risks: sectionBody(report, 'Unknown risks / further investigation'),
    legal_requirements: sortedActions(report, report.remedies.legal_requirements),
    recommendations: sortedActions(report, report.remedies.recommendations),
    further_investigation: sortedActions(report, report.remedies.further_investigation),
    advisory_items: sortedActions(report, report.remedies.advisory),
    remediation_schedule: sortedActions(report, report.remedies.remediation_schedule),
    evidence_and_assumptions: sectionBody(report, 'Evidence and assumptions'),
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
