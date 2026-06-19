id: claude-code
title: Use Claude Code on QNX Developer Desktop
summary: Learn how to leverage Claude Code for target-aware AI development on QNX 8.
categories: AI
tags: beginner
difficulty: 1
status: published
authors: QNX Developer Relations
feedback_link: https://github.com/qnx/codelabs/issues


# Use Claude Code on QNX Developer Desktop

## Welcome
Duration: 1:00

This codelab walks you through the process of installing Claude Code on the QNX Developer Desktop.

### AI Coding on the Target

Agentic coding tools are even more effective for embedded project development when they run directly on the target system. With Claude Code running on your target, you can use it to build, deploy, test, debug, and monitor processes.

This codelab leaves you with a working Claude Code installation, and a sample additional system prompt you can use to make the tool more aware of the QNX system. Out of the box, these tools have a strong knowledge of QNX systems already, so you don't have to do additional work to teach them about using QNX shell commands or QNX APIs.

You'll be empowered to write new programs, utilities, libraries, or drivers for QNX, or to port existing repositories from other platforms to QNX.

Let's get started!

---

## Prerequisites
Duration: 2:00

You need a couple of things before you proceed:

1. A QNX 8.0 target with the QNX Developer Desktop (or at least the APK package manager and self-build tools — the desktop environment itself is not required). This can be a Raspberry Pi or a QEMU-based virtual machine, for example.
2. An Internet connection for your QNX target.
3. A Claude Code subscription or API key, as it is a paid service.

**Please be aware of your networking environment. If you're in a workplace or school, please confirm that there are no rules or procedures in place governing the use of AI tools and services on the network.**

_When you're ready, please continue._

---

## How Claude Code runs on QNX
Duration: 1:00

A quick note on what you're about to install, because it is not the stock package.

The official Claude Code is distributed as a single self-contained binary built with the [Bun](https://bun.sh) runtime. Bun has not been ported to QNX, so that stock binary does not run here. The Claude Code *application* itself is just JavaScript, though, and QNX does have Node.js.

The [`claude-code-qnx`](https://github.com/qnx/claude-code-qnx) project bridges that gap. It extracts the JavaScript application out of the official Bun binary and runs it under QNX's Node.js, with a small compatibility shim that reimplements the handful of Bun-specific APIs the app expects. The result is the same Claude Code, running natively on your QNX target through a launcher called `claude-qnx`.

In the next steps you'll install Node.js, then set up Claude Code by following that project's instructions.

_Next up: install Node.js._

---

## Install Node.js
Duration: 2:00

Claude Code runs on Node.js, so first install Node.js and npm on your target.

1. On your QNX target, open a terminal (on the Desktop or over SSH, for example) and run:
    ```bash
    sudo apk update
    sudo apk add npm
    ```

    (The default password for `sudo` is `qnxuser`.) You should see a successful installation of several packages, including `node`.

2. Test your Node.js installation:
    ```bash
    node -v
    ```

    Confirm it reports version 18 or later.

_Next up: set up Claude Code for QNX._

---

## Set up Claude Code for QNX
Duration: 4:00

Claude Code is set up on QNX using the [`claude-code-qnx`](https://github.com/qnx/claude-code-qnx) project. Rather than repeat its setup steps here (where they could fall out of date), follow the instructions in the project's `README.md`, which is the source of truth.

1. Open the project and read its `README.md`:

    [github.com/qnx/claude-code-qnx](https://github.com/qnx/claude-code-qnx)

2. Follow the README's setup instructions on your QNX target. At a high level, it has you clone the project, extract the Claude Code JavaScript bundle, install the launcher's dependencies, and put the `claude-qnx` launcher on your `PATH`.

3. When you finish, confirm the launcher runs:
    ```bash
    claude-qnx --version
    ```

> If a step gives you trouble, the project's README includes a troubleshooting section covering the most common issues.

_Next up: run Claude Code and log in._

---

## Run Claude Code
Duration: 3:00

1. Navigate to a directory you trust (empty or with a project in it) and launch Claude Code with the QNX launcher:
    ```bash
    cd myProject/
    claude-qnx
    ```

The Claude Code interface should launch and guide you through the setup process. You may be asked to trust the current working directory and to log in to your Claude account.

If you are not prompted to log in, you can use the Claude command `/login`, where you can authenticate using a browser or by providing an API key. You can also set an `ANTHROPIC_API_KEY` environment variable in your shell profile ahead of time if you prefer.

_Next up: give Claude some QNX tips._

---

## Add to the System Prompt
Duration: 2:00

By default, Claude has a pretty good understanding of QNX systems, but out of the box it won't be aware that it is running **on** a QNX system. You can save some initial back-and-forth with the tool by providing these details up front.

Create a file to add details to the system prompt: `~/.claude/CLAUDE.md`.

In the file, place this suggested text. Feel free to modify it or add to it — this is just a suggestion based on our work with the tool.

```CLAUDE.md
You are running on the operating system QNX OS 8.0. This system may be a QEMU-based virtual machine or a Raspberry Pi board. If you think it is relevant, you can use `uname -a` to determine which type of system it is.

QNX is not Linux. QNX is almost fully POSIX compliant though, so you'll find that many Linux development techniques also work on QNX. Some techniques do not though, and require QNX-specific approaches. 

The XFCE desktop environment available here uses Wayland, but don't assume it's available on this system or is open. If the desktop environment is relevant to your task, ask the user if it is available.

The system uses `apk` for package management. It works like `apk` does on Alpine Linux. You can search for packages and add them as needed. Note that any QNX-specific packages are prefixed with `qnx-`.

This system has access to clang (for building C), clang++ (for building C++), and the Python interpreter.

QNX shell note: when writing `sh` scripts with `set -u`, avoid expanding `"$@"` unless `$# > 0`; on this system's shell, an empty `"$@"` can trigger `@: parameter not set`.

By default, the sudo password is `qnxuser`.
```

Save the file and relaunch your Claude session with `claude-qnx`. It should now be aware of the context provided in this file, as will all future `claude-qnx` sessions on this system.

As you learn more about how Claude interacts with your system, or if you find any patterns that you have to correct across multiple projects, you can put guidance in this file to guide Claude from the start.

---

## Share Your Work
Duration: 2:00

Thanks for getting set up with Claude! 

We'd love to hear about what you're creating on QNX or if you've found interesting tweaks to make Claude even better at building projects on QNX. Please join us:

* on [Discord](https://discord.gg/Jj4EkkrFTT)
* on [Reddit](https://www.reddit.com/r/qnx)

_See you there—_
