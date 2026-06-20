---
name: qnx-platform-facts
description: "Build-method-independent QNX 8.0 platform facts for porting Linux/Alpine software: syscall and subsystem mappings (fork/epoll/eventfd/timerfd/inotify), libc gaps (sockets, regex), default stack size, file API differences, feature-test macros, and confirmed self-hosted toolchain quirks. Read this when a port hits a platform-level wall (missing syscall, link error for socket/regex, stack overflow, header type errors) regardless of how the package is built. Does NOT cover the patch workflow (see aports-patch-creation) or APKBUILD specifics (see alpine-qnx-porting)."
---

# QNX 8.0 Platform Facts

Durable platform truths for porting Linux software to QNX 8.0. These hold whether you build natively with abuild or by any other method, because they are properties of the OS and its libc, not the build system. Every entry here is either confirmed in our own porting work or documented platform behaviour. Do not add an entry until it is confirmed with command output or first-hand experience.

## How to use this skill

When a port fails at the platform level, match the symptom to a section below. If the issue is a missing Linux syscall, see "Syscall and subsystem mapping." If it is a link error, see "libc gaps." If a binary segfaults on large buffers, see "Stack size." For preprocessor and feature-test questions, see "Macros." If the problem is build-system or patch mechanics rather than platform behaviour, this is the wrong skill: go to alpine-qnx-porting or aports-patch-creation.

## Syscall and subsystem mapping

QNX is POSIX-compliant and a great deal of Linux code builds unchanged. The gaps are concentrated in Linux-specific kernel interfaces that have no direct QNX equivalent because QNX is a microkernel where these services live in user space. When you hit one, the options are: use the QNX equivalent, or write a shim that emulates the Linux call (see "Shims" below).

The common mappings:

`fork()` to `spawn()` / `spawnp()` / `posix_spawn()`. QNX does support fork, but spawn is preferred and is the right target when fork-based code misbehaves. The key behavioural difference: the QNX spawn family does not copy the entire parent address space the way fork does, so code that relies on copy-on-write of the full parent state after fork needs rework, not just a symbol swap. We confirmed this class of issue directly in the Epiphany download manager, where a fork-safety deadlock was resolved by switching from `g_app_info_launch` to `posix_spawn`.

`epoll` (epoll_create/epoll_wait) to `poll()` / `select()` for simple cases, or `ionotify()` plus the resource-manager event mechanism for the full readiness-notification model. epoll has no drop-in equivalent; expect to track state yourself.

`eventfd`, `signalfd`, `timerfd` to shim files. QNX has no direct equivalent for these Linux fd-based notification primitives. timerfd specifically maps conceptually to `TimerCreate()` with `SIGEV_PULSE`, delivering a pulse or message instead of a readable fd. eventfd is typically handled with a small shim that emulates the 64-bit counter semantics. FreeBSD has done equivalent shimming, which is a useful reference when writing one.

`inotify` to `devctl()` plus a resource manager. More involved than the Linux side but more flexible.

Unix domain sockets (UDS) to QNX native message passing (`MsgSend`/`MsgReceive`/`MsgReply`) and resource managers. If a project leans heavily on UDS for IPC, the clean port is to QNX messaging, though for a minimal port a UDS shim may be cheaper. Weigh it against how central the IPC is.

## libc gaps (the most common quick failures)

On most systems libc carries sockets and regular expressions. On QNX it does not. This produces link errors that look mysterious until you know the rule:

Sockets: link `libsocket` explicitly. Code that compiles but fails to link with undefined socket symbols needs `-lsocket`. The sockets live in `/usr/lib/libsocket.so`, not in libc. Note: an autotools project whose configure does `AC_SEARCH_LIBS(socket, ...)` finds and links `libsocket` on its own, so this wall may never appear for such projects. Observe what the build actually links before adding a `-lsocket` fix; do not add it reflexively because this skill mentions it.

Regular expressions: link `libregex` explicitly with `-lregex`.

This is a frequent first failure for networking and text-processing libraries. It is a link-line fix, not a source change.

## Stack size

QNX binaries get a much smaller default stack than Linux binaries. On Linux, GCC defaults to an 8MB stack (8388608 bytes). QNX defaults are far smaller. Consequences:

Code using large Variable Length Arrays (VLAs) or large hardcoded stack buffers will segfault on QNX where it ran fine on Linux. The fix is to set the stack size in the linker flags to match what the Linux build assumed, for example a linker flag setting stack-size to 8388608, rather than refactoring the code.

Code relying on a growing/split stack (GCC `-fsplit-stack`) may not compile at all under the QNX toolchain. There is no split-stack support to lean on; size the stack explicitly instead.

When a Linux program crashes on QNX specifically inside functions with big local arrays, suspect stack size before suspecting logic.

Diagnosing a suspected stack crash (confirmed pitfalls, 2026-06-18): a stack overflow scales with input. It shows up on large or deeply-nested inputs and clears when the input shrinks. So a SIGSEGV that reproduces on one specific small input, at the same place every time, is NOT a stack overflow: it is a logic or pointer bug on that path (this is how the json-c `test_json_patch` crash on a single negative array-index case was correctly ruled out as a stack issue). Also, do not use `ulimit -s` to test the hypothesis on QNX: it reports `unlimited` and does not reflect the real per-thread stack cap, so raising or reading it tells you nothing. Test by shrinking/growing the input, or by sizing the thread/link stack explicitly, not via `ulimit`.

## File API differences

The most important `open()` difference: on QNX you must pass `O_DIRECTORY` when the file descriptor will point to a directory. Linux code that opens directories without the flag will misbehave. This is a small but easy-to-miss source of runtime failures in code that walks or watches directories.

`PATH_MAX` lives in `<limits.h>` on QNX, not `<sys/syslimits.h>` (the BSD/macOS location some code assumes). Code that includes `<sys/syslimits.h>` for `PATH_MAX` needs the include corrected for QNX.

## Macros and feature-test symbols

`__QNX__` is defined by the QNX toolchain and is the symbol to gate QNX-specific code on. `__unix__` is also defined. To see every predefined symbol, pass the verbose flag to the compiler.

Feature-test macros control which APIs are exposed at compile time. Define `_QNX_SOURCE` to expose QNX extensions; `_POSIX_C_SOURCE` and `_XOPEN_SOURCE` control POSIX/X-Open surface. When a QNX API or type is missing from a header, a missing or wrong feature-test macro is a likely cause before you conclude the API is absent.

When adding QNX-specific code paths, gate them so other platforms are unaffected, for example wrapping QNX-only includes in `#if defined(__QNX__)`. This is the pattern upstream maintainers accept and keeps a patch upstreamable.

## Confirmed self-hosted toolchain quirks

These are facts established in our own native aports work on QNX 8.0 and are not in the public porting wikis. They are specific to the self-hosted (build-on-target) environment:

`sysconf(_SC_PHYS_PAGES)` returns -1 on QNX. Code that reads physical memory this way (for example to size caches or detect available RAM) needs a QNX path. Two QNX-native sources for the total have been used in our work: reading `/proc/vm/stats` (the WebKit MemoryPressureMonitor approach, where the Linux memory-pressure path does not exist on QNX and was replaced with a QNX-native monitor), and `MsgSend()` to the memory manager (`MEMMGR_COID` with `_MEM_INFO`). Both are recorded from prior ports; reconfirm which is correct on the current image with command output before relying on it, rather than assuming.

`CMAKE_SYSTEM_PROCESSOR` comes back as `unknown` in the self-hosted QNX CMake toolchain. All three CMake processor variables fail to populate. The confirmed workaround is to use `uname -m` (which returns `x86pc` on the x86_64 QEMU target) following the webkit2gtk team precedent, rather than relying on the CMake variable.

QNX uses BusyBox `patch`, which has zero fuzz tolerance. A patch that applies cleanly on Alpine (GNU patch, which tolerates fuzz) can be rejected on QNX. Always regenerate and validate patches against the QNX-unpacked tree. (The mechanics of this live in aports-patch-creation; it is noted here because it is a platform property, not just a workflow preference.)

System-level packages such as the QNX C runtime and microkernel components are provided by the platform and do not need to be declared as APK dependencies. Declaring them is noise.

A `//` comment on its own line inside a backslash-continued `#if` directive breaks compilation under the QNX toolchain. Put the comment inline on the last `defined()` line instead, not on its own continued line.

## Shims: when and when not

A shim is a small compatibility layer that implements a missing Linux API in terms of QNX primitives (the eventfd/timerfd/signalfd cases above). The tradeoff is real and worth stating in any patch that adds one:

For a shim: it keeps the upstream code nearly unchanged, which makes the port easier to maintain and far more likely to be accepted upstream. Against a shim: it can be less efficient than using the native QNX mechanism directly, and a hasty shim can introduce subtle bugs by only approximating the original semantics. Choose a shim when the Linux primitive is incidental to the program and a native rewrite would be invasive; choose the native QNX mechanism when the IPC or notification path is central to the program's behaviour and correctness.

## What is NOT in this skill (deliberately)

Cross-compilation setup (SDP, qcc/q++, toolchain .cmake files, Meson cross files, sysroot/staging, the qnx-ports build-files repo, the qnx-<tag> fork branch scheme, the check-tools JUnit harness) is the older cross-compile porting path and is not how we build native aports packages. It is kept as labelled reference material, not as platform fact, because absorbing it into a porting skill would mislead native-port work. If a task genuinely needs the cross-compile path, treat that as a separate context and consult the cross-compile reference rather than this skill.

