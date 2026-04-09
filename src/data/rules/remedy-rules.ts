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
export const RULES_VERSION = '2026-04-v2' as const
export const RULES_DATE = '2026-04-09' as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RemedyTier = 'mandatory' | 'recommended' | 'advisory'

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
    | 'inner_room_present'
    | 'upper_flat_independent_exit'
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
    title: 'Install fire detection immediately — no alarms currently present',
    tier: 'recommended',
    basis: ['LACORS-benchmark', 'council-confirmed'],
    condition: { type: 'leaf', question_id: 'E1', in_values: ['none'] },
    confidence: 'confirmed',
    risk_basis:
      'No fire detection equipment is present in the property. This is the single largest ' +
      'fire safety gap identified: fire detection is a baseline requirement for all residential ' +
      'properties and is particularly critical in multi-occupied buildings where a fire in one ' +
      'flat may not be immediately apparent to occupants of another. LACORS Table C2 identifies ' +
      'Grade D mains-wired alarms as the expected standard for this property type. The absence ' +
      'of any alarms substantially increases the overall risk.',
    text:
      'No fire alarms are present. A Grade D mains-wired fire detection system (with integral ' +
      'battery backup) should be installed as a matter of urgency. In a communal-entrance ' +
      'property, this includes a smoke alarm in the communal hallway, interlinked heat detectors ' +
      'in each flat entrance lobby, and smoke alarms in living areas of each flat. ' +
      'Works must be carried out by a qualified electrician.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS Table C2', 'LACORS Table C4', 'BS 5839-6:2019'],
  },

  {
    id: 'R-E01',
    title: 'Review and upgrade fire detection to Grade D mains-wired standard',
    tier: 'recommended',
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
    tier: 'recommended',
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
    title: 'Confirm alarm interlink — alarms currently not interlinked',
    tier: 'recommended',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        { type: 'leaf', question_id: 'E6', in_values: ['no', 'partial', 'not_sure'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'Interlinked alarms ensure that when any one alarm activates, all alarms in the building ' +
      'sound. In a two-flat converted building, a fire starting in one flat should alert ' +
      'occupants of the other flat immediately. Non-interlinked alarms do not achieve this — ' +
      'a ground-floor fire may not trigger the upper flat\'s alarm until the fire has progressed. ' +
      'LACORS §18.6 addresses interlinking requirements for multi-occupied premises.',
    text:
      'Alarms in the building are not confirmed as interlinked. For a Section 257 HMO, ' +
      'alarms should be interlinked so that all sound together when any single detector activates. ' +
      'If the system is Grade D mains-wired, interlinking is straightforward. Seek advice from ' +
      'a qualified electrician on how to achieve interlinking for the installed system.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §18.6'],
  },

  // =========================================================================
  // F — Doors and egress
  // =========================================================================

  {
    id: 'R-F01',
    title: 'Fit self-closing devices to flat entrance door',
    tier: 'recommended',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'leaf',
      question_id: 'F1',
      in_values: ['functioning_self_closer'],
      negate: true,
    },
    confidence: 'probable',
    risk_basis:
      'Flat entrance doors without self-closing devices allow fire and smoke from within the flat ' +
      'to pass into the escape route if the door is left open during evacuation. LACORS §21.5 ' +
      'states that entrance doors to self-contained flats should be fitted with self-closers. ' +
      'This is a general expectation for Section 257 HMOs. At lower risk levels a well-fitting ' +
      'solid door may be tolerated in practice; at elevated or high risk the self-closer becomes ' +
      'more pressing because it is the first line of protection for the escape route.',
    text:
      'A self-closing device should be fitted to the flat entrance door. ' +
      'LACORS §21.5 states that entrance doors to self-contained flats should close automatically. ' +
      'This limits the spread of fire and smoke from within the flat into the escape route if the ' +
      'door is left open during evacuation.',
    risk_level_expressions: {
      elevated:
        'A functioning self-closer on the flat entrance door is strongly recommended and should ' +
        'be fitted as a priority. At this overall risk level, protecting the escape route from ' +
        'smoke and fire spread through an open door is particularly important.',
      high:
        'A functioning self-closer on the flat entrance door should be fitted urgently. Where no ' +
        'qualifying escape window exists, the door is the primary barrier protecting the escape ' +
        'route — a door that does not self-close is a serious gap.',
    },
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §21.5'],
  },

  {
    id: 'R-F02',
    title: 'Assess flat entrance door construction against escape route risk',
    tier: 'recommended',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        // No qualifying bedroom escape window (sole escape is staircase or front door)
        { type: 'escape_window', room: 'bedroom_1', in_statuses: ['does-not-qualify', 'unknown'] },
        // No independent rear exit
        { type: 'leaf', question_id: 'B2', in_values: ['no'] },
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
    title: 'Fit or repair self-closer on communal front door',
    tier: 'recommended',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_COMMUNAL,
        { type: 'leaf', question_id: 'F6', in_values: ['fitted_not_working', 'no', 'not_sure'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'The communal front door is the final means of exit from the building and the primary ' +
      'barrier preventing external fire or unauthorised access from entering the escape route. ' +
      'LACORS §21.5 addresses the importance of self-closing devices on communal entrance doors. ' +
      'A door that is left open or propped open undermines the compartmentation of the entire ' +
      'escape route.',
    text:
      'The communal front door should be fitted with a functioning self-closer. This ensures the ' +
      'door returns to a closed position after use, maintaining compartmentation of the communal ' +
      'escape route.',
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
    tier: 'advisory',
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
      'until physically verified. Hardboard — a common material in older conversions — ' +
      'provides no fire resistance. Open bannisters provide no enclosure at all. Both ' +
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
    title: 'Provide fire-resisting enclosure for cupboard or meter box in communal staircase',
    tier: 'recommended',
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
      'A cupboard, storage space, or meter box located within the communal staircase without ' +
      'a fire-resisting door and enclosure provides a concealed void where a fire can start ' +
      'and develop undetected before entering the escape route. Combustible items stored in ' +
      'such a space (coats, cleaning materials, cardboard) increase the fuel load. LACORS ' +
      'considers ignition risk in the escape route as a material factor.',
    text:
      'A cupboard or meter box is present within the communal staircase without a fire-resisting ' +
      'door and enclosure. The enclosure should be upgraded to include a fire-resisting door ' +
      '(FD30 minimum) that is self-closing. Any combustible materials stored within should be ' +
      'removed.',
    applies_when_separate_entrance: false,
    regulatory_refs: ['LACORS §19.6', 'LACORS §21.5'],
  },

  {
    id: 'R-D07',
    title: 'Assess floor/ceiling fire separation between the two flats',
    tier: 'recommended',
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
      'assessment for converted buildings. Fire spreading from one flat to another would ' +
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
    tier: 'recommended',
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
    title: 'No qualifying bedroom escape window and no rear exit — assess escape route adequacy',
    tier: 'advisory',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        { type: 'escape_window', room: 'bedroom_1', in_statuses: ['does-not-qualify', 'unknown'] },
        { type: 'leaf', question_id: 'B2', in_values: ['no'] },
      ],
    },
    confidence: 'probable',
    risk_basis:
      'LACORS §14 identifies qualifying escape windows as a key component of the escape strategy ' +
      'for upper flats in converted buildings. Where the main bedroom escape window does not ' +
      'qualify and no independent rear exit exists, the staircase or front door is the only ' +
      'practical means of escape. This means any fire in the communal area or at the main exit ' +
      'leaves occupants with no alternative. This is a material risk factor that should inform ' +
      'the assessment of the flat entrance door, the staircase enclosure, and detection provision.',
    text:
      'The main bedroom escape window does not appear to qualify under LACORS §14 criteria, and ' +
      'no independent rear exit exists. The staircase or front door is the primary — and possibly ' +
      'only — means of escape. This finding should be read alongside the flat entrance door ' +
      'assessment (R-F02) and the staircase protection findings. Improving the fire resistance ' +
      'of the escape route becomes more important where no window alternative exists. Physical ' +
      'verification of the window dimensions and opening characteristics is recommended.',
    applies_when_separate_entrance: true,
    regulatory_refs: ['LACORS §14', 'LACORS Case Study D10'],
  },

  {
    id: 'R-C10',
    title: 'Inner room situation — bedroom accessible only through another habitable room',
    tier: 'advisory',
    basis: ['LACORS-benchmark'],
    condition: {
      type: 'and',
      conditions: [
        IS_SECTION_257,
        { type: 'classification', field: 'inner_room_present', in_values: ['yes'] },
      ],
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
    title: 'Commission documented fire risk assessment for common parts',
    tier: 'recommended',
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
      'of multi-occupied residential buildings. The responsible person (typically the landlord ' +
      'or managing agent) must carry out a suitable and sufficient fire risk assessment for the ' +
      'common parts and implement appropriate fire safety measures. This is a legal obligation ' +
      'for properties with communal areas, not merely a LACORS recommendation.',
    text:
      'No documented fire risk assessment for the common parts of the building is in place. ' +
      'Under the Regulatory Reform (Fire Safety) Order 2005, a suitable and sufficient fire ' +
      'risk assessment must be carried out by the responsible person. This should be documented, ' +
      'kept up to date, and reviewed when any significant changes occur to the building or its ' +
      'occupants. For a building of this type and risk level, a formal assessment by a competent ' +
      'person is strongly recommended.',
    risk_level_expressions: {
      elevated:
        'A documented fire risk assessment for the common parts is a legal requirement and is ' +
        'particularly pressing at this overall risk level. Commission a formal assessment by a ' +
        'competent person promptly.',
      high:
        'A formal fire risk assessment by a competent person is a legal requirement and should ' +
        'be commissioned as an immediate priority given the overall risk level identified. ' +
        'Do not wait for remedial works to be completed before commissioning the assessment.',
    },
    applies_when_separate_entrance: false,
    regulatory_refs: [
      'Regulatory Reform (Fire Safety) Order 2005, Article 9',
      'LACORS §5',
    ],
  },
]
