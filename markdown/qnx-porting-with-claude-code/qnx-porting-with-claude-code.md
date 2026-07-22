id: qnx-porting-with-claude-code
title: Porting Alpine Packages to QNX 8.0 with Claude Code
summary: Set up a Claude Code workspace with a structured skill hierarchy, point it at a QNX 8.0 target, and have it port Alpine Linux packages for you with a single instruction
categories: qnx, alpine, porting, ai, claude-code
tags: intermediate
difficulty: 3
status: published
authors: Elliott Mazzuca
feedback_link: https://github.com/qnx/codelabs/issues

# Porting Alpine Packages to QNX 8.0 with Claude Code

## Introduction

This codelab sets up a Claude Code workspace that ports Alpine Linux packages to QNX 8.0 for you. Once it is set up, you hand it a package name and it does the work: it pulls the Alpine recipe, builds it on a QNX target, works through the QNX-specific problems, and reports back what it produced.

The work is native. Packages are built on a QNX target with Alpine's `abuild`, compiled by the target's own toolchain rather than cross-compiled from the host. Claude Code runs on your machine and reaches the target over SSH. (See the Scope note below for how this differs from the SDP cross-compile path.)

What makes this work is the workspace itself. Claude Code reads a small set of skill files and two bootstrap documents, so it starts every session already knowing the porting rules, how to reach your target, and everything it has learned from past ports. This codelab is about setting that workspace up and running it. It does not teach you to port packages by hand; the system does that part.

**What you will learn:**

* How the workspace is laid out and what each piece does
* How to point it at a QNX 8.0 target (QEMU, a Raspberry Pi, or any QNX target)
* How the skill system lets Claude Code drive a port from a single instruction
* What the system does under the hood when you give it a package
* How the workspace improves itself as it is used

**Prerequisites:**

* A Linux host with [Claude Code](https://www.anthropic.com/claude-code) installed
* Non-interactive SSH access to the target. Key-based authentication is recommended (the agent needs to connect without a password prompt). For a password-only target, `sshpass` works as a fallback.
* A reachable QNX 8.0 target you can SSH into
* A GitHub account with access to your aports fork

> **Scope:** This is the self-hosted native porting path: the build runs on the QNX target, not cross-compiled from the host with `qcc`/`q++` and toolchain files. (The QNX SDP is still used on the host to launch a QEMU target in Step 3; it just isn't used to build the package.) The host-side cross-compile workflow is a different path and is out of scope here.

---

## Step 1 - The mental model

Get the model straight first, because it shapes everything else.

Porting here is native. You take an Alpine package recipe (an APKBUILD), and it is built on a QNX target by the target's own compiler, headers, and libraries. There is no host toolchain in the build at all. This is simpler than cross-compiling: one tree, one toolchain, no sysroot.

Claude Code runs on your Linux machine. It reaches the QNX target over SSH to do the actual building. The commands it runs happen on the target over that SSH connection. You do not run the porting commands yourself; Claude Code does, guided by its skills. Your job is to set the workspace up, point it at a target, and give it a package.

---

## Step 2 - Lay down the workspace

The setup files live alongside this codelab in the repository, in the `qnx-claude-setup/` directory. You can browse them there to see exactly what the workspace contains. To use them, copy that directory's contents into a working directory on your host so that `CLAUDE.md` and the `.claude/` directory sit at the top level:

```bash
mkdir -p ~/claude
cp -r path/to/qnx-claude-setup/. ~/claude/
cd ~/claude
```

The pieces:

| File or directory | Purpose |
| :--- | :--- |
| **`CLAUDE.md`** | Session bootstrap. Claude Code reads it first, automatically. Holds the universal rules and the skill map. |
| **`TARGET.md`** | Your target: how to connect, the authoritative tree path, and a running log of target-specific facts. You edit this. |
| **`.claude/skills/`** | The skill hierarchy. Claude Code loads these on demand to do the porting work. |
| **`projects/apks/`** | Where Claude Code keeps its per-port notes and reports, one folder per package. |
| **`run.sh`** | Optional QEMU launcher template, for the bring-your-own-image case (an alternative to QSTI). |
| **`settings.template.json`** | Optional. Pre-approves the commands the workflow uses, so Claude Code prompts less. |

Claude Code reads `CLAUDE.md` automatically when it opens in this directory, so the rules and skill map are loaded from the first message of every session.

---

## Step 3 - Provide a QNX target

You need a reachable QNX 8.0 target that you can SSH into, with the self-build tooling on it. Claude Code does not care what the target is, a QEMU virtual machine or a Raspberry Pi, as long as it can connect over SSH and build there.

The simplest way to get one is the official Quick Start Target Image (QSTI). The [QSTI for QEMU guide](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/about.html) walks through getting a free non-commercial license, installing the image through the QNX Software Center, and launching it. In short, once the image is unpacked and your SDP environment is sourced, you launch it with:

```bash
mkqnximage --run
```

and find its IP address from another terminal in the same runtime folder with:

```bash
mkqnximage --getip
```

QSTI is also available for [Raspberry Pi](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti/intro.html) if you want to run on hardware. Either way, once the target is up and you have its IP, you have everything you need for the next step.

> If you already have your own QNX 8.0 disk image for QEMU, the bundle includes a `run.sh` QEMU launcher template that you can edit and customize instead; see its header comments and `TARGET.md`.

> If you already have a QNX target running (an existing image, a Pi on your network), you can skip straight to Step 4 and just record its connection details.

---

## Step 4 - Connect Claude Code to the target

Tell the workspace how to reach your target by editing `TARGET.md`. It holds the SSH details, the authentication method, and the one authoritative aports tree path on the target. Claude Code reads it at the start of every session, so this is how it knows where and how to build.

Confirm you can reach the target yourself first. The login user depends on the image (the QSTI images use `qnxuser`, other images may use a different account). Claude Code needs to connect without an interactive password prompt, so set up key-based authentication: copy your public key to the target (for example with `ssh-copy-id <user>@<target-ip>`, if available) so the connection needs no password:

```bash
ssh <user>@<target-ip> 'uname -a'
```

If your target only supports password authentication, `sshpass` works as a fallback to feed the password non-interactively (note that `sshpass` is a workaround; prefer keys where you can):

```bash
sshpass -p <password> ssh <user>@<target-ip> 'uname -a'
```

If your setup reaches the target through a forwarded port rather than its own IP (a hand-rolled QEMU launcher, for example), add `-p <port>` to the ssh command. QSTI targets have their own IP, so no port is needed.

> **About authentication:** Key-based SSH is the recommended approach, especially for anything shared or networked. A shared password on a throwaway local target is acceptable for that case only. `TARGET.md` is where you record whichever method your target uses.

That is the whole setup. You do not need to pre-configure permissions: when you give Claude Code a task it will work through it and ask before running anything it does not yet have permission for. If you would rather it prompt less, you can pre-approve the common commands by merging `settings.template.json` into your `~/.claude/settings.json`, but this is optional and you can always do it later.

---

## Step 5 - How the skill system works

This is the heart of the workspace, and the reason a single instruction is enough to drive a port.

The skills live under `.claude/skills/` as plain markdown files, each describing when it applies. They are arranged as a hierarchy: a router that Claude Code reads first, which points to focused skills for each kind of task.

```
qnx-porting (router, read first)
├── qnx-platform-facts        QNX platform truths (libc gaps, stack, macros)
├── alpine-qnx-porting        APKBUILD adaptation, per build system
├── qnx-apk-packaging         the end-to-end port-to-package workflow
├── qnx-port-reporting        the per-port report written after a port
├── aports-patch-creation     how QNX patches are made and verified
├── github-fork-workflow      git and PR conventions
└── qnx-driver-development     driver porting (char, i2c, spi, hid, usb, sensor)
```

The router holds a small set of universal rules that apply to every task, no matter which skill is active. The most important ones:

* **Prove claims with command output.** Claude Code does not assert that something works without the command that shows it.
* **Never patch an untested change.** A source change is tested first, then turned into a patch.
* **The human runs git.** Claude Code builds and prepares the change; you handle commits and pushes.
* **Capture what it learns.** When Claude Code hits and solves a problem, it records the fact back into the right skill or into `TARGET.md`, so the next port starts ahead of this one.

That last rule is why the workspace gets better with use. The skills are not a fixed manual; they are a memory the system extends as it works. More on that in Step 8.

The focused skills carry the actual knowledge: `qnx-platform-facts` is the catalogue of QNX-specific gotchas (the C library has no sockets or regex, the default stack is small, `uname -m` reports `x86pc`, and so on); `alpine-qnx-porting` covers adapting the APKBUILD for QNX across different build systems; `qnx-apk-packaging` covers building and validating the package; `aports-patch-creation` covers making source patches the QNX way; `qnx-port-reporting` covers the report it writes at the end. You do not need to read these to use the system. They are how Claude Code knows what to do.

---

## Step 6 - Give it a package to port

With the workspace set up and a target connected, you start a port with a single instruction. Open Claude Code in the workspace directory and tell it what to port, for example:

> Port `json-c` to QNX.

From there it works on its own. Under the hood, guided by its skills, it runs a flow like this:

1. **Find the recipe.** It locates the package on the Alpine aports tree and identifies the right version and repository (`core` or `extra`).
2. **Place it in the tree.** It puts the recipe in the authoritative aports tree on the target and adapts the APKBUILD for QNX conventions.
3. **Build on the target.** It builds the package on the target, pulling the upstream source and dependencies as needed.
4. **Work through QNX problems.** When the build hits a QNX-specific wall, it consults its skills, applies the fix, and if a source change is needed it makes a tested patch the QNX way.
5. **Validate.** It runs the full build clean, confirms the expected packages and subpackages were produced, and runs the tests.
6. **Write the report.** It writes up the port (covered in the next step).

What it actually does in step 4 depends on the package, and that is the point. One package needs only a few `build()` flag changes; another needs a source patch; another needs a test handled and documented. The system adapts to what the package in front of it requires, rather than following a fixed script. You watch it work and review the result. Because the universal rules keep it honest (prove claims, test before patching), what it reports is backed by real build output, not assertion.

> **A note on git:** The system stops before committing. Preparing the branch, opening a pull request, and the review conventions are deliberately left to you, and are outside the scope of this codelab. The skills know to hand off at that boundary.

---

## Step 7 - Read the report

When a port finishes (or stops at a blocker), Claude Code writes a report to that package's folder under `projects/apks/<package>/`. This is the thing you read to review the port, instead of scrolling back through the whole session.

The report is structured so you can read it top to bottom: a summary and status, the packages it produced, the changes it made (each with what changed and why), the problems it hit and how it resolved them, the validation results, and any open items. A clean port looks something like this:

```
# json-c Port Report

- Package: json-c 0.18
- Repo: extra
- Target: x86_64 QNX 8.0 QEMU
- Status: built and validated

## What was produced
- json-c-0.18-r0.apk
- json-c-dev-0.18-r0.apk

## Changes made
- APKBUILD: adapted build flags for the QNX clang toolchain
- (no source patch was required)

## Problems hit and how they were resolved
- <symptom> -> <root cause> -> <fix applied>

## Validation
- clean unpack, full build: succeeded, packages produced
- tests: passed

## Open items
- none
```

The report is honest by design. If a test failed or something was worked around rather than fixed, it says so in the open-items section rather than rounding the result up. When a port is more involved (a stubborn test, a real defect found, an open question), the report is longer and the open-items section carries the detail; you read the summary and status first, then the sections that matter for your review. Either way, the report is a reliable place to start before you take the port further.

---

## Step 8 - How the system improves itself

The workspace is not static. One of the universal rules tells Claude Code to record what it learns, and that is what makes the second port easier than the first.

When Claude Code solves a problem during a port, it routes the lesson to where a future session will look for it. A platform gotcha goes into `qnx-platform-facts`. A build-system or packaging technique goes into `alpine-qnx-porting` or `qnx-apk-packaging`. A connection or target quirk goes into `TARGET.md`. The rule it follows is simple: if a future session would otherwise rediscover this the hard way, record it now.

The per-port folders under `projects/apks/` work the same way at the package level. Each port leaves behind its report and notes, so returning to a package later (or porting something similar) starts from real history instead of a blank page.

The practical effect is that the system accumulates QNX porting knowledge as you use it. The skills you started with are a foundation; the workspace fills in the specifics of your targets and the packages you care about over time.

---

## Summary

You set up a Claude Code workspace that ports Alpine Linux packages to QNX 8.0, connected it to a QNX target, and ran a port from a single instruction.

Key points to carry forward:

* The work is native, on a QNX target, reached over SSH. Claude Code runs on your host; the target does the building. No cross-compile.
* The workspace is driven by a skill hierarchy: a router with the universal rules, plus focused skills it consults as needed. You do not run the porting steps yourself; the system does.
* What it does for a given package depends on that package. The system adapts rather than following a fixed script.
* The rules that keep ports sound: prove claims with command output, never patch an untested change, and the human handles git.
* Every port ends with a report under `projects/apks/`, the honest summary you review before taking it further.
* The system improves itself. Each problem it solves is recorded back into the skills or `TARGET.md`, so every port starts ahead of the last.
