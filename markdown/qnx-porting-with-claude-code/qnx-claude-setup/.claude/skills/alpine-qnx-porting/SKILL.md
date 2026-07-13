---
name: alpine-qnx-porting
description: Guide for porting Alpine Linux projects to QNX 8.0, specifically focusing on APKBUILD-based builds, Vala compiler workarounds, cross-platform dependency management, and QNX-specific compilation environment configuration. Use when working with Alpine Linux packages, APKBUILD files, Vala projects on QNX, granite library porting, or debugging QNX compilation issues.
---

# Alpine Linux to QNX 8.0 Porting

## Overview

This skill provides guidance for porting Alpine Linux projects to QNX 8.0, with particular emphasis on APKBUILD system integration, managing cross-platform compatibility challenges, and working with the Vala compiler on QNX's unique environment.

## Environment Context

> This skill covers native aports porting: packages are built **on the QNX target itself** with `abuild` (the host does not cross-compile them). For platform-level QNX facts shared across all ports, see the `qnx-platform-facts` skill; for the universal rules (including the native-build rule and where the SDP applies) and task routing, see `qnx-porting`.

### Development Setup
- **Host System**: Ubuntu, used only to launch the QEMU target (not for compiling)
- **Target System**: QNX 8.0 (QEMU x86_64 or RPi5 aarch64), where the build actually runs
- **QNX Image**: Custom configured to resemble Linux for easier building
- **Build System**: Alpine's APKBUILD, built natively on the target with abuild
- **Primary Focus (historical)**: Building "granite" library and its dependencies

### Key Toolchain Details
- **Vala Compiler**: valac 0.56.18
- **Build System**: Meson (primary), with APKBUILD wrappers
- **Compiler Settings**: Debug builds with LTO disabled, single-threaded compilation for stability

## Core Porting Workflow

### Phase 1: Dependency Analysis
1. Identify all project dependencies from APKBUILD
2. Check which dependencies are already available on QNX
3. Port missing dependencies first (bottom-up approach)
4. Document any QNX-specific patches needed for each dependency

### Phase 2: Header Conflicts Resolution
**Common Issue**: QNX's stdlib.h macros conflict with library method names

**Solution Pattern**:
```c
// Create header shim (e.g., for libgee conflicts)
#ifdef __QNX__
#undef min
#undef max
#endif
```

**Application**:
- Place shims before problematic includes
- Test with isolated compilation units first
- Document which methods required shimming

### Phase 3: Vala Compiler Stability on QNX

**Known Issues**:
- Valac 0.56.18 segfaults on certain complex Vala syntax patterns
- Batch compilation often fails where individual file compilation succeeds
- Memory/parsing limitations with complex property declarations

**Workaround Strategy**:
1. **Identify Problematic Files**
   - Compile files individually: `valac file.vala`
   - Note which files cause segfaults
   
2. **Syntax Simplification via APKBUILD**
   Use sed commands in APKBUILD `prepare()` function to simplify problematic patterns:
   
   ```bash
   # Example: Simplify complex property declarations
   prepare() {
       default_prepare
       
       # Fix chained casts that crash valac
       sed -i 's/((Widget) child)/(child as Widget)/g' src/problematic.vala
       
       # Expand compact property syntax
       sed -i 's/property type name { get; set; }/property type name {\n    get { return _name; }\n    set { _name = value; }\n}/g' \
           src/another-problem.vala
   }
   ```

3. **Build Settings Adjustments**
   ```bash
   # In APKBUILD
   export CFLAGS="-g -O0"  # Debug mode, no optimization
   export LDFLAGS="-Wl,--no-as-needed"
   
   # Meson options
   meson configure -Db_lto=false  # Disable Link-Time Optimization
   meson compile -j1  # Single-threaded to avoid race conditions
   ```

### Phase 4: APKBUILD Integration

**Structure Pattern**:
```bash
# APKBUILD template for QNX port
pkgname=library-name
pkgver=version
pkgrel=0
pkgdesc="Description"
arch="all"
depends="dependency1 dependency2"
makedepends="meson vala-dev"

prepare() {
    default_prepare
    
    # QNX-specific source modifications
    # Use sed for surgical code changes
    # Document WHY each change is needed
}

build() {
    abuild-meson \
        -Db_lto=false \
        -Doption=value \
        . output
    
    meson compile -C output -j1
}

check() {
    # Often skip on QNX due to environment differences
    return 0
}

package() {
    DESTDIR="$pkgdir" meson install --no-rebuild -C output
}
```

## Build systems on QNX

Different upstream build systems hit different QNX-specific walls. The Vala/Meson path is above. The other common one is autotools.

### Autotools (configure / make / libtool)

Two QNX issues show up on almost every autotools port, and neither needs a source patch; both are `build()` fixes.

**1. The build triple (`config.sub` rejects `x86pc`).** QNX `uname -m` returns `x86pc`, so `config.guess` emits `unknown-x86pc-nto-qnx8.0.0`, and `config.sub` rejects the `x86pc` CPU token (`machine 'unknown-x86pc' not recognized`). The bundled config.sub already knows `nto-qnx`; only the CPU token is the problem. This is not a stale config.sub and is not fixed by refreshing gnuconfig (the image has none). The fix is to pass a valid build triple to configure so it skips `config.guess`:

```sh
./configure --build=x86_64-pc-nto-qnx8.0.0 ...
```

Note `$CHOST`/`$CBUILD` are empty in this image's abuild.conf, so there is no global triple to inherit; you pass it per package.

**2. libtool and `-fPIC` for shared libraries.** libtool does not inject a PIC flag for the QNX host, so a shared-library link fails with `relocation R_X86_64_PC32 ... can not be used when making a shared object; recompile with -fPIC`. Add `-fPIC` to CFLAGS:

```sh
export CFLAGS="$CFLAGS -fPIC -Qunused-arguments"
```

(`-Qunused-arguments` is the repo-wide convention for the clang unused-argument warnings from the default hardening flags; see the repo-conventions section.)

**Sockets often link themselves.** An autotools project whose configure does `AC_SEARCH_LIBS(socket, ...)` finds `/usr/lib/libsocket.so` and links it automatically, so the classic QNX `-lsocket` wall may never appear. Observe what the build actually does before adding a socket fix (see qnx-platform-facts).

## Common Challenges and Solutions

### Challenge 1: Macro Name Collisions
**Symptom**: Compilation errors about redefined `min`, `max`, or similar
**Root Cause**: QNX stdlib.h defines macros that conflict with library methods
**Solution**: Header-based #undef shims (see Phase 2)

### Challenge 2: Vala Compiler Crashes
**Symptom**: Segmentation fault during compilation
**Root Cause**: Complex syntax patterns exceed QNX valac stability limits
**Solution**: Systematic file isolation + sed-based simplification (see Phase 3)
**Key Files to Watch**:
- Files with chained property accessors
- Complex generic type declarations
- Compact class property syntax
- Files mixing signals and properties

### Challenge 3: Missing Dependencies
**Symptom**: Build fails with "Package X not found"
**Root Cause**: Alpine dependencies not yet ported to QNX
**Solution**: Port dependencies first, document patches needed

### Challenge 4: Runtime Library Paths
**Symptom**: Binary runs but can't find shared libraries
**Solution**: 
```bash
# In APKBUILD package() function
# Ensure RPATH is set correctly
export LDFLAGS="$LDFLAGS -Wl,-rpath,/usr/lib"
```

## Debugging Workflow

### Isolating Compilation Issues
```bash
# Test individual Vala files
valac --pkg=dependency file.vala

# Test with verbose output
valac -v --pkg=dependency file.vala

# Check generated C code
valac -C file.vala
gcc -c file.c  # See if C compilation works
```

### Testing Patches
```bash
# Always test patches before committing to APKBUILD
patch --dry-run -p1 < changes.patch

# Generate patches in correct format
diff -u a/file.vala b/file.vala > file.patch
```

### Build System Debugging
```bash
# Meson introspection
meson introspect output --targets
meson introspect output --buildsystem-files

# See actual compile commands
ninja -C output -v
```

## Best Practices

### Source Modifications
1. **New QNX-specific source changes go in patch files, not sed.** When you introduce a source change for QNX, make it a proper `.patch` file (see aports-patch-creation), not a `sed` rewrite hidden in `prepare()`. Patches are reviewable and a reviewer can see exactly what changed and why.
2. **Preserve inherited Alpine packaging behavior as-is.** This is the important distinction: the rule above applies to *new* QNX deltas we introduce. Existing Alpine `prepare()` logic, `sed` commands, generated files, and package-specific conventions that came with the upstream APKBUILD should be kept unchanged, unless that exact logic is what causes the QNX porting problem. Do not rewrite inherited Alpine sed into patches just for style; only touch it when it is the actual blocker.
3. **The one exception for new changes:** if the project's established standard for that specific package already uses simple `sed` setup, follow the package's own convention rather than forcing a patch.
4. **Document intent**: comment WHY each change exists, tied to a specific QNX/toolchain behavior.
5. **Test incrementally**: add one fix at a time.
6. **Keep changes minimal**: only modify what is necessary for QNX compatibility.

> Note on the Vala workarounds above: the `sed`-in-`prepare()` examples in the Vala section are a special case for valac segfault patterns where the simplification is mechanical and self-documenting. For ordinary QNX source fixes, prefer a patch per the rule above.

### Repo conventions and packaging facts

These are established conventions of the aports repo; following them keeps a port consistent and review-clean:

- **`somask`**: when a package installs libraries to a private directory rather than `/usr/lib`, use `somask` to suppress the public soname provides. Precedent: the neovim aport. No comment needed; it is an established pattern.
- **LTO is disabled repo-wide.** No comment is needed on LTO flags; it is convention (and aids QNX build stability).
- **`-Qunused-arguments`** is used across the repo without comments. Follow suit; do not annotate it. Recognize when it is needed: the QNX `cc` is clang, and the default hardening `CFLAGS` include flags clang considers unused for some compiles (for example `-fstack-clash-protection`). Under `-Werror` that becomes `error: argument unused during compilation: '...' [-Werror,-Wunused-command-line-argument]` and every object fails to compile. The fix is `export CFLAGS="$CFLAGS -Qunused-arguments"` (add `CXXFLAGS`/`CPPFLAGS` likewise for C++/preprocessed builds) at the top of `build()`. Confirmed on the json-c port (2026-06-18); precedents include aspell and bullet.

Do not comment repo-wide conventions like LTO or `-Qunused-arguments`. Reserve comments for package-specific QNX deviations (see qnx-apk-packaging step 3).

### Collaboration Support
- **Patch Generation**: Always use `diff -u` with `a/` and `b/` prefixes
- **Testing Patches**: Use `patch --dry-run` before applying
- **Documentation**: Keep notes on which files required which fixes

### Memory Management
- **Use debug builds**: `-g -O0` helps catch issues early
- **Single-threaded compilation**: Reduces race conditions
- **Disable LTO**: Link-Time Optimization causes instability on QNX

## Troubleshooting Decision Tree

```
Compilation Failure
├─ Header/Include Error?
│  ├─ "undefined reference to min/max" → Add macro #undef shim
│  └─ "Package not found" → Port dependency first
│
├─ Valac Segfault?
│  ├─ Identify crashing file → Compile individually
│  ├─ Complex property syntax? → Simplify with sed
│  ├─ Chained casts? → Replace with explicit 'as' casting
│  └─ Still failing? → Try splitting file into smaller units
│
├─ Linker Error?
│  ├─ "cannot find -l..." → Check dependency installation
│  └─ Runtime lib not found → Add RPATH to LDFLAGS
│
└─ Runtime Crash?
   ├─ Check library versions match
   └─ Verify all dependencies built for QNX
```

## Quick Reference Commands

```bash
# Iterate on a change in the unpacked tree (does NOT wipe src):
abuild clean && abuild unpack
cd src/pkgname-version/
# edit source, then build natively to test:
meson setup build && ninja -C build      # Meson projects
# or: rm -rf build && mkdir build && cd build && cmake .. && ninja   # CMake

# Final validation only (this WIPES src/, never use while iterating):
abuild -r -c -K

# Test individual Vala compilation
valac --pkg=glib-2.0 --pkg=gobject-2.0 file.vala

# Generate clean patches (header must be a/ and b/, see aports-patch-creation)
diff -u original/file.vala modified/file.vala > fix.patch

# Apply and test patch
patch --dry-run -p1 < fix.patch
patch -p1 < fix.patch

# Meson clean rebuild
rm -rf output
meson setup output
meson compile -C output -j1
```

## Additional Resources

For comprehensive QNX porting guidance beyond Alpine-specific workflows, refer to references/qnx-porting-guide.md which contains the full Linux to QNX porting documentation.

