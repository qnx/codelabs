id: fail-safe-control-loop
title: Build a 1 ms Control Loop That Fails Safe on QNX 8.0
summary: Wake a control loop every millisecond with a timer pulse, measure every tick it misses, keep busy work from starving it, and add a watchdog that forces a safe state when the loop dies and never restarts it.
categories: Real-Time & Safety
tags: intermediate
platforms: QEMU
published: 2026-11-20
featured: false
status: published
authors: angelraph
feedback_link: https://github.com/qnx/codelabs/issues

# Build a 1 ms Control Loop That Fails Safe on QNX 8.0

## Overview
Duration: 3:00

A robot that pushes on something, or a machine that heats, pumps or cuts, usually has one loop at its heart: read the sensors, decide, drive the actuator, every millisecond. This codelab builds that loop on QNX 8.0, and then makes it fail safe.

You will write three small C programs and run them on QNX 8.0 in QEMU:

* **ctl**, a control loop woken every millisecond by a timer pulse on a private channel. It counts the ticks it runs and the ticks it misses.
* **wd**, a watchdog that runs above the loop's priority and watches its heartbeat. If the loop goes quiet, it forces a safe state and holds it. It never restarts the loop.
* **spin**, a CPU storm you can run below or above the loop's priority to see what priorities really buy you.

Everything in this codelab comes from building [Elvrek](https://github.com/angelraph/elvrek), a safety controller for a chest compression robot on QNX 8.0, including two mistakes we made along the way so you don't have to.

### What you'll learn

* How to drive a periodic loop with `timer_create`, a pulse and `MsgReceivePulse`
* How to read the system tick your timer runs on, and why you should never assume it
* How to measure missed ticks with `ClockCycles`
* What `SCHED_FIFO` priorities protect you from, and what they don't
* How to build a watchdog that forces a safe state, and why it should not restart the loop
* Why queued timer pulses can lie to you after a stall

### What you'll need

* A QNX Everywhere licence and QNX SDP 8.0 on a Linux host or WSL
* A QNX 8.0 target. This codelab uses the x86_64 Quick Start Target Image in QEMU. If you don't have one yet, follow [Run QSTI on QEMU using WSL](https://qnx.github.io/codelabs/qsti-qemu-on-wsl/#0) or [Set up QSTI and QEMU on Ubuntu](https://qnx.github.io/codelabs/setup-qsti-qemu-on-ubuntu/#0)
* SSH access to the target as root

## Get the code
Duration: 3:00

The three programs and a Makefile are in the `src` folder next to this codelab:

```text
src/
  loop.h     the shared heartbeat between the loop and the watchdog
  ctl.c      the 1 ms control loop
  wd.c       the watchdog
  spin.c     a CPU storm at a priority you choose
  Makefile
  demo.sh    runs every step of this codelab on the target
```

Build them with the SDP toolchain:

```bash
source ~/qnx800/qnxsdp-env.sh
cd src
make            # for a Raspberry Pi 5: make ARCH=aarch64le
```

Copy them to the target:

```bash
ssh root@<target-ip> "mkdir -p /data/codelab"
scp ctl wd spin demo.sh root@<target-ip>:/data/codelab/
```

## A timer pulse every millisecond
Duration: 8:00

On QNX the cleanest way to run something every millisecond is a timer that sends a **pulse** to a **private channel**, and a loop that blocks on `MsgReceivePulse`. A pulse is a tiny, non-blocking message, it carries a priority, and nothing outside your process can connect to a private channel.

Here is the heart of `ctl.c`:

```c
/* run the loop at a real-time priority */
struct sched_param sp = { .sched_priority = prio };            /* 60 by default */
pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);

/* a private channel and a 1 ms timer that pulses it */
int chid = ChannelCreate(_NTO_CHF_PRIVATE);
int coid = ConnectAttach(0, 0, chid, _NTO_SIDE_CHANNEL, 0);
struct sigevent ev;
SIGEV_PULSE_INIT(&ev, coid, prio, PULSE_TICK, 0);
timer_t tid;
timer_create(CLOCK_MONOTONIC, &ev, &tid);
struct itimerspec its = { .it_value = { 0, 1000000 }, .it_interval = { 0, 1000000 } };
timer_settime(tid, 0, &its, NULL);

for (;;) {
    struct _pulse p;
    if (MsgReceivePulse(chid, &p, sizeof(p), NULL) == -1) continue;
    if (p.code != PULSE_TICK) continue;
    /* read sensors, decide, drive the actuator ... */
}
```

Notice that the pulse is created at the same priority as the loop. When the pulse arrives, the kernel runs the receiving thread at that priority.

Positive
: Use `CLOCK_MONOTONIC` for control timers. It never jumps when someone sets the time of day.

## Check the tick before you trust it
Duration: 6:00

QNX timers expire on **system clock ticks**. A 1 ms timer on a 1 ms tick behaves very differently from a 1 ms timer on a 10 ms tick, so the first thing `ctl` does is ask:

```c
struct _clockperiod cp;
struct timespec res;
ClockPeriod(CLOCK_REALTIME, NULL, &cp, 0);       /* read only: new value is NULL */
clock_getres(CLOCK_MONOTONIC, &res);
printf("ctl: system clock period %u ns, timer resolution %ld ns\n", cp.nsec, res.tv_nsec);
```

Run it for three seconds:

```bash
cd /data/codelab
./ctl -s 3
```

On QNX 8.0 in QEMU we see:

```text
ctl: system clock period 1000000 ns, timer resolution 1000000 ns
ctl: running at priority 60, 1 ms timer pulse
ctl:   1 s  ticks  993  missed    4
ctl:   2 s  ticks  985  missed    5
ctl:   3 s  ticks  756  missed  173
```

Negative
: **A mistake we made.** Early on, one run of our controller counted only about 850 ticks a second, and we "fixed" it by asking QNX for a 0.5 ms system tick with `ClockPeriod(CLOCK_REALTIME, &new, NULL, 0)`. The next runs looked better, so we believed it. When we finally tested that call on its own, it returned `ENOTSUP`: on QNX 8.0 in QEMU the clock period is a fixed 1 ms. The call had never done anything, and the slow run was the virtual machine. Read the tick, check the return value of every call that changes the system, and measure before you credit a fix.

## Measure every missed tick
Duration: 6:00

A loop that silently runs slow is worse than one that crashes. `ctl` timestamps every wakeup with `ClockCycles`, the free-running cycle counter, and counts whole periods it slept through:

```c
const uint64_t cps = SYSPAGE_ENTRY(qtime)->cycles_per_sec;
const uint64_t period = cps / 1000;                 /* 1 ms in cycles */
...
uint64_t now = ClockCycles();
if (last) {
    uint64_t gap = now - last;
    if (gap > period + period / 2) missed += gap / period - 1;
}
last = now;
```

The rule of half a period stops ordinary jitter from being counted as a missed tick. Once a second it prints the ticks it ran and the ticks it missed.

Positive
: In the output above, the third second missed 173 ticks with nothing else running. That is not QNX: QEMU is a virtual machine, its virtual CPUs are threads on the host, and the host sometimes parks them. On real hardware these numbers are what you would judge your loop by. In a virtual machine, judge the loop by what it achieves, not by its missed tick count.

## Priorities: a storm below the loop
Duration: 6:00

Now make the CPU busy. `spin` starts busy threads at a priority you choose. Run four of them at priority 59, just below the loop, for five seconds, while `ctl` runs at 60:

```bash
./ctl -s 7 > /tmp/ctl.txt &
sleep 1
./spin 4 5 59
sleep 2; cat /tmp/ctl.txt
```

```text
spin: 4 threads at priority 59 done
ctl:   1 s  ticks  900  missed   75
ctl:   2 s  ticks  970  missed   14
ctl:   3 s  ticks  992  missed    1
ctl:   4 s  ticks  923  missed   49
ctl:   5 s  ticks  924  missed   50
ctl:   6 s  ticks  979  missed    9
ctl:   7 s  ticks  842  missed  101
```

Four threads that never stop, on two CPUs, and the loop still runs around 900 to 990 times a second, the same as when it ran alone. With `SCHED_FIFO`, a thread at 59 simply cannot take the CPU from a ready thread at 60.

Positive
: `spin` makes each busy thread stop itself after the time is up. A main thread at normal priority could never get the CPU back from spinners running far above it to tell them to stop.

## A watchdog that forces a safe state
Duration: 10:00

Priorities protect the loop from work below it. They do not protect you from the loop itself: a bug, a crash or a deadlock in the control loop leaves the actuator wherever it was. In our CPR robot that would mean a piston pressed into a chest. So the loop publishes a heartbeat, and a separate process watches it.

`loop.h` holds the shared memory:

```c
typedef struct {
    _Atomic uint64_t beat;      /* the loop bumps this on every tick     */
    _Atomic uint32_t safe;      /* the watchdog sets this to force safe  */
    _Atomic uint32_t trips;     /* how many times the watchdog fired     */
} heartbeat_t;
```

The loop bumps `beat` on every tick. The watchdog in `wd.c` runs **above** the loop, at priority 62, on its own 1 ms timer pulse, and counts how long the beat has stood still:

```c
uint64_t b = atomic_load(&hb->beat);
if (b != seen) { seen = b; silent = 0; continue; }
if (++silent > limit && !tripped) {
    tripped = 1;
    atomic_store(&hb->safe, 1);   /* real machine: lift the actuator, cut the power stage */
    printf("wd: loop silent for %d ms: SAFE STATE forced, loop will not be restarted\n", silent);
}
```

Start the loop and the watchdog, then kill the loop:

```bash
./ctl > /tmp/ctl.txt &
sleep 1
./wd -l 100 > /tmp/wd.txt &
sleep 3
slay -f ctl
sleep 1; cat /tmp/wd.txt; slay -f wd
```

```text
wd: watching the heartbeat, limit 100 ms, priority 62
wd: loop silent for 101 ms: SAFE STATE forced, loop will not be restarted
```

Negative
: On real hardware use a tight limit, such as 20 ms. In QEMU on a laptop the virtual machine itself can pause for tens of milliseconds, so this codelab uses `-l 100` to avoid false alarms. Say so whenever you publish numbers from a virtual machine.

### Why the watchdog does not restart the loop

It is tempting to have a supervisor restart anything that dies. Don't, for the process that drives the actuator. A controller that quietly comes back in the middle of an operation starts with no memory of where the machine was. Force the safe state, hold it, and make a person decide. If you use System Launch and Monitor, mark that process `repair none`, and let it restart only the helpers around it.

## A storm above the loop, and pulses that lie
Duration: 8:00

Now do the thing priorities can't save you from: run the storm **above** the loop, at 61, with the watchdog at 62 still watching.

```bash
./ctl > /tmp/ctl.txt &
sleep 1
./wd -l 100 > /tmp/wd.txt &
sleep 2
./spin 4 3 61
sleep 2; slay -f ctl wd; cat /tmp/ctl.txt /tmp/wd.txt
```

```text
ctl:   1 s  ticks  950  missed   40
ctl:   2 s  ticks 1000  missed    1
ctl:   3 s  ticks  996  missed    1
ctl:   4 s  ticks    5  missed 2998  (watchdog has forced safe state)
ctl:   5 s  ticks 3633  missed    5  (watchdog has forced safe state)
ctl:   6 s  ticks  998  missed    0  (watchdog has forced safe state)
wd: watching the heartbeat, limit 100 ms, priority 62
wd: loop silent for 101 ms: SAFE STATE forced, loop will not be restarted
```

Two things happened:

1. The storm starved the loop completely: 5 ticks in a whole second. The watchdog, above the storm, caught it after 101 ms and forced the safe state. This is why the watchdog must sit above anything that could starve the loop.
2. In the next second the loop counted **3,633 ticks**. The timer kept firing while the loop was starved, the pulses queued up, and they were all delivered in a burst when the storm ended.

Negative
: **The second mistake we made.** After a stall, our controller replayed the ticks it had missed, and fed each replayed tick the newest sensor sample. The first replayed tick saw the whole movement of the stall as if it had happened in one millisecond, which looked like a very fast actuator, so a force guard tripped early and every stroke came up short. Count time with `ClockCycles`, not with pulses, and measure speed over the real time between sensor samples, never per tick.

## Run it all at once
Duration: 2:00

`demo.sh` runs every step of this codelab in order:

```bash
sh /data/codelab/demo.sh
```

Then try it yourself:

* Lower the watchdog to `-l 20` and see whether your virtual machine triggers false alarms
* Run `spin` at 60, the same priority as the loop, and watch round robin within a priority level
* Make `ctl` check `hb->safe` on every tick and hold its output at zero once the watchdog has fired

## Wrap up
Duration: 2:00

You built a loop that:

* wakes every millisecond from a timer pulse on a private channel
* knows the tick it runs on, and measures every tick it misses
* cannot be starved by work below its priority
* is watched from above by a process that forces a safe state and never restarts it
* does not trust a burst of queued pulses to tell it how much time has passed

To see these ideas inside a complete system, with resource managers, an untrusted AI process fenced by QNX, System Launch and Monitor and an on-target fault suite, have a look at [Elvrek](https://github.com/angelraph/elvrek).

### Learn more

* [QNX OS 8.0: timer_create()](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.lib_ref/topic/t/timer_create.html)
* [QNX OS 8.0: MsgReceivePulse()](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.lib_ref/topic/m/msgreceivepulse.html)
* [QNX OS 8.0: ClockPeriod()](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.lib_ref/topic/c/clockperiod.html)
* [QNX OS 8.0: FIFO scheduling](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.sys_arch/topic/kernel_FIFO_scheduling.html)
