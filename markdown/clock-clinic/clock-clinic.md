id: clock-clinic
title: Clock Clinic: Fix a Time-Jump Bug with CLOCK_MONOTONIC
summary: Reproduce a 100 ms control loop that misfires when the wall clock is set on QNX 8.0 in QEMU, learn why CLOCK_REALTIME is the wrong clock for timing, and fix it with a CLOCK_MONOTONIC timer.
categories: Real-Time & Timing
tags: intermediate
platforms: QEMU
published: 2026-11-27
featured: false
status: published
authors: Hoopla Hoorah LLC
feedback_link: https://github.com/qnx/codelabs/issues

<!--
  Copyright 2026 Hoopla Hoorah LLC
  SPDX-License-Identifier: Apache-2.0
  Sample code and captured output: https://github.com/HooplaHoorah/recovery-contract-lab/tree/main/codelab/clock-clinic
-->

# Clock Clinic: Fix a Time-Jump Bug with CLOCK_MONOTONIC

## Set Up the QNX Target
Duration: 5:00

Control loops, watchdogs and timeouts must measure **elapsed time**. A very common bug is to measure it with the **wall clock** (`CLOCK_REALTIME`), which anyone with the right privilege can set: an operator, an NTP step, a GPS fix. In this codelab you will:

* run a 100 ms loop paced by `CLOCK_REALTIME`, and watch it misfire when the clock is set forward and backward;
* see why it happens on QNX (and on any POSIX system);
* fix it with a periodic timer on `CLOCK_MONOTONIC` that delivers a QNX pulse;
* verify the fix under the same clock jumps.

### What you'll need

* A host with the QNX SDP 8.0 installed (this codelab was written on Windows; Linux works the same way), and the `qcc` compiler on your `PATH` after sourcing `qnxsdp-env`.
* The QNX 8.0 Quick Start target image running in QEMU, reachable over ssh as `qnxuser` (here: port 2222 on `127.0.0.1`).
* The sample code in [`src/`](https://github.com/HooplaHoorah/recovery-contract-lab/tree/main/codelab/clock-clinic/src): `tick_realtime.c` (the bug), `tick_monotonic.c` (the fix), `jumpclock.c` (moves the wall clock), `run_jumps.sh` and a `Makefile`.

### Build and copy the samples

On the host, from the `src/` folder ([download it here](https://github.com/HooplaHoorah/recovery-contract-lab/tree/main/codelab/clock-clinic/src)):

```sh
make
ssh -p 2222 qnxuser@127.0.0.1 mkdir -p clock-clinic
scp -P 2222 tick_realtime tick_monotonic jumpclock run_jumps.sh qnxuser@127.0.0.1:clock-clinic/
```

Setting the clock needs root: on QNX the caller needs the `PROCMGR_AID_CLOCKSET` ability, which `qnxuser` does not have. On the Quick Start image `qnxuser` may use `sudo`. Log in and check:

```sh
ssh -p 2222 qnxuser@127.0.0.1
cd clock-clinic
uname -a
id
sudo -n true && echo "sudo ok"
```

Expected output (captured on QNX 8.0 in QEMU; see [captured/step1.txt](https://github.com/HooplaHoorah/recovery-contract-lab/blob/main/codelab/clock-clinic/captured/step1.txt)):

```console
QNX qnxqemu 8.0.0 2026/06/05-16:26:03EDT x86pc x86_64
uid=1000(qnxuser) gid=1000(qnxuser) groups=1000(qnxuser),27(sudo),2001(abuild),36(screen),521(sensor)
sudo ok
```

If `sudo` asks for a password on your image, run `sudo -v` once before step 3 so the background clock jumps don't wait for a prompt. Only change the clock on a development target you own.

## Run a Loop Timed on CLOCK_REALTIME
Duration: 3:00

`tick_realtime.c` is a typical periodic loop. It keeps an absolute deadline on the wall clock and sleeps until it (excerpt, error handling omitted):

```c
clock_gettime(CLOCK_REALTIME, &next);
for (i = 1; i <= n; i++) {
    add_ns(&next, PERIOD_NS);                                   /* +100 ms */
    clock_nanosleep(CLOCK_REALTIME, TIMER_ABSTIME, &next, NULL); /* BUG */
    clock_gettime(CLOCK_REALTIME, &rt_now);
    /* BUG: the watchdog also measures "time since last tick" on the wall clock */
    ...
}
```

Each printed line shows the time since the previous tick as seen by the wall clock (`wall`) and by `CLOCK_MONOTONIC` (`mono`, the truth). The program prints every 10th tick and every anomaly. Run it without touching the clock:

```sh
./tick_realtime 30
```

Expected output (captured; [captured/step2.txt](https://github.com/HooplaHoorah/recovery-contract-lab/blob/main/codelab/clock-clinic/captured/step2.txt)). Your intervals will differ by a few ms, more so under QEMU emulation:

```console
tick_realtime: 30 ticks of 100 ms, paced by CLOCK_REALTIME absolute deadlines
tick  10  wall     +107.1 ms  mono   +107.1 ms
tick  20  wall      +84.7 ms  mono    +84.7 ms
tick  30  wall      +85.2 ms  mono    +85.2 ms
tick_realtime summary: 30 ticks, 0 burst ticks, 0 late ticks, 0 watchdog misfires
```

While nobody touches the clock, the two clocks agree and the loop looks correct. That is why this bug survives testing.

## Reproduce the Time-Jump Bug
Duration: 5:00

`jumpclock` moves `CLOCK_REALTIME` by a number of seconds with `clock_settime()`, like an NTP step would. As `qnxuser` it is refused:

```sh
./jumpclock +5
```

Expected output (captured; [captured/step3a.txt](https://github.com/HooplaHoorah/recovery-contract-lab/blob/main/codelab/clock-clinic/captured/step3a.txt)):

```console
clock_settime(CLOCK_REALTIME): Operation not permitted
setting the clock needs root: sudo ./jumpclock +5
```

`run_jumps.sh` runs a program for 150 ticks (about 15 s) and, in the background, jumps the clock **forward 5 s** after 3 s and **back 5 s** three seconds later (so the clock ends where it started, within a few ms):

```sh
sh run_jumps.sh ./tick_realtime
```

Expected output (captured; [captured/step3b.txt](https://github.com/HooplaHoorah/recovery-contract-lab/blob/main/codelab/clock-clinic/captured/step3b.txt) has every line; 46 BURST lines are shortened here):

```console
tick_realtime: 150 ticks of 100 ms, paced by CLOCK_REALTIME absolute deadlines
tick  10  wall     +100.8 ms  mono   +100.8 ms
tick  20  wall     +102.1 ms  mono   +102.1 ms
tick  30  wall     +102.0 ms  mono   +102.0 ms
>>> sudo ./jumpclock +5   (wall clock jumps FORWARD 5 s)
tick  39  wall    +5031.8 ms  mono    +32.1 ms  <-- WATCHDOG FIRED: thinks the loop stalled
jumpclock: CLOCK_REALTIME moved by +5.0 s
tick  40  wall       +4.5 ms  mono     +4.5 ms  <-- BURST: catch-up tick
tick  41  wall       +0.6 ms  mono     +0.6 ms  <-- BURST: catch-up tick
[... ticks 42-87: 46 more BURST lines, 0.2-2.9 ms apart ...]
tick  88  wall       +0.4 ms  mono     +0.4 ms  <-- BURST: catch-up tick
tick  90  wall     +100.0 ms  mono   +100.0 ms
tick 100  wall     +106.3 ms  mono   +106.3 ms
tick 110  wall      +99.9 ms  mono    +99.9 ms
>>> sudo ./jumpclock -5   (wall clock jumps BACK 5 s)
tick 120  wall     +108.3 ms  mono   +108.3 ms
jumpclock: CLOCK_REALTIME moved by -5.0 s
tick 125  wall     +105.2 ms  mono  +5105.3 ms  <-- LATE: no tick for this long
tick 130  wall      +99.6 ms  mono    +99.6 ms
tick 140  wall     +100.8 ms  mono   +100.8 ms
tick 150  wall     +108.4 ms  mono   +108.4 ms
tick_realtime summary: 150 ticks, 49 burst ticks, 1 late ticks, 1 watchdog misfires
```

Three different failures from one clock change each way:

* **Watchdog misfire** (tick 39): only 32 ms really passed, but the wall clock says 5 s, so the watchdog "detects" a stall that never happened.
* **Burst** (ticks 40-88): about 50 deadlines are suddenly in the past and all expire at once. A real controller would run 5 s worth of control steps in a few milliseconds.
* **Stall** (tick 125): after the clock goes back, the next deadline is 5 s away. The loop is silent for 5.1 s, and its own wall-clock-based check sees only +105 ms, so nothing notices.

## Understand Why It Misfires
Duration: 4:00

QNX, like every POSIX system, has several clocks:

| Clock | Can it be set? | Use it for |
|---|---|---|
| `CLOCK_REALTIME` | Yes: `clock_settime()`, `ClockTime()`, `date`, NTP steps | Time of day: timestamps for humans and logs |
| `CLOCK_MONOTONIC` | No; it only moves forward, from boot | Elapsed time: periods, timeouts, watchdogs, latency |

Two rules explain everything you saw:

1. **An absolute timer or sleep on `CLOCK_REALTIME` follows the clock when it is set.** POSIX specifies that when `CLOCK_REALTIME` is set, absolute timers and `clock_nanosleep(..., TIMER_ABSTIME, ...)` on it expire when the *new* clock value reaches the deadline. Set the clock forward and every pending deadline is already past, so they fire immediately (the burst). Set it back and the deadline is in the future again (the stall).
2. **A difference of two `CLOCK_REALTIME` readings is not an elapsed time.** If the clock was set in between, the difference includes the jump. That is the watchdog misfire, and the reason the stall went unnoticed.

Note: a gradual adjustment (`ClockAdjust()`, or NTP slewing) changes the rate of `CLOCK_REALTIME` instead of stepping it, which hides the problem until the day someone steps the clock.

The fix is to use the clock that cannot be set for everything that measures time, and keep `CLOCK_REALTIME` for displaying the time of day.

## Fix It with CLOCK_MONOTONIC and a Timer
Duration: 5:00

`tick_monotonic.c` drives the same loop with a periodic POSIX timer on `CLOCK_MONOTONIC`. The timer delivers a **pulse** to a channel the loop blocks on, which is the idiomatic QNX way to run periodic work (no signals, and the pulse carries a priority). Excerpt, error handling omitted:

```c
chid = ChannelCreate(0);
coid = ConnectAttach(0, 0, chid, _NTO_SIDE_CHANNEL, 0);
SIGEV_PULSE_INIT(&ev, coid, SIGEV_PULSE_PRIO_INHERIT, PULSE_TICK, 0);
timer_create(CLOCK_MONOTONIC, &ev, &timer);              /* FIX: monotonic */
its.it_value.tv_nsec = its.it_interval.tv_nsec = PERIOD_NS; /* every 100 ms */
timer_settime(timer, 0, &its, NULL);

for (i = 1; i <= n; i++) {
    MsgReceivePulse(chid, &p, sizeof(p), NULL);         /* one pulse per period */
    clock_gettime(CLOCK_MONOTONIC, &mono_now);          /* FIX: watchdog on monotonic */
    ...
}
```

If you prefer a plain sleep loop, `clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &next, NULL)` with `next` advanced by the period is also correct; what matters is the clock.

Run it once without clock changes:

```sh
./tick_monotonic 30
```

Expected output (captured; [captured/step5.txt](https://github.com/HooplaHoorah/recovery-contract-lab/blob/main/codelab/clock-clinic/captured/step5.txt)):

```console
tick_monotonic: 30 ticks of 100 ms, paced by a CLOCK_MONOTONIC timer pulse
tick  10  wall      +98.3 ms  mono    +98.3 ms
tick  20  wall      +91.1 ms  mono    +91.1 ms
tick  30  wall     +100.0 ms  mono   +100.0 ms
tick_monotonic summary: 30 ticks, 0 burst ticks, 0 late ticks, 0 watchdog misfires
```

## Verify the Fix Under Clock Jumps
Duration: 4:00

Repeat exactly the same clock jumps against the fixed program:

```sh
sh run_jumps.sh ./tick_monotonic
```

Expected output (captured; [captured/step6.txt](https://github.com/HooplaHoorah/recovery-contract-lab/blob/main/codelab/clock-clinic/captured/step6.txt)):

```console
tick_monotonic: 150 ticks of 100 ms, paced by a CLOCK_MONOTONIC timer pulse
tick  10  wall      +93.6 ms  mono    +93.6 ms
tick  20  wall      +94.1 ms  mono    +94.1 ms
tick  30  wall      +92.8 ms  mono    +92.8 ms
>>> sudo ./jumpclock +5   (wall clock jumps FORWARD 5 s)
jumpclock: CLOCK_REALTIME moved by +5.0 s
tick  34  wall    +5099.0 ms  mono    +99.1 ms  (wall clock jumped; tick on time anyway)
tick  40  wall     +101.5 ms  mono   +101.5 ms
tick  50  wall     +103.6 ms  mono   +103.6 ms
tick  60  wall     +101.3 ms  mono   +101.3 ms
>>> sudo ./jumpclock -5   (wall clock jumps BACK 5 s)
jumpclock: CLOCK_REALTIME moved by -5.0 s
tick  68  wall    -4901.0 ms  mono    +99.1 ms  (wall clock jumped; tick on time anyway)
tick  70  wall      +98.2 ms  mono    +98.2 ms
tick  80  wall     +109.4 ms  mono   +109.4 ms
tick  90  wall     +100.7 ms  mono   +100.7 ms
tick 100  wall      +99.8 ms  mono    +99.8 ms
tick 110  wall      +93.8 ms  mono    +93.8 ms
tick 120  wall      +98.4 ms  mono    +98.4 ms
tick 130  wall      +93.4 ms  mono    +93.4 ms
tick 140  wall      +99.2 ms  mono    +99.2 ms
tick 150  wall      +98.8 ms  mono    +98.8 ms
tick_monotonic summary: 150 ticks, 0 burst ticks, 0 late ticks, 0 watchdog misfires
```

The wall clock still jumps (+5099 ms, then -4901 ms on ticks 34 and 68), but every tick arrives about 100 ms after the previous one: no burst, no stall, no false watchdog alarm. Compare the two summary lines:

| Program | Burst ticks | Late ticks | Watchdog misfires |
|---|---|---|---|
| `tick_realtime` | 49 | 1 (5.1 s stall) | 1 |
| `tick_monotonic` | 0 | 0 | 0 |

Interval jitter of a few ms around 100 ms is normal here: QEMU emulates the CPU in software on the host, so the numbers are indicative only and say nothing about real-time performance on hardware.

## Clean Up and Apply It to Your Code
Duration: 3:00

`run_jumps.sh` moved the clock forward and back by the same amount, so the target's wall clock is within a few milliseconds of where it was. If you jumped it by hand, undo it with the opposite `sudo ./jumpclock` (or resynchronise it with NTP if your target has network time). Then remove the samples:

```sh
cd ~ && rm -rf clock-clinic
```

Expected output: none (the command prints nothing on success).

### Checklist for your own code

* Periods, timeouts, deadlines and watchdogs: `CLOCK_MONOTONIC` only (`timer_create(CLOCK_MONOTONIC, ...)`, `clock_nanosleep(CLOCK_MONOTONIC, ...)`, `clock_gettime(CLOCK_MONOTONIC, ...)` differences).
* `CLOCK_REALTIME` only for time-of-day values shown to people or written to logs, never subtracted to get a duration.
* Search your code for `CLOCK_REALTIME`, `time(`, `gettimeofday(` and `TIMER_ABSTIME` and check what each one is used for.
* Test it: step the clock forward and back while the system runs, exactly as `run_jumps.sh` does.

### What you learned

* Why a loop paced by absolute `CLOCK_REALTIME` deadlines bursts when the clock is set forward and stalls when it is set back.
* Why a wall-clock watchdog fires falsely or stays silent.
* How to run periodic work on QNX with a `CLOCK_MONOTONIC` timer and a pulse.