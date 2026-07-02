import type { Color, PDFFont, PDFPage } from 'pdf-lib'

export const PDF_PAGE = { width: 595.28, height: 841.89 } as const
export const PDF_MARGIN = 44
export const PDF_CONTENT_WIDTH = PDF_PAGE.width - PDF_MARGIN * 2
export const PDF_FOOTER_Y = 28

export const PDF_FONT = {
  title: 18,
  h1: 14,
  h2: 11,
  body: 9.5,
  small: 8,
  footer: 7.5,
} as const

export const PDF_LINE = 1.32

export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?')
}

export function wrapSegment(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = pdfSafe(text)
  const widthOf = (s: string) => font.widthOfTextAtSize(s, size)
  const lines: string[] = []
  let line = ''

  for (const word of safe.split(/\s+/)) {
    const trial = line ? `${line} ${word}` : word
    if (widthOf(trial) <= maxWidth) {
      line = trial
      continue
    }
    if (line) {
      lines.push(line)
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
        if (chunk) lines.push(chunk)
        chunk = ch
      }
    }
    line = chunk
  }

  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export function textHeight(text: string, font: PDFFont, size: number, width: number, gapAfter = 0): number {
  const lineHeight = size * PDF_LINE
  return (
    text
      .split('\n')
      .map((segment) => wrapSegment(segment, font, size, width).length)
      .reduce((sum, count) => sum + count * lineHeight, 0) + gapAfter
  )
}

export function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: {
    x: number
    y: number
    width: number
    font: PDFFont
    size: number
    color: Color
  }
): number {
  let y = opts.y
  const lineHeight = opts.size * PDF_LINE
  for (const segment of text.split('\n')) {
    for (const line of wrapSegment(segment, opts.font, opts.size, opts.width)) {
      page.drawText(line, {
        x: opts.x,
        y: y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color,
      })
      y -= lineHeight
    }
  }
  return y
}
