"""Offline training only. Requires Python3, numpy and scikit-learn (recorded in report).
python3 scripts/ml-train.py --input 'data/ml/pilot-*.jsonl' --canonical data/ml/canonical-independent.jsonl
Runtime inference uses the exported JSON; the app never imports Python.
"""

import argparse, glob, hashlib, json, math, os, platform, time
from collections import Counter
import numpy as np
import sklearn
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

p = argparse.ArgumentParser()
p.add_argument("--input", default="data/ml/pilot.jsonl")
p.add_argument("--canonical", default="data/ml/canonical-independent.jsonl")
p.add_argument("--final", default="data/ml/final-independent.jsonl")
p.add_argument("--validation", default="data/ml/canonical-validation.jsonl")
p.add_argument("--out", default="packages/poker/models")
args = p.parse_args()
files = sorted(glob.glob(args.input))
raw = [json.loads(l) for f in files for l in open(f) if l.strip()]
# Refuse mixed learner data, obsolete teachers, tampered splits and partial groups.
EXPECTED_CANDIDATES = {("fold", None), ("call", None), ("raise", 20), ("raise", 25)}
ROW_KEYS = {
    "datasetVersion",
    "featureVersion",
    "source",
    "group",
    "split",
    "samples",
    "teacherVersion",
    "teacherSeedScheme",
    "teacherFlag",
    "features",
    "candidate",
    "label",
    "lower",
    "upper",
    "teacherMs",
}


def validate_rows(rows, samples):
    if not rows:
        raise ValueError("No synthetic dataset rows found; inspect --input")
    groups = {}
    group_features = {}
    for row in rows:
        if (
            set(row) != ROW_KEYS
            or row["source"] != "synthetic"
            or row["datasetVersion"] != 1
            or row["featureVersion"] != 1
            or row["teacherVersion"] != "analysis7-paired-v1"
            or row["samples"] != samples
        ):
            raise ValueError("Synthetic source/version/teacher/schema mismatch")
        scheme = "independent640-v1" if samples == 640 else "pilot200-v1"
        if row["teacherSeedScheme"] != scheme:
            raise ValueError("Teacher sampling seed scheme mismatch")
        group = row["group"]
        if type(group) is not int or group < 0:
            raise ValueError("Invalid independent deal group")
        split = (
            "test" if group % 10 == 0 else "validation" if group % 10 == 1 else "train"
        )
        if row["split"] != split:
            raise ValueError("Frozen deal split was changed")
        candidate = row["candidate"]
        key = (candidate.get("action"), candidate.get("amount"))
        if key not in EXPECTED_CANDIDATES or set(candidate) != (
            {"action", "amount"} if key[0] == "raise" else {"action"}
        ):
            raise ValueError("Unexpected candidate choice")
        seen = groups.setdefault(group, set())
        if key in seen:
            raise ValueError("Duplicate deal/candidate row")
        seen.add(key)
        f = row["features"]
        if (
            not isinstance(f, list)
            or len(f) != 9
            or any(type(v) not in (int, float) or not math.isfinite(v) for v in f)
        ):
            raise ValueError("Invalid public feature vector")
        if (
            not (2 <= f[1] <= f[0] <= 14)
            or any(v != int(v) for v in f[:2])
            or f[2] != int(f[0] == f[1])
            or f[3] not in (0, 1)
            or f[4] != f[0] - f[1]
            or f[5:]
            != [
                int(key[0] == "fold"),
                int(key[0] == "call"),
                int(key[0] == "raise"),
                (key[1] or 0) / 10,
            ]
        ):
            raise ValueError("Public feature/candidate semantics mismatch")
        if group_features.setdefault(group, f[:5]) != f[:5]:
            raise ValueError("Candidates from one deal have inconsistent public cards")
        if (
            any(
                type(row[k]) not in (int, float) or not math.isfinite(row[k])
                for k in ("lower", "upper", "teacherMs")
            )
            or row["lower"] > row["upper"]
            or row["teacherMs"] < 0
        ):
            raise ValueError("Invalid teacher evidence")
        label = 1 if row["lower"] > 10 else 0 if row["upper"] <= 10 else None
        if row["label"] != label or row["teacherFlag"] != int(row["lower"] > 0):
            raise ValueError("Teacher target differs from preserved evidence")
    if any(seen != EXPECTED_CANDIDATES for seen in groups.values()):
        raise ValueError("Incomplete independent deal group")


validate_rows(raw, 200)
pilot_features = {
    (r["group"], r["candidate"]["action"], r["candidate"].get("amount")): r["features"]
    for r in raw
}


def match_pilot_features(rows):
    for r in rows:
        key = (r["group"], r["candidate"]["action"], r["candidate"].get("amount"))
        if pilot_features.get(key) != r["features"]:
            raise ValueError(
                "Canonical reference candidate/features differ from pilot deal"
            )


# One candidate has one immutable row per deal. Fail instead of silently duplicating resumes.
keys = [
    (r["group"], r["candidate"]["action"], r["candidate"].get("amount")) for r in raw
]
if len(keys) != len(set(keys)):
    raise ValueError("Duplicate deal/candidate rows")
if any(r["samples"] != 200 for r in raw):
    raise ValueError("Pilot must use200 samples")
for r in raw:
    r["target"] = int(r["lower"] > 0)
X = lambda rows: np.array([r["features"] for r in rows], dtype=float)
y = lambda rows: np.array([r["target"] for r in rows], dtype=int)
train = [r for r in raw if r["split"] == "train"]
calibration = [r for r in raw if r["split"] == "validation" and r["group"] % 20 == 1]
selection = [r for r in raw if r["split"] == "validation" and r["group"] % 20 == 11]
test = [r for r in raw if r["split"] == "test"]
reference_validation = [json.loads(l) for l in open(args.validation) if l.strip()]
validate_rows(reference_validation, 640)
match_pilot_features(reference_validation)
for r in reference_validation:
    r["target"] = int(r["lower"] > 0)
if set(r["group"] for r in reference_validation) != set(
    r["group"] for r in calibration + selection
):
    raise ValueError("Canonical validation must cover exactly validation groups")
if any(
    r["samples"] != 640 or r.get("teacherSeedScheme") != "independent640-v1"
    for r in reference_validation
):
    raise ValueError("Expected independent640 validation teacher")
calibration = [r for r in reference_validation if r["group"] % 20 == 1]
selection = [r for r in reference_validation if r["group"] % 20 == 11]
assert all(
    set(r["group"] for r in a).isdisjoint(set(r["group"] for r in b))
    for i, a in enumerate([train, calibration, selection, test])
    for b in [train, calibration, selection, test][i + 1 :]
)
model = ExtraTreesClassifier(
    n_estimators=80,
    max_depth=9,
    min_samples_leaf=5,
    max_features=1.0,
    random_state=1701,
    n_jobs=1,
)
start = time.perf_counter()
model.fit(X(train), y(train))
fit_seconds = time.perf_counter() - start
cal = IsotonicRegression(out_of_bounds="clip").fit(
    model.predict_proba(X(calibration))[:, 1], y(calibration)
)
predict = lambda rows: cal.predict(model.predict_proba(X(rows))[:, 1])
v = predict(selection)
vy = y(selection)


# Thresholds selected only on a disjoint validation-group subset. Require support,
# precision and a Wilson lower bound; never tune against test or canonical labels.
def wilson(k, n):
    if not n:
        return 0
    z = 1.96
    ph = k / n
    return (
        ph + z * z / (2 * n) - z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))
    ) / (1 + z * z / n)


def candidate_name(r):
    return r["candidate"]["action"] + str(r["candidate"].get("amount", ""))


def choose(positive, name):
    candidates = []
    for threshold in sorted(set(v)):
        if positive and threshold < 0.5 or not positive and threshold > 0.5:
            continue
        mask = (v >= threshold if positive else v <= threshold) & np.array(
            [candidate_name(r) == name for r in selection]
        )
        n = int(mask.sum())
        k = int((vy[mask] == int(positive)).sum())
        if n >= 20 and k / n >= 0.90 and wilson(k, n) >= 0.75:
            candidates.append((n, float(threshold), k / n, wilson(k, n)))
    return max(candidates, default=(0, None, None, None))


thresholds = {
    name: {"positive": choose(True, name), "negative": choose(False, name)}
    for name in ["fold", "call", "raise20", "raise25"]
}


def metrics(rows, probs):
    yy = y(rows)
    pp = np.asarray(probs)
    pred = pp >= 0.5
    ready = np.array(
        [
            (
                (
                    thresholds[candidate_name(r)]["positive"][1] is not None
                    and p >= thresholds[candidate_name(r)]["positive"][1]
                )
                or (
                    thresholds[candidate_name(r)]["negative"][1] is not None
                    and p <= thresholds[candidate_name(r)]["negative"][1]
                )
            )
            for r, p in zip(rows, pp)
        ]
    )

    def precision(mask, positive):
        n = int(mask.sum())
        k = int((yy[mask] == positive).sum())
        return {
            "count": n,
            "precision": k / n if n else None,
            "wilson95Lower": wilson(k, n) if n else None,
        }

    return {
        "rows": len(rows),
        "groups": len(set(r["group"] for r in rows)),
        "positiveRate": float(yy.mean()),
        "accuracyAtHalf": float((pred == yy).mean()),
        "brier": float(brier_score_loss(yy, pp)),
        "rocAuc": float(roc_auc_score(yy, pp)) if len(set(yy)) > 1 else None,
        "confusionAtHalf": confusion_matrix(yy, pred, labels=[0, 1]).tolist(),
        "coverage": float(ready.mean()),
        "readyAccuracy": (
            float((pred[ready] == yy[ready]).mean()) if ready.any() else None
        ),
        "gap": precision(ready & pred, 1),
        "noClearGap": precision(ready & ~pred, 0),
    }


canonical = [json.loads(l) for l in open(args.canonical) if l.strip()]
validate_rows(canonical, 640)
match_pilot_features(canonical)
for r in canonical:
    r["target"] = int(r["lower"] > 0)
if set(r["group"] for r in canonical) != set(r["group"] for r in test):
    raise ValueError("Canonical reference must cover exactly held-out deal groups")
if any(
    r["samples"] != 640 or r.get("teacherSeedScheme") != "independent640-v1"
    for r in canonical
):
    raise ValueError("Expected independent640 teacher")
logistic = make_pipeline(
    StandardScaler(), LogisticRegression(max_iter=1000, random_state=1701)
).fit(X(train), y(train))
majority = np.full(len(test), y(train).mean())
lp = logistic.predict_proba(X(test))[:, 1]


# Explicit simple poker baseline: folding high pairs predicts a gap; other
# choices do not. It is specified before inspection of test results.
def simple(rows):
    return np.array(
        [
            (
                0.9
                if r["features"][2]
                and r["features"][0] >= 10
                and r["candidate"]["action"] == "fold"
                else 0.1
            )
            for r in rows
        ]
    )


def export_tree(est):
    t = est.tree_
    val = t.value[:, 0, :]
    probs = val[:, 1] / val.sum(axis=1)
    return {
        "left": t.children_left.tolist(),
        "right": t.children_right.tolist(),
        "feature": t.feature.tolist(),
        "threshold": t.threshold.tolist(),
        "value": probs.tolist(),
    }


artifact = {
    "modelId": "opening-mara-et-v1",
    "featureVersion": 1,
    "features": [
        "highRank",
        "lowRank",
        "pair",
        "suited",
        "gap",
        "fold",
        "call",
        "raise",
        "raiseToBB",
    ],
    "target": "analysis7 paired lower bound >0 chips versus a tested alternative; negative includes inconclusive teacher comparisons",
    "support": "Initial heads-up preflop button, 100 BB, policy2 Mara, no previous actions or nonzero reads; fold/call/raise20/raise25 chips",
    "candidateThresholds": {
        name: {"positive": th["positive"][1], "negative": th["negative"][1]}
        for name, th in thresholds.items()
    },
    "trees": [export_tree(e) for e in model.estimators_],
    "calibration": {"x": cal.X_thresholds_.tolist(), "y": cal.y_thresholds_.tolist()},
}
learning = []
for fraction in [0.1, 0.25, 0.5, 1.0]:
    groups = sorted(set(r["group"] for r in train))
    allowed = set(groups[: max(1, int(len(groups) * fraction))])
    rr = [r for r in train if r["group"] in allowed]
    mm = ExtraTreesClassifier(
        n_estimators=80,
        max_depth=9,
        min_samples_leaf=5,
        max_features=1.0,
        random_state=1701,
        n_jobs=1,
    ).fit(X(rr), y(rr))
    pp = mm.predict_proba(X(selection))[:, 1]
    learning.append(
        {
            "trainingGroups": len(allowed),
            "trainingRows": len(rr),
            "validationBrierUncalibrated": float(brier_score_loss(vy, pp)),
        }
    )
canon_by_key = {
    (r["group"], r["candidate"]["action"], r["candidate"].get("amount")): r
    for r in canonical
}
canonical_disagree = sum(
    r["target"]
    != canon_by_key[
        (r["group"], r["candidate"]["action"], r["candidate"].get("amount"))
    ]["target"]
    for r in test
) / len(test)
report = {
    "modelId": artifact["modelId"],
    "featureVersion": 1,
    "provenance": {
        "source": "synthetic only; no learner records",
        "teacher": "analysis7; valueModel; inferredRange; pairedActionComparisons",
        "trainingSamplesPerWorldSet": 200,
        "canonicalSamplesPerWorldSet": 640,
        "canonicalSeedScheme": "independent640-v1",
        "calibrationAndThresholdTeacherSamples": 640,
        "target": artifact["target"],
        "continuation": "Theo authored policy for hero; Mara authored policy for opponent",
        "samplingIntervals": "Bonferroni-adjusted paired approximate95% sampling intervals; not model validity",
        "candidates": ["fold", "call", "raise20", "raise25"],
        "features": artifact["features"],
        "split": "group modulo10:0test,1validation,2-9train; validation modulo20 separates calibration1 from threshold selection11",
        "versions": {
            "python": platform.python_version(),
            "sklearn": sklearn.__version__,
            "numpy": np.__version__,
        },
        "filesSha256": {
            os.path.basename(f): hashlib.sha256(open(f, "rb").read()).hexdigest()
            for f in files + [args.canonical, args.validation]
        },
    },
    "dataset": {
        "rows": len(raw),
        "groups": len(set(r["group"] for r in raw)),
        "original1BBExperiment": dict(
            Counter(
                (
                    "unknown"
                    if r["label"] is None
                    else "positive" if r["label"] == 1 else "negative"
                )
                for r in raw
            )
        ),
        "trainingRows": len(train),
        "calibrationRows": len(calibration),
        "thresholdSelectionRows": len(selection),
        "testRows": len(test),
        "trainingPositiveRate": float(y(train).mean()),
    },
    "thresholdSelection": {
        "minimumPrecision": 0.90,
        "minimumWilson95Lower": 0.75,
        "minimumRows": 20,
        "perCandidate": {
            name: {
                kind: {
                    "count": a[0],
                    "threshold": a[1],
                    "precision": a[2],
                    "wilson95Lower": a[3],
                }
                for kind, a in th.items()
            }
            for name, th in thresholds.items()
        },
    },
    "heldout200": metrics(test, predict(test)),
    "heldoutIndependent640": metrics(canonical, predict(canonical)),
    "teacher200vs640Disagreement": canonical_disagree,
    "baselines200": {
        "majority": metrics(test, majority),
        "simpleHighPairFoldRule": metrics(test, simple(test)),
        "logistic": metrics(test, lp),
    },
    "baselines640": {
        "majority": metrics(canonical, np.full(len(canonical), y(train).mean())),
        "simpleHighPairFoldRule": metrics(canonical, simple(canonical)),
        "logistic": metrics(canonical, logistic.predict_proba(X(canonical))[:, 1]),
    },
    "perCandidate640": {
        name: metrics(rr, predict(rr))
        for name, rr in (
            (
                name,
                [
                    r
                    for r in canonical
                    if (
                        r["candidate"]["action"] + str(r["candidate"].get("amount", ""))
                    )
                    == name
                ],
            )
            for name in ["fold", "call", "raise20", "raise25"]
        )
    },
    "learningCurve": learning,
    "fitSeconds": fit_seconds,
    "teacherLatencyMs": {
        "pilotPerCandidateMedian": float(np.median([r["teacherMs"] for r in raw])),
        "canonicalPerCandidateMedian": float(
            np.median([r["teacherMs"] for r in canonical])
        ),
    },
    "limitations": [
        "Approximates a noisy authored conditional teacher, not GTO or poker skill.",
        "No-clear-gap predicts lack of clear evidence; it does not establish good play.",
        "Narrow opening-only support; subsequent decisions, stack depths, sizes, reads, opponents and policies are unsupported.",
        "Test groups share poker hand classes with training; performance does not establish generalization to unseen strategies or real players.",
        "Thresholds are validation-derived; heldout precision can be lower and is reported.",
        "Synthetic data does not count as usage; no automatic training on learner data.",
    ],
}
final = [json.loads(l) for l in open(args.final) if l.strip()]
validate_rows(final, 640)
if len(final) != 1000 or set(r["group"] for r in final) != set(range(2500, 5000, 10)):
    raise ValueError(
        "Final reference must contain exactly250 complete disjoint deal groups"
    )
for r in final:
    r["target"] = int(r["lower"] > 0)
if any(
    r["samples"] != 640 or r.get("teacherSeedScheme") != "independent640-v1"
    for r in final
):
    raise ValueError("Expected fresh final640 teacher")
if set(r["group"] for r in final) & set(r["group"] for r in raw):
    raise ValueError("Fresh final groups overlap pilot")
report["diagnosticIndependent640"] = report["heldoutIndependent640"]
report["heldoutIndependent640"] = metrics(final, predict(final))
report["perCandidateDiagnostic640"] = report["perCandidate640"]
report["perCandidate640"] = {
    name: metrics(rr, predict(rr))
    for name, rr in (
        (name, [r for r in final if candidate_name(r) == name]) for name in thresholds
    )
}
report["baselinesDiagnostic640"] = report["baselines640"]
report["baselines640"] = {
    "majority": metrics(final, np.full(len(final), y(train).mean())),
    "simpleHighPairFoldRule": metrics(final, simple(final)),
    "logistic": metrics(final, logistic.predict_proba(X(final))[:, 1]),
}
fp = predict(final)
fy = y(final)
fr = np.array(
    [
        (
            (
                thresholds[candidate_name(r)]["positive"][1] is not None
                and p >= thresholds[candidate_name(r)]["positive"][1]
            )
            or (
                thresholds[candidate_name(r)]["negative"][1] is not None
                and p <= thresholds[candidate_name(r)]["negative"][1]
            )
        )
        for r, p in zip(final, fp)
    ]
)
groups = sorted(set(r["group"] for r in final))
gc = []
for g in groups:
    mask = np.array([r["group"] == g for r in final])
    gc.append(
        [
            int(mask.sum()),
            int(fr[mask].sum()),
            int(((fp[mask] >= 0.5) == fy[mask])[fr[mask]].sum()),
        ]
    )
gc = np.array(gc)
rng = np.random.default_rng(20261015)
bs = gc[rng.integers(0, len(gc), size=(2000, len(gc)))].sum(axis=1)
report["heldoutIndependent640"]["groupBootstrap95"] = {
    "resamples": 2000,
    "unit": "independent deal group",
    "coverage": np.quantile(bs[:, 1] / bs[:, 0], [0.025, 0.975]).tolist(),
    "readyPrecision": np.quantile(bs[:, 2] / bs[:, 1], [0.025, 0.975]).tolist(),
}
report["evaluationProtocol"] = (
    "Initial diagnostic heldout revealed aggregate thresholds could hide weak per-candidate results. Per-candidate thresholds were then selected using original validation only. Final metrics use fresh250 independent groups (2500..4999 modulo10=0), not used in fit, calibration, threshold selection or design choices."
)
report["provenance"]["filesSha256"][os.path.basename(args.final)] = hashlib.sha256(
    open(args.final, "rb").read()
).hexdigest()
report["inferenceFixtures"] = [
    {"features": r["features"], "probability": float(v)}
    for r, v in zip(test[:20], predict(test[:20]))
]
os.makedirs(args.out, exist_ok=True)
for name, obj in [
    ("fast-assessment-v1.json", artifact),
    ("fast-assessment-report.json", report),
]:
    with open(os.path.join(args.out, name), "w") as f:
        json.dump(
            obj,
            f,
            separators=(",", ":") if name.endswith("v1.json") else None,
            indent=None if name.endswith("v1.json") else 2,
            allow_nan=False,
        )
        f.write("\n")
print(
    json.dumps(
        {
            k: report[k]
            for k in [
                "dataset",
                "heldout200",
                "heldoutIndependent640",
                "thresholdSelection",
            ]
        },
        indent=2,
    )
)
