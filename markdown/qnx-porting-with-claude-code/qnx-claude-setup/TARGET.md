# Target Connection (QNX 8.0)

All porting work happens **on the QNX target itself**, over SSH. There is no host-side aports tree and no scp round-trip: connect to the target, edit the source/APKBUILD/patches there, and build there with `abuild`. The Linux host only launches the target (if it is a local VM) and runs the SSH session.

The simplest way to get a target is the official Quick Start Target Image (QSTI). See the [QSTI for QEMU guide](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/about.html) or the [QSTI for Raspberry Pi guide](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti/intro.html). With QSTI you launch the target with `mkqnximage --run` and get its IP with `mkqnximage --getip`.

If you already have your own QNX 8.0 disk image, the bundled `run.sh` is a QEMU launcher template you can edit and tune directly (set the image path, RAM, cores, and the SSH port forward). It is an alternative to QSTI for the bring-your-own-image case; the instructions are in the script's header comments.

## Connecting

```bash
ssh <user>@<host>
```

- User: `<user>` (depends on the image; QSTI images use `qnxuser`)
- Host: `<target-host>` (the device or VM IP; use `mkqnximage --getip` for QSTI)
- Port: standard SSH port `22` by default (the QSTI case, connect straight to the target IP). If your setup forwards SSH to a non-standard host port instead (for example a hand-rolled QEMU launcher forwarding host `2227` to guest `22`), add `-p <port>` to every ssh and sshpass command below.
- Authentication: fill in your method below (password or key)

For non-interactive use (required for Claude Code to work without prompting). Add `-p <port>` after `ssh` if your setup uses a forwarded port:

```bash
sshpass -p <password> ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
  <user>@<host> '<command>'
```

Or, if using key-based auth:

```bash
ssh -i ~/.ssh/<your-key> <user>@<host> '<command>'
```

## About authentication

A local development target often uses a simple shared dev password. That is fine for a throwaway local image. For anything shared or networked, use key-based SSH and proper secrets handling.

For sudo on the target, pipe the password:

```bash
printf '%s\n' <password> | sudo -S <command>
```

## On-target paths

- Authoritative aports tree: `<FILL IN THE PATH TO YOUR AUTHORITATIVE TREE>`
  (Run the discovery sweep below on a fresh image to find it. This should be
  the clean tree whose git remote points at your aports fork. Use this one path
  for all PR-bound work.)
- Package output: `/var/home/qnx/packages/<repo>/<arch>` (for example `extra/x86_64`)
- Local repo resolution: add local package output paths before remote repos in
  `/etc/apk/repositories`, then `sudo apk update` (see the `qnx-apk-packaging` skill).

## Discovery sweep (run on a fresh image to populate this file)

Run this on the target to find which aports trees exist and which is authoritative:

```bash
whoami; uname -m
ls -la /var/home/qnx
for d in /var/home/qnx/aports*; do
  echo "== $d =="
  git -C "$d" remote -v 2>/dev/null | head -1
  git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null
done
```

Record the tree with the SSH remote pointing at your fork as the authoritative one above.

## The on-target loop

1. SSH to the target.
2. `cd` into the package directory in the authoritative tree.
3. Edit APKBUILD / source / patches in place on the target.
4. Iterate with `abuild -K` (keeps `src/`); test changes with the native build system in the unpacked tree. Never `abuild -r` while iterating (it wipes `src/`).
5. Run the validation gate before reporting complete (see CLAUDE.md and `qnx-apk-packaging`).
6. The human runs all git operations from the target. The agent never commits or pushes.

## Non-interactive abuild dependency install

`abuild -r` installs makedepends through `$SUDO_APK`, which cannot gain root without a tty and fails with `builddeps failed`. Fix: point `SUDO_APK` at a wrapper that pipes the dev password to sudo, then build with it:

```sh
cat > /tmp/sudo-apk <<'WRAPPER'
#!/bin/sh
printf '%s\n' <password> | sudo -S apk "$@"
WRAPPER
chmod +x /tmp/sudo-apk
cd <authoritative-tree>/extra/<pkg>
SUDO_APK=/tmp/sudo-apk abuild -r
```

## Token-efficient remote-build pattern

Redirect the full `abuild` log to a file on the target and pull back only key lines:

```sh
SUDO_APK=/tmp/sudo-apk abuild -r > /tmp/build.log 2>&1; echo "EXIT=$?"
grep -nE '>>>|Hunk FAILED|error:|Build complete|builddeps failed' /tmp/build.log | tail
```

## Image-specific facts (fill in as you discover them)

Record anything specific to your image that bit you once, so it is not rediscovered:

- Architecture: `<x86_64 QEMU / aarch64 RPi5>` (`uname -m` returns `x86pc` on x86_64 QEMU)
- Known missing busybox applets: (for example `cmp` - fix with `checkdepends="diffutils"`; `killall` - no package available)
- Repository issues: (for example pre-release repos returning 403 should be commented out)
- Any repaired system files: (for example a fixed `/etc/group`, a created `/var/cache/distfiles`)
