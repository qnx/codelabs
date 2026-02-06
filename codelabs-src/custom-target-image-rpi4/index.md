
id: custom-target-image-rpi4
categories: qnx, embedded, raspberry-pi
tags: qnx, rpi4, embedded-linux
status: Published
authors: QNX


# Build your own QNX 8.0 Custom Target Image (CTI) for Raspberry Pi 4 on 

## Overview
Duration: 5

In this codelab, you will build a custom QNX 8.0 target image for Raspberry Pi 4. The default configuration is similar to that of the Quickstart Imagec(QSTI), which is available to download from the QNX Software Center (QSC).

You will:
- Build a QNX 8.0 image for Raspberry Pi 4
- Flash and boot the image
- Customize partitions and installed packages
- Troubleshoot common build issues

---

## Prerequisites
Duration: 7

### Hardware Requirements

You will need:

**Required**
- Raspberry Pi 4 (2GB RAM or higher) OR Raspberry Pi 5
- Micro SD card (8GB or larger)

**Optional**
- USB keyboard and mouse
- HDMI display
- HDMI display and micro HDMI to HDMI cable (or touchscreen and micro HDMI to HDMI and USB dual cable)
- USB-TTL converter
- Camera

---

### Host System Requirements

This project can only be built on Linux hosts.
Run the command below to install required utilities for building successfully (the command below works with Ubuntu Linux hosts):

```bash
sudo apt install \
  cmake git texinfo ninja-build g++ libtool automake \
  pkg-config wget curl unzip imagemagick bridge-utils

