
id: rpi5-using-nvme-ssd
title: Using NVMe SSD on Raspberry Pi 5
summary: Learn how to install the NVMe disk driver to access NVMe SSD.
categories: qnx, embedded, raspberry-pi
tags: qnx, rpi5, embedded-linux, nvme, ssd
difficulty: 1
status: published
authors: Karol Frackiewicz
feedback_link: https://github.com/qnx/codelabs/issues


# Using NVMe SSD on Raspberry Pi 5 using QNX

## Welcome

This codelab demonstrates how to use NVMe SSD with Rasperry Pi 5 using QNX.

You will learn how to:
* Where to find and how to install driver and utilities.
* Configure and start the NVMe driver.
* Create and mount the QNX partition.

---

## Prerequisites

This guide requires that:

* Raspberry Pi 5 board is equipped with a M.2 HAT and SSD, for example:
  * [Raspberry Pi M.2 HAT+](https://www.raspberrypi.com/products/m2-hat-plus/)
  * [Freenove M.2 NVMe Adapter V2 (or V1) for Raspberry Pi 5](https://store.freenove.com/products/fnk0098h)
  * An appopriate NVMe SSD should be installed in the M.2 slot
* QNX Software Development Platform is installed on the host system.
  * Follow the [installation](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.qnxsdp.quickstart/topic/install_host.html) instructions in the [QNX Software Development Platform Quick Start Guide](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.qnxsdp.quickstart/topic/about.html) to install QNX Software Development Platform 8.0 or higher (8.0.2 or 8.0.3).
* QNX OS is installed on the target device.
  * Follow the instructions in the [Quick Start Target Image (QSTI)](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti/intro.html) documentation to install QNX OS on Raspberry Pi 5.

---

## Installing the driver

QNX Software Development Platform 8.0 installation of the host machine contains the driver [*devb-nvme*](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/d/devb-nvme.html) and filesystem utility [*mkqnx6fs*](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/m/mkqnx6fs.html).

Copy the driver and the utility to the target device and verify they are available in PATH.  For example. if your target device is reachable by SSH at the IP address `192.168.1.10`, and QNX SDP 8 is installed under **`~/qnx800`**:

1. Enable the QNX SDP 8:
    ```sh
    source ~/qnx800/qnxsdp-env.sh
    ```

2. Copy the driver and utility to target device:
    ```sh
    scp ${QNX_TARGET}/aarch64le/sbin/devb-nvme ${QNX_TARGET}/aarch64le/sbin/mkqnx6fs qnxuser@192.168.1.10:.
    ```

2. Log into the target device:
    ```sh
    ssh qnxuser@192.168.1.10
    ```

3. Copy the driver and utility into a directory that is in `PATH`:
    ```sh
    sudo cp devb-nvme /usr/bin/
    sudo cp mkqnx6fs /usr/bin/
    ```

4. Ensure the driver and utility are executable:
    ```sh
    sudo chmod 755 /usr/bin/devb-nvme
    sudo chmod 755 /usr/bin/mkqnx6fs
    ```

5. Verify the driver and utility:
    ```sh
    use -i devb-nvme
    use -i mkqnx6fs
    ```

---

## Configuring and starting the driver

By default, [*pci-server*](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/p/pci-server.html) is installed in the **`/sbin`** directories, the libraries it depends on are installed in the **`/lib`** and **`/lib/dll/pci`** directories, and configuration is installed in the **`/etc/system/config/pci`** directory.

On the QSTI, the PCI server executable, libraries, and configuration are installed under **`/proc/boot`** directory.  This requires that the **`PCI_CAP_MODULE_DIR`** environment variable be set to execute `devb-nvme` correctly.

1. Ensure that *pci-server* is using libraries in **`/proc/boot`** directory:
    ```sh
    sudo pidin -p pci-server lib
    ```
    Inspect output to verify the shared objects starting with the **`pci_`** prefix are located in the **`/proc/boot`** directory.  For example:

    ```
      pid name
    16388 proc/boot/pci-server
                    Address                      DT_SONAME Path
         0x00000042bb29e000                            PIE /proc/boot/pci-server
         0x0000002df7f4a000                  libpci.so.3.0 /proc/boot/libpci.so.3.0
         0x0000002df7f72000                 libsecpol.so.1 /proc/boot/libsecpol.so.1
         0x0000002df7f0d000                  ldqnx-64.so.2 /usr/lib/ldqnx-64.so.2
         0x0000002df7f79000                      libc.so.6 /proc/boot/libc.so.6
         0x0000002df802d000                  libgcc_s.so.1 /proc/boot/libgcc_s.so.1
         0x0000002df8042000               pci_slog2.so.3.0 /proc/boot/pci_slog2.so.3.0
         0x0000002df8046000                  libslog2.so.1 /proc/boot/libslog2.so.1
         0x0000002df804d000              pci_debug2.so.3.0 /proc/boot/pci_debug2.so.3.0
         0x0000002df8050000     pci_hw-bcm2712-rpi5.so.3.0 /proc/boot/pci_hw-bcm2712-rpi5.so.3.0
         0x0000002df806e000            pci_cap-0x10.so.3.0 /proc/boot/pci_cap-0x10.so.3.0
         0x0000002df8077000 pci_server-buscfg-generic.so.3 /proc/boot/pci_server-buscfg-generic.so.3.0
         0x0000002df8083000            pci_cap-0x11.so.3.0 /proc/boot/pci_cap-0x11.so.3.0
         0x0000002df808b000            pci_cap-0x05.so.3.0 /proc/boot/pci_cap-0x05.so.3.0
    ```

2. Set and expect the **`PCI_CAP_MODULE_DIR`** environment variable:
    ```sh
    export PCI_CAP_MODULE_DIR=/proc/boot
    ```

3. Start the driver:
    ```sh
    sudo -E devb-nvme disk name=nvme
    ```

4. Ensure that SSD is showing in the device list:
    ```sh
    ls /dev/nvme*
    ```

    For example:
    ```
    /dev/nvme0  /dev/nvme0t12
    ```

    The output above indicates one NVMe SSD with a single FAT32 partition.  Your output may differ, depending on the content of your SSD.

---

## Creating and using QNX partition

To create and mount QNX partition, you must remove the existing FAT32 partition, create a new QNX partition and create the QNX Power-Safe filesystem.

**Warning:** Following steps will erase all existing partitions and content on the SSD.

1. Use the [*fdisk*](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/f/fdisk.html) utility to manipulate the partitions:
    ```sh
    sudo fdisk /dev/nvme0
    ```

    Use the up and down arrows to select partition to delete:
    ```
    FDISK
    Ignore Next Prev Change Delete Boot Unboot Restore Loader Save Quit

            _____OS_____     Start      End     ______Number_____    Size    Boot
            name    type    Cylinder  Cylinder  Cylinders  Blocks

    --> 1.  FAT32  ( 12)            0    122104  122105   250069648    119 GB
        2.  ______ (___)    _______   _______   _______   _________  _____
        3.  ______ (___)    _______   _______   _______   _________  _____
        4.  ______ (___)    _______   _______   _______   _________  _____


     Choose a partition by typing the partition number OR moving the pointer
     with the UP/DOWN arrows.
     Then, choose one of the actions on the top line of the screen.



    Drive : /dev/nvme0                  Config:    64 Heads
    Size  : 122104 Mbytes                          32 Sectors/track
    Loader: Unknown                            122104 Cylinders
    Blocks: 250068992                             512 Block Size

                                        Last cylinder is 122103
    ```

    Press `D` to delete the highlighted partition:
    ```
    FDISK
    Ignore Next Prev Change Delete Boot Unboot Restore Loader Save Quit

            _____OS_____     Start      End     ______Number_____    Size    Boot
            name    type    Cylinder  Cylinder  Cylinders  Blocks

    --> 1.  ______ (___)    _______   _______   _______   _________  _____
        2.  ______ (___)    _______   _______   _______   _________  _____
        3.  ______ (___)    _______   _______   _______   _________  _____
        4.  ______ (___)    _______   _______   _______   _________  _____


    Choose a partition by typing the partition number OR moving the pointer
    with the UP/DOWN arrows.
    Then, choose one of the actions on the top line of the screen.



    Drive : /dev/nvme0                  Config:    64 Heads
    Size  : 122104 Mbytes                          32 Sectors/track
    Loader: Unknown                            122104 Cylinders
    Blocks: 250068992                             512 Block Size

                                        Last cylinder is 122103
    ```

    Press `C` to create a new partition, enter `179` for the partition type and accept defaults for other fields:
    ```
    FDISK
    Ignore Next Prev Change Delete Boot Unboot Restore Loader Save Quit

            _____OS_____     Start      End     ______Number_____    Size    Boot
            name    type    Cylinder  Cylinder  Cylinders  Blocks

    --> 1.  QNX6   (179)            0    122104  122105   250069648    119 GB
        2.  ______ (___)    _______   _______   _______   _________  _____
        3.  ______ (___)    _______   _______   _______   _________  _____
        4.  ______ (___)    _______   _______   _______   _________  _____


    Choose a partition by typing the partition number OR moving the pointer
    with the UP/DOWN arrows.
    Then, choose one of the actions on the top line of the screen.



    Drive : /dev/nvme0                  Config:    64 Heads
    Size  : 122104 Mbytes                          32 Sectors/track
    Loader: Unknown                            122104 Cylinders
    Blocks: 250068992                             512 Block Size

                                        Last cylinder is 122103
    ```

    Press `S` to save the new partition table, followed by `Q` to exit *fdisk*.

2. Re-enumerate the NVMe SSD partitions:
    ```sh
    mount -e /dev/nvme0
    ```

    Verify new partition is available:
    ```sh
    ls /dev/nvme*
    ```

    For example:
    ```
    /dev/nvme0  /dev/nvme0t179
    ```

    Notice that `/dev/nvme0t12` has been replaced with `/dev/nvme0t179`.

3. Create QNX Power-Safe filesystem on the new partition:
    ```sh
    sudo mkqnx6fs /dev/nvme0t179
    ```

    Press `y` to confirm re-formatting filesystem, when prompted.

    For example:
    ```
    All files on /dev/nvme0t179 will be lost!
    Confirm filesystem re-format (y) or (n): y
    Format fs-qnx6: 31258702 blocks, 488448 inodes, 16 groups
    ```

4. Mount the new QNX partition. For example, to mount the partition as `/mydata`, execute:
    ```sh
    sudo mount /dev/nvme0t179 /mydata
    ```

    Verify the partition is mounted:
    ```sh
    mount
    ```

    For example:
    ```
    ifs on / type ifs
    /dev/nvme0t179 on /mydata type qnx6
    ...
    ```

    Verify the partition size:
    ```sh
    df -h /mydata
    ```

    For example:
    ```
    /dev/nvme0t179              119G      3.7G      116G       4%  /mydata/
    ```

---

## Mounting the drive on startup

To mount the drive during boot, modify the post-startup script `/system/etc/startup/post_startup.sh` file to add the commands that will start the NVMe driver and mount the partition.  Since *pci-server* is started during in the startup script, it should not matter where in the post-statup script the commands are inserted:

```
export PCI_CAP_MODULE_DIR=/proc/boot
devb-nvme disk name=nvme
waitfor /dev/nvme0
mount -e /dev/nvme0
waitfor /dev/nvme0t179
mount /dev/nvme0t179 /mydata
```
