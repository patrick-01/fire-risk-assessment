/**
 * pdfReport.ts — renders a ReportV2 into a paginated A4 PDF document.
 *
 * Pure: no React, no DOM, no localStorage. `pdf-lib` is loaded via a dynamic
 * import() so it stays in its own bundle chunk and is only fetched when a user
 * actually exports a PDF. The DOM download trigger lives separately in
 * `localStorageAdapter.downloadPdf()`.
 *
 * The PDF is a document rendering of the same 19-section report model
 * (`generateReportV2`) shown on screen — headings + wrapped body text, with
 * page numbers and a footer. Building type drives the framework, evidence the
 * risk: the model is already framework-neutral, so the PDF inherits that.
 */

import type { Color, PDFFont } from 'pdf-lib'
import type { ReportV2 } from './reportGenerator.v2'
import { REPORT_TITLE } from '../state/reportMetadata'

// A4 portrait, in PDF points (1/72").
const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = 50
const CONTENT_WIDTH = PAGE.width - MARGIN * 2
const FOOTER_Y = 32

const TITLE_SIZE = 18
const HEADING_SIZE = 12
const BODY_SIZE = 10
const META_SIZE = 9
const FOOTER_SIZE = 8
const LINE = 1.36

/**
 * Maps the handful of non-WinAnsi characters the report can contain (em/en
 * dashes, curly quotes, ellipsis, bullet, arrow) to ASCII, and replaces any
 * other non-Latin-1 codepoint with '?' — so the StandardFonts encoder can
 * never fail on a stray character.
 */
function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?')
}

/** Greedy word-wrap to a pixel width, hard-breaking any single over-long token. */
function wrapSegment(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const widthOf = (s: string) => font.widthOfTextAtSize(s, size)
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const trial = line ? `${line} ${word}` : word
    if (widthOf(trial) <= maxWidth) {
      line = trial
      continue
    }
    if (line) {
      out.push(line)
      line = ''
    }
    if (widthOf(word) <= maxWidth) {
      line = word
      continue
    }
    let chunk = ''
    for (const ch of word) {
      if (widthOf(chunk + ch) <= maxWidth) {
        chunk += ch
      } else {
        if (chunk) out.push(chunk)
        chunk = ch
      }
    }
    line = chunk
  }
  if (line) out.push(line)
  return out.length ? out : ['']
}

export async function generateReportPdf(report: ReportV2): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const doc = await PDFDocument.create()
  doc.setTitle(REPORT_TITLE)
  doc.setCreator('FireRegs Richmond fire-compliance tool')
  doc.setProducer('FireRegs Richmond inspection report export')
  doc.setCreationDate(new Date(report.generated_at))

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const ink: Color = rgb(0.13, 0.13, 0.13)
  const muted: Color = rgb(0.42, 0.42, 0.42)
  const accent: Color = rgb(0.66, 0.16, 0.1) // app primary red

  let page = doc.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - MARGIN

  function addPage() {
    page = doc.addPage([PAGE.width, PAGE.height])
    y = PAGE.height - MARGIN
  }

  /** Adds a page break if `needed` points won't fit above the footer. */
  function reserve(needed: number) {
    if (y - needed < MARGIN + FOOTER_Y) addPage()
  }

  function draw(
    text: string,
    opts: { font: PDFFont; size: number; color?: Color; gapAfter?: number }
  ) {
    const lineHeight = opts.size * LINE
    const color = opts.color ?? ink
    for (const segment of pdfSafe(text).split('\n')) {
      for (const lineText of wrapSegment(segment, opts.font, opts.size, CONTENT_WIDTH)) {
        reserve(lineHeight)
        page.drawText(lineText, { x: MARGIN, y: y - opts.size, size: opts.size, font: opts.font, color })
        y -= lineHeight
      }
    }
    if (opts.gapAfter) y -= opts.gapAfter
  }

  // --- Title block ---
  const p = report.property
  const address = [p.address_line_1, p.address_line_2, p.town, p.postcode_normalised].filter(Boolean).join(', ')
  draw(report.title || REPORT_TITLE, { font: bold, size: TITLE_SIZE, color: accent, gapAfter: 4 })
  draw(address + (p.flat_ref ? ` — ${p.flat_ref}` : ''), { font, size: BODY_SIZE, gapAfter: 2 })
  const generated = new Date(report.generated_at).toLocaleDateString('en-GB', { dateStyle: 'long' })
  draw(`Generated: ${generated}  ·  Rules: ${report.rules_version}  ·  App: ${report.app_version}`, {
    font,
    size: META_SIZE,
    color: muted,
    gapAfter: 14,
  })

  // --- Sections ---
  for (const section of report.sections) {
    reserve(HEADING_SIZE * LINE + BODY_SIZE * LINE) // keep heading with at least one body line
    draw(`${section.id}. ${section.title}`, { font: bold, size: HEADING_SIZE, color: accent, gapAfter: 3 })
    draw(section.body.trim() || '—', { font, size: BODY_SIZE, gapAfter: 12 })
  }

  // --- Footer + page numbers (second pass, once page count is known) ---
  const pages = doc.getPages()
  const total = pages.length
  const footerText = pdfSafe(`${REPORT_TITLE} - landlord / responsible person inspection record`)
  pages.forEach((pg, i) => {
    pg.drawText(footerText, { x: MARGIN, y: FOOTER_Y, size: FOOTER_SIZE, font, color: muted })
    const label = `Page ${i + 1} of ${total}`
    const labelWidth = font.widthOfTextAtSize(label, FOOTER_SIZE)
    pg.drawText(label, { x: PAGE.width - MARGIN - labelWidth, y: FOOTER_Y, size: FOOTER_SIZE, font, color: muted })
  })

  return await doc.save()
}
