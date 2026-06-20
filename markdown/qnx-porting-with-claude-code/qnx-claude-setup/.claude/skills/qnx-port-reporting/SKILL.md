---
name: qnx-port-reporting
description: "Write the per-port report after a porting session on QNX 8.0. Read this when a port (or a meaningful chunk of one) is finished and the result needs to be written up: what was done, what changed and why, what problems were hit and how they were resolved, what tests showed, and what is still open. Produces a structured REPORT.md in the port's projects/apks/<pkgname>/ folder. This is the after-action report a human reads to review the port; it is distinct from the living project README (running notes and changelog) and from the PROJECT-INDEX (entry point). Read qnx-porting first."
---

# QNX Port Reporting

After a porting session, write a report so a human can review what happened without re-running anything or reading the whole transcript. The report is the readable summary of the port: what was attempted, what was produced, what went wrong and how it was handled, and what remains open.

Keep three documents distinct in a port folder:

- `PROJECT-INDEX.md` is the entry point (required reads, key links, the load-bearing working rules).
- `<pkgname>-README.md` is the living project doc (running notes, the changelog, design decisions that persist across sessions).
- `REPORT.md` is the after-action report for a session or a port (this skill). It is written to be read top to bottom by a reviewer.

If a folder does not exist yet for the package, create it under `projects/apks/<pkgname>/` and copy the project-index template in alongside the report.

## When to write a report

Write or update `REPORT.md` when:

- a port reaches a build-complete or validated state,
- a session ends with meaningful progress or a clear blocker,
- the port is handed off (to a human reviewer or a future session).

Do not wait for a "finished" port. A port that is blocked is exactly the case where a clear report saves the next session the most time.

## Report structure

Use these sections, in this order. Omit a section only if it is genuinely empty, and say so rather than dropping it silently.

```markdown
# <pkgname> Port Report

- Package: <pkgname> <version>
- Repo: core | extra
- Target: <arch / image, e.g. x86_64 QEMU>
- Date: <YYYY-MM-DD>
- Status: built and validated | built, tests partial | blocked | in progress

## Summary

Two or three sentences: what this port is, where it ended up, and the one
thing a reviewer most needs to know.

## What was produced

The packages and their parts, as built. For example:
- json-c-0.18-r0.apk
- json-c-dev-0.18-r0.apk
Note the subpackage split and anything notable about it.

## Changes made

Each change with what / why / impact. Group as:
- APKBUILD changes (metadata, deps, flags, subpackages) and the reason for each
- Patches added (name each, one line on what it fixes)
- Inherited Alpine logic kept as-is (note it, so a reviewer knows it was deliberate)

## Problems hit and how they were resolved

The walls and their fixes, in the order they came up. Each entry: the symptom
(real error text or behavior), the root cause, and the fix applied. This is the
most valuable section for the next person; be concrete.

## Validation

The commands run and what they showed:
- clean unpack: patches apply, no .rej
- full build: result, packages produced
- tests: how many passed / skipped / failed, and which
- any consumer that was validated against this package

## Open items / remaining risk

Anything not resolved: a skipped test and why, a known limitation, a feature
disabled on QNX, a follow-up needed. Be honest here; a real defect that was
worked around belongs in this section, not hidden.

## Handoff

What the next session or the human should do next (for example: review and open
the PR, fix the open defect, port the dependency this unblocks).
```

## Quality rules

- Report what actually happened, backed by real command output, not what was intended. If a test failed, the report says so; do not round a partial result up to "passing."
- Separate an environment failure from a real defect, and say which it was. A whole suite failing on a missing harness tool is not the same as one test exposing a genuine QNX bug.
- Keep it readable top to bottom. A reviewer should understand the port from the report alone, without the transcript.
- Do not put PR-reply wording or code comments here; this is a review document, not the patch or the commit.
- When the report surfaces a durable platform or packaging fact, also record that fact in the matching skill per the capture-friction rule. The report captures this port; the skills capture what every future port should know.

This skill will grow more structured over time (richer sections, consistent formatting, possibly machine-readable summaries). Prefer extending the structure here over inventing a per-port format.
