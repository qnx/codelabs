# QNX Aports Porting - Claude Code Setup

A self-contained Claude Code setup for porting Alpine Linux packages to QNX 8.0
natively (build on a QNX target with `abuild`, no cross-compile). Drop these
files into a repo on your Linux box, point them at a QNX target, and give
Claude Code a package to port.

## What is in here

- `CLAUDE.md` - session bootstrap, read first automatically by Claude Code.
- `TARGET.md` - your target: how to connect, the authoritative tree path, and
  a running log of target-specific facts. Edit this for your target.
- `.claude/skills/` - the skill hierarchy (6 skills: a router plus 5 focused
  skills). Claude Code discovers and loads these on demand.
- `projects/apks/` - where Claude Code keeps a folder per package it ports.
  Starts empty. Each port produces a `PROJECT-INDEX.md` and a `REPORT.md` here
  recording what changed, why, what problems came up, and what is still open, so
  a port's history is preserved for review and for the next time you touch it.
- `projects/PROJECT-INDEX-template.md` - the template copied into each port folder.
- `run.sh` - optional QEMU launcher template, for the bring-your-own-image case
  (an alternative to QSTI; see TARGET.md). Edit the `CHANGE_ME` image path and
  tune the settings to your host.
- `settings.template.json` - optional permission allow-rules for
  `~/.claude/settings.json` so the workflow prompts less.

## First-time setup

1. Copy these files into your repo root (so `CLAUDE.md` and `.claude/` sit at
   the top).
2. Get a QNX target you can SSH into, and record how to reach it in `TARGET.md`
   (it explains the options, including the official Quick Start Target Image).
3. Confirm you can reach the target over SSH (install `sshpass` if needed for
   password-based auth).
4. Edit `TARGET.md` with your target's connection details, the authoritative
   tree path, and any image-specific facts.
5. Optionally merge `settings.template.json` into `~/.claude/settings.json`
   for fewer permission prompts.
6. Start Claude Code in the repo and give it a port.

## The skill tree

`qnx-porting` is the router, read first. It holds the universal rules and
points to the rest:

- `qnx-platform-facts` - QNX platform truths (libc gaps, stack, macros)
- `alpine-qnx-porting` - APKBUILD adaptation (deps, build systems, conventions)
- `qnx-apk-packaging` - end-to-end port-to-PR workflow and validation gate
- `qnx-port-reporting` - after-action REPORT.md per port
- `aports-patch-creation` - patch workflow and format gate

## The universal rules

1. Prove claims with command output before acting.
2. Never create a patch from an untested change.
3. The human runs all git operations; the agent never commits or pushes.
4. Native aports builds only; no cross-compile.
5. Record new confirmed facts back into the right skill or TARGET.md immediately.
6. Capture friction as you go: anything that slows a session becomes a permanent
   skill or TARGET.md update the moment it is proven.
