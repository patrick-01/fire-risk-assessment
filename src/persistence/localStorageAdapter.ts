/**
 * localStorageAdapter.ts — All localStorage reads and writes are isolated here.
 *
 * NO other module may call localStorage directly.
 * Swapping to IndexedDB or sessionStorage requires only changing this file.
 *
 * Storage keys (§5.2):
 *   fire_tool_index          — AssessmentIndexEntry[]
 *   fire_tool_assessment_<id> — Assessment object
 *
 * Limits:
 *   Max 10 saved assessments (§5.2).
 *   Warn user if usage exceeds ~4MB (80% of estimated 5MB limit) (§5.5).
 *
 * Import/export (§5 Step 5):
 *   exportAssessmentJson() — returns JSON string for file download
 *   downloadAssessmentJson() — triggers browser file download
 *   importAssessmentJson() — parses + validates + assigns new ID
 *   encodeAssessmentForUrl() — deflate-raw + base64url (async)
 *   decodeAssessmentFromUrl() — reverse of above (async)
 *
 * Share URL format: <origin><pathname>#share=<base64url-compressed-json>
 * Size limit: encoded string must be ≤ 7 500 characters.
 */

import type { Assessment, AssessmentIndexEntry } from '../state/AppState'
import { SCHEMA_VERSION } from '../state/AppState'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDEX_KEY = 'fire_tool_index'
const ASSESSMENT_KEY_PREFIX = 'fire_tool_assessment_'
const MAX_ASSESSMENTS = 10
const CONSENT_KEY = 'cookie_consent'

// ---------------------------------------------------------------------------
// Consent guard (belt-and-suspenders)
// ---------------------------------------------------------------------------

/**
 * Returns true only when the user has previously clicked OK on the consent
 * overlay and the flag is present in localStorage.
 *
 * The primary enforcement is structural: AppProvider is not mounted until
 * CookieConsentGate has rendered children, so this guard is a secondary
 * safety net for any code path that might reach here unexpectedly.
 */
function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true'
  } catch {
    return false
  }
}

/** ~4MB in characters (rough localStorage usage estimate threshold). */
const STORAGE_WARN_THRESHOLD_CHARS = 4 * 1024 * 1024

/**
 * Maximum length (characters) of the encoded share string placed in the URL.
 * Most servers and browsers accept URLs up to 8 192 chars; 7 500 leaves a
 * comfortable margin for the origin + pathname + hash prefix.
 */
const SHARE_URL_MAX_CHARS = 7_500

// ---------------------------------------------------------------------------
// Index operations
// ---------------------------------------------------------------------------

export function loadIndex(): AssessmentIndexEntry[] {
  if (!hasConsent()) return []
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    return JSON.parse(raw) as AssessmentIndexEntry[]
  } catch {
    console.warn('[storage] Failed to parse assessment index. Resetting.')
    return []
  }
}

function saveIndex(index: AssessmentIndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

// ---------------------------------------------------------------------------
// Assessment CRUD
// ---------------------------------------------------------------------------

export function loadAssessment(id: string): Assessment | null {
  if (!hasConsent()) return null
  try {
    const raw = localStorage.getItem(ASSESSMENT_KEY_PREFIX + id)
    if (!raw) return null
    return JSON.parse(raw) as Assessment
  } catch {
    console.warn(`[storage] Failed to parse assessment ${id}.`)
    return null
  }
}

/**
 * Persists a full assessment and updates the index entry.
 * Returns false if the max assessment limit has been reached and this is a
 * new assessment (not an update to an existing one).
 */
export function saveAssessment(assessment: Assessment): boolean {
  if (!hasConsent()) return false
  const index = loadIndex()
  const existingIdx = index.findIndex((e) => e.assessment_id === assessment.assessment_id)

  if (existingIdx === -1 && index.length >= MAX_ASSESSMENTS) {
    console.warn('[storage] Maximum assessment limit reached.')
    return false
  }

  // Write the full assessment object.
  localStorage.setItem(
    ASSESSMENT_KEY_PREFIX + assessment.assessment_id,
    JSON.stringify(assessment)
  )

  // Update or insert the index entry.
  const indexEntry: AssessmentIndexEntry = {
    assessment_id: assessment.assessment_id,
    address_display: formatAddressDisplay(assessment),
    last_edited_at: assessment.last_edited_at,
    completion_status: deriveCompletionStatus(assessment),
    rules_version: assessment.rules_version,
  }

  if (existingIdx === -1) {
    index.push(indexEntry)
  } else {
    index[existingIdx] = indexEntry
  }

  saveIndex(index)
  return true
}

export function deleteAssessment(id: string): void {
  if (!hasConsent()) return
  localStorage.removeItem(ASSESSMENT_KEY_PREFIX + id)
  const index = loadIndex().filter((e) => e.assessment_id !== id)
  saveIndex(index)
}

// ---------------------------------------------------------------------------
// Storage usage warning (§5.5)
// ---------------------------------------------------------------------------

/**
 * Returns true if localStorage usage has exceeded the warning threshold.
 * Call after every save to decide whether to show the warning banner.
 */
export function isStorageNearlyFull(): boolean {
  if (!hasConsent()) return false
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2 // UTF-16
    }
    return total >= STORAGE_WARN_THRESHOLD_CHARS
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// JSON export — browser file download
// ---------------------------------------------------------------------------

/**
 * Returns the assessment as a pretty-printed JSON string, version-stamped.
 * Callers that want a file download should use downloadAssessmentJson().
 */
export function exportAssessmentJson(assessment: Assessment): string {
  return JSON.stringify(assessment, null, 2)
}

/**
 * Triggers a browser file download of the assessment as a .json file.
 * Filename: fire-assessment-<postcode>-<YYYY-MM-DD>.json
 *
 * This function creates and clicks a temporary <a download> element.
 * It must only be called in a browser context.
 */
export function downloadAssessmentJson(assessment: Assessment): void {
  const json = exportAssessmentJson(assessment)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const postcode = (assessment.property.postcode_normalised || assessment.property.postcode)
    .replace(/\s+/g, '')
    .toLowerCase()
  const date = new Date(assessment.last_edited_at).toISOString().slice(0, 10)
  const filename = `fire-assessment-${postcode || 'unknown'}-${date}.json`

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  // Revoke the object URL shortly after — give the browser time to initiate download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

// ---------------------------------------------------------------------------
// JSON import — validation and schema checking
// ---------------------------------------------------------------------------

/**
 * Parses and validates an imported assessment JSON string.
 *
 * Validation steps:
 *   1. JSON parse — throws if malformed
 *   2. Required fields check — throws if structural fields are missing
 *   3. Schema version check — throws if version is unrecognised (reject)
 *   4. Assigns a new assessment_id to prevent collision with any existing save
 *
 * The caller is responsible for checking the MAX_ASSESSMENTS limit before
 * dispatching the imported assessment to the reducer.
 *
 * Returns the validated Assessment with a fresh assessment_id.
 * Throws an Error with a user-readable message on any validation failure.
 */
export function importAssessmentJson(json: string): Assessment {
  // --- Step 1: parse ---
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('The file is not valid JSON.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The file does not contain a valid assessment object.')
  }

  const obj = parsed as Record<string, unknown>

  // --- Step 2: required fields ---
  const missingFields: string[] = []
  for (const field of ['schema_version', 'assessment_id', 'answers', 'property', 'classification', 'created_at', 'last_edited_at', 'rules_version']) {
    if (obj[field] === undefined || obj[field] === null) missingFields.push(field)
  }
  if (missingFields.length > 0) {
    throw new Error(
      `The file is missing required fields: ${missingFields.join(', ')}. ` +
      'It may not be a valid assessment export from this tool.'
    )
  }

  // --- Step 3: schema version check ---
  const savedVersion = String(obj.schema_version)
  if (savedVersion !== SCHEMA_VERSION) {
    throw new Error(
      `This assessment was saved under schema version ${savedVersion}. ` +
      `The current tool supports schema version ${SCHEMA_VERSION} only. ` +
      'The file cannot be imported.'
    )
  }

  // --- Step 4: assign a new assessment_id ---
  const assessment = parsed as Assessment
  return {
    ...assessment,
    assessment_id: generateUUID(),
  }
}

// ---------------------------------------------------------------------------
// Shareable links — deflate-raw compression + base64url encoding
// ---------------------------------------------------------------------------

/**
 * Returns true if the browser (or runtime) supports the CompressionStream /
 * DecompressionStream APIs required for share-link encoding.
 *
 * CompressionStream is available in:
 *   - Chrome 80+, Edge 80+, Safari 16.4+, Firefox 113+
 *   - Node.js 18.0+
 *
 * When this returns false, the share-link button should be disabled with a
 * clear "Browser not supported" message rather than a generic error.
 */
export function isShareLinkSupported(): boolean {
  return (
    typeof CompressionStream !== 'undefined' &&
    typeof DecompressionStream !== 'undefined'
  )
}

/**
 * Encodes an assessment as a compressed, URL-safe base64 string for the share
 * link URL hash fragment.
 *
 * Compression: deflate-raw via the native CompressionStream API.
 * Encoding: standard base64url (RFC 4648 §5) — no +, /, or = characters.
 *
 * Throws if the encoded string exceeds SHARE_URL_MAX_CHARS, indicating the
 * assessment is too large for a URL and should be exported as a file instead.
 */
export async function encodeAssessmentForUrl(assessment: Assessment): Promise<string> {
  const json = JSON.stringify(assessment)
  const compressed = await deflate(json)
  const encoded = toBase64Url(compressed)

  if (encoded.length > SHARE_URL_MAX_CHARS) {
    throw new Error(
      `This assessment is too large to share via URL (encoded size: ${encoded.length} characters, ` +
      `limit: ${SHARE_URL_MAX_CHARS}). Export as JSON instead and share the file directly.`
    )
  }

  return encoded
}

/**
 * Decodes a share URL encoded string back into an Assessment object.
 *
 * Returns null (without throwing) if:
 *   - Decoding or decompression fails (corrupted/truncated link)
 *   - The decompressed JSON is not a recognisable assessment
 *
 * Assigns a new assessment_id to prevent collision.
 * Does NOT re-classify — the caller's reducer (IMPORT_ASSESSMENT) handles that.
 */
export async function decodeAssessmentFromUrl(encoded: string): Promise<Assessment | null> {
  try {
    const bytes = fromBase64Url(encoded)
    const json = await inflate(bytes)
    const parsed: unknown = JSON.parse(json)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

    const obj = parsed as Record<string, unknown>
    if (!obj.schema_version || !obj.answers || !obj.property) return null

    if (String(obj.schema_version) !== SCHEMA_VERSION) return null

    const assessment = parsed as Assessment
    return { ...assessment, assessment_id: generateUUID() }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Compression helpers (deflate-raw via CompressionStream API)
// ---------------------------------------------------------------------------

async function deflate(str: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const input = encoder.encode(str)

  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  await writer.write(input)
  await writer.close()

  return collectStream(cs.readable)
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  // Copy bytes into a fresh ArrayBuffer to satisfy strict BufferSource typing.
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  await writer.write(new Uint8Array(copy))
  await writer.close()

  const output = await collectStream(ds.readable)
  return new TextDecoder().decode(output)
}

async function collectStream(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const reader = readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

// ---------------------------------------------------------------------------
// Base64url helpers (RFC 4648 §5 — URL-safe, no padding)
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function formatAddressDisplay(assessment: Assessment): string {
  const p = assessment.property
  const parts = [p.address_line_1, p.flat_ref, p.postcode_normalised].filter(Boolean)
  return parts.join(', ')
}

function deriveCompletionStatus(
  assessment: Assessment
): AssessmentIndexEntry['completion_status'] {
  if (assessment.classification.type === 'not-section-257') return 'out-of-scope'
  if (assessment.report_generated_at) return 'complete'
  return 'in-progress'
}
