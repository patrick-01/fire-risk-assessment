/**
 * pdfReport.ts - compatibility entry point for report PDF export.
 *
 * The formal inspection PDF is rendered by `src/export/pdf`. This module keeps
 * the existing engine-facing API stable for `ReportPage` and older tests while
 * ensuring PDF output is generated from a structured inspection report model,
 * not from DOM print styles or plain section text.
 */

import type { ReportV2 } from './reportGenerator.v2'
import { buildInspectionReportModel } from '../export/pdf/inspectionReportModel'
import { generateInspectionReportPdf } from '../export/pdf/inspectionPdfRenderer'

export async function generateReportPdf(report: ReportV2): Promise<Uint8Array> {
  return generateInspectionReportPdf(buildInspectionReportModel(report))
}
