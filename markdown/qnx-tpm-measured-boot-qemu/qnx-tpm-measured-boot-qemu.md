id: qnx-tpm-measured-boot-qemu
title: Measured boot on QNX 8.0: give your QEMU target a TPM
summary: Boot QNX 8.0 on QEMU through UEFI with a TPM 2.0 attached, talk to the TPM from QNX, and prove that the firmware measured exactly the IFS you built.
categories: Security, Getting Started
tags: intermediate
platforms: QEMU
published: 2026-11-27
featured: false
status: published
authors: Shiran Yu
feedback_link: https://github.com/qnx/codelabs/issues

# Measured boot on QNX 8.0: give your QEMU target a TPM

## Overview
Duration: 2:00

A TPM (Trusted Platform Module) records what a machine booted. UEFI firmware hashes each boot
application into a TPM register, a PCR, before it runs it. On a QNX target booted through UEFI, the
boot application is the QNX image filesystem (IFS): kernel, startup code and boot script.

In this codelab you will:

- build a QNX 8.0 image that boots through UEFI on QEMU,
- fix the one setting that stops current OVMF firmware from loading it,
- attach a software TPM (swtpm) on the standard TIS interface,
- read PCR 4 from QNX through a small TPM resource manager,
- compute the same PCR 4 on your host from `ifs.bin`, and see them match.

When they match, the firmware has vouched for your exact IFS. Change one byte of the boot script and
PCR 4 changes. This is the first link of measured boot.

### What you need
- A Linux x86_64 host with the QNX SDP 8.0 installed (QNX Everywhere licence) and `qnxsdp-env.sh`
- `qemu-system-x86_64` (tested with 10.2.1), `swtpm` (0.10.1), OVMF (`ovmf` package, 2025.11)
- `git`, `make`, and Python 3.10+ with `uv`

Every command below was run as written, from a fresh clone, on 2026-11-27, the last step included:
the PCR 4 that QNX read from the TPM equalled the host's prediction, and after the boot script
changed both moved to the same new value
([run log](https://github.com/shiran-yu/witness-qnx/blob/main/docs/evidence/codelab-run.log)).

## Get the code and build the TPM driver
Duration: 5:00

The TPM driver `dev-tpm-tis` is a QNX resource manager: it maps the TPM's TIS registers at
`0xFED40000`, attaches its interrupt, and serves `/dev/tpm0`. A client writes one TPM command and
reads one response.

```bash
git clone https://github.com/shiran-yu/witness-qnx witness && cd witness
source ~/qnx800/qnxsdp-env.sh
make                      # qcc -Vgcc_ntox86_64: build/x86_64/dev-tpm-tis, tpm-raw, ...
```

`tpm-raw` sends one hex-encoded TPM command to `/dev/tpm0` and prints the response in hex.

## Create a UEFI image
Duration: 5:00

```bash
mkdir -p ~/tpm-lab/vm && cd ~/tpm-lab/vm
mkqnximage --type=qemu --arch=x86_64 --boot-mode=uefi --ip=dhcp --ssh-ident=$HOME/.ssh/id_ed25519.pub
```

`--boot-mode=uefi` puts the IFS on a FAT partition as `EFI/BOOT/BOOTx64.EFI`, so the firmware loads
it like any UEFI application, and measures it.

### The OVMF load address
Current OVMF builds keep their own data at addresses up to about 24 MB. The IFS is linked to run at
20 MB and has no relocations, so the firmware refuses it with "is not an image". Move it up by adding
a definitions snippet. Its name must sort after `definitions.type_qemu`, and comments must be C style:

```bash
cat > local/snippets/definitions.zz_tpm <<'EOF'
/* IFS load address that current OVMF accepts */
#undef __BOOT_ADDR__
#define __BOOT_ADDR__ 64m
EOF
```

## Add the TPM driver to the IFS
Duration: 5:00

Put the driver and `tpm-raw` into the IFS and start the driver from the IFS boot script, before the
system partition is mounted:

```bash
W=~/witness/build/x86_64   # where you cloned it
cat > local/snippets/ifs_files.tpm <<EOF
[perms=0555] dev-tpm-tis=$W/dev-tpm-tis
[perms=0555] tpm-raw=$W/tpm-raw
EOF
cat > local/snippets/ifs_start.tpm <<'EOF'
    display_msg "---> Starting TPM driver"
    dev-tpm-tis -i 5
    waitfor /dev/tpm0 5
EOF
mkqnximage --build
```

## Boot with a software TPM
Duration: 5:00

Start swtpm, then QEMU with the TIS device pointing at it:

```bash
mkdir -p tpmstate
swtpm socket --tpm2 --tpmstate dir=tpmstate --ctrl type=unixio,path=tpm.sock --daemon
cp /usr/share/OVMF/OVMF_VARS_4M.fd vars.fd
qemu-system-x86_64 -enable-kvm -cpu host -m 1G -nographic \
  -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
  -drive if=pflash,format=raw,file=vars.fd \
  -drive file=output/disk-qemu,format=raw,if=ide \
  -chardev socket,id=chrtpm,path=tpm.sock -tpmdev emulator,id=tpm0,chardev=chrtpm \
  -device tpm-tis,tpmdev=tpm0 \
  -netdev user,id=net0,hostfwd=tcp::10022-:22 -device virtio-net-pci,netdev=net0
```

If QEMU says "Could not access KVM kernel module: Permission denied", add yourself to the `kvm` group
and log in again, or replace `-enable-kvm -cpu host` with `-cpu max` so QEMU emulates the CPU (slower,
but the TPM steps work the same; with no `-cpu` at all the IFS stops right after OVMF starts it).

Keep QEMU's default `pc` machine: on `q35` the `if=ide` disk sits behind an AHCI controller, which
`devb-eide` does not find, and the system partition is never mounted.

On the console you should see:

```
---> Starting TPM driver
dev-tpm-tis: TPM 2.0 at 0xfed40000 vendor 0x1014 device 0x0001 rev 1, interrupt driven
```

## Read PCR 4 on the target
Duration: 5:00

`TPM2_PCR_Read` for SHA-256 PCR 4 is 20 bytes:

| Bytes | Meaning |
|---|---|
| `8001` | no sessions |
| `00000014` | size 20 |
| `0000017e` | TPM_CC_PCR_Read |
| `00000001 000b 03 100000` | one selection: SHA-256, 3 bytes of bitmap, bit 4 set |

```bash
ssh -p 10022 root@127.0.0.1 /proc/boot/tpm-raw 8001000000140000017e00000001000b03100000
```

The last 32 bytes of the response are PCR 4.

## Predict PCR 4 on the host
Duration: 8:00

OVMF extends PCR 4 three times before it starts the IFS:

1. `SHA256("Calling EFI Application from Boot Option")`
2. `SHA256(00 00 00 00)`, the separator
3. the Authenticode hash of `BOOTx64.EFI`, the PE image hash that skips the checksum and the
   certificate table

Each extend is `PCR = SHA256(PCR || digest)`, starting from 32 zero bytes. The Witness host
package has the Authenticode hash (`witness/pe.py`); the rest is five lines:

```bash
cd ~/witness/host
uv run python - ~/tpm-lab/vm/output/ifs.bin <<'EOF'
import hashlib, sys
from witness.pe import authenticode_digest
pcr = bytes(32)
for d in (hashlib.sha256(b"Calling EFI Application from Boot Option").digest(),
          hashlib.sha256(bytes(4)).digest(), authenticode_digest(open(sys.argv[1], "rb").read())):
    pcr = hashlib.sha256(pcr + d).digest()
print(pcr.hex())
EOF
```

Compare it with the value from the target. They match.

## Change the boot script, watch PCR 4 change
Duration: 3:00

Add one line to `local/snippets/ifs_start.tpm`, quit QEMU (`Ctrl-a x`), run `mkqnximage --build`
again, start swtpm again (it exits when QEMU does; `tpmstate` keeps the TPM), start QEMU with the same
command, and read PCR 4 again. The prediction and the TPM both change, and still match each other: the firmware
measured the new IFS. A device whose PCR 4 does not match your build is not running your IFS.

## Where to go next
Duration: 1:00

- Measure the system partition too, before anything on it runs, and attest the result remotely:
  the Witness project does this (`demo/demo.sh`).
- Confine the TPM with a QNX security policy so only measured components can use it.
