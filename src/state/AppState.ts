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
export const SCHEMA_VERSION = '1.2' as const

/** Increment when the app code ships (set by build/CI). */
export const APP_VERSION = '0.3.0' as const

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
  /** From B2. Whether the upper flat has any independent escape route not using the shared staircase. */
  upper_flat_independent_exit: 'yes' | 'no' | 'unknown'
  /** Type of independent escape route claimed for the upper flat. Derived from B2. */
  upper_independent_escape_type: 'external_steel_stair' | 'rear_exit' | 'other' | 'none' | 'unknown'
  /** Whether the upper flat's external escape route is confirmed as viable. Derived from B2, B2a, B2c. */
  upper_external_escape_viable: 'yes' | 'no' | 'unknown'
  /** How heavily the upper flat depends on the shared entrance/staircase as its primary escape route. */
  upper_shared_route_dependency: 'sole_route' | 'primary_route' | 'secondary_route' | 'not_relied_on' | 'unknown'
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
  /**
   * Whether the shared entrance hall / staircase is used as an escape route
   * by more than one household (derived from F6a answer).
   * 'no' when B1 = 'separate'; 'unknown' when F6a not yet answered.
   */
  shared_escape_route: 'yes' | 'no' | 'unknown'
  /**
   * Evidence-based assessment of whether the stair enclosure provides
   * meaningful fire compartmentation (derived from D10–D17 answers).
   * 'unknown' when no shared entrance or questions not answered.
   */
  stair_compartmentation_confidence: 'high' | 'moderate' | 'low' | 'unknown'
  /**
   * Stair-enclosure-specific risk level derived from RF-S01–RF-S06 sub-score.
   * 'low' when no shared entrance or no stair-specific risk factors triggered.
   */
  stair_compartmentation_risk: 'low' | 'normal' | 'elevated' | 'high'
  /**
   * Minimum viable unit-aware escape model (schema v1.2).
   *
   * Ground floor: derived from B3 (rear exit) and B1 (communal vs separate entrance).
   *   via_rear_exit   — rear exit confirmed (B3=yes)
   *   front_door_only — no rear exit; primary escape is via own or communal front door
   *   unknown         — B3 not answered or not sure
   *
   * Upper floor: derived from B2 (independent rear exit) and bedroom escape windows.
   *   via_rear_exit   — independent rear exit confirmed (B2=yes)
   *   via_window      — no rear exit but bedroom 1 escape window qualifies
   *   front_door_only — no qualifying window and no rear exit; sole route is staircase/front door
   *   unknown         — insufficient information
   */
  ground_floor_escape_strategy: 'via_rear_exit' | 'front_door_only' | 'unknown'
  upper_floor_escape_strategy: 'via_window' | 'via_rear_exit' | 'front_door_only' | 'unknown'
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
