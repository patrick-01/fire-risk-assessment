# Fire Assessment Tool — Issues Extracted from Meeting Transcript (2026-04-10)

## Purpose
This document extracts the issues raised during the review meeting and turns them into a practical fix list for Claude Code. Each item states whether the likely fix is:
- **Wording / UX clarification**
- **Logic / branching change**
- **Data model / app structure change**
- **Research / regulatory confirmation needed**

## Overall theme
The dominant issue is that the tool sometimes treats the assessment as though it is assessing **one flat**, but many questions and outputs actually require an assessment of the **whole building / both flats together**. This creates ambiguity, especially for:
- upper vs lower flat
- alarms
- doors
- escape strategy
- final classification / report output

---

## 1. Core scope ambiguity — assessing a flat vs assessing a building

### Issue 1.1 — The tool does not clearly establish whether the assessment is for:
- one flat only,
- the upper flat,
- the lower flat,
- or the whole two-flat building.

**Observed problem:** The meeting repeatedly identified that questions switched between upper-floor assumptions and lower-floor facts without warning.

**Why it matters:** Fire safety conclusions depend on whether the app is assessing:
- a single dwelling unit,
- both flats together,
- or the building envelope/common risk.

**Likely fix:** **Data model / app structure change**

**Required change:**
- Decide the primary assessment unit explicitly.
- Most likely model:
  - **One assessment per building**
  - with separate sub-sections for:
    - ground floor flat
    - upper flat
    - shared/common parts if any
- The app should not implicitly switch between flats.

**Claude Code action:**
- Introduce a top-level concept of `building_assessment`.
- Within that, capture:
  - `ground_floor_flat`
  - `upper_flat`
  - `common_parts`
- Review all questions and tag them as applying to one of those three scopes.

---

### Issue 1.2 — The app currently appears to ask some questions as though it is assessing the upper flat only.

**Examples from meeting:**
- independent rear exit of upper flat
- upper flat floor height
- upper flat bedroom escape windows

**Problem:** When the user entered data for 43 (ground floor flat), later questions still appeared to assume upper-flat logic.

**Likely fix:** **Logic / branching change**

**Required change:**
- Questions about the upper flat must only appear when the current subject is clearly the upper flat.
- If assessing the whole building, the app must clearly label each question as:
  - “Ground floor flat”
  - “Upper flat”
  - “Building / common parts”

---

### Issue 1.3 — One report may need to cover the whole building, not one flat in isolation.

**Meeting view:** Patrick suggested there should potentially be one assessment for the building rather than separate isolated flat-level assessments.

**Likely fix:** **Data model / app structure change**

**Required change:**
- Reconsider whether the output should be:
  - one report per building, with separate findings by flat, or
  - one report per flat plus one building/common-parts report.
- Current app behaviour seems inconsistent with either model.

**Recommended implementation direction:**
- Produce **one building-level report** with sections:
  - classification
  - flat A findings
  - flat B findings
  - common parts findings
  - building-wide remedies

---

## 2. Missing explicit identification of which flat is being discussed

### Issue 2.1 — The app needs an early explicit “which unit are we talking about?” selector or clearer scoping.

**Observed problem:** The reviewers repeatedly lost track of whether the app was discussing the lower flat or the upper flat.

**Likely fix:** **Wording / UX clarification** plus **Data model change**

**Required change:**
- Early in the assessment, force the app to establish one of:
  - “This assessment covers the whole building”
  - “Now answer questions for the ground floor flat”
  - “Now answer questions for the upper flat”
- Every question header should display a scope badge.

**Suggested UI wording:**
- `Currently assessing: Ground floor flat`
- `Currently assessing: Upper flat`
- `Currently assessing: Common parts / building`

---

## 3. Ground floor vs upper flat escape logic is mixed up

### Issue 3.1 — Ground floor and upper floor escape routes are materially different, but the tool does not separate them properly.

**Examples discussed:**
- upper flat may have escape windows that qualify
- ground floor flat may instead rely on rear doors
- ground floor window opening geometry may fail while door escape remains available

**Likely fix:** **Logic / branching change**

**Required change:**
- Escape route logic must be calculated separately for each flat.
- Do not ask one generic set of escape-window questions and assume that covers both.

**Claude Code action:**
- Create separate derived outputs:
  - `ground_floor_escape_strategy`
  - `upper_floor_escape_strategy`
- Each should consider:
  - rear exit
  - window qualification
  - inner-room condition
  - final exit door issues

---

### Issue 3.2 — Ground floor rear-door escape may be adequate even if windows fail.

**Observed problem:** Reviewers noted that downstairs may not have qualifying escape windows, but may still have direct garden exit.

**Likely fix:** **Logic / branching change**

**Required change:**
- The ground-floor flat should not be driven into unnecessary window-based remedies where a direct final exit or rear exit exists.
- Escape strategy should be hierarchical:
  1. direct final exit / rear exit
  2. protected route
  3. qualifying escape window

---

### Issue 3.3 — Window type / opening direction matters and needs to be captured more accurately.

**Examples discussed:**
- some windows only open at the top
- some have high sill because only top opening is usable
- some are lockable with key
- some flats have Juliet-style doors that may qualify like escape windows

**Likely fix:** **Question wording / logic change**

**Required change:**
- Add more precise window / glazed-door questions:
  - what part opens?
  - does it open at the bottom or top?
  - is the effective opening below 1100 mm sill height?
  - is it key-lockable?
  - is it a full-height door / Juliet door / French door rather than a conventional window?

**Claude Code action:**
- Add a window / escape opening type question:
  - top-hung only
  - sash opening from bottom
  - casement
  - full-height glazed door / Juliet door
- Update escape qualification logic accordingly.

---

## 4. Ambiguity around second bedroom / room count / room use

### Issue 4.1 — The tool becomes confused where one flat has one bedroom and the paired flat has two.

**Observed problem:** When reviewing 43, the app reached second-bedroom questions, but that depended on which flat was being discussed.

**Likely fix:** **Data model / branching change**

**Required change:**
- Bedroom count must be captured separately for each flat.
- Bedroom 2 questions must only appear for the flat that actually has a second bedroom.

---

### Issue 4.2 — Some non-bedroom rooms could in practice be used as sleeping rooms.

**Example discussed:** a front room could theoretically be used as a bedroom in some flats.

**Likely fix:** **Research / policy decision needed** plus possible **question wording change**

**Required change:**
- Decide whether the tool assesses:
  - formal layout only, or
  - reasonably foreseeable sleeping use.
- If the latter, add a question like:
  - “Is there any additional habitable room that could realistically be used as a bedroom?”

**Open point:** This needs careful handling to avoid overreaching.

---

## 5. Ambiguity in inner-room / circulation questions

### Issue 5.1 — Some access-route questions are too easy to misread.

**Example discussed:**
- “Can bedroom one be reached from the front door without passing through a habitable room?”
- Reviewers disagreed briefly because they were parsing hallway vs living room differently.

**Likely fix:** **Wording / UX clarification**

**Required change:**
- Rewrite access-route questions to be concrete and property-observation based.

**Suggested wording:**
- `From the flat entrance door, do you enter a hallway/corridor before reaching Bedroom 1?`
- `Or do you enter a living room / kitchen-living room first?`

This is clearer than legal-style wording.

---

### Issue 5.2 — Question about lockable internal doors needs more explicit wording.

**Observed problem:** There was confusion between:
- whether the door is currently locked,
- whether it can theoretically be locked,
- whether it requires a key to exit.

**Likely fix:** **Wording clarification**

**Suggested wording:**
- `Is there any internal door on the escape route that can only be opened from inside using a key?`
- `Ignore whether the tenant usually leaves it unlocked — answer based on the lock fitted.`

---

## 6. Alarm system questions are too ambiguous and not granular enough

### Issue 6.1 — Grade D1 vs D2 is not captured.

**Meeting conclusion:** Section E Question 1 needs to differentiate between D1 and D2 and explain the difference.

**Likely fix:** **Question / data model change**

**Required change:**
- Replace generic “mains-wired with battery backup” with specific options:
  - Grade D1 — mains-wired with sealed tamper-proof long-life battery backup
  - Grade D2 — mains-wired with replaceable battery backup
  - Battery-only / Grade F
  - Unknown

**Also required:**
- Help text explaining D1 vs D2.

---

### Issue 6.2 — Alarm questions do not clearly distinguish smoke vs heat detectors in enough detail.

**Observed problem:** The reviewers wanted clarity that the question includes heat alarms as well as smoke alarms.

**Likely fix:** **Wording / data capture change**

**Required change:**
- For each flat and for common parts, capture:
  - smoke detectors present where?
  - heat detectors present where?

Avoid relying on one broad mixed question.

---

### Issue 6.3 — The app is unclear whether alarm-location questions refer to one flat, both flats, or the building overall.

**Observed problem:** Upstairs and downstairs alarm layouts differ.

**Likely fix:** **Data model / app structure change**

**Required change:**
- Alarm inventory must be collected separately for:
  - ground floor flat
  - upper flat
  - common parts

---

### Issue 6.4 — Interlinking question is ambiguous.

**Meeting conclusion:** Section E Question 6 is unclear whether it means:
- within one flat, or
- between flats / across the whole building.

**Likely fix:** **Wording clarification + possible split question**

**Required change:**
Split into two questions:
1. `Within this flat, are the alarms interlinked so that if one alarm sounds, the others in the same flat sound?`
2. `Are alarms interlinked between flats or with any communal/common-area alarms?`

---

### Issue 6.5 — Practical testing of interlinking may require two people.

**Observed problem:** Some alarm checks are not realistically verifiable by one person.

**Likely fix:** **Guidance note / workflow addition**

**Required change:**
- Add a note when answering alarm-interlink questions:
  - `This may require two people to verify reliably.`
- Allow `not yet verified` as a state distinct from generic “not sure”.

---

### Issue 6.6 — Whether alarms should interlink between two separate flats remains a regulatory uncertainty.

**Observed problem:** The meeting identified uncertainty about whether separate flats without communal space should have linked alarms.

**Likely fix:** **Research / regulatory confirmation needed**

**Required change:**
- Mark this as an unresolved policy point.
- The app should not overstate a requirement here unless confirmed.

---

## 7. Door questions are ambiguous in several places

### Issue 7.1 — “Entrance door” is ambiguous.

**Meeting conclusion:** Section F Question 1 is ambiguous in buildings with communal entrances because it could mean:
- building front door, or
- flat entrance door.

**Likely fix:** **Wording clarification**

**Required change:**
- Always say either:
  - `building entrance door`
  - `flat entrance door`
  - `final exit door`
- Never use “entrance door” alone.

---

### Issue 7.2 — Self-closer wording may be misread.

**Observed problem:** “Does the door close and latch properly without being forced?” was read two different ways:
- is the door generally functional?
- or does the self-closer pull it shut and latch it correctly?

**Likely fix:** **Wording clarification**

**Suggested wording:**
- `If a self-closing device is fitted, does it pull the door fully shut so that the latch engages without manual help?`

And separately:
- `Does the door itself fit and latch properly when manually closed?`

---

### Issue 7.3 — Need for thumb-turn / keyless egress needs to be captured more explicitly.

**Observed problem:** Reviewers noted they can fix some issues by replacing keyed locks with thumb turns.

**Likely fix:** **Question + remedy wording change**

**Required change:**
- Add explicit final-exit / egress-lock questions per flat.
- Result text should suggest thumb-turns where appropriate.

---

## 8. Some management questions appear inapplicable or oddly phrased for certain properties

### Issue 8.1 — Common-parts / tenant fire-escape awareness questions may be inapplicable for non-communal maisonettes.

**Observed problem:** Reviewers questioned why some management/common-parts questions were being asked where there is no communal area.

**Likely fix:** **Branching refinement**

**Required change:**
- Tighten branching for management section:
  - common-parts-specific questions should only appear if common parts exist.
- Flat-specific management questions should be distinguished from common-parts management questions.

---

### Issue 8.2 — Maintenance schedule question may need more nuanced answer options.

**Observed problem:** Reviewers felt the reality is often informal periodic checking rather than a formal documented maintenance regime.

**Likely fix:** **Question wording / answer options**

**Required change:**
- Add options such as:
  - formal documented schedule
  - regular informal checks
  - ad hoc only
  - none

This will produce more realistic management scoring.

---

## 9. Purpose-built maisonette handling / classification bug

### Issue 9.1 — Report output showed “unresolved” for a purpose-built maisonette scenario where the users expected clearer handling.

**Observed problem:** After entering purpose-built maisonette information, the report still returned `unresolved`.

**Likely fix:** **Logic bug**

**Required change:**
- Review classification logic for purpose-built maisonettes / non-converted buildings.
- If the tool is out of scope for these, it should say so clearly and stop.
- It should not drift into an unresolved report if the intended result is `not Section 257 / different framework`.

**Claude Code action:**
- Re-test purpose-built maisonette path and ensure it produces the intended state.

---

## 10. Need for report outputs to cite the underlying legal / LACORS references

### Issue 10.1 — The report needs to reference the relevant LACORS sections so the result can be checked manually.

**Meeting comment:** Once the report is produced, it should reference the sections in the LACORS document so the users can verify it.

**Likely fix:** **Report enhancement**

**Required change:**
- Every finding / remedy should include:
  - plain-English explanation
  - basis tag
  - specific LACORS / legal reference

This is important for trust and auditability.

---

## 11. Need for better handling of “current state” vs “planned remedy”

### Issue 11.1 — Some answers are being given based on what will be changed shortly, not what exists today.

**Example discussed:** locks that currently require keys but will be changed to thumb-turns.

**Likely fix:** **UX / data model improvement**

**Required change:**
- Clarify that questions should be answered based on **current existing condition**, not intended future works.
- Optionally add a later “planned remedy / notes” field.

**Suggested wording at top of questionnaire:**
- `Answer based on the property as it exists today, not planned future changes.`

---

## 12. Need for a property-type test set / regression cases

### Issue 12.1 — The users want to test a handful of representative properties and compare outputs against expected outcomes.

**Observed need:** They want to print reports for each property type and verify the outputs.

**Likely fix:** **Testing / QA process change**

**Required change:**
- Create a library of representative regression cases, e.g.:
  - purpose-built maisonette, no communal area
  - converted two-flat building with communal hall
  - upper flat with qualifying escape window
  - ground floor flat with rear exit but non-qualifying windows
  - problematic maisonette (37A-style edge case)

**Claude Code action:**
- Add a `docs/test-cases.md` or similar with canonical example cases and expected classifications / outputs.

---

## 13. Research questions explicitly identified in the meeting

These are not app bugs alone; they need legal/guidance confirmation.

### Research 13.1
Whether separate flats in the same building, without communal space, need alarms interlinked between flats.

### Research 13.2
Exact treatment of D1 vs D2 and whether current recommendation / requirement wording is sufficiently precise.

### Research 13.3
Whether purpose-built maisonette scenarios should be treated as fully out of scope, a different pathway, or a non-Section-257 but still assessable pathway.

### Research 13.4
How to treat occupancy/mobility assumptions in practice without the landlord making medical judgements.

**Recommended handling in app meantime:**
- Do not overstate certainty.
- Mark these as “requires confirmation / policy decision”.

---

## 14. Suggested implementation priorities

### Priority 1 — Must fix before wider use
1. Clarify whether the assessment is per building or per flat.
2. Stop the tool from switching implicitly between upper and lower flat.
3. Fix purpose-built maisonette unresolved-path bug.
4. Clarify alarm interlinking questions.
5. Clarify door-scope wording (`building entrance door` vs `flat entrance door`).

### Priority 2 — Important accuracy improvements
6. Separate alarm inventory by flat/common parts.
7. Add D1 vs D2 distinction.
8. Separate ground-floor and upper-flat escape route logic.
9. Tighten self-closer wording.
10. Improve management section branching.

### Priority 3 — Follow-up / research-backed improvements
11. Add richer escape-opening types (top-hung, Juliet doors, etc.).
12. Add regression test pack for property archetypes.
13. Resolve separate-flat alarm interlinking policy.
14. Confirm occupancy / mobility wording.

---

## 15. Suggested Claude Code prompt starter

Use something like this as the next engineering prompt:

> Review the issue list in this document and implement the Priority 1 fixes first.
>
> Constraints:
> - do not expand regulatory scope
> - do not redesign the UI
> - keep business logic out of React components
> - preserve the existing architecture
>
> Specifically implement:
> 1. explicit assessment scope (building vs individual flat) with consistent question scoping
> 2. fix the purpose-built maisonette unresolved classification bug
> 3. clarify alarm interlinking questions by splitting within-flat and between-flat interlinking
> 4. clarify door wording so building entrance / flat entrance / final exit are distinct
> 5. ensure report output references the correct LACORS/legal sections for each finding
>
> Before coding, explain the minimal architectural change needed to support building-level assessment cleanly.

---

## Source note
Extracted from the meeting transcript dated 2026-04-10. Review carefully against the live app before implementation.

