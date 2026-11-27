id: medvault-windows-qemu
title: Build MedVault — a Multi-Process Safety Interlock on QNX OS 8.0 (Windows + QEMU)
summary: Learn how to build multi-process QNX OS 8.0 resource managers, native MsgSend IPC, secpol_resmgr_attach security policies, and SLM restart configuration on a Windows 10/11 host using QEMU with no extra hardware.
categories: Getting Started, Security
tags: intermediate
platforms: QEMU, Windows
published: 2026-11-28
featured: false
status: published
authors: NeedPair
feedback_link: https://github.com/qnx/codelabs/issues

# Build MedVault — a Multi-Process Safety Interlock on QNX OS 8.0 (Windows + QEMU)

## Overview
Duration: 2:00

On **QNX OS 8.0**, drivers, resource managers, and safety supervisors run as separate user-space processes communicating through a microkernel.

In this codelab, you will build and run **MedVault**, an educational multi-process safety-interlock demonstration **running on QNX OS 8.0.0 x86_64 inside Windows QEMU** — with no Raspberry Pi, no Ubuntu dual-boot, and no WSL2 KVM required.

> aside positive
> **Disclaimer**: MedVault is an educational multi-process architecture demonstration. It is not a medical device and must not be used for clinical diagnosis or treatment.

> aside positive
> **How this codelab was made**: The author provided account setup, license/install approvals, and direction on a Windows 10 PC, while AI agents (Anthropic Claude and Google Gemini) drafted the design, code, and tutorial text and ran the build, QEMU boot, deployment, and target-side QNX OS 8.0.0 commands. Adapt the example host paths (`D:\qnx800`, `D:\qnx-work\...`) and replace the placeholder clone URL with the published repository URL once public.

### What you will learn
- Cross-compiling QNX 8.0 x86_64 binaries natively on Windows using `qnxsdp-env.bat` and `qcc -Vgcc_ntox86_64`.
- Generating a lean QNX 8.0 x86_64 QEMU image on Windows with `mkqnximage` and booting it under QEMU (`-accel tcg -cpu max`) with user-mode SSH and HTTP port forwarding.
- Implementing custom QNX **Resource Managers** (`/dev/med/vitals`, `/dev/med/pump`, `/dev/med/blackbox`) with `secpol_resmgr_attach()`, `iofunc_*`, `devctl()`, and `SIGEV_PULSE_INIT` timers.
- Using **native QNX synchronous Message Passing** (`name_attach`, `name_open`, `MsgSend`, `MsgReceive`, `MsgReply`) across separate processes.
- Compiling a **QNX 8.0 Security Policy (`secpol`)** with `secpolcompile`, linking it at `/proc/boot/secpol.bin`, and inspecting POSIX ACLs with `getfacl`.
- Configuring **System Launch & Monitor (`slm`)** so sending `SIGSEGV` to `vitals_rm` causes `med_safetyd` to command `KVO_SAFE` and `vitals_rm` to return with a new PID while `pump_rm` and `med_safetyd` report their existing PIDs.

### Prerequisites
- A 64-bit Windows 10 or Windows 11 x86_64 PC.
- A free [QNX Everywhere Non-Commercial License](https://www.qnx.com/getqnx) and **QNX SDP 8.0** installed via QNX Software Center (example path: `D:\qnx800`).
- **QEMU for Windows** (`qemu-system-x86_64.exe`).

---

## Step 1: Generate and Boot a Lean QNX 8.0 x86_64 QEMU Image on Windows
Duration: 5:00

1. Generate an RSA key pair for non-interactive SSH access to your local QEMU target (example host paths shown):

```powershell
mkdir D:\qnx-work\ssh, D:\qnx-work\vm-x86_64
ssh-keygen -t rsa -b 2048 -N "" -f D:\qnx-work\ssh\id_qnx
```

2. Open Command Prompt (`cmd.exe`), load `qnxsdp-env.bat`, and run `mkqnximage` (use **forward slashes** in `--ssh-ident` on Windows):

```cmd
call D:\qnx800\qnxsdp-env.bat
cd /d D:\qnx-work\vm-x86_64
mkqnximage --type=qemu --arch=x86_64 --hostname=medvault --ssh-ident=D:/qnx-work/ssh/id_qnx.pub --build --force
```

3. Boot QNX OS 8.0 in Windows QEMU (this example uses `-accel tcg -cpu max`):

```powershell
& "D:\qnx-work\qemu\qemu-system-x86_64.exe" `
  -accel tcg -cpu max -machine pc -smp 2 -m 2G `
  -drive file=D:\qnx-work\vm-x86_64\output\disk-qemu.vmdk,if=ide,id=drv0 `
  -kernel D:\qnx-work\vm-x86_64\output\ifs.bin `
  -netdev user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22,hostfwd=tcp:127.0.0.1:8080-:8080 `
  -device virtio-net-pci,netdev=net0 `
  -nographic -serial mon:stdio
```

4. In a second terminal, connect over SSH (in our Windows 10 + QEMU 11 TCG setup we passed `-o Ciphers=aes128-ctr -o MACs=hmac-sha2-256`):

```powershell
ssh -p 2222 -i D:\qnx-work\ssh\id_qnx -o StrictHostKeyChecking=no -o Ciphers=aes128-ctr -o MACs=hmac-sha2-256 root@127.0.0.1 "uname -a"
```

Example output:
```text
QNX medvault 8.0.0 2026/10/30-09:10:05EDT x86pc x86_64
```

---

## Step 2: Process Architecture
Duration: 3:00

MedVault divides responsibilities into five user-space processes plus an HTTP telemetry bridge:

| Process | Path / IPC Name | Scheduling | Role |
|---|---|---|---|
| `vitals_rm` | `/dev/med/vitals` | Default | 100 ms pulse-driven synthetic ECG/SpO2 resource manager (configured in SLM) |
| `pump_rm` | `/dev/med/pump` | Default | Clamped infusion resource manager checking caller effective UID `0` (`EACCES` otherwise) |
| `blackbox_rm` | `/dev/med/blackbox` | Default | In-memory SHA-256 hash-chained audit ring (most recent 128 events) + `slog2` mirroring |
| `med_safetyd` | `/dev/name/local/medvault_safety` | `SCHED_FIFO` (prio 30) | Sends normal pump control commands as UID `0`; commands `KVO_SAFE` on vitals loss or hypoxia |
| `med_advisor` | `/dev/name/local/medvault_advisor` | `SCHED_RR` (prio 8, UID 1001) | Rule-based read-only triage advisor; write opens on `/dev/med/pump` return `EACCES` |

Per the official QNX SDP 8.0 documentation ([QNX OS 8.0 Release Notes](https://www.qnx.com/developers/docs/8.0/)), the legacy Adaptive Partitioning Scheduler (APS) is not included in QNX OS 8.0, so this architecture uses `SCHED_FIFO` / `SCHED_RR` thread priorities and synchronous `MsgSend()` message passing.

---

## Step 3: Cross-Compile Binaries and Compile the `secpol` Policy
Duration: 4:00

Clone the repository (replace `https://github.com/janitestkr-collab/medvault.git` with the published GitHub URL) and run the Windows build script:

```cmd
git clone https://github.com/janitestkr-collab/medvault.git
cd medvault
scripts\build-win.cmd
```

Key QNX 8.0 implementation details:

1. **Header order**: Include `<sys/iofunc.h>` before `<sys/dispatch.h>` and `<sys/resmgr.h>` so `RESMGR_OCB_T` resolves to `iofunc_ocb_t`.
2. **Policy-driven resource manager mount** (`src/pump_rm/main.c`):
```c
id = secpol_resmgr_attach(NULL, dpp, &rattr, MED_PATH_PUMP, _FTYPE_ANY, 0,
                          &cfuncs, &ifuncs, &attr, NULL);
```
3. **Mount-point ACL policy** (`qnx_config/medvault.secpol`):
```text
mount_point 0:0 { u::rw g::r o::r } /dev/med/pump;
mount_point 0:0 { u::rw g::r o::r } /dev/med/vitals;
mount_point 0:0 { u::rw g::rw o::r } /dev/med/blackbox;
```
Compiled on Windows with:
```cmd
secpolcompile -o build\secpol.bin qnx_config\medvault.secpol
```
4. **Runtime caller effective-UID check** (`src/pump_rm/main.c`):
```c
if (ConnectClientInfoExt(ctp->info.scoid, &cinfo, 0) != 0 || cinfo->cred.euid != g_allowed_writer_uid) {
    return EACCES;
}
```

---

## Step 4: Deploy to `/data/medvault` and Launch Under QNX SLM
Duration: 4:00

On `mkqnximage` targets, `/` is the microkernel pathname space and `/data` is the writable QNX6 filesystem. Deploy your compiled binaries together with `slm` and `libexpat.so.2` from your own QNX SDP 8.0 installation:

```powershell
$sshOpts = @("-i","D:\qnx-work\ssh\id_qnx","-o","StrictHostKeyChecking=no","-o","Ciphers=aes128-ctr","-o","MACs=hmac-sha2-256")
ssh -p 2222 @sshOpts root@127.0.0.1 "mkdir -p /data/medvault/bin /data/medvault/lib /data/medvault/etc /data/medvault/web"
scp -P 2222 @sshOpts build\vitals_rm build\pump_rm build\blackbox_rm build\med_safetyd build\med_advisor build\telemetry_httpd build\rogue_overdose build\cpu_storm D:\qnx800\target\qnx\x86_64\usr\sbin\slm root@127.0.0.1:/data/medvault/bin/
scp -P 2222 @sshOpts D:\qnx800\target\qnx\x86_64\usr\lib\libexpat.so.2 root@127.0.0.1:/data/medvault/lib/
scp -P 2222 @sshOpts build\secpol.bin qnx_config\slm_config.xml root@127.0.0.1:/data/medvault/etc/
scp -P 2222 @sshOpts web\index.html root@127.0.0.1:/data/medvault/web/
scp -P 2222 @sshOpts scripts\medvault-start.sh root@127.0.0.1:/data/medvault/
ssh -p 2222 @sshOpts root@127.0.0.1 "chmod +x /data/medvault/bin/* /data/medvault/medvault-start.sh && /data/medvault/medvault-start.sh"
```

Inside `medvault-start.sh`, a process-manager symlink makes `secpol.bin` available at `/proc/boot/secpol.bin` before SLM starts the resource managers:
```sh
ln -sPf /data/medvault/etc/secpol.bin /proc/boot/secpol.bin
on -d /data/medvault/bin/slm -b 1 -r restart /data/medvault/etc/slm_config.xml >/tmp/medvault_slm.log 2>&1 </dev/null
```

Inspect the mount-point ACL with `getfacl /dev/med/pump`:
```text
# file: /dev/med/pump
# owner: root
# group: root
user::rw-
group::r--
other::r--
```

---

## Step 5: Run the Interactive Demo Scenarios
Duration: 5:00

Open `http://127.0.0.1:8080` in your host browser or run the commands directly on the target:

### 1. Unauthorized Write Attempt (`UID 2000`)
```sh
/data/medvault/bin/rogue_overdose && cat /dev/med/pump
```
`rogue_overdose` drops to UID `2000` and attempts both `open("/dev/med/pump", O_RDWR)` and `devctl(DCMD_MED_SET_PUMP, 150.0 mL/h)`. `pump_rm` checks caller `euid == 0`, returns `EACCES` (`Permission denied`), and appends `AUTH_DENY` to `/dev/med/blackbox`.

### 2. Sending `SIGSEGV` to `vitals_rm`
```sh
slay -s SEGV vitals_rm && sleep 4 && cat /dev/med/vitals && cat /dev/med/pump
```
Because `slm_config.xml` configures `vitals_rm` with `restart` and does not list `vitals_rm` as an `<SLM:depend>` of `med_safetyd` or `pump_rm`, `med_safetyd` commands `pump_rm` into `KVO_SAFE` (`1.0 mL/h`) on vitals loss, logs `FAULT_KVO` and `VITALS_PID_NEW` when `vitals_rm` responds with a new PID while `pump_rm` and `med_safetyd` report their existing PIDs, and resumes nominal infusion (`10.0 mL/h`).

### 3. Inspect the In-Memory Audit Ring & `slog2info`
```sh
cat /dev/med/blackbox && slog2info | grep -i medvault | tail -n 8
```
State transitions (`AUTH_DENY`, `FAULT_KVO`, `VITALS_PID_NEW`, `HYPOXIA_KVO`, `RESUME`) are chained with SHA-256 across the most recent 128 entries kept in memory in `/dev/med/blackbox` and mirrored into QNX `slog2`.

---

## Congratulations!
Duration: 1:00

You have built and run MedVault, a multi-process safety-interlock application running on QNX OS 8.0 on Windows + QEMU using QNX Resource Managers, native `MsgSend` IPC, `secpol`, `slog2`, and `slm`.
