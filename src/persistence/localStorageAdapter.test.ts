/**
 * localStorageAdapter.test.ts — Unit tests for import/export/share functions.
 *
 * Tests only the pure functions: importAssessmentJson, exportAssessmentJson,
 * encodeAssessmentForUrl, decodeAssessmentFromUrl.
 *
 * downloadAssessmentJson requires DOM APIs and is not tested here.
 */

import { describe, it, expect } from 'vitest'
import {
  importAssessmentJson,
  exportAssessmentJson,
  encodeAssessmentForUrl,
  decodeAssessmentFromUrl,
  isShareLinkSupported,
  isIncompatibleAssessment,
} from './localStorageAdapter'
import { SCHEMA_VERSION } from '../state/AppState'
import type { Assessment, AssessmentIndexEntry } from '../state/AppState'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    schema_version: SCHEMA_VERSION,
    rules_version: 'test-v1',
    app_version: '0.1.0',
    assessment_id: 'original-id-abc',
    created_at: '2026-01-01T00:00:00.000Z',
    last_edited_at: '2026-01-02T00:00:00.000Z',
    property: {
      address_line_1: '1 Test Street',
      address_line_2: null,
      town: 'Richmond',
      postcode: 'TW9 4HA',
      postcode_normalised: 'TW9 4HA',
      flat_ref: null,
    },
    current_section: 'building',
    current_question_id: 'A1',
    answers: {
      A1: {
        value: 'converted',
        confidence: 'confirmed',
        answered_at: '2026-01-01T00:00:00.000Z',
      },
    },
    invalidated_answers: {},
    classification: {
      origin: 'unknown',
      hmo: 'unresolved',
      section_257: false,
      case_study_d10: 'unknown',
      case_study_d11: 'unknown',
      effective_storeys: 'unknown',
      general_lacors_risk_guidance: 'applicable',
      fso_common_parts: 'unknown',
      entrance_configuration: 'unknown',
      confidence: 'unresolved',
      unresolved_reasons: ['Test'],
    },
    report_generated_at: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// exportAssessmentJson
// ---------------------------------------------------------------------------

describe('exportAssessmentJson', () => {
  it('returns a parseable JSON string', () => {
    const assessment = makeAssessment()
    const json = exportAssessmentJson(assessment)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('returned JSON includes all top-level assessment fields', () => {
    const assessment = makeAssessment()
    const json = exportAssessmentJson(assessment)
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.schema_version).toBe(SCHEMA_VERSION)
    expect(parsed.assessment_id).toBe('original-id-abc')
    expect(parsed.answers).toBeDefined()
    expect(parsed.classification).toBeDefined()
    expect(parsed.report_metadata).toBeDefined()
  })

  it('adds default inspection metadata to schema-compatible exports that do not yet have it', () => {
    const json = exportAssessmentJson(makeAssessment())
    const parsed = JSON.parse(json) as {
      report_metadata?: {
        inspectionType?: string
        source?: string
        reviewCycleMonths?: number
        nextReviewDue?: string
        reportVersion?: string
        rulesVersion?: string
        appVersion?: string
      }
    }

    expect(parsed.report_metadata?.inspectionType).toBe('initial')
    expect(parsed.report_metadata?.source).toBe('app')
    expect(parsed.report_metadata?.reviewCycleMonths).toBe(12)
    expect(parsed.report_metadata?.nextReviewDue).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(parsed.report_metadata?.reportVersion).toBeDefined()
    expect(parsed.report_metadata?.rulesVersion).toBeDefined()
    expect(parsed.report_metadata?.appVersion).toBeDefined()
  })

  it('is pretty-printed (contains newlines)', () => {
    const assessment = makeAssessment()
    const json = exportAssessmentJson(assessment)
    expect(json).toContain('\n')
  })
})

// ---------------------------------------------------------------------------
// importAssessmentJson
// ---------------------------------------------------------------------------

describe('importAssessmentJson — valid input', () => {
  it('accepts a valid assessment JSON and returns an Assessment', () => {
    const assessment = makeAssessment()
    const json = JSON.stringify(assessment)
    const result = importAssessmentJson(json)
    expect(result).toBeDefined()
    expect(result.schema_version).toBe(SCHEMA_VERSION)
  })

  it('assigns a new assessment_id (does not reuse the original)', () => {
    const assessment = makeAssessment()
    const json = JSON.stringify(assessment)
    const result = importAssessmentJson(json)
    expect(result.assessment_id).not.toBe('original-id-abc')
    expect(result.assessment_id.length).toBeGreaterThan(0)
  })

  it('preserves all other fields from the original', () => {
    const assessment = makeAssessment()
    const json = JSON.stringify(assessment)
    const result = importAssessmentJson(json)
    expect(result.schema_version).toBe(assessment.schema_version)
    expect(result.rules_version).toBe(assessment.rules_version)
    expect(result.property.address_line_1).toBe('1 Test Street')
    expect(result.answers['A1']?.value).toBe('converted')
  })

  it('defaults imported assessment metadata and marks the source as imported_json', () => {
    const result = importAssessmentJson(JSON.stringify(makeAssessment()))

    expect(result.report_metadata?.inspectionType).toBe('initial')
    expect(result.report_metadata?.source).toBe('imported_json')
    expect(result.report_metadata?.reviewCycleMonths).toBe(12)
    expect(result.report_metadata?.nextReviewDue).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('generates a unique ID each time it is called', () => {
    const json = JSON.stringify(makeAssessment())
    const r1 = importAssessmentJson(json)
    const r2 = importAssessmentJson(json)
    expect(r1.assessment_id).not.toBe(r2.assessment_id)
  })
})

describe('importAssessmentJson — invalid input', () => {
  it('throws on malformed JSON', () => {
    expect(() => importAssessmentJson('not json {')).toThrow()
    expect(() => importAssessmentJson('not json {')).toThrow(/valid JSON/i)
  })

  it('throws on JSON array (not an object)', () => {
    expect(() => importAssessmentJson('[]')).toThrow()
  })

  it('throws when schema_version is missing', () => {
    const assessment = makeAssessment()
    const { schema_version: _sv, ...withoutVersion } = assessment
    expect(() => importAssessmentJson(JSON.stringify(withoutVersion))).toThrow()
  })

  it('throws when answers field is missing', () => {
    const assessment = makeAssessment()
    const { answers: _a, ...withoutAnswers } = assessment
    expect(() => importAssessmentJson(JSON.stringify(withoutAnswers))).toThrow()
  })

  it('throws when property field is missing', () => {
    const assessment = makeAssessment()
    const { property: _p, ...withoutProperty } = assessment
    expect(() => importAssessmentJson(JSON.stringify(withoutProperty))).toThrow()
  })

  it('throws when assessment_id is missing', () => {
    const assessment = makeAssessment()
    const { assessment_id: _id, ...withoutId } = assessment
    expect(() => importAssessmentJson(JSON.stringify(withoutId))).toThrow()
  })

  it('throws with a user-readable message on schema version mismatch', () => {
    const assessment = makeAssessment({ schema_version: '0.1' as typeof SCHEMA_VERSION })
    expect(() => importAssessmentJson(JSON.stringify(assessment))).toThrow(/schema version/i)
  })

  it('schema version mismatch message offers to start a new v2 assessment', () => {
    const assessment = makeAssessment({ schema_version: '1.2' as typeof SCHEMA_VERSION })
    expect(() => importAssessmentJson(JSON.stringify(assessment))).toThrow(/start a new v2 assessment/i)
  })

  it('throws when schema_version is empty string', () => {
    const assessment = makeAssessment({ schema_version: '' as typeof SCHEMA_VERSION })
    expect(() => importAssessmentJson(JSON.stringify(assessment))).toThrow()
  })
})

// ---------------------------------------------------------------------------
// encodeAssessmentForUrl / decodeAssessmentFromUrl (round-trip)
// ---------------------------------------------------------------------------

describe('encodeAssessmentForUrl / decodeAssessmentFromUrl', () => {
  it('round-trips a small assessment back to its original data', async () => {
    if (!isShareLinkSupported()) {
      console.warn('CompressionStream not supported in this environment — skipping share link tests')
      return
    }
    const assessment = makeAssessment()
    const encoded = await encodeAssessmentForUrl(assessment)
    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(0)

    const decoded = await decodeAssessmentFromUrl(encoded)
    expect(decoded).not.toBeNull()
    // schema_version, rules_version, property, answers should all survive the round-trip
    expect(decoded!.schema_version).toBe(assessment.schema_version)
    expect(decoded!.rules_version).toBe(assessment.rules_version)
    expect(decoded!.property.address_line_1).toBe(assessment.property.address_line_1)
    expect(decoded!.answers['A1']?.value).toBe('converted')
  })

  it('assigns a new assessment_id after decoding', async () => {
    if (!isShareLinkSupported()) return
    const assessment = makeAssessment()
    const encoded = await encodeAssessmentForUrl(assessment)
    const decoded = await decodeAssessmentFromUrl(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.assessment_id).not.toBe('original-id-abc')
  })

  it('encodes to base64url (no +, /, or = characters)', async () => {
    if (!isShareLinkSupported()) return
    const encoded = await encodeAssessmentForUrl(makeAssessment())
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('returns null for a corrupt / empty encoded string', async () => {
    if (!isShareLinkSupported()) return
    const result = await decodeAssessmentFromUrl('this-is-not-valid-base64url-compressed-data')
    expect(result).toBeNull()
  })

  it('returns null for an empty string', async () => {
    if (!isShareLinkSupported()) return
    const result = await decodeAssessmentFromUrl('')
    expect(result).toBeNull()
  })

  it('returns null when decoded JSON does not have required fields', async () => {
    if (!isShareLinkSupported()) return
    // Encode a plain JSON object that is not an assessment
    const notAssessment = { hello: 'world' }
    const json = JSON.stringify(notAssessment)
    const encoder = new TextEncoder()
    const input = encoder.encode(json)
    const cs = new CompressionStream('deflate-raw')
    const writer = cs.writable.getWriter()
    await writer.write(input)
    await writer.close()
    const chunks: Uint8Array[] = []
    const reader = cs.readable.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const bytes = new Uint8Array(totalLen)
    let off = 0
    for (const c of chunks) { bytes.set(c, off); off += c.length }
    // Base64url encode it
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = await decodeAssessmentFromUrl(encoded)
    expect(result).toBeNull()
  })

  it('round-trips a realistically-sized assessment (~60 answered questions) within the URL size limit', async () => {
    if (!isShareLinkSupported()) return

    const answers: Assessment['answers'] = {}
    for (let i = 0; i < 60; i++) {
      answers[`Q${i}`] = {
        value: 'some_answer_value',
        confidence: 'confirmed',
        answered_at: '2026-01-01T00:00:00.000Z',
      }
    }
    const assessment = makeAssessment({ answers })

    const encoded = await encodeAssessmentForUrl(assessment)
    expect(encoded.length).toBeLessThan(7_500)

    const decoded = await decodeAssessmentFromUrl(encoded)
    expect(decoded).not.toBeNull()
    expect(Object.keys(decoded!.answers)).toHaveLength(60)
    expect(decoded!.answers['Q0']?.value).toBe('some_answer_value')
    expect(decoded!.schema_version).toBe(SCHEMA_VERSION)
  })

  it('throws for an assessment that exceeds the URL size limit', async () => {
    if (!isShareLinkSupported()) return
    // Use pseudo-random data per answer so deflate cannot compress it away.
    // Each value is ~270 chars of base-36 random noise; 300 answers ≈ 81 KB uncompressed.
    const bigAnswers: Assessment['answers'] = {}
    let seed = 1
    const pseudoRandom = () => {
      // Simple LCG for reproducible incompressible strings
      seed = (seed * 1664525 + 1013904223) & 0xffffffff
      return (seed >>> 0).toString(36)
    }
    for (let i = 0; i < 300; i++) {
      bigAnswers[`Q_${i}`] = {
        value: Array.from({ length: 30 }, pseudoRandom).join(''),
        confidence: 'confirmed',
        answered_at: '2026-01-01T00:00:00.000Z',
      }
    }
    const bigAssessment = makeAssessment({ answers: bigAnswers })
    await expect(encodeAssessmentForUrl(bigAssessment)).rejects.toThrow(/too large/i)
  })
})

// ---------------------------------------------------------------------------
// isShareLinkSupported
// ---------------------------------------------------------------------------

describe('isShareLinkSupported', () => {
  it('returns a boolean', () => {
    expect(typeof isShareLinkSupported()).toBe('boolean')
  })

  it('returns true when CompressionStream is available in the runtime', () => {
    // If CompressionStream is defined, isShareLinkSupported must return true.
    // This test is environment-aware: Node 18+ and modern browsers both qualify.
    if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
      expect(isShareLinkSupported()).toBe(true)
    } else {
      expect(isShareLinkSupported()).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// isIncompatibleAssessment — Step 7 clean-break detection
// ---------------------------------------------------------------------------

function makeIndexEntry(overrides: Partial<AssessmentIndexEntry> = {}): AssessmentIndexEntry {
  return {
    assessment_id: 'abc-123',
    address_display: '1 Test Street, TW9 4HA',
    last_edited_at: '2026-01-02T00:00:00.000Z',
    completion_status: 'in-progress',
    rules_version: 'test-v1',
    schema_version: SCHEMA_VERSION,
    ...overrides,
  }
}

describe('isIncompatibleAssessment', () => {
  it('returns false for an entry saved under the current schema version', () => {
    expect(isIncompatibleAssessment(makeIndexEntry({ schema_version: SCHEMA_VERSION }))).toBe(false)
  })

  it('returns true for an entry saved under an older schema version', () => {
    expect(isIncompatibleAssessment(makeIndexEntry({ schema_version: '1.2' }))).toBe(true)
  })

  it('returns true for an entry with a missing/empty schema_version (pre-v2 index format)', () => {
    expect(isIncompatibleAssessment(makeIndexEntry({ schema_version: '' }))).toBe(true)
  })
})
