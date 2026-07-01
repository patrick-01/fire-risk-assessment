# Richmond Fire Compliance Tool

A client-side fire safety inspection record tool for landlords and property managers of rented residential properties in the London Borough of Richmond upon Thames, based on the LACORS Fire Safety Guidance for Existing Housing.

**No backend. No database. No accounts. All data stays in your browser.**

---

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Build

```bash
npm run build
```

Output is in `dist/`. The contents of `dist/` are a self-contained static site with no server requirements.

---

## Deploy

### GitHub Pages

1. Push the `dist/` folder to the `gh-pages` branch, or configure a GitHub Actions workflow to run `npm run build` and publish `dist/`.
2. No `_redirects` or `.htaccess` file is needed — the app uses state-based navigation, not path-based routing.

### Netlify

Drag and drop the `dist/` folder into the Netlify dashboard, or connect the repo and set:
- Build command: `npm run build`
- Publish directory: `dist`

No redirect rules needed.

### Vercel

Connect the repo. Vercel detects Vite automatically. No additional configuration needed.

---

## Run tests

```bash
npm test
```

Tests use [Vitest](https://vitest.dev/). Engine modules (`src/engine/`) are pure functions and fully unit-testable without a DOM.

---

## Architecture

```
src/
├── data/              Pure data — no logic, no React imports
│   ├── schema/
│   │   └── questions.ts       Question bank + branching graph
│   └── rules/
│       ├── remedy-rules.ts    Legacy rule text source
│       └── remedy-rules.v2.ts Live v2 remedy rule definitions
│
├── engine/            Pure functions — no React, no DOM
│   ├── navigator.ts           Next-question + progress + invalidation
│   ├── classifier.ts          Layer 2: classification from answers
│   ├── riskEngine.ts          Layer 3: risk from evidence + classification
│   ├── remedyEngine.v2.ts     Layer 4: active remedies from risk + classification
│   ├── reportGenerator.v2.ts  Layer 5: structured 19-section report
│   ├── pdfReport.ts           Pure PDF renderer for v2 reports
│   └── uncertainty.ts         Uncertainty behaviour code helpers
│
├── persistence/
│   └── localStorageAdapter.ts All localStorage access isolated here
│
├── state/
│   ├── AppState.ts            Master TypeScript types (Assessment, Answer, …)
│   ├── reducer.ts             useReducer actions and transitions
│   └── AppContext.tsx         React Context provider + auto-save side effect
│
├── pages/             Thin shells — read from context, call engine, render
│   ├── HomePage.tsx
│   ├── QuestionnairePage.tsx
│   ├── ReviewPage.tsx
│   └── ReportPage.tsx
│
├── components/        Purely presentational
│   ├── QuestionCard.tsx
│   ├── ProgressBar.tsx
│   └── SavedAssessmentList.tsx
│
└── styles/
    └── global.css
```

### V2 engine model

| Layer | Module | Input | Output |
|---|---|---|---|
| 1 — Facts | `reducer.ts` / `navigator.ts` | User answers | `AnswerMap` |
| 2 — Classification | `classifier.ts` → `classify()` | `AnswerMap` | `BuildingClassification` |
| 2b — Legal framework | `classifier.ts` → `deriveLegalFramework()` | `AnswerMap` + classification | `LegalFrameworkAssessment` |
| 3 — Risk | `riskEngine.ts` → `computeRisk()` | `AnswerMap` + classification | `RiskAssessment` |
| 4 — Remedies | `remedyEngine.v2.ts` → `computeRemediesV2()` | answers + classification + risk | `RemedySummary` |
| 5 — Report | `reportGenerator.v2.ts` → `generateReportV2()` | all of the above | `ReportV2` |

Building type selects the legal framework; physical evidence determines risk. A purpose-built
two-flat building is not a Section 257 HMO, but statutory rented-property duties still apply and
general LACORS guidance remains a risk reference. Converted pre-1991 two-flat stock may be assessed
against the Section 257 / LACORS case-study benchmarks.

---

## Adding questions

Edit `src/data/schema/questions.ts`. Add a new entry to `QUESTIONS`. The navigator engine picks it up automatically. No UI changes required.

## Adding remedy rules

Edit `src/data/rules/remedy-rules.v2.ts`. Add a new entry to `REMEDY_RULES_V2`. Increment
`RULES_VERSION_V2`. The remedy engine evaluates it automatically. No UI changes required.

---

## Versioning

| Field | Location | Purpose |
|---|---|---|
| `SCHEMA_VERSION` | `src/state/AppState.ts` | Saved assessment JSON shape |
| `APP_VERSION` | `src/state/AppState.ts` | App code version |
| `RULES_VERSION_V2` | `src/data/rules/remedy-rules.v2.ts` | Compliance rules version |

When `RULES_VERSION_V2` changes, assessments saved under the old version display a banner when reopened.

---

## Release checklist

Run these steps before shipping any release:

```bash
npm run build          # Must exit 0 and produce dist/
npx tsc --noEmit       # Must exit 0 (zero type errors)
npm test               # Must show N passed, 0 failed
```

Then deploy `dist/` to your static host and run the manual smoke test below.

---

## Manual smoke test

Follow these steps in a browser against the deployed build (or `npm run dev` locally):

1. **New assessment flow**
   - Open the home screen. Click **Start new assessment**.
   - Enter a valid UK postcode (e.g. `TW9 4HA`). Confirm the property setup form saves.
   - Answer every question through to the end of the questionnaire.
   - Verify the **Review answers** screen lists all sections.
   - Click **Generate report** — the report page must render with a risk level badge.

2. **Resume saved assessment**
   - Return to the home screen. The saved assessment must appear in the list.
   - Click it to resume. The questionnaire should re-open at the current question.

3. **Out-of-scope flow**
   - Start a new assessment and answer a genuinely unsupported scope answer, such as `A3 = 3_or_more`
     or `A5 = no`.
   - The tool must navigate to the out-of-scope screen with an explanatory message.

4. **Export JSON**
   - On the report page, click **Export JSON**.
   - A `.json` file should download. Open it and confirm it is valid JSON containing `schema_version` and `answers`.

5. **Import JSON**
   - On the home screen, use the **Import assessment** file picker.
   - Select the downloaded file. The assessment must load and route to the report page.
   - Confirm the global banner states the import source.
   - The imported assessment must be assigned a new ID (check the home screen list shows two entries).

6. **Share link**
   - On the report page, click **Copy share link**.
   - The button should briefly show `✓ Link copied!`.
   - Paste the URL into a new tab. The assessment must decode and load automatically (global banner visible).

7. **Rules version banner**
   - Open a saved assessment from the list. If the current `RULES_VERSION` matches the saved one, no banner appears.
   - Manually edit a saved assessment's JSON in DevTools (change `rules_version`) and reload — a mismatch banner must appear.

8. **Storage limit**
   - Save more than 10 assessments. The 11th save attempt must display an error rather than silently failing.

---

## Deferred work (not in v1)

- [ ] **Service worker / offline** — uncomment `vite-plugin-pwa` in `vite.config.ts`
- [ ] **Zod schema validation** — replace hand-written field checks in `importAssessmentJson`
- [ ] **Full remedy rule set** — additional sections in `remedy-rules.v2.ts`

---

## Disclaimer

Reports are intended to assist the Responsible Person in reviewing fire safety arrangements, recording identified risks, and tracking remedial actions. They are not statutory compliance certificates or confirmation from the local authority.
