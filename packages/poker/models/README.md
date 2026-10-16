# Fast conditional assessment model

`fast-assessment-v1.json` is a trained ExtraTrees classifier plus isotonic calibration for one deliberately narrow opening decision. The normal app evaluates the JSON in TypeScript, entirely locally. Python/scikit-learn is needed only to reproduce training. `fast-assessment-report.json` records dataset provenance, versions, held-out metrics, baselines, per-choice results, learning curves, inference fixtures and latency.

The target is **whether the existing authored conditional teacher finds a statistically clear higher-return tested alternative**, using `pairedActionComparisons`' adjusted lower bound above zero. A negative means the teacher did not establish a difference. It does not establish good play, GTO, or skill. An initial1BB target left6,276/10,000 rows unresolved and44 positives; those original labels remain in local synthetic rows and aggregate counts remain in the report. The deployed classification target instead explicitly includes inconclusive teacher comparisons in the negative class.

Support is the initial heads-up button decision at100BB versus default Mara under policy2, without earlier actions or nonzero player reads. Candidate actions are fold, call, raise to20, and raise to25 chips. Features are hero ranks, pair/suited/gap indicators, candidate action and size. The explicit public snapshot never reads opponent cards, future board, seed, outcomes, or retrospective review. Seed/deal identity is used only for generating/grouping synthetic examples.

The pilot contains10,000 candidate rows from2,500 independent deals. All candidates from a deal share one split. Training uses8,000 rows and200 sampled worlds per deal; separate validation groups use independent640-world teacher labels for calibration and abstention. Calibration and threshold selection use disjoint validation deal groups. Per-choice thresholds require at least20 validation predictions,90% precision and a Wilson lower bound of75%. If either class fails, it receives no threshold. The current model has **no supported positive-gap threshold**: potentially problematic choices abstain and should use detailed analysis. Fold also always abstains. A ready result is a conservative prediction of no clear teacher gap.

The first diagnostic test exposed weak fold results hidden by aggregate accuracy. Thresholds were then selected per candidate using the original validation set. Final quality is measured on1,000 fresh640-world rows from250 new deal groups, disjoint from every pilot/calibration/selection/diagnostic group. The report retains diagnostic metrics and records this refinement. Group bootstrap intervals resample deals because candidate rows from one deal are correlated. Row-based Wilson intervals are additionally supplied but should not be interpreted as accounting for within-deal dependence.

The fixed synthetic premium-overfold stress test increased premium-fold frequency from10% to80%. Raw model probabilities separated the enriched challenge cohort, but the shipped assessment still produced **zero positive gap flags** and abstained on156/159 teacher-positive leaky decisions. It therefore does not yet detect the injected mistake in its deployed behavior. See the [controlled experiment and matched latency results](../../../docs/mistake-bot-experiment.md); its teacher labels describe the authored conditional model and are not verified human errors.

Reproduce from repository root in a fresh `data/ml` directory (local synthetic data is ignored):

```sh
npx tsx scripts/ml-generate.ts --start=0 --count=1250 --out=data/ml/pilot-a.jsonl
npx tsx scripts/ml-generate.ts --start=1250 --count=1250 --out=data/ml/pilot-b.jsonl
npx tsx scripts/ml-generate.ts --count=2500 --samples=640 --split=validation --out=data/ml/canonical-validation.jsonl
npx tsx scripts/ml-generate.ts --count=2500 --samples=640 --split=test --out=data/ml/canonical-independent.jsonl
npx tsx scripts/ml-generate.ts --start=2500 --count=2500 --samples=640 --split=test --out=data/ml/final-independent.jsonl
python3 scripts/ml-train.py --input 'data/ml/pilot-*.jsonl'
npx tsx scripts/ml-benchmark.ts
npx vitest run tests/fast-assessment.test.ts
```

The generator resumes completed groups, repairs an interrupted final group only, and rejects interior corruption/configuration conflicts. Independent generator processes may use disjoint group ranges and separate output files; pass their explicit glob to `--input` when training. The delivered artifact used `pilot-a.jsonl` for groups0–1249 and `pilot-b.jsonl` for1250–2499. No learner database or usage records enter these scripts. No normal app request trains a model or initiates network activity.

The report pins the actual Python/numpy/scikit-learn versions used. Install those versions in a dedicated Python environment to reproduce them; Node24 and the locked npm dependencies run generation/inference. Reruns produce the same seeded examples and model under the same versions; timing measurements and corresponding raw dataset hashes vary. Do not overwrite the reviewed artifact with an unreviewed retraining run. A changed policy, teacher, feature list or support contract requires a new model version and fresh evaluation.
