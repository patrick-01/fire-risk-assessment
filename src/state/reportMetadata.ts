import type {
  Assessment,
  InspectionType,
  PropertyIdentity,
  RemediationStatus,
  ReportMetadata,
  ReportSource,
} from './AppState'

export const REPORT_TITLE = 'Fire Safety Inspection Report'
export const REPORT_VERSION = 'inspection-report-v1'

export const INSPECTION_PURPOSE_TEXT =
  'This report records the findings of a fire safety inspection carried out by the assessor based on the information recorded during the inspection. ' +
  'It is intended to assist the Responsible Person in reviewing fire safety arrangements, recording identified risks, and tracking remedial actions. ' +
  'It is not a statutory compliance certificate or confirmation from the local authority. ' +
  'Where specialist technical issues arise, or where the assessor does not possess the necessary competence in a particular area, appropriate professional advice should be obtained.'

export const DEFAULT_COMPETENCE_STATEMENT =
  'The inspection was completed by the named assessor acting as the Responsible Person, landlord, managing agent, or competent person appointed for the inspection. ' +
  'The assessor has reviewed the applicable property facts, relevant statutory duties and recognised guidance referenced in this report. ' +
  'Where specialist advice, certification or technical verification is required, this is identified within the findings or remediation actions.'

export const DEFAULT_DECLARATION =
  'I confirm that this report accurately records the inspection findings and information available at the date of inspection. ' +
  'The remedial actions listed are based on the applicable legal framework and recognised guidance identified in this report. ' +
  'Where specialist investigation, certification or professional advice is required, this is identified in the relevant action.'

export const REVIEW_FREQUENCY_TEXT =
  'normally 12 months unless significant works, fire incident, tenant change, or material risk change occurs earlier'

export const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  initial: 'Initial',
  '12_month_review': '12-month review',
  follow_up: 'Follow-up',
  post_works_review: 'Post-works review',
}

export const REMEDIATION_STATUS_LABELS: Record<RemediationStatus, string> = {
  outstanding: 'Outstanding',
  in_progress: 'In progress',
  complete: 'Complete',
  not_applicable: 'Not applicable',
  superseded: 'Superseded',
}

export function formatPropertyAddress(property: PropertyIdentity): string {
  return [property.address_line_1, property.address_line_2, property.town, property.postcode_normalised]
    .filter(Boolean)
    .join(', ')
}

export function dateOnly(value: string | null | undefined, fallback = new Date().toISOString()): string {
  const source = value || fallback
  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) return fallback.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return dateOnly(null)
  parsed.setUTCMonth(parsed.getUTCMonth() + months)
  return parsed.toISOString().slice(0, 10)
}

export interface ReportMetadataContext {
  createdAt: string
  reportGeneratedAt: string | null
  rulesVersion: string
  appVersion: string
  existing?: Partial<ReportMetadata>
  sourceOverride?: ReportSource
}

export function normalizeReportMetadataFromContext(context: ReportMetadataContext): ReportMetadata {
  const existing = context.existing
  const reviewCycleMonths = existing?.reviewCycleMonths ?? 12
  const inspectionDate = existing?.inspectionDate ?? dateOnly(context.reportGeneratedAt ?? context.createdAt)

  return {
    inspectionType: existing?.inspectionType ?? 'initial',
    previousInspectionDate: existing?.previousInspectionDate ?? null,
    inspectionDate,
    nextReviewDue: existing?.nextReviewDue ?? addMonths(inspectionDate, reviewCycleMonths),
    reviewCycleMonths,
    source: context.sourceOverride ?? existing?.source ?? 'app',
    assessorName: existing?.assessorName ?? '',
    assessorEmail: existing?.assessorEmail ?? '',
    assessorRole: existing?.assessorRole ?? '',
    organisation: existing?.organisation ?? '',
    responsiblePerson: existing?.responsiblePerson ?? '',
    folderTarget: existing?.folderTarget ?? null,
    storagePath: existing?.storagePath ?? null,
    reportVersion: existing?.reportVersion ?? REPORT_VERSION,
    rulesVersion: context.rulesVersion,
    appVersion: context.appVersion,
    assessorCompetenceStatement: existing?.assessorCompetenceStatement ?? DEFAULT_COMPETENCE_STATEMENT,
    declaration: existing?.declaration ?? DEFAULT_DECLARATION,
    signature: existing?.signature ?? '',
    dateSigned: existing?.dateSigned ?? null,
    remediationTracking: existing?.remediationTracking ?? {},
    reviewHistory: existing?.reviewHistory ?? [],
  }
}

export function normalizeReportMetadata(
  assessment: Assessment,
  sourceOverride?: ReportSource
): ReportMetadata {
  return normalizeReportMetadataFromContext({
    createdAt: assessment.created_at,
    reportGeneratedAt: assessment.report_generated_at,
    rulesVersion: assessment.rules_version,
    appVersion: assessment.app_version,
    existing: assessment.report_metadata,
    sourceOverride,
  })
}

export function withReportMetadata(assessment: Assessment, sourceOverride?: ReportSource): Assessment {
  return {
    ...assessment,
    report_metadata: normalizeReportMetadata(assessment, sourceOverride),
  }
}
