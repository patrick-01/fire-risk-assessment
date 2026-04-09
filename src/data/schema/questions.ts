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
  },
  {
    id: 'P2',
    section: 'setup',
    section_position: 2,
    type: 'text',
    text: 'Flat or unit reference (optional)',
    help_text:
      'e.g. Ground Floor, First Floor, Flat A/B, or a number. ' +
      'Used as a label in the report only — not used in compliance logic.',
    required: false,
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
      'A purpose-built maisonette block built as flats from the outset is treated ' +
      'differently from a converted house. If the building has a single original ' +
      'staircase that now serves both flats, it is almost certainly a conversion.',
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
  },
  {
    id: 'A2',
    section: 'A',
    section_position: 2,
    type: 'single-choice',
    text:
      'Was this conversion (or original construction if purpose-built) completed ' +
      'before 1991, OR is there evidence it does not comply with Building Regulations 1991?',
    help_text:
      'A pre-1991 conversion or a conversion evidenced as non-compliant with 1991 ' +
      'Building Regulations triggers the Section 257 HMO classification under the ' +
      'Housing Act 2004. Answering "No" means the property is outside the scope of ' +
      'this tool.',
    options: [
      { value: 'yes', label: 'Yes — pre-1991 or visibly non-compliant' },
      {
        value: 'no',
        label: 'No — completed in 1991 or later and likely compliant',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'This tool covers buildings converted before 1991 or evidenced as non-compliant ' +
          'with Building Regulations 1991. A post-1991 compliant conversion is outside ' +
          'the scope of Version 1. Contact Richmond Council or a qualified fire risk ' +
          'assessor for guidance on your property.',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'BLOCK_CLASS',
    required: true,
  },
  {
    id: 'A3',
    section: 'A',
    section_position: 3,
    type: 'single-choice',
    text: 'How many separate self-contained flats does this building contain?',
    help_text: 'Version 1 of this tool supports buildings with exactly two self-contained flats.',
    options: [
      { value: '2', label: 'Two flats' },
      {
        value: '3_or_more',
        label: 'Three or more flats',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'Version 1 of this tool supports buildings with exactly two self-contained flats. ' +
          'For buildings with three or more flats, contact Richmond Council Housing Enforcement ' +
          'or engage a qualified fire risk assessor.',
      },
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
  },
  {
    id: 'A4',
    section: 'A',
    section_position: 4,
    type: 'single-choice',
    text: 'What is the owner-occupation status of the two flats?',
    help_text:
      'This tool covers privately rented properties. Owner-occupation affects the ' +
      'legal classification and the confidence level of the assessment.',
    options: [
      {
        value: 'none_owner_occupied',
        label: 'Both flats are privately rented — neither is owner-occupied',
      },
      {
        value: 'one_owner_occupied',
        label: 'One flat is owner-occupied',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'Version 1 of this tool covers properties where both flats are privately rented. ' +
          'Owner-occupied properties have different regulatory obligations. ' +
          'Contact Richmond Council or a qualified assessor for guidance.',
      },
      {
        value: 'social',
        label: 'One or both flats are let by a housing association or council',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'This tool covers privately rented properties only. Social housing tenancies ' +
          'are subject to different regulatory frameworks. ' +
          'Contact the housing association, council, or a qualified assessor.',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'BLOCK_CLASS',
    required: true,
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
  },
  {
    id: 'B3',
    section: 'B',
    section_position: 3,
    type: 'single-choice',
    text: 'Does the ground floor flat have a rear exit?',
    help_text: 'A rear exit such as a back door opening to a garden or external space.',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    required: true,
  },
  {
    id: 'B4',
    section: 'B',
    section_position: 4,
    type: 'single-choice',
    text: 'What is the approximate floor level of the upper flat above external ground?',
    help_text:
      'This affects whether upper-floor windows can be used as escape windows. ' +
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
  },
  {
    id: 'B5',
    section: 'B',
    section_position: 5,
    type: 'single-choice',
    text: 'Is the ground floor raised significantly above street or garden level?',
    help_text:
      'For example, the entrance is up several steps. A raised ground floor affects ' +
      'the effective height of upper-floor windows above external ground.',
    options: [
      { value: 'no', label: 'No — roughly at ground level' },
      { value: 'yes', label: 'Yes — raised ground floor (several steps up to entrance)' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
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
      'In the ideal escape route configuration, the front door opens directly from the ' +
      'foot of the staircase to the street or garden. An intermediate room or a ' +
      'secondary locked door worsens the escape route.',
    options: [
      {
        value: 'yes',
        label: 'Yes — front door opens directly to street or garden from foot of stairs',
      },
      {
        value: 'no',
        label: 'No — intermediate space, lobby, or additional door intervenes',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
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
  },

  // =========================================================================
  // Section C — Escape Routes
  // =========================================================================

  // --- Bedroom 1 ---
  {
    id: 'C1',
    section: 'C',
    section_position: 1,
    type: 'single-choice',
    text: 'Does the main bedroom (bedroom 1) in the flat have a window that can be opened?',
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
  },
  {
    id: 'C2',
    section: 'C',
    section_position: 2,
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
  },
  {
    id: 'C3',
    section: 'C',
    section_position: 3,
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
  },
  {
    id: 'C4',
    section: 'C',
    section_position: 4,
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
  },
  {
    id: 'C5',
    section: 'C',
    section_position: 5,
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
  },

  // --- Second bedroom ---
  {
    id: 'C6',
    section: 'C',
    section_position: 6,
    type: 'single-choice',
    text: 'Is there a second bedroom in the flat you are assessing?',
    options: [
      { value: 'yes', label: 'Yes — there is a second bedroom' },
      { value: 'no', label: 'No — only one bedroom' },
    ],
    required: true,
  },
  {
    id: 'C7',
    section: 'C',
    section_position: 7,
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
  },
  {
    id: 'C9a',
    section: 'C',
    section_position: 8,
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
  },
  {
    id: 'C9b',
    section: 'C',
    section_position: 9,
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
  },
  {
    id: 'C9c',
    section: 'C',
    section_position: 10,
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
  },
  {
    id: 'C9d',
    section: 'C',
    section_position: 11,
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
  },
  {
    id: 'C9e',
    section: 'C',
    section_position: 12,
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
  },

  // --- Inner rooms and escape route geometry ---
  {
    id: 'C10',
    section: 'C',
    section_position: 13,
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
  },

  // --- Living room window ---
  {
    id: 'C11',
    section: 'C',
    section_position: 14,
    type: 'single-choice',
    text: 'Does the living room have a window that can be opened?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No — fixed or sealed window, or no window' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'C11a',
    section: 'C',
    section_position: 15,
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
  },
  {
    id: 'C11b',
    section: 'C',
    section_position: 16,
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
  },
  {
    id: 'C11c',
    section: 'C',
    section_position: 17,
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
  },
  {
    id: 'C11d',
    section: 'C',
    section_position: 18,
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
  },

  // --- Mobility and entrance type ---
  {
    id: 'C12',
    section: 'C',
    section_position: 19,
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
  },
  {
    id: 'C13',
    section: 'C',
    section_position: 20,
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
  },
  {
    id: 'C14',
    section: 'C',
    section_position: 21,
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
    options: [
      { value: 'battery_only', label: 'Battery-only (Grade F) — no mains wiring' },
      {
        value: 'mains_wired',
        label: 'Mains-wired with integral battery backup (Grade D)',
      },
      { value: 'mixed', label: 'Mixed — some mains-wired, some battery-only' },
      { value: 'none', label: 'No alarms at all' },
      { value: 'not_sure', label: 'Not sure' },
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
  },
  {
    id: 'E6',
    section: 'E',
    section_position: 6,
    type: 'single-choice',
    text: 'Are the alarms interlinked so that all trigger together when one activates?',
    options: [
      { value: 'yes', label: 'Yes — all alarm together when one triggers' },
      { value: 'no', label: 'No — independent (each only sounds at its own location)' },
      { value: 'partial', label: 'Partially interlinked' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'E7',
    section: 'E',
    section_position: 7,
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
    text: 'Is a functioning self-closing device fitted to the flat entrance door?',
    help_text:
      'LACORS §21.5 states that entrance doors to self-contained flats should be fitted ' +
      'with self-closers. A self-closer ensures the door returns to a closed position ' +
      'after use, limiting the spread of fire and smoke from the flat to the escape route.',
    options: [
      {
        value: 'functioning_self_closer',
        label: 'Yes — a functioning self-closer is fitted and working',
      },
      {
        value: 'fitted_not_working',
        label: 'Fitted but not functioning correctly',
      },
      { value: 'not_fitted', label: 'No self-closer fitted' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'F2',
    section: 'F',
    section_position: 2,
    type: 'single-choice',
    text: 'What type of door is the flat entrance door?',
    help_text:
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
    text: 'Does the flat entrance door close and latch properly without being forced?',
    options: [
      { value: 'yes', label: 'Yes — closes and latches properly' },
      { value: 'no', label: 'No — sticks, does not close flush, or does not latch' },
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
      'Does the flat entrance door have intumescent seals and/or smoke seals around ' +
      'the door edges?',
    help_text:
      'Intumescent seals expand in fire to seal the gap around the door. Smoke seals ' +
      'reduce smoke ingress at lower temperatures. Both are part of the FD30S fire door ' +
      'specification. If the door is not an FD30S, it is unlikely to have these fitted.',
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
      'Are there any internal doors within the flat that are locked in a way that ' +
      'requires a key to exit from the inside?',
    help_text:
      'Exit doors within the flat (such as doors to a hallway or the front door itself) ' +
      'must be openable from the inside without a key to allow safe evacuation. A thumb ' +
      'turn deadlock or nightlatch on the inside is acceptable; a key-only deadlock from ' +
      'both sides is not.',
    options: [
      { value: 'no', label: 'No — all doors can be opened from inside without a key' },
      {
        value: 'yes',
        label: 'Yes — one or more doors require a key to exit from inside',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
  },
  {
    id: 'F6',
    section: 'F',
    section_position: 6,
    type: 'single-choice',
    text: 'Does the communal front door have a self-closing device?',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — functioning self-closer fitted' },
      { value: 'fitted_not_working', label: 'Fitted but not functioning correctly' },
      { value: 'no', label: 'No self-closer' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
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
  },

  // =========================================================================
  // Section H — Management and Maintenance (new in v1.2)
  // =========================================================================
  {
    id: 'H1',
    section: 'H',
    section_position: 1,
    type: 'single-choice',
    text:
      'Are the communal areas (if present) kept clear of combustible materials and ' +
      'obstructions at all times?',
    help_text:
      'LACORS places significant weight on management quality as a risk factor. ' +
      'A well-managed property with communal areas consistently kept clear reduces ' +
      'the risk of a fire starting in or blocking the escape route.',
    options: [
      { value: 'yes', label: 'Yes — consistently maintained clear' },
      { value: 'mostly', label: 'Mostly, but occasional items left temporarily' },
      { value: 'no', label: 'No — items regularly stored in communal areas' },
      { value: 'not_applicable', label: 'Not applicable — no communal areas' },
    ],
    required: true,
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
        label: 'Yes — documented schedule with written records',
      },
      {
        value: 'informal',
        label: 'Informal — checks happen but are not documented',
      },
      { value: 'no', label: 'No formal schedule' },
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
    text: 'How would you describe the management engagement level for this property?',
    help_text:
      'LACORS considers management quality as a genuine risk factor. Active management ' +
      'reduces overall risk; minimal management increases it, particularly where physical ' +
      'measures are borderline.',
    options: [
      {
        value: 'active',
        label: 'Actively managed — regular visits, prompt response to maintenance issues',
      },
      {
        value: 'passive',
        label: 'Passively managed — repairs addressed when reported, infrequent visits',
      },
      {
        value: 'minimal',
        label: 'Minimal management — tenant largely self-managing with limited landlord engagement',
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
