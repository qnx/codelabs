---
name: qnx-apk-packaging
description: "End-to-end workflow for turning a QNX 8.0 port into a reviewable, standalone APK package. Read when taking a package from working build to PR-ready: establishing the version baseline, cleaning up APKBUILD metadata, local repo resolution on the target, building and inspecting subpackages, running upstream tests, the review-reduction pass, and the commit/PR split. Complements alpine-qnx-porting (APKBUILD content mechanics) and aports-patch-creation (patch mechanics). Read qnx-porting first."
---

# QNX APK Packaging Workflow

The process for turning a port into a clean, standalone, reviewable QNX APK package. This is the "what is the end-to-end process" skill. For APKBUILD content mechanics (dependency renames, pkgrel, Vala) see `alpine-qnx-porting`; for patch creation see `aports-patch-creation`. This skill assumes the native aports build method (build on the QNX target with abuild).

Each package gets its own project notes under `projects/apks/<pkgname>/` and its own aport review, unless the change is only a consumer dependency update.

## The workflow

### 1. Identify package ownership
Check the authoritative aports tree under its `core/` and `extra/` directories (the exact tree path is target-specific and is recorded in TARGET.md). Check `apk search <pkgname>` and `apk info -W <file>` for installed ownership. Decide which case this is: existing-package cleanup, new Alpine-derived aport, QNX platform package, or host-only validation tooling. The case determines everything downstream.

### 2. Establish the source baseline
Prefer an existing Alpine aport when one exists. Start from the latest stable upstream/Alpine version whenever possible. Do not keep an older imported version just because it was the first that built. If the latest stable fails and the port must pin or downgrade, document the failing version, why the older one is required, and what must change to move forward again. Preserve upstream source URLs. Preserve inherited Alpine APKBUILD logic (existing `prepare()`, `sed`, generated files, package conventions) unless that exact logic causes the QNX problem. New QNX source edits go in patch files, not new sed (see aports-patch-creation and the alpine-qnx-porting source-modification rule).

**Where the source comes from.** The aports tree is a fork of `qnx-ports/aports` (remote `git@github.com:<your-github-username>/aports.git`), organized into `core` and `extra` (roughly Alpine `main` to `core`, and `community`/`testing` to `extra`). To start or update a port, take the package's Alpine aport as the reference (the upstream Alpine source is `https://gitlab.alpinelinux.org/alpine/aports`, under `main/<pkg>` or `community/<pkg>`) and place or update the package directory under the matching `core/` or `extra/` path in the QNX tree. The APKBUILD's `source=` line already points at the upstream release tarball (for example `source="$pkgname-$pkgver.tar.gz::https://github.com/.../$pkgver.tar.gz"`); `abuild` downloads it on first build and caches it under `/var/cache/distfiles`, so the actual upstream code is pulled by the build, not copied by hand. Verify the live tree layout and remotes on the target rather than assuming.

### 3. Clean up APKBUILD metadata
Verify `pkgdesc`, `url`, `arch`, `license`, `options`, `subpackages`, `depends`, `depends_dev`, `makedepends`, `checkdepends`. Confirm QNX runtime dependencies explicitly when APK metadata does not infer them reliably. For every APKBUILD deviation from the original Alpine aport, document it in the package notes, and add a short comment beside the changed line when it helps a reviewer. A deviation comment states: what changed, why QNX needs it, why this solution was chosen, and what warning/build failure/runtime issue/ownership problem it resolves. Prefer a nearby comment specifically for: CMake flags, dependency variables, architecture restrictions, disabled features, and package-split changes not present in Alpine, since those affect review and package semantics directly. Keep comments factual and tied to specific QNX/toolchain behavior.

**Comment content rules for QNX-specific changes.** A QNX-specific code comment states what the code does, why QNX needs different behavior, and the impact (if a feature is disabled or performance reduced, say so explicitly). Do not: write "under investigation" or future-tense omission comments ("add X back when Y is ready"); explain what is NOT in a list; put PR-reply justifications in code comments; or use threading jargon (`std::promise`, future exception state) where plain language works. Do not comment repo-wide conventions like LTO or `-Qunused-arguments` (see alpine-qnx-porting).

### 4. Validate source and checksums
Run `abuild checksum`. Confirm the tarball license and any patch checksums. Never commit generated `src/`, `pkg/`, or `tmp/` directories.

### 5. Configure local repo resolution on the target
Put local package output paths before remote repositories in `/etc/apk/repositories`, for example:

```text
/var/home/qnx/packages/core
/var/home/qnx/packages/extra
```

Use whichever local paths actually exist for the target image. Run `sudo apk update`. Confirm `apk search <pkgname>` and `apk policy <pkgname>` resolve the local package before relying on it as a dependency of the next package in a chain.

**How the local repo is created.** You do not build the index by hand. A successful `abuild -r` writes the package and its subpackages to the package output directory (for example `/var/home/qnx/packages/extra/x86_64`) and regenerates and signs `APKINDEX.tar.gz` there with the abuild packager key (`PACKAGER_PRIVKEY` in `~/.abuild/abuild.conf`). That signed index is what makes the directory a usable apk repository. Listing it in `/etc/apk/repositories` (local paths first) plus `sudo apk update` is all the next package in a chain needs to resolve it.

### 6. Build and inspect
Run a clean `abuild -r -c -K`. Inspect the generated APK names and subpackages. Use `apk info -L` and `apk info -W` to confirm file ownership. As a structural check, `find pkg -name '*.so*' | sort` confirms the subpackage split is correct and nothing is orphaned.

**If `abuild -r` fails at `builddeps failed`, suspect the apk environment before the package.** apk validates the entire installed world on every transaction, so a single conflicting or broken installed package makes `apk add` (and therefore abuild's make-dependency install) fail for EVERY package, often with only an opaque `1 error`. Diagnose with `apk fix 2>&1 | grep -i error` to surface the real conflict (for example a file owned by two packages, or an index fetch returning non-zero). Common causes: a leftover test install that conflicts with a base package over a shared file; a repository in `/etc/apk/repositories` that returns an HTTP error on index update; and orphaned `.makedepends-*` virtual packages left behind by interrupted builds (safe to remove with `apk del $(apk info | grep makedepends)`). Fix the environment, confirm `apk add --simulate <a-dep>` returns OK, then rebuild. Target-specific instances of these belong in TARGET.md.

### 7. Test package function
Enable and run upstream tests where practical. Do not disable an entire suite by default just because some tests are expected to fail. If a suite must be disabled globally, document the specific blocker, the attempted command, and why selective skips are not enough. If individual tests are skipped, list each with its observed failure mode or external dependency. Prefer a small direct smoke test of the package itself, and validate at least one real consumer when the package is a dependency-chain component.

Before disabling a test, separate environment failures from real defects. A whole suite failing identically is usually the harness, not the code: for example a test script that calls `cmp` fails with `cmp: command not found` because the image's busybox lacks that applet, fixed by `checkdepends="diffutils"`, not by skipping. (Some missing tools have no package to add: this image's busybox also lacks `killall`, and `psmisc` is not packaged, so a harness calling `killall` cannot be satisfied with a checkdep; record such cases in TARGET.md.) Once the harness runs, a single test that still fails on QNX (json-c's `test_json_patch` segfaulted on a negative array-index `json_patch` case while the other 24 passed) is a documented selective skip via `ctest ... -E '^name$'` with a comment stating the observed failure mode, plus a note in the package project README to follow up. Do not skip the suite to hide a real per-platform defect.

**Timing-sensitive tests under QEMU.** A tight-margin timeout test (for example libmodbus's "7ms > 5ms byte timeout", a 2ms margin) can fail consistently under QEMU loopback and scheduling jitter while the logic is correct (the matching negative case passes). Treat this as an open root-cause item (QEMU timing vs real QNX behaviour: re-run on hardware or instrument the timing), not an automatic skip. Do not patch out or skip it as if it were a defect until the cause is confirmed.

**Monolithic test binaries.** When the suite is a single binary or one shell script with no `ctest -E` equivalent, a single failing assertion cannot be selectively skipped without patching the test source. Patching out a failure whose root cause is unconfirmed could hide a real defect, so the correct move is to disable the suite (`options="!check"`), document both the blocker and the unconfirmed cause in the report and README, and flag it as a follow-up before merge. Disabling-with-documentation is honest; patching-out-unconfirmed is not.

### 8. Document the review
In the package project README, record goals, package origin, changes made and why, validation commands and results, remaining risk, and next steps. Keep a changelog entry for every APKBUILD update, patch add/remove, helper-script addition, dependency change, and package-split decision. Each entry answers: what changed, why, what solution was chosen, and how it resolves the problem. Treat every APKBUILD deviation from Alpine as a documented porting decision, not an incidental edit. If this package unblocks another, link both project notes.

### 9. Review-reduction pass (before staging)
This pass is what makes a port reviewable. Remove: unrelated architecture fixes, unused feature flags, local debugging helpers, cross-compilation files in self-hosted ports, and investigation code not required by an observed QNX failure. Consolidate patches that touch the same source area when it makes the reason clearer and does not hide separate decisions. For each remaining patch hunk, be able to point to the exact compile error, link failure, runtime failure, test failure, or package warning it resolves. Prefer positive QNX conditionals such as `#elif defined(__QNX__)` when the source already has platform branches. Do not keep no-op CMake flags or dependency edits that were only tried during investigation.

### 10. Prepare the review split
Keep one package per review unless a dependency chain requires a tightly coupled version bump. Submit dependency packages before consumer packages. Commit subject style: `<repo>/<pkgname>: new aport` for new aports, `<repo>/<pkgname>: enable/fix build on QNX` for existing ones.

## The validation gate (must pass before reporting work complete)

```bash
abuild clean && abuild unpack          # patches apply, no Hunk FAILED, no .rej
abuild -r -c -K                        # builds, tests pass, expected APKs produced
find pkg -name '*.so*' | sort          # subpackage split correct, nothing orphaned
git status                             # only intended files modified
```

This gate is the human's check. A local agent can run the commands, but the judgment to proceed is the driver's.

