# Controlled mistake-prone player test

This experiment tests the existing `opening-mara-et-v1` model without retraining, threshold changes or a new production bot policy. It asks whether a synthetic learner who more often folds premium hands receives appropriately different predictions, and compares Quick assessment's response time with the actual detailed hint.

## Protocol fixed before results

The synthetic learner makes only the first heads-up button decision, at 100 BB against policy-2 Mara. Its input is its own two cards. Premium means TT/JJ/QQ/KK/AA or AK suited/offsuit. The control folds 10% of those hands; the mistake-prone version folds 80%. Both use the same policy random numbers, and their other choices match exactly. The remaining premium choices mix call/raise-to-20/raise-to-25 at 10%/30%/60%. Nonpremium choices mix fold/call/raise-to-20/raise-to-25 at 35%/20%/20%/25%.

The natural cohort contains 400 consecutive new deal groups beginning at 1,000,000. The premium challenge contains the first 200 premium openings selected solely by hero cards from groups beginning at 2,000,000. It is an intentionally enriched challenge, not an estimate of how frequently these hands occur in ordinary play. Deal, policy and teacher sampling use separate seeded mappings. Neither policy sees hidden opponent cards, future board, teacher labels or ML outputs.

Both policies choose before assessment. The conditional teacher uses public-information ranges and 640 sampled worlds shared across tested alternatives. A teacher-confirmed gap means an alternative's adjusted paired lower bound is above zero. The injected premium fold is a behavioral hypothesis, not automatically a ground-truth poker error. Labels remain judgments inside the app's authored opponent/continuation model.

Each deal is paired between policies. Cohort reports separate injected premium-fold frequency, teacher-confirmed differences, raw probability diagnostics, shipped ready answers, false clear answers and abstentions. Paired confidence intervals resample deals. Raw probabilities classified at 0.5 are diagnostic only; that is not a deployed mistake flag. The frozen release has no validated positive-gap threshold, and always abstains on folds.

Synthetic decision rows and the pre-run protocol manifest stay under ignored `data/ml/`. The aggregate report pins source/model hashes and checks new deal identities against prior local synthetic datasets. No learner database, usage record or model-training artifact is changed.

## Reproduction

```sh
npm run ml:mistake-test
npm run ml:compare-speed
npx vitest run tests/mistake-experiment.test.ts
```

The experiment defaults to 400 natural and 200 premium challenge deals. Resume uses the same manifest/configuration; a changed protocol requires a separate output path. For smoke checks, use explicit smaller counts and separate output/report paths so the full result is preserved.

The speed comparison defaults to 40 fresh initial opening contexts, five warmup pairs and a separately reported first request. For every context it sends the same proposed call action to Quick assessment and the actual detailed **Show move hint** endpoint. Request order alternates. The runner builds temporary JavaScript API/worker bundles from current source, uses temporary file-backed SQLite and loopback HTTP, and checks that all database rows remain unchanged. It excludes compilation, server/process boot, state setup and browser rendering.

Normal advice includes 1,600 response simulations plus a separate 1,600-world shared action-value comparison and a recommendation. Quick returns one trained assessment and may abstain. Their latency comparison measures user-facing wait time, not equal information or interchangeable accuracy. The supplementary in-process comparison measures the actual functions on matching contexts after dedicated warmups, excluding HTTP/SQLite/signature/worker overhead. No multi-action total is divided into a claimed per-request normal latency.

The aggregate speed report includes cold/warm summaries, paired ratios, status counts, hardware/runtime, source/model hashes and the hash of ignored raw timings. Run it when no other teacher-generation/test workload is competing for CPU. Existing detailed action submission and full reviews retain their previous behavior.

## Results

The 400-deal natural cohort contained 14 premium decisions per policy. The leaky policy folded 12/14 (85.7%) versus 1/14 (7.1%) for control. Its 11 changed decisions were all teacher-confirmed, but the deployed model made zero positive gap predictions and was uncertain on every changed fold.

The separate 200-deal premium challenge produced 125 changed policy decisions. The leaky policy folded 158/200 premium hands (79%). The teacher confirmed 123/125 changed decisions. Raw probability scores separated this deliberately enriched challenge strongly: at a diagnostic-only 0.5 threshold, recall and precision were each 98.1% for the leaky cohort. That score threshold is not deployed or validated. The shipped output still made zero positive gap predictions; it abstained on 156/159 teacher-positive leaky decisions and incorrectly returned “no clear gap” on three. In the natural cohort it abstained on all 11 injected, teacher-confirmed folds. Thus the model's raw score responds to this stress test, but the product's deployed assessment does **not** currently detect this mistake pattern.

The challenge sample is synthetic and premium-enriched, and teacher positives mean only that the app's sampled authored model found a conditional gap. These results do not establish human poker errors, learner personalization or population prevalence.

On an Apple M1 Pro with Node24, the 40-pair warmed HTTP benchmark measured Quick assessment at **1.16 ms median / 1.64 ms p95** and the detailed hint at **1,001 ms median / 1,162 ms p95**. The ratio of medians is **863×**; the median of paired per-deal ratios is 881×. The separately measured first request took 36 ms quick and 1,160 ms detailed. This is response latency for different amounts of work: quick may abstain, while the normal endpoint samples 1,600 worlds, compares action values and returns detailed advice. It is not an equal-output or full-game speedup claim. The functions-only medians were 0.053 ms versus 775 ms, excluding HTTP, database, signature and worker costs.

Exact aggregate metrics, source/model hashes and reproduction metadata are in [the mistake experiment report](../packages/poker/models/mistake-experiment-report.json) and [the speed comparison report](../packages/poker/models/fast-assessment-speed-comparison.json). Raw synthetic decisions and request timings are ignored local files under `data/ml/`.
