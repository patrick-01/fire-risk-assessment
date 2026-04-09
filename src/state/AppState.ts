/**
 * AppState.ts — Master TypeScript types for the entire application.
 *
 * This file is the single source of truth for the shape of all data.
 * It maps directly to the JSON schema specified in the requirements (§4.1).
 *
 * NOTHING in this file should contain logic. Types only.
 */

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/** Increment when the saved assessment JSON shape changes incompatibly. */
export const SCHEMA_VERSION = '1.1' as const

/** Increment when the app code ships (set by build/CI). */
export const APP_VERSION = '0.1.0' as const

// ---------------------------------------------------------------------------
// Confidence and uncertainty
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'confirmed' | 'probable' | 'unresolved'

export type AnswerConfidence = 'confirmed' | 'not_sure' | 'unknown'

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

export interface PropertyInfo {
  address_line_1: string
  address_line_2: string | null
  town: string
  postcode: string
  /** Normalised form: upper-case with single space before final 3 chars. */
  postcode_normalised: string
  flat_ref: string | null
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type AnswerValue = string | number | boolean | null

export interface Answer {
  value: AnswerValue
  confidence: AnswerConfidence
  answered_at: string // ISO 8601
}

export interface InvalidatedAnswer {
  previous_value: AnswerValue
  invalidated_at: string // ISO 8601
  reason: string
}

/** Map of question_id → Answer for all current answers. */
export type AnswerMap = Record<string, Answer>

/** Map of question_id → InvalidatedAnswer for answers overwritten by branching. */
export type InvalidatedAnswerMap = Record<string, InvalidatedAnswer>

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export type SectionId = 'setup' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'results'

// ---------------------------------------------------------------------------
// Classification (Layer 2 output)
// ---------------------------------------------------------------------------

export type ClassificationType =
  | 'section-257-hmo'        // confirmed
  | 'probable-section-257'   // meets criteria but one or more facts uncertain
  | 'not-section-257'        // explicitly does not meet criteria or out of scope
  | 'unresolved'             // not enough information yet

export type BenchmarkType = 'D10' | 'unknown' | 'not-applicable'
export type CommunalEntranceType = 'true' | 'false' | 'unknown'

/** Per-room escape window qualification status. */
export type EscapeWindowStatus =
  | 'qualifies'
  | 'does-not-qualify'
  | 'unknown'
  | 'not-applicable'    // room does not exist (e.g. no second bedroom)

export interface EscapeWindowAssessment {
  bedroom_1: EscapeWindowStatus
  /** 'not-applicable' when C6 = 'no' (single bedroom). */
  bedroom_2: EscapeWindowStatus
  living_room: EscapeWindowStatus
}

export type RiskLevel = 'low' | 'normal' | 'elevated' | 'high' | 'unresolved'

export interface Classification {
  type: ClassificationType
  benchmark: BenchmarkType
  communal_entrance: CommunalEntranceType
  /** True when B1 = 'separate'. Derived from communal_entrance = 'false'. */
  separate_entrance_mode: boolean
  /** From B2. Whether the upper flat has an independent rear exit. */
  upper_flat_independent_exit: 'yes' | 'no' | 'unknown'
  /** From C10, C13. Whether an inner room situation exists. */
  inner_room_present: 'yes' | 'no' | 'unknown'
  /** Derived from Section C answers combined with B4 (floor height) and C12 (mobility). */
  escape_windows: EscapeWindowAssessment
  confidence: ConfidenceLevel
  /** Explains why classification is unresolved or probable (shown in report). */
  unresolved_reasons: string[]
  /** Overall risk level derived from risk scoring. */
  risk_level: RiskLevel
  /** Numeric score that produced risk_level. */
  risk_score: number
  /** IDs of risk factors that contributed to the score. */
  risk_factors_present: string[]
}

// ---------------------------------------------------------------------------
// Saved Assessment Index entry (stored in fire_tool_index)
// ---------------------------------------------------------------------------

export type CompletionStatus = 'in-progress' | 'complete' | 'out-of-scope'

export interface AssessmentIndexEntry {
  assessment_id: string
  address_display: string
  last_edited_at: string // ISO 8601
  completion_status: CompletionStatus
  rules_version: string
}

// ---------------------------------------------------------------------------
// Assessment — the top-level persisted object (§4.1)
// ---------------------------------------------------------------------------

export interface Assessment {
  schema_version: typeof SCHEMA_VERSION
  rules_version: string
  app_version: string
  assessment_id: string // UUID v4
  created_at: string // ISO 8601
  last_edited_at: string // ISO 8601
  property: PropertyInfo
  current_section: SectionId
  current_question_id: string
  answers: AnswerMap
  invalidated_answers: InvalidatedAnswerMap
  classification: Classification
  report_generated_at: string | null
}

// ---------------------------------------------------------------------------
// App-level UI state (not persisted)
// ---------------------------------------------------------------------------

export type AppScreen =
  | 'home'
  | 'property-setup'
  | 'questionnaire'
  | 'review'
  | 'report'
  | 'out-of-scope'

export interface AppState {
  /** Currently active assessment, if any. */
  activeAssessment: Assessment | null
  /** All assessments loaded from localStorage index. */
  savedAssessments: AssessmentIndexEntry[]
  /** Which top-level screen is showing. */
  screen: AppScreen
  /** True while a localStorage write is in flight (for "Saved" indicator). */
  isSaving: boolean
  /** Non-fatal messages to show the user (e.g. rules version mismatch). */
  bannerMessage: string | null
  /** When screen = 'out-of-scope', explains why the property is out of scope. */
  outOfScopeReason: string | null
}
