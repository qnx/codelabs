---
name: qnx-driver-spi
description: "QNX 8.0 SPI driver development. Read when writing or porting an SPI driver, or writing a client that talks to an SPI device on QNX. Covers the _spi_funcs interface to implement, the spi.conf configuration file, the devctl client surface (DCMD_SPI_DATA_XCHNG, DCMD_SPI_SET_CONFIG) with spi_xchng_t / spi_cfg_t, shipped per-board drivers, and Linux-to-QNX porting differences. Part of the qnx-driver-development tree; read that first."
---

# QNX SPI Driver Development

Read `qnx-driver-development` first. This leaf covers SPI driver and client work on QNX 8.0. SPI is synchronous full-duplex: MOSI, MISO, SCLK, and one or more CS lines.

## The driver interface to implement

A QNX SPI driver implements the `_spi_funcs` struct from `hw/io-spi.h`. The functions:

`spi_fini` (cleanup), `drvinfo`, `devinfo`, `setcfg` (set device configuration: word width, CS and clock polarity/phase, clock rate), `xfer` (the transfer function), `dma_xfer`, `dma_allocbuf`, `dma_freebuf` (DMA paths, may be NULL if unsupported).

You define a device struct holding physical/virtual register base, irq and interrupt id, input clock, transfer buffer and counters, data width, and pointers to the bus/control structures. The driver entry point is `spi_init(spi_bus_t *bus)`: it allocates the struct, wires your functions into `bus->funcs`, pulls controller parameters (pbase, irq, input_clk) from the bus, maps registers, attaches the interrupt, configures each device in the bus device list via your `setcfg`, and creates the CS devices with `spi_create_devs()`.

In `xfer`, set transfer parameters from tnbytes/rnbytes (read-only, write-only, or bidirectional), capture max transaction length, reset and clear FIFOs, enable transfer, fill the TX FIFO, wait for completion, then disable. Hardware-specific helpers (`spi_enable`, `spi_write_fifo`, `spi_wait_complete`, `spi_disable`, `spi_set_clock`) are yours to implement.

## Configuration file and starting

SPI drivers read a config file, default `/etc/system/config/spi/spi.conf`, or one given with `-c`. On the RPi4 the driver is `spi-bcm2711`, started as `spi-bcm2711 -c /system/etc/config/spi/spi.conf`. Use `use spi-bcm2711` for options; a template lives at `lib/io-spi/config_files/spi-template.conf`. The config defines `[globals]`, one or more `[bus]` sections (busno, name, base, irq, input_clock, driver-specific `bs` options like rpanic/tpanic, DMA options), and `[dev]` sections per chip-select (parent_busno, devno, name, clock_rate, cpha, cpol, bit_order, word_width).

## Client surface

The driver exposes `/dev/io-spi/spi<bus>/dev<device>`. Clients use `devctl()` (open/read/write also work). Structures:

```c
typedef struct {
    uint32_t  nbytes;    /* exchange data length */
    uint8_t   data[0];   /* exchange data */
} spi_xchng_t;

typedef struct {
    uint32_t  mode;        /* SPI mode */
    uint32_t  clock_rate;  /* bus speed */
} spi_cfg_t;
```

Configure with `DCMD_SPI_SET_CONFIG` and an `spi_cfg_t`; exchange data with `DCMD_SPI_DATA_XCHNG` and an `spi_xchng_t` plus its data. `DCMD_SPI_GET_DRVINFO` and `DCMD_SPI_GET_DEVINFO` query driver and device info.

## Porting a Linux SPI driver

Linux uses the `spi_controller` struct (setup, transfer_one, etc.) and a `platform_driver` with probe/remove. Map probe/remove to QNX init/fini, and the `spi_controller` registration to wiring your functions into `spi_bus_t` inside `spi_init`. Kernel module load becomes a user-space start.

## Porting an SPI client from Linux

Linux clients use `ioctl()` (SPI_IOC_WR_MODE, SPI_IOC_WR_BITS_PER_WORD, SPI_IOC_WR_MAX_SPEED_HZ, SPI_IOC_MESSAGE) and `spi_ioc_transfer`. QNX clients use `devctl()` (DCMD_SPI_DATA_XCHNG, DCMD_SPI_SET_CONFIG) with `spi_xchng_t` and `spi_cfg_t`. Both platforms also support plain open/read/write/close for SPI. Porting is mostly translating the config and transfer calls and structures.

