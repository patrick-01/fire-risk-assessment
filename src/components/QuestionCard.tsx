/**
 * QuestionCard.tsx — Renders a single question.
 *
 * Purely presentational. Knows nothing about branching logic, next question,
 * or compliance rules. Receives a Question and calls back with the selected
 * value. The parent page handles dispatch.
 *
 * Supported question types:
 *   single-choice — Radio buttons from a fixed option list
 *   multi-choice  — Checkboxes; value stored as JSON array string
 *   text          — Free-text input
 *   address       — Structured address fields for P1 (serialised to JSON string)
 */

import { useState, useEffect, type ChangeEvent } from 'react'
import type { Question } from '../data/schema/questions'
import type { AnswerValue, AnswerConfidence } from '../state/AppState'

interface QuestionCardProps {
  question: Question
  value: AnswerValue
  confidence: AnswerConfidence
  onValueChange: (value: AnswerValue) => void
  onConfidenceChange: (confidence: AnswerConfidence) => void
}

export default function QuestionCard({
  question,
  value,
  confidence,
  onValueChange,
  onConfidenceChange,
}: QuestionCardProps) {
  return (
    <article className="question-card" aria-labelledby={`q-${question.id}-text`}>
      <div className="question-card__meta">
        <span className="question-card__section">
          {question.section === 'setup' ? 'Property Setup' : `Section ${question.section}`}
        </span>
        <span className="question-card__position">
          Question {question.section_position}
        </span>
      </div>

      <h2 id={`q-${question.id}-text`} className="question-card__text">
        {question.text}
      </h2>

      {question.help_text && (
        <details className="question-card__help">
          <summary>Help</summary>
          <p>{question.help_text}</p>
        </details>
      )}

      <div className="question-card__input">
        {question.type === 'single-choice' && question.options && (
          <fieldset>
            <legend className="sr-only">{question.text}</legend>
            {question.options.map((option) => (
              <label key={option.value} className="radio-option">
                <input
                  type="radio"
                  name={question.id}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onValueChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        {question.type === 'multi-choice' && question.options && (
          <MultiChoiceInput
            questionId={question.id}
            options={question.options}
            value={value}
            onChange={onValueChange}
          />
        )}

        {question.type === 'text' && (
          <input
            type="text"
            id={`q-${question.id}-input`}
            className="text-input"
            value={value === null ? '' : String(value)}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value)}
            placeholder={question.required ? 'Required' : 'Optional'}
          />
        )}

        {question.type === 'address' && (
          <AddressInput value={value} onChange={onValueChange} />
        )}
      </div>

      {/* Confidence selector — shown when the question allows "not sure" as
          a separate confidence override (distinct from "not sure" answer options) */}
      {question.allow_not_sure && (
        <div className="question-card__confidence">
          <span className="question-card__confidence-label">How confident are you?</span>
          <div className="confidence-options">
            {(['confirmed', 'not_sure', 'unknown'] as AnswerConfidence[]).map((level) => (
              <label key={level} className="radio-option radio-option--small">
                <input
                  type="radio"
                  name={`${question.id}-confidence`}
                  value={level}
                  checked={confidence === level}
                  onChange={() => onConfidenceChange(level)}
                />
                <span>{level.replace('_', ' ')}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// MultiChoiceInput — sub-component for multi-choice (checkbox) questions
// ---------------------------------------------------------------------------

function parseMultiChoiceValue(value: AnswerValue): string[] {
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown[]
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

function MultiChoiceInput({
  questionId,
  options,
  value,
  onChange,
}: {
  questionId: string
  options: import('../data/schema/questions').AnswerOption[]
  value: AnswerValue
  onChange: (v: AnswerValue) => void
}) {
  const selected = parseMultiChoiceValue(value)

  function toggle(optionValue: string) {
    let next: string[]
    if (optionValue === 'none' || optionValue === 'not_sure') {
      // Exclusive options — selecting them clears everything else
      next = selected.includes(optionValue) ? [] : [optionValue]
    } else {
      // Deselect any exclusive options when a regular option is chosen
      const withoutExclusive = selected.filter((v) => v !== 'none' && v !== 'not_sure')
      if (withoutExclusive.includes(optionValue)) {
        next = withoutExclusive.filter((v) => v !== optionValue)
      } else {
        next = [...withoutExclusive, optionValue]
      }
    }
    onChange(JSON.stringify(next))
  }

  return (
    <fieldset>
      <legend className="sr-only">Select all that apply</legend>
      {options.map((option) => (
        <label key={option.value} className="checkbox-option">
          <input
            type="checkbox"
            name={questionId}
            value={option.value}
            checked={selected.includes(option.value)}
            onChange={() => toggle(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// AddressInput — sub-component for the P1 address question
// ---------------------------------------------------------------------------

interface AddressFields {
  address_line_1: string
  address_line_2: string
  town: string
  postcode: string
}

const EMPTY_ADDRESS: AddressFields = {
  address_line_1: '',
  address_line_2: '',
  town: 'Richmond',
  postcode: '',
}

function parseAddressValue(value: AnswerValue): AddressFields {
  if (!value || typeof value !== 'string') return EMPTY_ADDRESS
  try {
    const parsed = JSON.parse(value) as Partial<AddressFields>
    return {
      address_line_1: parsed.address_line_1 ?? '',
      address_line_2: parsed.address_line_2 ?? '',
      town: parsed.town ?? 'Richmond',
      postcode: parsed.postcode ?? '',
    }
  } catch {
    return EMPTY_ADDRESS
  }
}

function AddressInput({
  value,
  onChange,
}: {
  value: AnswerValue
  onChange: (v: AnswerValue) => void
}) {
  const [fields, setFields] = useState<AddressFields>(() => parseAddressValue(value))

  // Sync fields when the parent provides a pre-existing value (edit mode).
  useEffect(() => {
    setFields(parseAddressValue(value))
  // We only want to re-sync when the question changes (i.e. value comes from
  // a different saved answer), not on every keystroke. Comparing by reference
  // is sufficient — the parent only changes `value` when switching questions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(field: keyof AddressFields, fieldValue: string) {
    const next = { ...fields, [field]: fieldValue }
    setFields(next)
    onChange(JSON.stringify(next))
  }

  return (
    <div className="address-input">
      <div className="address-input__field">
        <label htmlFor="addr-line1" className="address-input__label">
          Address line 1 <span className="required-mark">*</span>
        </label>
        <input
          id="addr-line1"
          type="text"
          className="text-input"
          value={fields.address_line_1}
          onChange={(e) => handleChange('address_line_1', e.target.value)}
          placeholder="e.g. 42 Church Road"
          autoComplete="address-line1"
        />
      </div>

      <div className="address-input__field">
        <label htmlFor="addr-line2" className="address-input__label">
          Address line 2 <span className="optional-mark">(optional)</span>
        </label>
        <input
          id="addr-line2"
          type="text"
          className="text-input"
          value={fields.address_line_2}
          onChange={(e) => handleChange('address_line_2', e.target.value)}
          placeholder="e.g. East Sheen"
          autoComplete="address-line2"
        />
      </div>

      <div className="address-input__field">
        <label htmlFor="addr-town" className="address-input__label">
          Town / area <span className="required-mark">*</span>
        </label>
        <input
          id="addr-town"
          type="text"
          className="text-input"
          value={fields.town}
          onChange={(e) => handleChange('town', e.target.value)}
          autoComplete="address-level2"
        />
      </div>

      <div className="address-input__field">
        <label htmlFor="addr-postcode" className="address-input__label">
          Postcode <span className="required-mark">*</span>
        </label>
        <input
          id="addr-postcode"
          type="text"
          className="text-input text-input--postcode"
          value={fields.postcode}
          onChange={(e) => handleChange('postcode', e.target.value.toUpperCase())}
          placeholder="e.g. TW9 4HA"
          autoComplete="postal-code"
          maxLength={8}
        />
      </div>
    </div>
  )
}
