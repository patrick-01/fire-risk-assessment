/**
 * remedyEngine.v2.ts — Layer 3 (v2): Resolves the §16 remedy rule set
 * (`REMEDY_RULES_V2`) against a `BuildingClassification` (Step 2) and
 * `RiskAssessment` (Step 4) and groups the result into the five §16.2 report
 * sections (`RemedySummary`).
 *
 * Additive: this module does not replace `remedyEngine.ts`. The v1 engine
 * (`computeRemedies`) continues to serve the not-yet-migrated report
 * (`reportGenerator.ts`/`ReportPage.tsx`) until Step 7's clean break, and
 * keeps consuming the v1 `Classification`/`REMEDY_RULES`. `computeRemediesV2`
 * is the net-new v2 entry point, consuming `BuildingClassification` +
 * `RiskAssessment` + `REMEDY_RULES_V2` (docs/5-Remedy-Engine-Refactor.md).
 *
 * This module has NO React, NO DOM, NO localStorage.
 */

import type {
  AnswerMap,
  BuildingClassification,
  ConfidenceLevel,
  LegalStatus,
  RemedyConfidence,
  RemedyPriority,
  RemedyRule,
  RemedySummary,
  ResolvedRemedy,
  RiskAssessment,
  RuleCondition,
} from '../state/AppState'
import { REMEDY_RULES_V2 } from '../data/rules/remedy-rules.v2'

// ---------------------------------------------------------------------------
// Condition evaluation (§16.1 RuleCondition AST)
// ---------------------------------------------------------------------------

/**
 * Checks whether a raw answer value (which may be a JSON array string for
 * multi-choice questions) matches any of the target values. Mirrors the v1
 * `matchesAnyValue` semantics in `remedyEngine.ts`.
 */
function matchesAnyValue(rawValue: unknown, targetValues: string[]): boolean {
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

function matchesClassificationField(
  classification: BuildingClassification,
  field: keyof BuildingClassification,
  inValues: Array<string | boolean>
): boolean {
  const value = classification[field]
  if (Array.isArray(value)) return false
  return inValues.some((target) => target === (value as unknown))
}

export function evaluateRuleCondition(
  condition: RuleCondition,
  answers: AnswerMap,
  classification: BuildingClassification,
  risk: RiskAssessment
): boolean {
  switch (condition.type) {
    case 'leaf': {
      const answer = answers[condition.question_id]
      if (!answer) return false
      const matched = matchesAnyValue(answer.value, condition.in_values)
      return condition.negate ? !matched : matched
    }

    case 'classification':
      return matchesClassificationField(classification, condition.field, condition.in_values)

    case 'risk_factor':
      return risk.risk_factors.some((factor) => factor.id === condition.factor_id)

    case 'and':
      return condition.conditions.every((c) => evaluateRuleCondition(c, answers, classification, risk))

    case 'or':
      return condition.conditions.some((c) => evaluateRuleCondition(c, answers, classification, risk))

    case 'not':
      return !evaluateRuleCondition(condition.condition, answers, classification, risk)
  }
}

// ---------------------------------------------------------------------------
// Confidence downgrade
// ---------------------------------------------------------------------------

/**
 * A remedy cannot be more certain than the classification it rests on
 * (mirrors the v1 `effectiveConfidence` rationale in `remedyEngine.ts`).
 * [Inference] `BuildingClassification.confidence` (3-value `ConfidenceLevel`)
 * is mapped onto the 4-value `RemedyConfidence` ceiling below; 'unresolved'
 * maps to 'contingent' rather than 'unknown' because the remedy itself is
 * still a real, named recommendation — only its applicability is uncertain.
 */
const CLASSIFICATION_CONFIDENCE_CEILING: Record<ConfidenceLevel, RemedyConfidence> = {
  confirmed: 'confirmed',
  probable: 'probable',
  unresolved: 'contingent',
}

const REMEDY_CONFIDENCE_RANK: Record<RemedyConfidence, number> = {
  confirmed: 3,
  probable: 2,
  contingent: 1,
  unknown: 0,
}

function effectiveConfidence(
  ruleConfidence: RemedyConfidence,
  classificationConfidence: ConfidenceLevel
): RemedyConfidence {
  const ceiling = CLASSIFICATION_CONFIDENCE_CEILING[classificationConfidence]
  return REMEDY_CONFIDENCE_RANK[ceiling] < REMEDY_CONFIDENCE_RANK[ruleConfidence] ? ceiling : ruleConfidence
}

// ---------------------------------------------------------------------------
// Legal status downgrade (§22 D10 suppression)
// ---------------------------------------------------------------------------

/**
 * When `rule.downgrade_if` holds, a `legal_requirement` or
 * `lacors_benchmark_recommendation` is downgraded to
 * `risk_based_recommendation` — e.g. the Case Study D10 stair-enclosure
 * benchmark for a purpose-built building (`case_study_d10 ===
 * 'not_applicable'`). Other legal statuses are unaffected: a
 * `further_investigation_required` or `advisory_good_practice` item has
 * nothing weightier to downgrade to.
 */
function effectiveLegalStatus(
  rule: RemedyRule,
  answers: AnswerMap,
  classification: BuildingClassification,
  risk: RiskAssessment
): LegalStatus {
  if (rule.downgrade_if && evaluateRuleCondition(rule.downgrade_if, answers, classification, risk)) {
    if (rule.legal_status === 'legal_requirement' || rule.legal_status === 'lacors_benchmark_recommendation') {
      return 'risk_based_recommendation'
    }
  }
  return rule.legal_status
}

// ---------------------------------------------------------------------------
// Grouping (§16.2)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<RemedyPriority, number> = {
  P1_urgent: 0,
  P2_high: 1,
  P3_medium: 2,
  P4_low: 3,
  investigate: 4,
}

/**
 * Groups resolved remedies into the §16.2 output groups. `remediation_schedule`
 * is [Inference]: the plan defines it as report section 17, a single
 * consolidated action list distinct from the legal/recommendation/
 * investigation/advisory sections (§17.1 items 15-17) — implemented here as
 * every active remedy, sorted by `priority` (P1_urgent first, `investigate`
 * last), so a remedy can appear both in its `legal_status` group and in the
 * combined schedule.
 */
function groupRemedies(remedies: ResolvedRemedy[]): RemedySummary {
  return {
    legal_requirements: remedies.filter((r) => r.legal_status === 'legal_requirement'),
    recommendations: remedies.filter(
      (r) => r.legal_status === 'lacors_benchmark_recommendation' || r.legal_status === 'risk_based_recommendation'
    ),
    further_investigation: remedies.filter((r) => r.legal_status === 'further_investigation_required'),
    advisory: remedies.filter((r) => r.legal_status === 'advisory_good_practice'),
    remediation_schedule: [...remedies].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Resolves `REMEDY_RULES_V2` against the current assessment and groups the
 * result per §16.2. Rules are evaluated in `REMEDY_RULES_V2` order; within
 * each output group that order is preserved (except `remediation_schedule`,
 * which is priority-sorted).
 */
export function computeRemediesV2(
  answers: AnswerMap,
  classification: BuildingClassification,
  risk: RiskAssessment
): RemedySummary {
  const active: ResolvedRemedy[] = []

  for (const rule of REMEDY_RULES_V2) {
    if (rule.suppress_if && evaluateRuleCondition(rule.suppress_if, answers, classification, risk)) continue
    if (!evaluateRuleCondition(rule.condition, answers, classification, risk)) continue

    active.push({
      rule_id: rule.id,
      title: rule.title,
      legal_status: effectiveLegalStatus(rule, answers, classification, risk),
      priority: rule.priority,
      applies_to: rule.applies_to,
      text: rule.text,
      risk_basis: rule.risk_basis,
      regulatory_refs: rule.regulatory_refs,
      confidence: effectiveConfidence(rule.confidence, classification.confidence),
    })
  }

  return groupRemedies(active)
}
