# Target Connection (QNX 8.0 QEMU)

All porting work happens **on the QNX target itself**, over SSH. There is no host-side aports tree and no scp round-trip: connect to the target, edit the source/APKBUILD/patches there, and build there with `abuild`. The Linux host only launches QEMU and runs the SSH session.

## Connecting

```bash
ssh -p 2227 qnx@localhost
```

- User: `qnx` (root SSH is rejected; always use the `qnx` account)
- Password: `everywhere`
- The QEMU launcher forwards host port `2227` to guest port `22`.

To run a single command on the target without an interactive shell:

```bash
ssh -p 2227 qnx@localhost '<command>'
```

## About the password (dev convenience, not a security model)

This setup uses a simple shared dev password (`everywhere`) on a local QEMU image. That is fine for a local development target. Because password auth prompts interactively, non-interactive use needs one of:

- `sshpass -p everywhere ssh -p 2227 qnx@localhost '<command>'` (simplest for this dev image), or
- an authorized SSH key added to the guest `qnx` account (cleaner, avoids the password on the command line).

For sudo on the target the established pattern is to pipe the password in:

```bash
printf '%s\n' everywhere | sudo -S <command>
```

In a real or shared environment, do not rely on a basic shared password: use key-based auth, a per-user account, and proper secrets handling. The approach here is chosen for a throwaway local dev target only.

## On-target paths

- Authoritative aports tree on the target: `/var/home/qnx/aports_checkin`
  (Confirmed 2026-06-18 by live discovery and by `claude_handoff.txt`, which names it the authoritative checkin tree. It is the CLEAN tree with the SSH push remote `git@github.com:emazzucabb/aports.git`; you commit one branch per change here and push PRs from it. Build/iterate here for anything PR-bound. Use this one path everywhere; do not let the other trees below become the build target by accident.)

### The trees on this target (discovered 2026-06-18)

Several aports checkouts exist under `/var/home/qnx`; they are NOT interchangeable:

| Path | Remote | Role |
| --- | --- | --- |
| `aports_checkin` | SSH (`git@github.com:emazzucabb/aports.git`) | AUTHORITATIVE clean checkin tree. PRs push from here. |
| `aports` | HTTPS | Large scratch/dev tree, branch `803`, lots of uncommitted WIP. Reference only, do not push from. |
| `aports_lama_test` | SSH | Per-port proof/scratch ground (llama.cpp). |
| `aports_webkit` | HTTPS | WebKit memory-fix work (a Codex `.bak` file is present). |

Standalone per-port scratch dirs also exist (`abseil-*-stage-*`, `protobuf-v2`, `shaderc-*-test`, `llama-*-test`, `findutils-test`): these are unpacked proof grounds, not aports trees. `claude_handoff.txt` in `$HOME` is a prior-session handoff (llama.cpp PR qnx-ports/aports#398); read it when touching llama.cpp.

### Re-confirm discovery on a fresh image

If the image is ever replaced, re-run this read-only sweep and update the table above:

```bash
whoami && uname -a && uname -m                                   # identity, arch (expect x86pc)
ls -la /var/home/qnx                                             # work dirs
find /var/home/qnx -maxdepth 3 -name .git -type d 2>/dev/null    # which trees are git checkouts
for d in /var/home/qnx/aports*; do echo "== $d =="; git -C "$d" remote -v | head -1; git -C "$d" rev-parse --abbrev-ref HEAD; done
cat /etc/apk/repositories                                        # local + remote repo resolution
```
- Package output after a build: `/var/home/qnx/packages/<repo>/<arch>` (for example `.../extra/x86_64`).
- Local repo resolution: add the local package output paths before remote repos in `/etc/apk/repositories`, then `sudo apk update` (see the `qnx-apk-packaging` skill, step 5). As of 2026-06-18 the file lists the local repo `/var/home/qnx/packages/extra` first, then the remote QNX repos (`repo.oss.qnx.com/8.0.3/{core,extra}` and `repo.qa.oss.qnx.com/8.0.3-rc1/qnx-{core,extra}`). Only `extra` is published locally; there is no local `core` path. Add one if you ever build a `core` package.

## The on-target loop

1. SSH to the target.
2. `cd` into the package directory in the authoritative tree.
3. Edit APKBUILD / source / patches in place on the target.
4. Iterate with `abuild -K` (keeps `src/`); test changes with the native build system in the unpacked tree. Never `abuild -r` while iterating (it wipes `src/`).
5. Run the validation gate before reporting complete (see CLAUDE.md and `qnx-apk-packaging`).
6. The human runs all git operations from the target. The agent never commits or pushes.

## Target facts worth keeping current

- Architecture of this image: x86_64 QEMU (confirmed from `run.sh`: `qemu-system-x86_64` booting `x86_64-desktop-qemu-uefi-*.img`). `uname -m` returns `x86pc` on this target, not `x86_64`; match processor checks with `^(x86_64|x86pc|i686|amd64)`. Reconfirm with `uname -m` on first connection.
- Toolchain present on target (confirmed 2026-06-18): `abuild`, `apk`, `git`, `gcc`, `make` all in `/usr/bin`. `cc -dumpmachine` returns `x86_64-pc-qnx` (per handoff).
- abuild signing key: `PACKAGER_PRIVKEY="/var/home/qnx/.abuild/qnx-69fd5dd5.rsa"` (set in `~/.abuild/abuild.conf`); matching `.rsa.pub` is alongside it. abuild signs packages with this; do not regenerate it.
- `/var/cache/distfiles` exists (owned `root:abuild`), so source downloads are cached. No need to recreate it.
- The QEMU process is typically already running and bound to host port 2227 before the session starts (launched from `~/qnx-qemu` via `run.sh`). Check `ss -ltnp | grep 2227` before launching; do not start a second instance.
- Non-interactive access pattern that works: `sshpass -p everywhere ssh -p 2227 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR qnx@localhost '<cmd>'`.
- Route every target operation through that one `sshpass ... ssh ... qnx@localhost '<remote cmd>'` call. The remote command is just a quoted argument, so it is opaque to the local Claude Code permission check: a single `Bash(sshpass:*)` allow rule in `~/.claude/settings.json` (already set) covers the entire on-target workflow (apk, abuild, sudo, find, edits via heredoc) with no per-command prompts. Keep this routing so builds stay unattended.
- Non-interactive abuild dependency install (confirmed fix 2026-06-18): `abuild -r` installs makedepends through `$SUDO_APK` (default `abuild-apk`), which cannot gain root without a tty and fails with `builddeps failed`. sudoers here is `(ALL : ALL) ALL` but WITH password, so a non-tty ssh session cannot prompt. Fix: point `SUDO_APK` at a wrapper that pipes the dev password to sudo, then build with it. Write the wrapper with a quoted heredoc (an inline `printf` with escapes gets mangled by the nested ssh single-quoting):
  ```sh
  cat > /tmp/sudo-apk <<'EOF'
  #!/bin/sh
  printf '%s\n' everywhere | sudo -S apk "$@"
  EOF
  chmod +x /tmp/sudo-apk
  cd /var/home/qnx/aports_checkin/extra/<pkg>
  SUDO_APK=/tmp/sudo-apk abuild -r
  ```
- The QA pre-release repos `repo.qa.oss.qnx.com/8.0.3-rc1/qnx-{core,extra}` return HTTP 403 Forbidden. apk counts that failed index fetch as an error and returns non-zero, which makes abuild builddeps abort for ANY package. They are commented out in `/etc/apk/repositories` (backup at `/etc/apk/repositories.bak`); leave them out unless access is restored. Working repos: local `extra` plus `repo.oss.qnx.com/8.0.3/{core,extra}`.
- apk validates the ENTIRE installed world on every transaction, so one broken/conflicting package makes `apk add` (and thus abuild builddeps) fail for everything with an opaque `1 error`. When builddeps fails, run `apk fix 2>&1 | grep -i error` to surface the real cause. On 2026-06-18 the cause was `findutils-4.10.0-r1: trying to overwrite usr/bin/find owned by busybox-utils` (a conflicting test install, see the `findutils-test` home dir); fixed with `apk del findutils findutils-locate` to restore busybox `find`. Also cleared 13 orphaned `.makedepends-*` virtuals from interrupted builds: `/tmp/sudo-apk del $(apk info | grep makedepends)`.
- Build-loop validated end to end on 2026-06-18: `spirv-headers` (header-only, extra) built clean with `abuild -r` in ~6s and produced `spirv-headers-1.4.321.0-r0.apk`. It is a good fast smoke-test package for confirming the loop after any image or environment change.
- Full new-aport flow validated 2026-06-18 with `json-c` 0.18 (extra), pulled from Alpine `main` and built to two APKs (`json-c`, `json-c-dev`). See `projects/apks/json-c/` for the writeup. Facts it established about this image:
  - This image's busybox has no `cmp` applet and nothing owns `/usr/bin/cmp`. Test harnesses that call `cmp` (common in autotools/CMake test scripts) fail with `cmp: command not found`. Fix by adding `checkdepends="diffutils"`; `diffutils-3.12-r0` installs cleanly with no busybox file conflict (unlike `findutils`, which conflicts over `/usr/bin/find`).
  - This image's busybox also has no `killall` applet, and `psmisc` (which provides it) is NOT packaged, so there is no checkdep to add. Test harnesses that call `killall` (libmodbus's `tests/unit-tests.sh` does) fail with `killall: command not found` and cannot be satisfied with a checkdep. Note it as an open harness blocker, not a defect.
  - `cmake3.5` exists at `/usr/bin/cmake3.5` (wraps cmake 4.2.3), so Alpine APKBUILDs that call `cmake3.5` work unchanged.
  - The clang `-Qunused-arguments` convention is needed for CMake C builds whose default `CFLAGS` carry `-fstack-clash-protection` under `-Werror` (see alpine-qnx-porting). `export CFLAGS="$CFLAGS -Qunused-arguments"` in `build()`.
- Token-efficient remote-build pattern: redirect the full `abuild` log to a file on the target and pull back only key lines instead of streaming the whole build:
  ```sh
  SUDO_APK=/tmp/sudo-apk abuild -r > /tmp/build.log 2>&1; echo "EXIT=$?"
  grep -nE '>>>|Hunk FAILED|error:|Build complete|builddeps failed' /tmp/build.log | tail
  ```
  When grepping apk output, drop indented package-list lines with `grep -vE '^[[:space:]]'` so the real ERROR line is not buried. For multi-line remote commands, write a script with `ssh ... 'cat > /tmp/x.sh' <<'REMOTE' ... REMOTE` then run it, to avoid nested single-quote breakage over ssh.
- Anything image-specific that bit you once (a repaired `/etc/group`, a created `/var/cache/distfiles`, etc.) belongs here so it is not rediscovered.

