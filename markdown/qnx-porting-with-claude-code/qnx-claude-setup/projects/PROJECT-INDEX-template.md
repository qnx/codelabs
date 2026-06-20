# <pkgname> APK Port - Project Index

Start here for <pkgname> porting work. This index is the entry point; read the required reads in order before touching the port.

## Required Reads

1. `<pkgname>-README.md` - current port status, source comparison, dependency plan, and the changelog
2. `../<consumer-or-dependency>/<that>-README.md` - any tightly coupled package (consumer to validate, or dependency to land first); omit if standalone
3. `../PACKAGING-WORKFLOW.md` (or the `qnx-apk-packaging` skill) - the shared end-to-end packaging workflow
4. The patch workflow (`aports-patch-creation` skill) - before any patch work

## Key Source Links

- Upstream: <upstream repo URL>
- Alpine aport: <Alpine GitLab aports path, with branch>
- QNX cross-compile reference (evidence only, NOT auto-applied to self-hosted): <qnx-ports URL if one exists>
- QNX aports repository: https://github.com/qnx-ports/aports
- Tightly coupled consumer/dependency: <URL if any>

## Working Rule

State the load-bearing decisions for this port in two or three sentences, the things that are not obvious from the APKBUILD and that a future session must not relitigate. For example: build order relative to a coupled package; the validated package/subpackage shape and why a more obvious split was rejected; any version pin and the reason; the single biggest blocker. Keep this short; detail lives in the README. This section exists so the one fact that would otherwise be rediscovered the hard way is the first thing read.

## Status snapshot (optional, keep current or delete)

- Current version: <version>
- Build: <passing / blocked on X>
- Open blockers: <list or none>
- Last validated: <date and target>

