/**
 * questions.ts — Question bank and branching schema (FireRegs v2).
 *
 * This file defines ALL questions the tool can ask. It does NOT import from
 * React, engine modules, or persistence. It is pure declarative data.
 *
 * The navigator engine (src/engine/navigator.ts) reads this schema to decide
 * which question to show next. UI components never read branching logic
 * directly — they only receive the current Question from the engine.
 *
 * --- v2 question flow (docs/FireRegs_v2_Architecture_Refactor.md §18.1) ---
 * The bank is grouped into the v2 sequence:
 *   Setup → Building classification → Common parts / entrance →
 *   Ground-floor flat → Upper-floor flat → External escape routes →
 *   Doors and route protection → Stair compartmentation →
 *   Detection and alarms → Gas / electrical / CO → Management → (Review/Report)
 *
 * Every question carries a mandatory `scope` (§18.2): which part of the
 * building it addresses. The navigator walks QUESTIONS in array order, so the
 * array order IS the question order.
 *
 * HOW TO ADD QUESTIONS:
 *   1. Add an entry to the QUESTIONS array in the correct section block.
 *   2. Add branching conditions in the show_when field if needed.
 *   3. Give it a `scope`.
 *   4. The navigator picks it up automatically.
 *
 * Uncertainty behaviour codes:
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
 * Which part of the building a question addresses (§18.2).
 * Rendered as a contextual scope badge in the questionnaire UI so the user
 * always knows which unit or area they are answering about.
 *
 *   'building' — the whole building (legal classification, structure)
 *   'common'   — the common parts (shared entrance hall, common escape route)
 *   'ground'   — the ground-floor flat specifically
 *   'upper'    — the upper flat specifically
 *   'both'     — both flats equally (e.g. within-flat detection asked once)
 *
 * REQUIRED on every question (v2 §18.2). Use the most specific scope that
 * applies. The UI label set is: Building | Common parts | Ground-floor flat |
 * Upper flat | Both flats.
 */
export type QuestionScope = 'building' | 'common' | 'ground' | 'upper' | 'both'

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
  /** Which part of the building this question addresses (§18.2). Mandatory. */
  scope: QuestionScope
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

export const QUESTIONS: Question[] = [
  // =========================================================================
  // Setup
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
  // Building classification (§6) — what kind of building is this?
  // =========================================================================
  {
    id: 'A1',
    section: 'building',
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
    section: 'building',
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
    section: 'building',
    section_position: 3,
    type: 'single-choice',
    text: 'How many separate self-contained flats does this building contain?',
    help_text:
      'FireRegs v2 is scoped to buildings with exactly two self-contained flats (the supported ' +
      'TW9 portfolio form). Buildings with three or more flats, and bedsit / shared-house HMOs ' +
      'where rooms are let individually rather than as self-contained flats, fall outside v2 ' +
      'scope and a qualified assessor should be consulted.',
    options: [
      { value: '2', label: 'Two flats' },
      {
        value: '3_or_more',
        label: 'Three or more flats',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'FireRegs v2 assesses buildings with exactly two self-contained flats. ' +
          'Buildings with three or more flats fall outside its scope. Consult Richmond ' +
          'Council or a qualified fire risk assessor for a building of this size.',
      },
      {
        value: 'not_flats',
        label: 'It is not divided into self-contained flats (e.g. bedsits or a shared house)',
        triggers_out_of_scope: true,
        out_of_scope_reason:
          'FireRegs v2 applies to buildings divided into self-contained flats. Bedsit HMOs ' +
          'and classic shared houses, where rooms are let individually, are outside its scope. ' +
          'Contact Richmond Council or a qualified assessor for guidance on your property type.',
      },
    ],
    required: true,
    scope: 'building',
  },
  {
    id: 'A4',
    section: 'building',
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
    section: 'building',
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
  // Common parts / entrance configuration (§8)
  // =========================================================================
  {
    id: 'B1',
    section: 'common-parts',
    section_position: 1,
    type: 'single-choice',
    text: 'Do the two flats share an internal entrance hall, or does each flat have its own separate entrance?',
    help_text:
      'A shared entrance hall means both flats are reached through a single shared front ' +
      'door into a common hall (typically with the ground-floor flat door off the hall and a ' +
      'stair serving the upper flat). Separate entrances means each flat has its own ' +
      'street-level front door with no shared internal space. A shared hall is NOT the same ' +
      'as a communal stair serving many dwellings — most of the portfolio has a small shared ' +
      'entrance hall with a stair serving the upper flat only.',
    options: [
      { value: 'communal', label: 'Shared entrance hall — a common front door into a hall serving both flats' },
      { value: 'separate', label: 'Separate entrances — each flat has its own front door' },
    ],
    required: true,
    scope: 'building',
  },
  {
    id: 'F6a',
    section: 'common-parts',
    section_position: 2,
    type: 'single-choice',
    text:
      'Is the shared entrance hall or common escape route used to escape by more than one household?',
    help_text:
      'Answer "Yes" if both the ground-floor flat and the upper flat depend on the same ' +
      'shared hall or common escape route to reach the final exit door. This is typical where ' +
      'a single shared front door leads to a hall from which the ' +
      'ground-floor flat opens and a stair serves the upper flat. Answer "No" only if each ' +
      'flat has a completely independent exit that does not pass through any shared internal space.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — both flats depend on the same shared hall or common route to exit' },
      { value: 'no', label: 'No — each flat has an independent exit not shared with the other' },
      { value: 'unknown', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'B7',
    section: 'common-parts',
    section_position: 3,
    type: 'single-choice',
    text:
      'Is there direct access to the final exit door from the foot of the stair without ' +
      'passing through any other room or door?',
    help_text:
      'In the ideal arrangement, the final exit door opens directly from the foot of the stair ' +
      'to the street or garden. An intermediate room or a secondary locked door worsens the ' +
      'common escape route.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      {
        value: 'yes',
        label: 'Yes — final exit door opens directly to street or garden from foot of stair',
      },
      {
        value: 'no',
        label: 'No — an intermediate space, lobby, or additional door intervenes',
      },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D5',
    section: 'common-parts',
    section_position: 4,
    type: 'single-choice',
    text:
      'Is there a cupboard, storage space, or meter cupboard within or directly off ' +
      'the shared entrance hall or common escape route?',
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
  // --- Under-stairs / escape-route cupboard sub-model (LACORS §15.4/§15.5) ---
  // Only asked where a cupboard opens onto the shared escape route (D5). A gas/
  // electric meter or combustible storage in a protected route is a LACORS
  // risk-based concern (§15.5 best practice is a fire-resisting enclosure), not
  // a statutory breach in itself.
  {
    id: 'D21',
    section: 'common-parts',
    section_position: 5,
    type: 'multi-choice',
    text: 'What does the under-stairs / escape-route cupboard contain? Select all that apply.',
    help_text:
      'Gas or electric meters and distribution boards should ideally not be sited in escape ' +
      'routes (LACORS §15.5). Where they are, best practice is to enclose them in fire-resisting ' +
      'construction. Combustible storage in a protected route is separately a concern under §15.3.',
    show_when: [{ when_question: 'D5', has_value: ['yes_fire_door', 'yes_no_fire_door'] }],
    options: [
      { value: 'gas_meter', label: 'Gas meter' },
      { value: 'electricity_meter', label: 'Electricity meter / consumer unit' },
      { value: 'storage_combustible', label: 'Storage / combustible materials' },
      { value: 'other_services', label: 'Other services (water, telecoms, etc.)' },
      { value: 'unknown', label: 'Unknown — not inspected' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D22',
    section: 'common-parts',
    section_position: 6,
    type: 'single-choice',
    text: 'What type of door / enclosure does the under-stairs cupboard have?',
    help_text:
      'A fire-resisting (FD30) enclosure with a self-closer keeps a fire starting in the cupboard ' +
      '(e.g. at a meter or in stored materials) out of the escape route (LACORS §15.4, §21.1).',
    show_when: [{ when_question: 'D5', has_value: ['yes_fire_door', 'yes_no_fire_door'] }],
    options: [
      { value: 'no_door', label: 'No door — open to the escape route' },
      { value: 'lightweight_timber', label: 'Lightweight timber door (e.g. hollow / panelled)' },
      { value: 'solid_timber', label: 'Solid timber door' },
      { value: 'fd30', label: 'Fire-resisting (FD30) door and enclosure' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D23',
    section: 'common-parts',
    section_position: 7,
    type: 'single-choice',
    text: 'Does the under-stairs cupboard door self-close?',
    show_when: [
      { when_question: 'D5', has_value: ['yes_fire_door', 'yes_no_fire_door'] },
      { when_question: 'D22', has_value: ['lightweight_timber', 'solid_timber', 'fd30', 'unknown'] },
    ],
    options: [
      { value: 'yes', label: 'Yes — fitted with a working self-closer' },
      { value: 'no', label: 'No self-closer' },
      { value: 'not_applicable', label: 'Not applicable (no door)' },
      { value: 'unknown', label: 'Unknown' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D24',
    section: 'common-parts',
    section_position: 8,
    type: 'single-choice',
    text: 'Are service penetrations around the cupboard / meters sealed (fire-stopped)?',
    help_text:
      'Openings around pipes, cables and meter tails passing through the enclosure must be ' +
      'fire-stopped to at least the same fire resistance as the construction (LACORS §19.7).',
    show_when: [{ when_question: 'D5', has_value: ['yes_fire_door', 'yes_no_fire_door'] }],
    options: [
      { value: 'yes', label: 'Yes — penetrations sealed / fire-stopped' },
      { value: 'no', label: 'No — unsealed gaps around services' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D25',
    section: 'common-parts',
    section_position: 9,
    type: 'single-choice',
    text: 'Are combustible materials stored in the under-stairs cupboard?',
    show_when: [{ when_question: 'D5', has_value: ['yes_fire_door', 'yes_no_fire_door'] }],
    options: [
      { value: 'yes', label: 'Yes — combustible materials stored in the cupboard' },
      { value: 'no', label: 'No' },
      { value: 'unknown', label: 'Unknown' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D9',
    section: 'common-parts',
    section_position: 10,
    type: 'multi-choice',
    text:
      'Are any of the following present in the shared entrance hall or common escape route? ' +
      'Select all that apply.',
    help_text:
      'LACORS explicitly considers ignition risk and fuel load in the escape route. ' +
      'Any combustible material stored in the shared entrance area materially increases risk ' +
      'because it provides fuel for a fire that would block the only escape.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'bicycles_pushchairs', label: 'Bicycles or pushchairs stored in the common area' },
      { value: 'rubbish_cardboard', label: 'Rubbish or cardboard stored in the common area' },
      {
        value: 'electrical_intake',
        label:
          'Electrical intake or consumer unit in or opening onto the common area without ' +
          'a fire-resisting enclosure',
      },
      {
        value: 'combustible_materials',
        label: 'Combustible materials or furniture in the common area',
      },
      { value: 'none', label: 'None of the above' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D3',
    section: 'common-parts',
    section_position: 11,
    type: 'single-choice',
    text: 'What is the wall between the ground-floor flat and the shared entrance hall made of?',
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

  // =========================================================================
  // Ground-floor flat (§9.2)
  // The ground-floor flat is assessed separately. Where it has a direct final
  // exit or a rear exit, the engine must not drive window-remedy logic.
  // =========================================================================
  {
    id: 'B3',
    section: 'ground-flat',
    section_position: 1,
    type: 'single-choice',
    text: 'Does the ground-floor flat have a rear exit (back door to garden or outside space)?',
    help_text:
      'A direct rear exit — such as a back door opening to a garden or external space — ' +
      'provides an alternative escape route for ground-floor occupants if the main front ' +
      'door is blocked. Where a qualifying rear exit exists, window-based escape criteria ' +
      'carry less weight for the ground-floor flat.',
    options: [
      { value: 'yes', label: 'Yes — back door or direct exit to garden / outside space' },
      { value: 'no', label: 'No — front door only' },
    ],
    required: true,
    scope: 'ground',
  },

  // =========================================================================
  // Upper-floor flat (§9.3) — escape windows, inner rooms, internal route
  // =========================================================================
  {
    id: 'B4',
    section: 'upper-flat',
    section_position: 1,
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
    section: 'upper-flat',
    section_position: 2,
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
    section: 'upper-flat',
    section_position: 3,
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
    id: 'B8',
    section: 'upper-flat',
    section_position: 4,
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

  // --- Bedroom 1 (upper flat) ---
  {
    id: 'C1',
    section: 'upper-flat',
    section_position: 5,
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
    section: 'upper-flat',
    section_position: 6,
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
    section: 'upper-flat',
    section_position: 7,
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
    section: 'upper-flat',
    section_position: 8,
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
    section: 'upper-flat',
    section_position: 9,
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
    section: 'upper-flat',
    section_position: 10,
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

  // --- Second bedroom (upper flat) ---
  {
    id: 'C6',
    section: 'upper-flat',
    section_position: 11,
    type: 'single-choice',
    text: 'Is there a second bedroom in the upper flat?',
    options: [
      { value: 'yes', label: 'Yes — there is a second bedroom' },
      { value: 'no', label: 'No — only one bedroom' },
    ],
    required: true,
    scope: 'upper',
  },
  {
    id: 'C7',
    section: 'upper-flat',
    section_position: 12,
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
    section: 'upper-flat',
    section_position: 13,
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
    section: 'upper-flat',
    section_position: 14,
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
    section: 'upper-flat',
    section_position: 15,
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
    section: 'upper-flat',
    section_position: 16,
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
    section: 'upper-flat',
    section_position: 17,
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

  // --- Inner rooms (upper flat) ---
  {
    id: 'C10',
    section: 'upper-flat',
    section_position: 18,
    type: 'single-choice',
    text:
      'Is there any bedroom in the upper flat that can only be reached by passing through ' +
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

  // --- Living room window (upper flat) ---
  {
    id: 'C11',
    section: 'upper-flat',
    section_position: 19,
    type: 'single-choice',
    text: 'Does the upper flat living room have a window that can be opened?',
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
    section: 'upper-flat',
    section_position: 20,
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
    section: 'upper-flat',
    section_position: 21,
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
    section: 'upper-flat',
    section_position: 22,
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
    section: 'upper-flat',
    section_position: 23,
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

  // --- Mobility and internal entrance arrangement (upper flat) ---
  {
    id: 'C12',
    section: 'upper-flat',
    section_position: 24,
    type: 'single-choice',
    text:
      'Are any occupants of the upper flat mobility-impaired to the extent that escape ' +
      'through a window would not be possible?',
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
    section: 'upper-flat',
    section_position: 25,
    type: 'single-choice',
    text:
      'Can bedroom 1 be reached from the front door of the upper flat without passing ' +
      'through a habitable room (i.e. directly from a hallway or landing)?',
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
    section: 'upper-flat',
    section_position: 26,
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
  // External escape routes (§10) — independent upper-flat escape
  // =========================================================================
  {
    id: 'B2',
    section: 'external-escape',
    section_position: 1,
    type: 'single-choice',
    text: 'Does the upper flat have an independent escape route that does not use the shared entrance hall or internal staircase?',
    help_text:
      'Answer yes only if the route can be used from inside the upper flat without using ' +
      'the shared front entrance hall or internal staircase. For example, an external steel ' +
      'staircase to the rear garden, a rear door opening directly to outside, or another ' +
      'independent external route.',
    options: [
      {
        value: 'yes_external_steel_stair',
        label: 'Yes — external steel staircase to garden or outside',
      },
      {
        value: 'yes_rear_exit',
        label: 'Yes — rear exit or direct external route to garden / outside',
      },
      {
        value: 'yes_other',
        label: 'Yes — other independent external escape route',
      },
      { value: 'no', label: 'No — shared entrance hall and staircase only' },
      { value: 'unknown', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'B2a',
    section: 'external-escape',
    section_position: 2,
    type: 'single-choice',
    text: 'Is the external escape route permanently usable and unobstructed?',
    help_text:
      'Answer "Yes" only if the route is accessible at all times, requires no key to open ' +
      'from the inside, and is not blocked by stored items, structures, or locked gates.',
    show_when: [
      {
        when_question: 'B2',
        has_value: ['yes_external_steel_stair', 'yes_rear_exit', 'yes_other'],
      },
    ],
    options: [
      { value: 'yes', label: 'Yes — permanently accessible and unobstructed' },
      { value: 'no_obstructed', label: 'No — obstructed by stored items, structures, or barriers' },
      { value: 'no_locked_or_unavailable', label: 'No — locked or requires a key from the inside' },
      { value: 'unknown', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'B2b',
    section: 'external-escape',
    section_position: 3,
    type: 'single-choice',
    text: 'How is the external escape route reached from inside the upper flat?',
    show_when: [
      {
        when_question: 'B2',
        has_value: ['yes_external_steel_stair', 'yes_rear_exit', 'yes_other'],
      },
    ],
    options: [
      {
        value: 'from_hall_or_landing',
        label: 'From the flat entrance hall or landing — without passing through a habitable room',
      },
      { value: 'through_kitchen_or_living_room', label: 'Through the kitchen or living room' },
      { value: 'through_bedroom', label: 'Through a bedroom' },
      { value: 'unknown', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'upper',
  },
  {
    id: 'B2c',
    section: 'external-escape',
    section_position: 4,
    type: 'single-choice',
    text: 'Is the external staircase or escape route in sound structural condition?',
    help_text:
      'Assess the structural condition of any external staircase, platform, or exit door ' +
      'forming the independent escape route.',
    show_when: [
      {
        when_question: 'B2',
        has_value: ['yes_external_steel_stair', 'yes_rear_exit', 'yes_other'],
      },
    ],
    options: [
      { value: 'yes', label: 'Yes — sound condition, no visible defects' },
      {
        value: 'minor_defects',
        label: 'Minor defects — surface or cosmetic issues only; structurally sound',
      },
      {
        value: 'poor_condition',
        label: 'Poor condition — structural defects or significant deterioration visible',
      },
      { value: 'unknown', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },

  // =========================================================================
  // Doors and route protection (§11) — split by location.
  // Each door is assessed in context: ground flat entrance, upper flat
  // entrance, building final exit, and internal escape-route doors. There is
  // no context-free "entrance door" question (§11.2).
  // =========================================================================

  // --- Ground-floor flat entrance door ---
  {
    id: 'door_gf_construction',
    section: 'doors',
    section_position: 1,
    type: 'single-choice',
    text: 'What type of door is the ground-floor flat entrance door?',
    help_text:
      'This is the door between the ground-floor flat and the shared entrance hall (or, for a ' +
      'separate-entrance building, the street). A solid timber door of at least 44mm thickness ' +
      'provides some fire resistance. A hollow-core door provides minimal fire resistance. An ' +
      'FD30S fire doorset is specifically rated to resist fire for 30 minutes with seals fitted.',
    options: [
      { value: 'fd30s', label: 'FD30S fire doorset — with intumescent seals and smoke seal' },
      { value: 'solid_timber_44mm', label: 'Solid timber door, appears to be 44mm thickness or more' },
      { value: 'solid_timber_thinner', label: 'Solid timber door, appears to be less than 44mm thickness' },
      { value: 'hollow_core', label: 'Hollow-core or lightweight door' },
      { value: 'unknown', label: 'Unknown construction' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'ground',
  },
  {
    id: 'F1a',
    section: 'doors',
    section_position: 2,
    type: 'single-choice',
    text:
      'Is a functioning self-closing device fitted to the ground-floor flat entrance door?',
    help_text:
      'The flat entrance door separating the ground-floor flat from the shared entrance hall ' +
      'or common escape route. LACORS §21.5 states that the entrance door to each self-contained ' +
      'flat should be fitted with a self-closing device. ' +
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
    scope: 'ground',
  },
  {
    id: 'door_gf_fit',
    section: 'doors',
    section_position: 3,
    type: 'single-choice',
    text:
      'Does the ground-floor flat entrance door fit and latch properly when closed — ' +
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
    scope: 'ground',
  },
  {
    id: 'door_gf_seals',
    section: 'doors',
    section_position: 4,
    type: 'single-choice',
    text:
      'Does the ground-floor flat entrance door have intumescent seals and/or smoke seals ' +
      'around the door edges?',
    help_text:
      'Intumescent seals expand in fire to seal the gap around the door. Smoke seals reduce ' +
      'smoke ingress at lower temperatures. Both are part of the FD30S fire door specification. ' +
      'A door that is not an FD30S is unlikely to have these.',
    options: [
      { value: 'both', label: 'Both intumescent seals and smoke seals fitted' },
      { value: 'intumescent_only', label: 'Intumescent seals only (no smoke seals)' },
      { value: 'none', label: 'No seals fitted' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'ground',
  },

  // --- Upper-flat entrance door ---
  {
    id: 'door_uf_construction',
    section: 'doors',
    section_position: 5,
    type: 'single-choice',
    text: 'What type of door is the upper flat entrance door?',
    help_text:
      'This is the door between the upper flat and the shared entrance hall or common escape ' +
      'route (typically at the top or bottom of the stair). A solid timber door of at least ' +
      '44mm thickness provides some fire resistance. A hollow-core door provides minimal fire ' +
      'resistance. An FD30S fire doorset is specifically rated to resist fire for 30 minutes.',
    options: [
      { value: 'fd30s', label: 'FD30S fire doorset — with intumescent seals and smoke seal' },
      { value: 'solid_timber_44mm', label: 'Solid timber door, appears to be 44mm thickness or more' },
      { value: 'solid_timber_thinner', label: 'Solid timber door, appears to be less than 44mm thickness' },
      { value: 'hollow_core', label: 'Hollow-core or lightweight door' },
      { value: 'unknown', label: 'Unknown construction' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'upper',
  },
  {
    id: 'F1b',
    section: 'doors',
    section_position: 6,
    type: 'single-choice',
    text:
      'Is a functioning self-closing device fitted to the upper-flat entrance door?',
    help_text:
      'The door at the bottom of the staircase (or at the flat entrance) separating the ' +
      'upper flat from the shared entrance hall or common escape route. ' +
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
    scope: 'upper',
  },
  {
    id: 'door_uf_fit',
    section: 'doors',
    section_position: 7,
    type: 'single-choice',
    text:
      'Does the upper flat entrance door fit and latch properly when closed — ' +
      'either by self-closer or manually?',
    help_text:
      'A door that does not fully close and latch cannot contain smoke or fire even ' +
      'briefly. Check that the door sits flush in the frame and that the latch engages ' +
      'without having to hold or force the door.',
    options: [
      { value: 'yes', label: 'Yes — fits flush in frame and latches without force' },
      { value: 'no', label: 'No — sticks, does not sit flush, or latch does not engage' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'upper',
  },
  {
    id: 'door_uf_seals',
    section: 'doors',
    section_position: 8,
    type: 'single-choice',
    text:
      'Does the upper flat entrance door have intumescent seals and/or smoke seals ' +
      'around the door edges?',
    help_text:
      'Intumescent seals expand in fire to seal the gap around the door. Smoke seals reduce ' +
      'smoke ingress at lower temperatures. Both are part of the FD30S fire door specification. ' +
      'A door that is not an FD30S is unlikely to have these.',
    options: [
      { value: 'both', label: 'Both intumescent seals and smoke seals fitted' },
      { value: 'intumescent_only', label: 'Intumescent seals only (no smoke seals)' },
      { value: 'none', label: 'No seals fitted' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'upper',
  },

  // --- Building final exit door ---
  {
    id: 'F6b',
    section: 'doors',
    section_position: 9,
    type: 'single-choice',
    text:
      'Does the building final exit door have a self-closing device?',
    help_text:
      'The final exit door from the building to the outside — the shared front door at ' +
      'street level. A self-closer ensures this door returns to a closed position after use, ' +
      'maintaining smoke containment in the common escape route and limiting unauthorised access.',
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
  {
    id: 'door_final_keyless',
    section: 'doors',
    section_position: 10,
    type: 'single-choice',
    text: 'Can the building final exit door be opened from the inside without a key?',
    help_text:
      'The shared front door to the street must be openable from inside without searching for ' +
      'a key during an escape. A double-cylinder deadlock (key required from both sides) on the ' +
      'final exit is a serious risk. A thumb-turn or night-latch that opens with a knob from ' +
      'inside is acceptable.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — opens from inside without a key (thumb-turn or knob)' },
      { value: 'no', label: 'No — a key is required to open it from the inside' },
      { value: 'not_sure', label: 'Not sure — lock type not checked' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },

  // --- Internal escape-route doors (within either flat) ---
  {
    id: 'F5',
    section: 'doors',
    section_position: 11,
    type: 'single-choice',
    text:
      'Within either flat, does the flat entrance door or any door on the internal escape ' +
      'route require a key to open from the inside?',
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
        label: 'No — the flat entrance and all escape-route doors open from inside without a key',
      },
      {
        value: 'yes',
        label:
          'Yes — the flat entrance door or an internal door requires a key to open from inside',
      },
      { value: 'not_sure', label: 'Not sure — lock type not checked' },
    ],
    required: true,
    scope: 'both',
  },

  // =========================================================================
  // Stair compartmentation (§12) — shown only when B1 = 'communal'.
  // Evidence-led: ask what observable evidence exists that the enclosure
  // probably provides compartmentation, not "is it fire resistant?".
  // =========================================================================
  {
    id: 'D1',
    section: 'stair',
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
    section: 'stair',
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
    id: 'D4',
    section: 'stair',
    section_position: 3,
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
    id: 'D6',
    section: 'stair',
    section_position: 4,
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
    section: 'stair',
    section_position: 5,
    type: 'single-choice',
    text: 'What is the floor and ceiling construction between the ground-floor flat and the upper flat?',
    help_text:
      'The floor/ceiling between the two flats is the primary fire separation between ' +
      'two separate households. If there is no plasterboard ceiling lining to the joists ' +
      'visible in the ground-floor flat ceiling, fire can spread rapidly between flats.',
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
        label: 'Timber joists with no plasterboard — exposed joists visible in ground-floor ceiling',
      },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D8',
    section: 'stair',
    section_position: 6,
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
    id: 'D10',
    section: 'stair',
    section_position: 7,
    type: 'single-choice',
    text: 'What is the main construction material of the upper stair enclosure / stair-flight side walls?',
    help_text:
      'The stair enclosure is often one of the most important fire separation elements ' +
      'protecting the shared escape route. Masonry provides inherent fire resistance; plasterboard performance ' +
      'depends on thickness and board type; timber panelling provides negligible resistance. ' +
      'The lower / ground-floor continuation of the route is captured separately (D19).',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'masonry', label: 'Brick or masonry' },
      { value: 'plasterboard', label: 'Plasterboard (stud partition or board lining)' },
      { value: 'lath_plaster', label: 'Lath and plaster' },
      { value: 'timber_panelling', label: 'Timber panelling or boarding' },
      { value: 'mixed', label: 'Mixed — different materials in different sections' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D11',
    section: 'stair',
    section_position: 8,
    type: 'single-choice',
    text: 'What period was this building constructed or substantially altered?',
    help_text:
      'The construction or alteration period gives context to likely construction standards. ' +
      'Buildings from before 1950 and from 1950–1970 often used materials and techniques that do not meet modern ' +
      'compartmentation standards. Combined with low inspection confidence, the period affects ' +
      'how much weight can be placed on visual assessment alone.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'pre_1950', label: 'Before 1950' },
      { value: '1950_1970', label: '1950–1970' },
      { value: '1970_1991', label: '1971–1991' },
      { value: 'post_1991', label: '1992 or later' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'common',
  },
  {
    id: 'D12',
    section: 'stair',
    section_position: 9,
    type: 'single-choice',
    text: 'What is the approximate board thickness of the stair enclosure lining?',
    help_text:
      '12.5mm plasterboard provides approximately 30 minutes fire resistance (LACORS §19.5). ' +
      '9.5mm provides substantially less. Under 9.5mm (including hardboard) provides negligible ' +
      'fire resistance. Double-layer or fire-rated board systems provide 60 minutes or more.',
    show_when: [
      { when_question: 'B1', has_value: 'communal' },
      { when_question: 'D10', has_value: ['plasterboard', 'lath_plaster', 'mixed', 'unknown'] },
    ],
    options: [
      { value: 'under_9_5', label: 'Under 9.5mm — thin board (e.g. 6mm hardboard or thin ply)' },
      { value: '9_5', label: '9.5mm — standard lightweight plasterboard' },
      { value: '12_5', label: '12.5mm — standard plasterboard (approximately 30-minute fire resistance)' },
      { value: 'double_layer', label: 'Double layer or over 25mm total — heavy or fire-rated board system' },
      { value: 'unknown', label: 'Unknown — cannot determine thickness without measurement' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D13',
    section: 'stair',
    section_position: 10,
    type: 'single-choice',
    text: 'Is the stair enclosure board fire resistant (Type F or fire-rated grade)?',
    help_text:
      'Standard plasterboard has some fire resistance by mass but is not specifically rated. ' +
      'Fire-resistant plasterboard (BS EN 520 Type F) contains glass fibre reinforcement and ' +
      'achieves a better fire performance for the same nominal thickness.',
    show_when: [
      { when_question: 'B1', has_value: 'communal' },
      { when_question: 'D10', has_value: ['plasterboard', 'lath_plaster', 'mixed', 'unknown'] },
    ],
    options: [
      { value: 'standard', label: 'Standard plasterboard — not specifically fire rated' },
      { value: 'fire_resistant', label: 'Fire resistant plasterboard (Type F or fire-rated grade)' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'common',
  },
  {
    id: 'D14',
    section: 'stair',
    section_position: 11,
    type: 'single-choice',
    text: 'What level of inspection was carried out on the stair enclosure construction?',
    help_text:
      'This question records how much evidence was obtained. Visual-only inspection cannot ' +
      'confirm what lies behind a surface finish. Edge-visible or intrusive inspection provides ' +
      'more reliable evidence. The confidence level affects how strongly compartmentation ' +
      'conclusions can be drawn.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'visual_only', label: 'Visual only — surface inspection, no access to inside of the construction' },
      { value: 'edge_visible', label: 'Edge visible — board edge visible at a junction, thickness estimated' },
      { value: 'inspection_opening', label: 'Inspection opening — an opening exists or was made to view the inside' },
      { value: 'intrusive_confirmed', label: 'Intrusive inspection confirmed — full access obtained and construction confirmed' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D15',
    section: 'stair',
    section_position: 12,
    type: 'single-choice',
    text: 'Are there visible penetrations through the stair enclosure walls or ceiling?',
    help_text:
      'Unsealed penetrations (old pipe chases, cable runs, redundant holes) allow fire and ' +
      'smoke to bypass the enclosure even where the main lining is otherwise adequate. ' +
      'Fire stopping all penetrations is a LACORS §20 requirement.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'none', label: 'None visible — surfaces appear intact with no penetrations' },
      { value: 'sealed', label: 'Penetrations present but sealed — fire-stopped around pipes or cables' },
      { value: 'unsealed', label: 'Unsealed penetrations — visible gaps around pipes, cables, or redundant holes' },
      { value: 'unknown', label: 'Unknown — surfaces not fully inspected' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D16',
    section: 'stair',
    section_position: 13,
    type: 'single-choice',
    text: 'Does the stair enclosure run continuously from ground level to the top of the building without gaps or breaks?',
    help_text:
      'A stair enclosure that is incomplete — for example where a section of wall is missing, ' +
      'replaced with open balustrade, or interrupted by a mezzanine or later loft alteration — ' +
      'does not provide continuous compartmentation. Any break in continuity significantly ' +
      'reduces its effectiveness as a fire barrier.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — the enclosure appears continuous from ground to top' },
      { value: 'no', label: 'No — there are gaps, breaks, or incomplete sections in the enclosure' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D17',
    section: 'stair',
    section_position: 14,
    type: 'single-choice',
    text: 'Are there concealed voids or spaces within or running alongside the stair enclosure?',
    help_text:
      'Concealed voids — such as spaces inside stud partitions, beneath the stair casing, ' +
      'or above suspended ceilings — can act as hidden fire paths between floors or dwellings ' +
      'if they are not fire-stopped at each floor level. This is a known risk wherever floors ' +
      'or dwellings have been formed within an existing structure.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — hidden voids or spaces are present or suspected' },
      { value: 'no', label: 'No — no concealed voids identified' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'RISK_ELEVATE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D18',
    section: 'stair',
    section_position: 15,
    type: 'single-choice',
    text: 'Is the staircase the only shared escape route for both flats?',
    help_text:
      'Where the staircase is the sole escape route, any failure of its compartmentation ' +
      'affects both households simultaneously. Where at least one flat has an independent ' +
      'escape route, the risk profile changes and some compartmentation requirements are ' +
      'less critical.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — the staircase is the sole shared escape route for both flats' },
      { value: 'no', label: 'No — at least one flat has an independent escape route not using this staircase' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'D19',
    section: 'stair',
    section_position: 16,
    type: 'single-choice',
    text: 'What is the construction of the lower / ground-floor continuation of the stair enclosure or shared-route wall?',
    help_text:
      'Mixed construction is common: masonry alongside part of the route, changing to a ' +
      'stud/plasterboard wall (sometimes with mineral-wool insulation) for the lower or ground-floor ' +
      'section. LACORS §19.4 requires the protected route to be enclosed to 30-minute fire resistance ' +
      'at all points, so this lower section is assessed separately from the upper stair enclosure (D10).',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'masonry', label: 'Brick or masonry' },
      { value: 'stud_plasterboard', label: 'Stud wall with plasterboard' },
      { value: 'lath_plaster', label: 'Lath and plaster' },
      { value: 'mixed', label: 'Mixed — different materials in different sections' },
      { value: 'unknown', label: 'Unknown' },
    ],
    uncertainty_behaviour: 'CONSERVATIVE',
    required: true,
    scope: 'common',
  },
  {
    id: 'D20',
    section: 'stair',
    section_position: 17,
    type: 'single-choice',
    text: 'Where any part of the enclosure is stud/plasterboard, what insulation is within the stud void?',
    help_text:
      'Mineral wool / Rockwool within a stud partition can improve fire performance, but on its own ' +
      'it is NOT proof of a 30-minute fire-resisting construction — the rating depends on a complete ' +
      'tested construction (LACORS §19.3). Record it as supporting evidence, not as confirmation.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'none', label: 'None — no insulation in the void' },
      { value: 'mineral_wool', label: 'Mineral wool / Rockwool' },
      { value: 'not_applicable', label: 'Not applicable — no stud/plasterboard section' },
      { value: 'unknown', label: 'Unknown — void not inspected' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'common',
  },

  // =========================================================================
  // Detection and alarms (§13) — separated by scope.
  // Within-flat detection (scope 'both') is distinguished from common-parts
  // detection (scope 'common'). Within-flat interlinking (E6a) is distinct
  // from between-flat / common-parts interlinking (E6b), which is only asked
  // where common parts exist — never as a blanket question.
  // =========================================================================
  {
    id: 'E1',
    section: 'detection',
    section_position: 1,
    type: 'single-choice',
    text: 'What type of fire alarms are fitted within the flats?',
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
    scope: 'both',
  },
  {
    id: 'E2',
    section: 'detection',
    section_position: 2,
    type: 'multi-choice',
    text: 'Where are alarms currently located? Select all that apply.',
    options: [
      { value: 'communal_hallway', label: 'In the shared entrance hall or stair' },
      {
        value: 'ground_flat_lobby',
        label: 'In the entrance lobby/hallway of the ground-floor flat',
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
    scope: 'both',
  },
  {
    id: 'E3',
    section: 'detection',
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
    scope: 'both',
  },
  {
    id: 'E6a',
    section: 'detection',
    section_position: 4,
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
    scope: 'both',
  },
  {
    id: 'E7',
    section: 'detection',
    section_position: 5,
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
    scope: 'both',
  },
  {
    id: 'E4',
    section: 'detection',
    section_position: 6,
    type: 'single-choice',
    text: 'Is there a mains-wired alarm in the shared entrance hall or common escape route?',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes_mains', label: 'Yes — mains-wired smoke alarm' },
      { value: 'yes_battery', label: 'Yes — battery-only alarm' },
      { value: 'no', label: 'No alarm in the common area' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'E5',
    section: 'detection',
    section_position: 7,
    type: 'single-choice',
    text:
      'Is there a heat detector in each flat\'s entrance lobby, interlinked with the ' +
      'common-parts alarm?',
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
    id: 'E6b',
    section: 'detection',
    section_position: 8,
    type: 'single-choice',
    text:
      'Are the alarms in each flat interlinked with the other flat, or with an alarm in ' +
      'the common parts?',
    help_text:
      'Between-flat / common-parts interlinking means a fire alarm in one flat would also ' +
      'trigger the other flat\'s alarms or the common-parts alarm. This is only asked because ' +
      'this building has common parts. ' +
      'Note: whether between-flat interlinking is required for this building type is a point ' +
      'of regulatory interpretation that has not been definitively confirmed. This question is ' +
      'captured for information. If in doubt, seek advice from a qualified electrician or fire ' +
      'risk assessor.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — alarms across both flats are interlinked' },
      { value: 'communal_only', label: 'Only via a common-parts alarm — not directly between flats' },
      { value: 'no', label: 'No — each flat\'s alarms are separate from the other flat' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    uncertainty_behaviour: 'ADVISORY_ONLY',
    required: true,
    scope: 'common',
  },

  // =========================================================================
  // Gas / electrical / CO (§14)
  // CO is split into two questions (§14.1): appliance presence, then alarm.
  // =========================================================================
  {
    id: 'G1',
    section: 'services',
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
    scope: 'building',
  },
  {
    id: 'G2',
    section: 'services',
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
    scope: 'building',
  },
  {
    id: 'G4a',
    section: 'services',
    section_position: 3,
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
    section: 'services',
    section_position: 4,
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
  // Management and maintenance
  // =========================================================================
  {
    id: 'G3',
    section: 'management',
    section_position: 1,
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
    id: 'H1',
    section: 'management',
    section_position: 2,
    type: 'single-choice',
    text: 'Is the shared entrance hall and stair kept clear of combustible materials and obstructions?',
    help_text:
      'LACORS places significant weight on management quality as a risk factor. ' +
      'The shared entrance hall and stair serving the upper flat form the common escape route. ' +
      'Any combustible materials stored here increase both ignition risk ' +
      'and the risk of blocking the only escape. Answer based on the current typical ' +
      'condition — not a one-off clearance done recently.',
    show_when: [{ when_question: 'B1', has_value: 'communal' }],
    options: [
      { value: 'yes', label: 'Yes — consistently kept clear at all times' },
      { value: 'mostly', label: 'Mostly — occasional items left temporarily' },
      { value: 'no', label: 'No — items are regularly stored in the common area' },
    ],
    required: true,
    scope: 'common',
  },
  {
    id: 'H2',
    section: 'management',
    section_position: 3,
    type: 'single-choice',
    text:
      'Are tenants made aware of the fire escape arrangements for their flat — how ' +
      'to exit, what to do if the alarm sounds, and not to store materials in common areas?',
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
    scope: 'building',
  },
  {
    id: 'H3',
    section: 'management',
    section_position: 4,
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
    scope: 'building',
  },
  {
    id: 'H4',
    section: 'management',
    section_position: 5,
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
    scope: 'building',
  },
]

// ---------------------------------------------------------------------------
// Helpers consumed by the navigator engine
// ---------------------------------------------------------------------------

/**
 * Ordered list of sections as they appear in the v2 flow (§18.1).
 * 'results' is the terminal marker (Review / Report screens); it carries no
 * questions and is filtered out of section progress.
 */
export const SECTION_ORDER: SectionId[] = [
  'setup',
  'building',
  'common-parts',
  'ground-flat',
  'upper-flat',
  'external-escape',
  'doors',
  'stair',
  'detection',
  'services',
  'management',
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
