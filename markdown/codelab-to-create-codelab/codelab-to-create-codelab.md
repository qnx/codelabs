id: qnx-oss-self-hosted-contribution-guidelines
title: Contributing Self-Hosted Open-Source Packages to QNX OSS
summary: The requirements, best practices and submission workflow for contributing APKBUILD packages to qnx-ports for publication on oss.qnx.com.
categories: Contributing, Porting & Open Source
tags: beginner
published: 2026-11-23
status: published
authors: Shweta Mazumder
feedback_link: https://github.com/qnx/codelabs/issues


# Contributing Self-Hosted Open-Source Packages to QNX OSS

## Welcome
Duration: 3:00

### Overview

QNX Software Systems maintains a public open-source software (OSS) repository and package server ([oss.qnx.com](https://oss.qnx.com)) built around the Alpine Package Keeper (`apk`) format.

This codelab sets out the official requirements and recommendations for contributing self-hosted open-source software packages to [github.com/qnx-ports](https://github.com/qnx-ports) for inclusion in oss.qnx.com.

| | |
|---|---|
| **Target Repository** | [github.com/qnx-ports](https://github.com/qnx-ports) |
| **Package Server** | [oss.qnx.com](https://oss.qnx.com) |
| **Package Format** | Alpine Package Keeper (APK) via `APKBUILD` |
| **Document Status** | Approved Guidelines (v1.2) |

### Guiding principles

- **Upstreaming QNX code:** Contributors upstream the code that makes the tool work on QNX into their own open-source repo. The QNX team does not do the port to QNX.
- **APK build instructions:** Once porting is finished, contributors open a PR with the QNX build instructions for the tool in [qnx-ports/aports](https://github.com/qnx-ports/aports). This is where we keep APK build instructions for all ports where we have not forked the open-source repo (that is, where the src in the OSS portal is GitHub).
- **Publishing in the OSS portal:** The QNX team reviews the PR submitted to [qnx-ports/aports](https://github.com/qnx-ports/aports). Once it is accepted, we publish the APK through our package server and make the source code available on [oss.qnx.com](https://oss.qnx.com/), where the src column lists the contributor's name and their project repo logo.

### What you'll learn

- The requirements every submitted package must meet
- How to version a package with `$pkgver` and `$pkgrel`
- How to write a `check()` step that produces JUnit XML results
- Packaging best practices for patches, paths and subpackages
- The end-to-end submission workflow

### What you'll need

- A QNX Self-Hosted Distribution target (hardware or VM)
- A public GitHub repository containing your QNX port, with tagged releases
- Familiarity with the basic `APKBUILD` structure

---

## Requirements at a Glance
Duration: 2:00

| # | Requirement | Description | Deliverable / Evidence |
|---|---|---|---|
| 1 | Target Runtime & Distro | Software must compile, link, install, and run natively on the QNX Self-Hosted Distribution. | Verified build log and runtime execution on target hardware/VM. |
| 2 | Source Repo & Tagging | QNX source code must be in a public GitHub repo with formal Git release tags (SemVer preferred). | Immutable Git release tag URL (e.g. `v1.2.3`). |
| 3 | APK Versioning | Must adhere to Alpine `$pkgver` and `$pkgrel` version revision rules. | Valid `$pkgver` and `$pkgrel` fields in `APKBUILD`. |
| 4 | Packaging Recipe | Packaging instructions must be provided as an `APKBUILD` script submitted via Pull Request. | PR against [qnx-ports/aports](https://github.com/qnx-ports/aports) with `APKBUILD` + patches. |
| 5 | AI & Human Accountability | `APKBUILD` and patches must be human-authored/reviewed; maintainer must be identified by name/email. | `# Maintainer: Name <email>` header and human review assurance. |
| 6 | FOSS & Dependency Audit | Submitter is responsible for auditing licenses (SPDX) and all build/runtime dependencies. | Audited `$license`, `$depends`, and `$makedepends` in `APKBUILD`. |
| 7 | Automated Testing | `check()` function must execute unit tests and emit results in JUnit XML format. | JUnit XML test report output path inside `check()`. |

The following steps cover each requirement in detail.

---

## Target Platform and Distro Compatibility
Duration: 2:00

### QNX self-hosted execution

- The application or library must compile, install, and execute natively on the QNX Self-Hosted Distribution.
- Contributors are responsible for resolving POSIX differences, memory management constraints, stack size defaults, and dynamic library linking behavior specific to QNX OS before submission.

### Architecture support

- Packages must be validated for all target architectures supported by the QNX release (e.g., `x86_64`, `aarch64le`), except in special cases such as firmware for specific aarch64 devices.

---

## Source Repository and Release Tagging
Duration: 2:00

### Public repository

- Contributors must host their QNX-modified source code in a publicly accessible GitHub repository (e.g., `github.com/<partner>/<project>-qnx`).

### Mandatory release tagging

- Upstream repositories must use a formal Git release tagging system. Downloading source archives from floating branch tips (`main`, `master`) or untagged commit hashes is strictly prohibited.
- Semantic Versioning (SemVer) format (`vMAJOR.MINOR.PATCH`, e.g., `v1.2.3`) is strongly preferred.
- Release tags must generate immutable tarball/zip source archives to guarantee reproducible builds and stable checksums.

### Upstream first policy

- Contributors are encouraged to submit QNX-specific porting fixes back to the original upstream project repositories whenever possible.

---

## APK Versioning with $pkgver and $pkgrel
Duration: 3:00

Packages submitted to `qnx-ports` must strictly follow Alpine Package Keeper (`apk`) versioning rules.

### Package version (`$pkgver`)

- `$pkgver` must match the upstream release tag version, omitting any leading `v` (e.g. `pkgver="1.2.3"` for tag `v1.2.3`).
- Pre-release and patch-level suffixes must follow Alpine syntax:
  - Pre-releases: `_alpha`, `_beta`, `_pre`, `_rc` (e.g., `1.2.3_rc1`).
  - Patch levels: `_p` (e.g., `1.2.3_p2`).

### Package revision (`$pkgrel`)

`$pkgrel` tracks package build revisions for the same upstream version (`$pkgver`).

- **Initial release:** `pkgrel=0` when a new `$pkgver` is introduced.
- **QNX maintenance revisions:** Whenever the `APKBUILD` changes without an upstream version bump (adding QNX patches, altering compiler flags, fixing dependencies, or rebuilding against updated shared libraries), increment `$pkgrel` by 1 (`pkgrel=1`, `pkgrel=2`).
- **Upstream version bump:** When upgrading to a new upstream release (`pkgver="1.2.4"`), `$pkgrel` resets to `0`.

---

## AI-Generated Code and Human Accountability
Duration: 2:00

### Third-party upstream code

- QNX accepts that upstream or third-party repository code may include AI-generated or AI-assisted content, provided all open-source licensing, copyright, and patent obligations are met.

### Human packaging ownership

- All `APKBUILD` packaging scripts, build options, environment configurations, and accompanying patch files must be explicitly authored or reviewed by a human.
- The submitter must fully understand all build steps, configuration flags, and runtime implications. Bot-generated or unverified automated submissions will be rejected.

### Named human maintainer

Every `APKBUILD` must identify a responsible human maintainer at the top of the file:

```bash
# Maintainer: Firstname Lastname <email@example.com>
```

If the `APKBUILD` is based on a package from another distribution, it must also say so:

```bash
# Alpine-Maintainer: Firstname Lastname <email@example.com>
```

---

## License Disclosure and Dependency Audit
Duration: 2:00

### FOSS license audit

- The submitter is solely responsible for auditing all licenses in play across the codebase and bundled sub-components.
- The `$license` variable in `APKBUILD` must use standard [SPDX License Identifiers](https://spdx.org/licenses/) (e.g., `MIT`, `Apache-2.0`, `GPL-2.0-or-later WITH Classpath-exception-2.0`).
- License and copyright files must be installed to `/usr/share/licenses/$pkgname/` during `package()`.

### Dependency disclosure

- The submitter must audit and list all direct build-time dependencies (`$makedepends`) and runtime dependencies (`$depends`).
- All declared dependencies must already exist on oss.qnx.com or be submitted as prerequisite package PRs.

---

## Automated Testing and JUnit XML Reporting
Duration: 3:00

### Mandatory check() step

The `check()` function in `APKBUILD` must run the project's test suite.

<aside>
    <strong>NOTE:</strong> Disabling checks with <code>options="!check"</code> is not allowed without explicit OSPO exception approval.
</aside>

### JUnit XML output

- Tests run inside `check()` must export their results in JUnit XML format.
- Write results to a standardized path (e.g. `${builddir}/test-results/junit-*.xml`) so the QNX CI build servers can collect them.

### Integration examples

CMake / CTest:

```bash
ctest --output-on-failure --output-junit ${builddir}/test-results/junit-ctest.xml
```

GoogleTest:

```bash
./test_runner --gtest_output=xml:${builddir}/test-results/junit-gtest.xml
```

PyTest:

```bash
pytest --junitxml=${builddir}/test-results/junit-pytest.xml
```

Cargo (Rust):

```bash
cargo nextest run --reporter junit --junit-path ${builddir}/test-results/junit-cargo.xml
```

---

## Packaging Best Practices
Duration: 3:00

To keep the repository consistent, follow these best practices, which are drawn from major Linux distribution standards (Alpine Linux, Fedora, Debian, Nixpkgs).

### Supply chain security and integrity

- **DCO sign-off:** Commits in pull requests must include a Developer Certificate of Origin sign-off (`git commit -s`, `Signed-off-by: Real Name <email>`).
- **Immutable downloads:** Declare all sources in the `$source` section with checksum verification (`sha512sums`). Downloading source manually anywhere else in the `APKBUILD` is strongly discouraged. Some build systems must download from the internet during the build (for example, `cargo` for Rust); in that case, a lock file for the build tool must be in place so the build cannot pull in unwanted libraries.

### Patch management hygiene

- **Atomic patches:** Split fixes into granular patch files rather than one monolithic patch.
- **DEP-3 patch headers:** Include a patch description, author, and upstream tracking status:

```text
From: Jane Developer <jane.developer@example.com>
Subject: [PATCH] Fix POSIX pthread_setname_np signature on QNX OS
Upstream-Status: Submitted [https://github.com/upstream/project/pull/42]
---
```

### Package lifecycle and SLA

- **Security SLA:** Maintainers agree to respond to build failures or CVE security issues within 14 calendar days. Unmaintained packages may be flagged as orphaned or removed from oss.qnx.com.

### File system and subpackage conventions

- **Standard paths (FHS):** Install files into `/usr/bin`, `/usr/lib`, `/usr/include` and `/usr/share`. Never hardcode `/usr/local`.
- **Development and doc subpackages:** Split development headers into `$pkgname-dev` and documentation into `$pkgname-doc` using Alpine's `$subpackages` feature.

---

## Submission Workflow
Duration: 2:00

1. Port the app on the QNX Self-Hosted Distribution.
2. Tag a release in your public repo using SemVer (e.g. `v1.2.3`).
3. Write the `APKBUILD` yourself, with `pkgver=1.2.3` and `pkgrel=0`.
4. Audit licenses and declare the full dependency tree.
5. Implement `check()` with JUnit XML output, and add the maintainer header.
6. Submit a DCO-signed pull request to [github.com/qnx-ports](https://github.com/qnx-ports).
7. QNX CI runs the `APKBUILD` and parses the JUnit XML results:
   - **Tests pass and audit is clean:** the `.apk` package is built and published to oss.qnx.com.
   - **Tests fail or rules are violated:** PR feedback is sent to the maintainer for fixes.

---

## APKBUILD Reference Template
Duration: 3:00

Use this template as a starting point for your `APKBUILD`:

```bash
# Maintainer: Jane Developer <jane.developer@example.com>
# Contributor: John Co-Maintainer <john.smith@example.com>
# Alpine-Maintainer: Joe Doe <joe.doe@example.com>

pkgname="example-lib"
pkgver="1.2.3"
pkgrel=0
pkgdesc="Example open source library ported to QNX"
url="https://github.com/example/example-lib"
arch="x86_64 aarch64"
license="MIT AND Apache-2.0"
depends="qnx-base-libs zlib"
makedepends="cmake ninja googletest-dev zlib-dev"
source="https://github.com/partner-org/example-lib-qnx/archive/refs/tags/v${pkgver}.tar.gz
        0001-fix-posix-pthread-qnx.patch"
subpackages="$pkgname-dev $pkgname-doc"

build() {
    cmake -B build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr \
        -DBUILD_TESTING=ON
    cmake --build build
}

check() {
    cd "$builddir"/build
    mkdir -p "${builddir}/test-results"

    # Run unit tests and emit JUnit XML results for QNX CI server
    ctest --output-on-failure --output-junit "${builddir}/test-results/junit-results.xml"
}

package() {
    DESTDIR="$pkgdir" cmake --install build

    # Install license file into standard location
    install -Dm644 "$builddir/LICENSE" "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}

sha512sums="
a1b2c3d4e5f67890...  v1.2.3.tar.gz
f6e5d4c3b2a10987...  0001-fix-posix-pthread-qnx.patch
"
```

---
