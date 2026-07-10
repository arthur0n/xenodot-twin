# Tutorial discipline — tutorials are tested, not authored from memory

A `docs/tutorials/*.md` walkthrough is a **reproduction proof**, not prose about a pipeline. Every
command block and every number in it is copy-pasted from output the author personally observed
running **that exact command, in a throwaway scaffold, during the writing session** — never copied
from a finding, a prior tutorial, or memory. This is a durable convention, not per-plan copy: the
house tutorial, the plant tutorial, and every future one obey it identically.

## The rule

1. **Every number is gate-backed by a command you ran this session.** Frame counts, sha256 hashes,
   byte sizes, wall-clock seconds, `JOIN` / `BIND-SMOKE` counts, instancing numbers, join
   percentages — each appears in the tutorial only because you ran the command and read it off the
   real output. If it is not in output you observed, it does not go in the file.

2. **A cited finding is a cross-check, never a source.** The demo assets are deterministic (same
   generator, same seed, same converter), so your observed numbers should match a cited finding's
   **exactly**. Use the finding to _verify_ your number, not to _supply_ it.

3. **A drift STOPS the write.** If your observed number differs from the finding's — a different
   sha256, a different JOIN ratio, a changed element count — the asset or a tool has drifted since
   the finding was written. **Stop and investigate the drift** before writing anything down. Do not
   paper over it by quoting the finding's older number, and do not "round to agreement." Either the
   finding is stale (write the new reality, honestly, and note the drift) or your scaffold is wrong
   (fix it) — but the tutorial never carries a number you could not reproduce.

4. **A SKIP is not a pass, and neither is "documented but unverified."** If a step needs a resource
   you don't have (a real display for a windowed capture, a broker for a live source), either get
   the resource and run it, or mark the step honestly as unverified-this-session with a clear note —
   never write output you didn't observe. Same discipline as the gate scripts.

## The scaffold

Verification runs in a **disposable seat** — a sibling directory outside any tracked repo
(`../<name>-verify`), scaffolded with `npm run new -- ../<name>-verify --viewer`, exercised for
real end to end, then **deleted** once every command and number is harvested into the tutorial
prose. This mirrors the seat doctrine in [`promotion.md`](promotion.md): scaffold → exercise →
harvest → discard. Nothing from the scaffold is committed; only the tutorial (and any small hero
image it needs) lands in the framework repo.

## What "proven by reproduction" looks like

A tutorial is done when its **fast-path block runs clean end to end in a fresh scaffold** — e.g.
`twin_build.sh` prints `JOIN=N/N` and `record.js` reproduces the cited finding's sha256 — and every
other number in the doc came off a command run in that same scaffold. The doc is proven by the
reproduction, not by the prose around it.

## Checklist (every tutorial)

- [ ] Every command block was run this session in a throwaway `--viewer` scaffold.
- [ ] Every number (frames, sha256, bytes, wall-clock, JOIN/BIND counts, instancing) is off
      observed output, not a finding or memory.
- [ ] Cited findings agree with your numbers; any drift was investigated and resolved before the
      write, not papered over.
- [ ] Numbers carry the **one-machine caveat**; deterministic ones are noted as reproducible, wall
      times as this-machine's.
- [ ] The scaffold is deleted; no stray dirs, no committed recordings/videos beyond a small hero
      image the tutorial embeds.
