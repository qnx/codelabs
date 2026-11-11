#!/bin/sh
# Cross-compile the examples. Run after: source <sdp>/qnxsdp-env.sh
#   ./build.sh                 aarch64 little-endian (the default of the QNX QEMU image)
#   ARCH=gcc_ntox86_64 ./build.sh
set -e
cd "$(dirname "$0")"
mkdir -p out
for p in valve-rm intruder sandboxed watcher talker mute; do
  qcc -V"${ARCH:-gcc_ntoaarch64le}" -Wall -o "out/$p" "$p.c"
  echo "built out/$p"
done
