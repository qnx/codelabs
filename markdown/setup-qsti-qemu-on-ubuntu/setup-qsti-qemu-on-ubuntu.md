
id: setup-qsti-qemu-on-ubuntu
title: How to setup and run the Quick Start Target Image (QSTI) on QEMU using Ubuntu
summary: Learn how to setup QSTI on QEMU and verify compiler setup
categories: qnx, qemu
tags: beginner
difficulty: 1
status: published
authors: Anna Likozar
feedback_link: https://github.com/qnx/codelabs/issues


# Running the Quick Start Target Image (QSTI) on QEMU using Ubuntu

## Introduction
Duration: 1:00

This codelab is meant to provide step by step instructions to get you started using QSTI on QEMU on an Ubuntu system.

### Prerequisites
* Ubuntu 22.04 or 24.04
* A free non-commercial QNX SDP 8.0 license.  See [https://www.qnx.com/getqnx](https://www.qnx.com/getqnx)
* QNX Software Center (QSC) installed.  [Download QSC](https://www.qnx.com/download/group.html?programid=29178)

---

## Install QEMU

Duration: 2:00

Follow the steps here to [Install QEMU](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/about.html) 

### Upgrade to QEMU 10

If you want to run your image with the default resolution (720p) and no Vulkan support you can skip upgrading to QEMU 10.  However it is recommended to upgrade to QEMU version 10. 

To upgrade follow the steps here [Upgrade to QEMU 10](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/getting_started.html#getting-started__upgrade-to-qemu-10).

---

## Get the Quick Start Target Image (QSTI) for QEMU
Duration: 5:00

Follow the steps here to [get the image](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/getting_started.html#getting-started__get-the-image)

---

## Run and configure QEMU
Duration: 2:00

To start the VM follow the instructions here [Launching QEMU](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/getting_started.html#getting-started__launching-qemu).  This will walk you through launching the VM with default options.

Tips on navigating QEMU can be found here [Navigating QEMU](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/getting_started.html#navigating-qemu)

To run the VM with additional specifications see [Additional QEMU Specifications](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/additional_specs.html).  

[QEMU version and recommended options](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/getting_started.html#qemu-version-and-recommended-options) provides recommendations depending on your QEMU verison.


---

## Troubleshooting

The following guide describes how to troubleshoot common issues [Troubleshooting](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/troubleshooting.html). 

---

## Next Steps
Duration: 2:00

The QNX Developer Desktop is available within the QSTI image.  Detail documentation for using the QNX Developer Desktop can be found here [Self-Hosted Developer Desktop Guide](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.qdd/topic/about.html) 

### Compile and run a C++ program

To get started the following guide will walk you through compiling and running a simple application on the QNX Developer Desktop [Write a Hello World application with C++](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.qdd/topic/hello_world_cpp.html)

