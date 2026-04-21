
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

This codelab walks you through the simple process of installing Claude Code on the QNX Developer Desktop.

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

## Install Node.js
Duration: 2:00

Tools like Claude Code are based on Node.js and can be installed with NPM. So first, we have to install Node.js and NPM on our target.

1. On your QNX target, open a terminal (can be on the Desktop or SSH, for example) and run:
    ```bash
    sudo apk update
    sudo apk add npm
    ```

    (The default password for `sudo` is `qnxuser`.) You should see a successful installation of several packages, including `node`.

2. Test your Node.js installation:
    ```bash
    node -v
    ```

_Next up: install Claude Code._

---

## Install Claude Code
Duration: 3:00

We can install Claude Code directly from Anthropic using NPM.

1. Install the `claude` CLI:
    ```bash
    npm install -g @anthropic-ai/claude-code
    ```

2. Navigate to a directory you trust (empty or with a project in it) and run Claude Code:
    ```bash
    cd myProject/
    claude
    ```

The Claude Code interface should launch and guide you through the setup process. You may be asked to trust the current working directory and to log in to your Claude account.

If you are not prompted to log in, you can use the Claude command `/login`, where you can authenticate using a browser or by providing an API key.

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

Save the file and relaunch your Claude session with `claude`. It should now be aware of the context provided in this file, as will all future `claude` sessions on this system.

As you learn more about how Claude interacts with your system, or if you find any patterns that you have to correct across multiple projects, you can put guidance in this file to guide Claude from the start.

---

## Share Your Work
Duration: 2:00

Thanks for getting set up with Claude! 

We'd love to hear about what you're creating on QNX or if you've found interesting tweaks to make Claude even better at building projects on QNX. Please join us:

* on [Discord](https://discord.gg/Jj4EkkrFTT)
* on [Reddit](https://www.reddit.com/r/qnx)

_See you there—_

