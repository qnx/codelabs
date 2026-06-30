id: apk-based-cross-compile 
title: How to use apk packages for cross compilation
summary: Learn how to setup a cross compile environment utilizing the ecosystem of apk packages
categories: qnx, porting
tags: intermediate
difficulty: 2
status: published
authors: Aaron Bassett
feedback_link: https://github.com/qnx/codelabs/issues

# How to use apk packages for cross compilation

## Introduction
Duration: 2:00

The self-hosted environment is a powerful tool but in cases where you have an existing project that needs to use qcc how do you utilizes the catalog of open source ports

**What you will learn:**

* How to setup a apk-tools managed  sysroot
* How to setup qcc to use the apk-tools managed sysroot
* building a simple C program
* building a GTK 4 application
* how to cross compile existing oss projects 

---

## Setting up apk-tools
Duration: 5:00


### Build dependencies

#### Debian
```sh
sudo apt install build-essential meson ninja-build pkg-config git libssl-dev zlib1g-dev libzstd-dev lua5.3
```

#### Arch
```sh
sudo pacman -S base-devel meson ninja git openssl zlib zstd lua53
```

#### Alpine
```sh
doas apk add build-base meson ninja pkgconf git openssl-dev zlib-dev zstd-dev lua5.3
```

### Compiling a static apk-tools binary

```sh
git clone https://gitlab.alpinelinux.org/alpine/apk-tools.git --branch v3.0.6
```

```sh
meson setup -Dc_link_args="-static" -Dprefer_static=true -Ddefault_library=static build
ninja -C build src/apk
./build/src/apk --help

mkdir -p ~/.local/bin
cp ./build/src/apk ~/.local/bin
#TODO: add instructions on adding .local/bin to path
export PATH=$PATH:~/.local/bin
```

---

## Setting up abuild

### Build dependencies

#### Debian
```sh
sudo apt install build-essential git make pkg-config libssl-dev scdoc fakeroot pax bsdextrautils curl bc pax-utils
```

#### Arch
```sh
sudo pacman -S --noconfirm base-devel git openssl scdoc fakeroot patch curl bc pax-utils
```

#### Alpine
```sh
doas apk add build-base git make openssl-dev scdoc fakeroot patch curl bc pax-utils
```

### Cloning repos 

```sh
git clone https://github.com/qnx-ports/abuild --branch qnx-3.15.0
```

### Building abuild

```sh
make install prefix="$HOME/.local" sysconfdir="$HOME/.local/etc"
```

### Setting up signing key

```sh
# Make user signing key
abuild-keygen -a
```

## Building QNX wrapped apks
Duration: 2:00

### Dependencies

#### Debian

```sh
sudo apt install netcat-openbsd python3
```

#### Arch
```sh
sudo pacman -S openbsd-netcat
```

#### Alpine

Nothing needed busybox provides netcat

### Cloning repo

```sh
git clone https://github.com/qnx-ports/qsc-apk --branch 804
git clone https://github.com/qnx-packaging/build-qsc-apk.git
```

### Running build-qsc-apk

```sh
build-qsc-apks -o  ~/.cache/qsc-apk/8.0.4/ --arch <x86_64|aarch64> --swc-cli-path ~/qnx/qnxsoftwarecenter/qnxsoftwarecenter_clt ./qsc-apk/qnx-core
build-qsc-apks -o  ~/.cache/qsc-apk/8.0.4/ --arch <x86_64|aarch64> --swc-cli-path ~/qnx/qnxsoftwarecenter/qnxsoftwarecenter_clt ./qsc-apk/qnx-extra
```

---

## Setting up the apk-tools sysroot

```sh
# Make sysroot directory
mkdir -p ./qnx-apk-sysroot
cd ./qnx-apk-sysroot

# setup usr merged symlinks
mkdir -p usr/lib usr/bin
ln -s usr/lib usr/bin .
ln -s . <x86_64|aarch64le>

# init the apk database
apk --root . add --initdb --usermode

# setup qnx signing key
mkdir -p etc/apk/keys
curl -L -o etc/apk/keys/qnxosd.rsa.pub https://repo.oss.qnx.com/keys/qnxosd.rsa.pub

# copy over user signing key
cp ~/.abuild/*.pub etc/apk/keys/

# configured repositories

cat << EOF > etc/apk/repositories
https://repo.oss.qnx.com/8.0.3/core
https://repo.oss.qnx.com/8.0.3/extra
https://repo.oss.qnx.com/8.0.4/core
https://repo.oss.qnx.com/8.0.4/qnx-extra
$HOME/.cache/qsc-apk/8.0.4/qnx-core
$HOME/.cache/qsc-apk/8.0.4/qnx-extra
EOF

apk --root . update
```

---

## hello-world

### Dependencies

```sh
apk --root <path-to-qnx-apk-sysroot> add qnx-microkernel qnx-microkernel-dev qnx-gcc-libs qnx-gcc
```

### The code

```c
// main.c
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    printf("Hello, World!\n");
    return EXIT_SUCCESS;
}

```

```make
# Makefile
CC = qcc
SYSROOT ?= ../qnx-apk-sysroot

CFLAGS += -I$(SYSROOT)/usr/include
LDFLAGS += -L$(SYSROOT)/usr/lib

TARGET = hello
SRCS = hello.c

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRCS) $(LDFLAGS)

clean:
	rm -f $(TARGET)
```

### Building hello-world

```
make
```

#### checking the result

```sh
$ file hello
hello: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /usr/lib/ldqnx-64.so.2, BuildID[md5/uuid]=34294113c5f608180bcc564d5a80ac01, with debug_info, not stripped
```

---

## build a gtk application

### Dependencies

```sh
apk --root ~/tmp/codelab-demo/qnx-apk-sysroot add --no-scripts qnx-microkernel qnx-microkernel-dev qnx-gcc-libs qnx-gcc gtk4-dev qnx-crypto-openssl3 qnx-screen-virtio bash 
```

### The Code

```c
// main.c
#include <gtk/gtk.h>

static void
print_hello (GtkWidget *widget,
             gpointer   data)
{
  g_print ("Hello World\n");
}

static void
activate (GtkApplication *app,
          gpointer        user_data)
{
  GtkWidget *window;
  GtkWidget *button;

  window = gtk_application_window_new (app);
  gtk_window_set_title (GTK_WINDOW (window), "Hello");
  gtk_window_set_default_size (GTK_WINDOW (window), 200, 200);

  button = gtk_button_new_with_label ("Hello World");
  gtk_widget_set_halign(button, GTK_ALIGN_CENTER);
  gtk_widget_set_valign(button, GTK_ALIGN_CENTER);
  g_signal_connect (button, "clicked", G_CALLBACK (print_hello), NULL);
  gtk_window_set_child (GTK_WINDOW (window), button);

  gtk_window_present (GTK_WINDOW (window));
}

int
main (int    argc,
      char **argv)
{
  GtkApplication *app;
  int status;

  app = gtk_application_new ("org.gtk.example", G_APPLICATION_DEFAULT_FLAGS);
  g_signal_connect (app, "activate", G_CALLBACK (activate), NULL);
  status = g_application_run (G_APPLICATION (app), argc, argv);
  g_object_unref (app);

  return status;
}
```

```make 
# Makefile
CC = qcc
SYSROOT ?= ../qnx-apk-sysroot

export PKG_CONFIG_PATH := $(SYSROOT)/lib/pkgconfig:$(PKG_CONFIG_PATH)
export PKG_CONFIG_SYSROOT_DIR := $(SYSROOT)
export QNX_TARGET="$(SYSROOT)"

CFLAGS = -I$(SYSROOT)/usr/include -O2 $(shell pkg-config --cflags gtk4)
LDFLAGS = -L$(SYSROOT)/usr/lib $(shell pkg-config --libs gtk4)

TARGET = hello-gtk4
SRCS = main.c

all: $(TARGET)

$(TARGET): $(SRCS)
  $(CC) $(CFLAGS) -o $(TARGET) $(SRCS) $(LDFLAGS)

clean:
  rm -f $(TARGET)
```

### Building

```sh
make
```

---

## Example: cross compiling java

---

## Optional: Setting up Clang

```sh
CMAKE_C_COMPILER_LAUNCHER=ccache \
CMAKE_CXX_COMPILER_LAUNCHER=ccache \
cmake -B out -S llvm -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DLLVM_TARGETS_TO_BUILD="X86;AArch64" \
    -DLLVM_DEFAULT_TARGET_TRIPLE=x86_64-pc-qnx \
    -DLLVM_ENABLE_PROJECTS="clang"

ninja -C out -j16
```