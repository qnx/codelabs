id: apk-based-cross-compile 
title: How to use apk packages for cross compilation
summary: Learn how to setup a cross compile environment using the QNX Alpine Package Keeper (apk) ecosystem
categories: qnx, porting
tags: intermediate
difficulty: 2
status: published
authors: Aaron Bassett
feedback_link: https://github.com/qnx/codelabs/issues

# How to use apk packages for cross compilation

## Introduction
Duration: 2:00

The self-hosted environment is a powerful tool, but in cases where you have an existing project that needs to use qcc, how do you utilizes the catalog of open source ports ?

**What you will learn:**

* How to setup a apk-tools managed  sysroot
* How to setup qcc to use the apk-tools managed sysroot
* Building a simple C program
* Building a GTK 4 application
* How to cross compile existing oss projects 

---

## Setting up apk-tools
Duration: 5:00

apk ... no not android apk!!! apk-tools from Alpine linux is a lightweight but powerful package manager designed for systems that are optimized at scale. We have ported apk-tools to QNX. In order to install the packages from the QNXe repository, we need to have apk-tools built and installed on our host system. For this exercise we are going to assume a linux system

### Build dependencies

Before we can begin we can compile apk-tools we first need to acquire system dependencies.

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

in order to make our life just a bit easier we are going to setup apk as a static binary. That way we don't need to set and LD Library paths

```sh
# 3.0.6 Is the same version we use at the time of writing check if you are on a new version
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
Duration: 3:00

abuild is alpine build system building packaging using APKBUILD files, we need to setup abuild on our host in order to be able to build apk wrapped apks which allows apk-tools to integrate packages from qnx software center

### Build dependencies

Before we can begin we can compile abuild we first need to acquire system dependencies.

#### Debian
```sh
sudo apt install build-essential git make pkg-config libssl-dev scdoc fakeroot pax bsdextrautils curl bc pax-utils
```

#### Arch
sudo pacman -S --noconfirm base-devel git openssl scdoc fakeroot patch curl bc pax-utils
```

#### Alpine
```sh
doas apk add build-base git make openssl-dev scdoc fakeroot patch curl bc pax-utils
```

### Building abuild

```sh
# 3.15.0 Is the same version we use at the time of writing. Check if you are on a newer version
git clone https://github.com/qnx-ports/abuild --branch qnx-3.15.0
```

We are going to install this in your `.local` directory to not pollute your system

```sh
make install prefix="$HOME/.local" sysconfdir="$HOME/.local/etc"
```

### Setting up signing key

Part of apk-tools and abuild is its packaging signing system that validates that a trusted authority has made these packages. For this you are going create your own signing keys for these packages and setup yourself as a trusted authority

```sh
abuild-keygen -a
```

## Building QNX wrapped apks
Duration: 5:00

Now that we have our tooling setup we can now build our qnx wrapped apks.

### Dependencies

But first we need some runtime dependencies 

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

### Running build-qsc-apk

For this step we will need 2 repositories.
1. qnx-ports/qsc-apk: this is where all the APKBUILD definitions are stored and branched based on the sdp version
2. qnx-packaging/build-qsc-apk: a helper script that will download the qpkgs from swcenter and build apks

```sh
git clone https://github.com/qnx-ports/qsc-apk --branch 804
git clone https://github.com/qnx-packaging/build-qsc-apk.git
```

we need to know which architecture we want to package for - so pick what you want to build for (or if you build both, they get their own folders)

```sh
build-qsc-apk -o  ~/.cache/qsc-apk/8.0.4/ --arch <x86_64|aarch64> --swc-cli-path ~/qnx/qnxsoftwarecenter/qnxsoftwarecenter_clt ./qsc-apk/qnx-core
build-qsc-apk -o  ~/.cache/qsc-apk/8.0.4/ --arch <x86_64|aarch64> --swc-cli-path ~/qnx/qnxsoftwarecenter/qnxsoftwarecenter_clt ./qsc-apk/qnx-extra
```

---

## Setting up the apk-tools sysroot

We are now ready to setup our sysroot. a sysroot is a qnx system inside a folder, this allows your compiler/build system to discover libraries, headers and other things like pkg-conf


#### Setting up the folder


```sh
mkdir -p ./qnx-apk-sysroot
cd ./qnx-apk-sysroot

# We are a user merged system so we need to setup symlinks
mkdir -p usr/lib usr/bin
ln -s usr/lib usr/bin .
# Pick one arch here based on your target this is comparability for qcc
ln -s . <x86_64|aarch64le>
```

#### Initializing apk-tools

Now that we have a folder structure we can ask apk to initialize the root for package management

```sh
apk --root . add --initdb --usermode
```

In order to install packages we need to tell apk what keys are trusted. We will setup our qnx signing key as well as the one we made back when we built abuild

```sh
# TODO: check if i really need to make this dir
mkdir -p etc/apk/keys
curl -L -o etc/apk/keys/qnxosd.rsa.pub https://repo.oss.qnx.com/keys/qnxosd.rsa.pub

cp ~/.abuild/*.pub etc/apk/keys/
```

Now we need to tell apk what repositories we want to pull packages from. Here we are doing an 8.0.4 system so we grab those repos plus the qsc-apk packages we made before

```sh
cat << EOF > etc/apk/repositories
https://repo.oss.qnx.com/8.0.3/core
https://repo.oss.qnx.com/8.0.3/extra
https://repo.oss.qnx.com/8.0.4/core
https://repo.oss.qnx.com/8.0.4/qnx-extra
$HOME/.cache/qsc-apk/8.0.4/qnx-core
$HOME/.cache/qsc-apk/8.0.4/qnx-extra
EOF
```

Lets tell apk to update its database with the new keys and repositories

```
apk --root . update 
```

Now that our sysroot is all setup lets copy the full path
```sh
# This could be just `pwd` ... but i like paths relative to home
echo "${PWD/#$HOME/\~}"
```

---

## Hello world from C

After all that setup let make sure we have everything working correctly. What's better than a good old hello world!!!?

### Dependencies

Now we are going to use apk to get qnx dependencies that we need for C, this includes things like libc, gcc runtime libraries, and system headers

```sh
apk --root <path-to-qnx-apk-sysroot> add qnx-microkernel qnx-microkernel-dev qnx-gcc-libs qnx-gcc
```

### The code

We are going to make a dirctory called `hello-world-apk` with a `main.c` and a `Makefile` the result will look like this

```
hello-world-apk/
|-- main.c
|-- Makefile
```

Just a very simple hello-world should look familiar to everyone

```c
// main.c
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    printf("Hello, World from Linux on QNX!\n");
    return EXIT_SUCCESS;
}

```

While i could just give you a single command line to run and get the same result having a make file its easier to understand whats going on

```make
# Makefile
# We are using qcc
CC = qcc
# we need tha path to our sysroot. if you have been following along exactly this should work
# if not just `make SYSROOT=<path-to-qnx-apk-sysroot>`
SYSROOT ?= ../qnx-apk-sysroot

# This is where the magic happens
# 1. We add CFLAGS in-order for the compiler to recognize our sysroot for headers
CFLAGS += -I$(SYSROOT)/usr/include
# 2. We add LDFLAGS in-order to tell the linker in where to find shared libraries
LDFLAGS += -L$(SYSROOT)/usr/lib
# 3. We are the qnx target now
export QNX_TARGET="$(SYSROOT)"

# the rest of this make file is nothing special its just a standard makefile.
TARGET = hello-qnx
SRCS = hello.c

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRCS) $(LDFLAGS)

clean:
	rm -f $(TARGET)
```

### Building hello-world

Okay now.. lets ... make it ... with make ... say that 5 times fast

```
make
```

so now it should of worked :tada: ... but lets validate my claims first with handy dandy `file`

```sh
$ file hello-qnx
hello: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /usr/lib/ldqnx-64.so.2, BuildID[md5/uuid]=34294113c5f608180bcc564d5a80ac01, with debug_info, not stripped
```

you should get something like this. what we really care about is interpreter part we should see `/usr/lib/ldqnx-64.so.2` if so we are good to go. copy this onto your target and give it a run

```sh
scp hello-qnx qnxuser@<ip/hostname>:~/
```

and lets give it a run

```sh
ssh qnxuser@<ip/hostname>

$ ~/hello-qnx
Hello, World from Linux on QNX!

```

Well that was a simple example lets get into something more complicated with lots of dependencies. why not GTK4

---

## Hello world from GTK4

GTK4 dependency wise is very compliated there are alot of moving parts to render to the screen in this case either a wayland session or qnx-screen

### Dependencies

Like we hello world we need some dependencies but this time we are going to grab open source dependencies and a few qnx packages for crypto and graphics

<aside>
    <strong>NOTE:</strong> im assuming you did hello world if not add the dependencies from that step as well 
</aside>

```sh
apk --root <path-to-qnx-apk-sysroot> add --no-scripts gtk4-dev qnx-crypto-openssl3 qnx-screen-virtio bash 
```

you will notice quite a bit of packages being added about 140 packages are needed to properly build gtk applications this shows the power of using apk for compiling as previously you would have to go and build these dependencies yourself

### The Code

Like hello world we are going to make a dirctory called `gtk4-hello-world-apk` with a `main.c` and a `Makefile` the result will look like this

```
gtk4-hello-world-apk/
|-- main.c
|-- Makefile
```

This is just ["Hello World in C"](https://docs.gtk.org/gtk4/getting_started.html#hello-world-in-c) taken directly from gtk's documentation

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
  GtkWidget *box;

  window = gtk_application_window_new (app);
  gtk_window_set_title (GTK_WINDOW (window), "Window");
  gtk_window_set_default_size (GTK_WINDOW (window), 200, 200);

  box = gtk_box_new (GTK_ORIENTATION_VERTICAL, 0);
  gtk_widget_set_halign (box, GTK_ALIGN_CENTER);
  gtk_widget_set_valign (box, GTK_ALIGN_CENTER);

  gtk_window_set_child (GTK_WINDOW (window), box);

  button = gtk_button_new_with_label ("Hello World");

  g_signal_connect (button, "clicked", G_CALLBACK (print_hello), NULL);
  g_signal_connect_swapped (button, "clicked", G_CALLBACK (gtk_window_destroy), window);

  gtk_box_append (GTK_BOX (box), button);

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

Now like before we are going to use a makefile to explain what the key parts are

```make 
# Makefile
# We are using qcc
CC = qcc
# we need tha path to our sysroot. if you have been following along exactly this should work
# if not just `make SYSROOT=<path-to-qnx-apk-sysroot>`
SYSROOT ?= ../qnx-apk-sysroot

# Now here is where things get interesting we need to configure 
# 1. We tell pkgconf to look in our sysroot for pkgconf definitions
export PKG_CONFIG_PATH := $(SYSROOT)/lib/pkgconfig:$(PKG_CONFIG_PATH)

# 2. We also need to tell pkgconf that all definitions need to be relative to our sysroot
export PKG_CONFIG_SYSROOT_DIR := $(SYSROOT)

# 3. We are the qnx target now
export QNX_TARGET="$(SYSROOT)"

# 4. Like hello world we tell the compiler where our headers are AND
#.     we use pkg-conf to add cflags that we need for gtk4 and its dependencies
CFLAGS = -I$(SYSROOT)/usr/include -O2 $(shell pkg-config --cflags gtk4)

# 5. Like hello world we tell the linker where our libraries are AND
#.     we use pkg-conf to add libraries that we need for gtk4 and its dependencies
LDFLAGS = -L$(SYSROOT)/usr/lib $(shell pkg-config --libs gtk4)

# the rest of this make file is nothing special its just a standard makefile.

TARGET = hello-gtk4
SRCS = main.c

all: $(TARGET)

$(TARGET): $(SRCS)
  $(CC) $(CFLAGS) -o $(TARGET) $(SRCS) $(LDFLAGS)

clean:
  rm -f $(TARGET)
```

### Building

Okay now.. lets ... make it ... with make ... again

```sh
make
```

Now like before ... let's get this on a qnx system. Since we are using gtk4, we will need a system with a desktop like the [Developer Desktop](https://www.qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.qdd/topic/about.html)

```sh
scp hello-qnx qnxuser@<ip/hostname>:~/
```

This time we can't just ssh in we need to go into the desktop open a terminal and run our application

#TODO insert screen shoot :tada:

We have now cross compiled a application with a complex dependency chain. almost as simple as you would your own system

<aside>
As a exercise i suggest you take a look at the <a href="https://github.com/qnx-ports/build-files/tree/main/ports/gtk">cross compiler setup for just gtk4</a> we have come a long way to simplify the process and lower the barrier for end users
</aside>

---

## Conclusion

#TODO

---

## Example: Cross Compiling java

#TODO

---

## Optional: Using clang as a cross compiler

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