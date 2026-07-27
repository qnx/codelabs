#!/bin/sh
# QNX 8.0 QEMU launcher (template) - ALTERNATIVE to QSTI.
#
# Use this only if you already have your own QNX 8.0 disk image and want to
# launch and tweak it directly. If you do NOT have an image yet, the easier path
# is the official Quick Start Target Image (QSTI), which launches with
# `mkqnximage --run`; see TARGET.md. This script is for the bring-your-own-image
# case, where having the launch command in front of you is handy for tuning.
#
# Edit the values marked CHANGE_ME before first use, then run from the directory
# that holds your OVMF_VARS.fd (the relative paths below resolve against the
# working directory, so launch from that directory, not the repo).
#
# Tweakable settings (safe defaults shown):
#   -smp $(nproc)   number of vCPUs; defaults to all host cores. Lower it to
#                   leave the host headroom.
#   -m 16G          guest RAM. 8G works for most ports; large C++ builds
#                   (webkit, llvm) are happier with 16G or more.
#   hostfwd 2227    host port forwarded to guest SSH (22). Connect with
#                   `ssh -p 2227 <user>@localhost`. Change only if 2227 is taken
#                   on your host; if you do, note the new port in TARGET.md.
#   --enable-kvm    requires /dev/kvm on the host. Drop this line if KVM is
#                   unavailable (much slower, but works).
#
# Firmware and image (CHANGE_ME):
#   OVMF_CODE.fd    UEFI firmware code; on Ubuntu, `sudo apt install ovmf`
#                   puts it at /usr/share/OVMF/OVMF_CODE.fd.
#   OVMF_VARS.fd    writable UEFI vars; copy the stock one in next to this
#                   script: cp /usr/share/OVMF/OVMF_VARS.fd ./OVMF_VARS.fd
#   the .img        your QNX 8.0 disk image; set the real path below.

qemu-system-x86_64 \
    -smp $(nproc) \
    --enable-kvm \
    --cpu host,host-phys-bits-limit=39 \
    -machine pc \
    -m 16G \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE.fd \
    -drive if=pflash,format=raw,file=./OVMF_VARS.fd \
    -drive file=CHANGE_ME/path/to/your-qnx-8.0-image.img,if=virtio,id=drv0,driver=raw \
    -netdev user,id=net0,hostfwd=tcp::2227-:22 \
    -device virtio-net-pci,netdev=net0 \
    -object rng-random,filename=/dev/urandom,id=rng0 \
    -device virtio-rng-pci,rng=rng0 \
    -serial mon:stdio \
    -vga none \
    -device virtio-vga-gl \
    -display sdl,gl=on \
    -monitor unix:./qemu-monitor-socket,server,nowait
