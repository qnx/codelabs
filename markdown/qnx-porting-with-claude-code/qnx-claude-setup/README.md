# QNX Aports Porting - Claude Code Setup

A self-contained Claude Code setup for porting Alpine Linux packages to QNX 8.0
natively (build on a QNX target with `abuild`, no cross-compile). Drop these
files into a repo on your Linux box, point them at a QNX QEMU target, and give
Claude Code a package to port.

## What is in here

- `CLAUDE.md` - session bootstrap, read first automatically by Claude Code.
- `TARGET.md` - the target: connection, auth, the one authoritative tree path,
  the on-target loop, and a living log of image-specific facts. EDIT THIS for
  your target.
- `.claude/skills/` - the 13-skill hierarchy (router + core + driver leaves).
  Claude Code discovers and loads these on demand.
- `projects/PROJECT-INDEX-template.md` - copy into each `projects/apks/<port>/`.
- `projects/apks/json-c/` - a complete worked example port (the best thing to
  read to see the system in action).
- `run.sh` - QEMU launcher template. EDIT the CHANGE_ME image path and tweak the
  RAM/cpu/port settings to taste.
- `settings.template.json` - permission allow-rules for `~/.claude/settings.json`
  (user-level) so the workflow runs without a prompt per command.
- `HANDBACK-reference.md` - a snapshot narrative of how the system was verified
  end to end on a live target. Reference only; the running system is the files
  above, not this.

## First-time setup

1. Copy these files into your repo root (so `CLAUDE.md` and `.claude/` sit at
   the top of the repo).
2. Put your QNX image somewhere neutral (for example `~/qnx-qemu/`), copy the
   stock OVMF vars next to `run.sh` (`cp /usr/share/OVMF/OVMF_VARS.fd .`), and
   set the real image path in `run.sh`.
3. Boot the target: `./run.sh` (from the dir holding `OVMF_VARS.fd`). Only run
   one instance; check `ss -ltnp | grep 2227` first.
4. Confirm you can reach it: `sshpass -p everywhere ssh -p 2227 qnx@localhost uname -a`
   (install `sshpass` if needed).
5. Merge `settings.template.json` into `~/.claude/settings.json` for unattended
   runs.
6. Edit `TARGET.md`: confirm the authoritative tree path and image arch on your
   target (the file has a read-only discovery sweep to re-run on a fresh image).
7. Start Claude Code in the repo and give it a port.

## The skill tree

`qnx-porting` is the router, read first; it holds the universal rules and points
to the rest: platform facts, APKBUILD content mechanics, the packaging workflow,
patch creation, git/PR conventions, and a driver-development sub-tree
(char-serial, i2c, spi, hid, usb, sensor-camera).

## The universal rules (enforced throughout)

1. Prove claims with command output before acting.
2. Never create a patch from an untested change.
3. The human runs all git operations; the agent never commits or pushes.
4. Native aports builds only; no cross-compile.
5. No em dashes in any output or file.
6. Record new confirmed facts back into the right skill or TARGET.md immediately.
7. Capture friction as you go: anything that slows a session becomes a permanent
   skill/TARGET.md update the moment it is proven.

## Sharing one skills copy with Codex (optional)

If you also run Codex, point both agents at one skills directory rather than
duplicating: `ln -s ~/.agents/skills ~/.claude/skills` once `~/.claude/` exists.
