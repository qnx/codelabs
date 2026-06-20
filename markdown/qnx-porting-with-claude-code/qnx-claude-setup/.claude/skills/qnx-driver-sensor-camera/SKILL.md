---
name: qnx-driver-sensor-camera
description: "QNX 8.0 camera and sensor driver development via the Sensor Framework. Read when integrating a camera or non-camera sensor (lidar, etc.) driver on QNX, where Linux would use V4L2. Covers the external camera / external platform / serdes library model, the external sensor model, the function-table definitions loaded with dlopen, and the sensor config files. Part of the qnx-driver-development tree; read that first."
---

# QNX Sensor / Camera Driver Development

Read `qnx-driver-development` first. This leaf covers camera and sensor integration through the QNX Sensor Framework. Where Linux uses V4L2 (Video4Linux), QNX expects you to integrate camera and sensor drivers into the Sensor Framework, which sits between your driver and the system and handles the repetitive interaction code.

> The Sensor Framework documentation references in the source wiki point at SDP 7.1 docs; the SDP 8.0 docs supersede them once published. Treat version-specific doc links as needing confirmation.

## The three library types

The Sensor Service uses `dlopen()` to load your library at runtime and calls its registered functions. There are three roles:

External camera library: produces camera frames. Defines a `camera_external_camera_t` function table (open, close, init, deinit, start_preview, stop_preview, get_preview_frame, buffer and format queries, framerate, callbacks). The example writes color bars to a frame to simulate a camera. Key functions to understand: open (allocate the context struct returned as the opaque handle), close (free it), start_preview/stop_preview (set the streaming register in a real driver), get_preview_frame (acquire a frame; set flags->captured true when ready, point bufferOut at the data; leave captured false and return if the frame is not yet ready).

External platform library: for platform-specific tweaks (for example programming the CSI2 receiver when a sensor is wired to a particular board). Defines `platform_external_interface_t`. When an external camera is used with an external platform and `use_hardware_capture=true` in the config, the platform's get_preview_frame is called instead of the camera's, so capture happens in the platform layer. The platform layer also gets/sets board properties (for example number of deserializers, deserializer I2C address).

Serdes library: needed only on platforms with deserializers (Raspberry Pi has none, so RPi needs only camera plus platform). Defines `camera_serdes_t` (open, close, get/set ser and deser properties, init, enable, disable, gpio, parse_config). In a real serdes library these touch hardware to program the serializer/deserializer.

For non-camera sensors (lidar and similar) that produce packets rather than displayable 2D frames, use an external sensor library: `sensor_external_sensor_t` (open, close, init, deinit, start_streaming, stop_streaming, get_packet, get_buffer_requirements, get_time, parse_config, format info, callbacks). `get_buffer_requirements` reports buffer count and size based on the data format (for example SENSOR_FORMAT_LIDAR_POLAR/POINT_CLOUD/SPHERICAL). `get_packet` is the sensor analogue of the camera's get_preview_frame.

## Building and running

Build the example library, scp the resulting `.so` to `/system/lib` on the target, create a config file under `/system/etc/system/config/`, then start the sensor service pointing at it. The config declares sensor units (type, name, address pointing at the `.so`). For an external platform you add a SENSOR_GLOBAL block naming the platform library and set `use_hardware_capture=true`, and start `sensor` with `-b external`. For a sensor you set `data_format`. Viewers/clients like `camera_example3_viewfinder` (camera) or `sensor_example` (sensor) exercise the driver.

## Why the framework

Using the Sensor Framework avoids writing a lot of repetitive interaction code; it is the recommended path for camera drivers on QNX. Your driver implements the function tables above and the framework manages the rest of the lifecycle and client interaction.

