/**
 * ProgressBar.tsx — Section and overall progress display.
 *
 * Shows:
 *   - Current section name
 *   - Overall % progress bar
 *   - Section progress dots/chips
 *
 * Purely presentational — receives all data as props.
 */

import type { SectionId } from '../state/AppState'
import type { SectionProgress } from '../engine/navigator'

interface ProgressBarProps {
  percent: number
  currentSection: SectionId
  sectionProgress: SectionProgress[]
}

const SECTION_LABELS: Record<SectionId, string> = {
  setup: 'Property Setup',
  building: 'Building Classification',
  'common-parts': 'Common Parts',
  'ground-flat': 'Ground-floor Flat',
  'upper-flat': 'Upper Flat',
  'external-escape': 'External Escape Routes',
  doors: 'Doors & Route Protection',
  stair: 'Stair Compartmentation',
  detection: 'Detection & Alarms',
  services: 'Gas / Electrical / CO',
  management: 'Management',
  results: 'Results',
}

/** Short badge codes for the section progress chips. */
const SECTION_SHORT: Record<SectionId, string> = {
  setup: 'P',
  building: 'BC',
  'common-parts': 'CP',
  'ground-flat': 'GF',
  'upper-flat': 'UF',
  'external-escape': 'XE',
  doors: 'DR',
  stair: 'ST',
  detection: 'DA',
  services: 'GE',
  management: 'MG',
  results: 'R',
}

export default function ProgressBar({ percent, currentSection, sectionProgress }: ProgressBarProps) {
  return (
    <nav className="progress-bar" aria-label="Assessment progress">
      <div className="progress-bar__header">
        <span className="progress-bar__section-name">
          {SECTION_LABELS[currentSection] ?? currentSection}
        </span>
        <span className="progress-bar__percent">{percent}% complete</span>
      </div>

      {/* Overall progress track */}
      <div
        className="progress-bar__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% of assessment complete`}
      >
        <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
      </div>

      {/* Section chips */}
      <ol className="progress-sections" aria-label="Sections">
        {sectionProgress.map(({ section, status }) => (
          <li
            key={section}
            className={[
              'progress-section',
              `progress-section--${status}`,
              section === currentSection ? 'progress-section--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={`${SECTION_LABELS[section]}: ${status}`}
            aria-current={section === currentSection ? 'step' : undefined}
          >
            <span className="sr-only">{SECTION_LABELS[section]}: {status}</span>
            <span aria-hidden="true">{SECTION_SHORT[section] ?? section}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
