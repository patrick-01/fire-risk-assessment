import type {
  BuildingClassification,
  LegalFrameworkAssessment,
  RemedyScope,
  RiskKnowledge,
  RiskSeverity,
} from '../../state/AppState'

export interface PdfFieldRow {
  label: string
  value: string
}

export interface PdfTextSection {
  title: string
  body: string[]
}

export interface PdfRiskAreaRow {
  area: string
  severity: string
  knowledge_state: string
  factor_count: number
}

export interface PdfActionItem {
  action_reference: string
  action_title: string
  action_text: string
  legal_classification: string
  priority: string
  applies_to: string
  status: string
  target_date: string
  completed_date: string
  evidence_notes: string
  risk_basis: string
  regulatory_refs: string[]
}

export interface PdfReviewHistoryRow {
  inspection_date: string
  inspection_type: string
  assessor: string
  overall_risk: string
  key_outstanding_actions: string
  next_review_due: string
}

export interface PdfDeclaration {
  statement: string
  assessor_name: string
  signature: string
  date_signed: string
  assessor_role: string
  next_review_due: string
}

export interface InspectionReportModel {
  title: 'Fire Safety Inspection Report'
  report_id: string
  report_version: string
  inspection_id: string
  generated_at: string
  app_version: string
  rules_version: string
  rules_date: string
  property: {
    address: string
    unit_reference?: string
    postcode: string
  }
  inspection: {
    inspection_date: string
    inspection_type: string
    report_generated_date: string
    assessor_name: string
    assessor_role: string
    organisation: string
    responsible_person: string
    assessor_email?: string
    review_frequency: string
    review_cycle_months: number
    next_review_due: string
    storage_path?: string
  }
  assessor_competence_statement: string
  scope_and_limitations: string[]
  classification: {
    source: BuildingClassification
    rows: PdfFieldRow[]
    unresolved_reasons: string[]
  }
  legal_framework: {
    source: LegalFrameworkAssessment
    rows: PdfFieldRow[]
  }
  risk_summary: {
    overall_risk: RiskSeverity
    knowledge_state: RiskKnowledge
    areas: PdfRiskAreaRow[]
  }
  area_assessments: PdfTextSection[]
  known_risks: string[]
  potential_risks: string[]
  unknown_risks: string[]
  legal_requirements: PdfActionItem[]
  recommendations: PdfActionItem[]
  further_investigation: PdfActionItem[]
  advisory_items: PdfActionItem[]
  remediation_schedule: PdfActionItem[]
  evidence_and_assumptions: string[]
  review_history: PdfReviewHistoryRow[]
  declaration: PdfDeclaration
  disclaimer: string
}

export type PdfPriority = PdfActionItem['priority']
export type PdfScope = RemedyScope
