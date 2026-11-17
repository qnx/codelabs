id: qnx8-deterministic-ipc-safety-cage
title: Defeating Priority Lowering & Starvation on QNX 8.0
summary: Build a deterministic QNX 8.0 watchdog supervisor from scratch—reproducing silent IPC priority lowering, catching deadlocked threads with 1kHz kernel pulses, and locking down untrusted processes with procmgr_ability.
categories: IPC, Real-Time, Security
tags: qnx8, ipc, rtos, watchdog, security
difficulty: Intermediate
status: Published
authors: Prem Jha (mynameisprem-pj)
feedback_link: https://github.com/qnx/codelabs/issues

# Defeating Priority Lowering & Starvation on QNX 8.0

## Overview
Duration: 0:03:00

When Linux or general-purpose C developers move to **QNX Software Development Platform (SDP) 8.0**, they almost always hit two dangerous real-time traps when building mixed-criticality systems (such as pairing an AI inference thread with a safety-critical actuator controller):

1. **Silent Server Priority Lowering:** By default, QNX Neutrino IPC channels adjust a server thread's priority to match the *incoming client's priority* on `MsgReceive()`. A Priority-250 safety supervisor receiving a message from a Priority-20 AI client **silently drops to Priority 20**—allowing a Priority-35 background thread to starve your "top-priority" safety loop!
2. **Deadlocked Client Blindness:** If your safety supervisor only checks system health inside `MsgReceive()` when a client calls `MsgSend()`, a completely deadlocked or starved client sends *zero* messages—leaving your actuator unguarded forever.

In this hands-on 25-minute QNX 8.0 lab, you will **reproduce the exact priority-lowering bug live in `pidin`**, exploit it with a CPU starvation thread, and then engineer a bulletproof **sub-2-microsecond QNX 8.0 Safety Cage** from a blank directory.

### What You Will Learn
* How QNX synchronous message passing (`MsgSend`, `MsgReceive`, `MsgReply`) dynamically adjusts thread priorities—and how to lock ceiling priority with `_NTO_CHF_FIXED_PRIORITY`.
* How to multiplex **synchronous client messages** and **1,000 Hz kernel hardware timer pulses (`SIGEV_PULSE_INIT`)** on a single QNX channel using `struct _pulse`.
* How to profile real-time reaction latency in nanoseconds using `ClockCycles()` and `SYSPAGE_ENTRY(qtime)->cycles_per_sec`.
* How to sandbox untrusted threads at the microkernel level using QNX 8.0's `procmgr_ability()`.

### Prerequisites
* A free non-commercial **QNX Everywhere** license with **QNX SDP 8.0** installed (`$HOME/qnx800/qnxsdp-env.sh`).
* A running QNX 8.0 target (`x86_64` Quick Start Target Image on QEMU, or Raspberry Pi 5) reachable via console or SSH.
* Basic familiarity with C and POSIX threads.

Positive
: **Zero Hardware Required:** Every exercise in this codelab runs identically on a QNX 8.0 `x86_64` QEMU virtual machine on Linux or Windows WSL2, as well as physical ARM64 hardware like Raspberry Pi 5.

---

## Set Up Your Lab Workspace
Duration: 0:03:00

Create a clean, standalone workspace on your Linux or WSL2 host and load the QNX SDP 8.0 cross-compilation environment:

```bash
mkdir -p ~/qnx-safety-lab && cd ~/qnx-safety-lab
source $HOME/qnx800/qnxsdp-env.sh

```

Verify that the QNX `qcc` compiler targeting `x86_64` (or `aarch64le` if using Raspberry Pi 5) is active:

```bash
qcc -V

```

Expected output:

```console
cc: targets available in /home/user/qnx800/host/linux/x86_64/etc/qcc:
    12.2.0,gcc_ntoaarch64le        (aarch64)
    12.2.0,gcc_ntox86_64           (default)

```

### Define the Shared IPC Message Contract (`lab_ipc.h`)

On QNX 8.0, a single channel can receive both **kernel pulses** (4-byte payload + code) and **client structs** (`MsgSend`). For `MsgReceive()` to safely distinguish both without corrupting memory, your message `struct` **must** embed `struct _pulse` as its very first member.

Create `lab_ipc.h`:

```c
#ifndef LAB_IPC_H
#define LAB_IPC_H

#include <stdint.h>
#include <sys/neutrino.h>
#include <sys/dispatch.h>

#define LAB_ATTACH_NAME       "qnx_lab_watchdog"
#define PULSE_CODE_HEARTBEAT  (_PULSE_CODE_MINAVAIL + 1)
#define MSG_AI_COMMAND        0x5158  /* 'QX' */
#define SAFE_LIMIT_MM         18.00

typedef struct {
    struct _pulse hdr;           /* MUST be first member for mixed pulse/msg channel */
    uint16_t      type;
    uint32_t      seq;
    double        target_mm;
} lab_msg_t;

typedef struct {
    uint32_t      clamped;
    double        applied_mm;
    uint64_t      reaction_ns;
} lab_reply_t;

#endif

```

Negative
: **Critical QNX Pitfall:** Never put `uint16_t type` *before* `struct _pulse hdr` on a channel that receives kernel timer pulses! When `MsgReceive()` returns `rcvid == 0`, the microkernel writes a `struct _pulse` starting at byte offset `0` of your receive buffer.

---

## Step 1: Reproduce the Silent Priority-Lowering Bug

Duration: 0:06:00

Let's write a naive "High-Priority" Supervisor that elevates itself to **Priority `250` (`SCHED_FIFO`)**, calls `name_attach(NULL, LAB_ATTACH_NAME, 0)` with default channel flags, and prints its *actual* active priority after receiving a message from a **Priority `20**` client.

Create `buggy_supervisor.c`:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <sched.h>
#include "lab_ipc.h"

int main(void) {
    struct sched_param sp = { .sched_priority = 250 };
    pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);

    /* BUG: Default name_attach(NULL, ...) creates a channel WITHOUT _NTO_CHF_FIXED_PRIORITY */
    name_attach_t *attach = name_attach(NULL, LAB_ATTACH_NAME, 0);
    if (!attach) {
        perror("name_attach");
        return 1;
    }

    int policy;
    pthread_getschedparam(pthread_self(), &policy, &sp);
    printf("[Supervisor] Booted at Priority %d. Waiting for client...\n", sp.sched_priority);

    lab_msg_t msg;
    while (1) {
        int rcvid = MsgReceive(attach->chid, &msg, sizeof(msg), NULL);
        if (rcvid > 0) {
            pthread_getschedparam(pthread_self(), &policy, &sp);
            printf("[Supervisor] Received seq=%u -> ACTIVE PRIORITY DROPPED TO: %d!\n",
                   msg.seq, sp.sched_priority);

            lab_reply_t rep = { .clamped = 0, .applied_mm = msg.target_mm, .reaction_ns = 0 };
            MsgReply(rcvid, 0, &rep, sizeof(rep));
        }
    }
}

```

Now create a low-priority **Priority `20**` client (`client_ai.c`) that sends 3 messages:

```c
#include <stdio.h>
#include <unistd.h>
#include <pthread.h>
#include <sched.h>
#include "lab_ipc.h"

int main(void) {
    struct sched_param sp = { .sched_priority = 20 };
    pthread_setschedparam(pthread_self(), SCHED_RR, &sp);

    int coid = name_open(LAB_ATTACH_NAME, 0);
    if (coid < 0) { perror("name_open"); return 1; }

    for (uint32_t i = 1; i <= 3; i++) {
        lab_msg_t msg = { .type = MSG_AI_COMMAND, .seq = i, .target_mm = 12.5 };
        lab_reply_t rep;
        MsgSend(coid, &msg, sizeof(msg), &rep, sizeof(rep));
        usleep(200000);
    }
    name_close(coid);
    return 0;
}

```

Compile both with `qcc`, copy them to `/data/bin` (or `/tmp`) on your QNX 8.0 target, and run them:

```bash
qcc -Vgcc_ntox86_64 -Wall -O2 buggy_supervisor.c -o buggy_supervisor
qcc -Vgcc_ntox86_64 -Wall -O2 client_ai.c -o client_ai

```

On your QNX 8.0 target shell:

```sh
/tmp/buggy_supervisor &
/tmp/client_ai

```

Look at the output printed by QNX 8.0:

```console
[Supervisor] Booted at Priority 250. Waiting for client...
[Supervisor] Received seq=1 -> ACTIVE PRIORITY DROPPED TO: 20!
[Supervisor] Received seq=2 -> ACTIVE PRIORITY DROPPED TO: 20!
[Supervisor] Received seq=3 -> ACTIVE PRIORITY DROPPED TO: 20!

```

Positive
: **Why did QNX do this?** For general resource managers (like a filesystem or network stack), inheriting client priority prevents a Priority-10 client's giant file read from preempting a Priority-100 thread! However, for a **Safety Supervisor**, dropping from `250` to `20` means *any* Priority-25 spinner thread will starve your safety loop!

Kill the buggy supervisor before moving on (`slay buggy_supervisor`).

---

## Step 2: Lock Priority 250f & Add a 1kHz Hardware Pulse Watchdog

Duration: 0:07:00

To build a true hard real-time safety cage on QNX 8.0, we fix **both** architectural flaws simultaneously:

1. Pre-create our channel with `ChannelCreate(_NTO_CHF_FIXED_PRIORITY | _NTO_CHF_DISCONNECT)` and pass it into `dispatch_create_channel(chid, 0)` before calling `name_attach()`. Now the microkernel **never** alters our Priority `250f`.
2. Attach a `1,000 Hz` (`1.0 ms`) `CLOCK_MONOTONIC` kernel pulse (`SIGEV_PULSE_INIT`) directly to our own channel at Priority `250`. Even if `client_ai` freezes completely, the kernel wakes `MsgReceive()` every `1.0 ms` (`rcvid == 0`) so we can check `ClockCycles()` elapsed time and clamp the actuator within `2.50 ms`!

Create `fixed_supervisor.c`:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <pthread.h>
#include <sched.h>
#include <sys/neutrino.h>
#include <sys/syspage.h>
#include <sys/siginfo.h>
#include "lab_ipc.h"

int main(void) {
    /* 1. Lock thread at SCHED_FIFO Priority 250 */
    struct sched_param sp = { .sched_priority = 250 };
    pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);

    /* 2. Create Fixed-Priority Channel -> immune to client priority lowering! */
    int chid = ChannelCreate(_NTO_CHF_FIXED_PRIORITY | _NTO_CHF_DISCONNECT);
    dispatch_t *dpp = dispatch_create_channel(chid, 0);
    name_attach_t *attach = name_attach(dpp, LAB_ATTACH_NAME, 0);
    if (!attach) { perror("name_attach"); return 1; }

    /* 3. Arm 1,000 Hz (1.0 ms) Kernel Hardware Pulse Watchdog */
    int self_coid = ConnectAttach(0, 0, attach->chid, _NTO_SIDE_CHANNEL, 0);
    struct sigevent ev;
    SIGEV_PULSE_INIT(&ev, self_coid, 250, PULSE_CODE_HEARTBEAT, 0);

    timer_t tid;
    timer_create(CLOCK_MONOTONIC, &ev, &tid);
    struct itimerspec its = {
        .it_value    = { .tv_sec = 0, .tv_nsec = 1000000L },
        .it_interval = { .tv_sec = 0, .tv_nsec = 1000000L }
    };
    timer_settime(tid, 0, &its, NULL);

    uint64_t cps = SYSPAGE_ENTRY(qtime)->cycles_per_sec;
    uint64_t last_hb = ClockCycles();
    int client_seen = 0, safe_clamped = 0;

    printf("[Fixed Supervisor] Locked at Priority 250f | 1kHz Pulse Armed\n");

    lab_msg_t msg;
    while (1) {
        int rcvid = MsgReceive(attach->chid, &msg, sizeof(msg), NULL);
        uint64_t t_in = ClockCycles();

        if (rcvid == 0 && msg.hdr.code == PULSE_CODE_HEARTBEAT) {
            /* Autonomous 1kHz Kernel Watchdog Path */
            if (client_seen && !safe_clamped) {
                uint64_t age_us = ((t_in - last_hb) * 1000000ULL) / cps;
                if (age_us > 2500) {
                    safe_clamped = 1;
                    uint64_t react_ns = ((ClockCycles() - t_in) * 1000000000ULL) / cps;
                    printf("[WATCHDOG TRIP] Client starved (%llu us > 2500 us)! "
                           "Clamped to %.2f mm in %llu ns!\n",
                           (unsigned long long)age_us, SAFE_LIMIT_MM,
                           (unsigned long long)react_ns);
                }
            }
            continue;
        }

        if (rcvid > 0 && msg.type == MSG_AI_COMMAND) {
            client_seen = 1;
            last_hb = t_in;

            int policy;
            pthread_getschedparam(pthread_self(), &policy, &sp);

            double out_mm = msg.target_mm;
            if (fabs(out_mm) > SAFE_LIMIT_MM || safe_clamped) {
                safe_clamped = 1;
                out_mm = (out_mm >= 0) ? SAFE_LIMIT_MM : -SAFE_LIMIT_MM;
            }

            uint64_t react_ns = ((ClockCycles() - t_in) * 1000000000ULL) / cps;
            printf("[IPC OK] seq=%u | Prio=%d (LOCKED!) | in=%.1f -> out=%.1f mm | react=%llu ns\n",
                   msg.seq, sp.sched_priority, msg.target_mm, out_mm,
                   (unsigned long long)react_ns);

            lab_reply_t rep = { .clamped = safe_clamped, .applied_mm = out_mm, .reaction_ns = react_ns };
            MsgReply(rcvid, 0, &rep, sizeof(rep));
        }
    }
}

```

---

## Step 3: Sandbox the Untrusted Client with `procmgr_ability` & Bound IPC with `TimerTimeout`

Duration: 0:06:00

What if a bug or memory exploit inside `client_ai` tries to call `pthread_setschedparam(..., 255)` to overpower our Priority-250 supervisor, or spawn rogue processes?

QNX 8.0 provides **`procmgr_ability()`** (`<sys/procmgr.h>`), allowing a process to **permanently drop kernel abilities** right after initialization. Let's also wrap `MsgSend()` with **`TimerTimeout(CLOCK_MONOTONIC, _NTO_TIMEOUT_SEND | _NTO_TIMEOUT_REPLY, ...)`** so no IPC call can ever block indefinitely.

Create `sandboxed_ai_test.c` (which tests nominal messages, an unsafe `25.4 mm` excursion, and a `15 ms` starvation stall, plus verifies that priority escalation is denied by the microkernel):

```c
#include <stdio.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <pthread.h>
#include <sched.h>
#include <sys/procmgr.h>
#include <sys/neutrino.h>
#include "lab_ipc.h"

int main(void) {
    struct sched_param sp = { .sched_priority = 20 };
    pthread_setschedparam(pthread_self(), SCHED_RR, &sp);

    /* QNX 8.0 Least-Privilege Sandbox: Permanently drop ability to raise priority, spawn, or do raw I/O */
    procmgr_ability(0,
        PROCMGR_ADN_ROOT | PROCMGR_ADN_NONROOT | PROCMGR_AOP_DENY | PROCMGR_AOP_LOCK |
        PROCMGR_AID_PRIORITY,
        PROCMGR_ADN_ROOT | PROCMGR_ADN_NONROOT | PROCMGR_AOP_DENY | PROCMGR_AOP_LOCK |
        PROCMGR_AID_SPAWN,
        PROCMGR_ADN_ROOT | PROCMGR_ADN_NONROOT | PROCMGR_AOP_DENY | PROCMGR_AOP_LOCK |
        PROCMGR_AID_IO,
        PROCMGR_AID_EOL);

    /* Verify QNX microkernel blocks rogue escalation to Priority 250! */
    sp.sched_priority = 250;
    int err = pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);
    printf("[AI Sandbox] Attempted escalation to Prio 250 -> Kernel returned: %s (errno=%d)\n",
           strerror(err), err);

    int coid = name_open(LAB_ATTACH_NAME, 0);
    if (coid < 0) { perror("name_open"); return 1; }

    double test_targets[3] = { 11.5, 14.0, 25.4 }; /* 3rd target breaches 18.0 mm! */
    for (int i = 0; i < 3; i++) {
        /* Bound MsgSend/Reply to 5 ms max via QNX kernel TimerTimeout */
        uint64_t timeout_ns = 5000000ULL;
        struct sigevent tev;
        SIGEV_UNBLOCK_INIT(&tev);
        TimerTimeout(CLOCK_MONOTONIC, _NTO_TIMEOUT_SEND | _NTO_TIMEOUT_REPLY, &tev, &timeout_ns, NULL);

        lab_msg_t msg = { .type = MSG_AI_COMMAND, .seq = (uint32_t)(i + 1), .target_mm = test_targets[i] };
        lab_reply_t rep;
        MsgSend(coid, &msg, sizeof(msg), &rep, sizeof(rep));
        usleep(1000); /* 1.0 ms nominal heartbeat */
    }

    printf("[AI Sandbox] Simulating 15 ms CPU Starvation stall...\n");
    usleep(15000); /* Triggers autonomous 1kHz Watchdog pulse on Supervisor! */

    name_close(coid);
    return 0;
}

```

---

## Step 4: Compile, Verify in `pidin`, & Measure Sub-2µs Determinism

Duration: 0:03:00

Compile both upgraded binaries on your host:

```bash
qcc -Vgcc_ntox86_64 -Wall -O2 fixed_supervisor.c -lm -o fixed_supervisor
qcc -Vgcc_ntox86_64 -Wall -O2 sandboxed_ai_test.c -o sandboxed_ai_test

```

Copy them to your QNX 8.0 target and run the verification sequence:

```sh
/tmp/fixed_supervisor &
pidin | grep fixed_supervisor
/tmp/sandboxed_ai_test

```

Observe the deterministic microkernel execution:

```console
[Fixed Supervisor] Locked at Priority 250f | 1kHz Pulse Armed
 413712   1 tmp/fixed_supervisor 250f RECEIVE     1
[AI Sandbox] Attempted escalation to Prio 250 -> Kernel returned: Operation not permitted (errno=1)
[IPC OK] seq=1 | Prio=250 (LOCKED!) | in=11.5 -> out=11.5 mm | react=890 ns
[IPC OK] seq=2 | Prio=250 (LOCKED!) | in=14.0 -> out=14.0 mm | react=760 ns
[IPC OK] seq=3 | Prio=250 (LOCKED!) | in=25.4 -> out=18.0 mm | react=810 ns
[AI Sandbox] Simulating 15 ms CPU Starvation stall...
[WATCHDOG TRIP] Client starved (2984 us > 2500 us)! Clamped to 18.00 mm in 640 ns!

```

Positive
: **Mission Accomplished!** Look at all three proofs in that console log:

1. `procmgr_ability()` blocked the untrusted process from escalating priority (`Operation not permitted`)—even if launched as `root`!
2. `_NTO_CHF_FIXED_PRIORITY` held the Supervisor steady at `Prio=250` across every `MsgReceive()`.
3. Both spatial clamping (`25.4 -> 18.0 mm`) and silent heartbeat starvation (`> 2500 us`) were caught in **under 1 microsecond (`640–890 ns`)**!

### Next Steps & Full Reference Architecture

To see this exact QNX 8.0 safety pattern scaled into a full 5-binary surgical robotics architecture—complete with a `/dev/surgical_arm` POSIX Resource Manager (`ConnectClientInfo_r` sender verification) and a 30Hz Surgical Robotics Cockpit—explore the [NeuroGuard-RT Open-Source Repository](https://github.com/mynameisprem-pj/neuroguard-rt).

```
