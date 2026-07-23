---
name: aports-patch-creation
description: "MANDATORY: Check this skill before providing ANY patch content, patch commands, or abuild workflow advice. Covers QNX porting patch creation for Alpine Linux APKBUILD packages. Claude must ask if changes are tested before creating any patch, never create speculative patches. Applies whenever user is debugging a build error, asking about patches, or working on any APKBUILD file."
---

# Alpine Linux APKBUILD Patch Creation Skill

## Purpose
This skill provides the definitive workflow for creating patches for Alpine Linux APKBUILD packages. It emphasizes verification before patch creation and follows Alpine's patch format standards.

## Critical principles

1. **NEVER create patches speculatively** - Always test changes work first
2. **NEVER use `abuild -r` during development** - It wipes your working directory
3. **ALWAYS verify patch format** matches Alpine standards before using
4. **Follow the exact workflow** - Don't skip steps or improvise

## Two-phase workflow

### Phase 1: Development and testing (iterative)

This phase happens in the extracted source directory. Make changes, test with native build tools (cmake/make/ninja), verify they work. Repeat until satisfied.

**Setup:**
```bash
cd /path/to/aports/category/pkgname
abuild clean      # Remove old artifacts
abuild unpack     # Extract tarball and apply existing patches
```

**Iterative testing:**
```bash
cd src/pkgname-version/
# Make your changes to source files
# Test using native build system (NOT abuild):
#   - For CMake: rm -rf build && mkdir build && cd build && cmake .. && ninja
#   - For Make: make clean && make
#   - For Meson: meson setup build && ninja -C build
# Verify the change fixes the issue
# Repeat as needed
```

**DO NOT:**
- Run `abuild -r` (it deletes your changes)
- Create patches yet (changes aren't finalized)
- Modify APKBUILD (testing phase only)

### Phase 2: Patch creation (once changes work)

Only proceed here after Phase 1 changes are tested and working.

**Step 1: Prepare for patch creation**
```bash
cd /path/to/aports/category/pkgname
abuild clean
abuild unpack    # Fresh extraction with existing patches applied
```

**Step 2: Create .orig backup of file to modify**
```bash
cd src/pkgname-version/
cp path/to/file.ext path/to/file.ext.orig
```

**Step 3: Apply your changes**
```bash
# Edit the file with your tested changes
vi path/to/file.ext
```

**Step 4: Generate diff from project root**
```bash
# From src/pkgname-version/ directory:
diff -u path/to/file.ext.orig path/to/file.ext > ../../NNN-descriptive-name.patch
```

Where NNN is the next sequential patch number (001, 002, etc.)

**Step 5: Fix patch header format**

Edit the patch file to match Alpine format:

**WRONG format (what diff produces):**
```diff
--- ./path/to/file.ext.orig
+++ ./path/to/file.ext
```

**CORRECT format (Alpine standard):**
```diff
--- a/path/to/file.ext
+++ b/path/to/file.ext
```

Remove:
- `.orig` from first line
- `./` prefix from both lines

Add:
- `a/` prefix to first line
- `b/` prefix to second line

**Verification:**
```bash
# Compare your patch header to existing patches:
cd /path/to/aports/category/pkgname
head -n 3 001-existing-patch.patch
head -n 3 NNN-your-new-patch.patch
# Headers should match format exactly
```

**Step 6: Add patch to APKBUILD**

Edit APKBUILD and add your patch filename to the `source=` list:
```bash
source="https://example.com/pkgname-$pkgver.tar.xz
    001-existing-patch.patch
    002-another-patch.patch
    NNN-your-new-patch.patch
    "
```

**Step 7: Update checksums**
```bash
abuild checksum
```

This updates the sha512sums in APKBUILD.

**Step 8: Test the complete build**
```bash
abuild -r
```

This builds from scratch with all patches applied. If it succeeds, your patch is correctly integrated.

## Patch commit message format

The patch file's own commit message (the text above the `---` separator) is one short summary line. No bullet-point lists in the patch header. Detail belongs as inline comments next to the changed code, not in the patch message.

## A matching checksum does not prove a patch applies

A matching sha512 proves the patch file is byte-identical to what is recorded, NOT that it still applies to the unpacked tree. QNX uses BusyBox `patch` with zero fuzz tolerance, so a patch that applies on Alpine (GNU patch tolerates fuzz) can be rejected on QNX. Always verify application with `abuild clean && abuild -K unpack prepare` and confirm there is no "Hunk FAILED" and no `.rej` file, rather than trusting the checksum.

## Common mistakes and solutions

### Mistake: Patch paths don't match
**Symptom:** `abuild unpack` fails with "can't find file to patch"

**Cause:** Patch header paths are wrong

**Solution:** 
- Verify header format matches `--- a/path` and `+++ b/path`
- Path must be relative to tarball root
- No `.orig` in filename
- No `./` prefix

### Mistake: Changes lost during build
**Symptom:** Build doesn't include your changes

**Cause:** Used `abuild -r` during development

**Solution:**
- Only use `abuild -r` for final verification
- During development, use native build tools in src/ directory

### Mistake: Patch applies but doesn't work
**Symptom:** Patch applies cleanly but issue persists

**Cause:** Didn't test changes before creating patch, or tested different changes

**Solution:**
- Delete patch, go back to Phase 1
- Test changes thoroughly before creating patch
- Create patch immediately after successful test

### Mistake: Multiple files need changes
**Solution:** Create one patch per logical change, not per file
- If files are related (single bug fix), use one patch
- If independent changes, use separate patches
- Use descriptive names: `001-fix-qnx-audio.patch`, `002-add-wayland-support.patch`

## Patch naming convention

Format: `NNN-descriptive-kebab-case-name.patch`

- NNN: Sequential number (001, 002, etc.)
- descriptive: What the patch does
- kebab-case: lowercase with hyphens

**Good examples:**
- `001-fix-qnx-processor-detection.patch`
- `002-add-wayland-support.patch`
- `003-disable-broken-feature.patch`

**Bad examples:**
- `fix.patch` (no number, not descriptive)
- `001_Fix_QNX.patch` (underscores, wrong case)
- `qnx-processor.patch` (no number)

## Multi-file patches

If multiple files need changes:

```bash
# Create backups for each file
cp path/to/file1.c path/to/file1.c.orig
cp path/to/file2.h path/to/file2.h.orig

# Make all changes

# Generate unified patch with all changes
cd src/pkgname-version/
diff -Nur . . > ../../NNN-description.patch
```

Or use `diff -r` for directory comparison.

## Quick reference

**Workflow commands:**
```bash
# Setup
abuild clean && abuild unpack

# Create backup
cd src/pkgname-version/
cp file.ext file.ext.orig

# Make changes
vi file.ext

# Create patch
diff -u file.ext.orig file.ext > ../../NNN-name.patch

# Fix header (manual edit)
# Add to APKBUILD source list

# Update checksums
cd ../..
abuild checksum

# Final test
abuild -r
```

## When Claude should ask before acting

Claude should ASK the user before:
1. Creating any patch - confirm changes are tested first
2. Suggesting patch format - show example from existing patch
3. Running `abuild -r` - confirm user is done with development
4. Modifying paths in patch - verify against existing patches

Claude should NEVER:
1. Assume patch format without checking existing patches
2. Suggest `abuild -r` during iterative development
3. Create patches without confirming changes work
4. Guess at file paths in patch headers

## Verification checklist

Before considering patch complete:

- [ ] Changes tested in Phase 1 and working
- [ ] Patch header format matches existing patches exactly
- [ ] Patch filename follows NNN-description.patch convention
- [ ] Patch added to APKBUILD source list
- [ ] `abuild checksum` ran successfully
- [ ] `abuild -r` completes without errors
- [ ] Patch actually applied (check build log or manually verify in src/)

## Integration with build system

After creating patch, verify it's being applied:

```bash
abuild clean
abuild unpack
cd src/pkgname-version/
# Check that your changes are present in the source
grep "your change marker" path/to/file.ext
```

If changes aren't there, patch didn't apply - check format and paths.

