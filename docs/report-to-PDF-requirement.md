
You are working on the FireRegs / Richmond Fire Compliance Tool codebase.
Task: replace the current broken PDF output approaches with a proper generated Fire Safety Inspection Report PDF.
Current problem:
- Browser “Print to PDF” from the report page looks visually good but clips form fields, splits content badly across pages, and is not reliable for formal records.
- Current “Export PDF” produces a text-heavy report, but it lacks proper document layout and does not feel like a usable formal inspection report.
- The report must include inspection metadata such as inspection date, inspection type, assessor name, assessor role, organisation, responsible person, next review date, review cycle, declaration, and signature fields.
Goal:
Implement a dedicated “Generate Fire Safety Inspection Report PDF” feature that creates a proper PDF directly from the assessment/report data model, not by printing the DOM and not by dumping plain text.
Use the existing app architecture. Do not redesign the whole app.
Important constraints:
- No backend.
- PDF generation must run client-side.
- Keep business logic out of React components.
- Use the existing assessment JSON / report model as the source of truth.
- Do not rely on browser print styles for the final report.
- Do not remove existing export JSON functionality.
- Avoid heavy dependencies unless justified.
Preferred implementation:
Use `pdf-lib` unless there is a strong reason not to. If choosing another library, explain why first.
---
## 1. Add a dedicated PDF renderer
Create a new module, for example:
```text
src/export/pdf/
  inspectionPdfRenderer.ts
  pdfLayout.ts
  pdfTypes.ts

The renderer should take a structured report object, not DOM nodes.

Expected flow:

Assessment JSON
    ↓
Report model / inspection report model
    ↓
PDF renderer
    ↓
Downloadable PDF

Do not scrape HTML.

⸻

2. Create / formalise an Inspection Report model

If not already present, define a clean model that includes:

InspectionReportModel {
  report_id: string;
  report_version: string;
  inspection_id: string;
  property: {
    address: string;
    unit_reference?: string;
    postcode: string;
  };
  inspection: {
    inspection_date: string;
    inspection_type: 'Initial' | 'Annual Review' | 'Post Works' | 'Follow-up' | string;
    report_generated_date: string;
    assessor_name: string;
    assessor_role: string;
    organisation: string;
    responsible_person: string;
    assessor_email?: string;
    review_cycle_months: number;
    next_review_due: string;
    storage_path?: string;
  };
  classification: ...;
  legal_framework: ...;
  risk_summary: ...;
  findings: ...;
  legal_requirements: ...;
  recommendations: ...;
  further_investigation: ...;
  advisory_items: ...;
  remediation_schedule: ...;
  review_history: ...;
  declaration: ...;
}

Use existing types where possible. Do not duplicate logic unnecessarily.

⸻

3. PDF contents

The generated PDF must contain these sections, in this order:

1. Cover / header

* Title: “Fire Safety Inspection Report”
* Property address
* Unit / building reference
* Inspection ID
* Report ID
* Report generated date
* Rules version
* App version
* Overall risk level
* Short disclaimer:
    “Landlord / responsible person inspection record. Not a statutory compliance certificate or confirmation from the local authority.”

2. Inspection details

Include:

* property address
* unit/building reference
* inspection date
* inspection type
* report generated date
* assessor name
* assessor role
* organisation
* responsible person / landlord
* assessor email if present
* review frequency
* review cycle months
* next review due
* storage path if present

3. Assessor competence statement

Use the existing statement if present. Otherwise generate a default statement:

“The inspection was completed by the named assessor acting as the Responsible Person, landlord, managing agent, or competent person appointed for the inspection. The assessor has reviewed the applicable property facts, relevant statutory duties and recognised guidance referenced in this report. Where specialist advice, certification or technical verification is required, this is identified within the findings or remediation actions.”

4. Scope and limitations

Explain:

* whole two-flat building assessment
* grouped by common parts, ground-floor flat, upper-floor flat, and building-wide duties
* LACORS used either as benchmark or risk reference depending on classification
* report is not a statutory compliance certificate

5. Property classification

Include:

* building origin
* HMO / Section 257 status
* entrance configuration
* common parts present
* Case Study D10 benchmark status
* General LACORS guidance status
* classification confidence

6. Applicable legal framework

Include all current applicable frameworks from the report model:

* Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020
* HHSRS / Housing Act 2004 fire hazard
* Smoke and Carbon Monoxide Alarm Regulations
* Gas Safety Regulations
* Regulatory Reform (Fire Safety) Order 2005 common parts
* Housing Act 2004 Section 257 where applicable
* LACORS role

7. Overall risk summary

Include:

* overall risk
* confidence / knowledge state
* area table:
    * escape routes
    * doors and route protection
    * detection and alarms
    * stair compartmentation
    * common parts
    * management
* severity
* knowledge state
* number of factors

8. Area assessments

Include concise area summaries:

* common parts
* ground-floor flat
* upper-floor flat
* external escape route
* door and route protection
* stair compartmentation
* fire detection strategy

9. Known risks

List known risks.

10. Potential risks

List potential risks.

11. Unknown risks / further investigation

List investigation items.

12. Legal requirements

List all legal requirement actions.

13. LACORS / risk-based recommendations

List all recommendations.

14. Advisory / good practice

List advisory items.

15. Remediation schedule

A table ordered by priority:

* action reference
* action title
* legal classification
* priority
* applies to
* status
* target date
* completed date
* evidence / notes

The PDF renderer must avoid splitting an individual action block awkwardly across pages where possible.

16. Evidence and assumptions

Include:

* assumptions
* unresolved questions
* items requiring verification
* report completeness

17. Inspection and review history

Include:

* inspection date
* inspection type
* assessor
* overall risk
* key outstanding actions
* next review due

18. Assessor declaration and signature

Include:

* declaration text
* assessor name
* role/capacity
* signature line
* date signed line
* next review due

19. Report purpose and limitations

Include final limitations text.

⸻

4. PDF layout requirements

The PDF must be designed for reliable output, not copied from web CSS.

Requirements:

* A4 portrait.
* Margins: approx 40–50pt.
* Header on each page:
    * report title shortened
    * property reference
* Footer on each page:
    * page number “Page X of Y”
    * report ID or inspection ID
* Avoid clipping text.
* Wrap long text correctly.
* Page breaks must be controlled.
* Avoid splitting:
    * section headers from first paragraph
    * table header from table rows
    * action title from action body
    * signature block across pages
* Use simple monochrome styling with limited accent colours if already available.
* Must work for long reports of 10–20 pages.

Implement helpers:

* addPage()
* drawHeaderFooter()
* drawSectionHeading()
* drawKeyValueTable()
* drawWrappedText()
* drawActionBlock()
* ensureSpace(minHeight)
* drawSimpleTable()

⸻

5. UI changes

Add one clear button on the report page:

Generate Inspection Report PDF

This should:

* build the inspection report model from current assessment/report state
* call the PDF renderer
* download the file

Filename format:

fire-safety-inspection-report-[postcode]-[inspection-date].pdf

Example:

fire-safety-inspection-report-tw106nf-2026-06-30.pdf

Do not remove:

* Export JSON
* Copy share link

You may leave Print to PDF present temporarily, but label it clearly as “Browser print (not recommended)” or hide it if currently exposed.

⸻

6. Data gaps

If required metadata is missing, do not silently omit it.

Provide sensible defaults and/or show a warning in the UI.

Required metadata:

* inspection date
* inspection type
* assessor name
* assessor role
* organisation
* responsible person
* next review due

If not present:

* block PDF generation or prompt the user to complete the inspection details first.

Do not generate a formal report with blank assessor/date fields unless explicitly allowed.

⸻

7. Report IDs

Add a simple deterministic/report-safe ID mechanism if none exists.

Suggested:

* inspection ID: FR-${YYYY}-${shortAssessmentId}
* report version: inspection-report-v1

Do not over-engineer database-style numbering because this is client-side only.

⸻

8. Tests

Add tests where practical for:

* report model builder includes inspection metadata
* missing required metadata is detected
* filename generation
* action ordering by priority
* PDF renderer does not crash for a representative long report
* page count is greater than 1 for long report

If full binary PDF testing is awkward, test the model builder and renderer smoke path.

⸻

9. Do not do these things

Do not:

* generate PDF by calling window.print()
* scrape rendered HTML
* rely on print CSS
* produce plain text only
* omit inspection metadata
* split signature block across pages
* introduce a server
* add a heavy reporting framework
* rewrite the entire app

⸻

10. Before coding

First output:

1. proposed PDF generation library and reason
2. files to add/change
3. report model structure
4. layout strategy for page breaks
5. any metadata currently missing from the app state

Then implement.

⸻

11. After coding

Provide:

* files changed
* dependencies added
* how to run/build/test
* what metadata is included
* known limitations
* remaining TODOs only if genuinely necessary


