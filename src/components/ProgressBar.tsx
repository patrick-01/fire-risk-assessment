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
  A: 'Building Origin',
  B: 'Building Configuration',
  C: 'Escape Routes',
  D: 'Staircase & Construction',
  E: 'Fire Detection',
  F: 'Doors & Egress',
  G: 'Legal Obligations',
  H: 'Management',
  results: 'Results',
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
            <span aria-hidden="true">{section === 'setup' ? 'P' : section}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
