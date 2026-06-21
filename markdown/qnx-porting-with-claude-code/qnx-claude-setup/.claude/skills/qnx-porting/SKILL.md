---
name: qnx-porting
description: "ALWAYS read this first for any QNX 8.0 porting or packaging task. This is the router skill: it identifies what kind of task you are facing and points to the focused skill that answers it. Holds the universal rules that apply to all QNX porting work. Covers native Alpine aports porting (build on the QNX target with abuild), patch creation, platform-level QNX facts, packaging workflow, and port reporting. Read this, then cascade into the specific skill named for your task."
---

# QNX Porting (Router)

This is the entry point for QNX 8.0 porting work. Read it first, identify the task, then load the specific skill it points you to. Do not try to hold every detail here; this skill orients and delegates. The detailed skills are the source of truth for their areas.

## Universal rules (apply to every QNX porting task)

These hold regardless of which sub-skill you are in:

1. Claims must be proven with command output before acting. Do not assert platform behaviour, dependency state, or build results as fact without having run the command that shows it. When you lack the information, say so and get the evidence rather than filling the gap with plausible reasoning.

2. Never create a patch from an untested change. Test in the unpacked source tree with native build tools first. The patch is written only after the change is confirmed working. (Full workflow: aports-patch-creation.)

3. The human runs all git operations. The agent edits and builds; it never commits and never pushes.

4. Build native aports packages on the QNX target with abuild. Do not cross-compile from a Linux host with the SDP. If a task or an old document assumes SDP/qcc/toolchain-files/build-files, that is the legacy cross-compile path and does not apply to native aports work.

5. Record new confirmed facts back into the right skill the moment they are proven, so the next session starts ahead of this one.

6. Capture friction as you go. Anything that slows a session down, breaks, or could be done faster becomes a skill or TARGET.md update the moment it is proven, not deferred. Route each learning to where the next session will look for it: a platform fact goes in qnx-platform-facts; a build or packaging technique goes in alpine-qnx-porting or qnx-apk-packaging; a patch lesson goes in aports-patch-creation; a connection or target quirk goes in TARGET.md. The test: if a future session would otherwise rediscover this the hard way, record it now.

## Task router

Find the row that matches what you are doing and load that skill.

**Adapting an Alpine APKBUILD for QNX** (dependency renames, main to core / community to extra, pkgrel reset, maintainer headers, build-system specifics like autotools or CMake or Meson): load `alpine-qnx-porting`.

**Creating, editing, or debugging a patch** (any .patch file, any "Hunk FAILED", any abuild patch-apply error, patch format and naming): load `aports-patch-creation`. This is mandatory before producing any patch content.

**Taking a port from working build to PR-ready** (version baseline, APKBUILD metadata cleanup, local repo resolution, subpackage inspection, running tests, the review-reduction pass, the validation gate): load `qnx-apk-packaging`.

**Writing up a finished or blocked port** (the after-action REPORT.md: what was done, changes made, problems hit and resolved, validation results, open items): load `qnx-port-reporting`.

**A platform-level problem** (a missing Linux syscall, a link error for sockets or regex, a stack-size segfault, a header difference, a toolchain quirk): load `qnx-platform-facts`.

## Skill map

```
qnx-porting (this router)
├── qnx-platform-facts        platform truths, build-method-independent
├── alpine-qnx-porting        APKBUILD adaptation (deps, build systems, conventions)
├── qnx-apk-packaging         end-to-end port-to-PR workflow + validation gate
├── qnx-port-reporting        after-action REPORT.md per port
└── aports-patch-creation     patch workflow and format gate
```

## Per-port notes

Each non-trivial port should carry its own folder under `projects/apks/<pkgname>/` with a `PROJECT-INDEX.md` and a `README.md` recording: what was changed relative to upstream, why, what challenges were hit, and what remains open. Keep per-port specifics here, not in the shared skills, so the shared skills stay general.

## Git and PR conventions

The human handles all git operations (rule 3). Use standard fork-based PRs: one branch per change on your personal fork, dependency packages submitted before consumer packages. Commit subjects follow the pattern `<repo>/<pkgname>: new aport` for new packages and `<repo>/<pkgname>: enable/fix build on QNX` for existing ones.
