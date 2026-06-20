---
name: qnx-driver-development
description: "Router for QNX 8.0 device driver development, as distinct from packaging a library. Read this when the task is writing or porting a driver (a resource manager), not building an Alpine package. Explains the QNX driver model (user-space resource managers, not kernel modules) and routes to the specific driver sub-skill: char/serial, I2C, SPI, HID, USB, or sensor/camera. Each sub-skill covers the QNX interface, a Linux-to-QNX comparison, and porting guidance for that device class."
---

# QNX Driver Development (Router)

Read this when the work is a device driver, not a library package. If you are adapting an APKBUILD to build some open-source library, this is the wrong tree: go back to `qnx-porting` and use `alpine-qnx-porting`. This tree is for writing or porting drivers.

## The one fact that reframes all driver work

On Linux, drivers are kernel modules: they run in kernel space, register with a kernel subsystem, and are loaded into the kernel. On QNX, drivers are ordinary user-space processes, almost always implemented as resource managers, and you start them like any other program. There is no kernel module to load. This single architectural difference drives almost every Linux-to-QNX driver porting decision:

A Linux driver's `probe`/`remove` callbacks map to QNX init/fini (or insertion/removal for hot-pluggable buses like USB and HID). Integration that Linux does by filling a kernel struct (`i2c_algorithm`, `spi_controller`, `usb_driver`) QNX does by registering function pointers with a QNX interface struct or by implementing a resource-manager message loop. Communication that Linux exposes through `/dev` file_operations, QNX provides by the driver acting as a resource manager that clients reach with standard open/read/write/devctl, all carried under the hood by QNX native message passing.

## Router

Match the device class and load the sub-skill:

**Character or serial device** (byte-stream devices, UART, serial ports; termios, devctl line control): load `qnx-driver-char-serial`. Note QNX ships devc-* and devc-ser* drivers already; check those before writing one.

**I2C** (two-wire master/slave, devctl DCMD_I2C_SEND / DCMD_I2C_SENDRECV, i2c_sendrecv_t / i2c_addr_t): load `qnx-driver-i2c`.

**SPI** (full-duplex, DCMD_SPI_DATA_XCHNG / DCMD_SPI_SET_CONFIG, spi_xchng_t / spi_cfg_t, spi.conf): load `qnx-driver-spi`.

**HID** (keyboards, mice, gamepads, joysticks; io-hid, libhiddi, report descriptors): load `qnx-driver-hid`.

**USB** (raw USB device drivers, libusbdi, io-usb, URBs, endpoints, descriptors): load `qnx-driver-usb`.

**Camera or sensor** (Sensor Framework, external camera / platform / serdes libraries, lidar and other non-camera sensors): load `qnx-driver-sensor-camera`.

## Common to all driver sub-skills

Each sub-skill is built to the same shape: the QNX interface (the struct of function pointers or the resource-manager surface you implement), a side-by-side Linux comparison so a Linux driver author can map concepts, the start/configuration mechanism (config file or command-line options), and the devctl/IPC surface clients use to talk to the driver. Where QNX already ships a driver for a common board (for example the Raspberry Pi I2C and SPI controllers), the sub-skill notes it, because using the shipped driver is usually correct over writing a new one.

## Status

The leaf sub-skills (char-serial, i2c, spi, hid, usb, sensor-camera) are derived from the internal driver-development reference and are built out on demand. If a leaf is not yet present when you need it, the reference material exists and the sub-skill can be generated from it; flag that it needs creating rather than guessing at the interface.

