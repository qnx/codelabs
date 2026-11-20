# Build with the QNX SDP 8.0 toolchain:  source ~/qnx800/qnxsdp-env.sh && make
# For a Raspberry Pi 5:                   make ARCH=aarch64le
ARCH   ?= x86_64
CC      = qcc -Vgcc_nto$(ARCH)
CFLAGS  = -std=gnu11 -O2 -Wall -Wextra

all: ctl wd spin
ctl: ctl.c loop.h
	$(CC) $(CFLAGS) -o $@ ctl.c
wd: wd.c loop.h
	$(CC) $(CFLAGS) -o $@ wd.c
spin: spin.c
	$(CC) $(CFLAGS) -o $@ spin.c
clean:
	rm -f ctl wd spin
.PHONY: all clean
