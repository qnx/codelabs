id: mender-installation-and-setup-rpi5
title: Mender Client installation and setup on Raspberry Pi 5
summary: Learn how to install and setup the Mender Client on a Raspberry Pi 5 running QNX
categories: OTA, Getting Started
tags: beginner
platforms: Raspberry Pi 5
published: 2026-11-23
status: published
authors: Vratislav Podzimek
feedback_link: https://github.com/qnx/codelabs/issues

# Mender Client installation and setup on Raspberry Pi 5

## Welcome

This codelab describes how the Mender over-the-air (OTA) update manager Client
can be installed and set up on a Raspberry Pi 5 running QNX 8 (the Quick Start
Target Image).

You'll learn how to:
* Install and configure the Mender Client.
* Set the system up for Mender.
* Make sure the Mender Client is started automatically on boot.

---

## Prerequisites

This guide requires:

* A Raspberry Pi 5 board (further referred to as _device_)
* QNX OS is installed on the device
  * Follow the instructions in the [Quick Start Target Image
    (QSTI)](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti/intro.html)
    documentation to install QNX OS on Raspberry Pi 5.
* An account on a Mender Server
  * The easiest option is to create a free trial account at
  [hosted Mender](https://hosted.mender.io/ui/signup).

---

## Installing Mender Client

The Mender Client is available in the [QNX Open-Source Software
repository](https://oss.qnx.com/) as the `mender` package.

Run the following commands on your device:

1. Update the apk repositories:
   ```bash
   sudo apk update
   ```

2. Install the `mender` and `mender-doc` packages:
   ```bash
   sudo apk add mender mender-doc
   ```

3. Optionally, you can now check the contents of the installed packages:
   ```bash
   apk info -L mender mender-doc
   ```

---

## Preparing the device

The `mender-doc` package ships the `/usr/share/doc/mender/README_setup.md` file
describing how the device can be set up for running the Mender Client. Feel free
to read the full instructions (or get back to them later), here we will go
through the steps in a concise way.

Persistent storage needs to be provided to Mender using a directory on the
`/data` partition. This can be done by running:
```bash
sudo mv /var/lib/mender /var/lib/mender.orig
sudo mkdir /data/mender
sudo ln -s /data/mender /var/lib/mender
sudo mv /var/lib/mender.orig/* /var/lib/mender/
sudo rmdir /var/lib/mender.orig
```

---

## Configuring device type

With persistent storage available, several parameters of the Mender Client need
to be configured. The `device_type` string is mandatory for Mender match
Artifacts onto compatible devices. It can be modified from the default by
running:
```bash
sudo sed -i 's/device_type=.*/device_type=YOUR_CHOSEN_DEVICE_TYPE/' /var/lib/mender/device_type
```

replacing `YOUR_CHOSEN_DEVICE_TYPE` with an alpha-numerical string of your
choice (incl. `-` and `_`), identifying the type of your device, for example
`qnx-rpi5`.

---

## Client configuration

Mender Client also needs to know which server to connect to and, on hosted
and Enterprise servers, which organization the device belongs to. This can be
done by modifying the `/etc/mender/mender.conf` file.

The `mender` package ships a default configuration file with the following
contents:
```json
{
  "ServerURL": "https://hosted.mender.io/",
  "TenantToken": "Paste your Tenant token here"
}
```

Depending on your setup, the following modifications might be required:

1. If your Mender server account is not at `hosted.mender.io`, change the
   `ServerURL` to the URL of your Mender Server.

2. If your Mender server account is at hosted or on-premises instance of Mender
   Enteprise, set the `TenantToken` to the _Organization token_ of your
   organization. This secret is available at
   https://hosted.mender.io/ui/settings/organization or the respective page of
   your Mender Server instance.

   If using a Mender Server instance without organizations, delete the whole
   `TenantToken` line **and the comma on the line above it** from the
   configuration file.

3. Optionally, add the following parameters to the configuration file:
   ```
   "UpdatePollIntervalSeconds": 1800,
   "InventoryPollIntervalSeconds": 28800,
   "RetryPollIntervalSeconds": 300,
   ```

   to set the intervals in seconds for update check, inventory submission and
   failed communication retry, respectively. The above example shows the default
   values that can be decreased for demo and testing purposes (rate limits are
   applied, though, so don't go too low).

The full documentation of the Mender Client configuration file is available in
[Mender docs](https://docs.mender.io/client-installation/configuration).

---

## Checking the Mender Client

With the device set up and the Mender Client configured, it's time to run the
Client. The main executable is `mender-update` and to make sure it works as
expected, the following command should be run:
```bash
sudo mender-update daemon
```

This will start the `mender-update` binary in a daemon mode, i.e. periodically
checking for new deployments and submitting device inventory. It's not a
_daemon_ mode strictly speaking because all log messages go to standard output,
but that's handy for our use case.

In the output from the process you can see some initialization steps and a
message starting with `Authentication error trying server`. This is because the
device has not been accepted on the server. To address that, visit
https://hosted.mender.io/ui/devices/any or the respective URL for your Mender
Server where you should see a new device with pending authorization request. The
device can be authorized by clicking on it and accepting its authentication set
(key).

<!-- screenshot? -->

Once accepted on the server, there should be a message in the `mender-update`
process output starting with `Successfully received new authorization data from
server`, indicating that the Client was able to authenticate to the server,
followed by `Inventory data submitted successfully` and `No update available`.

<!-- inventory screenshot? -->

---

## Running Mender Client on boot

For the Mender Client, being an OTA agent, it is sensible to start automatically
on boot. The most straightforward way to achieve that is to add the
following line to the `/system/etc/startup/post_startup.sh` post-startup script:
```bash
mender-update --log-file /var/log/mender.log daemon &
```

this line **needs to be added above the `exit 0` line** in the file.

---

## Next steps

The `mender` package ships multiple scripts in the
`/usr/share/mender/inventory/` directory which are used for gathering inventory
data from the device. These can be modified or extended with extra scripts to
provide custom inventory information for the device.

There are two Update Modules provided by the `mender` package:
```
/usr/share/mender/modules/v3/directory
/usr/share/mender/modules/v3/single-file
```

which can be used for deploying Mender Artifacts of the respective types to the
device. That is, however, beyond the scope of this Mender Client installation
and setup codelab.
