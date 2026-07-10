#!/usr/bin/env python3
"""tools/bench/pop_analyze.py — the perceptual diff metric for pop_series.gd (skill: twin-optimize).

The analysis half of bench_sweep's PERCEPTUAL v2: reads the PNG frame series pop_series.gd captured
and quantifies an LOD/visibility pop with ffmpeg. Two complementary modes (run either or both):

  --adjacent <frames-dir> ...   ADJACENT-FRAME diff WITHIN one config's approach series: between every
                                consecutive pair (i, i+1) compute ydelta (mean abs luma difference,
                                0..255) + ssim (1.0 = identical). A HARD POP is a sharp ydelta SPIKE
                                (ssim dip) at the step where a chunky object crosses the cull shell at
                                full opacity; a WORKING FADE spreads that appearance as an alpha ramp
                                over several steps (lower peak, smeared). CAVEAT (measured, fade
                                sweep): forward camera motion parallax DOMINATES this metric on a dense
                                scene — 3 m of travel shifts the whole frame, swamping a per-object
                                fade. Use it to see the temporal profile; use --matched to isolate the
                                fade itself.

  --matched <dirA> <dirB> ...   MATCHED-POSITION diff BETWEEN two configs at the SAME camera pose
                                (motion cancelled — the real fade signal). pop_series.gd captures both
                                dirs on the identical axis, so the sorted frame lists align pose-by-
                                pose; diffing pose i of A vs pose i of B isolates exactly the pixels
                                the config change (e.g. fade vs no-fade) touches. Reports peak/mean
                                ydelta + min ssim + the pose (z) where the diff peaks. This is what
                                proved the fade genuinely active under Forward+ (a localised
                                block-boundary alpha ramp) where the adjacent metric could not.

Emits a metrics JSON (--out, default ./pop_metrics.json) + per-pair tables + summary stats. Reads only
the PNGs this run produced. Output is FRAME-REVIEWED, pending human confirmation — the numbers
characterise the pop, a human still rules on the live fly-through. Requires ffmpeg (preflighted).

Usage:
  pop_analyze.py --adjacent frames/aggressive --adjacent frames/aggressive_fade12
  pop_analyze.py --matched frames/aggressive frames/aggressive_fade12 [--out metrics.json]
  # both modes in one run, plus multiple pairs, are all fine.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys


def _die(msg):
    sys.stderr.write("POP-ANALYZE: FAIL — %s\n" % msg)
    sys.exit(1)


def _preflight_ffmpeg():
    """ffmpeg is the established sweep analysis dependency (SSIM + luma-delta both come from it). Fail
    with a clear, actionable message rather than a raw FileNotFoundError deep in a subprocess call."""
    if shutil.which("ffmpeg") is None:
        _die("ffmpeg not found on PATH — it is the analysis dependency for the perceptual diff "
             "(SSIM + luma delta). Install it (macOS: brew install ffmpeg) and re-run.")


def frames(directory):
    if not os.path.isdir(directory):
        _die("frames dir not found: %s" % directory)
    fs = sorted(f for f in os.listdir(directory) if f.endswith(".png"))
    if not fs:
        _die("no .png frames in %s" % directory)
    return [os.path.join(directory, f) for f in fs]


def ydelta(a, b):
    """Mean absolute luma difference of two frames (ffmpeg blend=difference -> signalstats YAVG,
    0..255) — how much of the frame changed between the two images."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", a, "-i", b, "-lavfi",
         "blend=all_mode=difference,format=gray,signalstats,metadata=print:file=-",
         "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"YAVG=([0-9.]+)", out.stdout + out.stderr)
    return float(m[-1]) if m else float("nan")


def ssim(a, b):
    """Structural similarity (ffmpeg ssim All), 1.0 = identical."""
    out = subprocess.run(["ffmpeg", "-i", a, "-i", b, "-lavfi", "ssim", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"All:([0-9.]+)", out)
    return float(m[-1]) if m else float("nan")


def zval(path):
    """The z coordinate baked into the pop_series filename (f_NNN_z<zzz>.png), else -1."""
    m = re.search(r"z(\d+)\.png$", path)
    return int(m.group(1)) if m else -1


def analyze_adjacent(directory):
    """Adjacent-frame diff within one config's series."""
    fs = frames(directory)
    steps = []
    for i in range(len(fs) - 1):
        steps.append({"i": i, "z_from": zval(fs[i]), "z_to": zval(fs[i + 1]),
                      "ydelta": round(ydelta(fs[i], fs[i + 1]), 3),
                      "ssim": round(ssim(fs[i], fs[i + 1]), 5)})
    yds = [s["ydelta"] for s in steps]
    mean = sum(yds) / len(yds) if yds else float("nan")
    peak_step = max(steps, key=lambda s: s["ydelta"]) if steps else {"z_from": -1, "z_to": -1}
    return {
        "mode": "adjacent", "dir": directory, "n_steps": len(steps),
        "mean_ydelta": round(mean, 3), "peak_ydelta": round(max(yds), 3) if yds else float("nan"),
        "peak_over_mean": round(max(yds) / mean, 2) if yds and mean else float("nan"),
        "peak_step_z": [peak_step["z_from"], peak_step["z_to"]],
        "min_ssim": round(min(s["ssim"] for s in steps), 5) if steps else float("nan"),
        # a pop-like step = ydelta over 2x the series mean (a spike above the motion baseline).
        "poplike_steps_gt2xmean": sum(1 for y in yds if mean and y > 2 * mean),
        "steps": steps,
    }


def analyze_matched(dir_a, dir_b):
    """Matched-position diff between two configs at the same pose (motion cancelled)."""
    fa, fb = frames(dir_a), frames(dir_b)
    if len(fa) != len(fb):
        _die("matched-position needs equal frame counts (same approach axis); %s has %d, %s has %d"
             % (dir_a, len(fa), dir_b, len(fb)))
    poses = []
    for a, b in zip(fa, fb):
        za, zb = zval(a), zval(b)
        if za != zb:
            _die("matched-position frames out of alignment: %s (z=%d) vs %s (z=%d) — both dirs must "
                 "be captured on the identical axis" % (a, za, b, zb))
        poses.append({"z": za, "ydelta": round(ydelta(a, b), 3), "ssim": round(ssim(a, b), 5)})
    yds = [p["ydelta"] for p in poses]
    peak_pose = max(poses, key=lambda p: p["ydelta"])
    return {
        "mode": "matched", "dir_a": dir_a, "dir_b": dir_b, "n_poses": len(poses),
        "peak_ydelta": round(max(yds), 3), "peak_pose_z": peak_pose["z"],
        "mean_ydelta": round(sum(yds) / len(yds), 3),
        "min_ssim": round(min(p["ssim"] for p in poses), 5), "poses": poses,
    }


def _print_adjacent(r):
    print("\n== POP-SERIES adjacent %s ==  peak_ydelta=%s (at z %d->%d) mean=%s peak/mean=%s "
          "min_ssim=%s pop-like_steps(>2xmean)=%s"
          % (os.path.basename(r["dir"]), r["peak_ydelta"], r["peak_step_z"][0], r["peak_step_z"][1],
             r["mean_ydelta"], r["peak_over_mean"], r["min_ssim"], r["poplike_steps_gt2xmean"]))
    print("  %14s%9s%10s" % ("z_from->z_to", "ydelta", "ssim"))
    for s in r["steps"]:
        bar = "#" * int(s["ydelta"] * 4)
        print("  %14s%9.3f%10.5f  %s" % ("%d->%d" % (s["z_from"], s["z_to"]), s["ydelta"], s["ssim"], bar))


def _print_matched(r):
    print("\n== POP-SERIES matched %s vs %s ==  peak_ydelta=%s (at z=%d) mean=%s min_ssim=%s"
          % (os.path.basename(r["dir_a"]), os.path.basename(r["dir_b"]), r["peak_ydelta"],
             r["peak_pose_z"], r["mean_ydelta"], r["min_ssim"]))
    print("  %8s%9s%10s" % ("z", "ydelta", "ssim"))
    for p in r["poses"]:
        bar = "#" * int(p["ydelta"] * 40)  # matched deltas are ~10x smaller; scale the bar to match.
        print("  %8d%9.3f%10.5f  %s" % (p["z"], p["ydelta"], p["ssim"], bar))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--adjacent", action="append", default=[], metavar="DIR",
                    help="adjacent-frame diff within one config's frame dir (repeatable)")
    ap.add_argument("--matched", action="append", nargs=2, default=[], metavar=("DIR_A", "DIR_B"),
                    help="matched-position diff between two config frame dirs (repeatable)")
    ap.add_argument("--out", default="pop_metrics.json", help="metrics JSON path (default ./pop_metrics.json)")
    args = ap.parse_args()

    if not args.adjacent and not args.matched:
        ap.error("give at least one --adjacent <dir> or --matched <dirA> <dirB>")
    _preflight_ffmpeg()

    result = {"adjacent": [], "matched": []}
    for d in args.adjacent:
        r = analyze_adjacent(d)
        result["adjacent"].append(r)
        _print_adjacent(r)
    for dir_a, dir_b in args.matched:
        r = analyze_matched(dir_a, dir_b)
        result["matched"].append(r)
        _print_matched(r)

    with open(args.out, "w") as f:
        json.dump(result, f, indent=2)
    print("\nwrote %s" % args.out)


if __name__ == "__main__":
    main()
