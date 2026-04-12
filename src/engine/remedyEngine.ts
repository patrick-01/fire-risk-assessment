/**
 * remedyEngine.ts — Layer 3: Active remedy computation.
 *
 * Takes the Classification (Layer 2) and AnswerMap (Layer 1) and returns
 * the list of active remedies that apply to this property.
 *
 * Each remedy is enriched with:
 *   - Effective confidence (may be downgraded if classification is uncertain)
 *   - Risk-level-appropriate text (from risk_level_expressions if available)
 *   - risk_basis — the fire safety reasoning behind the recommendation
 *
 * Remedies are suppressed when:
 *   - applies_when_separate_entrance is false AND separate_entrance_mode is true
 *   - The condition evaluates to false
 *
 * Non-section-257 properties receive a full assessment — statutory items and
 * applicable escape/management advisories are NOT suppressed.
 *
 * When classification is 'unresolved', LACORS recommendations are not fully
 * suppressed — instead their confidence is downgraded to 'unresolved' and they
 * are included as advisory-level items. Statutory obligations always show.
 *
 * This module has NO React, NO DOM, NO localStorage.
 */

import type { AnswerMap, Classification, ConfidenceLevel } from '../state/AppState'
import {
  REMEDY_RULES,
  type ConditionExpr,
  type RemedyTier,
  type RemedyBasis,
  type LegalStatus,
} from '../data/rules/remedy-rules'

// ---------------------------------------------------------------------------
// Active remedy (the enriched output type)
// ---------------------------------------------------------------------------

export interface ActiveRemedy {
  id: string
  title: string
  tier: RemedyTier
  /**
   * The type of legal/regulatory obligation this remedy represents.
   * Distinct from tier: tier controls report prominence; legal_status controls labelling.
   *   legal_requirement    — direct statutory obligation
   *   lacors_recommendation — LACORS risk-assessment benchmark
   *   advisory             — good practice, management action, or unresolved question
   */
  legal_status: LegalStatus
  basis: RemedyBasis[]
  /** Effective confidence after uncertainty downgrade. */
  confidence: ConfidenceLevel
  /** The rendered text — may be risk-level-aware. */
  text: string
  /** Why this remedy is triggered — the LACORS fire safety reasoning. */
  risk_basis: string
  regulatory_refs: string[]
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/**
 * Checks whether a raw answer value (which may be a JSON array string for
 * multi-choice questions) matches any of the target values.
 */
function matchesAnyValue(
  rawValue: unknown,
  targetValues: (string | boolean | number)[]
): boolean {
  // Attempt to parse as a JSON array (multi-choice questions)
  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue)
      if (Array.isArray(parsed)) {
        return targetValues.some((tv) => (parsed as unknown[]).includes(tv))
      }
    } catch {
      // Not a JSON array — fall through to scalar comparison
    }
  }
  return targetValues.map(String).includes(String(rawValue))
}

function evaluateCondition(
  condition: ConditionExpr,
  answers: AnswerMap,
  classification: Classification
): boolean {
  switch (condition.type) {
    case 'leaf': {
      const answer = answers[condition.question_id]
      if (!answer) return false
      const matched = matchesAnyValue(answer.value, condition.in_values)
      return condition.negate ? !matched : matched
    }

    case 'classification': {
      const field = condition.field
      // Handle typed fields explicitly before the generic fallback
      let value: string
      if (field === 'separate_entrance_mode') {
        value = String(classification.separate_entrance_mode)
      } else if (field === 'inner_room_present') {
        value = classification.inner_room_present
      } else if (field === 'upper_flat_independent_exit') {
        value = classification.upper_flat_independent_exit
      } else if (field === 'ground_floor_escape_strategy') {
        value = classification.ground_floor_escape_strategy
      } else if (field === 'upper_floor_escape_strategy') {
        value = classification.upper_floor_escape_strategy
      } else {
        const raw = classification[field as keyof Classification]
        if (typeof raw === 'object' || Array.isArray(raw)) return false
        value = String(raw)
      }
      const matched = condition.in_values.includes(value)
      return condition.negate ? !matched : matched
    }

    case 'escape_window': {
      const status = classification.escape_windows[condition.room]
      const matched = condition.in_statuses.includes(status)
      return condition.negate ? !matched : matched
    }

    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, answers, classification))

    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, answers, classification))
  }
}

// ---------------------------------------------------------------------------
// Confidence downgrade
// ---------------------------------------------------------------------------

/**
 * If the classification confidence is lower than the rule's declared confidence,
 * downgrade the remedy confidence to match. A remedy cannot be more certain than
 * the facts it rests on.
 *
 * Order: confirmed > probable > unresolved
 */
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  confirmed: 2,
  probable: 1,
  unresolved: 0,
}

function effectiveConfidence(
  ruleConfidence: ConfidenceLevel,
  classificationConfidence: ConfidenceLevel
): ConfidenceLevel {
  if (CONFIDENCE_RANK[classificationConfidence] < CONFIDENCE_RANK[ruleConfidence]) {
    return classificationConfidence
  }
  return ruleConfidence
}

// ---------------------------------------------------------------------------
// Risk-level-aware text selection
// ---------------------------------------------------------------------------

/**
 * Selects the appropriate text for a remedy given the current risk level.
 * Falls back to the rule's base `text` if no expression matches.
 */
function selectText(rule: (typeof REMEDY_RULES)[number], riskLevel: string): string {
  if (rule.risk_level_expressions) {
    const override = rule.risk_level_expressions[riskLevel]
    if (override) return override
  }
  return rule.text
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Returns the list of active remedies for the current assessment state.
 *
 * Rules are evaluated in REMEDY_RULES order; the resulting list preserves
 * that order (mandatory first, then recommended, then advisory within each
 * tier as written in the rules file).
 */
export function computeRemedies(
  answers: AnswerMap,
  classification: Classification
): ActiveRemedy[] {
  // Note: not-section-257 properties still receive a full assessment.
  // Statutory items (gas, EICR, CO alarms, smoke alarms) apply to all rented properties.
  // LACORS-specific rules are gated by IS_SECTION_257 conditions in the rules themselves.

  const active: ActiveRemedy[] = []

  for (const rule of REMEDY_RULES) {
    // Suppress communal-specific rules for separate-entrance properties.
    if (!rule.applies_when_separate_entrance && classification.separate_entrance_mode) {
      continue
    }

    if (!evaluateCondition(rule.condition, answers, classification)) continue

    // When classification is unresolved, LACORS recommendations cannot be confirmed
    // against a specific framework. Rather than suppressing them entirely, downgrade
    // their effective confidence to 'unresolved' so they appear as contingent items.
    // Legal requirements and advisories are unaffected — statutory obligations apply
    // regardless of HMO classification, and advisories are already uncertainty-flagged.
    const baseConfidence =
      classification.type === 'unresolved' && rule.legal_status === 'lacors_recommendation'
        ? 'unresolved'
        : rule.confidence

    active.push({
      id: rule.id,
      title: rule.title,
      tier: rule.tier,
      legal_status: rule.legal_status,
      basis: rule.basis,
      confidence: effectiveConfidence(baseConfidence, classification.confidence),
      text: selectText(rule, classification.risk_level),
      risk_basis: rule.risk_basis,
      regulatory_refs: rule.regulatory_refs,
    })
  }

  return active
}

/** Group active remedies by tier for internal ordering. */
export function groupRemediesByTier(remedies: ActiveRemedy[]): {
  mandatory: ActiveRemedy[]
  recommended: ActiveRemedy[]
  advisory: ActiveRemedy[]
} {
  return {
    mandatory: remedies.filter((r) => r.tier === 'mandatory'),
    recommended: remedies.filter((r) => r.tier === 'recommended'),
    advisory: remedies.filter((r) => r.tier === 'advisory'),
  }
}

/**
 * Group active remedies by legal status for report section rendering.
 *
 * The three sections map directly to the report's top-level grouping:
 *   legal_requirement    — "Legal requirements"
 *   lacors_recommendation — "LACORS / risk-based recommendations"
 *   advisory             — "Advisory / good practice"
 *
 * Within each section, remedies retain their original order from REMEDY_RULES,
 * which places higher-tier items first.
 */
export function groupRemediesByLegalStatus(remedies: ActiveRemedy[]): {
  legal_requirement: ActiveRemedy[]
  lacors_recommendation: ActiveRemedy[]
  advisory: ActiveRemedy[]
} {
  return {
    legal_requirement: remedies.filter((r) => r.legal_status === 'legal_requirement'),
    lacors_recommendation: remedies.filter((r) => r.legal_status === 'lacors_recommendation'),
    advisory: remedies.filter((r) => r.legal_status === 'advisory'),
  }
}
