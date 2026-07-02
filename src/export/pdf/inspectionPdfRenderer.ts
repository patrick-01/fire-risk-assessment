import type { Color, PDFDocument, PDFFont, PDFPage } from 'pdf-lib'
import type { InspectionReportModel, PdfActionItem, PdfFieldRow, PdfReviewHistoryRow, PdfRiskAreaRow } from './pdfTypes'
import {
  PDF_CONTENT_WIDTH,
  PDF_FONT,
  PDF_FOOTER_Y,
  PDF_LINE,
  PDF_MARGIN,
  PDF_PAGE,
  drawWrappedText,
  pdfSafe,
  textHeight,
} from './pdfLayout'

interface PdfKit {
  PDFDocument: typeof PDFDocument
  StandardFonts: {
    Helvetica: string
    HelveticaBold: string
  }
  rgb: (red: number, green: number, blue: number) => Color
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

interface Theme {
  ink: Color
  muted: Color
  accent: Color
  rule: Color
}

class PdfWriter {
  private page: PDFPage
  private y: number

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly theme: Theme
  ) {
    this.page = this.doc.addPage([PDF_PAGE.width, PDF_PAGE.height])
    this.y = PDF_PAGE.height - PDF_MARGIN
  }

  get currentY(): number {
    return this.y
  }

  addPage() {
    this.page = this.doc.addPage([PDF_PAGE.width, PDF_PAGE.height])
    this.y = PDF_PAGE.height - PDF_MARGIN
  }

  reserve(needed: number) {
    if (this.y - needed < PDF_MARGIN + PDF_FOOTER_Y) this.addPage()
  }

  move(points: number) {
    this.y -= points
  }

  rule() {
    this.reserve(12)
    this.page.drawLine({
      start: { x: PDF_MARGIN, y: this.y },
      end: { x: PDF_PAGE.width - PDF_MARGIN, y: this.y },
      thickness: 0.7,
      color: this.theme.rule,
    })
    this.y -= 12
  }

  text(
    value: string,
    opts: {
      font?: PDFFont
      size?: number
      color?: Color
      width?: number
      x?: number
      gapAfter?: number
      keepWithNext?: number
    } = {}
  ) {
    const font = opts.font ?? this.fonts.regular
    const size = opts.size ?? PDF_FONT.body
    const width = opts.width ?? PDF_CONTENT_WIDTH
    const gapAfter = opts.gapAfter ?? 3
    const needed = textHeight(value || '-', font, size, width, gapAfter) + (opts.keepWithNext ?? 0)
    this.reserve(needed)
    this.y = drawWrappedText(this.page, value || '-', {
      x: opts.x ?? PDF_MARGIN,
      y: this.y,
      width,
      font,
      size,
      color: opts.color ?? this.theme.ink,
    })
    this.y -= gapAfter
  }

  heading(title: string) {
    this.reserve(PDF_FONT.h1 * PDF_LINE + 12)
    this.text(title, {
      font: this.fonts.bold,
      size: PDF_FONT.h1,
      color: this.theme.accent,
      gapAfter: 5,
      keepWithNext: 18,
    })
  }

  subheading(title: string) {
    this.reserve(PDF_FONT.h2 * PDF_LINE + 8)
    this.text(title, {
      font: this.fonts.bold,
      size: PDF_FONT.h2,
      color: this.theme.ink,
      gapAfter: 3,
      keepWithNext: 10,
    })
  }

  fieldRows(rows: PdfFieldRow[], labelWidth = 166) {
    for (const row of rows) {
      const valueWidth = PDF_CONTENT_WIDTH - labelWidth - 10
      const labelHeight = textHeight(row.label, this.fonts.bold, PDF_FONT.body, labelWidth)
      const valueHeight = textHeight(row.value || 'Not recorded', this.fonts.regular, PDF_FONT.body, valueWidth)
      this.reserve(Math.max(labelHeight, valueHeight) + 4)
      const top = this.y
      drawWrappedText(this.page, row.label, {
        x: PDF_MARGIN,
        y: top,
        width: labelWidth,
        font: this.fonts.bold,
        size: PDF_FONT.body,
        color: this.theme.ink,
      })
      const afterValue = drawWrappedText(this.page, row.value || 'Not recorded', {
        x: PDF_MARGIN + labelWidth + 10,
        y: top,
        width: valueWidth,
        font: this.fonts.regular,
        size: PDF_FONT.body,
        color: this.theme.ink,
      })
      this.y = Math.min(top - labelHeight, afterValue) - 4
    }
    this.move(3)
  }

  bulletList(items: string[], emptyText: string) {
    const values = items.length > 0 ? items : [emptyText]
    for (const item of values) {
      this.text(`- ${item.replace(/^-\s*/, '')}`, { gapAfter: 2 })
    }
    this.move(5)
  }

  riskTable(rows: PdfRiskAreaRow[]) {
    const widths = [180, 90, 110, 70]
    this.tableHeader(['Area', 'Severity', 'Knowledge', 'Factors'], widths)
    for (const row of rows) {
      this.tableRow([row.area, row.severity, row.knowledge_state, String(row.factor_count)], widths)
    }
    this.move(8)
  }

  reviewTable(rows: PdfReviewHistoryRow[]) {
    const widths = [58, 70, 78, 50, 176, 65]
    this.tableHeader(['Date', 'Type', 'Assessor', 'Risk', 'Outstanding actions', 'Next due'], widths)
    for (const row of rows) {
      this.tableRow(
        [
          row.inspection_date,
          row.inspection_type,
          row.assessor || '-',
          row.overall_risk,
          row.key_outstanding_actions,
          row.next_review_due,
        ],
        widths
      )
    }
    this.move(8)
  }

  actionBlock(action: PdfActionItem, index?: number) {
    const title = `${index ? `${index}. ` : ''}${action.action_reference} - ${action.action_title}`
    const rows: PdfFieldRow[] = [
      { label: 'Legal classification', value: action.legal_classification },
      { label: 'Priority', value: action.priority },
      { label: 'Applies to', value: action.applies_to },
      { label: 'Status', value: action.status },
      { label: 'Target date', value: action.target_date },
      { label: 'Completed date', value: action.completed_date },
      { label: 'Evidence / notes', value: action.evidence_notes },
    ]
    const estimated =
      textHeight(title, this.fonts.bold, PDF_FONT.h2, PDF_CONTENT_WIDTH) +
      textHeight(action.action_text, this.fonts.regular, PDF_FONT.body, PDF_CONTENT_WIDTH) +
      rows.length * 18 +
      22
    this.reserve(Math.min(estimated, PDF_PAGE.height - PDF_MARGIN * 2 - PDF_FOOTER_Y))
    this.subheading(title)
    this.text(action.action_text, { gapAfter: 5 })
    this.fieldRows(rows, 118)
    if (action.risk_basis) this.text(`Risk basis: ${action.risk_basis}`, { size: PDF_FONT.small, color: this.theme.muted })
    if (action.regulatory_refs.length > 0) {
      this.text(`References: ${action.regulatory_refs.join('; ')}`, { size: PDF_FONT.small, color: this.theme.muted })
    }
    this.move(3)
  }

  private tableHeader(labels: string[], widths: number[]) {
    this.reserve(20)
    const top = this.y
    let x = PDF_MARGIN
    labels.forEach((label, i) => {
      this.page.drawText(pdfSafe(label), {
        x,
        y: top - PDF_FONT.small,
        size: PDF_FONT.small,
        font: this.fonts.bold,
        color: this.theme.accent,
      })
      x += widths[i]
    })
    this.y -= 17
    this.page.drawLine({
      start: { x: PDF_MARGIN, y: this.y + 4 },
      end: { x: PDF_PAGE.width - PDF_MARGIN, y: this.y + 4 },
      thickness: 0.5,
      color: this.theme.rule,
    })
  }

  private tableRow(values: string[], widths: number[]) {
    const heights = values.map((value, i) => textHeight(value || '-', this.fonts.regular, PDF_FONT.small, widths[i] - 8))
    const height = Math.max(...heights) + 6
    this.reserve(height)
    const top = this.y
    let x = PDF_MARGIN
    values.forEach((value, i) => {
      drawWrappedText(this.page, value || '-', {
        x,
        y: top,
        width: widths[i] - 8,
        font: this.fonts.regular,
        size: PDF_FONT.small,
        color: this.theme.ink,
      })
      x += widths[i]
    })
    this.y -= height
  }
}

function inspectionRows(model: InspectionReportModel): PdfFieldRow[] {
  return [
    { label: 'Property address', value: model.property.address },
    { label: 'Unit / building reference', value: model.property.unit_reference ?? '' },
    { label: 'Inspection date', value: model.inspection.inspection_date },
    { label: 'Inspection type', value: model.inspection.inspection_type },
    { label: 'Report generated date', value: model.inspection.report_generated_date },
    { label: 'Assessor name', value: model.inspection.assessor_name },
    { label: 'Assessor role', value: model.inspection.assessor_role },
    { label: 'Organisation', value: model.inspection.organisation },
    { label: 'Responsible person / landlord', value: model.inspection.responsible_person },
    { label: 'Assessor email', value: model.inspection.assessor_email ?? '' },
    { label: 'Review frequency', value: model.inspection.review_frequency },
    { label: 'Review cycle months', value: String(model.inspection.review_cycle_months) },
    { label: 'Next review due', value: model.inspection.next_review_due },
    { label: 'Storage path', value: model.inspection.storage_path ?? '' },
  ]
}

function coverRows(model: InspectionReportModel): PdfFieldRow[] {
  return [
    { label: 'Property', value: model.property.address },
    { label: 'Unit / building reference', value: model.property.unit_reference ?? '' },
    { label: 'Inspection ID', value: model.inspection_id },
    { label: 'Report ID', value: model.report_id },
    { label: 'Report generated', value: model.inspection.report_generated_date },
    { label: 'Rules version', value: model.rules_version },
    { label: 'App version', value: model.app_version },
    { label: 'Overall risk level', value: model.risk_summary.overall_risk },
  ]
}

function renderActionList(writer: PdfWriter, title: string, actions: PdfActionItem[], emptyText: string) {
  writer.heading(title)
  if (actions.length === 0) {
    writer.text(emptyText)
    return
  }
  actions.forEach((action) => writer.actionBlock(action))
}

export async function generateInspectionReportPdf(model: InspectionReportModel): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = (await import('pdf-lib')) as PdfKit
  const doc = await PDFDocument.create()
  doc.setTitle(model.title)
  doc.setCreator('FireRegs Richmond fire-compliance tool')
  doc.setProducer('FireRegs Richmond inspection PDF renderer')
  doc.setCreationDate(new Date(model.generated_at))

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const theme = {
    ink: rgb(0.13, 0.13, 0.13),
    muted: rgb(0.42, 0.42, 0.42),
    accent: rgb(0.66, 0.16, 0.1),
    rule: rgb(0.78, 0.78, 0.78),
  }

  const writer = new PdfWriter(doc, fonts, theme)

  writer.text(model.title, { font: fonts.bold, size: PDF_FONT.title, color: theme.accent, gapAfter: 6 })
  writer.text(
    'Landlord / responsible person inspection record. Not a statutory compliance certificate or confirmation from the local authority.',
    { size: PDF_FONT.body, color: theme.muted, gapAfter: 12 }
  )
  writer.fieldRows(coverRows(model))
  writer.rule()

  writer.heading('Inspection Details')
  writer.fieldRows(inspectionRows(model))

  writer.heading('Assessor Competence Statement')
  writer.text(model.assessor_competence_statement)

  writer.heading('Scope and Limitations')
  writer.bulletList(model.scope_and_limitations, 'No scope notes recorded.')

  writer.heading('Property Classification')
  writer.fieldRows(model.classification.rows)
  writer.bulletList(model.classification.unresolved_reasons, 'No unresolved classification reasons recorded.')

  writer.heading('Applicable Legal Framework')
  writer.fieldRows(model.legal_framework.rows)

  writer.heading('Overall Risk Summary')
  writer.fieldRows([
    { label: 'Overall risk', value: model.risk_summary.overall_risk },
    { label: 'Confidence / knowledge state', value: model.risk_summary.knowledge_state },
  ])
  writer.riskTable(model.risk_summary.areas)

  writer.heading('Area Assessments')
  for (const section of model.area_assessments) {
    writer.subheading(section.title)
    writer.bulletList(section.body, 'No findings recorded for this area.')
  }

  writer.heading('Known Risks')
  writer.bulletList(model.known_risks, 'No known risks were identified.')

  writer.heading('Potential Risks')
  writer.bulletList(model.potential_risks, 'No potential risks were identified.')

  writer.heading('Unknown Risks / Further Investigation')
  writer.bulletList(model.unknown_risks, 'No unknown risks or further-investigation items were identified.')

  renderActionList(writer, 'Legal Requirements', model.legal_requirements, 'No outstanding legal requirements were identified.')
  renderActionList(writer, 'LACORS / Risk-Based Recommendations', model.recommendations, 'No recommendations were identified.')
  renderActionList(writer, 'Advisory / Good Practice', model.advisory_items, 'No advisory items were identified.')

  writer.heading('Remediation Schedule')
  if (model.remediation_schedule.length === 0) {
    writer.text('No remediation items were identified.')
  } else {
    model.remediation_schedule.forEach((action, index) => writer.actionBlock(action, index + 1))
  }

  writer.heading('Evidence and Assumptions')
  writer.bulletList(model.evidence_and_assumptions, 'No outstanding assumptions or evidence notes recorded.')

  writer.heading('Inspection and Review History')
  writer.reviewTable(model.review_history)

  writer.heading('Assessor Declaration and Signature')
  writer.text(model.declaration.statement)
  writer.fieldRows([
    { label: 'Assessor name', value: model.declaration.assessor_name },
    { label: 'Signature', value: model.declaration.signature },
    { label: 'Date signed', value: model.declaration.date_signed },
    { label: 'Role / capacity', value: model.declaration.assessor_role },
    { label: 'Next review due', value: model.declaration.next_review_due },
  ])

  writer.heading('Report Purpose and Limitations')
  writer.text(model.disclaimer)

  const pages = doc.getPages()
  const total = pages.length
  const footer = pdfSafe(`${model.title} - landlord / responsible person inspection record`)
  pages.forEach((page, index) => {
    page.drawText(footer, {
      x: PDF_MARGIN,
      y: PDF_FOOTER_Y,
      size: PDF_FONT.footer,
      font: fonts.regular,
      color: theme.muted,
    })
    const label = `Page ${index + 1} of ${total}`
    const labelWidth = fonts.regular.widthOfTextAtSize(label, PDF_FONT.footer)
    page.drawText(label, {
      x: PDF_PAGE.width - PDF_MARGIN - labelWidth,
      y: PDF_FOOTER_Y,
      size: PDF_FONT.footer,
      font: fonts.regular,
      color: theme.muted,
    })
  })

  return await doc.save()
}
