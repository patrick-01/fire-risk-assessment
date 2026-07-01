# TW9 Regression Test Cases

These cases mirror `src/engine/tw9-scenarios.test.ts` and document the expected outcomes for the
TW9 portfolio improvements.

## 1. Converted Victorian two-flat, shared hall, pre-1991

- Classification: confirmed Section 257 HMO.
- Benchmark: LACORS Case Study D10 applies.
- Expected risk: high where weak stair/common-route evidence or missing alarms are present.
- Expected findings: D10 LACORS benchmark recommendations remain benchmark recommendations; no-smoke-alarm findings are legal requirements.

## 2. Same physical evidence, purpose-built

- Classification: not Section 257.
- Benchmark: D10 not applicable as a direct benchmark.
- Expected risk: physical risk factors match the converted case with the same physical evidence.
- Expected findings: D10-linked recommendations downgrade to risk-based recommendations where applicable.

## 3. Ground flat with rear exit and non-qualifying windows

- Ground flat escape route: rear exit/direct outside route available.
- Expected risk: no `RF-GF-C01` ground-flat bedroom-window factor.
- Expected findings: no `R-GF-C01` ground-flat window recommendation.

## 4. Ground flat with no rear exit and non-qualifying windows

- Ground flat escape route: window-dependent if the front/shared route is blocked.
- Expected risk: `RF-GF-C01` fires.
- Expected findings: `R-GF-C01` recommends reviewing/providing an adequate ground-flat escape strategy.

## 5. Loft-converted upper flat above 4.5m without protected route

- Effective storeys: three-storey.
- Benchmark: D11 applies where the building is a converted / D10-applicable case.
- Expected risk: `RF-LOFT-ESCAPE` fires.
- Expected findings: `R-LOFT` cites LACORS §§14/17 and Case Study D11.

## 6. Mixed staircase and mixed detection

- Mixed staircase: masonry upper enclosure with lighter lower-route construction remains a lower-route/transition issue, not a blanket "whole stair weak" result.
- Mixed detection: flats with different detection grades are reported per flat and trigger the mixed-provision advisory.
