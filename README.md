# Richmond Fire Compliance Tool

A client-side self-assessment tool for landlords and property managers of rented residential properties in the London Borough of Richmond upon Thames, based on the LACORS Fire Safety Guidance for Existing Housing.

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
│       └── remedy-rules.ts    Remedy rule definitions
│
├── engine/            Pure functions — no React, no DOM
│   ├── navigator.ts           Next-question + progress + invalidation
│   ├── classifier.ts          Layer 2: classification from answers
│   ├── remedyEngine.ts        Layer 3: active remedies from classification
│   ├── reportGenerator.ts     Structured report from classification + remedies
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

### Three-layer model (per requirements §2.1)

| Layer | Module | Input | Output |
|---|---|---|---|
| 1 — Facts | `reducer.ts` / `navigator.ts` | User answers | `AnswerMap` |
| 2 — Classification | `classifier.ts` | `AnswerMap` | `Classification` |
| 3 — Remedies | `remedyEngine.ts` + `reportGenerator.ts` | `AnswerMap` + `Classification` | `ActiveRemedy[]` + `Report` |

---

## Adding questions

Edit `src/data/schema/questions.ts`. Add a new entry to `QUESTIONS`. The navigator engine picks it up automatically. No UI changes required.

## Adding remedy rules

Edit `src/data/rules/remedy-rules.ts`. Add a new entry to `REMEDY_RULES`. Increment `RULES_VERSION`. The remedy engine evaluates it automatically. No UI changes required.

---

## Versioning

| Field | Location | Purpose |
|---|---|---|
| `SCHEMA_VERSION` | `src/state/AppState.ts` | Saved assessment JSON shape |
| `APP_VERSION` | `src/state/AppState.ts` | App code version |
| `RULES_VERSION` | `src/data/rules/remedy-rules.ts` | Compliance rules version |

When `RULES_VERSION` changes, assessments saved under the old version display a banner when reopened.

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
   - Start a new assessment and answer `A1 = purpose-built` (or any answer that routes to `not-section-257`).
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

- [ ] **PDF export** — `pdf-lib` renderer in `ReportPage` (requirements §12)
- [ ] **Service worker / offline** — uncomment `vite-plugin-pwa` in `vite.config.ts`
- [ ] **Zod schema validation** — replace hand-written field checks in `importAssessmentJson`
- [ ] **Full remedy rule set** — additional sections in `remedy-rules.ts`
- [ ] **Desktop layout** — section-at-a-time view per requirements §7.1

---

## Disclaimer

This tool does not constitute a formal fire risk assessment, a legally binding compliance certificate, or advice from Richmond upon Thames Council. It does not replace a qualified fire risk assessor or written confirmation from the council.
