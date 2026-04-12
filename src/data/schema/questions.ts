/**
 * questions.ts — Question bank and branching schema.
 *
 * This file defines ALL questions the tool can ask. It does NOT import from
 * React, engine modules, or persistence. It is pure declarative data.
 *
 * The navigator engine (src/engine/navigator.ts) reads this schema to decide
 * which question to show next. UI components never read branching logic
 * directly — they only receive the current Question from the engine.
 *
 * HOW TO ADD QUESTIONS:
 *   1. Add an entry to the QUESTIONS array.
 *   2. Add branching conditions in the show_when field if needed.
 *   3. The navigator picks it up automatically.
 *
 * Uncertainty behaviour codes (§6.1):
 *   BLOCK_CLASS   — prevents classification from being confirmed
 *   CONSERVATIVE  — apply the stricter interpretation in remedies / risk scoring
 *   ADVISORY_ONLY — generate advisory item only, do not contribute to risk score
 *   DEFER         — defer all dependencies until resolved
 *   RISK_ELEVATE  — unknown treated as a risk factor contribution (weight 1)
 */

import type { SectionId } from '../../state/AppState'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UncertaintyBehaviour =
  | 'BLOCK_CLASS'
  | 'CONSERVATIVE'
  | 'ADVISORY_ONLY'
  | 'DEFER'
  | 'RISK_ELEVATE'

export type QuestionType =
  | 'single-choice'   // Radio buttons — one answer from a fixed list
  | 'multi-choice'    // Checkboxes — one or more from a fixed list
  | 'text'            // Free-text input
  | 'address'         // Structured address (special UI treatment)
  | 'number'          // Numeric input

export interface AnswerOption {
  value: string
  label: string
  /** If set, selecting this option routes to the out-of-scope screen. */
  triggers_out_of_scope?: boolean
  /** Shown on the out-of-scope screen when this option is selected. */
  out_of_scope_reason?: string
}

export interface BranchCondition {
  /** The question whose answer is tested. */
  when_question: string
  /** The answer value(s) that must be present to follow this branch. */
  has_value: string | string[]
  /** If true, matches when the value is NOT in has_value. */
  negate?: boolean
}

/**
 * Which part of the building this question addresses.
 * Displayed as a contextual badge in the questionnaire UI so the user
 * always knows which unit or area they are answering about.
 *
 *   'building' — the whole building (legal classification, structure)
 *   'ground'   — the ground floor flat specifically
 *   'upper'    — the upper flat specifically
 *   'common'   — communal parts (shared staircase, entrance hall, etc.)
 *
 * Omit (undefined) for questions that apply equally to all units and where
 * a badge would add no useful context.
 */
export type QuestionScope = 'building' | 'ground' | 'upper' | 'common'

export interface Question {
  id: string
  section: SectionId
  /** 1-based position within the section (for display: "Question 2 of 5"). */
  section_position: number
  type: QuestionType
  text: string
  help_text?: string
  options?: AnswerOption[]
  /** If ALL conditions are satisfied, this question is shown; else skipped. */
  show_when?: BranchCondition[]
  /** Uncertainty behaviour when the user answers "not sure" / "unknown". */
  uncertainty_behaviour?: UncertaintyBehaviour
  /** Whether a "Not sure" option is offered in addition to explicit options. */
  allow_not_sure?: boolean
  required: boolean
  /**
   * Which part of the building this question addresses.
   * Rendered as a scope badge in the questionnaire UI.
   * Omit for building-wide or cross-cutting questions.
   */
  scope?: QuestionScope
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

export const QUESTIONS: Question[] = [
  // =========================================================================
  // Property Setup
  // =========================================================================
  {
    id: 'P1',
    section: 'setup',
    section_position: 1,
    type: 'address',
    text: 'What is the address of the property?',
    help_text:
      'Enter the address of the building (not the individual flat). ' +
      'The postcode must be in the London Borough of Richmond upon Thames.',
    required: true,
    scope: 'building',
  },
  {
    id: 'P2',
    section: 'setup',
    section_position: 2,
    type: 'text',
    text: 'Flat or unit reference (optional)',
    help_text:
      'e.g. Ground Floor, First Floor, Flat A/B, or a number. ' +
      'Used as a label in the report only — not used in compliance logic. ' +
      'Answer all questions based on the property as it exists today — not ' +
      'planned future changes or works already arranged but not yet complete.',
    required: false,
    scope: 'building',
  },

  // =========================================================================
  // Section A — Building Origin and Classification
  // =========================================================================
  {
    id: 'A1',
    section: 'A',
    section_position: 1,
    type: 'single-choice',
    text: 'How was this building originally constructed?',
    help_text:
      'A purpose-built block is assessed as a non-Section-257 rented property — statutory ' +
      'obligations (gas safety, electrical safety, smoke and CO alarms) still apply and will ' +
      'be identified. A converted house with a single original staircase now serving both flats ' +
      'is almost certainly a conversion, not purpose-built.',
    options: [
      {
        value: 'converted',
        label: 'It was a single dwelling (house) that was later converted into flats',
      },
      {
        value: 'purpose-built',
        label: 'It was purpose-built as two or more maisonettes or flats',
      },
      { value: 'not_sure', label: "I don't know / not sure" },
    ],
    uncertainty_behaviour: 'BLOCK_CLASS',
    required: true,
    scope: 'building',
  },
  {
    id: 'A2',
    section: 'A',
    section_position: 2,
    type: 'single-choice',
    text:
      'Was this conversion completed before 1991, OR is there evidence it does not ' +
      'comply with Building Regulations 1991?',
    help_text:
      'A pre-1991 conversion, or a conversion evidenced as non-compliant with the 1991 ' +
      'Building Regulations, meets the Section 257 HMO classification criterion under the ' +
      'Housing Act 2004. A post-1991 compliant conversion does not meet this criterion — ' +
      'the property will be assessed as a non-Section-257 privately rented property and ' +
      'statutory obligations will still be identified.',
    show_when: [{ when_question: 'A1', has_value: 'converted' }],
    options: [
      { value: 'yes', label: 'Yes — pre-1991 or visibly non-compliant' },
      { value: 'no', label: 'No — completed in 1991 or later and likely compliant' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'BLOCK_CLASS',
    required: true,
    scope: 'building',
  },
  {
    id: 'A3',
    section: 'A',
    section_position: 3,
    type: 'single-choice',
    text: 'How many separate self-contained flats does this building contain?',
    help_text:
      'This tool is scoped to buildings with exactly two self-contained flats. ' +
      'Section 257 HMO classification under the Housing Act 2004 is not limited to two-flat ' +
      'buildings in statute — it applies to converted blocks generally. This tool does not ' +
      'assess buildings with three or more flats; a qualified assessor should be consulted. ' +
      'Where three or more flats are confirmed, statutory obligations (gas safety, electrical ' +
      'safety, smoke and CO alarms) are still identified as far as this tool permits.',
    options: [
      { value: '2', label: 'Two flats' },
      { value: '3_or_more', label: 'Three or more flats' },
      {
        value: 'not_flats',
        label: 'It is not divided into self-contained flats',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'This tool applies to buildings divided into self-contained flats. ' +
          'Contact Richmond Council or a qualified assessor for guidance on your property type.',
      },
    ],
    required: true,
    scope: 'building',
  },
  {
    id: 'A4',
    section: 'A',
    section_position: 4,
    type: 'single-choice',
    text: 'What is the owner-occupation status of the two flats?',
    help_text:
      'Owner-occupation status affects the Section 257 HMO classification and the confidence ' +
      'level of this assessment. One owner-occupied flat in a two-flat building represents ' +
      '50% owner occupation — below the two-thirds threshold in Schedule 14 of the Housing ' +
      'Act 2004 that would exclude the building from HMO classification. The assessment ' +
      'continues with a reduced confidence level where one flat is owner-occupied.',
    options: [
      {
        value: 'none_owner_occupied',
        label: 'Both flats are privately rented — neither is owner-occupied',
      },
      {
        value: 'one_owner_occupied',
        label: 'One flat is owner-occupied, one is privately rented',
      },
      {
        value: 'social',
        label: 'One or both flats are let by a housing association or council',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'BLOCK_CLASS',
    required: true,
    scope: 'building',
  },
  {
    id: 'A5',
    section: 'A',
    section_position: 5,
    type: 'single-choice',
    text: 'Is this property located in the London Borough of Richmond upon Thames?',
    help_text:
      'This tool uses Richmond Council guidance and confirmed council positions for ' +
      'comparable properties. It applies only to properties in the London Borough of ' +
      'Richmond upon Thames.',
    options: [
      { value: 'yes', label: 'Yes — the property is in Richmond upon Thames' },
      {
        value: 'no',
        label: 'No — the property is outside Richmond upon Thames',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'This tool applies to properties in the London Borough of Richmond upon Thames. ' +
          'For properties in other areas, consult your local housing authority or a ' +
          'qualified fire risk assessor.',
      },
    ],
    required: true,
    scope: 'building',
  },

  // =========================================================================
  // Section B — Building Configuration and Travel Distance
  // =========================================================================
  {
    id: 'B1',
    section: 'B',
    section_position: 1,
    type: 'single-choice',
    text: 'Do the two flats share a communal internal entrance hall or staircase?',
    help_text:
      'A communal entrance means both flats are accessed through a single shared ' +
      'front door and internal hall/staircase. Separate entrances means each flat ' +
      'has its own street-level front door with no shared internal space.',
    options: [
      { value: 'communal', label: 'Yes — shared communal entrance and staircase' },
      { value: 'separate', label: 'No — each flat has its own separate entrance' },
    ],
    required: true,
    scope: 'building',
  },
  {
    id: 'B2',
    section: 'B',
    section_position: 2,
    type: 'single-choice',
    text: 'Does the upper flat have an independent rear exit that does not use the main staircase?',
    help_text:
      'For example, an external rear staircase, a door opening directly to a garden ' +
      'or outside space, or a fire escape. An independent rear exit provides an ' +
      'alternative escape route if the main staircase is compromised.',
    options: [
      {
        value: 'yes',
        label: 'Yes — external rear staircase or door to garden / outside',
      },
      { value: 'no', label: 'No — staircase and front door only' },
    ],
    required: true,
    scope: 'upper',
  },
  {
    id: 'B3',
    section: 'B',
    section_position: 3,
    type: 'single-choice',
    text: 'Does the ground floor flat have a rear exit (back door to garden or outside space)?',
    help_text:
      'A direct rear exit — such as a back door opening to a garden or external space — ' +
      'provides an alternative escape route for ground floor occupants if the main front ' +
      'door is blocked. Where a qualifying rear exit exists, window-based escape criteria ' +
      'carry less weight for the ground floor flat.',
    options: [
      { value: 'yes', label: 'Yes — back door or direct exit to garden / outside space' },
      { value: 'no', label: 'No — front door only' },
    ],
    required: true,
    scope: 'ground',
  },
  {
    id: 'B4',
    section: 'B',
    section_position: 4,
    type: 'single-choice',
    text: 'What is the approximate floor level of the upper flat above external ground?',
    help_text:
      'This affects whether upper-floor windows can qualify as escape windows. ' +
      'LACORS §14 requires that a qualifying escape window must be at a floor level ' +
      'no higher than 4.5 metres above external ground. If not sure, answer "Not sure."',
    options: [
      {
        value: '2.5_4m',
        label: '2.5–4 metres — typical two-storey Victorian or Edwardian house',
      },
      {
        value: 'above_4.5m',
        label: 'Above 4.5 metres — taller than a typical two-storey house',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'B5',
    section: 'B',
    section_position: 5,
    type: 'single-choice',
    text: 'Is the ground floor raised significantly above street or garden level?',
    help_text:
      'For example, the entrance is up several steps. A raised ground floor increases ' +
      'the effective height of upper-floor windows above external ground, which affects ' +
      'whether those windows qualify as escape openings.',
    options: [
      { value: 'no', label: 'No — roughly at ground level' },
      { value: 'yes', label: 'Yes — raised ground floor (several steps up to entrance)' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'building',
  },
  {
    id: 'B6',
    section: 'B',
    section_position: 6,
    type: 'single-choice',
    text: 'Is the upper flat single-storey, or does it extend across two levels internally?',
    help_text:
      'A maisonette with its own internal staircase introduces additional escape route ' +
      'complexity. If the upper flat occupies only one floor level, answer "Single-storey."',
    options: [
      { value: 'single_storey', label: 'Single-storey — one floor level only' },
      {
        value: 'two_level_maisonette',
        label: 'Two-level maisonette — has its own internal staircase',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'upper',
  },
  {
    id: 'B7',
    section: 'B',
    section_position: 7,
    type: 'single-choice',
    text:
      'Is there direct access to outside from the foot of the main staircase without ' +
      'passing through any other room or door?',
    help_text:
      'In the ideal escape route configuration, the building entrance door opens directly from the ' +
      'foot of the staircase to the street or garden. An intermediate room or a ' +
      'secondary locked door worsens the escape route.',
    options: [
      {
        value: 'yes',
        label: 'Yes — building entrance door opens directly to street or garden from foot of stairs',
      },
      {
        value: 'no',
        label: 'No — intermediate space, lobby, or additional door intervenes',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'B8',
    section: 'B',
    section_position: 8,
    type: 'single-choice',
    text:
      'In the upper flat, approximately how far is it from the furthest point of any ' +
      'bedroom to the flat\'s front door (or top of the main staircase)?',
    help_text:
      'This is an estimate to help assess whether the escape route is straightforward ' +
      'or extended. LACORS considers the complexity and length of the route as part of ' +
      'the risk assessment. A short direct route is safer than a long or indirect one.',
    options: [
      {
        value: 'short',
        label:
          'Short — appears to be under 7 metres (most rooms open directly off a short hallway)',
      },
      {
        value: 'medium',
        label: 'Medium — roughly 7–15 metres (longer corridor or route through several rooms)',
      },
      {
        value: 'long',
        label:
          'Long — appears to be over 15 metres or involves multiple changes of direction',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },

  // =========================================================================
  // Section C — Escape Routes
  // (Questions C1–C14 relate to the upper flat. The ground floor flat's primary
  // escape is via its front door and rear exit — assessed in Section B.)
  // =========================================================================

  // --- Bedroom 1 (upper flat) ---
  {
    id: 'C1',
    section: 'C',
    section_position: 1,
    type: 'single-choice',
    text: 'Does the main bedroom (bedroom 1) in the upper flat have a window that can be opened?',
    help_text:
      'An openable window in a bedroom can serve as a means of escape or rescue if the ' +
      'main exit is blocked by fire. Answer "No" if the window is fixed (does not open) ' +
      'or is permanently sealed.',
    options: [
      { value: 'yes', label: 'Yes — the bedroom has an openable window' },
      { value: 'no', label: 'No — fixed or sealed window, or no window' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C1_type',
    section: 'C',
    section_position: 2,
    type: 'single-choice',
    text: 'What type of opening does the bedroom 1 window have?',
    help_text:
      'The type of opening affects whether the window can physically serve as an escape opening. ' +
      'A top-hung-only window that opens by tilting inward at the top provides limited clearance ' +
      'and may not allow a person to climb through even if the nominal opening area meets the ' +
      '0.33m² criterion. A side-hung casement or sash that opens fully generally provides better ' +
      'escape access. Full-height glazed doors (e.g. a Juliet-style door with an opening panel) ' +
      'can qualify if all other LACORS §14 criteria are met.',
    show_when: [{ when_question: 'C1', has_value: 'yes' }],
    options: [
      { value: 'side_hung', label: 'Side-hung casement — opens to the side like a door' },
      {
        value: 'sash',
        label: 'Sash window — slides up and down (lower sash opens)',
      },
      {
        value: 'top_hung_only',
        label: 'Top-hung only — tilts inward at the top; no full side or bottom opening',
      },
      {
        value: 'full_height_door',
        label: 'Full-height glazed door or Juliet door with an opening panel',
      },
      { value: 'other_unknown', label: 'Other type or unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },

  {
    id: 'C2',
    section: 'C',
    section_position: 3,
    type: 'single-choice',
    text: 'Can the bedroom 1 window be opened without using a key?',
    help_text:
      'A qualifying escape window must be operable without a key. Windows that require ' +
      'a key to open them (e.g. security window locks) do not qualify unless the key is ' +
      'permanently fixed in the lock and accessible to a person escaping.',
    show_when: [{ when_question: 'C1', has_value: 'yes' }],
    options: [
      { value: 'yes', label: 'Yes — no key required to open it' },
      { value: 'no', label: 'No — requires a key' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C3',
    section: 'C',
    section_position: 4,
    type: 'single-choice',
    text: 'Is the bedroom 1 window sill at approximately 1,100mm or less above the floor?',
    help_text:
      'LACORS §14 requires the sill of a qualifying escape window to be no more than ' +
      '1,100mm above the floor so that a person can climb through. If the sill is higher, ' +
      'the window is unlikely to qualify as an escape window.',
    show_when: [{ when_question: 'C1', has_value: 'yes' }],
    options: [
      { value: 'yes', label: 'Yes — sill appears to be 1,100mm or less from the floor' },
      { value: 'no', label: 'No — sill is higher than 1,100mm' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C4',
    section: 'C',
    section_position: 5,
    type: 'single-choice',
    text:
      'When fully open, does the bedroom 1 window provide a clear openable area of at ' +
      'least 0.33 square metres?',
    help_text:
      'LACORS §14 specifies a minimum clear opening area of 0.33m² for a qualifying ' +
      'escape window. This is roughly equivalent to a window opening approximately ' +
      '450mm wide by 750mm tall, or 600mm wide by 550mm tall.',
    show_when: [{ when_question: 'C1', has_value: 'yes' }],
    options: [
      {
        value: 'yes',
        label: 'Yes — appears to provide at least 0.33m² clear opening',
      },
      {
        value: 'no',
        label: 'No — opening appears smaller than 0.33m²',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C5',
    section: 'C',
    section_position: 6,
    type: 'single-choice',
    text:
      'Is there any obstruction below or outside the bedroom 1 window that would prevent ' +
      'escape or rescue — such as a conservatory, railings, or a basement light well?',
    show_when: [{ when_question: 'C1', has_value: 'yes' }],
    options: [
      { value: 'no', label: 'No — no obstruction below or outside the window' },
      {
        value: 'yes',
        label: 'Yes — conservatory, railings, or other obstruction present',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },

  // --- Second bedroom ---
  {
    id: 'C6',
    section: 'C',
    section_position: 7,
    type: 'single-choice',
    text: 'Is there a second bedroom in the flat you are assessing?',
    options: [
      { value: 'yes', label: 'Yes — there is a second bedroom' },
      { value: 'no', label: 'No — only one bedroom' },
    ],
    required: true,
    scope: 'upper',
  },
  {
    id: 'C7',
    section: 'C',
    section_position: 8,
    type: 'single-choice',
    text: 'Does bedroom 2 have a window that can be opened?',
    show_when: [{ when_question: 'C6', has_value: 'yes' }],
    options: [
      { value: 'yes', label: 'Yes — the bedroom has an openable window' },
      { value: 'no', label: 'No — fixed or sealed window, or no window' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C9a',
    section: 'C',
    section_position: 9,
    type: 'single-choice',
    text: 'Can the bedroom 2 window be opened without using a key?',
    show_when: [
      { when_question: 'C6', has_value: 'yes' },
      { when_question: 'C7', has_value: 'yes' },
    ],
    options: [
      { value: 'yes', label: 'Yes — no key required' },
      { value: 'no', label: 'No — requires a key' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C9b',
    section: 'C',
    section_position: 10,
    type: 'single-choice',
    text: 'Is the bedroom 2 window sill at approximately 1,100mm or less above the floor?',
    show_when: [
      { when_question: 'C6', has_value: 'yes' },
      { when_question: 'C7', has_value: 'yes' },
    ],
    options: [
      { value: 'yes', label: 'Yes — sill is 1,100mm or less from the floor' },
      { value: 'no', label: 'No — sill is higher than 1,100mm' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C9c',
    section: 'C',
    section_position: 11,
    type: 'single-choice',
    text:
      'When fully open, does the bedroom 2 window provide a clear openable area of at ' +
      'least 0.33 square metres?',
    show_when: [
      { when_question: 'C6', has_value: 'yes' },
      { when_question: 'C7', has_value: 'yes' },
    ],
    options: [
      { value: 'yes', label: 'Yes — appears to provide at least 0.33m² clear opening' },
      { value: 'no', label: 'No — opening appears smaller than 0.33m²' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C9d',
    section: 'C',
    section_position: 12,
    type: 'single-choice',
    text:
      'Is there any obstruction below or outside the bedroom 2 window that would ' +
      'prevent escape or rescue?',
    show_when: [
      { when_question: 'C6', has_value: 'yes' },
      { when_question: 'C7', has_value: 'yes' },
    ],
    options: [
      { value: 'no', label: 'No — no obstruction' },
      { value: 'yes', label: 'Yes — conservatory, railings, or other obstruction' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C9e',
    section: 'C',
    section_position: 13,
    type: 'single-choice',
    text:
      'Can bedroom 2 be reached without passing through a room with a lockable door ' +
      'that is not the front door of the flat?',
    help_text:
      'If bedroom 2 is accessible only through a living room or another bedroom that ' +
      'has a lockable door, the window in bedroom 2 may not qualify as an escape window ' +
      'because occupants of bedroom 1 (or the corridor) cannot reach it.',
    show_when: [
      { when_question: 'C6', has_value: 'yes' },
      { when_question: 'C7', has_value: 'yes' },
    ],
    options: [
      { value: 'yes', label: 'Yes — accessible from the hallway without locked doors' },
      {
        value: 'no',
        label: 'No — must pass through a lockable room to reach bedroom 2',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },

  // --- Inner rooms and escape route geometry ---
  {
    id: 'C10',
    section: 'C',
    section_position: 14,
    type: 'single-choice',
    text:
      'Is there any bedroom in the flat that can only be reached by passing through ' +
      'another habitable room (an "inner room" situation)?',
    help_text:
      'An inner room is one where the only way in or out is through another habitable ' +
      'room. If a fire starts in the outer room, the occupant of the inner room cannot ' +
      'escape without passing through the fire. This is a significant risk factor.',
    options: [
      {
        value: 'no',
        label: 'No — all bedrooms open onto a hallway or landing directly',
      },
      {
        value: 'yes',
        label: 'Yes — at least one bedroom can only be reached through another habitable room',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'DEFER',
    required: true,
    scope: 'upper',
  },

  // --- Living room window ---
  {
    id: 'C11',
    section: 'C',
    section_position: 15,
    type: 'single-choice',
    text: 'Does the living room have a window that can be opened?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No — fixed or sealed window, or no window' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'upper',
  },
  {
    id: 'C11a',
    section: 'C',
    section_position: 16,
    type: 'single-choice',
    text: 'Can the living room window be opened without a key?',
    show_when: [{ when_question: 'C11', has_value: 'yes' }],
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No — requires a key' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C11b',
    section: 'C',
    section_position: 17,
    type: 'single-choice',
    text: 'Is the living room window sill at approximately 1,100mm or less above the floor?',
    show_when: [{ when_question: 'C11', has_value: 'yes' }],
    options: [
      { value: 'yes', label: 'Yes — sill is 1,100mm or less' },
      { value: 'no', label: 'No — sill is higher than 1,100mm' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C11c',
    section: 'C',
    section_position: 18,
    type: 'single-choice',
    text: 'Does the living room window provide a clear openable area of at least 0.33m²?',
    show_when: [{ when_question: 'C11', has_value: 'yes' }],
    options: [
      { value: 'yes', label: 'Yes — appears to provide at least 0.33m²' },
      { value: 'no', label: 'No — opening is smaller than 0.33m²' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C11d',
    section: 'C',
    section_position: 19,
    type: 'single-choice',
    text:
      'Is there any obstruction below or outside the living room window that would ' +
      'prevent escape or rescue?',
    show_when: [{ when_question: 'C11', has_value: 'yes' }],
    options: [
      { value: 'no', label: 'No — no obstruction' },
      { value: 'yes', label: 'Yes — conservatory, railings, or other obstruction' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },

  // --- Mobility and entrance type ---
  {
    id: 'C12',
    section: 'C',
    section_position: 20,
    type: 'single-choice',
    text:
      'Are any occupants of the flat mobility-impaired to the extent that escape through ' +
      'a window would not be possible?',
    help_text:
      'LACORS §14 notes that escape windows cannot be relied upon for mobility-impaired ' +
      'occupants. If occupants cannot use a window as an escape route, the assessment of ' +
      'the main escape route becomes more critical.',
    options: [
      { value: 'no', label: 'No — all occupants are able-bodied' },
      { value: 'yes', label: 'Yes — one or more occupants are mobility-impaired' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C13',
    section: 'C',
    section_position: 21,
    type: 'single-choice',
    text:
      'Can bedroom 1 be reached from the front door of the flat without passing through ' +
      'a habitable room (i.e. directly from a hallway or landing)?',
    help_text:
      'If the bedroom is only accessible by walking through the living room or another ' +
      'habitable room, this creates an inner room situation for that bedroom.',
    options: [
      { value: 'yes', label: 'Yes — bedroom 1 opens directly from a hallway or landing' },
      {
        value: 'no',
        label: 'No — must pass through a living room or another habitable room',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'C14',
    section: 'C',
    section_position: 22,
    type: 'single-choice',
    text:
      'Does the upper flat entrance — the first area entered on arrival — function as ' +
      'a dedicated entrance hall or lobby, or is a habitable room entered directly?',
    help_text:
      'If occupants must pass through a living room or other habitable room immediately ' +
      'on entering the flat, any fire starting in that room blocks the escape route. ' +
      'A dedicated entrance hall or lobby improves compartmentation and escape.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      {
        value: 'lobby',
        label: 'Dedicated entrance hall or lobby — not used as a living space',
      },
      {
        value: 'habitable_room',
        label: 'A living room or other habitable room is entered directly on arrival',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'upper',
  },

  // =========================================================================
  // Section D — Construction: Staircase, Separation, and Ignition Risk
  // (shown only when B1 = 'communal')
  // =========================================================================
  {
    id: 'D1',
    section: 'D',
    section_position: 1,
    type: 'single-choice',
    text: 'What is the stair side panelling made of?',
    help_text:
      'Hardboard has no fire resistance. 12.5mm plasterboard gives approximately ' +
      '30-minute fire resistance (LACORS §19.5). If unknown, answer "Unknown" — do not guess.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: '12.5mm_confirmed', label: '12.5mm plasterboard — confirmed (measured)' },
      {
        value: '12.5mm_probable',
        label: '12.5mm plasterboard — probable but not measured',
      },
      { value: '9mm', label: '9mm plasterboard' },
      { value: 'hardboard', label: 'Hardboard' },
      { value: 'open_bannisters', label: 'Open bannisters — no solid panelling' },
      {
        value: 'mixed',
        label: 'Mixed — different materials in different sections',
      },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D2',
    section: 'D',
    section_position: 2,
    type: 'single-choice',
    text: 'What is the staircase soffit — the surface visible beneath the stair treads when looking from below?',
    help_text:
      'The soffit is the underside of the staircase. An exposed timber soffit provides ' +
      'fuel for a fire and compromises the enclosure. Plasterboard lining improves fire resistance.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'plasterboard', label: 'Plasterboard lined' },
      { value: 'exposed_timber', label: 'Exposed timber' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D3',
    section: 'D',
    section_position: 3,
    type: 'single-choice',
    text: 'What is the wall between the ground floor flat and the communal corridor made of?',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'masonry', label: 'Brick or masonry' },
      { value: 'plasterboard', label: 'Plasterboard or stud partition' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'common',
  },
  {
    id: 'D4',
    section: 'D',
    section_position: 4,
    type: 'single-choice',
    text: 'Are there visible gaps or penetrations through the staircase enclosure?',
    help_text:
      'Old pipe chases, cable runs, or redundant holes through the staircase walls or ' +
      'ceiling allow fire and smoke to bypass the enclosure.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'no', label: 'No visible gaps or penetrations' },
      {
        value: 'yes',
        label: 'Yes — visible gaps around pipes, cables, or redundant holes',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D5',
    section: 'D',
    section_position: 5,
    type: 'single-choice',
    text:
      'Is there a cupboard, storage space, or meter cupboard within or directly off ' +
      'the communal staircase?',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'no', label: 'No' },
      {
        value: 'yes_fire_door',
        label: 'Yes — and it has a fire-resisting door and enclosure',
      },
      {
        value: 'yes_no_fire_door',
        label: 'Yes — and it does not have a fire-resisting door',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D6',
    section: 'D',
    section_position: 6,
    type: 'single-choice',
    text: 'What is the overall condition of the staircase enclosure?',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'sound', label: 'Sound — no visible damage or deterioration' },
      {
        value: 'some_defects',
        label: 'Some defects — visible cracks, gaps, or areas of concern',
      },
      { value: 'poor', label: 'Poor condition — significant deterioration visible' },
      { value: 'not_assessed', label: 'Not assessed' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D7',
    section: 'D',
    section_position: 7,
    type: 'single-choice',
    text: 'What is the floor and ceiling construction between the ground floor flat and the upper flat?',
    help_text:
      'The floor/ceiling between the two flats is the primary fire separation between ' +
      'two separate households. If there is no plasterboard ceiling lining to the joists ' +
      'visible in the ground floor flat ceiling, fire can spread rapidly between flats.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      {
        value: 'concrete',
        label: 'Concrete or reinforced floor — appears solid, heavy construction',
      },
      {
        value: 'timber_plasterboard',
        label:
          'Timber joists with plasterboard ceiling below — typical Victorian construction',
      },
      {
        value: 'timber_exposed',
        label: 'Timber joists with no plasterboard — exposed joists visible in ground floor ceiling',
      },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D8',
    section: 'D',
    section_position: 8,
    type: 'single-choice',
    text:
      'Are there any visible penetrations, open chases, or gaps through the walls or ' +
      'floor between the two flats?',
    help_text:
      'Old plumbing chases, cable runs, or redundant holes allow fire and smoke to pass ' +
      'between the two dwellings, bypassing the fire separation.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      {
        value: 'no',
        label: 'No — walls and floor appear intact with no obvious penetrations',
      },
      {
        value: 'yes',
        label: 'Yes — visible gaps, old pipe chases, or penetrations visible',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'common',
  },
  {
    id: 'D9',
    section: 'D',
    section_position: 9,
    type: 'multi-choice',
    text:
      'Are any of the following present in the communal staircase or entrance area? ' +
      'Select all that apply.',
    help_text:
      'LACORS explicitly considers ignition risk and fuel load in the escape route. ' +
      'Any combustible material stored in the communal area materially increases risk ' +
      'because it provides fuel for a fire that would block the only escape.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'bicycles_pushchairs', label: 'Bicycles or pushchairs stored in the communal area' },
      { value: 'rubbish_cardboard', label: 'Rubbish or cardboard stored in the communal area' },
      {
        value: 'electrical_intake',
        label:
          'Electrical intake or consumer unit in or opening onto the communal area without ' +
          'a fire-resisting enclosure',
      },
      {
        value: 'combustible_materials',
        label: 'Combustible materials or furniture in the communal area',
      },
      { value: 'none', label: 'None of the above' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },

  // =========================================================================
  // Section E — Fire Detection and Alarms
  // =========================================================================
  {
    id: 'E1',
    section: 'E',
    section_position: 1,
    type: 'single-choice',
    text: 'What type of fire alarms are currently fitted in the building?',
    help_text:
      'Grade D1 — mains-wired with a sealed long-life lithium battery backup (no battery ' +
      'replacement needed; typically a 10-year cell). Grade D2 — mains-wired with a ' +
      'replaceable battery backup (requires periodic battery replacement). ' +
      'Grade D1 is preferable as it removes dependency on battery maintenance. ' +
      'Grade F — battery-only, no mains connection. Both D1 and D2 meet the basic ' +
      'Grade D standard; Grade F does not.',
    options: [
      {
        value: 'd1',
        label: 'Grade D1 — mains-wired with sealed long-life (lithium) battery backup',
      },
      {
        value: 'd2',
        label: 'Grade D2 — mains-wired with replaceable battery backup',
      },
      { value: 'battery_only', label: 'Battery-only (Grade F) — no mains wiring' },
      { value: 'mixed', label: 'Mixed — some mains-wired, some battery-only' },
      { value: 'none', label: 'No alarms at all' },
      { value: 'not_sure', label: 'Not sure — alarm type not identified' },
    ],
    required: true,
  },
  {
    id: 'E2',
    section: 'E',
    section_position: 2,
    type: 'multi-choice',
    text: 'Where are alarms currently located? Select all that apply.',
    options: [
      { value: 'communal_hallway', label: 'In the communal hallway or staircase' },
      {
        value: 'ground_flat_lobby',
        label: 'In the entrance lobby/hallway of the ground floor flat',
      },
      {
        value: 'upper_flat_lobby',
        label: 'In the entrance lobby/hallway of the upper flat',
      },
      { value: 'living_room', label: 'In a living room' },
      { value: 'kitchen', label: 'In a kitchen' },
      { value: 'bedroom', label: 'In a bedroom' },
      { value: 'other', label: 'Elsewhere / other locations' },
      { value: 'none_not_sure', label: 'None / not sure' },
    ],
    required: true,
  },
  {
    id: 'E3',
    section: 'E',
    section_position: 3,
    type: 'single-choice',
    text: 'Are any of the alarms heat detectors (as opposed to smoke detectors)?',
    options: [
      { value: 'all_smoke', label: 'All are smoke detectors' },
      { value: 'mixed', label: 'Mix of smoke and heat detectors' },
      { value: 'all_heat', label: 'All are heat detectors' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'E4',
    section: 'E',
    section_position: 4,
    type: 'single-choice',
    text: 'Is there a mains-wired alarm in the communal hallway or staircase?',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes_mains', label: 'Yes — mains-wired smoke alarm' },
      { value: 'yes_battery', label: 'Yes — battery-only alarm' },
      { value: 'no', label: 'No alarm in communal area' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'E5',
    section: 'E',
    section_position: 5,
    type: 'single-choice',
    text:
      'Is there a heat detector in each flat\'s entrance lobby, interlinked with the ' +
      'communal alarm?',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes_both', label: 'Yes — in both flats' },
      { value: 'yes_one', label: 'Yes — in one flat only' },
      { value: 'no', label: 'No' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'E6a',
    section: 'E',
    section_position: 6,
    type: 'single-choice',
    text:
      'Within each flat, are the alarms interlinked so that if one alarm sounds, all ' +
      'others in the same flat sound?',
    help_text:
      'Within-flat interlinking means that a smoke alarm in a bedroom will trigger the ' +
      'kitchen heat detector and living room alarm at the same time, giving all occupants ' +
      'of that flat the earliest possible warning. This can be verified by pressing the ' +
      'test button on one alarm and confirming the others sound. ' +
      'Note: testing may require two people — one to press the button, one to confirm ' +
      'alarms sound in other rooms.',
    options: [
      { value: 'yes', label: 'Yes — all alarms within each flat sound together' },
      { value: 'no', label: 'No — alarms in each flat are independent' },
      { value: 'partial', label: 'Partially interlinked' },
      { value: 'not_yet_verified', label: 'Not yet verified — testing not carried out' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'E6b',
    section: 'E',
    section_position: 7,
    type: 'single-choice',
    text:
      'Are alarms in one flat interlinked with alarms in the other flat, or with any ' +
      'alarm in the communal area?',
    help_text:
      'Cross-flat interlinking means a fire alarm in the ground floor flat would also ' +
      'trigger the upper flat\'s alarms, and vice versa. ' +
      'Note: whether cross-flat interlinking is required in buildings without communal ' +
      'areas is a point of regulatory interpretation that has not been definitively ' +
      'confirmed for this property type. This question is captured for information. ' +
      'If in doubt, seek advice from a qualified electrician or fire risk assessor.',
    options: [
      { value: 'yes', label: 'Yes — alarms across both flats are interlinked' },
      { value: 'communal_only', label: 'Only via a communal alarm — not directly between flats' },
      { value: 'no', label: 'No — each flat\'s alarms are separate from the other flat' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
  },
  {
    id: 'E7',
    section: 'E',
    section_position: 8,
    type: 'single-choice',
    text: 'When were the fire alarms last tested?',
    options: [
      { value: 'within_month', label: 'Within the last month' },
      { value: 'within_year', label: 'Within the last year (but more than a month ago)' },
      { value: 'over_year', label: 'More than a year ago' },
      { value: 'never_unknown', label: 'Never tested / not known' },
    ],
    uncertainty_behaviour: 'RISK_ELEVATE',
    required: true,
  },

  // =========================================================================
  // Section F — Doors and Egress
  // =========================================================================
  {
    id: 'F1',
    section: 'F',
    section_position: 1,
    type: 'single-choice',
    text:
      'Is a functioning self-closing device fitted to each flat\'s entrance door ' +
      '(the door between the flat interior and the communal hallway or the street)?',
    help_text:
      'LACORS §21.5 states that the entrance door to each self-contained flat should be ' +
      'fitted with a self-closing device. The "flat entrance door" is the door that separates ' +
      'the interior of the flat from the communal staircase or street — not an internal room ' +
      'door within the flat, and not the building\'s front door. ' +
      'A working self-closer pulls the door fully shut so the latch engages without ' +
      'manual assistance. If a device is fitted but the door does not pull fully closed, ' +
      'choose "Fitted but not functioning correctly."',
    options: [
      {
        value: 'functioning_self_closer',
        label: 'Yes — a functioning self-closer is fitted and pulls the door fully closed',
      },
      {
        value: 'fitted_not_working',
        label: 'Fitted but not functioning correctly — door does not pull fully shut',
      },
      { value: 'not_fitted', label: 'No self-closing device fitted' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'F2',
    section: 'F',
    section_position: 2,
    type: 'single-choice',
    text: 'What type of door is each flat\'s entrance door?',
    help_text:
      'This refers to the door between each flat and the communal hallway (or street), ' +
      'not the building\'s front door. ' +
      'A solid timber door of at least 44mm thickness provides some fire resistance. ' +
      'A hollow-core door provides minimal fire resistance. An FD30S fire doorset is ' +
      'specifically rated to resist fire for 30 minutes with seals fitted.',
    options: [
      {
        value: 'fd30s',
        label: 'FD30S fire doorset — with intumescent seals and smoke seal',
      },
      {
        value: 'solid_timber_44mm',
        label: 'Solid timber door, appears to be 44mm thickness or more',
      },
      {
        value: 'solid_timber_thinner',
        label: 'Solid timber door, appears to be less than 44mm thickness',
      },
      { value: 'hollow_core', label: 'Hollow-core or lightweight door' },
      { value: 'unknown', label: 'Unknown construction' },
    ],
    required: true,
  },
  {
    id: 'F3',
    section: 'F',
    section_position: 3,
    type: 'single-choice',
    text:
      'Does each flat\'s entrance door fit and latch properly when closed — ' +
      'either by self-closer or manually?',
    help_text:
      'A door that does not fully close and latch cannot contain smoke or fire even ' +
      'briefly. Check that the door sits flush in the frame and that the latch engages ' +
      'without having to hold or force the door. This question is about the physical ' +
      'fit and latch — not whether a self-closer is present.',
    options: [
      { value: 'yes', label: 'Yes — fits flush in frame and latches without force' },
      { value: 'no', label: 'No — sticks, does not sit flush, or latch does not engage' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'F4',
    section: 'F',
    section_position: 4,
    type: 'single-choice',
    text:
      'Does each flat\'s entrance door have intumescent seals and/or smoke seals ' +
      'around the door edges?',
    help_text:
      'This refers to each flat\'s entrance door — the door between the flat and the ' +
      'communal hallway. Intumescent seals expand in fire to seal the gap around the door. ' +
      'Smoke seals reduce smoke ingress at lower temperatures. Both are part of the FD30S ' +
      'fire door specification. A door that is not an FD30S is unlikely to have these.',
    options: [
      { value: 'both', label: 'Both intumescent seals and smoke seals fitted' },
      {
        value: 'intumescent_only',
        label: 'Intumescent seals only (no smoke seals)',
      },
      { value: 'none', label: 'No seals fitted' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'F5',
    section: 'F',
    section_position: 5,
    type: 'single-choice',
    text:
      'Does the flat entrance door, or any door on the escape route within the flat, ' +
      'require a key to open from the inside?',
    help_text:
      'Answer based on the lock currently fitted — not whether the door is habitually ' +
      'left unlocked. A double-cylinder deadlock (key required from both sides) is a ' +
      'safety risk: an occupant waking in a smoke-filled room must find a key to exit. ' +
      'A thumb-turn on the inside, or a night-latch that opens with a knob from inside, ' +
      'is acceptable. If in doubt, check by standing inside and trying to open the door ' +
      'without a key.',
    options: [
      {
        value: 'no',
        label: 'No — the flat entrance door and all escape-route doors open from inside without a key',
      },
      {
        value: 'yes',
        label:
          'Yes — the flat entrance door or an internal door requires a key to open from inside',
      },
      { value: 'not_sure', label: 'Not sure — lock type not checked' },
    ],
    required: true,
  },
  {
    id: 'F6',
    section: 'F',
    section_position: 6,
    type: 'single-choice',
    text:
      'Does the building entrance door (the shared front door giving access to the ' +
      'communal staircase) have a self-closing device?',
    help_text:
      'The building entrance door is the main front door through which both flats are ' +
      'accessed — not the individual flat entrance doors. A self-closer on the building ' +
      'entrance door limits unauthorised access and prevents the door being left open, ' +
      'which could allow smoke from outside to enter the communal escape route.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — functioning self-closer fitted' },
      { value: 'fitted_not_working', label: 'Fitted but not functioning correctly' },
      { value: 'no', label: 'No self-closer' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },

  // =========================================================================
  // Section G — General Legal Obligations
  // =========================================================================
  {
    id: 'G1',
    section: 'G',
    section_position: 1,
    type: 'single-choice',
    text:
      'When was the last annual gas safety inspection carried out by a Gas Safe ' +
      'registered engineer?',
    help_text:
      'The Gas Safety (Installation and Use) Regulations 1998 require an annual gas ' +
      'safety inspection by a Gas Safe registered engineer for all rental properties ' +
      'with gas appliances. This is a statutory obligation.',
    options: [
      { value: 'within_12_months', label: 'Within the last 12 months — current' },
      {
        value: 'overdue',
        label: 'More than 12 months ago — overdue',
      },
      { value: 'no_gas', label: 'No gas appliances in the property' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'G2',
    section: 'G',
    section_position: 2,
    type: 'single-choice',
    text:
      'When was the last Electrical Installation Condition Report (EICR) carried out ' +
      'for the property?',
    help_text:
      'The Electrical Safety Standards in the Private Rented Sector (England) Regulations ' +
      '2020 require an EICR to be carried out at least every five years for all private ' +
      'rented properties. This is a statutory obligation.',
    options: [
      { value: 'within_5_years', label: 'Within the last 5 years — current' },
      { value: 'overdue', label: 'More than 5 years ago — overdue' },
      { value: 'unknown', label: 'Not known' },
    ],
    required: true,
  },
  {
    id: 'G3',
    section: 'G',
    section_position: 3,
    type: 'single-choice',
    text:
      'Is there a documented fire risk assessment for the common parts of the building?',
    help_text:
      'The Regulatory Reform (Fire Safety) Order 2005 (Article 9) applies to the common ' +
      'parts of multi-occupied residential buildings. A responsible person must carry out ' +
      'a suitable and sufficient fire risk assessment and implement appropriate fire safety ' +
      'measures.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      {
        value: 'yes',
        label: 'Yes — a documented fire risk assessment is in place',
      },
      { value: 'no', label: 'No' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },

  {
    id: 'G4a',
    section: 'G',
    section_position: 4,
    type: 'single-choice',
    text:
      'Does the property contain any fixed combustion appliances, other than a gas cooker?',
    help_text:
      'Fixed combustion appliances covered by the Smoke and Carbon Monoxide Alarm (Amendment) ' +
      'Regulations 2022 include: gas boilers, gas fires, oil boilers, solid fuel stoves, and ' +
      'wood-burning stoves. Gas cookers are specifically excluded from this requirement. ' +
      'If unsure whether an appliance is a "fixed combustion appliance", select "Not sure."',
    options: [
      {
        value: 'yes',
        label: 'Yes — one or more fixed combustion appliances are present (not a gas cooker)',
      },
      {
        value: 'no',
        label: 'No fixed combustion appliances (other than a gas cooker)',
      },
      {
        value: 'not_sure',
        label: 'Not sure',
      },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'building',
  },

  {
    id: 'G4b',
    section: 'G',
    section_position: 5,
    type: 'single-choice',
    text:
      'Is a carbon monoxide (CO) alarm fitted in every room that contains a fixed combustion ' +
      'appliance?',
    help_text:
      'The Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022 require landlords to ' +
      'install a CO alarm in any room used as living accommodation that contains a fixed ' +
      'combustion appliance, other than a gas cooker. The alarm must conform to BS EN 50291. ' +
      'Check each room separately — a boiler cupboard, a room with a gas fire, and a room ' +
      'with a solid fuel stove each require their own CO alarm.',
    show_when: [{ when_question: 'G4a', has_value: 'yes' }],
    options: [
      {
        value: 'yes',
        label: 'Yes — a CO alarm is fitted in every room containing a combustion appliance',
      },
      {
        value: 'no',
        label: 'No — one or more rooms with a combustion appliance have no CO alarm',
      },
      {
        value: 'not_sure',
        label: 'Not sure — alarm presence has not been confirmed in all applicable rooms',
      },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'building',
  },

  // =========================================================================
  // Section H — Management and Maintenance (new in v1.2)
  // =========================================================================
  {
    id: 'H1',
    section: 'H',
    section_position: 1,
    type: 'single-choice',
    text: 'Is the communal staircase and entrance hall kept clear of combustible materials and obstructions?',
    help_text:
      'LACORS places significant weight on management quality as a risk factor. ' +
      'The communal staircase is the primary escape route for the upper flat and a shared ' +
      'route for both. Any combustible materials stored here increase both ignition risk ' +
      'and the risk of blocking the only escape. Answer based on the current typical ' +
      'condition — not a one-off clearance done recently.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — consistently kept clear at all times' },
      { value: 'mostly', label: 'Mostly — occasional items left temporarily' },
      { value: 'no', label: 'No — items are regularly stored in the communal area' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'H2',
    section: 'H',
    section_position: 2,
    type: 'single-choice',
    text:
      'Are tenants made aware of the fire escape arrangements for their flat — how ' +
      'to exit, what to do if the alarm sounds, and not to store materials in communal areas?',
    options: [
      {
        value: 'yes_fully',
        label: 'Yes — tenants are briefed at the start of tenancy and reminded periodically',
      },
      {
        value: 'partially',
        label: 'Partially — mentioned at start of tenancy but not actively maintained',
      },
      { value: 'no', label: 'No — tenants are not specifically briefed on fire safety' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'H3',
    section: 'H',
    section_position: 3,
    type: 'single-choice',
    text:
      'Is there a regular maintenance schedule for fire safety items — alarms, ' +
      'self-closers, door condition, and staircase integrity?',
    options: [
      {
        value: 'yes_documented',
        label: 'Formal — documented schedule with written records',
      },
      {
        value: 'informal',
        label: 'Regular informal — checks happen periodically but are not documented',
      },
      {
        value: 'ad_hoc',
        label: 'Ad hoc — no regular schedule; checks only when an issue is noticed',
      },
      { value: 'no', label: 'None — no maintenance arrangement in place' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'RISK_ELEVATE',
    required: true,
  },
  {
    id: 'H4',
    section: 'H',
    section_position: 4,
    type: 'single-choice',
    text: 'How would you describe the landlord\'s maintenance and management regime for this property?',
    help_text:
      'LACORS considers management quality a genuine risk factor. Active, documented management ' +
      'reduces overall risk; minimal or absent management increases it, particularly where ' +
      'physical measures are borderline. Answer based on the current actual practice — not ' +
      'intended future improvements.',
    options: [
      {
        value: 'active',
        label:
          'Formal — documented maintenance schedule, regular visits, written records, ' +
          'prompt response to issues',
      },
      {
        value: 'passive',
        label:
          'Regular informal — checks happen periodically and issues are addressed, ' +
          'but without a documented schedule or written records',
      },
      {
        value: 'minimal',
        label:
          'Ad hoc — maintenance is addressed only when noticed or when tenants report ' +
          'an issue; no proactive checking',
      },
      {
        value: 'none',
        label:
          'None — no maintenance arrangement in place; property effectively self-managed ' +
          'by tenants with no landlord oversight',
      },
    ],
    required: true,
  },
]

// ---------------------------------------------------------------------------
// Helpers consumed by the navigator engine
// ---------------------------------------------------------------------------

/** Ordered list of sections as they appear in the flow. */
export const SECTION_ORDER: SectionId[] = [
  'setup',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'results',
]

/** Flat map of question id → Question for O(1) lookups. */
export const QUESTION_MAP: Record<string, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q])
)

/** Returns all questions belonging to a given section, in order. */
export function getQuestionsForSection(section: SectionId): Question[] {
  return QUESTIONS.filter((q) => q.section === section)
}
