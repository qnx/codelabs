---
name: qnx-driver-hid
description: "QNX 8.0 HID driver development (keyboards, mice, gamepads, joysticks). Read when writing or porting a HID driver on QNX. Covers the io-hid manager and libhiddi client model, the connection/callback structures, report descriptors and reports, and porting Linux HID drivers (hidapi-style) by wrapping libhiddi. Part of the qnx-driver-development tree; read that first."
---

# QNX HID Driver Development

Read `qnx-driver-development` first. This leaf covers HID input drivers on QNX 8.0, based on the USB HID 1.11 specification.

## The HID pipeline

QNX's HID input path has three layers:

`io-usb-otg` (the USB stack) handles USB protocol and hardware. `io-hid` (the HID manager) manages HID devices and talks to the USB stack via `devh-usb.so`; it knows nothing about specific hardware and just routes between clients and DLLs. Your HID driver is a client of `io-hid`, communicating through `libhiddi.so`, which contains the functions to connect to and exchange reports with devices.

Two HID concepts: a report is the actual data exchanged with the device; a report descriptor describes the format and meaning of that data (device type, the input/output/feature reports, and the usage of each bit).

## Writing a driver: the four steps

1. Connect to `io-hid` and get a connection handle.
2. Provide insertion, removal, and input-report callbacks.
3. Send/receive HID reports to/from `io-hid`.
4. Notify `io-hid` on device removal.

You declare device interest with `hidd_device_ident_t` (vendor_id, product_id, version; use `HIDD_CONNECT_WILDCARD` for any). You set callbacks in `hidd_funcs_t` (insertion, removal, report, event). You fill `hidd_connect_parm_t` (path defaults to the HID server, versions `vhid`/`vhidd`, flags, event buffer size, pointers to the ident and funcs, `connect_wait`). Then call `hidd_connect()`.

In the insertion callback: find the reports of interest (`hidd_get_collections`, `hidd_collection_usage`, `hidd_get_report_instance`), query report length and button count, and attach with `hidd_report_attach()`. In removal: `hidd_reports_detach()`. In the report callback: get the collection handle (`hidd_report_collection`), then usage page, usage value (`hidd_get_usage_value`), and button values (`hidd_get_buttons`), and convert raw values into meaningful input. To expose input to applications, either pass it on directly or run a resource manager that other QNX apps read from.

## Porting a Linux HID driver

Because both QNX and Linux follow the USB HID specification, porting is mostly a wrapping exercise. A Linux HID API (libusb's hidapi, for example) exposes `hid_open`, `hid_get_device_info`, `hid_get_report_descriptor`, `hid_read`, `hid_write`, `hid_get_input_report`, `hid_close`. Each of these wraps around QNX's `libhiddi` equivalents. Any HID driver ported to QNX interfaces with the USB stack via `libusbdi` and the HID manager via `libhiddi`. The report and descriptor concepts carry over directly because they come from the shared HID spec, so the work is mapping the API calls, not reinterpreting the device.

