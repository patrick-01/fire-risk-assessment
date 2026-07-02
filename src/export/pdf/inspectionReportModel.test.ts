import { describe, expect, it } from 'vitest'
import { classify, deriveLegalFramework } from '../../engine/classifier'
import { computeRemediesV2 } from '../../engine/remedyEngine.v2'
import { computeRisk } from '../../engine/riskEngine'
import { generateReportV2 } from '../../engine/reportGenerator.v2'
import { buildInspectionReportModel } from './inspectionReportModel'
import type { AnswerMap, PropertyIdentity, ReportMetadata } from '../../state/AppState'

const PROPERTY: PropertyIdentity = {
  address_line_1: '7 Darell Road',
  address_line_2: 'North Sheen',
  town: 'Richmond',
  postcode: 'TW9 4LF',
  postcode_normalised: 'TW9 4LF',
  flat_ref: '7-7a Darell',
}

function a(value: string) {
  return { value, confidence: 'confirmed' as const, answered_at: '2026-01-01T00:00:00.000Z' }
}

function answers(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    D1: a('hardboard'),
    D10: a('timber_panelling'),
    E1g: a('none'),
    E1u: a('none'),
    F6a: a('yes'),
    G4a: a('yes'),
    G4b: a('no'),
  }
}

function buildReport(metadata?: Partial<ReportMetadata>) {
  const ans = answers()
  const classification = classify(ans)
  const legalFramework = deriveLegalFramework(ans, classification)
  const risk = computeRisk(ans, classification)
  const remedies = computeRemediesV2(ans, classification, risk)
  return generateReportV2(PROPERTY, ans, classification, legalFramework, risk, remedies, metadata)
}

describe('buildInspectionReportModel', () => {
  it('maps the report into a formal inspection report model with required metadata', () => {
    const model = buildInspectionReportModel(buildReport({
      inspectionDate: '2026-04-10',
      inspectionType: 'follow_up',
      assessorName: 'Alex Assessor',
      assessorRole: 'Managing agent',
      organisation: 'Richmond Homes',
      responsiblePerson: 'P. Landlord',
      assessorEmail: 'alex@example.test',
      reviewCycleMonths: 6,
      nextReviewDue: '2026-10-10',
      storagePath: '/FireRegs/7-darell-road/report.pdf',
    }))

    expect(model.title).toBe('Fire Safety Inspection Report')
    expect(model.report_id).toMatch(/^inspection-report-v1-/)
    expect(model.inspection_id).toMatch(/^inspection-/)
    expect(model.property).toEqual({
      address: '7 Darell Road, North Sheen, Richmond, TW9 4LF',
      unit_reference: '7-7a Darell',
      postcode: 'TW9 4LF',
    })
    expect(model.inspection).toMatchObject({
      inspection_date: '2026-04-10',
      inspection_type: 'Follow-up',
      assessor_name: 'Alex Assessor',
      assessor_role: 'Managing agent',
      organisation: 'Richmond Homes',
      responsible_person: 'P. Landlord',
      assessor_email: 'alex@example.test',
      review_cycle_months: 6,
      next_review_due: '2026-10-10',
      storage_path: '/FireRegs/7-darell-road/report.pdf',
    })
  })

  it('orders remediation schedule items by priority and carries tracking fields', () => {
    const report = buildReport({
      remediationTracking: {
        'R-G04': {
          status: 'in_progress',
          targetDate: '2026-05-01',
          completedDate: null,
          evidenceNotes: 'Electrician booked',
        },
      },
    })
    const model = buildInspectionReportModel(report)
    const priorityRank = new Map([
      ['P1 - Urgent', 0],
      ['P2 - High', 1],
      ['P3 - Medium', 2],
      ['P4 - Low', 3],
      ['Investigate', 4],
    ])

    expect(model.remediation_schedule.length).toBeGreaterThan(0)
    expect(model.remediation_schedule.map((item) => priorityRank.get(item.priority) ?? 99)).toEqual(
      [...model.remediation_schedule.map((item) => priorityRank.get(item.priority) ?? 99)].sort((a, b) => a - b)
    )
    const tracked = model.remediation_schedule.find((item) => item.action_reference === 'R-G04')
    expect(tracked).toMatchObject({
      status: 'In progress',
      target_date: '2026-05-01',
      completed_date: '',
      evidence_notes: 'Electrician booked',
    })
  })

  it('does not copy old text-report formatting into formal PDF sections', () => {
    const model = buildInspectionReportModel(buildReport())
    const formalText = [
      ...model.area_assessments.flatMap((section) => section.body),
      ...model.known_risks,
      ...model.potential_risks,
      ...model.unknown_risks,
      ...model.evidence_and_assumptions,
    ].join('\n')

    expect(formalText).not.toContain('Overall for this area:')
    expect(formalText).not.toMatch(/^- \[[^\]]+\]/m)
    expect(formalText).not.toMatch(/^Further investigation required:/m)
  })
})
