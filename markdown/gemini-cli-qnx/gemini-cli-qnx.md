id: gemini-cli-qnx
title: Use Gemini CLI on QNX Developer Desktop
summary: Learn how to set up and use Gemini CLI for target-aware AI development on QNX 8.
categories: AI
tags: beginner
difficulty: 1
status: published
authors: Deep Chordia
feedback_link: https://github.com/qnx/codelabs/issues

# Use Gemini CLI on QNX Developer Desktop

## Welcome

Duration: 1.00

This codelab walks you through the process of installing Gemini CLI on the QNX Developer Desktop.

This codelab follows the [`gemini-cli-qnx` setup guide](https://github.com/qnx/gemini-cli-qnx/blob/main/README.md).

### AI Coding on the Target

Agentic coding tools are even more effective for embedded project development when they run directly on the target system. With Gemini CLI running on your target, you can use it to build, deploy, test, debug, and monitor processes.

This codelab leaves you with a working Gemini CLI installaton, and a sample additional system prompt you can use to make the tool more aware of the QNX system. Out of the box, these tools have a fair knowledge of QNX systems already, so you don't have to do additional work to teach them about using QNX shell commands or QNX APIs. Additionally, you can leverage [qnx-agent-skills](https://github.com/qnx/qnx-agent-skills) to enable skills-capable coding agent as your QNX 8 development companion.

You'll be empowered to write new programs, utilities, libraries and drivers for QNX, and to port existing repositories from other platforms to QNX.

Let's get started!

---

## Prerequisites

Duration: 2:00

You need a couple of things before you proceed:

1. A QNX 8.0 target with the QNX Developer Desktop (or at least the APK package manager and self-build tools — the desktop environment itself is not required). This can be a Raspberry Pi or a QEMU-based virtual machine, for example.
2. An Internet connection for your QNX target.

**Please be aware of your networking environment. If you're in a workplace or school, please confirm that there are no rules or procedures in place governing the use of AI tools and services on the network.**

_When you're ready, please continue._

---

## How Gemini CLI runs on QNX

Duration: 1:00

A quick note on what you're about to install, because it adds some configurations atop the vanilla gemini-cli package bundle.

The official Gemini CLI relies on native C++ dependencies and build tools (like `esbuild`, `node-pty`, and `keytar`) that do not compile on QNX. The Gemini CLI _application_ itself, however, is bundled JavaScript, and QNX does have Node.js.

The `gemini-cli-qnx` project bridges that gap. It extracts the pre-built JavaScript bundle directly from the published npm package, bypassing native builds entirely. The `gemini-cli-qnx` launcher runs the application under QNX's Node.js, configuring file-based credential storage and standard child processes in place of unavailable desktop keychains and native PTYs.

In the next steps you'll install Node.js and npm, then set up Gemini CLI.

_Next up: install Node.js and npm._

---

## Install Node.js

Duration: 2:00

Gemini CLI runs on Node.js, so first install Node.js and npm on your target.

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

_Next up: set up Gemini CLI for QNX._

---

## Set up Gemini CLI for QNX

Duration: 4:00

Use the [`gemini-cli-qnx`](https://github.com/qnx/gemini-cli-qnx.git) project to install Gemini CLI on your QNX target.

1. Open the project's [`README.md`](https://github.com/qnx/gemini-cli-qnx/blob/main/README.md) and follow the set up instructions listed.

2. When you finish, confirm the launcher runs:
   ```bash
   gemini-qnx --version
   ```

> If a step gives you trouble, the project's installation guide includes a QNX behaviours section covering the most common issues.

_Next up: run Gemini CLI and log in._

---

## Run Gemini CLI

Duration: 3:00

Navigate to a directory you trust (empty or with a project in it) and launch Gemini CLI with the QNX launcher:

```bash
cd ~/qnx_workspace/new_project
gemini-qnx
```

The Gemini CLI interface will launch and guide you through the setup process. You must use the option "2. Use Gemini API Key" to authenticate Gemini CLI in QNX. For this, sign up or login to your Google AI Studio account and setup a project and an API Key.

If you are not prompted to log in or want to change the API key, use the `/auth` command, where you can authenticate again.

_Next up: give Gemini some QNX tips._

---

## Add to the System Prompt

Duration: 2:00

By default, Gemini has a decent understanding of QNX systems, but out of the box it won't be aware that it is running **on** a QNX system. You can save some initial back-and-forth with the tool by providing these details up front.

Create a file to add details to the system prompt: `~/.gemini/GEMINI.md`.

In the file, place this suggested text. Feel free to modify it or add to it — this is just a suggestion based on our work with the tool.

```console
You are running on the operating system QNX OS 8.0. This system may be a QEMU-based virtual machine or a Raspberry Pi board. If you think it is relevant, you can use `uname -a` to determine which type of system it is.

QNX is not Linux. QNX is almost fully POSIX compliant though, so you'll find that many Linux development techniques also work on QNX. Some techniques do not though, and require QNX-specific approaches.

The XFCE desktop environment available here uses Wayland, but don't assume it's available on this system or is open. If the desktop environment is relevant to your task, ask the user if it is available.

The system uses `apk` for package management. It works like `apk` does on Alpine Linux. You can search for packages and add them as needed. Note that any QNX-specific packages are prefixed with `qnx-`.

This system has access to clang (for building C), clang++ (for building C++), and the Python interpreter.

QNX shell note: when writing `sh` scripts with `set -u`, avoid expanding `"$@"` unless `$# > 0`; on this system's shell, an empty `"$@"` can trigger `@: parameter not set`.

By default, the sudo password is `qnxuser`.
```

Save the file and relaunch your Gemini session with `gemini-qnx`. It should now be aware of the context provided in this file, as will all future `gemini-qnx` sessions on this system.

As you learn more about how Gemini interacts with your system, or if you find any patterns that you have to correct across multiple projects, you can put guidance in this file to guide Gemini from the start.

---

## Share Your Work

Duration: 2:00

Thanks for getting set up with Gemini!

We'd love to hear about what you're creating on QNX or if you've found interesting tweaks to make Gemini even better at building projects on QNX. Please join us:

- on [Discord](https://discord.gg/Jj4EkkrFTT)
- on [Reddit](https://www.reddit.com/r/qnx)

_See you there—_
