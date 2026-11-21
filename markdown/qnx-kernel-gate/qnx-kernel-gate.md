id: qnx-kernel-gate
title: Keep an Untrusted Process Away from a Device on QNX 8.0
summary: Build a resource manager, let the kernel refuse a process it should refuse, lock that process down, learn the moment it dies, and bound a call to a server that stops answering
categories: qnx, ipc, security
tags: intermediate
difficulty: 2
status: published
authors: ZNLong2203
feedback_link: https://github.com/qnx/codelabs/issues


# Keep an Untrusted Process Away from a Device on QNX 8.0

## Welcome
Duration: 2:00

### Overview
Sooner or later a system has a process you do not fully trust: a machine-learning model, a plug-in, a third-party library running in its own process. This codelab shows how to put such a process behind a gate that **the QNX kernel enforces**, so safety does not depend on the process behaving well.

You will build five small programs:

| Program | What it shows |
|---|---|
| `valve-rm` | A resource manager that owns a device node only root may open |
| `intruder` | The kernel refusing an ordinary user, with no code of yours involved |
| `sandboxed` | A process that starts as root, locks away abilities, then drops to an ordinary user |
| `watcher` and `talker` | A server that learns the moment a client dies, from a kernel pulse |
| `mute` | Why a call timeout does not always fire, and two ways to make it hold |

### What you will learn
- Create a device with `resmgr` and `iofunc`, and answer `devctl()` commands.
- Let the file mode and owner of a node do the access control.
- Use `procmgr_ability()` to deny and lock abilities, then `setuid()`.
- Receive `_PULSE_CODE_DISCONNECT` from a channel made by `name_attach()`.
- Use `TimerTimeout()`, and know when it cannot release a client.

These are the building blocks of **Tether**, a hackathon project that keeps an AI controller away from a simulated ventilator's actuator. Everything here was run on QNX SDP 8.0.

---

## Set Up Environment
Duration: 6:00

### Pre-requisites
1. A free QNX non-commercial licence and QNX SDP 8.0 installed. If you do not have them yet, follow the [Get a Free Non-Commercial QNX License](https://qnx.github.io/codelabs/get-non-commercial-qnx-license/index.html) codelab.
2. A QNX 8.0 target you can log in to. A board works. So does the QEMU image that `mkqnximage` builds (see the QNX documentation for `mkqnximage`).
3. A way to copy files to the target, such as `scp`, and a shell on it, such as `ssh`.

### Get the programs
The folder `src/` next to this codelab holds every file shown below. You can also create each file as you reach it. One header and six C files are used:

```
valve.h  valve-rm.c  intruder.c  sandboxed.c  watcher.c  talker.c  mute.c
```

### Build script
Create `build.sh` next to them:

```bash
#!/bin/sh
# Cross-compile the examples. Run after: source <sdp>/qnxsdp-env.sh
#   ./build.sh                 aarch64 little-endian (the default of the QNX QEMU image)
#   ARCH=gcc_ntox86_64 ./build.sh
set -e
cd "$(dirname "$0")"
mkdir -p out
for p in valve-rm intruder sandboxed watcher talker mute; do
  qcc -V"${ARCH:-gcc_ntoaarch64le}" -Wall -o "out/$p" "$p.c"
  echo "built out/$p"
done
```

Load the SDP environment and build:

```bash
source ~/qnx800/qnxsdp-env.sh
chmod +x build.sh
./build.sh
```

The programs land in `out/`. On an x86_64 target use `ARCH=gcc_ntox86_64 ./build.sh`.

### Copy them to the target
```bash
ssh root@<target> mkdir -p /tmp/codelab
scp out/* root@<target>:/tmp/codelab/
ssh root@<target>
```

On the target, `cd /tmp/codelab` and `chmod +x *`. If your QEMU image forwards ssh to another port, add `-P <port>` to `scp` and `-p <port>` to `ssh`.

We use user ID **2002** as the ordinary, untrusted user. It does not need an entry in the password file: the `on` utility can run a program as any ID.

---

## A Device That Belongs to Root
Duration: 10:00

A resource manager is a process that adds a name to the path space, such as `/dev/guard/valve`. Programs reach it with `open()` and `devctl()`. Our valve has one number, its opening in percent.

### The shared header
```c
/* Shared by the valve resource manager and its clients. */
#ifndef VALVE_H
#define VALVE_H
#include <devctl.h>

#define VALVE_PATH "/dev/guard/valve"

/* Set or read the valve opening, in percent (0..100). */
#define DCMD_VALVE_SET __DIOT(_DCMD_MISC, 0x01, int)
#define DCMD_VALVE_GET __DIOF(_DCMD_MISC, 0x02, int)
#endif
```

`__DIOT` marks a command that sends data to the device and `__DIOF` one that reads it back.

### The resource manager
```c
/* valve-rm: a resource manager that owns one device, /dev/guard/valve.
 * The node belongs to root and is mode 0600, so only root can open it. */

/* Typed handles for the callbacks (see <sys/resmgr.h>). */
struct _iofunc_attr;
#define RESMGR_HANDLE_T struct _iofunc_attr
struct _iofunc_ocb;
#define RESMGR_OCB_T struct _iofunc_ocb

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/dispatch.h>
#include <sys/iofunc.h>
#include <sys/stat.h>

#include "valve.h"

static int percent;          /* the state of the "hardware" */
static int refused;          /* opens the kernel's permission check turned down */
static iofunc_attr_t attr;

/* Reply to a devctl with n bytes of data (n may be 0). */
static int reply(resmgr_context_t *ctp, io_devctl_t *msg, const void *data, size_t n)
{
    memset(&msg->o, 0, sizeof(msg->o));
    msg->o.ret_val = EOK;
    msg->o.nbytes = (int32_t)n;
    if (n > 0) memcpy(_DEVCTL_DATA(msg->o), data, n);
    return _RESMGR_PTR(ctp, &msg->o, sizeof(msg->o) + n);
}

static int do_devctl(resmgr_context_t *ctp, io_devctl_t *msg, iofunc_ocb_t *ocb)
{
    int s = iofunc_devctl_default(ctp, msg, ocb); /* the standard commands */
    if (s != _RESMGR_DEFAULT) return s;

    switch (msg->i.dcmd) {
    case DCMD_VALVE_SET: {
        int v = *(int *)_DEVCTL_DATA(msg->i);
        if (v < 0 || v > 100) return EINVAL;
        percent = v;
        printf("valve set to %d%%\n", percent);
        return reply(ctp, msg, NULL, 0);
    }
    case DCMD_VALVE_GET:
        return reply(ctp, msg, &percent, sizeof(percent));
    }
    return ENOSYS;
}

/* open() goes through here first. The default handler checks the caller's
 * user and group against the node's mode bits; we only count the refusals. */
static int do_open(resmgr_context_t *ctp, io_open_t *msg, RESMGR_HANDLE_T *handle, void *extra)
{
    int r = iofunc_open_default(ctp, msg, handle, extra);
    if (r == EACCES) printf("the kernel's check refused an open (%d so far)\n", ++refused);
    return r;
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    dispatch_t *dpp = dispatch_create();
    if (dpp == NULL) { perror("dispatch_create"); return 1; }

    resmgr_attr_t rattr;
    memset(&rattr, 0, sizeof(rattr));
    rattr.nparts_max = 1;
    rattr.msg_max_size = 1024;

    resmgr_connect_funcs_t cfuncs;
    resmgr_io_funcs_t ifuncs;
    iofunc_func_init(_RESMGR_CONNECT_NFUNCS, &cfuncs, _RESMGR_IO_NFUNCS, &ifuncs);
    cfuncs.open = do_open;
    ifuncs.devctl = do_devctl;

    iofunc_attr_init(&attr, S_IFCHR | 0600, NULL, NULL); /* rw for the owner only */
    attr.uid = 0;
    attr.gid = 0;

    if (resmgr_attach(dpp, &rattr, VALVE_PATH, _FTYPE_ANY, 0, &cfuncs, &ifuncs, &attr) == -1) {
        perror("resmgr_attach");
        return 1;
    }
    printf("serving %s\n", VALVE_PATH);

    dispatch_context_t *ctp = dispatch_context_alloc(dpp);
    for (;;) {
        if ((ctp = dispatch_block(ctp)) == NULL) { perror("dispatch_block"); return 1; }
        dispatch_handler(ctp);
    }
}
```

Three things matter here:

1. **The node's owner and mode.** `iofunc_attr_init(&attr, S_IFCHR | 0600, ...)` with `uid` and `gid` set to 0 makes the node readable and writable by root only. Nothing else in the program decides who may open it.
2. **`do_devctl`.** It first calls `iofunc_devctl_default()` for the standard commands, then handles our two. `_RESMGR_PTR` sends the reply.
3. **`do_open`.** It calls `iofunc_open_default()`, which compares the caller's user and group with the node's mode. We only look at the result to count refusals.

### Run it
```bash
./valve-rm &
ls -l /dev/guard
```

You should see the server announce itself, and a node that only root can use:

```
serving /dev/guard/valve
crw-------  1 root root  0,   1 ... valve
```

---

## Let the Kernel Say No
Duration: 6:00

### The intruder
```c
/* intruder: try to open the valve and turn it all the way up. */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#include "valve.h"

int main(void)
{
    printf("running as uid %d\n", (int)geteuid());
    int fd = open(VALVE_PATH, O_RDWR);
    if (fd < 0) {
        printf("open %s: %s\n", VALVE_PATH, strerror(errno));
        return 1;
    }
    int percent = 100;
    int e = devctl(fd, DCMD_VALVE_SET, &percent, sizeof(percent), NULL);
    printf("opened the valve and set it to 100%%: %s\n", e == EOK ? "done" : strerror(e));
    close(fd);
    return 0;
}
```

### Run it twice
As root, then as the ordinary user:

```bash
./intruder
on -u 2002:2002 ./intruder
```

```
running as uid 0
opened the valve and set it to 100%: done
running as uid 2002
open /dev/guard/valve: Permission denied
```

Look at the resource manager's output:

```
valve set to 100%
the kernel's check refused an open (1 so far)
```

The refusal happened inside `iofunc_open_default()`, using only the node's mode and owner. The intruder never reached `do_devctl`, and nothing we wrote had to anticipate it.

---

## Take Away What a Process Does Not Need
Duration: 10:00

Refusing the device is one gate. A process you distrust should also lose the ability to make new ones, for example by starting other programs. QNX calls these **abilities**, and `procmgr_ability()` can deny them and lock the decision.

### The sandboxed process
```c
/* sandboxed: start as root, then give up what we should never need again.
 *   sandboxed             lock the abilities, then drop to uid 2002
 *   sandboxed --no-lock   only drop to uid 2002 (for comparison) */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/procmgr.h>
#include <unistd.h>

#include "valve.h"

#define LOCKED_OUT(id) (PROCMGR_ADN_NONROOT | PROCMGR_AOP_DENY | PROCMGR_AOP_LOCK | (id))

static void try_open(const char *when)
{
    int fd = open(VALVE_PATH, O_RDWR);
    if (fd < 0) {
        printf("%-28s open: %s\n", when, strerror(errno));
    } else {
        printf("%-28s open: ok\n", when);
        close(fd);
    }
}

int main(int argc, char **argv)
{
    int lock = !(argc > 1 && strcmp(argv[1], "--no-lock") == 0);
    int fd = open(VALVE_PATH, O_RDWR); /* still root: allowed */
    if (fd < 0) { perror("open"); return 1; }
    int percent = 10;
    devctl(fd, DCMD_VALVE_SET, &percent, sizeof(percent), NULL);

    /* 1. Refuse, for good, the abilities this process has no use for. The
     *    deny-and-lock applies once we are no longer root. */
    int e = EOK;
    if (lock)
        e = procmgr_ability(0,
                            LOCKED_OUT(PROCMGR_AID_FORK),
                            LOCKED_OUT(PROCMGR_AID_SPAWN),
                            PROCMGR_AID_EOL);
    if (e != EOK) printf("procmgr_ability: %s\n", strerror(e));

    /* 2. Become an ordinary user. */
    if (setgid(2002) != 0 || setuid(2002) != 0) { perror("drop"); return 1; }
    printf("now uid %d, abilities %s\n", (int)geteuid(), lock ? "locked" : "left alone");

    /* 3. What can we still do? */
    percent = 20;
    e = devctl(fd, DCMD_VALVE_SET, &percent, sizeof(percent), NULL);
    printf("%-28s %s\n", "the fd opened before:", e == EOK ? "still works" : strerror(e));
    try_open("a fresh open now:");
    pid_t p = fork();
    if (p == 0) _exit(0);
    printf("%-28s %s\n", "fork:", p < 0 ? strerror(errno) : "allowed");
    return 0;
}
```

The order is the point:

1. Open what you need while you are still root.
2. Deny and lock abilities. `PROCMGR_ADN_NONROOT` says the rule applies once the process is no longer root, `PROCMGR_AOP_DENY | PROCMGR_AOP_LOCK` denies and freezes it, and the list ends with `PROCMGR_AID_EOL`.
3. Drop to an ordinary user with `setgid()` and `setuid()`.

### Run it with and without the lock
```bash
./sandboxed
./sandboxed --no-lock
```

```
now uid 2002, abilities locked
the fd opened before:        still works
a fresh open now:            open: Permission denied
fork:                        Operation not permitted

now uid 2002, abilities left alone
the fd opened before:        still works
a fresh open now:            open: Permission denied
fork:                        allowed
```

Two lessons:

- Only the lock stops `fork()`. An ordinary user may fork by default, so denying it is a real restriction.
- **The file descriptor opened before the drop still works.** Access is checked at `open()`, not at each `devctl()`. Close what a process no longer needs before it drops privileges.

Each ability has its own `PROCMGR_AID_*` name. The QNX C Library Reference for `procmgr_ability()` lists them, and the SDP installs that page under `target/qnx/usr/help`.

---

## Know the Moment a Client Dies
Duration: 8:00

A server often needs to clean up when a client disappears. You do not have to poll: the kernel tells you.

### A server that watches
```c
/* watcher: a server that learns the moment a client disappears. */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <sys/dispatch.h>
#include <sys/neutrino.h>

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    name_attach_t *att = name_attach(NULL, "guard-watch", 0);
    if (att == NULL) { perror("name_attach"); return 1; }
    printf("watcher ready\n");

    for (;;) {
        union { uint16_t type; struct _pulse pulse; char text[64]; } m;
        struct _msg_info info;
        int rcvid = MsgReceive(att->chid, &m, sizeof(m), &info);

        if (rcvid == 0) { /* a pulse, not a message */
            if (m.pulse.code == _PULSE_CODE_DISCONNECT) {
                printf("a client went away: the kernel sent a disconnect pulse (scoid %d)\n", m.pulse.scoid);
                ConnectDetach(m.pulse.scoid);
            }
            continue;
        }
        if (rcvid < 0) continue;
        if (m.type == _IO_CONNECT) { /* name_open() asking to connect */
            MsgReply(rcvid, EOK, NULL, 0);
            continue;
        }
        m.text[info.msglen < (int)sizeof(m.text) ? info.msglen : (int)sizeof(m.text) - 1] = '\0';
        printf("message from pid %d: \"%s\"\n", (int)info.pid, m.text);
        MsgReply(rcvid, 2, "ok", 2);
    }
}
```

`name_attach()` creates a channel and registers a name. As the QNX documentation for `name_attach()` explains, the channel is created with `_NTO_CHF_DISCONNECT` among its flags, so when the last connection from a client goes away the kernel delivers a `_PULSE_CODE_DISCONNECT` pulse. A pulse arrives from `MsgReceive()` with a receive ID of 0, which is how the loop tells it from a message.

### A client that crashes
```c
/* talker: send a few messages to the watcher, then crash. */
#include <stdio.h>
#include <string.h>
#include <sys/dispatch.h>
#include <sys/neutrino.h>

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    int coid = name_open("guard-watch", 0);
    if (coid < 0) { perror("name_open"); return 1; }

    for (int i = 1; i <= 3; i++) {
        char msg[32], reply[8];
        snprintf(msg, sizeof(msg), "hello %d", i);
        long r = MsgSend(coid, msg, strlen(msg), reply, sizeof(reply));
        printf("sent \"%s\", the reply status was %ld\n", msg, r);
    }
    printf("crashing now\n");
    *(volatile int *)0 = 1; /* SIGSEGV */
    return 0;
}
```

### Run them
```bash
./watcher &
./talker
```

```
sent "hello 1", the reply status was 2
sent "hello 2", the reply status was 2
sent "hello 3", the reply status was 2
crashing now
Memory fault (core dumped)
```

and in the watcher's output:

```
watcher ready
message from pid ...: "hello 1"
message from pid ...: "hello 2"
message from pid ...: "hello 3"
a client went away: the kernel sent a disconnect pulse (scoid ...)
```

Notice that the reply status is **2**, the number of bytes `watcher` passed to `MsgReply()`. `MsgSend()` returns the status given to `MsgReply()`, so passing the reply length is a convenient convention.

---

## A Deadline That Does Not Always Fire
Duration: 12:00

A client that calls a server which never answers is stuck. `TimerTimeout()` puts a deadline on the next blocking call. Let us see when it works.

### The mute server and its client
```c
/* mute: a server that takes a message and never answers, and a client that
 * calls it with or without a deadline.
 *   mute server [name]
 *   mute polite [name]     same, but it keeps listening and answers the kernel's unblock pulse
 *   mute client [bounded] [name]
 * The default name is "guard-mute". */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/dispatch.h>
#include <sys/neutrino.h>
#include <unistd.h>

static int server(const char *name, int polite)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    name_attach_t *att = name_attach(NULL, name, 0);
    if (att == NULL) { perror("name_attach"); return 1; }
    printf("mute server ready\n");
    for (;;) {
        union { uint16_t type; struct _pulse pulse; char buf[32]; } m;
        int rcvid = MsgReceive(att->chid, &m, sizeof(m), NULL);
        if (rcvid > 0 && m.type == _IO_CONNECT) { MsgReply(rcvid, EOK, NULL, 0); continue; }
        if (rcvid > 0) {
            printf("got a message and I will not reply\n");
            if (!polite) for (;;) pause();   /* stall without ever listening again */
            continue;                        /* keep listening, but still do not reply */
        }
        if (rcvid == 0 && m.pulse.code == _PULSE_CODE_UNBLOCK) {
            /* The kernel asks us to release a client whose deadline has passed. */
            int victim = m.pulse.value.sival_int;
            printf("unblock pulse: releasing the client\n");
            MsgError(victim, ETIMEDOUT);
        }
    }
}

static int client(int bounded, const char *name)
{
    int coid = name_open(name, 0);
    if (coid < 0) { perror("name_open"); return 1; }
    if (bounded) {
        uint64_t deadline = 200 * 1000 * 1000ULL; /* ns */
        /* Applies to the next blocking kernel call only. */
        TimerTimeout(CLOCK_MONOTONIC, _NTO_TIMEOUT_SEND | _NTO_TIMEOUT_REPLY, NULL, &deadline, NULL);
    }
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    long r = MsgSend(coid, "ping", 4, NULL, 0);
    int e = errno;
    clock_gettime(CLOCK_MONOTONIC, &t1);
    long ms = (t1.tv_sec - t0.tv_sec) * 1000 + (t1.tv_nsec - t0.tv_nsec) / 1000000;
    if (r < 0) printf("MsgSend failed after %ld ms: %s\n", ms, strerror(e));
    else printf("MsgSend returned %ld after %ld ms\n", r, ms);
    return 0;
}

int main(int argc, char **argv)
{
    const char *cmd = argc >= 2 ? argv[1] : "";
    if (strcmp(cmd, "server") == 0 || strcmp(cmd, "polite") == 0)
        return server(argc >= 3 ? argv[2] : "guard-mute", cmd[0] == 'p');
    if (strcmp(cmd, "client") == 0) {
        int bounded = argc >= 3 && strcmp(argv[2], "bounded") == 0;
        const char *name = argc >= (bounded ? 4 : 3) ? argv[bounded ? 3 : 2] : "guard-mute";
        return client(bounded, name);
    }
    fprintf(stderr, "usage: mute server|polite [name] | mute client [bounded] [name]\n");
    return 2;
}
```

### Case 1: a server that stops answering
```bash
./mute server &
./mute client bounded &
sleep 3
pidin -F "%a %N %J" | grep mute
```

```
 ...  mute      SIGWAITINFO
 ...  mute      REPLY
```

The server printed `got a message and I will not reply`. The client set a 200 ms deadline and is still in the `REPLY` state seconds later. **The deadline did not fire.**

The QNX documentation for `TimerTimeout()` explains why. If the server already received the message and created its channel with `_NTO_CHF_UNBLOCK`, `MsgSend()` does not unblock on its own. The kernel sends the server an unblock pulse instead, and it is up to the server to reply or call `MsgError()`. `name_attach()` and every resource manager create their channels with that flag.

Stop the pair with `slay -f mute`.

### Case 2: a server that answers the unblock pulse
This version keeps listening and releases the client when the pulse arrives:

```bash
./mute polite &
./mute client bounded
```

```
MsgSend failed after 203 ms: Connection timed out
```

The server printed `unblock pulse: releasing the client`. Now the deadline holds. This is the right fix **when you write the server**.

### Case 3: a server you do not control
If the server is the untrusted process, you cannot make it answer. Make the client survive it instead: give every call to that server to one helper thread, and let the caller give up while the helper stays stuck. This is a sketch of the idea:

```c
/* The caller waits at most 400 ms; the helper may block for as long as the server likes. */
long call_untrusted(const void *msg, size_t n, void *reply, size_t rn)
{
    pthread_mutex_lock(&job.mu);
    if (job.busy) {                /* an earlier call is still stuck */
        pthread_mutex_unlock(&job.mu);
        errno = EBUSY;
        return -1;
    }
    hand_job_to_helper(msg, n, rn);
    wait_on_condvar_with_deadline(&job.done, 400 /* ms */);
    if (!job.finished) {           /* the helper is still inside MsgSend() */
        job.abandoned = 1;         /* it will discard its answer when it returns */
        pthread_mutex_unlock(&job.mu);
        errno = ETIMEDOUT;
        return -1;
    }
    copy_reply(reply, rn);
    job.busy = 0;
    pthread_mutex_unlock(&job.mu);
    return job.result;
}
```

Tether's dashboard gateway uses this pattern to talk to its AI process. With the AI's control channel silent, the first call returned an error after 0.4 s, the status page still answered in 8 ms, and later calls failed in about 2 ms instead of piling up.

---

## Wrap Up
Duration: 3:00

### What each tool gave you
| Goal | Tool | Where you saw it |
|---|---|---|
| Only root may use the device | node mode and owner, checked by `iofunc_open_default()` | `intruder` |
| A process loses what it does not need | `procmgr_ability()` deny and lock, then `setuid()` | `sandboxed` |
| Learn that a client died | `_PULSE_CODE_DISCONNECT` on a `name_attach()` channel | `watcher` and `talker` |
| Never wait forever on a server | `TimerTimeout()`, plus the unblock pulse or a helper thread | `mute` |

### Clean up
```bash
slay -f valve-rm
slay -f watcher
slay -f mute
```

### Where to go next
- Combine the pieces: **Tether** runs an AI controller as an ordinary user behind exactly this kind of gate, with a verified arbiter in front of the actuator.
- Read the QNX documentation for `resmgr_attach()`, `iofunc_open_default()`, `name_attach()`, `TimerTimeout()` and `procmgr_ability()` for the options this codelab left out.
