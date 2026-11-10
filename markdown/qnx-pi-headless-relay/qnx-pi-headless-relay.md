id: qnx-pi-headless-relay
title: Connect to a headless QNX Raspberry Pi over Wi-Fi
summary: Set up outbound-only remote SSH for a QNX 8 Raspberry Pi 5 using a WebSocket relay, with no Ethernet cable, display, keyboard, mouse, serial adapter, VPN, or inbound router configuration
categories: qnx, raspberry-pi, codelabs
tags: intermediate
difficulty: 3
status: draft
authors: Lance Streuber
feedback_link: https://github.com/lancestreuber/qnx-pi-headless-relay/issues


# Connect to a headless QNX Raspberry Pi over Wi-Fi

## Introduction
Duration: 3:00

A QNX Raspberry Pi usually starts its development life on the same network as
its developer. That is awkward at a hackathon or in a classroom when there is
no spare Ethernet cable, no display, and no way to change the venue's router.

This codelab sets up a different path. The QNX Pi makes an outbound connection
over Wi-Fi and TLS port 443 to a small public relay. That connection carries a
loopback-only reverse SSH forward. Your laptop connects to the other side of
the relay, also over a WebSocket on port 443.

```text
QNX Pi bcm0                 public relay                    laptop

sshd :22 <--- reverse SSH --- 127.0.0.1:2222 <--- SSH ProxyJump
     \------ outbound WSS:443 ------^             over WSS:443
```

No inbound port is opened on the QNX Pi's network. The relay can run on
Railway or any Docker host with HTTPS and WebSocket support.

**What you will learn:**

* How to generate separate keys and configuration for one QNX Pi
* How to deploy the relay without exposing its SSH port publicly
* How to install a verified boot payload on a QNX Quick Start Target Image
* How to connect from a laptop and keep repeated agent commands responsive
* How to recover from a Wi-Fi or startup failure using only the SD card

**Prerequisites:**

* A Raspberry Pi 5 with a QNX 8.0 Quick Start Target Image, Python 3, and OpenSSH
* A Wi-Fi network the QNX Pi can join
* A public `wss://` endpoint on Railway or another Docker host
* A computer with Python 3, OpenSSH, `ssh-keygen`, and access to the SD card

> **Warning:** The generated deployment directory contains private keys. It is
> ignored by Git, but you must also keep it out of email, chat, screenshots,
> and shared archives.

---

## Get the project
Duration: 2:00

Clone the Apache-2.0-licensed reference project:

```bash
git clone https://github.com/lancestreuber/qnx-pi-headless-relay.git
cd qnx-pi-headless-relay
```

Run the fast checks before changing anything:

```bash
sh scripts/verify.sh
python3 scripts/test-wsproxy.py
```

If Docker is available, also exercise the complete generated-key forwarding
path through a local relay container:

```bash
sh scripts/integration-relay.sh
```

That integration test expects the payload `relay-round-trip-ok` to travel
through a reverse SSH forward and back through a separate client connection.

---

## Choose a relay
Duration: 3:00

You need the final relay hostname before generating the deployment bundle.
There are two supported starting points:

* **Railway:** deploy the `relay/` container and let Railway terminate TLS at
  its public domain.
* **A Docker VPS:** use `deploy/vps/docker-compose.yml` and its Caddy service to
  obtain TLS and forward WebSockets to the same relay container.

The provider must expose HTTPS/WebSockets on port 443 and pass the HTTP path
through unchanged. Do not publish the relay container's SSH port. Both the
reverse listener and its forwarding destination stay on `127.0.0.1` inside
the container.

Write down the endpoint in this form:

```text
wss://YOUR-RELAY-HOST
```

---

## Generate one device bundle
Duration: 3:00

Generate fresh identities for this QNX Pi. Give every additional device a
different name and reverse port.

```bash
python3 scripts/configure.py \
  --relay-url wss://YOUR-RELAY-HOST \
  --device-name qnxpi \
  --remote-port 2222
```

The command creates `.qnx-connect/qnxpi/` with three directories:

```text
boot/     files installed on the QNX Pi
client/   laptop SSH configuration and login key
relay/    relay host key and restricted authorized keys
```

The tunnel key, laptop relay key, QNX login key, relay host key, and reverse
port are separate pieces of the design. Do not reuse a generated bundle for a
second device.

---

## Deploy the relay
Duration: 5:00

On Railway, create a service from the repository's `relay/` directory. Copy
the two values from the generated `relay/relay.env` into Railway service
variables:

```text
TUNNEL_HOST_KEY_B64
TUNNEL_AUTHORIZED_KEYS_B64
```

Expose the service using Railway's normal public domain. Railway terminates
TLS and forwards the WebSocket connection to `$PORT` inside the container.

For a normal VPS, follow `deploy/vps/README.md` instead. It runs the same relay
behind Caddy. Changing providers later does not require changing the protocol
or regenerating the device identities.

> **Note:** Treat `relay.env` as secret material. Set its values in the hosting
> provider; do not commit the file.

---

## Prepare the SD card
Duration: 6:00

Create `wpa_supplicant.conf` from the supplied example and place your Wi-Fi
network name and password in the generated boot payload. Then install it:

```bash
scripts/install-to-sd.sh \
  .qnx-connect/qnxpi/boot \
  /path/to/mounted/qnx-boot-volume
```

The installer looks inside `qnx_sdp.ifs` for the `/boot/onboot` hook before it
changes the card. Public QSTI documentation guarantees boot-partition network
configuration files, but it does not promise that an arbitrary FAT file is
executed. If the hook is absent, the installer stops instead of leaving a card
that appears configured but can never start the tunnel.

For an image without that hook, use the opt-in CTI overlay documented in
`docs/CTI-INTEGRATION.md` and build a new image.

Eject the card cleanly, insert it into the QNX Pi, and power it on. After Wi-Fi
and time synchronization are ready, the QNX Pi starts SSH on `bcm0` and opens
the outbound tunnel. It does not fall back to Ethernet.

---

## Connect from the laptop
Duration: 4:00

Start the retained client connection and open a shell:

```bash
.qnx-connect/qnxpi/client/connection.sh start
ssh -F .qnx-connect/qnxpi/client/ssh_config qnxpi
```

The helper keeps one harmless remote session open. On the tested QNX image,
an otherwise idle multiplex master exited after its ordinary sessions ended.
Keeping one deliberate session alive lets later SSH and agent commands reuse
the same two-hop transport.

Check or stop it explicitly:

```bash
.qnx-connect/qnxpi/client/connection.sh status
.qnx-connect/qnxpi/client/connection.sh stop
```

---

## Recover without a console
Duration: 4:00

If the QNX Pi does not connect, power it off and mount its FAT boot partition
on another computer. Read these logs in order:

1. `qnx-onboot.log`
2. `qnx-supervisor.log`
3. `qnx-tunnel.log`

Common causes are an incorrect Wi-Fi configuration, a relay hostname change,
or the QNX Pi's clock still being in 1970. The launcher retries while network
time catches up; it does not disable TLS certificate validation.

You can recover from a Wi-Fi change by replacing `wpa_supplicant.conf` on the
boot partition and rebooting. No keyboard, display, serial adapter, or existing
SSH session is required.

---

## Validate your deployment
Duration: 8:00

Do not stop after the first shell. Test the failure paths that matter to a
headless target:

1. Open several separate SSH commands.
2. Leave one session silent for at least five minutes.
3. Reboot the QNX Pi and wait for SSH to return.
4. Restart the relay and wait for SSH to return again.
5. Stop the retained laptop connection and verify that it stays stopped until
   you start it manually.

The reference prototype was installed through the SD card and tested without
Ethernet on a QNX 8.0.0 Quick Start Target Image on Raspberry Pi 5. The target
showed `wpa_supplicant` attached to `bcm0`, and its boot hook opened the Railway
tunnel. Five consecutive SSH sessions completed. After the outbound SSH process
was deliberately terminated, the first two probes failed and the third
succeeded eight seconds later. A QNX Pi reboot also returned to remote SSH after
two startup probes, and a retained client connection stayed up for more than
six minutes. A C program compiled on the QNX Pi returned:

```text
Hello from the QNX Pi!
system=QNX release=8.0.0 machine=RaspberryPi5
```

Those results validate the live architecture, not every future image and
provider combination. Record the QNX version, board, network-stack mode,
provider, and exact commands for your own deployment.

---

## Next steps
Duration: 2:00

You now have an outbound-only management path to a headless QNX Pi over Wi-Fi.
The relay is intentionally small and replaceable: Railway is one tested host,
not part of the protocol.

For another QNX Pi, run the generator again with a unique device name and
reverse port. For a repeatable image rather than an SD-card payload, integrate
the guarded CTI overlay. The overlay does nothing unless a device-specific
`/boot/qnx-connect.conf` exists, so relay details and private keys do not need
to be baked into a shared image.

Report problems or contribute at
https://github.com/lancestreuber/qnx-pi-headless-relay/issues.
