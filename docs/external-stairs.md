Update the FireRegs app to properly account for upstairs flats that have an external steel staircase or other independent rear escape route.

This is a correction pass, not a redesign. Keep the existing architecture:
- questions in schema/data files
- classification and derived risk logic in engine/
- remedy rules in rules files
- no business logic inside React components
- no backend or UI framework changes

## Problem

A number of upstairs flats have a viable external steel staircase from the first-floor flat to the rear garden. The current app appears to treat the shared entrance hall/stair as though it is the upper flat's only or primary escape route.

That overstates risk in these cases.

The app must distinguish between:

1. a shared entrance hall/stair physically exists
2. the upper flat depends on that shared route as its sole or primary escape route
3. the upper flat has an independent alternative escape route

These are different facts and must be modelled separately.

## Required behaviour

For buildings like:

text Front entrance door   ↓ Shared entrance hall   ├── Ground floor flat entrance door   └── Stair to upper flat  Upper flat also has:   → rear door / external steel staircase / direct route to rear garden 

The app should still record:

- shared entrance hall exists: yes
- shared route used by more than one household: yes, if applicable
- upper flat has independent alternative escape: yes
- shared route is NOT the sole escape route for the upper flat

Risk should be downgraded accordingly.

Do not remove all shared-route risk. The shared hall still matters. But the presence of a viable independent external escape route should materially reduce:
- dependency on the shared entrance hall
- dependency on stair enclosure compartmentation
- urgency of FD30S / door-upgrade recommendations where they are driven only by single-route dependency
- risk score from “single route / no alternative escape” factors

## 1. Question/schema changes

Add or update questions so the app explicitly captures the upper flat's independent escape route.

Add a question similar to:

ts UPPER_INDEPENDENT_ESCAPE_ROUTE 

Question text:

"Does the upper flat have an independent escape route that does not use the shared entrance hall or internal staircase?"

Options:
- yes_external_steel_stair — Yes, external steel staircase to garden/outside
- yes_rear_exit — Yes, rear exit/direct external route
- yes_other — Yes, other independent external escape route
- no
- unknown

Help text:

"Answer yes only if the route can be used from inside the upper flat without using the shared front entrance hall or internal staircase."

Add follow-up questions if yes:

ts UPPER_EXTERNAL_ESCAPE_USABLE 

"Is the external escape route permanently usable and unobstructed?"

Options:
- yes
- no_obstructed
- no_locked_or_unavailable
- unknown

ts UPPER_EXTERNAL_ESCAPE_ACCESS 

"How is the external escape route reached from inside the upper flat?"

Options:
- from_hall_or_landing
- through_kitchen_or_living_room
- through_bedroom
- unknown

ts UPPER_EXTERNAL_ESCAPE_CONDITION` 

"Is the external staircase / escape route in sound condition?"

Options:
- yes
- minor_defects
- poor_condition
- unknown

Use existing schema patterns for scope, uncertainty behaviour, help text, and branching.

## 2. Derived classification fields

Add derived fields in classifier/risk model:

ts upper_independent_escape:   'yes' | 'no' | 'unknown'  upper_independent_escape_type:   'external_steel_stair' | 'rear_exit' | 'other' | 'none' | 'unknown'  upper_external_escape_viable:   'yes' | 'no' | 'unknown'  shared_route_exists:   boolean | 'unknown'  upper_shared_route_dependency:   'sole_route' | 'primary_route' | 'secondary_route' | 'not_relied_on' | 'unknown' 

Suggested logic:

ts if shared_route_exists === true and upper_independent_escape === 'yes' and upper_external_escape_viable === 'yes' then upper_shared_route_dependency = 'secondary_route' 

If no independent escape:

ts upper_shared_route_dependency = 'sole_route' 

If independent escape exists but viability unknown:

ts upper_shared_route_dependency = 'primary_route' 

Do not treat an unverified external stair as fully reducing risk.

## 3. Risk scoring changes

Update risk scoring so these factors are reduced where a viable independent external escape exists.

Current risk factors that should be reviewed:
- no rear exit / no alternative escape
- shared route dependency
- staircase enclosure uncertainty
- door upgrade / FD30S triggers
- escape-window failure

Required logic:

### If upper external escape is viable:
- remove or reduce “upper flat has sole escape via shared route” risk
- reduce dependency weight on staircase enclosure
- reduce urgency of door-upgrade recommendations that depend only on lack of alternative escape
- do not require qualifying escape windows solely to compensate for lack of escape route

### If external escape exists but is unknown / unverified:
- keep risk elevated
- produce advisory: verify external escape route usability

### If external escape is obstructed / locked / poor:
- do not reduce risk
- produce remedy/advisory to restore escape route

## 4. Remedy rule changes

Add or update rules:

### Rule A — external escape route verified
If upper flat has a viable external escape route:

- downgrade remedies based purely on single-route dependency
- report that the external route materially improves escape strategy
- still assess doors, alarms, and compartmentation normally

### Rule B — external escape route exists but is unverified
Add advisory:

"Verify the external escape route from the upper flat."

Text:

"The upper flat appears to have an independent external escape route, but its usability has not been confirmed. Confirm that the route is permanently available, unobstructed, can be opened without a key where relevant, and is in sound condition."

Legal status:
- advisory

### Rule C — external escape route obstructed / unavailable / poor condition
Add recommendation:

"Restore or repair the external escape route."

Text:

"The external escape route cannot currently be relied upon. Until repaired or confirmed usable, the assessment should treat the shared entrance/internal stair as the primary escape route."

Legal status:
- lacors_recommendation or advisory depending on existing tier model

## 5. Report changes

Report must show an explicit section:

"Upper flat escape strategy"

Include:
- shared route exists: yes/no/unknown
- independent external escape: yes/no/unknown
- external escape type
- viability
- resulting dependency on shared route
- risk effect

Example wording:

"The upper flat has a verified external steel staircase to the rear garden. This reduces reliance on the shared entrance hall/internal stair as the sole escape route. Shared-route compartmentation remains relevant, but the escape strategy is materially stronger than a single-route upper flat."

If unverified:

"The upper flat may have an independent external escape route, but it has not been verified. The app has not fully reduced shared-route risk until this route is confirmed usable."

## 6. Existing wording to review

Search the codebase for wording that assumes:
- shared entrance hall = sole escape route
- shared stair = primary escape route
- no qualifying escape window = automatic high risk

Update wording so it accounts for external independent escape routes.

## 7. Tests

Add or update tests for these scenarios:

### Scenario 1
Shared entrance hall exists, upper flat has no independent escape.
Expected:
- upper_shared_route_dependency = sole_route
- normal shared-route risk applies

### Scenario 2
Shared entrance hall exists, upper flat has verified external steel stair.
Expected:
- upper_shared_route_dependency = secondary_route
- risk score reduced
- single-route door/FD30S escalation downgraded or suppressed where appropriate

### Scenario 3
External stair exists but usability unknown.
Expected:
- no full risk reduction
- advisory to verify external escape route

### Scenario 4
External stair obstructed/unusable.
Expected:
- no risk reduction
- recommendation/advisory to restore route

## 8. Constraints

Do not:
- assume every external stair is acceptable
- remove all shared corridor risk
- suppress statutory requirements
- move logic into React components
- add new dependencies unless necessary

## Before coding

First output:
1. which existing questions already partially cover this
2. the minimum schema changes needed
3. which risk factors/remedy rules will be affected
4. expected files to change

Then implement.

## After coding

Provide:
- files changed
- logic changed
- test scenarios added
- any remaining limitations
