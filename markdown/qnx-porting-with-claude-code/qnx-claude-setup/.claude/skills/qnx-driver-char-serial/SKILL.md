---
name: qnx-driver-char-serial
description: "QNX 8.0 character and serial device driver development. Read when writing or porting a char/serial driver (UART, serial ports, byte-stream devices). Covers the devc-* / devc-ser* drivers QNX already ships, termios configuration, devctl line control, and porting Linux serial code (which is mostly POSIX and ports easily). Part of the qnx-driver-development tree; read qnx-driver-development first."
---

# QNX Char / Serial Driver Development

Read `qnx-driver-development` first for the user-space-resource-manager model that underlies this. This leaf covers character and serial devices specifically.

## Check for a shipped driver first

QNX already provides a family of character drivers, named `devc-*` and serial ones `devc-ser*`:

devc-con and devc-con-hid (x86_64 only), devc-pty, devc-ser8250, devc-serpci, devc-serpl011, devc-serusb, devc-serusb_dcd.

Before writing a driver, check whether one of these already covers your hardware. Use the `use` command to see a specific driver's options, for example `use devc-serusb`. The generic `devc-*` (io-char) options apply on top of each specific driver's own options. Starting a shipped driver is almost always correct over writing a new one.

## Start and configure

Char/serial drivers take command-line options at start. The io-char common options (buffer sizes, flow control, edit vs raw mode, logging, priority) apply to all devc-* drivers; serial options (baud, clock/divisor, unit) apply to devc-ser* and devc-virtio. Example device-specific start:

```
devc-serusb -d vid=0x045c,did=0x0195,busno=0,devno=2,module=generic,ign_remove
```

## Interfacing as a client

Once started, the driver exposes a path under `/dev/ser*` (the exact name depends on the driver). Configure it two ways: pass options at start, or set a `termios` struct at runtime. Standard open/read/write/close work normally. The full interface is in `sys/io-char.h` and `sys/dcmd_chr.h`.

Use `devctl()` for line control and driver-specific queries, for example line status:

```c
int status = 0;
devctl(fd, DCMD_CHR_LINESTATUS, &status, sizeof(status), NULL);
```

Other useful DCMDs include enabling logging and setting a logging directory (DCMD_CHR_SET_LOGGING_DIR), verbosity control, and line status. See the devctl docs for the full list.

## Porting Linux serial code

This is one of the easier device classes to port, because QNX implements the POSIX serial standard. Core functions (`tcgetattr()`, `tcsetattr()`) and the entire `termios` structure are identical. The differences are narrow:

Device naming: Linux `/dev/tty*` becomes QNX `/dev/ser*`.

Control path: Linux `ioctl()` becomes QNX `devctl()` with commands in `sys/dcmd_chr.h` (for example DCMD_CHR_ENABLE_LOGGING, DCMD_CHR_SETVERBOSITY, DCMD_CHR_LINESTATUS).

Most Linux serial code ports by updating device paths and optionally adopting QNX's extra devctl features, while leaving the core POSIX termios logic untouched.

