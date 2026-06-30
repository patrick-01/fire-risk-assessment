/**
 * remedy-rules.ts — Remedy rule definitions.
 *
 * Pure declarative data. No React, no DOM, no persistence.
 * The remedy engine (src/engine/remedyEngine.ts) evaluates each rule against
 * the current classification and answers. UI components never reference this
 * file directly.
 *
 * --- Tiers ---
 *   mandatory   — direct statutory obligation; expressed as "Required by law"
 *   recommended — LACORS general expectation; expressed as "should" or
 *                 "strongly recommended" depending on risk level
 *   advisory    — flagged for verification or professional input; not a remedy
 *                 until the underlying fact is resolved
 *
 * --- Basis codes ---
 *   mandatory-statutory   — Housing Act 2004, Gas Safety Regs, ESSR 2020
 *   council-confirmed     — Richmond upon Thames written guidance
 *   LACORS-benchmark      — LACORS Fire Safety Guidance reference
 *   advisory              — No confirmed remedy; requires verification
 *
 * --- Confidence ---
 *   confirmed    — classification and all relevant facts are certain
 *   probable     — one or more facts are "not sure" but best interpretation applied
 *   unresolved   — cannot determine without further information
 *
 * --- risk_basis ---
 *   Every rule must carry a risk_basis string that explains WHY the recommendation
 *   is triggered in fire safety / LACORS reasoning terms. This is displayed in
 *   the report alongside the recommendation text.
 *
 * --- risk_level_expressions ---
 *   Optional map of risk level → text override. When the current risk_level
 *   matches a key here, that text replaces the default 'text' field in the report.
 *   This allows the same rule to express itself more or less strongly depending
 *   on overall risk without duplicating the rule.
 */

import type { ConfidenceLevel } from '../../state/AppState'
import type { EscapeWindowStatus } from '../../state/AppState'

// ---------------------------------------------------------------------------
// Rules versioning (§3.4)
// ---------------------------------------------------------------------------

/** Increment when any rule is added, changed, or removed. */
export const RULES_VERSION = '2026-05-v3' as const
export const RULES_DATE = '2026-05-27' as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RemedyTier = 'mandatory' | 'recommended' | 'advisory'

/**
 * The type of obligation the remedy represents.
 *
 * This is a separate dimension from `tier` (which controls report prominence).
 * A legal requirement may still appear at different prominence depending on risk level.
 * A LACORS recommendation may be high-priority in a high-risk property.
 *
 *   legal_requirement    — clear statutory obligation applying to the assessed property
 *   lacors_recommendation — LACORS risk-assessment benchmark; expected by council/assessors
 *                           but not a universal statutory minimum for every rented flat
 *   advisory             — good practice, management action, or unresolved regulatory question
 */
export type LegalStatus = 'legal_requirement' | 'lacors_recommendation' | 'advisory'

export type RemedyBasis =
  | 'mandatory-statutory'
  | 'council-confirmed'
  | 'LACORS-benchmark'
  | 'advisory'

/**
 * Leaf condition: question `question_id` has a value in `in_values`.
 * For multi-choice questions (JSON array values), checks if ANY selected
 * value appears in `in_values`.
 */
export interface ConditionLeaf {
  type: 'leaf'
  question_id: string
  in_values: (string | boolean | number)[]
  negate?: boolean
}

/** All child conditions must be true (AND). */
export interface ConditionAnd {
  type: 'and'
  conditions: ConditionExpr[]
}

/** At least one child condition must be true (OR). */
export interface ConditionOr {
  type: 'or'
  conditions: ConditionExpr[]
}

/**
 * Classification-level condition — tests a field of the derived Classification
 * object rather than a raw answer.
 *
 * Supported fields: type, benchmark, communal_entrance, confidence, risk_level,
 * separate_entrance_mode, inner_room_present, upper_flat_independent_exit
 */
export interface ConditionClassification {
  type: 'classification'
  field:
    | 'type'
    | 'benchmark'
    | 'communal_entrance'
    | 'confidence'
    | 'risk_level'
    | 'separate_entrance_mode'
    | 'shared_escape_route'
    | 'inner_room_present'
    | 'upper_flat_independent_exit'
    | 'upper_independent_escape_type'
    | 'upper_external_escape_viable'
    | 'upper_shared_route_dependency'
    | 'ground_floor_escape_strategy'
    | 'upper_floor_escape_strategy'
  in_values: string[]
  negate?: boolean
}

/**
 * Escape window condition — tests the derived escape window status for a room.
 * The evaluator reads from classification.escape_windows.
 */
export interface ConditionEscapeWindow {
  type: 'escape_window'
  room: 'bedroom_1' | 'bedroom_2' | 'living_room'
  /** Condition matches if the room's status is ANY of these values. */
  in_statuses: EscapeWindowStatus[]
  negate?: boolean
}

export type ConditionExpr =
  | ConditionLeaf
  | ConditionAnd
  | ConditionOr
  | ConditionClassification
  | ConditionEscapeWindow

export interface RemedyRule {
  /** Unique identifier, e.g. "R-E01". Never reuse a retired ID. */
  id: string
  title: string
  tier: RemedyTier
  /**
   * The type of legal/regulatory obligation this rule represents.
   * Distinct from tier: tier controls prominence in the report; legal_status controls
   * how the item is labelled and framed (statutory requirement vs. benchmark vs. advice).
   */
  legal_status: LegalStatus
  basis: RemedyBasis[]
  /** Structured condition evaluated by remedyEngine.ts. */
  condition: ConditionExpr
  confidence: ConfidenceLevel
  /**
   * Why this recommendation is triggered — the fire safety reasoning grounded
   * in LACORS, not just the regulatory citation. Displayed in the report
   * alongside every recommendation.
   */
  risk_basis: string
  /** Default explanatory text shown in the report. */
  text: string
  /**
   * Optional risk-level-aware text overrides. When the property's risk_level
   * matches a key, this text replaces 'text' in the rendered report.
   * This allows the same rule to express itself more or less strongly.
   */
  risk_level_expressions?: Partial<Record<string, string>>
  /**
   * True if this rule applies when communal_entrance = 'false' (separate entrance).
   * Rules with false are suppressed in separate-entrance assessments.
   */
  applies_when_separate_entrance: boolean
  /** Regulatory references shown in report footnotes. */
  regulatory_refs: string[]
}

// ---------------------------------------------------------------------------
// Helper condition builders (for readability in complex rule conditions)
// ---------------------------------------------------------------------------

const IS_SECTION_257: ConditionClassification = {
  type: 'classification',
  field: 'type',
  in_values: ['section-257-hmo', 'probable-section-257'],
}

const IS_COMMUNAL: ConditionClassification = {
  type: 'classification',
  field: 'communal_entrance',
  in_values: ['true'],
}

const IS_SHARED_ESCAPE_ROUTE: ConditionClassification = {
  type: 'classification',
  field: 'shared_escape_route',
  in_values: ['yes'],
}

// ---------------------------------------------------------------------------
// Remedy rules
// ---------------------------------------------------------------------------

export const REMEDY_RULES: RemedyRule[] = [
  // =========================================================================
  // G — Statutory obligations (Tier 1: mandatory by law)
  // =========================================================================

  {
    id: 'R-G01',
    title: 'Annual gas safety inspection — required by law',
    tier: 'mandatory',
    legal_status: 'legal_requirement',
    basis: ['mandatory-statutory'],
    condition: { type: 'leaf', question_id: 'G1', in_values: ['overdue'] },
    confidence: 'confirmed',
    risk_basis:
      'The Gas Safety (Installation and Use) Regulations 1998 impose an absolute statutory ' +
      'obligation on landlords to arrange an annual gas safety inspection by a Gas Safe ' +
      'registered engineer. This is a direct legal requirement regardless of property ' +
      'configuration or risk level.',
    text:
      'An annual gas safety inspection by a Gas Safe registered engineer is required by law. ' +
      'The current inspection is overdue. Arrange an inspection promptly and provide tenants ' +
      'with a copy of the Gas Safety Certificate (CP12) within 28 days.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['Gas Safety (Installation and Use) Regulations 1998, reg. 36'],
  },

  {
    id: 'R-G02',
    title: 'Electrical Installation Condition Report (EICR) — required by law',
    tier: 'mandatory',
    legal_status: 'legal_requirement',
    basis: ['mandatory-statutory'],
    condition: {
      type: 'or',
      conditions: [
        { type: 'leaf', question_id: 'G2', in_values: ['overdue'] },
        { type: 'leaf', question_id: 'G2', in_values: ['unknown'] },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'The Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020 ' +
      'require an EICR by a qualified electrician at least every five years for all private ' +
      'rented properties. This is a statutory obligation. Where the date of the last EICR is ' +
      'unknown, it must be treated as overdue.',
    text:
      'An Electrical Installation Condition Report (EICR) is required by law at least every ' +
      'five years for privately rented properties. The current EICR is overdue or its date is ' +
      'unknown. Commission an EICR from a qualified electrician and provide tenants with a copy.',
    applies_when_separate_entrance: true,
    regulatory_refs: [
      'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020',
    ],
  },

  // =========================================================================
  // E — Fire detection and alarms
  // =========================================================================

  {
    id: 'R-E04',
    title: 'Install smoke alarms immediately — no alarms currently present',
    tier: 'mandatory',
    legal_status: 'legal_requirement',
    basis: ['mandatory-statutory', 'LACORS-benchmark'],
    condition: { type: 'leaf', question_id: 'E1', in_values: ['none'] },
    confidence: 'confirmed',
    risk_basis:
      'The Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022 require landlords ' +
      'to install a smoke alarm on every storey of the property used as living accommodation, ' +
      'and to ensure alarms are working at the start of each new tenancy. No alarms are ' +
      'currently present. This is a statutory obligation applying to all privately rented ' +
      'properties in England, regardless of HMO status. In addition, LACORS Table C2 identifies ' +
      'Grade D mains-wired alarms as the expected standard for Section 257 HMOs. The complete ' +
      'absence of any detection is the single largest fire safety gap that can be identified.',
    text:
      'No fire alarms are present. At minimum, a smoke alarm must be installed on every storey ' +
      'used as living accommodation — this is required by law under the Smoke and Carbon Monoxide ' +
      'Alarm (Amendment) Regulations 2022. For a Section 257 HMO, LACORS Table C2 specifies a ' +
      'Grade D mains-wired system with integral battery backup, including a smoke alarm in the ' +
      'communal hallway, interlinked heat detectors in each flat entrance lobby, and smoke alarms ' +
      'in living areas. Works must be carried out by a qualified electrician.',
    applies_when_separate_entrance: true,
    regulatory_refs: [
      'Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022',
      'LACORS Table C2',
      'LACORS Table C4',
      'BS 5839-6:2019',
    ],
  },

  {
    id: 'R-E01',
    title: 'Review and upgrade fire detection to Grade D mains-wired standard',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark', 'council-confirmed'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        { type: 'leaf', question_id: 'E1', in_values: ['battery_only', 'mixed'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'LACORS Table C2 states that Grade F (battery-only) alarms are "not recommended" in ' +
      'Houses in Multiple Occupation. For a Section 257 HMO, Grade D mains-wired alarms with ' +
      'integral battery backup are the expected standard. Battery-only alarms are inadequate ' +
      'because they rely entirely on batteries being present and functional — mains-wired alarms ' +
      'with battery backup provide more reliable detection. Richmond Council confirmed Grade D as ' +
      'the applicable standard for a directly comparable property at 8 & 8a North Road ' +
      '(council letter, March 2026). This is a general expectation, not a blanket statutory ' +
      'requirement independent of the specific property configuration.',
    text:
      'Battery-only fire alarms should be upgraded to a Grade D, LD2 mains-wired system with ' +
      'integral battery backup. This is the standard expected for Section 257 HMOs under LACORS ' +
      'guidance and has been confirmed by Richmond Council for comparable properties in this area.',
    risk_level_expressions: {
      elevated:
        'Battery-only alarms fall below the expected standard and should be upgraded to Grade D ' +
        'mains-wired as a priority. At this overall risk level, upgrading detection is one of the ' +
        'most impactful risk reductions available.',
      high:
        'Battery-only alarms are a significant risk factor and should be upgraded to Grade D ' +
        'mains-wired urgently. This should be treated as the highest priority action alongside ' +
        'any escape route improvements.',
    },
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS Table C2', 'LACORS Table C4', 'BS 5839-6:2019 §11.2'],
  },

  {
    id: 'R-E02',
    title: 'Install mains-wired smoke alarm in communal hallway or staircase',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['council-confirmed', 'LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'E4', in_values: ['yes_battery', 'no', 'not_sure'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'Richmond Council confirmed a Grade D, LD2 mixed alarm system as the applicable standard ' +
      'for communal-entrance Section 257 HMOs in this area. This includes a mains-wired smoke ' +
      'alarm in the communal hallway, interlinked with heat detectors in each flat\'s entrance ' +
      'lobby. A fire starting in the communal area directly threatens the only escape route. ' +
      'Early detection of such a fire is therefore particularly critical. A battery-only alarm ' +
      'in the communal area falls below the council-confirmed standard.',
    text:
      'A mains-wired (Grade D) smoke alarm should be installed in the communal hallway or ' +
      'staircase, interlinked with the detection system in each flat. This is council-confirmed ' +
      'for comparable communal-entrance Section 257 HMOs in the Richmond area. Works should be ' +
      'carried out by a qualified electrician.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS Table C2', 'BS 5839-6:2019'],
  },

  {
    id: 'R-E03',
    title: 'Install mains-wired heat detector in entrance lobby of each flat',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['council-confirmed', 'LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'E5', in_values: ['yes_one', 'no', 'not_sure'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'Part of the Grade D, LD2 mixed system confirmed by Richmond Council for communal-entrance ' +
      'Section 257 HMOs. Heat detectors (not smoke alarms) are specified in flat entrance lobbies ' +
      'to reduce false alarms from cooking while still providing early warning of a fire starting ' +
      'within the flat. A fire starting in a flat and passing undetected into the communal ' +
      'staircase would directly compromise the escape route for all occupants.',
    text:
      'A mains-wired heat detector should be installed in the entrance lobby of each flat, ' +
      'interlinked with the communal alarm system. Heat detectors (not smoke alarms) are ' +
      'specified in lobbies to minimise false alarms from kitchens. This is council-confirmed ' +
      'for comparable properties in this area.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS Table C2', 'BS 5839-6:2019'],
  },

  {
    id: 'R-E05',
    title: 'Establish regular alarm testing routine',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'leaf',
      question_id: 'E7',
      in_values: ['over_year', 'never_unknown'],
    },
    confidence: 'confirmed',
    risk_basis:
      'Alarms that are never tested may have failed batteries, faults, or deteriorated ' +
      'detectors. An untested alarm provides no assurance of protection. LACORS expects ' +
      'landlords to maintain fire safety equipment including alarms. Regular testing is a ' +
      'basic management obligation and one of the lowest-cost risk reductions available.',
    text:
      'Alarms should be tested regularly — at minimum at each tenancy renewal and ideally ' +
      'monthly. Records of testing should be kept. Tenants should be shown how to test the ' +
      'alarms themselves. Where alarms have not been tested in over a year, test them now ' +
      'and replace any with depleted batteries or faults.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §18.5'],
  },

  {
    id: 'R-E06',
    title: 'Interlink alarms within each flat — alarms currently not confirmed as interlinked within flats',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        {
          type: 'leaf',
          question_id: 'E6a',
          in_values: ['no', 'partial', 'not_yet_verified', 'not_sure'],
        },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'Within-flat interlinking ensures that when any one alarm activates inside a flat, all ' +
      'other alarms in that same flat also sound — giving occupants in bedrooms the earliest ' +
      'possible warning of a fire starting in another room. Non-interlinked alarms mean that ' +
      'a fire starting in the kitchen may not trigger the bedroom alarm until the fire or smoke ' +
      'reaches the bedroom itself. LACORS §18.6 addresses interlinking requirements for ' +
      'multi-occupied premises. Grade D mains-wired systems (D1 or D2) support interlinking ' +
      'readily; a qualified electrician can confirm or enable this.',
    text:
      'Alarms within the flat are not confirmed as interlinked. For a Section 257 HMO, ' +
      'alarms within each flat should be interlinked so that all sound together when any single ' +
      'detector activates. This gives occupants in bedrooms immediate warning of a fire starting ' +
      'in another room. If the system is Grade D mains-wired (D1 or D2), interlinking is ' +
      'straightforward. Seek advice from a qualified electrician.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §18.6', 'BS 5839-6:2019 cl. 11.2'],
  },

  {
    id: 'R-E06b',
    title: 'Consider cross-flat alarm interlinking — regulatory position requires professional confirmation',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['advisory'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        {
          type: 'leaf',
          question_id: 'E6b',
          in_values: ['no', 'not_sure'],
        },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'Whether alarms in separate self-contained flats — without a communal area — must be ' +
      'interlinked between flats is a point of regulatory interpretation that has not been ' +
      'definitively confirmed for this property type. In buildings with communal parts, ' +
      'LACORS §18.6 clearly contemplates interlinking through the communal alarm. For ' +
      'buildings with wholly separate entrances, the position is less clear. This advisory ' +
      'item is raised so that the question can be put to a qualified fire risk assessor ' +
      'or electrician rather than assumed either way.',
    text:
      'Cross-flat alarm interlinking — whether alarms in one flat trigger alarms in the other — ' +
      'has not been confirmed. The regulatory requirement for cross-flat interlinking in buildings ' +
      'without communal areas is not definitively established and requires professional judgement. ' +
      'Raise this question with a qualified fire risk assessor or electrician when reviewing the ' +
      'alarm installation.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §18.6'],
  },

  // =========================================================================
  // F — Doors and egress
  // =========================================================================

  {
    id: 'R-F01',
    title: 'Fit self-closing devices to flat entrance doors (shared escape route)',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        {
          type: 'or',
          conditions: [
            {
              type: 'leaf',
              question_id: 'F1a',
              in_values: ['functioning_self_closer'],
              negate: true,
            },
            {
              type: 'leaf',
              question_id: 'F1b',
              in_values: ['functioning_self_closer'],
              negate: true,
            },
          ],
        },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'Flat entrance doors without self-closing devices allow fire and smoke from within a flat ' +
      'to pass into the shared entrance hall or escape route if the door is left open during evacuation. ' +
      'LACORS §21.5 states that entrance doors to self-contained flats in buildings with a shared ' +
      'escape route should be fitted with self-closers. The primary justification is the protection ' +
      'of the shared entrance hall — the shared escape route for both flats. For separate-entrance ' +
      'properties where no escape route is shared, the self-closer argument is addressed by R-F01b ' +
      'at advisory level.',
    text:
      'A self-closing device should be fitted to each flat entrance door. ' +
      'LACORS §21.5 states that entrance doors to self-contained flats in buildings with a shared ' +
      'escape route should close automatically. This limits the spread of fire and smoke from within ' +
      'a flat into the shared entrance hall if the door is left open during evacuation.',
    risk_level_expressions: {
      elevated:
        'A functioning self-closer on each flat entrance door is strongly recommended and should ' +
        'be fitted as a priority. At this overall risk level, protecting the shared entrance hall ' +
        'from smoke and fire spread through an open door is particularly important.',
      high:
        'A functioning self-closer on each flat entrance door should be fitted urgently. Where no ' +
        'qualifying escape window exists, the shared escape route is the primary barrier — a door ' +
        'that does not self-close leaves the route unprotected.',
    },
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §21.5'],
  },

  {
    id: 'R-F01b',
    title: 'Consider self-closing device on flat entrance door (separate entrance)',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'classification',
          field: 'separate_entrance_mode',
          in_values: ['true'],
        },
        {
          type: 'or',
          conditions: [
            {
              type: 'leaf',
              question_id: 'F1a',
              in_values: ['functioning_self_closer'],
              negate: true,
            },
            {
              type: 'leaf',
              question_id: 'F1b',
              in_values: ['functioning_self_closer'],
              negate: true,
            },
          ],
        },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'For properties with separate individual entrances, each flat\'s front door opens directly ' +
      'to the street — not to a shared escape route. The primary justification for ' +
      'self-closers under LACORS §21.5 is protection of the shared entrance hall or escape route. ' +
      'Where no shared route exists, the self-closer is good practice and reduces the risk of fire ' +
      'spreading to neighbouring properties, but is not directly required by the same LACORS ' +
      'rationale. This advisory item is raised for professional confirmation.',
    text:
      'No functioning self-closer is fitted to the flat entrance door. For properties with ' +
      'separate individual entrances, a self-closer on each flat\'s front door is advisory good ' +
      'practice. LACORS §21.5\'s primary rationale applies to buildings with a shared escape route; ' +
      'for separate-entrance properties the requirement is less clear-cut. Seek advice from a ' +
      'qualified fire risk assessor on the appropriate standard for this configuration.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §21.5'],
  },

  {
    id: 'R-F02',
    title: 'Assess flat entrance door construction against escape route risk',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        // No qualifying bedroom escape window (sole escape is staircase or front door)
        { type: 'escape_window', room: 'bedroom_1', in_statuses: ['does-not-qualify', 'unknown'] },
        // No confirmed viable independent escape route — suppressed when external route is verified viable
        {
          type: 'classification',
          field: 'upper_external_escape_viable',
          in_values: ['yes'],
          negate: true,
        },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'Where the staircase or front door is the sole practical escape route — no qualifying ' +
      'bedroom window and no independent rear exit — the flat entrance door is the critical ' +
      'barrier between the flat and the escape route. If a fire starts within the flat, the ' +
      'door must limit fire and smoke spread long enough for occupants to evacuate. LACORS §21.5 ' +
      'and Case Study D10 address this: the appropriate standard depends on overall risk. An ' +
      'FD30S fire doorset may be warranted at higher risk levels, but this tool cannot specify ' +
      'works — it flags the risk for professional assessment.',
    text:
      'The bedroom escape window does not appear to qualify, and no independent rear exit exists. ' +
      'The staircase or front door is therefore the primary escape route for this flat. The ' +
      'construction of the flat entrance door should be assessed against this risk.',
    risk_level_expressions: {
      normal:
        'A solid, well-fitted timber door (minimum 44mm) with a functioning self-closer is ' +
        'generally expected at this risk level. Confirm the door closes flush and latches properly.',
      elevated:
        'Subject to a fire risk assessment, an FD30S fire doorset with intumescent seals, smoke ' +
        'seal, and self-closer should be considered as a priority. Commission a professional ' +
        'assessment to confirm the appropriate specification.',
      high:
        'An FD30S fire doorset is strongly recommended at this risk level. Multiple risk factors ' +
        'are present and the escape route is unprotected by an alternative exit. Commission a ' +
        'formal fire risk assessment before specifying works.',
    },
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §21.5', 'LACORS Case Study D10'],
  },

  {
    id: 'R-F03',
    title: 'Repair or replace flat entrance door — does not close or latch correctly',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: { type: 'leaf', question_id: 'F3', in_values: ['no'] },
    confidence: 'confirmed',
    risk_basis:
      'A door that does not close flush or latch correctly provides no fire resistance and ' +
      'cannot keep smoke out of the escape route even briefly. LACORS §21.5 presupposes that ' +
      'the flat entrance door is in adequate condition. A defective door undermines the entire ' +
      'compartmentation strategy.',
    text:
      'The flat entrance door does not close or latch correctly. This must be repaired or the ' +
      'door replaced before any fire resistance or self-closer improvements will be effective. ' +
      'A door that does not close flush provides no useful compartmentation.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §21.5'],
  },

  {
    id: 'R-F05',
    title: 'Remove or replace key-only locks that prevent exit from inside',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: { type: 'leaf', question_id: 'F5', in_values: ['yes'] },
    confidence: 'confirmed',
    risk_basis:
      'Any door within the flat that requires a key to exit from the inside creates a risk of ' +
      'occupants being unable to evacuate during a fire — particularly where the key is not ' +
      'immediately to hand. All exit routes within a dwelling must be openable from the inside ' +
      'without a key. This is a basic fire safety requirement.',
    text:
      'One or more doors within the flat require a key to exit from the inside. This is a ' +
      'significant risk — during a fire, occupants may be unable to leave if they cannot locate ' +
      'the key in the dark or panic. Replace key-only deadlocks on escape routes with thumb-turn ' +
      'locks or nightlatches that can be opened from inside without a key.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §21.3'],
  },

  {
    id: 'R-F06',
    title: 'Fit or repair self-closer on building final exit door',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SHARED_ESCAPE_ROUTE,
        { type: 'leaf', question_id: 'F6b', in_values: ['fitted_not_working', 'no', 'not_sure'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'The building final exit door is the last barrier between the shared escape route and the ' +
      'outside. A self-closer ensures the door returns to a closed position after use, preventing ' +
      'smoke from an external fire or street-level incident from entering the shared escape route, ' +
      'and reducing the risk of the door being propped open. LACORS §21.5 addresses self-closing ' +
      'devices on final exit doors where a shared escape route is present.',
    text:
      'The building final exit door should be fitted with a functioning self-closer. This ensures ' +
      'the door returns to a closed position after use, maintaining compartmentation of the shared ' +
      'entrance hall and preventing smoke or unauthorised access from compromising the escape route.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §21.5'],
  },

  // =========================================================================
  // D — Staircase, construction, and ignition risk
  // =========================================================================

  {
    id: 'R-D01-hardboard',
    title: 'Replace hardboard stair panelling with 12.5mm plasterboard',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark', 'council-confirmed'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'D1', in_values: ['hardboard'] },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'LACORS §19.5 specifies 12.5mm plasterboard as the standard for achieving nominal ' +
      '30-minute fire resistance in a staircase enclosure. Hardboard has no measurable fire ' +
      'resistance and is not an acceptable substitute. Where the staircase is the primary ' +
      'escape route for both flats, the integrity of its enclosure is critical to safe ' +
      'evacuation. However, what matters is the fire resistance of the enclosure as a system — ' +
      'in some cases a competent assessor may judge that the overall enclosure achieves ' +
      'adequate resistance despite the presence of hardboard. This tool cannot substitute ' +
      'for that assessment.',
    text:
      'The staircase side panelling is identified as hardboard. Hardboard provides no useful ' +
      'fire resistance. It should be replaced with 12.5mm plasterboard, screw-fixed with joints ' +
      'taped or filled, unless a competent assessor can demonstrate that the enclosure as a whole ' +
      'achieves equivalent fire resistance by other means. LACORS §19.5 specifies 12.5mm ' +
      'plasterboard as the reference standard.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.5', 'LACORS Table C3'],
  },

  {
    id: 'R-D01-9mm',
    title: 'Review stair panelling — 9mm plasterboard is below the §19.5 standard',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'D1', in_values: ['9mm'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'LACORS §19.5 specifies 12.5mm plasterboard as the standard for staircase enclosure ' +
      'fire resistance. 9mm plasterboard falls below this standard. LACORS §19.6 acknowledges ' +
      'that thinner boards may be acceptable in lower-risk premises subject to assessor ' +
      'confirmation. Whether 9mm is acceptable depends on the overall risk level and the ' +
      'condition and continuity of the enclosure.',
    text:
      '9mm plasterboard panelling has been identified in the staircase enclosure. This falls ' +
      'below the 12.5mm standard specified in LACORS §19.5. Whether this requires replacement ' +
      'depends on the overall risk level and the judgement of a competent assessor. At elevated ' +
      'or high overall risk, upgrading to 12.5mm should be considered.',
    risk_level_expressions: {
      elevated:
        'At this overall risk level, upgrading 9mm staircase panelling to 12.5mm plasterboard ' +
        'should be considered as part of a wider staircase enclosure improvement programme.',
      high:
        'At this overall risk level, upgrading to 12.5mm plasterboard is strongly recommended ' +
        'alongside other staircase enclosure improvements. Commission a formal fire risk ' +
        'assessment to confirm the specification.',
    },
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.5', 'LACORS §19.6'],
  },

  {
    id: 'R-D01-unknown',
    title: 'Identify staircase panelling material — currently unknown',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['advisory'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        {
          type: 'leaf',
          question_id: 'D1',
          in_values: ['unknown', 'mixed', 'open_bannisters'],
        },
      ],
    },
    confidence: 'unresolved',
    risk_basis:
      'The staircase panelling material could not be confirmed. Under the CONSERVATIVE ' +
      'uncertainty policy, unknown panelling should be treated as potentially inadequate ' +
      'until physically verified. Hardboard provides no fire resistance, and open ' +
      'bannisters provide no enclosure at all. Both ' +
      'represent significant risks if the staircase is the primary escape route.',
    text:
      'The staircase panelling material has not been confirmed. Physical inspection is required ' +
      'to determine whether the material meets the 12.5mm plasterboard standard specified in ' +
      'LACORS §19.5. Until confirmed, assume the panelling may be inadequate. If it proves to ' +
      'be hardboard, R-D01-hardboard applies.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.5'],
  },

  {
    id: 'R-D02',
    title: 'Line staircase soffit with plasterboard',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'D2', in_values: ['exposed_timber'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'The soffit — the underside of the staircase visible from the ground floor — is part of ' +
      'the staircase enclosure. An exposed timber soffit provides fuel for any fire igniting in ' +
      'the communal area and compromises the fire resistance of the enclosure. LACORS §19.5 ' +
      'addresses the soffit as part of the overall enclosure requirement. Lining with 12.5mm ' +
      'plasterboard is the standard corrective measure.',
    text:
      'The staircase soffit is exposed timber. This provides fuel for a fire in the communal ' +
      'area and reduces the fire resistance of the staircase enclosure. The soffit should be ' +
      'lined with 12.5mm plasterboard, fixed to the underside of the stair treads.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.5'],
  },

  {
    id: 'R-D04',
    title: 'Seal gaps and penetrations through the staircase enclosure',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'D4', in_values: ['yes'] },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'Visible gaps around pipes, cables, or redundant holes through the staircase walls or ' +
      'ceiling allow fire and smoke to bypass the enclosure even if the main boarding is ' +
      'adequate. A fire-resistant enclosure is only as good as its weakest point. ' +
      'Sealing penetrations is a relatively low-cost measure that restores the integrity ' +
      'of the enclosure.',
    text:
      'Visible gaps or penetrations through the staircase enclosure have been identified. ' +
      'All gaps around pipes, cables, redundant holes, and service penetrations should be ' +
      'sealed with appropriate intumescent materials (e.g. acoustic fire sealant or ' +
      'intumescent putty pads). This restores the fire-resistance continuity of the enclosure.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.5'],
  },

  {
    id: 'R-D05',
    title: 'Provide fire-resisting enclosure for cupboard or meter box in shared entrance hall or staircase',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'D5', in_values: ['yes_no_fire_door'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'A cupboard, storage space, or meter box located within the shared entrance hall or staircase ' +
      'without a fire-resisting door and enclosure provides a concealed void where a fire can start ' +
      'and develop undetected before entering the escape route. Combustible items stored in ' +
      'such a space (coats, cleaning materials, cardboard) increase the fuel load. LACORS ' +
      'considers ignition risk in the escape route as a material factor.',
    text:
      'A cupboard or meter box is present within the shared entrance hall or staircase without a ' +
      'fire-resisting door and enclosure. The enclosure should be upgraded to include a fire-resisting ' +
      'door (FD30 minimum) that is self-closing. Any combustible materials stored within should be ' +
      'removed.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.6', 'LACORS §21.5'],
  },

  {
    id: 'R-D07',
    title: 'Assess floor/ceiling fire separation between the two flats',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        {
          type: 'leaf',
          question_id: 'D7',
          in_values: ['timber_exposed', 'unknown'],
        },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'The floor between the ground floor flat and the upper flat is the primary fire ' +
      'separation between two separate households. Where timber joists are exposed with no ' +
      'plasterboard ceiling lining below, fire can spread rapidly between the two flats. ' +
      'LACORS expects adequate separation between dwellings as part of the overall risk ' +
      'assessment. Fire spreading from one flat to another would ' +
      'compromise the escape for occupants of the flat above.',
    text:
      'The floor/ceiling construction between the two flats does not appear to have adequate ' +
      'plasterboard lining. Inspect and, if necessary, fit a plasterboard ceiling lining ' +
      'beneath the upper flat\'s floor joists in the ground floor flat\'s ceiling. This improves ' +
      'fire separation between the two households. Seek advice from a competent person on the ' +
      'appropriate specification.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.5'],
  },

  {
    id: 'R-D09',
    title: 'Remove combustible materials and address ignition risks from communal areas',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        // D9 is multi-choice; check that 'none' is NOT in the selected values
        // The evaluator handles JSON array: triggers if any selected value is NOT 'none'/'not_sure'
        {
          type: 'leaf',
          question_id: 'D9',
          in_values: [
            'bicycles_pushchairs',
            'rubbish_cardboard',
            'electrical_intake',
            'combustible_materials',
          ],
        },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'LACORS explicitly considers the ignition risk and fuel load in the escape route as part ' +
      'of the risk assessment. Any combustible material stored in the communal area provides ' +
      'fuel for a fire that would directly compromise the only escape route from the building. ' +
      'Bicycles and pushchairs are particularly problematic — they contain combustible materials ' +
      'and lithium batteries (if electric) that can ignite rapidly. A fire in the communal area ' +
      'is the worst-case scenario for this property type because it simultaneously creates a fire ' +
      'and removes the escape route.',
    text:
      'Combustible materials, ignition sources, or fuel loads have been identified in the communal ' +
      'staircase or entrance area. These should be removed promptly. Specific items:\n' +
      '• Bicycles and pushchairs should not be stored in the communal area\n' +
      '• Rubbish and cardboard should be removed immediately\n' +
      '• Unenclosed electrical intakes or consumer units should be assessed by a qualified ' +
      'electrician and given a fire-resistant enclosure if required\n' +
      '• Any furniture or combustible materials should be removed\n' +
      'Consider including a clear-communal-areas clause in tenancy agreements.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.6', 'LACORS Case Study D10'],
  },

  // =========================================================================
  // C — Escape route advisories
  // =========================================================================

  {
    id: 'R-C01',
    title: 'No qualifying bedroom escape window and no confirmed viable alternative escape — assess route adequacy',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        { type: 'escape_window', room: 'bedroom_1', in_statuses: ['does-not-qualify', 'unknown'] },
        // Fires unless the external escape route is confirmed viable (reduces sole-route dependency)
        {
          type: 'classification',
          field: 'upper_external_escape_viable',
          in_values: ['yes'],
          negate: true,
        },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'LACORS §14 identifies qualifying escape windows as a key component of the escape strategy ' +
      'for upper flats. Where the main bedroom escape window does not ' +
      'qualify and no confirmed viable independent escape route exists, the staircase or front ' +
      'door is the only practical means of escape. This means any fire in the communal area or ' +
      'at the main exit leaves occupants with no alternative. This is a material risk factor that ' +
      'should inform the assessment of the flat entrance door, the staircase enclosure, and ' +
      'detection provision. This advisory is suppressed where a viable external escape route has ' +
      'been confirmed, as the sole-route dependency is then materially reduced.',
    text:
      'The main bedroom escape window does not appear to qualify under LACORS §14 criteria, and ' +
      'no confirmed viable independent escape route has been recorded. The staircase or front door ' +
      'is the primary — and possibly only — means of escape. This finding should be read alongside ' +
      'the flat entrance door assessment (R-F02) and the staircase protection findings. Improving ' +
      'the fire resistance of the escape route becomes more important where no window alternative ' +
      'exists. Physical verification of window dimensions, opening characteristics, and any ' +
      'external escape route is recommended.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §14', 'LACORS Case Study D10'],
  },

  {
    id: 'R-C10',
    title: 'Inner room situation — bedroom accessible only through another habitable room',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'classification',
      field: 'inner_room_present',
      in_values: ['yes'],
    },
    confidence: 'probable',
    risk_basis:
      'An inner room is one where the only means of access is through another habitable room. ' +
      'If a fire starts in the outer room, the occupant of the inner room cannot escape without ' +
      'passing through the fire. LACORS considers inner rooms a material risk factor. Where a ' +
      'bedroom is an inner room with a qualifying escape window, the risk is lower. Where there ' +
      'is no qualifying window, the risk is more serious.',
    text:
      'A bedroom in this flat can only be accessed by passing through another habitable room. ' +
      'This is an "inner room" situation. If a fire starts in the outer habitable room, the ' +
      'occupant of the inner room cannot reach the front door without passing through the fire. ' +
      'Whether this is acceptable depends on whether the inner room has a qualifying escape ' +
      'window. Physical verification of both the access arrangement and any window is recommended. ' +
      'Seek advice from a qualified fire risk assessor on appropriate mitigation.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §14', 'LACORS §21.3'],
  },

  // =========================================================================
  // G — Fire risk assessment for common parts
  // =========================================================================

  {
    id: 'R-G03',
    title: 'Commission documented fire risk assessment for common parts — required by law',
    tier: 'mandatory',
    legal_status: 'legal_requirement',
    basis: ['mandatory-statutory', 'LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'G3', in_values: ['no', 'not_sure'] },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'The Regulatory Reform (Fire Safety) Order 2005 (Article 9) applies to the common parts ' +
      'of multi-occupied residential buildings, regardless of whether the building is classified ' +
      'as a Section 257 HMO. The responsible person — typically the landlord or managing agent ' +
      '— must carry out a suitable and sufficient fire risk assessment for the common parts and ' +
      'implement appropriate fire safety measures. This is a direct statutory obligation, not a ' +
      'LACORS recommendation.',
    text:
      'No documented fire risk assessment for the common parts of the building is in place. ' +
      'A fire risk assessment for the common parts is required by law under the Regulatory ' +
      'Reform (Fire Safety) Order 2005 (Article 9). It must be carried out by the responsible ' +
      'person, documented, kept up to date, and reviewed when any significant change occurs. ' +
      'Commission a formal assessment by a competent person without delay.',
    risk_level_expressions: {
      elevated:
        'A documented fire risk assessment for the common parts is required by law and is ' +
        'particularly pressing at this overall risk level. Commission a formal assessment by a ' +
        'competent person promptly.',
      high:
        'A formal fire risk assessment by a competent person is required by law and must be ' +
        'commissioned as an immediate priority given the overall risk level identified. ' +
        'Do not wait for remedial works to be completed before commissioning the assessment.',
    },
    applies_when_separate_entrance: false,
    regulatory_refs: [
      'Regulatory Reform (Fire Safety) Order 2005, Article 9',
      'LACORS §5',
    ],
  },

  // =========================================================================
  // G — Carbon monoxide alarm (statutory — all rented properties)
  // =========================================================================

  {
    id: 'R-G04',
    title: 'Install carbon monoxide alarm — required by law',
    tier: 'mandatory',
    legal_status: 'legal_requirement',
    basis: ['mandatory-statutory'],
    condition: {
      type: 'and',
      conditions: [
        { type: 'leaf', question_id: 'G4a', in_values: ['yes'] },
        { type: 'leaf', question_id: 'G4b', in_values: ['no'] },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'The Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022 require landlords ' +
      'to install a carbon monoxide alarm in any room used as living accommodation that ' +
      'contains a fixed combustion appliance, other than a gas cooker. This applies to all ' +
      'privately rented properties in England and came into force on 1 October 2022. Fixed ' +
      'combustion appliances include gas boilers, gas fires, oil boilers, and solid fuel ' +
      'stoves or burners. Carbon monoxide is odourless and colourless; occupants cannot ' +
      'detect a CO leak without an alarm. A fixed combustion appliance has been confirmed ' +
      'present and no CO alarm is confirmed in the affected room(s).',
    text:
      'A carbon monoxide alarm must be installed in every room that contains a fixed combustion ' +
      'appliance (other than a gas cooker). This is required by the Smoke and Carbon Monoxide ' +
      'Alarm (Amendment) Regulations 2022, which apply to all privately rented properties in ' +
      'England. Install a CO alarm conforming to BS EN 50291 in each affected room. Ensure the ' +
      'alarm is working at the start of each new tenancy.',
    applies_when_separate_entrance: true,
    regulatory_refs: [
      'Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022',
      'BS EN 50291',
    ],
  },

  {
    id: 'R-G04b',
    title: 'Confirm carbon monoxide alarm compliance — appliance or alarm presence uncertain',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['mandatory-statutory', 'advisory'],
    condition: {
      type: 'or',
      conditions: [
        // Appliance presence uncertain
        { type: 'leaf', question_id: 'G4a', in_values: ['not_sure'] },
        // Appliance confirmed present but alarm presence uncertain
        {
          type: 'and',
          conditions: [
            { type: 'leaf', question_id: 'G4a', in_values: ['yes'] },
            { type: 'leaf', question_id: 'G4b', in_values: ['not_sure'] },
          ],
        },
      ],
    },
    confidence: 'unresolved',
    risk_basis:
      'The Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022 require a CO alarm in ' +
      'any room containing a fixed combustion appliance (other than a gas cooker). Either the ' +
      'presence of a relevant appliance or the presence of a compliant CO alarm could not be ' +
      'confirmed from the answers given. Until both are physically verified, the statutory ' +
      'requirement cannot be assessed. This advisory item is raised to prompt physical ' +
      'confirmation — if a combustion appliance is present without a CO alarm, the legal ' +
      'requirement (R-G04) applies.',
    text:
      'The presence of a fixed combustion appliance or a compliant CO alarm could not be confirmed. ' +
      'Physically check the property: identify any fixed combustion appliances (gas boiler, gas fire, ' +
      'oil boiler, solid fuel stove — not a gas cooker), and confirm whether a BS EN 50291 CO alarm ' +
      'is fitted in every room containing such an appliance. If a combustion appliance is present ' +
      'without a CO alarm, installation is required by law.',
    applies_when_separate_entrance: true,
    regulatory_refs: [
      'Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022',
      'BS EN 50291',
    ],
  },

  // =========================================================================
  // Section S — Stair compartmentation
  // =========================================================================

  {
    id: 'R-S01',
    title: 'Compartmentation of staircase enclosure uncertain',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['LACORS-benchmark', 'advisory'],
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'and',
          conditions: [
            { type: 'leaf', question_id: 'D10', in_values: ['plasterboard'] },
            { type: 'leaf', question_id: 'D14', in_values: ['visual_only'] },
            { type: 'leaf', question_id: 'D12', in_values: ['unknown'] },
          ],
        },
        {
          type: 'and',
          conditions: [
            { type: 'leaf', question_id: 'D11', in_values: ['1950_1970'] },
            { type: 'leaf', question_id: 'D14', in_values: ['visual_only'] },
          ],
        },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'The staircase enclosure may be one of the most important fire separation elements ' +
      'protecting the shared escape route in a two-flat building. Where the construction cannot be confirmed ' +
      'by visual inspection alone — particularly in buildings from the 1950–1970 period, where substandard ' +
      'materials were common — compartmentation uncertainty may significantly affect escape ' +
      'route protection for both households. LACORS §19 and §20 require adequate separation ' +
      'between the escape route and each dwelling.',
    text:
      'The staircase enclosure is likely to be a critical fire separation element, but its ' +
      'construction cannot currently be verified from a visual inspection alone. Consider a ' +
      'concealed inspection opening or other investigation to determine board construction and ' +
      'continuity. If the board thickness proves to be below 12.5mm or the construction is ' +
      'otherwise inadequate, upgrade works may be required.',
    applies_when_separate_entrance: false,
    regulatory_refs: [
      'LACORS Housing — Fire Safety (2008) §19',
      'LACORS Housing — Fire Safety (2008) §20',
    ],
  },

  {
    id: 'R-S02',
    title: 'Stair enclosure likely to provide inadequate separation',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark', 'council-confirmed'],
    condition: {
      type: 'or',
      conditions: [
        { type: 'leaf', question_id: 'D10', in_values: ['timber_panelling'] },
        { type: 'leaf', question_id: 'D16', in_values: ['no'] },
        { type: 'leaf', question_id: 'D15', in_values: ['unsealed'] },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'Timber panelling provides negligible fire resistance and, if used as the main stair ' +
      'enclosure lining, does not meet the LACORS §19 expectation of 30-minute fire separation ' +
      'between the escape route and each dwelling. An incomplete enclosure (gaps or breaks) ' +
      'defeats compartmentation regardless of lining material. Unsealed penetrations allow fire ' +
      'and smoke to bypass the enclosure even where the main surface is adequate (LACORS §20).',
    text:
      'The stair enclosure may not provide sufficient separation between flats and escape ' +
      'routes. Further investigation and possible upgrade works should be considered. Where ' +
      'timber panelling is used, replacement with 12.5mm plasterboard lining is the standard ' +
      'remediation. Where the enclosure is incomplete, continuity must be restored. Unsealed ' +
      'penetrations should be fire-stopped with an appropriate intumescent product.',
    risk_level_expressions: {
      elevated:
        'The stair enclosure appears to provide inadequate separation at a property with ' +
        'elevated overall risk. Targeted investigation and upgrade works are strongly recommended ' +
        'to address the identified deficiency before the next tenancy renewal.',
      high:
        'The stair enclosure appears to provide inadequate separation at a high-risk property. ' +
        'This is a priority finding. Upgrade works should be specified and carried out as soon ' +
        'as reasonably practicable. Richmond Council may require confirmation of remediation.',
    },
    applies_when_separate_entrance: false,
    regulatory_refs: [
      'LACORS Housing — Fire Safety (2008) §19',
      'LACORS Housing — Fire Safety (2008) §20',
      'Housing Act 2004, s.1 (HHSRS)',
    ],
  },

  {
    id: 'R-S03',
    title: 'Hidden void continuity may allow fire spread',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['LACORS-benchmark', 'advisory'],
    condition: { type: 'leaf', question_id: 'D17', in_values: ['yes'] },
    confidence: 'confirmed',
    risk_basis:
      'Continuous concealed voids — such as spaces within stud partitions or above suspended ' +
      'ceilings — can act as hidden fire paths that bypass compartmentation, allowing fire and ' +
      'smoke to travel between floors or dwellings without passing through any fire-resisting ' +
      'element. LACORS §20 requires that all such voids be fire-stopped at each floor level.',
    text:
      'Concealed voids that run continuously within or alongside the stair enclosure may allow ' +
      'fire and smoke to spread between dwellings even where the visible surfaces appear ' +
      'adequate. An investigation to identify the extent of any voids and confirm or install ' +
      'fire stopping at each floor level is recommended. A qualified fire risk assessor or ' +
      'contractor should carry out this work.',
    applies_when_separate_entrance: false,
    regulatory_refs: [
      'LACORS Housing — Fire Safety (2008) §20',
      'Housing Act 2004, s.1 (HHSRS)',
    ],
  },

  // =========================================================================
  // B — External escape route from the upper flat
  // =========================================================================

  {
    id: 'R-B01',
    title: 'Verify external escape route from the upper flat — usability not confirmed',
    tier: 'advisory',
    legal_status: 'advisory',
    basis: ['advisory'],
    condition: {
      type: 'classification',
      field: 'upper_external_escape_viable',
      in_values: ['unknown'],
    },
    confidence: 'confirmed',
    risk_basis:
      'The upper flat appears to have an independent external escape route, but its usability ' +
      'has not been confirmed from the answers provided. An unverified external route cannot ' +
      'be credited as reducing sole-route dependency on the shared entrance hall and staircase. ' +
      'Until the route is confirmed as permanently accessible, unobstructed, key-free from ' +
      'inside, and in sound structural condition, the shared staircase must continue to be ' +
      'treated as the primary escape route for risk assessment purposes.',
    text:
      'The upper flat appears to have an independent external escape route, but its usability ' +
      'has not been confirmed. Verify the following on site:\n' +
      '• The route is permanently accessible without a key from inside the flat\n' +
      '• The route is not obstructed by stored items, locked gates, or physical barriers\n' +
      '• Any external staircase or structure is in sound structural condition\n' +
      'Until confirmed, the shared entrance hall and staircase should be treated as the primary ' +
      'escape route for risk assessment purposes. Update the assessment once the route is verified.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §14'],
  },

  {
    id: 'R-B02',
    title: 'Restore or repair the external escape route from the upper flat',
    tier: 'recommended',
    legal_status: 'lacors_recommendation',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        // Independent exit exists (B2 is yes_*)
        {
          type: 'classification',
          field: 'upper_flat_independent_exit',
          in_values: ['yes'],
        },
        // But the route is not viable (obstructed, locked, or poor condition)
        {
          type: 'classification',
          field: 'upper_external_escape_viable',
          in_values: ['no'],
        },
      ],
    },
    confidence: 'confirmed',
    risk_basis:
      'An independent external escape route exists for the upper flat, but it cannot currently ' +
      'be relied upon — it is either obstructed, locked, or in poor structural condition. ' +
      'An inoperable escape route provides no protection at the moment it is needed. Until ' +
      'repaired or confirmed usable, the shared entrance hall and internal staircase must be ' +
      'treated as the primary escape route. LACORS §14 requires that escape routes be ' +
      'accessible and practicable.',
    text:
      'The external escape route from the upper flat cannot currently be relied upon. The route ' +
      'is either obstructed, locked from the inside, or in poor structural condition. Remedial ' +
      'action is required:\n' +
      '• Remove any obstruction or stored items blocking the external route\n' +
      '• Ensure the exit can be opened from the inside without a key\n' +
      '• Repair any structural defects in the external staircase or platform\n' +
      'Until the route is fully restored, treat the shared entrance hall and staircase as the ' +
      'primary escape route and apply staircase compartmentation requirements accordingly.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §14'],
  },
]
