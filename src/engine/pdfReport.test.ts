/**
 * pdfReport.test.ts — verifies the report PDF generator produces a valid,
 * paginated PDF without throwing on the report's punctuation.
 *
 * Pure test: no DOM. Drives the full v2 pipeline to build a realistic report,
 * then renders it to PDF and inspects the bytes.
 */

import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { classify, deriveLegalFramework } from './classifier'
import { computeRisk } from './riskEngine'
import { computeRemediesV2 } from './remedyEngine.v2'
import { generateReportV2 } from './reportGenerator.v2'
import { generateReportPdf } from './pdfReport'
import type { AnswerMap, PropertyIdentity } from '../state/AppState'

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

/** A rich converted scenario — exercises many sections, plus "—" / "§" / bullets in the body. */
function answers(): AnswerMap {
  return {
    A1: a('converted'),
    A2: a('yes'),
    A3: a('2'),
    A4: a('none_owner_occupied'),
    A5: a('yes'),
    B1: a('communal'),
    F6a: a('yes'),
    D1: a('hardboard'),
    D10: a('timber_panelling'),
    E1g: a('none'), E1u: a('none'),
    G4a: a('yes'),
    G4b: a('no'),
  }
}

function buildReport(ans: AnswerMap) {
  const classification = classify(ans)
  const legalFramework = deriveLegalFramework(ans, classification)
  const risk = computeRisk(ans, classification)
  const remedies = computeRemediesV2(ans, classification, risk)
  return generateReportV2(PROPERTY, ans, classification, legalFramework, risk, remedies)
}

describe('generateReportPdf', () => {
  it('produces a non-trivial PDF with the %PDF- magic header', async () => {
    const bytes = await generateReportPdf(buildReport(answers()))
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(1500)
    // "%PDF-"
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d])
  })

  it('is loadable, titled, and paginates the 19-section report onto multiple pages', async () => {
    const loaded = await PDFDocument.load(await generateReportPdf(buildReport(answers())))
    expect(loaded.getTitle()).toBe('Fire Safety Assessment Report')
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2)
  })

  it('does not throw on report text containing em dashes, section signs and bullets', async () => {
    await expect(generateReportPdf(buildReport(answers()))).resolves.toBeInstanceOf(Uint8Array)
  })

  it('renders even a minimal (empty-answers) report', async () => {
    const bytes = await generateReportPdf(buildReport({}))
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
