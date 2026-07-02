import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { classify, deriveLegalFramework } from '../../engine/classifier'
import { computeRemediesV2 } from '../../engine/remedyEngine.v2'
import { computeRisk } from '../../engine/riskEngine'
import { generateReportV2 } from '../../engine/reportGenerator.v2'
import { buildInspectionReportModel } from './inspectionReportModel'
import { generateInspectionReportPdf } from './inspectionPdfRenderer'
import type { AnswerMap, PropertyIdentity } from '../../state/AppState'

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

function buildModel() {
  const answers: AnswerMap = {
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
  const classification = classify(answers)
  const legalFramework = deriveLegalFramework(answers, classification)
  const risk = computeRisk(answers, classification)
  const remedies = computeRemediesV2(answers, classification, risk)
  return buildInspectionReportModel(
    generateReportV2(PROPERTY, answers, classification, legalFramework, risk, remedies, {
      assessorName: 'Alex Assessor',
      declaration: 'I confirm this inspection record is accurate.',
      signature: 'A. Assessor',
      dateSigned: '2026-04-10',
    })
  )
}

describe('generateInspectionReportPdf', () => {
  it('renders the inspection report model as a loadable titled PDF', async () => {
    const bytes = await generateInspectionReportPdf(buildModel())
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(bytes.length).toBeGreaterThan(2500)

    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getTitle()).toBe('Fire Safety Inspection Report')
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2)
  })
})
