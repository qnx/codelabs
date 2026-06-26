# QNX Aports Porting (Claude Code)

This is the workspace bootstrap. Read it at the start of every session before doing any work, then load the skill that matches the task.

## Session bootstrap, in order

1. Read this file.
2. Read `TARGET.md` for the target connection (SSH, auth, the one authoritative tree path, the on-target loop). All work happens on the target over SSH.
3. Load the `qnx-porting` skill. It is the router: it holds the universal rules and points to the focused skill for the task at hand.
4. When working a specific port, read everything in `projects/apks/<portname>/` before touching anything. `PROJECT-INDEX.md` is the starting point when it exists.

## Universal rules (apply to every task)

1. Claims must be proven with command output before acting. Do not assert platform behavior, dependency state, or build results as fact without the command that shows it. When you lack the information, say so and get the evidence rather than filling the gap with plausible reasoning.
2. Never create a patch from an untested change. Test in the unpacked tree with native build tools first; the patch is written only after the change is confirmed working.
3. The human runs all git operations. Never run `git commit` or `git push`. Edit and build only.
4. Native aports builds only: build on the QNX target with `abuild`. No SDP, no qcc/q++, no toolchain files, no cross-compile. If a doc assumes the cross-compile path, it is legacy reference and does not apply here.
5. Record new confirmed facts back into the right skill the moment they are proven.
6. Capture friction as you go: anything that slows a session down, breaks, or could be faster is a skill or `TARGET.md` update made the moment it is proven, not deferred. If a future session would otherwise rediscover this the hard way, record it now.

## Target environment

The connection details, authentication, the authoritative tree path, and the on-target build loop live in `TARGET.md` (read at session start, per the bootstrap above). The one principle that matters here: all work happens on the QNX target over SSH. Edit and build on the target; never cross-compile from the host.

Standing facts that also matter here:
- SSH push key for GitHub: use the SSH key registered on your GitHub account (confirm with `ssh -T git@github.com`).
- GitHub remote for all aports work: `git@github.com:<your-github-username>/aports.git` (one remote, all packages, branches per change).
- Use `abuild -K` to keep the source tree during development. `abuild -r` wipes `src/`; use it only for final validation.

## Skill map

The `qnx-porting` router skill routes by task. The tree:

```
qnx-porting (router, read first)
├── qnx-platform-facts        platform truths (syscalls, libc gaps, stack, macros)
├── alpine-qnx-porting        APKBUILD adaptation (deps, build systems, conventions)
├── qnx-apk-packaging         end-to-end port-to-PR workflow + validation gate
├── qnx-port-reporting        after-action REPORT.md per port
└── aports-patch-creation     patch workflow and format gate
```

## Per-port notes

Every non-trivial port has a folder under `projects/apks/<portname>/` with a `PROJECT-INDEX.md` (required reads, key links, the load-bearing working rules) and a README carrying the changelog. Update the per-port changelog for every meaningful change: what changed, why, what solution was chosen, how it resolves the problem. Treat every APKBUILD deviation from Alpine as a documented porting decision.

## Validation gate (before reporting any work complete)

```bash
abuild clean && abuild unpack          # patches apply, no Hunk FAILED, no .rej
abuild -r -c -K                        # builds, tests pass, expected APKs produced
find pkg -name '*.so*' | sort          # subpackage split correct, nothing orphaned
git status                             # only intended files modified
```

