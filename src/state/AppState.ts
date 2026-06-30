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

/**
 * Increment when the saved assessment JSON shape changes incompatibly.
 * v3.0 — the v2-engine clean break: `Assessment.classification` now holds the
 * `BuildingClassification` shape (origin / hmo / case_study_d10 separated from
 * general LACORS guidance). v2.x assessments are routed to incompatible-legacy.
 */
export const SCHEMA_VERSION = '3.0' as const

/** Increment when the app code ships (set by build/CI). */
export const APP_VERSION = '0.5.0' as const

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

/**
 * Question-flow sections in the v2 sequence (§18.1). 'results' is the terminal
 * marker for the Review / Report screens (no questions live there).
 */
export type SectionId =
  | 'setup'
  | 'building'        // Building classification
  | 'common-parts'    // Common parts / entrance configuration
  | 'ground-flat'     // Ground-floor flat
  | 'upper-flat'      // Upper-floor flat
  | 'external-escape' // External escape routes
  | 'doors'           // Doors and route protection
  | 'stair'           // Stair compartmentation
  | 'detection'       // Detection and alarms
  | 'services'        // Gas / electrical / CO
  | 'management'      // Management
  | 'results'

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

export type CompletionStatus =
  | 'in-progress'
  | 'complete'
  | 'out-of-scope'
  /** v1.2 assessment imported into v2; safe fields prefilled, user review required (§19.1). */
  | 'requires-review'

export interface AssessmentIndexEntry {
  assessment_id: string
  address_display: string
  last_edited_at: string // ISO 8601
  completion_status: CompletionStatus
  rules_version: string
  /** Schema version the assessment was saved under; lets the index flag legacy entries (§19.1). */
  schema_version: string
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
  /**
   * v2 building classification (origin / HMO / Section-257 / Case Study D10 vs
   * general LACORS guidance). Recomputed from `answers` on every edit and on
   * load. The legal framework, risk and remedies are derived on demand in the
   * report (not persisted), keeping `answers` the single source of truth.
   */
  classification: BuildingClassification
  report_generated_at: string | null
}

// ===========================================================================
// FireRegs v2 type vocabulary (architecture refactor — docs/FireRegs_v2_*)
//
// These types model the building as: Building → Common parts → Ground flat →
// Upper flat, and separate four concerns the v1 `Classification` conflated:
//   1. property classification (what kind of building)        — §6
//   2. legal framework (what statutory duties apply)          — §7
//   3. risk assessment (what fire risks exist, per domain)    — §15
//   4. uncertainty (known / potential / unknown)              — §15.1
//   5. remedies (required / recommended / investigate)        — §16
//
// Migration note: the v1 `Classification` and `Assessment` types above are
// RETAINED temporarily so the not-yet-migrated remedy/report engines and pages
// keep compiling. The runtime persistence cutover to `AssessmentV2` lands in
// the Step 7 clean break; Steps 2/4/5 fill in the derivation engines. Many of
// the leaf interfaces below are deliberately minimal ([Inference] provisional)
// and are finalised when the question schema (Step 3), risk engine (Step 4),
// and remedy engine (Step 5) are built. Types only — no logic in this file.
// ===========================================================================

// ---------------------------------------------------------------------------
// Property identity (§5.1)
// ---------------------------------------------------------------------------

/** v2 alias for the property record. Same shape as v1 `PropertyInfo` for now. */
export type PropertyIdentity = PropertyInfo

// ---------------------------------------------------------------------------
// Building classification (§6)
// ---------------------------------------------------------------------------

export type BuildingOrigin =
  | 'purpose_built_two_flats'
  | 'converted_from_single_house'
  | 'unknown'

export type HmoClassification =
  | 'not_hmo'
  | 'section_257_hmo'
  | 'probable_section_257_hmo'
  | 'unresolved'

export type EntranceConfiguration =
  | 'separate_private_entrances'
  | 'shared_entrance_hall'
  | 'shared_hall_and_shared_stair'
  | 'unknown'

/**
 * §6.3 classification output. Note the deliberate separation of the
 * Section-257/D10 benchmark (`case_study_d10`) from the general LACORS risk
 * guidance (`general_lacors_risk_guidance`): a purpose-built two-flat building
 * sets `case_study_d10 = 'not_applicable'` while `general_lacors_risk_guidance`
 * stays `'applicable'`.
 */
export interface BuildingClassification {
  origin: BuildingOrigin
  hmo: HmoClassification
  section_257: boolean
  case_study_d10: 'applicable' | 'not_applicable' | 'unknown'
  general_lacors_risk_guidance: 'applicable' | 'not_applicable' | 'unknown'
  /** Whether the Fire Safety Order common-parts duty bites — mirrors common_parts.exists. */
  fso_common_parts: boolean | 'unknown'
  entrance_configuration: EntranceConfiguration
  confidence: ConfidenceLevel
  /** Explains why classification is unresolved / probable (shown in report). */
  unresolved_reasons: string[]
}

// ---------------------------------------------------------------------------
// Legal framework (§7)
// ---------------------------------------------------------------------------

export interface LegalFrameworkAssessment {
  smoke_co_alarm_regulations: 'applies' | 'not_applicable' | 'unknown'
  gas_safety: 'applies' | 'not_applicable' | 'unknown'
  /** Always applies in rented residential property. */
  electrical_safety: 'applies'
  /** Fire hazard is always assessable under HHSRS. */
  hhsrs_fire_hazard: 'applies'
  fire_safety_order_common_parts: 'applies' | 'not_applicable' | 'unknown'
  section_257_hmo: 'applies' | 'not_applicable' | 'unknown'
  lacors_guidance_use:
    | 'direct_benchmark'
    | 'risk_reference'
    | 'not_applicable'
    | 'unknown'
}

/**
 * §7.2 — the five-value legal status carried by every remedy. This is the
 * single source of truth for `LegalStatus`; `src/data/rules/remedy-rules.ts`
 * still defines its own narrower 3-value union and is reconciled onto this in
 * Step 5. Do not use "mandatory" unless genuinely statutory.
 */
export type LegalStatus =
  | 'legal_requirement'
  | 'lacors_benchmark_recommendation'
  | 'risk_based_recommendation'
  | 'advisory_good_practice'
  | 'further_investigation_required'

// ---------------------------------------------------------------------------
// Detection / alarms (§13) — shared by flats and common parts
// ---------------------------------------------------------------------------

/** [Inference] provisional device record — finalised with the Step 3 question schema. */
export interface AlarmDevice {
  location: string
  power: 'mains' | 'battery' | 'mixed' | 'unknown'
  interlinked: boolean | 'unknown'
}

export interface DetectionAssessment {
  smoke_alarms: AlarmDevice[]
  heat_alarms: AlarmDevice[]
  grade: 'D1' | 'D2' | 'F' | 'A' | 'mixed' | 'unknown'
  within_area_interlinked: boolean | 'unknown'
  linked_to_other_flat: boolean | 'unknown' | 'not_applicable'
  linked_to_common_parts: boolean | 'unknown' | 'not_applicable'
  tested_recently: 'monthly' | 'within_year' | 'over_year' | 'unknown'
}

// ---------------------------------------------------------------------------
// Common parts (§8)
// ---------------------------------------------------------------------------

export interface CommonPartsAssessment {
  exists: boolean | 'unknown'
  type:
    | 'none'
    | 'shared_entrance_hall'
    | 'shared_corridor'
    | 'shared_stair'
    | 'meter_cupboard_only'
    | 'mixed'
    | 'unknown'
  used_by_ground_flat: boolean | 'unknown'
  used_by_upper_flat: boolean | 'unknown'
  shared_escape_route: boolean | 'unknown'
  upper_route_dependency:
    | 'sole_route'
    | 'primary_route'
    | 'secondary_route'
    | 'not_relied_on'
    | 'unknown'
  final_exit_door_keyless: boolean | 'unknown'
  combustible_storage: 'none' | 'present' | 'unknown'
  meter_or_service_cupboard:
    | 'none'
    | 'present_fire_resisting'
    | 'present_not_fire_resisting'
    | 'unknown'
  common_area_detection: DetectionAssessment
}

// ---------------------------------------------------------------------------
// Doors (§11)
// ---------------------------------------------------------------------------

export interface DoorAssessment {
  location:
    | 'ground_flat_entrance'
    | 'upper_flat_entrance'
    | 'building_final_exit'
    | 'internal_escape_route'
  construction:
    | 'fd30s_confirmed'
    | 'solid_timber'
    | 'hollow_core'
    | 'panel_door'
    | 'unknown'
  thickness_mm: number | 'unknown'
  frame_condition: 'good' | 'gaps' | 'poor' | 'unknown'
  self_closer_present: boolean | 'unknown'
  self_closer_effective: boolean | 'unknown' | 'not_applicable'
  latches_when_closed: boolean | 'unknown'
  intumescent_strips: boolean | 'unknown'
  smoke_seals: boolean | 'unknown'
  letterplate: 'none' | 'present_protected' | 'present_unprotected' | 'unknown'
  keyless_egress: boolean | 'unknown'
}

// ---------------------------------------------------------------------------
// Escape routes (§9, §10)
// ---------------------------------------------------------------------------

/** External / independent upper-flat escape route (§10.1). */
export interface ExternalEscapeAssessment {
  exists: boolean | 'unknown'
  type:
    | 'external_steel_stair'
    | 'rear_door_to_garden'
    | 'juliet_or_full_height_escape_opening'
    | 'none'
    | 'unknown'
  accessible_from: 'hall_or_landing' | 'kitchen' | 'living_room' | 'bedroom' | 'unknown'
  keyless_egress: boolean | 'unknown'
  unobstructed: boolean | 'unknown'
  condition: 'sound' | 'minor_defects' | 'poor' | 'unknown'
  lighting: 'adequate' | 'not_required' | 'poor' | 'unknown'
  viable: 'yes' | 'no' | 'unknown'
}

/** [Inference] provisional internal escape route shape — finalised in Step 3/4. */
export interface InternalEscapeAssessment {
  route_description: 'hallway' | 'open_plan' | 'through_habitable_room' | 'unknown'
  travel_distance: 'short' | 'medium' | 'long' | 'unknown'
  protected: boolean | 'unknown'
  final_exit_keyless: boolean | 'unknown'
}

// ---------------------------------------------------------------------------
// Rooms (§9) — [Inference] provisional, finalised with the Step 3 question schema
// ---------------------------------------------------------------------------

export interface BedroomAssessment {
  ref: string
  is_inner_room: boolean | 'unknown'
  escape_window: EscapeWindowStatus
}

export interface HabitableRoomAssessment {
  ref: string
  type: 'living_room' | 'kitchen' | 'dining_room' | 'other' | 'unknown'
  is_inner_room: boolean | 'unknown'
  escape_window: EscapeWindowStatus
}

// ---------------------------------------------------------------------------
// CO / gas / electrical (§14) — CO split per §14.1
// ---------------------------------------------------------------------------

export interface COAssessment {
  fixed_combustion_appliance_present: boolean | 'unknown'
  co_alarm_present_in_same_room: boolean | 'unknown' | 'not_applicable'
}

/** [Inference] provisional gas shape — finalised in Step 3/5. */
export interface GasAssessment {
  gas_present: boolean | 'unknown'
  appliances_present: boolean | 'unknown'
  safety_check_current: 'within_year' | 'over_year' | 'never' | 'unknown' | 'not_applicable'
}

/** [Inference] provisional electrical shape — finalised in Step 3/5. */
export interface ElectricalAssessment {
  eicr_status: 'within_5_years' | 'over_5_years' | 'never' | 'unknown'
  visible_defects: boolean | 'unknown'
}

// ---------------------------------------------------------------------------
// Flat assessment (§9.1)
// ---------------------------------------------------------------------------

export interface FlatAssessment {
  level: 'ground' | 'upper'
  bedrooms: BedroomAssessment[]
  habitable_rooms: HabitableRoomAssessment[]
  flat_entrance_door: DoorAssessment
  internal_escape_route: InternalEscapeAssessment
  external_escape: ExternalEscapeAssessment
  detection: DetectionAssessment
  co: COAssessment
  gas: GasAssessment
  electrical: ElectricalAssessment
}

// ---------------------------------------------------------------------------
// Stair compartmentation (§12.1)
// ---------------------------------------------------------------------------

export interface StairCompartmentationAssessment {
  relevant: boolean | 'unknown'
  stair_serves: 'upper_flat_only' | 'multiple_dwellings' | 'unknown'
  enclosure_material:
    | 'masonry'
    | 'plasterboard'
    | 'lath_and_plaster'
    | 'timber_panelling'
    | 'mixed'
    | 'unknown'
  board_thickness: '9_5mm' | '12_5mm' | 'double_layer' | 'unknown' | 'not_applicable'
  board_type: 'standard' | 'fire_resistant' | 'unknown' | 'not_applicable'
  inspection_method:
    | 'visual_only'
    | 'edge_visible'
    | 'inspection_opening'
    | 'intrusive_confirmed'
  hidden_voids: 'none_known' | 'suspected' | 'unknown'
  penetrations: 'none' | 'sealed' | 'unsealed' | 'unknown'
  continuity: 'continuous' | 'gaps_or_openings' | 'unknown'
  confidence: 'high' | 'moderate' | 'low' | 'unknown'
  risk: 'known_risk' | 'potential_risk' | 'unknown_risk' | 'low_concern'
}

// ---------------------------------------------------------------------------
// Building facts (§5.1) — [Inference] provisional, finalised in Step 3
// ---------------------------------------------------------------------------

export interface BuildingAssessment {
  origin: BuildingOrigin
  storeys: number | 'unknown'
  flat_count: number | 'unknown'
  build_era: string | 'unknown'
  entrance_configuration: EntranceConfiguration
  stair_compartmentation: StairCompartmentationAssessment
}

// ---------------------------------------------------------------------------
// Risk model (§15)
// ---------------------------------------------------------------------------

export type RiskSeverity = 'low' | 'normal' | 'elevated' | 'high'
export type RiskKnowledge = 'known_risk' | 'potential_risk' | 'unknown_risk'

export type RiskDomain =
  | 'escape'
  | 'doors'
  | 'detection'
  | 'compartmentation'
  | 'common_parts'
  | 'management'

export interface RiskDomainAssessment {
  severity: RiskSeverity
  knowledge: RiskKnowledge
  /** IDs of the risk factors contributing to this domain. */
  factors: string[]
}

export interface RiskFactor {
  id: string
  domain: RiskDomain
  severity: RiskSeverity
  knowledge: RiskKnowledge
  description: string
}

export interface RiskAssessment {
  overall_severity: RiskSeverity
  overall_knowledge: RiskKnowledge
  domains: Record<RiskDomain, RiskDomainAssessment>
  risk_factors: RiskFactor[]
}

// ---------------------------------------------------------------------------
// Remedy model (§16)
// ---------------------------------------------------------------------------

export type RemedyPriority =
  | 'P1_urgent'
  | 'P2_high'
  | 'P3_medium'
  | 'P4_low'
  | 'investigate'

export type RemedyScope = 'building' | 'common_parts' | 'ground_flat' | 'upper_flat'

export type RemedyConfidence = 'confirmed' | 'probable' | 'contingent' | 'unknown'

/**
 * §16.1 — v2 remedy condition AST (Step 5). Defined here (rather than in
 * `src/data/rules`) so `RemedyRule` can reference it without `AppState`
 * importing from the rules layer — `src/data/rules` already imports types
 * from `AppState`, and the reverse import would create a cycle.
 *
 * - `leaf` tests a raw answer (mirrors the v1 `matchesAnyValue` semantics,
 *   including JSON-array multi-choice answers).
 * - `classification` tests a `BuildingClassification` field by string
 *   comparison (handles both string-enum and boolean fields).
 * - `risk_factor` tests for the presence of a `RiskFactor.id` in
 *   `RiskAssessment.risk_factors` — the primary way v2 rules consume the
 *   Step 4 risk model.
 * - `and` / `or` / `not` combine the above.
 */
export type RuleCondition =
  | { type: 'leaf'; question_id: string; in_values: string[]; negate?: boolean }
  | { type: 'classification'; field: keyof BuildingClassification; in_values: Array<string | boolean> }
  | { type: 'risk_factor'; factor_id: string }
  | { type: 'and'; conditions: RuleCondition[] }
  | { type: 'or'; conditions: RuleCondition[] }
  | { type: 'not'; condition: RuleCondition }

/** §16.1 — the v2 remedy rule shape (Step 5 migrates the rule definitions onto this). */
export interface RemedyRule {
  id: string
  title: string
  legal_status: LegalStatus
  priority: RemedyPriority
  applies_to: RemedyScope
  condition: RuleCondition
  text: string
  risk_basis: string
  regulatory_refs: string[]
  confidence: RemedyConfidence
  suppress_if?: RuleCondition
  downgrade_if?: RuleCondition
}

/** A rule resolved against an assessment, ready for the report. */
export interface ResolvedRemedy {
  rule_id: string
  title: string
  legal_status: LegalStatus
  priority: RemedyPriority
  applies_to: RemedyScope
  text: string
  risk_basis: string
  regulatory_refs: string[]
  confidence: RemedyConfidence
}

/** §16.2 — remedies grouped for the report. */
export interface RemedySummary {
  legal_requirements: ResolvedRemedy[]
  recommendations: ResolvedRemedy[]
  further_investigation: ResolvedRemedy[]
  advisory: ResolvedRemedy[]
  remediation_schedule: ResolvedRemedy[]
}

// ---------------------------------------------------------------------------
// Evidence / assumptions / unknowns (§5.1) — [Inference] provisional
// ---------------------------------------------------------------------------

export interface EvidenceRecord {
  id: string
  subject: string
  observation: string
  recorded_at: string
}

export interface Assumption {
  id: string
  statement: string
  basis: string
}

export interface UnknownItem {
  id: string
  question_ref: string
  description: string
  impact: string
}

// ---------------------------------------------------------------------------
// AssessmentV2 — the target persisted shape (§5.1)
//
// Design decision (Step 1, item 10): `answers` (AnswerMap) remains the Layer-1
// source of truth — the question bank still drives data collection. The derived
// snapshots (`building`, `common_parts`, `flats`, `classification`,
// `legal_framework`, `risk`, `remedies`) are RECOMPUTED from `answers` on load,
// exactly as v1 re-runs `classify()` on RESUME_ASSESSMENT. This keeps the
// "answers in, derived structures out" architecture and the engine pure.
//
// This interface is defined now but is NOT yet the runtime persisted type; the
// reducer/persistence cutover from v1 `Assessment` happens in the Step 7 clean
// break (per the retained-v1 transition strategy).
// ---------------------------------------------------------------------------

export interface AssessmentV2 {
  schema_version: typeof SCHEMA_VERSION
  app_version: string
  rules_version: string
  assessment_id: string // UUID v4
  created_at: string // ISO 8601
  last_edited_at: string // ISO 8601

  property: PropertyIdentity

  // Layer 1 — source of truth
  answers: AnswerMap
  invalidated_answers: InvalidatedAnswerMap
  current_section: SectionId
  current_question_id: string

  // Derived snapshots (recomputed from answers on load)
  building: BuildingAssessment
  common_parts: CommonPartsAssessment
  flats: {
    ground: FlatAssessment
    upper: FlatAssessment
  }
  classification: BuildingClassification
  legal_framework: LegalFrameworkAssessment
  risk: RiskAssessment
  remedies: RemedySummary

  evidence: EvidenceRecord[]
  assumptions: Assumption[]
  unanswered_or_unknown: UnknownItem[]

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
  /** A schema v1.x assessment was opened under v2; shown by the Step 7 clean-break flow. */
  | 'incompatible-legacy'

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
