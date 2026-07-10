#!/usr/bin/env python3
"""tools/bench/merge_sweep.py — the analysis half of bench_sweep (skill: twin-optimize).

Two jobs, one file (dependency-free — json/statistics/argparse only, the language every twin sweep
merge is already written in):

  --field <name>   Read ONE field out of the declarative matrix JSON for the bench_sweep.sh driver
                   to consume (scalars printed bare; list fields printed as TSV lines). Loading the
                   matrix VALIDATES it, so any stage that touches the matrix fails loud on an unknown
                   key / missing baseline / malformed config — the driver's preflight rides on this.

  (default)        Merge the sweep: read the optimize reports + the single-pass bench arrays + the
                   optional interleaved-repeat arrays this run produced, ASSERT the deterministic
                   per-frame columns (objects_rendered / draw_calls / primitives) are byte-identical
                   across every repeat of a config (fail loud, exit 1, on any variance — a rendered
                   scene cannot change its object count run to run; if it did, the sweep is corrupt),
                   compute self-describing rows with deltas vs the named baseline config + noise-floor
                   flagging (|Δcpu| ≤ floor labelled), auto-SUGGEST interleaved repeats when a row's
                   frame_ms is pinned at the display cap (≈ 1000/refresh_hz within _CAP_TOL — cpu_ms
                   is then noisy and a single sequential pass can alias thermal drift onto the config
                   axis), write summary.json and print the tables.

Row/config matching is by the scene path bench_scene.gd stamps into every row: optimize writes
<out_dir>/<config>.scn, so basename-stem(row["scene"]) IS the config name, and row["vantage"] is the
coords — no positional array indexing, order-independent. cpu is taken from the interleaved-repeat
MEDIAN when a config was repeated at that vantage (drift-cancelled, authoritative), else the
single-pass value; each row records which. Timings are honestly session-bound (one machine, one
thermal block); objects/draws/primitives are deterministic and are the backbone.
"""

import argparse
import json
import os
import re
import statistics as st
import sys

# Matrix schema — every legal key. An unknown top-level key FAILS (a typo'd knob must not be a
# silent no-op mid-sweep). Required keys have no default; optional keys carry the value used when
# absent.
_REQUIRED = ("scene_in", "out_dir", "configs", "vantages", "baseline")
_OPTIONAL = {
    "report_dir": "reports/benchsweep",
    "json_dir": "json/benchsweep",
    "optimize_common": "",
    "noise_floor_ms": 0.03,
    "refresh_hz": 120.0,
    "warmup": 2.0,
    "measure": 8.0,
    "repeat": None,
}
_CONFIG_KEYS = {"flags"}
_REPEAT_REQUIRED = ("cycles", "vantage", "configs")
_REPEAT_OPTIONAL = {"warmup": 1.5, "measure": 6.0}
# frame_ms within this fraction of 1000/refresh reads as "pinned at the display cap".
_CAP_TOL = 0.02
# The vantage grammar bench_scene.gd expects: "X,Y,Z:LX,LY,LZ" (position : look-at target, numbers).
# Validated in the reader so a bare number / bad separator fails at preflight, not mid-bench.
_VANTAGE_RE = re.compile(r"^-?[\d.]+(,-?[\d.]+){2}:-?[\d.]+(,-?[\d.]+){2}$")


def _die(msg):
    sys.stderr.write("bench-sweep: FAIL — %s\n" % msg)
    sys.exit(1)


def load_matrix(path):
    """Load + fully validate the matrix, folding optional defaults in. FAILS LOUD on any schema
    violation (unknown key, missing required key, baseline not among configs, malformed repeat)."""
    try:
        m = json.load(open(path))
    except (OSError, ValueError) as e:
        _die("cannot read matrix %s: %s" % (path, e))
    if not isinstance(m, dict):
        _die("matrix must be a JSON object")
    # JSON has no comments; a __-prefixed key is an inline doc/annotation and is ignored (dropped
    # before validation so it never reaches the schema check or the field emitters).
    for k in [k for k in m if k.startswith("__")]:
        del m[k]
    allowed = set(_REQUIRED) | set(_OPTIONAL)
    for k in m:
        if k not in allowed:
            _die("unknown matrix key '%s' (allowed: %s)" % (k, ", ".join(sorted(allowed))))
    for k in _REQUIRED:
        if k not in m:
            _die("matrix is missing required key '%s'" % k)
    for k, dflt in _OPTIONAL.items():
        m.setdefault(k, dflt)
    if not isinstance(m["configs"], dict) or not m["configs"]:
        _die("'configs' must be a non-empty object of name -> {flags}")
    for name, spec in m["configs"].items():
        if not isinstance(spec, dict):
            _die("config '%s' must be an object" % name)
        for k in spec:
            if k not in _CONFIG_KEYS:
                _die("config '%s' has unknown key '%s' (allowed: flags)" % (name, k))
        if not isinstance(spec.get("flags", ""), str):
            _die("config '%s' flags must be a string" % name)
        spec.setdefault("flags", "")
    if not isinstance(m["vantages"], dict) or not m["vantages"]:
        _die("'vantages' must be a non-empty object of name -> 'X,Y,Z:LX,LY,LZ'")
    for name, coords in m["vantages"].items():
        if not isinstance(coords, str) or not _VANTAGE_RE.match(coords):
            _die("vantage '%s' must be 'X,Y,Z:LX,LY,LZ' (position:look-at, numbers), got %r"
                 % (name, coords))
    if not isinstance(m["refresh_hz"], (int, float)) or isinstance(m["refresh_hz"], bool) \
            or m["refresh_hz"] <= 0:
        _die("refresh_hz must be a number > 0 (the display refresh the cap-detect divides by), got %r"
             % (m["refresh_hz"],))
    if m["baseline"] not in m["configs"]:
        _die("baseline '%s' is not one of the configs (%s)"
             % (m["baseline"], ", ".join(m["configs"])))
    _validate_repeat(m)
    return m


def _validate_repeat(m):
    rep = m["repeat"]
    if rep is None:
        return
    if not isinstance(rep, dict):
        _die("'repeat' must be an object")
    for k in rep:
        if k not in set(_REPEAT_REQUIRED) | set(_REPEAT_OPTIONAL):
            _die("repeat has unknown key '%s'" % k)
    for k in _REPEAT_REQUIRED:
        if k not in rep:
            _die("repeat is missing required key '%s'" % k)
    for k, dflt in _REPEAT_OPTIONAL.items():
        rep.setdefault(k, dflt)
    if not isinstance(rep["cycles"], int) or rep["cycles"] < 1:
        _die("repeat.cycles must be an integer >= 1")
    if rep["vantage"] not in m["vantages"]:
        _die("repeat.vantage '%s' is not a declared vantage" % rep["vantage"])
    if not isinstance(rep["configs"], list) or not rep["configs"]:
        _die("repeat.configs must be a non-empty list")
    for c in rep["configs"]:
        if c not in m["configs"]:
            _die("repeat config '%s' is not a declared config" % c)


# ----- --field: emit one matrix field for the shell driver ----------------------------------------
def emit_field(m, field):
    scalars = ("scene_in", "out_dir", "report_dir", "json_dir", "optimize_common",
               "warmup", "measure")
    if field in scalars:
        print(m[field])
    elif field == "configs":
        for name, spec in m["configs"].items():
            print("%s\t%s" % (name, spec["flags"]))
    elif field == "vantages":
        for name, coords in m["vantages"].items():
            print("%s\t%s" % (name, coords))
    elif field == "has_repeat":
        print("1" if m["repeat"] else "0")
    elif field == "repeat_scalars":  # cycles<TAB>vantage<TAB>coords<TAB>warmup<TAB>measure
        rep = m["repeat"]
        if rep:
            print("%d\t%s\t%s\t%s\t%s" % (rep["cycles"], rep["vantage"],
                                          m["vantages"][rep["vantage"]], rep["warmup"], rep["measure"]))
    elif field == "repeat_configs":
        rep = m["repeat"]
        if rep:
            for c in rep["configs"]:
                print("%s\t%s" % (c, m["configs"][c]["flags"]))
    else:
        _die("unknown --field '%s'" % field)


# ----- default: merge + analyse -------------------------------------------------------------------
def _stem(scene_path):
    return os.path.splitext(os.path.basename(scene_path))[0]


def _load_rows(path):
    if not os.path.exists(path):
        return []
    try:
        rows = json.load(open(path))
    except (OSError, ValueError) as e:
        _die("cannot read bench rows %s: %s" % (path, e))
    return rows if isinstance(rows, list) else []


def _report(report_dir, cfg):
    path = os.path.join(report_dir, "%s.json" % cfg)
    if not os.path.exists(path):
        return {}
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return {}


_DET_COLS = ("objects_rendered", "draw_calls", "primitives")


def _i(v):
    """Deterministic per-frame counts are integers; bench_scene occasionally serialises one as a
    float (343.0). Coerce so rows/deltas stay clean ints (and never int-vs-float mismatch)."""
    return None if v is None else int(round(float(v)))


def _assert_determinism(cfg, rows, where):
    """Every deterministic per-frame column must be byte-identical across the given rows."""
    if len(rows) < 2:
        return
    for col in _DET_COLS:
        vals = [r.get(col) for r in rows]
        if len(set(vals)) > 1:
            _die("determinism BROKEN for config '%s' %s: %s varies across repeats: %s "
                 "(a rendered scene's per-frame counts cannot change run to run — the sweep is "
                 "corrupt or a row was doctored)" % (cfg, where, col, vals))


def merge(matrix_path):
    m = load_matrix(matrix_path)
    report_dir, json_dir = m["report_dir"], m["json_dir"]
    baseline, floor, refresh = m["baseline"], float(m["noise_floor_ms"]), float(m["refresh_hz"])
    cap_ms = 1000.0 / refresh
    rep = m["repeat"]

    # single-pass rows, indexed [vantage_name][config]
    single = {}
    for vname in m["vantages"]:
        single[vname] = {}
        for r in _load_rows(os.path.join(json_dir, "%s.json" % vname)):
            single[vname][_stem(r.get("scene", ""))] = r

    # interleaved-repeat arrays per config (all at repeat.vantage), with the determinism assert
    repeat_rows = {}
    if rep:
        for cfg in rep["configs"]:
            rows = _load_rows(os.path.join(json_dir, "repeat", "%s.json" % cfg))
            _assert_determinism(cfg, rows, "in repeat block")
            repeat_rows[cfg] = rows
            # cross-check the single-pass row at the same vantage shares the deterministic counts
            sp = single.get(rep["vantage"], {}).get(cfg)
            if sp and rows:
                _assert_determinism(cfg, [sp, rows[0]], "single-pass vs repeat (%s)" % rep["vantage"])

    def cpu_for(cfg, vname):
        """(value, source) — repeat median when this config was repeated at this vantage, else the
        single-pass value."""
        if rep and vname == rep["vantage"] and repeat_rows.get(cfg):
            return round(st.median(r["cpu_ms"] for r in repeat_rows[cfg]), 3), "repeat-median"
        r = single.get(vname, {}).get(cfg)
        return (r["cpu_ms"], "single-pass") if r else (None, "missing")

    summary = {"matrix": os.path.abspath(matrix_path), "baseline": baseline,
               "noise_floor_ms": floor, "refresh_hz": refresh,
               "method": "objects/draws/primitives deterministic (asserted); cpu = interleaved-repeat "
                         "median where repeated, else single-pass; timings session-bound",
               "vantages": {}}
    suggestions = []

    for vname in m["vantages"]:
        base_sp = single[vname].get(baseline, {})
        base_obj = _i(base_sp.get("objects_rendered"))
        base_draw = _i(base_sp.get("draw_calls"))
        base_cpu, _ = cpu_for(baseline, vname)
        rows_out = []
        capped_ct = 0
        for cfg in m["configs"]:
            sp = single[vname].get(cfg)
            rp = _report(report_dir, cfg)
            cpu, src = cpu_for(cfg, vname)
            fms = sp.get("frame_ms") if sp else None
            if fms is not None and abs(fms - cap_ms) <= _CAP_TOL * cap_ms:
                capped_ct += 1
            rec = {
                "config": cfg, "flags": m["configs"][cfg]["flags"],
                "vis_ranges_set": rp.get("vis_ranges_set"), "occluders_added": rp.get("occluders_added"),
                "vis_fade_margin": rp.get("vis_fade_margin"), "vis_fade_mode": rp.get("vis_fade_mode"),
                "cpu_ms": cpu, "cpu_src": src, "frame_ms": fms,
                "objects_rendered": _i(sp.get("objects_rendered")) if sp else None,
                "draw_calls": _i(sp.get("draw_calls")) if sp else None,
                "primitives": _i(sp.get("primitives")) if sp else None,
                "n_repeats": len(repeat_rows.get(cfg, [])) if (rep and vname == rep["vantage"]) else 0,
            }
            if cfg != baseline:
                rec["d_cpu"] = round(cpu - base_cpu, 3) if (cpu is not None and base_cpu is not None) else None
                rec["d_objects"] = (rec["objects_rendered"] - base_obj) if (
                    rec["objects_rendered"] is not None and base_obj is not None) else None
                rec["d_draws"] = (rec["draw_calls"] - base_draw) if (
                    rec["draw_calls"] is not None and base_draw is not None) else None
                rec["within_noise"] = (rec["d_cpu"] is not None and abs(rec["d_cpu"]) <= floor)
            rows_out.append(rec)
        summary["vantages"][vname] = {"baseline_cpu_ms": base_cpu, "rows": rows_out}
        # auto-suggest interleaved repeats where frame_ms is display-capped and we have no repeat data
        if capped_ct and not (rep and vname == rep["vantage"]):
            suggestions.append(
                "vantage '%s': frame_ms pinned at the ~%.2f ms display cap (%.0f Hz) on %d config(s) "
                "— cpu_ms is noisy there and a single sequential pass can alias thermal drift onto the "
                "config axis. Add a \"repeat\" block (interleaved cycles) at this vantage for a "
                "drift-cancelled cpu." % (vname, cap_ms, refresh, capped_ct))
    summary["suggestions"] = suggestions

    os.makedirs(json_dir, exist_ok=True)
    out = os.path.join(json_dir, "summary.json")
    with open(out, "w") as f:
        json.dump(summary, f, indent=2)
    _print_tables(m, summary)
    print("\nwrote %s" % out)


def _fmt(v, spec="%s"):
    return "-" if v is None else spec % v


def _print_tables(m, summary):
    baseline = summary["baseline"]
    for vname, blk in summary["vantages"].items():
        print("\n== %s ==  baseline '%s' cpu_ms=%s" % (vname, baseline, _fmt(blk["baseline_cpu_ms"])))
        print("%-20s%8s%8s%10s%9s%8s%8s%8s%9s  %s"
              % ("config", "ranged", "margin", "cpu_ms", "src", "objects", "Δobj", "draws", "Δcpu", "flag"))
        for r in blk["rows"]:
            is_base = r["config"] == baseline
            flag = "baseline" if is_base else ("≤floor" if r.get("within_noise") else "")
            src = {"repeat-median": "rep", "single-pass": "1pass", "missing": "-"}.get(r["cpu_src"], r["cpu_src"])
            print("%-20s%8s%8s%10s%9s%8s%8s%8s%9s  %s"
                  % (r["config"], _fmt(r["vis_ranges_set"]), _fmt(r["vis_fade_margin"], "%.0f"),
                     _fmt(r["cpu_ms"], "%.3f"), src, _fmt(r["objects_rendered"]),
                     _fmt(None if is_base else r.get("d_objects"), "%+d"),
                     _fmt(r["draw_calls"]), _fmt(None if is_base else r.get("d_cpu"), "%+.3f"), flag))
    if summary["suggestions"]:
        print("\n-- interleave auto-suggest --")
        for s in summary["suggestions"]:
            print("  * " + s)


def main():
    ap = argparse.ArgumentParser(description="bench_sweep matrix reader + merge/analysis")
    ap.add_argument("matrix", help="path to the declarative matrix JSON")
    ap.add_argument("--field", help="emit ONE matrix field for the shell driver (else run the merge)")
    args = ap.parse_args()
    m = load_matrix(args.matrix)
    if args.field:
        emit_field(m, args.field)
    else:
        merge(args.matrix)


if __name__ == "__main__":
    main()
