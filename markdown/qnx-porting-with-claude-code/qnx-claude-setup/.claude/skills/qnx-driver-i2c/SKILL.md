---
name: qnx-driver-i2c
description: "QNX 8.0 I2C driver development. Read when writing or porting an I2C master driver, or writing a client application that talks to an I2C device on QNX. Covers the i2c_master_funcs_t interface to implement, the devctl client surface (DCMD_I2C_SEND, DCMD_I2C_SENDRECV) with i2c_sendrecv_t / i2c_addr_t, the shipped per-board drivers, and the Linux-to-QNX porting differences. Part of the qnx-driver-development tree; read that first."
---

# QNX I2C Driver Development

Read `qnx-driver-development` first. This leaf covers I2C master drivers and I2C client code on QNX 8.0.

## The driver interface to implement

A QNX I2C driver implements the `i2c_master_funcs_t` set of function pointers, defined in `hw/i2c.h`. The functions you provide:

`version_info`, `init` (returns an opaque handle passed to all other functions), `fini` (frees that handle), `send` (master send, returns a status bitmask), `recv` (master receive), `abort` (force the master to free the bus), `set_slave_addr`, `set_bus_speed`, `driver_info`, `ctl` (driver-specific devctl), and `bus_reset`.

You define a device struct holding state (buffer management, mapped register base/physbase, interrupt id, transfer state, slave address and format, speed), allocate and fill it in `init`, and free it in `fini`. Register your functions through `i2c_master_getfuncs()` using the `I2C_ADD_FUNC` macro for each.

Typical `init` work: allocate the device struct, parse command-line options into it, call `ThreadCtl(_NTO_TCTL_IO, 0)` for I/O privilege, `mmap_device_io()` the hardware registers, and `InterruptAttachEvent()` for the interrupt.

## Shipped drivers and starting

For common boards QNX ships a driver, for example `i2c-bcm2711` on the Raspberry Pi 4. Start it directly; use `use i2c-bcm2711` to see options. Generic options include `--b bus_speed` and `--u unit`. Example:

```
i2c-bcm2711 -p0xfe804000 --b100000 --u1
```

Different boards need different drivers, but the client interface is the same across them.

## Client surface

Once started, the driver exposes a path under `/dev/i2c*`. Clients use `devctl()` with the command and structures from `hw/i2c.h`. The core structures:

```c
typedef struct {
    i2c_addr_t  slave;      /* slave address */
    _Uint32t    send_len;   /* send length in bytes */
    _Uint32t    recv_len;   /* receive length in bytes */
    _Uint32t    stop;       /* set stop when complete? */
} i2c_sendrecv_t;

typedef struct {
    _Uint32t    addr;   /* I2C address */
    _Uint32t    fmt;    /* 7- or 10-bit format */
} i2c_addr_t;
```

A combined send-then-receive (write register address, read value) uses `DCMD_I2C_SENDRECV` with an `i2c_sendrecv_t` header followed by the data bytes. `DCMD_I2C_SEND` is the write-only command. The full DCMD list is in the I2C devctl docs.

## Porting a Linux I2C driver

Linux integrates driver functions through the `i2c_algorithm` struct (xfer, functionality) and a `platform_driver` with `probe`/`remove`. The mapping to QNX:

Linux `probe`/`remove` map to QNX `init`/`fini`. Linux registers `i2c_algorithm` function pointers in a kernel struct; QNX registers via `i2c_master_getfuncs()` and `I2C_ADD_FUNC`. The Linux driver is loaded as a kernel module; the QNX driver is started like any user application, no kernel load.

## Porting an I2C client (device) from Linux

The access method differs at the call level. Linux clients use `ioctl()` with `I2C_SLAVE` and `I2C_RDWR`, and can also use plain `read()`/`write()`. QNX clients do not support `read()`/`write()` for I2C; they use `devctl()` exclusively, with `DCMD_I2C_SEND` and `DCMD_I2C_SENDRECV`. The message structures differ too: Linux uses `i2c_rdwr_ioctl_data` and `i2c_msg`; QNX uses `i2c_sendrecv_t` and `i2c_addr_t`. Porting a client is mostly rewriting the transfer calls and the structures, not the device logic.

