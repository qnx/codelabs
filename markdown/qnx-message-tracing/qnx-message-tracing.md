id: qnx-message-tracing
title: What Is My QNX Program Waiting For? Trace Message Passing on QNX 8.0
summary: Use the instrumented kernel, TraceEvent() and libtraceparser to see which server answers each message your program sends, how long it queued and how long the server worked.
categories: Debugging & Performance
tags: intermediate
platforms: QEMU
published: 2026-11-24
featured: false
status: published
authors: Yaroslav Hryhorenko
feedback_link: https://github.com/qnx/codelabs/issues

# What Is My QNX Program Waiting For? Trace Message Passing on QNX 8.0

## Overview
Duration: 2:00

On Linux, `read()` is a system call: the kernel does the work. On QNX OS 8.0 the microkernel only passes
messages. `read()` becomes a `MsgSend()` to a **server process**: the pipe server, a file system, a serial
driver or `procnto` itself. When your program is slow, the answer is usually on the other side of a message:
the server was busy, or it was slow to reply.

In this codelab you write `msgwait`, a small C program that runs a command and prints every message the
command sends:

```text
          wc[1191960:1] -> pipe             [122889]  queued      15.0 us  served   13016.0 us  server prio 10
```

That line says which server answered, how long the message waited before the server picked it up, how long
the server worked on it, and the priority the server ran at while it did.

### What you'll learn

- How message passing appears in a QNX kernel trace: the send, receive and reply events, and the thread
  states around them
- How to tell the instrumented kernel what to record with `TraceEvent()`, and how to let `tracelogger` save it
- How to start a program held, so tracing is on before its first instruction
- How to read a `.kev` trace file in your own code with `libtraceparser`
- How to see priority inheritance at work

### What you'll need

- A QNX Everywhere licence and QNX SDP 8.0 installed on a Linux, Windows or macOS host
- A QNX OS 8.0 target that boots the instrumented kernel. This codelab uses an image built by `mkqnximage`
  and run on QEMU. It was tested on QNX 8.0.0, aarch64le, QEMU 11.1 on macOS.
- Root access on the target, and SSH to copy files to it
- Working knowledge of C

The full program is in the [qtrace repository](https://github.com/Fuze5k/qtrace/blob/main/codelab/msgwait.c)
under the Apache 2.0 licence.

## Set up a QNX 8.0 target on QEMU
Duration: 10:00

`mkqnximage` comes with the SDP. It builds a bootable QNX 8.0 image for QEMU, VMware or VirtualBox from the
packages you have installed. You need the QEMU target packages (`com.qnx.qnx800.target.qemuvirt`), the
`mkqnximage` host package and the virtio drivers; install them with the QNX Software Center if they are
missing.

1. Open a terminal with the SDP environment. On a Linux host:

    ```bash
    source ~/qnx800/qnxsdp-env.sh
    ```

    The SDP's host tools are built for x86-64 Linux and Windows. On a Mac, install the package
    "QNX SDP Host Tools (Linux 64-bit)" too and run the tools in an x86-64 Linux container under Docker,
    as QNX's [docker-mac](https://gitlab.com/qnx/projects/docker-mac) project shows. The `env/qnx` script
    in the qtrace repository does that for one command: put it in front of each SDP command below.

    ```bash
    # macOS only
    git clone https://github.com/Fuze5k/qtrace.git ~/qtrace
    ```

2. Create a directory for the image and an SSH key for root login:

    ```bash
    mkdir -p ~/qnx-vm && cd ~/qnx-vm
    ssh-keygen -t ed25519 -N '' -f ./id_ed25519
    ```

3. Build the image. `--force` lets `mkqnximage` use a directory that is not empty (the key is in it):

    ```bash
    mkqnximage --type=qemu --arch=aarch64le --cpu=4 --ram=1G \
        --hostname=qnxtrace --ssh-ident="$PWD/id_ed25519.pub" --noprompt --force --build
    # macOS: the same command after ~/qtrace/env/qnx
    ```

    Use `--arch=x86_64` for an x86-64 image instead.

4. Start it. On Linux, `mkqnximage --run` starts the image with its own `runimage` script. On macOS that
   script needs a Linux network bridge, so use `run-qemu.sh` from the qtrace repository instead: it boots
   the same image headless and forwards SSH to `127.0.0.1:2222`.

    ```bash
    # Linux
    mkqnximage --run=-h
    # macOS (about a minute until SSH answers)
    ~/qtrace/env/run-qemu.sh ~/qnx-vm start
    ```

5. Log in and check the kernel:

    ```bash
    ssh -i ./id_ed25519 -p 2222 root@127.0.0.1   # on Linux: ssh -i ./id_ed25519 root@<target address>
    uname -a
    ```

    ```text
    QNX qnxtrace 8.0.0 2026/10/30-09:09:47EDT QEMU_virt aarch64le
    ```

Images built by `mkqnximage` boot `procnto-smp-instr`, the instrumented kernel; you can see it in
`output/build/ifs.build`. Only the instrumented kernel can record events, so if you use another target,
check its build file for `procnto-smp-instr` first.

Negative
: Tracing needs root. Every command on the target in this codelab runs as root.

## A read() is a message
Duration: 3:00

Here is what happens when a program calls `read(fd, buf, 4096)` on a pipe:

1. The C library turns the call into a message of type `_IO_READ` and calls `MsgSend()` on the connection
   behind `fd`. That connection leads to a channel of the **pipe** server.
2. If a pipe server thread is waiting in `MsgReceive()`, the kernel copies the message to it at once and
   the client becomes **REPLY blocked**. If all server threads are busy, the client is **SEND blocked**
   and waits in a queue.
3. The server thread wakes up with the message and runs **at the client's priority** (priority
   inheritance), so a low-priority server does not delay a high-priority client.
4. When the data is there, the server calls `MsgReply()`. The kernel copies the reply into `buf` and the
   client runs again.

So the time a client spends in one `MsgSend()` has two parts:

| Part | From | To | Large when |
|---|---|---|---|
| **queued** | the client sends | a server thread receives | the server has no free thread |
| **served** | the server receives | the server replies | the server works long or waits for something itself |

The kernel can log each of these moments as a trace event. The rest of this codelab finds them in the trace
and does the subtraction.

## Look at a raw kernel trace
Duration: 5:00

Before writing code, record a trace with the standard tools and find one message in it.

1. On the target, record the whole system for one second, in wide mode, while `ls` runs:

    ```bash
    tracelogger -w -s 1 -f /tmp/all.kev & sleep 0.3; ls /proc/boot > /dev/null; wait
    ```

2. Print it. `traceprinter` is not in the default image, but the SDP's host tools include it: copy the
   file to the host and print it there.

    ```bash
    scp -O -i ~/qnx-vm/id_ed25519 -P 2222 root@127.0.0.1:/tmp/all.kev .
    traceprinter -f all.kev > all.txt      # macOS: after ~/qtrace/env/qnx
    ```

3. Look for `SND_MESSAGE` lines. One message from a client (here process 831510) to `procnto` (pid 1)
   looks like this; lines from other CPUs in between are left out and the spacing is trimmed:

    ```text
    t:0xc6cb00ae CPU:01 KER_CALL :MSG_SENDVNC/12
                                 coid:0x40000000
    t:0xc6cb0590 CPU:01 COMM    :SND_MESSAGE    rcvid:0x00000016 pid:1
    t:0xc6cb0784 CPU:01 THREAD  :THREPLY        pid:831510 tid:1 priority:10 policy:2
    t:0xc6cb0801 CPU:01 THREAD  :THRUNNING      pid:1 tid:17 priority:10 policy:2
    t:0xc6cb08fb CPU:01 COMM    :REC_MESSAGE    rcvid:0x00000016 pid:1
    t:0xc6cb21a3 CPU:01 COMM    :REPLY_MESSAGE  tid:1 pid:831510
    t:0xc6cb229d CPU:01 THREAD  :THREADY        pid:831510 tid:1 priority:10 policy:2
    t:0xc6cb448d CPU:00 KER_EXIT :MSG_SENDVNC/12
                                 ret_val:0x0000000000000000
    ```

Read it from the top:

- `KER_CALL MSG_SENDVNC`: the client enters `MsgSend()` on connection `0x40000000`, the side channel to
  `procnto`.
- `SND_MESSAGE rcvid:0x16 pid:1`: the message is sent to process 1 and gets receive id `0x16`. The event
  holds the **server's** pid, not the client's: the client is whichever thread is running on that CPU.
- `THREPLY`: a `procnto` thread was already waiting, so the client goes straight to REPLY blocked.
- `THRUNNING pid:1 tid:17 priority:10`: `procnto` thread 17 runs, at priority 10 like the client.
- `REC_MESSAGE rcvid:0x16 pid:1`: that thread receives the message with the same receive id.
- `REPLY_MESSAGE tid:1 pid:831510`: it replies to thread 1 of process 831510, which becomes READY and
  later leaves `MsgSend()` on CPU 0.

The `t:` values are `ClockCycles()` timestamps. Here the message queued for `0x08fb - 0x0590` cycles and
the server worked on it for `0x21a3 - 0x08fb` cycles.

Doing that by hand for hundreds of messages is not practical, and a system-wide trace grows quickly. Next,
you make the kernel record only what you need and do the matching in code.

## Tell the kernel what to record
Duration: 8:00

`tracelogger` has a **daemon mode** (`-d1`): it allocates the kernel's trace buffers and writes them to a
file, but it does not decide what is recorded or when. Your program does that with the `TraceEvent()` kernel
call. Create `msgwait.c` and start with the capture half.

### Start tracelogger

```c
#define KEV     "/tmp/msgwait.kev"

/* tracelogger in daemon mode (-d1) only drains the kernel's trace buffers
 * into the file; this program decides what the kernel records. */
static pid_t start_tracelogger(void)
{
    char *argv[] = { "tracelogger", "-d1", "-w", "-c", "-f", KEV, NULL };
    posix_spawn_file_actions_t fa;
    pid_t pid;
    int rc;

    posix_spawn_file_actions_init(&fa);
    posix_spawn_file_actions_addopen(&fa, 1, "/dev/null", O_WRONLY, 0);
    posix_spawn_file_actions_addopen(&fa, 2, "/dev/null", O_WRONLY, 0);
    rc = posix_spawnp(&pid, "tracelogger", &fa, NULL, argv, environ);
    posix_spawn_file_actions_destroy(&fa);
    if (rc != 0) {
        fprintf(stderr, "msgwait: cannot start tracelogger: %s\n", strerror(rc));
        return -1;
    }
    return pid;
}
```

`-w` asks for wide events and `-c` keeps logging until `tracelogger` is stopped. Its own messages go to
`/dev/null`, so they do not mix with the report.

### Choose the events

```c
/* Thread states (who runs on which CPU), message passing (send, receive,
 * reply) and process events (names), all in wide mode, which adds the
 * thread priority to every THRUNNING event. */
static int arm_kernel(void)
{
    if (TraceEvent(_NTO_TRACE_DELALLCLASSES) == -1 ||
        TraceEvent(_NTO_TRACE_ADDCLASS, _NTO_TRACE_THREAD) == -1 ||
        TraceEvent(_NTO_TRACE_ADDCLASS, _NTO_TRACE_COMM) == -1 ||
        TraceEvent(_NTO_TRACE_ADDCLASS, _NTO_TRACE_PROCESS) == -1 ||
        TraceEvent(_NTO_TRACE_SETALLCLASSESWIDE) == -1)
        return -1;
    return TraceEvent(_NTO_TRACE_START);
}
```

- `_NTO_TRACE_DELALLCLASSES` starts from nothing.
- The **thread** class gives `THRUNNING` and the other state changes: who runs on which CPU, at which
  priority.
- The **communication** class gives `SND_MESSAGE`, `REC_MESSAGE`, `REPLY_MESSAGE` and `MSG_ERROR`.
- The **process** class gives process names. When tracing starts, the kernel also emits a name event for
  every process that already exists, so servers started at boot get their names too.
- Wide mode adds the priority and scheduling policy to every thread event.

Kernel calls are left out on purpose: `msgwait` does not need them, and they are the largest class. To
record the calls of one process only, add `_NTO_TRACE_KERCALL` and filter it with
`TraceEvent(_NTO_TRACE_SETCLASSPID, _NTO_TRACE_KERCALL, pid)`.

### Start the command held

The command must not run before tracing is on. `spawnp()` with `SPAWN_HOLD` creates the process stopped
before its first instruction; `SIGCONT` releases it.

```c
int main(int argc, char **argv)
{
    struct inheritance inh;
    pid_t tl, child;
    int i, status = 0;

    if (argc < 2) {
        fprintf(stderr, "usage: msgwait command [arg ...]\n");
        return 2;
    }
    cycles_per_sec = SYSPAGE_ENTRY(qtime)->cycles_per_sec;
    if ((tl = start_tracelogger()) < 0) return 1;

    /* Create the command stopped before its first instruction, so that
     * tracing is on before it runs. */
    memset(&inh, 0, sizeof inh);
    inh.flags = SPAWN_HOLD;
    child = spawnp(argv[1], 0, NULL, &inh, &argv[1], environ);
    if (child == -1) {
        fprintf(stderr, "msgwait: %s: %s\n", argv[1], strerror(errno));
        stop_tracelogger(tl);
        return 127;
    }

    /* tracelogger needs a moment to set up the kernel's buffers. */
    for (i = 0; i < 30 && arm_kernel() == -1; i++)
        usleep(100 * 1000);
    if (i == 30) {
        fprintf(stderr, "msgwait: TraceEvent: %s (root? instrumented kernel?)\n", strerror(errno));
        kill(child, SIGKILL);
        stop_tracelogger(tl);
        return 1;
    }

    kill(child, SIGCONT);                                   /* let it run */
    while (waitpid(child, &status, 0) == -1 && errno == EINTR)
        ;
    stop_tracelogger(tl);
    return report(child) == 0 ? WEXITSTATUS(status) : 1;
}
```

`SYSPAGE_ENTRY(qtime)->cycles_per_sec` from the system page converts `ClockCycles()` timestamps to time.

### Stop and flush

```c
static void stop_tracelogger(pid_t tl)
{
    TraceEvent(_NTO_TRACE_STOP);   /* also flushes the last, partly filled buffer */
    usleep(300 * 1000);            /* give tracelogger time to write it out */
    kill(tl, SIGINT);
    waitpid(tl, NULL, 0);
}
```

Negative
: If `msgwait` stops with "TraceEvent: Operation not permitted", run it as root. If it says "Function not
implemented", the target does not boot the instrumented kernel.

## Read the trace with libtraceparser
Duration: 10:00

`libtraceparser` reads `.kev` files. You register one callback per event class and event type with
`traceparser_cs()`, then `traceparser()` reads the file and calls them in order. Every callback gets the
event header (the CPU is in it), the 32-bit timestamp and the event's data words.

### Keep track of who runs where

Message events do not say which thread logged them. The sender of `SND_MESSAGE` and the receiver of
`REC_MESSAGE` are the threads running on that CPU at that moment, so remember the last `THRUNNING` of each
CPU:

```c
typedef struct { int pid, tid, prio; } runner_t;
static runner_t running[MAXCPU];

/* THRUNNING: pid, tid, priority, policy (wide mode). Message events do not
 * say which thread logged them: it is the one running on that CPU. */
static int on_running(struct traceparser_state *tp, void *ud, unsigned header, unsigned time,
                      unsigned *d, unsigned n)
{
    unsigned cpu = _NTO_TRACE_GETCPU(header);
    if (cpu < MAXCPU && n >= 3) {
        running[cpu].pid = (int)d[0];
        running[cpu].tid = (int)d[1];
        running[cpu].prio = (int)d[2];
    }
    return 0;
}
```

### Join the three message events

A message in flight is identified by the server's pid and the receive id on the send side, and by the
client's pid and thread id on the reply side. A client thread has at most one message in flight, because
`MsgSend()` blocks.

```c
typedef struct {
    int srv, rcvid, pid, tid, srv_prio, received;
    unsigned t_send, t_recv;
} flight_t;

/* A client thread has at most one message in flight, because MsgSend()
 * blocks, so (pid, tid) finds it; a newer send replaces an older one that
 * never got a reply. Returns NULL for threads that are not traced. */
static flight_t *find_or_add(int pid, int tid)
{
    int i;
    if (!proc(pid)->traced) return NULL;
    for (i = 0; i < nmsgs; i++)
        if (msgs[i].pid == pid && msgs[i].tid == tid) break;
    if (i == nmsgs) {
        if (nmsgs == MAXMSG) return NULL;
        nmsgs++;
    }
    memset(&msgs[i], 0, sizeof msgs[i]);
    msgs[i].pid = pid;
    msgs[i].tid = tid;
    return &msgs[i];
}

/* SND_MESSAGE (COMM_SMSG): rcvid, server pid. Logged on the client's CPU. */
static int on_send(struct traceparser_state *tp, void *ud, unsigned header, unsigned time,
                   unsigned *d, unsigned n)
{
    runner_t *c = &running[_NTO_TRACE_GETCPU(header) % MAXCPU];
    flight_t *m = n >= 2 ? find_or_add(c->pid, c->tid) : NULL;
    if (!m) return 0;
    m->rcvid = (int)d[0];
    m->srv = (int)d[1];
    m->t_send = time;
    return 0;
}

/* REC_MESSAGE (COMM_RMSG): rcvid, server pid. Logged on the server's CPU. */
static int on_receive(struct traceparser_state *tp, void *ud, unsigned header, unsigned time,
                      unsigned *d, unsigned n)
{
    runner_t *s = &running[_NTO_TRACE_GETCPU(header) % MAXCPU];
    flight_t *m = n >= 2 ? find_by_rcvid((int)d[1], (int)d[0]) : NULL;
    if (!m) return 0;
    m->received = 1;
    m->t_recv = time;
    m->srv_prio = s->pid == m->srv ? s->prio : -1;         /* the server thread runs here */
    return 0;
}
```

`REPLY_MESSAGE` (and `MSG_ERROR`, when the server answers with `MsgError()`) carry the client's thread id
and pid. That closes the message:

```c
static double us(unsigned from, unsigned to)
{
    return (double)(unsigned)(to - from) * 1e6 / (double)cycles_per_sec;
}

/* REPLY_MESSAGE (COMM_REPLY), MSG_ERROR (COMM_ERROR): client tid, client pid. */
static int on_reply(struct traceparser_state *tp, void *ud, unsigned header, unsigned time,
                    unsigned *d, unsigned n)
{
    flight_t *m = n >= 2 ? find_by_client((int)d[1], (int)d[0]) : NULL;
    proc_info_t *srv;
    double queued, served;
    if (!m || !m->received) return 0;
    queued = us(m->t_send, m->t_recv);
    served = us(m->t_recv, time);
    fprintf(stderr, "%12s[%d:%d] -> %-17s[%d]  queued %9.1f us  served %9.1f us  server prio %d%s\n",
            name_of(m->pid), m->pid, m->tid, name_of(m->srv), m->srv, queued, served,
            m->srv_prio, ud ? "  (MsgError)" : "");
    srv = proc(m->srv);
    srv->msgs++;
    srv->queued_us += queued;
    srv->served_us += served;
    drop(m);
    return 0;
}
```

`find_by_rcvid()`, `find_by_client()`, `name_of()` and `drop()` are loops as short as `find_or_add()`; see
the [full program](https://github.com/Fuze5k/qtrace/blob/main/codelab/msgwait.c).

Positive
: Timestamps reach the callbacks as the low 32 bits of `ClockCycles()`. The unsigned subtraction in `us()`
stays correct across one wrap of that counter. For longer traces, extend the timestamps with the
`_NTO_TRACE_CONTROLTIME` events, which carry the high 32 bits.

### Names and children

`PROCCREATE_NAME` gives a process's parent, pid and path. Keep the last path component as its name, and
mark a new process as traced when its parent is, so `msgwait sh -c "..."` also follows the commands that
the shell starts. A child made by `fork()` gets only a `PROCCREATE` event, without a name: it runs its
parent's program, so give it the parent's name until a name event for `exec()` replaces it.

```c
/* PROCCREATE: ppid, pid. PROCCREATE_NAME: ppid, pid, path. When tracing
 * starts the kernel emits PROCCREATE_NAME for every existing process too. */
static int on_process(struct traceparser_state *tp, void *ud, unsigned header, unsigned time,
                      unsigned *d, unsigned n)
{
    proc_info_t *parent, *p;
    if (n < 2) return 0;
    parent = proc((int)d[0]);
    p = proc((int)d[1]);
    if (parent->traced) p->traced = 1;                     /* follow children */
    if (ud && n > 2) {                                     /* keep the basename */
        const char *s = (const char *)&d[2];
        size_t len = strnlen(s, (n - 2) * sizeof d[0]), i, from = 0;
        for (i = 0; i < len; i++)
            if (s[i] == '/') from = i + 1;
        snprintf(p->name, sizeof p->name, "%.*s", (int)(len - from), s + from);
    } else if (!p->name[0]) {
        /* fork() logs no name: the child runs its parent's program until exec() */
        memcpy(p->name, parent->name, sizeof p->name);
    }
    return 0;
}
```

### Register the callbacks and parse

```c
static int report(pid_t child)
{
    struct traceparser_state *tp = traceparser_init(NULL);
    int i;

    if (!tp) return -1;
    proc(child)->traced = 1;
    traceparser_cs(tp, NULL, on_running, _NTO_TRACE_THREAD, _NTO_TRACE_THRUNNING);
    traceparser_cs(tp, NULL, on_process, _NTO_TRACE_PROCESS, _NTO_TRACE_PROCCREATE);
    traceparser_cs(tp, "name", on_process, _NTO_TRACE_PROCESS, _NTO_TRACE_PROCCREATE_NAME);
    traceparser_cs(tp, NULL, on_send, _NTO_TRACE_COMM, _NTO_TRACE_COMM_SMSG);
    traceparser_cs(tp, NULL, on_receive, _NTO_TRACE_COMM, _NTO_TRACE_COMM_RMSG);
    traceparser_cs(tp, NULL, on_reply, _NTO_TRACE_COMM, _NTO_TRACE_COMM_REPLY);
    traceparser_cs(tp, "error", on_reply, _NTO_TRACE_COMM, _NTO_TRACE_COMM_ERROR);
    if (traceparser(tp, NULL, KEV) != 0) {
        fprintf(stderr, "msgwait: cannot parse %s: %s\n", KEV, strerror(errno));
        traceparser_destroy(&tp);
        return -1;
    }
    traceparser_destroy(&tp);

    qsort(procs, nprocs, sizeof procs[0], by_total);
    fprintf(stderr, "\n%-17s %8s %14s %14s\n", "server", "messages", "queued us", "served us");
    for (i = 0; i < nprocs && procs[i].msgs; i++)
        fprintf(stderr, "%-17s %8u %14.1f %14.1f\n", name_of(procs[i].pid), procs[i].msgs,
                procs[i].queued_us, procs[i].served_us);
    return 0;
}
```

The second argument of `traceparser_cs()` is passed to the callback as `ud`. `msgwait` uses it to tell
`PROCCREATE` from `PROCCREATE_NAME`, and replies from errors.

## Build and run msgwait
Duration: 5:00

1. Build on the host with `qcc` and link `libtraceparser`:

    ```bash
    qcc -Vgcc_ntoaarch64le -Wall -O2 -o msgwait msgwait.c -ltraceparser
    # macOS: the same command after ~/qtrace/env/qnx
    ```

    For an x86-64 target use `-Vgcc_ntox86_64`.

2. Copy it to the target, together with `libtraceparser.so.1` from the SDP: the default image does not
   include the library.

    ```bash
    T=~/qnx800/target/qnx/aarch64le
    ssh -i ~/qnx-vm/id_ed25519 -p 2222 root@127.0.0.1 mkdir -p /data/msgwait
    scp -O -i ~/qnx-vm/id_ed25519 -P 2222 msgwait $T/usr/lib/libtraceparser.so.1 \
        root@127.0.0.1:/data/msgwait/
    ```

3. On the target, trace `ls`:

    ```bash
    cd /data/msgwait
    LD_LIBRARY_PATH=. ./msgwait ls /proc/boot > /dev/null
    ```

    ```text
              ls[999446:1] -> procnto-smp-instr[1]  queued      11.0 us  served      19.0 us  server prio 10
              ls[999446:1] -> procnto-smp-instr[1]  queued       5.0 us  served       6.0 us  server prio 10
              ls[999446:1] -> procnto-smp-instr[1]  queued       8.0 us  served      90.0 us  server prio 10
              ls[999446:1] -> procnto-smp-instr[1]  queued       5.0 us  served      89.0 us  server prio 10
              ls[999446:1] -> devb-virtio      [45063]  queued      17.0 us  served     117.0 us  server prio 10  (MsgError)
              ls[999446:1] -> procnto-smp-instr[1]  queued      11.0 us  served      22.0 us  server prio 10  (MsgError)
    ...
              ls[999446:1] -> pipe             [122889]  queued      13.0 us  served      21.0 us  server prio 10
              ls[999446:1] -> procnto-smp-instr[1]  queued       6.0 us  served     176.0 us  server prio 10

    server            messages      queued us      served us
    procnto-smp-instr      365         1994.0         6028.1
    devb-virtio              6           79.0          356.0
    pipe                     4           60.0          116.0
    ```

    `msgwait` writes its report to standard error after the command ends, as `strace` does, so the
    command's own output can go elsewhere. One `ls` sends 375 messages. Almost all go to `procnto`: it is
    the process manager and the path manager, so loading the program and its libraries (`open`, `mmap`)
    and every path lookup are messages to it. The `(MsgError)` replies from `devb-virtio`, the disk
    driver behind `/data`, are files that do not exist: the dynamic linker looks for libraries in
    `LD_LIBRARY_PATH` first. Every message here was served within a fraction of a millisecond.

4. Now a pipeline. `wc` reads from a pipe that `ls` fills:

    ```bash
    LD_LIBRARY_PATH=. ./msgwait sh -c "ls /proc/boot | wc -l"
    ```

    ```text
    62
              sh[1191958:1] -> procnto-smp-instr[1]  queued      15.0 us  served      34.0 us  server prio 10
              sh[1191958:1] -> procnto-smp-instr[1]  queued      61.0 us  served      16.0 us  server prio 10
              sh[1191958:1] -> procnto-smp-instr[1]  queued      14.0 us  served     137.0 us  server prio 10
    ...
              wc[1191960:1] -> pipe             [122889]  queued      15.0 us  served   13016.0 us  server prio 10
              ls[1191959:1] -> pipe             [122889]  queued      20.0 us  served      96.0 us  server prio 10
              ls[1191959:1] -> pipe             [122889]  queued      29.0 us  served      40.0 us  server prio 10
              wc[1191960:1] -> pipe             [122889]  queued      19.0 us  served     170.0 us  server prio 10
    ...

    server            messages      queued us      served us
    procnto-smp-instr      611         9240.9        34295.3
    pipe                    58         1281.1        15885.0
    devb-virtio             23          491.0         1684.0
    ```

    `62` is the output of `wc`. The shell forks one child for each side of the pipe; the children run `ls`
    and `wc` under the pids they were forked with, and `msgwait` follows them because their parent is
    traced.

    The `wc` line with a **served** time of 13 ms is the answer to "what is `wc` waiting for". The
    message queued for only 15 us, so the pipe server was not busy. It then held the `read()` for 13 ms
    because the pipe was empty: it replies only when `ls` writes, and the `ls` lines right after it are `ls`
    talking to the same pipe server.
    The time is spent waiting for `ls`, not in `wc` and not in the pipe server's code. The numbers differ a
    little from run to run.

## See priority inheritance
Duration: 3:00

Run the same command at priority 30 with `on -p`:

```bash
LD_LIBRARY_PATH=. on -p 30 ./msgwait ls /proc/boot > /dev/null
```

```text
          ls[1110038:1] -> procnto-smp-instr[1]  queued      14.0 us  served      20.0 us  server prio 30
          ls[1110038:1] -> procnto-smp-instr[1]  queued      10.0 us  served      12.0 us  server prio 30
          ls[1110038:1] -> procnto-smp-instr[1]  queued       7.0 us  served     112.0 us  server prio 30
...

server            messages      queued us      served us
procnto-smp-instr      365         2320.0         6270.1
devb-virtio              6          101.0          458.0
pipe                     4           69.0          130.0
```

The **server prio** column follows the client. All 375 messages were served at priority 30, by
`procnto`, `devb-virtio` and `pipe` alike, where the run in the previous step showed 10. A server thread
that receives a message takes the priority of the client that sent it. Without this, a low-priority client could keep a server busy while a high-priority client
waits behind it.

## Going further
Duration: 2:00

`msgwait` answers one question with about 300 lines of C. A few directions to take it further:

- **Name the operation.** In wide mode the `MSG_SENDV` kernel-call event carries the first 12 bytes of the
  message. Its first 16 bits are the message type from `<sys/iomsg.h>` (`_IO_READ`, `_IO_WRITE`,
  `_IO_CONNECT` ...), so you can print `read` instead of a bare message.
- **Map connections to servers.** `ConnectAttach()` kernel-call events tell you which server each
  connection id leads to, before any message is sent.
- **Look inside the server.** Record kernel calls of the server too, and you can see what the server did
  while your client waited, for example a message of its own to a disk driver.

[qtrace](https://github.com/Fuze5k/qtrace) does all of this: it prints every kernel call of a process,
names each message (`open`, `read`, `write`, `devctl`, `mmap`, `spawn` ...), follows `open()` through
`procnto`'s path manager to the server that owns the path, sums the time per server and operation, and
writes an HTML timeline you can open on any computer.

### What you learned

- On QNX OS 8.0, most POSIX calls are messages to servers, and the time a call takes is mostly queue time
  plus the server's time.
- `tracelogger -d1` with `TraceEvent()` records only the classes you choose, and `SPAWN_HOLD` makes sure
  the first instruction of the traced program is in the trace.
- `libtraceparser` turns a `.kev` file into callbacks; the send, receive and reply events join on the
  receive id and the client's thread.
- A server thread runs at its client's priority while it serves it.

### Further reading

- [System Analysis Toolkit User's Guide](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.sat/topic/about.html)
- [`TraceEvent()`](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.lib_ref/topic/t/traceevent.html)
  and [`traceparser()`](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.lib_ref/topic/t/traceparser.html)
- [Interprocess communication](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.sys_arch/topic/ipc.html)
  and [priority inheritance and messages](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.sys_arch/topic/ipc_Priority_inheritance_messages.html)
  in the System Architecture guide
