
Do not bolt this onto an existing generic construction question.  introduce a separate stair-compartmentation model, because in the portfolio the stair enclosure is often the single most important fire separation element.

Below is the change structure uggested to implement.

New questions

Add a dedicated subsection under Section D (construction / compartmentation):

// Stair enclosure assessment
D10_STAIR_CONSTRUCTION_MATERIAL
- masonry
- plasterboard
- lath_plaster
- timber_panelling
- mixed
- unknown
D11_CONVERSION_PERIOD
- pre_1950
- 1950_1970
- 1970_1991
- post_1991
- unknown
D12_BOARD_THICKNESS
- under_9_5
- 9_5
- 12_5
- double_layer
- unknown
D13_BOARD_TYPE
- standard
- fire_resistant
- unknown
D14_INSPECTION_CONFIDENCE
- visual_only
- edge_visible
- inspection_opening
- intrusive_confirmed
D15_VISIBLE_PENETRATIONS
- none
- sealed
- unsealed
- unknown
D16_CONTINUOUS_STAIR_ENCLOSURE
- yes
- no
- unknown
D17_HIDDEN_VOIDS_SUSPECTED
- yes
- no
- unknown
D18_SHARED_ESCAPE_ROUTE
- yes
- no

⸻

Why these questions matter

The app should not ask:

“Is the stair enclosure fire resistant?”

because nobody inspecting a converted property can answer that reliably.

Instead it should ask:

“What evidence exists that the stair enclosure probably provides compartmentation?”

⸻

Classification changes

Add derived fields:

stair_compartmentation_confidence:
    'high'
    'moderate'
    'low'
    'unknown'
stair_compartmentation_risk:
    'low'
    'normal'
    'elevated'
    'high'

⸻

Risk scoring additions

Add new risk factors:

RF-S01
if:
    D10 = timber_panelling
weight: +3
RF-S02
if:
    D12 = under_9_5
weight: +2
RF-S03
if:
    D15 = unsealed
weight: +2
RF-S04
if:
    D16 = no
weight: +3
RF-S05
if:
    D17 = yes
weight: +2
RF-S06
if:
    D11 = 1950_1970
AND D14 = visual_only
weight: +1

The last one intentionally adds only a small increase:

You do not want to assume:

old conversion = unsafe

You only want:

old conversion + uncertainty = more investigation required

⸻

New rules

Rule: uncertain stair compartmentation

R-S01
title:
"Compartmentation of staircase enclosure uncertain"
legal_status:
advisory
condition:
(
D10='plasterboard'
AND D14='visual_only'
AND D12='unknown'
)
OR
(
D11='1950_1970'
AND D14='visual_only'
)
text:
"The staircase enclosure is likely to be a critical fire separation element, but its construction cannot currently be verified. Consider a concealed inspection opening or other investigation to determine board construction and continuity."
risk_basis:
"Compartmentation uncertainty may significantly affect escape route protection."

⸻

Rule: high-risk stair enclosure

R-S02
title:
"Stair enclosure likely to provide inadequate separation"
legal_status:
lacors_recommendation
condition:
(
D10='timber_panelling'
OR
D16='no'
OR
D15='unsealed'
)
text:
"The stair enclosure may not provide sufficient separation between flats and escape routes. Further investigation and possible upgrade should be considered."

⸻

Rule: hidden void risk

R-S03
title:
"Hidden void continuity may allow fire spread"
legal_status:
advisory
condition:
D17='yes'
text:
"Continuous concealed voids may allow fire and smoke spread between dwellings."

⸻

Report changes

Add:

Stair compartmentation assessment
Construction:
Plasterboard
Board thickness:
Unknown
Inspection confidence:
Visual only
Penetrations:
Minor unsealed
Compartmentation confidence:
Low
Risk level:
Elevated
Recommended action:
Targeted inspection opening recommended

⸻

The biggest design change is this:

Current app thinking:

wall material → risk

Recommended model:

evidence of compartmentation → confidence → risk

That better matches how an assessor actually reasons through a converted 1950–1970 two-flat building.
