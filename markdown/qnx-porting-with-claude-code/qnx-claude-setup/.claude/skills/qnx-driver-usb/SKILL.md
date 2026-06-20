---
name: qnx-driver-usb
description: "QNX 8.0 USB driver development with libusbdi. Read when writing or porting a raw USB device driver on QNX (not HID, which has its own skill). Covers connecting to the io-usb stack, the device-ident filter and insertion/removal callbacks, attaching to devices, parsing descriptors, opening pipes, and submitting URBs for I/O, with side-by-side Linux kernel-module comparison. Part of the qnx-driver-development tree; read that first."
---

# QNX USB Driver Development

Read `qnx-driver-development` first. This leaf covers raw USB drivers via `libusbdi`. For HID-class devices use `qnx-driver-hid` instead. Link with `-l usbdi`; include `sys/usbdi.h`.

## The model versus Linux

On Linux the USB stack is in the kernel and drivers are kernel modules that register with it. On QNX the USB stack (`io-usb`) is a user-space process, usually started at boot (visible as `io-usb` in `pidin`), and your driver is a separate user-space process that connects to it over IPC. Consequences:

A device on the stack provides I/O to only one driver at a time. Use the shipped class drivers (for example `io-hid` for class 0x03) when they apply, since an extra I/O connection will be denied. Applications should not connect directly to `io-usb` (they block access for the connection's duration); put a driver in between. The connection runs on a separate thread that handles IPC and fires callbacks, so any data shared between a callback and the rest of the code must be thread-safe (mutex or similar).

## Connecting

Three structures, parallel to a Linux `usb_driver` registration:

`usbd_device_ident_t` is the device filter (vendor, device, dclass, subclass, protocol). Set each field to an explicit value or `USBD_CONNECT_WILDCARD`. Only one filter is allowed, unlike Linux's id table, though its fields are broader.

`usbd_funcs_t` holds callbacks: `nentries` (always `_USBDI_NFUNCS`), `insertion` (like Linux `probe`), `removal` (like Linux `disconnect`), `event` (reserved, NULL). If insertion/removal are set you attach with exclusive access and can do I/O; if not, you attach shared and can only read configuration.

`usbd_connect_parm_t` ties it together (path defaults to `/dev/io-usb/io-usb`, `vusb`/`vusbd` set to `USB_VERSION`/`USBD_VERSION`, flags 0, argc/argv, event buffer size, pointers to the ident and funcs, `connect_wait` set to `USBD_CONNECT_WAIT` to wait indefinitely; set this if you are unsure io-usb is up).

Call `usbd_connect(&parm, &connection)` (analogous to Linux `usb_register`), and `usbd_disconnect(connection)` to tear down (place it in a signal handler and/or main). Typically `usbd_connect` goes in `main()`, not in an init/exit pair.

## Attaching and parsing

In the insertion callback, `usbd_attach(connection, instance, extra, &device)` attaches (extra > 0 allocates device-associated shared memory, retrievable with `usbd_device_extra`). In removal, `usbd_device_lookup(connection, instance)` then `usbd_detach(device)`. You can also scan directly (shared/read-only) by building a `usbd_device_instance_t` and looping over bus/device numbers.

Parse the descriptor tree (device to configuration to interface to endpoint) with the typed accessors `usbd_device_descriptor`, `usbd_configuration_descriptor`, `usbd_interface_descriptor`, `usbd_endpoint_descriptor`, or the generic `usbd_parse_descriptors` (pass a type: USB_DESC_ENDPOINT/INTERFACE/DEVICE/CONFIGURATION, and an index). Endpoint 0 is always control. Child counts come from bNumConfigurations, bNumInterfaces, bNumEndpoints.

## I/O: pipes and URBs

QNX USB I/O is always asynchronous via messaging, and all transfers (read and write) use one function. Steps:

Allocate a URB with `usbd_alloc_urb(NULL)` and a data buffer with `usbd_alloc(size)` (these are shared memory; free with `usbd_free_urb` and `usbd_free`). On QNX 8.0 free the buffer with the pointer directly (older 6.5 needed the physical address via `usbd_mphys`).

Open a pipe at the endpoint with `usbd_open_pipe(device, desc, &pipe)`; close with `usbd_close_pipe`. Pipes are not typed (unlike Linux's snd/rcv typed pipes). `usbd_reset_pipe` and `usbd_abort_pipe` handle stalls and errors.

Set up the URB with the per-type setup call: `usbd_setup_bulk`, `usbd_setup_interrupt`, `usbd_setup_isochronous`, `usbd_setup_vendor`, `usbd_setup_control`. Direction is a flag on the URB (`URB_DIR_IN`/`URB_DIR_OUT`/`USB_DIR_NONE`), not a property of the pipe as in Linux. Then submit with `usbd_io(urb, pipe, callback, handle, timeout)`; the callback fires asynchronously on completion (in Linux these complete as interrupts). `USBD_TIME_INFINITY` and `USBD_TIME_DEFAULT` are available timeouts.

## Porting note

Because QNX puts direction and transfer type in URB flags and a single setup call rather than in the choice of function/pipe (as Linux does with `usb_sndbulkpipe`/`usb_fill_bulk_urb`), porting a Linux URB setup to QNX is mostly mechanical and often reduces to setting variables instead of selecting the right function. Exposing the device to clients is the driver's own responsibility (QNX has no kernel file_operations); the common choice is to make the driver a resource manager so clients use standard open/read/write/devctl.

