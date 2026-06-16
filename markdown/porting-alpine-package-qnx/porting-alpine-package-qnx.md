id: porting-alpine-package-qnx
title: Porting an Alpine Linux Package to QNX 8.0
summary: A step-by-step guide to porting an existing Alpine Linux package (APKBUILD) to the QNX aports repository, using gtk4 as the worked example
categories: qnx, alpine, porting
tags: intermediate
difficulty: 3
status: published
authors: Elliott Mazzuca
feedback_link: https://github.com/qnx/codelabs/issues

# Porting an Alpine Linux Package to QNX 8.0

## Introduction

The QNX aports repository is a fork of Alpine Linux's aports tree, adapted to build native QNX packages. Porting a package means taking an existing Alpine APKBUILD, adapting it for QNX, and submitting it as a pull request to the `qnx-ports/aports` repository.

This codelab walks through the full process using **gtk4** as the worked example: a medium-sized project with real dependencies, patches, and build configuration choices that are representative of most porting work.

**What you will learn:**

* How to find the correct upstream Alpine APKBUILD for a project
* How to update an APKBUILD for the QNX aports conventions
* How to identify and resolve dependency differences between Alpine and QNX
* How to create a QNX-specific patch when source changes are needed
* How to build and verify a package with `abuild`
* How to open a pull request to `qnx-ports/aports`

**Prerequisites:**

* A QNX 8.0 target with the QNX Developer Desktop (QEMU or physical hardware such as Raspberry Pi 5)
* A working `abuild` environment with your `~/.abuild/` keys configured
* A fork of `qnx-ports/aports` cloned on the target and set up for SSH push
* Familiarity with basic APKBUILD structure (variables, `build()`, `package()` functions)

> **Note:** All commands in this codelab are run directly on your QNX target. No Linux host or SDP installation is required.

---

## How it works — Overview

Alpine Linux maintains thousands of packages in their public aports tree. Each package lives in a folder under a category (e.g. `extra/gtk4/`) and consists of:

* An `APKBUILD` file: the build recipe (version, source URL, dependencies, build steps)
* Zero or more `.patch` files: source-level fixes applied before building
* Occasionally other files: init scripts, config files, desktop entries

The QNX porting workflow is:

1. Copy the Alpine APKBUILD (and patches) for the target package
2. Adapt the APKBUILD for QNX conventions
3. Resolve any dependency or build issues, adding patches if needed
4. Build and test with `abuild`
5. Open a pull request

---

## Step 1 — Find the upstream Alpine APKBUILD

Search for the package on Alpine's package index:

```
https://pkgs.alpinelinux.org/packages
```

Or search directly on the web:

```
alpine linux gtk4
```

Open the result that matches the package name. On the package page, find the **Git repository** link; this takes you to the APKBUILD source in the aports tree.

**Choose the correct branch.** Alpine maintains multiple stable branches (e.g. `3.21-stable`, `3.22-stable`). Use the **latest stable branch**, not `master` or `edge`. At time of writing, `3.23-stable` is current. Using a stable branch gives you a known-good build recipe rather than in-progress development changes.

For gtk4 the path is:

```
https://gitlab.alpinelinux.org/alpine/aports/-/tree/3.23-stable/extra/gtk4
```

---

## Step 2 — Copy the APKBUILD and patch files

In your aports clone on the QNX target, create the directory for the new package under the appropriate category. The rule is:

* If the package lives under `main` in the upstream Alpine aports tree, port it to `core` in QNX aports
* If the package lives under `community` in upstream Alpine, port it to `extra` in QNX aports

gtk4 is under `extra/` in Alpine (community), so:

```bash
mkdir -p ~/aports/extra/gtk4
cd ~/aports/extra/gtk4
```

Download the APKBUILD:

```bash
curl -O https://gitlab.alpinelinux.org/alpine/aports/-/raw/3.23-stable/extra/gtk4/APKBUILD
```

Check if there are any patch files in the same directory on GitLab. If there are, download each one:

```bash
curl -O https://gitlab.alpinelinux.org/alpine/aports/-/raw/3.23-stable/extra/gtk4/some-fix.patch
```

Do the same for any other supporting files (init scripts, `.desktop` entries, etc.).

---

## Step 3 — Update maintainer and contributor headers

Open the APKBUILD. Near the top you will see something like:

```sh
# Contributor: Rasmus Thomsen <oss@cogitri.dev>
# Maintainer: team/gnome <pabloyoyoista@postmarketos.org>
```

The Alpine maintainer is not maintaining this package in the QNX repo. Rename those fields to make that clear, and add yourself as the QNX maintainer:

```sh
# Alpine-Contributor: Rasmus Thomsen <oss@cogitri.dev>
# Alpine-Maintainer: team/gnome <pabloyoyoista@postmarketos.org>
# Maintainer: Your Name <you@qnx.com>
```

The `Alpine-` prefix preserves attribution while making it explicit who is responsible for the QNX port.

---

## Step 4 — Reset pkgrel to 0

Find the `pkgrel` variable near the top of the APKBUILD:

```sh
pkgrel=3
```

Reset it to `0`:

```sh
pkgrel=0
```

`pkgrel` is a revision counter that Alpine increments when they rebuild a package without changing the upstream version. For a fresh QNX port, the revision starts at zero. If you later need to rebuild without a version bump (e.g. to fix a QNX-specific patch), you increment it yourself.

---

## Step 5 — Audit and fix dependencies

Open the `depends=`, `makedepends=`, and `checkdepends=` sections. For each dependency, check whether a QNX port exists in `qnx-ports/aports` and whether the package name differs.

**The most common naming difference is Python packages.** Alpine uses `py3-` as the prefix:

```sh
makedepends="py3-cairo py3-gobject3"
```

QNX aports uses `python3-` as the prefix:

```sh
makedepends="python3-cairo python3-gobject3"
```

Search `qnx-ports/aports` for each dependency you are unsure about:

```bash
find ~/aports -name APKBUILD | xargs grep -l "pkgname=" | xargs grep "pkgname=python3-cairo"
```

If a dependency does not exist in QNX aports yet, you have two options:

* Port it first (recurse into this process for that package)
* Open your PR with a note that the dependency is a prerequisite

Do not leave missing dependencies silently. `abuild -r` will fail with a confusing error if a `makedepend` cannot be resolved.

---

## Step 6 — Make source changes (if needed) and create patches

If the package builds cleanly on QNX with no source changes, skip this step. Most medium-sized packages will need at least one QNX-specific fix: a missing platform detection, an unsupported syscall, a Linux-only code path. When that happens, create a proper patch rather than embedding `sed` commands in the APKBUILD.

### Development phase — test your changes first

Never create a patch from untested changes.

```bash
cd ~/aports/extra/gtk4
abuild clean
abuild unpack     # Extracts the tarball and applies existing patches
cd src/gtk-<version>/
```

Make your change directly in the source tree. Test it using the native build system, not `abuild`:

```bash
# For a Meson project like gtk4:
meson setup build
ninja -C build
```

Iterate until the change works. Only then move to patch creation.

> **Important:** Never run `abuild -r` while iterating on source changes. It wipes the `src/` directory and discards your work.

### Patch creation phase

Once your change is tested and working:

**1. Go back to the package directory and do a fresh unpack:**

```bash
cd ~/aports/extra/gtk4
abuild clean
abuild unpack
cd src/gtk-<version>/
```

**2. Back up the file you are modifying:**

```bash
cp path/to/file.c path/to/file.c.orig
```

**3. Apply your change:**

```bash
vi path/to/file.c
```

**4. Generate the diff:**

```bash
# Run from inside src/gtk-<version>/
diff -u path/to/file.c.orig path/to/file.c > ../../001-fix-qnx-platform-detection.patch
```

**5. Fix the patch header format.** The `diff` command produces paths like:

```diff
--- ./path/to/file.c.orig
+++ ./path/to/file.c
```

Alpine (and QNX aports) requires:

```diff
--- a/path/to/file.c
+++ b/path/to/file.c
```

Edit the patch file manually to:
- Replace `--- ./path/to/file.c.orig` with `--- a/path/to/file.c`
- Replace `+++ ./path/to/file.c` with `+++ b/path/to/file.c`

**6. Add the patch to the `source=` list in the APKBUILD:**

```sh
source="https://download.gnome.org/sources/gtk/$_major/gtk-$pkgver.tar.xz
    001-fix-qnx-platform-detection.patch
    "
```

**7. Update checksums:**

```bash
cd ~/aports/extra/gtk4
abuild checksum
```

### Patch naming convention

Patches follow the format `NNN-descriptive-kebab-case-name.patch`:

* `NNN` is a zero-padded sequential number: `001`, `002`, `003`
* The name describes what the patch does, not which file it touches

Good examples:
- `001-fix-qnx-processor-detection.patch`
- `002-disable-linux-only-meminfo.patch`
- `003-add-qnx-wayland-backend.patch`

Bad examples:
- `fix.patch` (no number, not descriptive)
- `001_QNX_Fix.patch` (underscores, wrong case)
- `qnx-processor.patch` (no number)

### Multiple files, one logical change

If a single bug fix touches more than one file, put all the changes in one patch. If the changes are logically independent, use separate patches, one per concern.

---

## Step 7 — Build and verify

With the APKBUILD updated and any patches in place, do a full build:

```bash
cd ~/aports/extra/gtk4
abuild -r -c -K
```

Flag reference:
- `-r`: recursive, installs missing dependencies automatically
- `-c`: do not clean up on failure (lets you inspect the build directory)
- `-K`: keep the `src/` directory after a successful build

Watch the output for errors. Common failure categories and what to look for:

| Failure | Likely cause |
| :--- | :--- |
| `ERROR: unable to select packages` | A dependency is missing from QNX aports |
| `error: unknown type name '__s32'` or similar | Linux kernel header type; needs a QNX patch |
| `meson.build: ERROR: Dependency X not found` | Missing makedepend or wrong package name |
| `FAILED: src/...` with no obvious error | Check a few lines above; Meson/CMake errors scroll past |

If all tests pass and the build succeeds, install the resulting `.apk` to verify it loads correctly:

```bash
sudo apk add --allow-untrusted ~/packages/extra/x86_64/gtk4-<version>-r0.x86_64.apk
```

---

## Step 8 — Open a pull request

With a working build, push your branch and open a PR against `qnx-ports/aports`.

```bash
cd ~/aports
git checkout -b port/gtk4
git add extra/gtk4/
git commit -m "extra/gtk4: new port from Alpine 3.23-stable"
git push origin port/gtk4
```

Then open a pull request on GitHub from your fork to `qnx-ports/aports` (this can be done from any browser). In the PR description include:

* The upstream Alpine branch you based the port on (e.g. `3.23-stable`)
* A brief summary of any QNX-specific changes (patches, dependency renames, skipped subpackages)
* Confirmation that `abuild -r` completed successfully and tests passed

---

## Summary

You have ported an Alpine Linux package to QNX 8.0. The key points to carry forward:

* Always use the latest **stable** Alpine branch, not `master` or `edge`
* Reset `pkgrel` to `0`; it is a QNX-relative counter from here on
* Rename Alpine maintainers to `Alpine-Maintainer` / `Alpine-Contributor` and add your own `# Maintainer:` line
* Python packages use `python3-` in QNX aports, not `py3-`
* Test source changes with native build tools before creating any patch; never use `abuild -r` during development
* Patch headers must use `a/` and `b/` prefixes, not `./` and `.orig`
* One patch per logical change; name them `NNN-descriptive-kebab-case.patch`


