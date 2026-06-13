# Actionable Step: Question Schema Refactor

**Objective:** Re-group the question bank in `src/data/schema/questions.ts` into the v2 sequence with mandatory scope labels, and split the compressed CO, alarm, and door questions so each fact maps cleanly to the v2 data model.

**Prerequisites:** Step 1 (types) and Step 2 (classification consumes these answers). Recommended to land after Step 2 so answer IDs are stable.

**Action Items:**

1. Reorder `QUESTIONS` and `SECTION_ORDER` to the §18.1 flow: Setup → Building classification → Common parts / entrance → Ground-floor flat → Upper-floor flat → External escape routes → Doors and route protection → Stair compartmentation → Detection and alarms → Gas / electrical / CO → Management → Review → Report.
2. Make `scope` **required** on every question (§18.2) with the labelset `Building | Common parts | Ground-floor flat | Upper flat | Both flats`. Extend the `QuestionScope` type to include `'both'` and rename the rendered labels in `QuestionCard.tsx` to the precise terms in §8.2 (stop using "communal staircase"; use "shared entrance hall", "stair serving upper flat", "common escape route", "final exit door").
3. Split the CO question into two (§14.1): `fixed_combustion_appliance_present` and `co_alarm_present_in_same_room`, replacing any single compressed CO question. Wire branching so the alarm question shows only when an appliance is present/unknown.
4. Split detection/alarm questions by scope (§13): separate within-flat detection from common-parts detection, and distinguish within-flat interlinking from between-flat/common-parts interlinking. Do not ask cross-flat interlinking as a blanket question.
5. Split door questions by location (§11.2): distinct questions for `ground_flat_entrance`, `upper_flat_entrance`, `building_final_exit`, and `internal_escape_route`. Remove any context-free "entrance door" question.
6. Confirm/retain the dedicated stair-compartmentation subsection (`D10`–`D18` per `docs/stair-enclusure.md`) under the Stair compartmentation section, with evidence-led wording ("what evidence exists that the enclosure provides compartmentation").
7. Add/retain ground-floor-flat escape questions so the engine can avoid window-remedy logic where a direct final exit or rear exit exists (§9.2).
8. Re-point all `show_when` `BranchCondition.when_question` and `triggers_out_of_scope` references to the new IDs. Update the V9 (three+ flats) and V10 (bedsit HMO) out-of-scope triggers per §4.2.
9. Update `navigator.test.ts` fixtures and any hard-coded question IDs in `classifier.ts`/`remedy-rules.ts` references touched here.

**Acceptance Criteria:**
- Every question in `QUESTIONS` has a non-empty `scope`.
- CO is two questions; doors are split by the four locations; detection is split flat vs common parts.
- Section sequence matches §18.1; `getNextQuestion` walks them in that order.
- `npm test` and `npx tsc --noEmit` exit 0; the questionnaire navigates end-to-end without dead branches.

**Notes:**
- [Unverified] The current file is ~2100 lines with 63 questions (P, A–H). Exact current IDs and existing `D10`–`D18` coverage must be read in full before re-grouping; some splits may already be partially present.
- This step changes answer IDs, so it invalidates any saved v1 answers — acceptable under the fresh-v2-only decision (Step 7 surfaces legacy data as incompatible).
