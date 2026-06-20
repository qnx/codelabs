---
name: qnx-porting
description: "ALWAYS read this first for any QNX 8.0 porting, packaging, patch, or driver task. This is the router skill: it identifies what kind of task you are facing and points to the focused skill that answers it. Holds the universal rules that apply to all QNX porting work. Covers native Alpine aports porting (build on the QNX target with abuild), patch creation, the team's git/PR conventions, platform-level QNX facts, and QNX driver development. Read this, then cascade into the specific skill named for your task."
---

# QNX Porting (Router)

This is the entry point for QNX 8.0 porting work. Read it first, identify the task, then load the specific skill it points you to. Do not try to hold every detail here; this skill orients and delegates. The detailed skills are the source of truth for their areas.

## Universal rules (apply to every QNX porting task)

These hold regardless of which sub-skill you are in:

1. Claims must be proven with command output before acting. Do not assert platform behaviour, dependency state, or build results as fact without having run the command that shows it. When you lack the information, say so and get the evidence rather than filling the gap with plausible reasoning.

2. Never create a patch from an untested change. Test in the unpacked source tree with native build tools first. The patch is written only after the change is confirmed working. (Full workflow: aports-patch-creation.)

3. The human runs all git operations. A local coding agent edits and builds; it never commits and never pushes.

4. We build native aports packages on the QNX target with abuild. We do not cross-compile from a Linux host with the SDP. If a task or an old document assumes SDP/qcc/toolchain-files/build-files, that is the legacy cross-compile path and does not apply to native aports work.

5. Output and code must not contain em dashes. Use hyphens, commas, parentheses, or colons.

6. Record new confirmed facts back into the right skill the moment they are proven, so the next session starts ahead of this one.

7. Capture friction as you go (master rule). Anything that slows a session down, breaks, or could be done faster is a skill update made the moment it is proven, not deferred. Route each learning to where the next session will look for it: a connection or auth problem and its fix go in TARGET.md; a build, patch, or platform error and its resolution go in the matching skill (alpine-qnx-porting, aports-patch-creation, qnx-platform-facts, qnx-apk-packaging); a faster or more token-efficient way to get a result (for example logging a long build to a file on the target and tailing it instead of streaming full output, a one-shot discovery command, a known-good sshpass invocation) goes in the relevant skill or TARGET.md. Prefer extending an existing section over adding a new one. The test: if a future session would otherwise rediscover this the hard way, record it now.

## Task router

Find the row that matches what you are doing and load that skill.

**Adapting an Alpine APKBUILD for QNX** (dependency renames, main to core / community to extra, pkgrel reset, maintainer headers, Vala workarounds, subpackage splits): load `alpine-qnx-porting`.

**Creating, editing, or debugging a patch** (any .patch file, any "Hunk FAILED", any abuild patch-apply error, patch format and naming): load `aports-patch-creation`. This is mandatory before producing any patch content.

**Taking a port from working build to PR-ready** (version baseline, APKBUILD metadata cleanup, local repo resolution, subpackage inspection, running tests, the review-reduction pass, commit/PR split, the validation gate): load `qnx-apk-packaging`.

**Writing up a finished or blocked port** (the after-action REPORT.md: what was done, changes made, problems hit and resolved, validation results, open items): load `qnx-port-reporting`.

**A platform-level wall** (a missing Linux syscall like fork/epoll/eventfd/timerfd/inotify, a link error for sockets or regex, a stack-size segfault, O_DIRECTORY, feature-test macros, sysconf returning -1, CMAKE_SYSTEM_PROCESSOR unknown): load `qnx-platform-facts`.

**Pushing a branch or opening a PR** (fork setup, SSH key, branch naming, the aports remote): load `github-fork-workflow`. Note the current standing facts: the aports remote is always `git@github.com:emazzucabb/aports.git` and the push key is `id_qnx_ed25519`.

**The port IS a device driver / resource manager** (char, serial, I2C, SPI, HID, USB, camera, or sensor driver development, not just packaging a library): load `qnx-driver-development`, which routes to the specific driver sub-skill.

**A specific named project** (Epiphany, WebKit2GTK, GTK4, gnome-keyring, etc.): load that project's own skill (for example `epiphany-browser`, `webkit2gtk-port`, `gtk4-qnx-porting`). Project skills capture deviations and history for that one port and sit alongside this tree.

## Per-project deviation notes

Each non-trivial port should carry its own project skill or `.md` deviation log recording: what was changed relative to upstream source, why the change was needed (the QNX root cause), what challenges were hit, and what remains open. The nghttp2 and OpenCV writeups in the porting reference are good templates for what a clear deviation entry looks like: the specific conditional or header guard added, and the one-line reason. Keep these per-project rather than in the shared skills, so the shared skills stay general.

## Skill map

```
qnx-porting (this router)
├── qnx-platform-facts        platform truths, build-method-independent
├── alpine-qnx-porting        native APKBUILD adaptation (content mechanics)
├── qnx-apk-packaging         end-to-end port-to-PR workflow + validation gate
├── qnx-port-reporting        after-action REPORT.md per port
├── aports-patch-creation     patch workflow and format gate
├── github-fork-workflow      git / PR conventions, commit subjects, codelab PRs
└── qnx-driver-development     driver router
      ├── qnx-driver-char-serial
      ├── qnx-driver-i2c
      ├── qnx-driver-spi
      ├── qnx-driver-hid
      ├── qnx-driver-usb
      └── qnx-driver-sensor-camera
```

Project skills (epiphany-browser, webkit2gtk-port, gtk4-qnx-porting, and so on) are siblings to this tree and reference it.

## Cross-compile reference (legacy, not for native work)

The older cross-compilation path (SDP sourced on a Linux host, qcc/q++, CMake toolchain files, Meson cross files, sysroot/staging, the qnx-ports/build-files separate repo, the qnx-<tag> fork branch scheme, the check-tools JUnit XML harness) is documented separately as reference only. It is not part of native aports porting and should not be loaded as guidance for it. Reach for it only if a task explicitly requires the cross-compile workflow, and treat it as a distinct context.

