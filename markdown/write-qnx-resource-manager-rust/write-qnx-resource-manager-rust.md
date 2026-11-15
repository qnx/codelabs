id: write-qnx-resource-manager-rust
title: Write a QNX resource manager in Rust
summary: Serve your own /dev file from safe Rust on QNX 8.0, then use it from the QNX shell and from C.
categories: qnx, rust, resource managers
tags: intermediate
difficulty: 2
status: published
authors: Jake Hoffman
feedback_link: https://github.com/jakethehoffer/qnx-ipc/issues

# Write a QNX resource manager in Rust

## Welcome
Duration: 2:00

On QNX, drivers and system services are ordinary programs called **resource managers**. A resource manager takes over a path such as `/dev/counter`, and from then on every `open`, `read`, `write` and `devctl` on that path turns into a message to it. That's why `cat`, a shell script and a C program can all talk to a service with no special client library.

In this codelab you'll write one in Rust, using the open source [`qnx-ipc`](https://github.com/jakethehoffer/qnx-ipc) library, and run it on QNX 8.0 under QEMU.

### What you'll build

A small counter device at `/dev/counter`:

* `cat /dev/counter` prints the count.
* `echo 5 > /dev/counter` adds 5 to it.
* A C program reads the count and resets it with `devctl()`, QNX's call for device-specific commands.

### What you'll learn

* How to set up a Rust project that builds for QNX 8.0 and runs on a QEMU target
* How to serve a path from Rust by implementing one trait
* How reads, writes and `devctl` commands reach your code
* What a resource manager does with the messages it receives

You only need basic Rust. No QNX experience is assumed.

---

## Before you begin
Duration: 10:00

You need a Linux x86_64 machine with KVM. Ubuntu 24.04 under WSL2 on Windows 11 works, and it's what this codelab was tested on.

### A QNX license and the SDP

1. Follow QNX's codelab [Get a non-commercial QNX license](https://qnx.github.io/codelabs/get-non-commercial-qnx-license/) to get your free license.
2. In QNX Software Center, install **QNX SDP 8.0** into `~/qnx800`.
3. Also install QNX's Rust package, `com.qnx.qnx800.host.linux.x86_64.rust`. It adds a Rust compiler with the standard library prebuilt for QNX 8.0.

The library's [toolchain notes](https://github.com/jakethehoffer/qnx-ipc/blob/main/docs/toolchain.md) list the exact versions used.

### Cargo, QEMU and clang

QNX's Rust package ships `rustc` but no `cargo`, so get the matching `cargo` from rustup ([install rustup](https://rustup.rs) first if you don't have it):

```sh
rustup toolchain install 1.85.1 --profile minimal
```

Then install QEMU, and clang (the build generates Rust bindings from the QNX headers with it), and let yourself use KVM:

```sh
sudo apt install qemu-system-x86 qemu-utils clang libclang-dev
sudo usermod -aG kvm $USER
```

Log out and back in (for WSL, run `wsl --shutdown` from Windows) so the group change takes effect.

### About the QNX target

QNX's own QEMU codelabs ([on Ubuntu](https://qnx.github.io/codelabs/setup-qsti-qemu-on-ubuntu/), [on WSL](https://qnx.github.io/codelabs/qsti-qemu-on-wsl/)) boot QNX's Quick Start Target Image. You don't need that image here. The repository you'll clone has a script that builds a small QNX 8.0 image from your own SDP and boots it headless, with SSH on port 2222.

_When you're ready, continue._

---

## Get the code and start QNX
Duration: 5:00

1. Clone the library and go into it:

    ```sh
    git clone https://github.com/jakethehoffer/qnx-ipc.git
    cd qnx-ipc
    ```

2. Load the build environment. This sets up the QNX SDP, points cargo at QNX's `rustc`, and sets `$QNX_RUST_TARGET` to `x86_64-pc-nto-qnx800`:

    ```sh
    source tools/env.sh
    ```

    Do this in every new terminal you use for this codelab.

3. Check that the pieces are there:

    ```sh
    "$RUSTC" -V
    cargo -V
    qemu-system-x86_64 --version
    ```

    You should see QNX's compiler (the `-dev` suffix), rustup's cargo of the same version, and QEMU (your QEMU version may differ):

    ```text
    OUTPUT_VERSIONS
    ```

4. Start the QNX target:

    ```sh
    tools/qemu-up.sh
    ```

    The first run builds the image with QNX's `mkqnximage`. Later runs reuse the image, or the VM if it's already running. Either way, the script waits until QNX answers on SSH and ends with a line that starts with `QNX target up`.

Positive
: The target keeps running in the background. Stop it with `tools/qemu-down.sh` when you're done.

---

## Run your first resource manager
Duration: 5:00

The repository comes with a tiny example, `hello_device`, that serves `/dev/hello`.

1. In your first terminal, run it:

    ```sh
    cargo run -p qnx-resmgr --example hello_device --target $QNX_RUST_TARGET
    ```

    Cargo builds the example for QNX. Then `tools/qnx-run`, which `tools/env.sh` set up as cargo's runner for the QNX target, copies the binary to the target over SSH and runs it there as root. The first build takes a while. After cargo's build messages, the example prints:

    ```text
    OUTPUT_HELLO_RUN
    ```

    It keeps running, so leave this terminal alone.

2. Open a second terminal. Load the environment and make a short alias for logging in to the target:

    ```sh
    cd qnx-ipc
    source tools/env.sh
    alias qnx='ssh -i "$QNX_SSH_KEY" -p "$QNX_SSH_PORT" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR root@127.0.0.1'
    ```

    The `-o` options skip the host key check. That's fine for a local VM whose key changes every time the image is rebuilt.

3. Log in to the QNX shell:

    ```sh
    qnx
    ```

    You get a `#` prompt. You're on QNX now.

4. Read the device and look at it:

    ```shell
    cat /dev/hello
    ls -l /dev/hello
    ```

    ```text
    OUTPUT_HELLO_CAT
    ```

    `/dev/hello` is a character device, and the text comes straight from the Rust program in your first terminal.

5. Stop the example:

    ```shell
    slay hello_device
    ```

    `slay` stops a program by name. Back in the first terminal, the output ends with `Terminated` and your prompt comes back. The path goes away with the program:

    ```shell
    ls /dev/hello
    ```

    ```text
    OUTPUT_HELLO_GONE
    ```

Stay logged in to the QNX shell in the second terminal for the next steps.

---

## Read the hello example
Duration: 3:00

Open `crates/qnx-resmgr/examples/hello_device.rs`. Here is the whole program:

```rust
//! Serves `/dev/hello` until killed: `cat /dev/hello` prints `hello from Rust`.
//!
//! Run as root (attaching under `/dev` needs it).

use qnx_resmgr::{Device, ResourceManager};

struct Hello;

impl Device for Hello {
    fn read(&self) -> qnx_ipc::Result<Vec<u8>> {
        Ok(b"hello from Rust\n".to_vec())
    }
}

fn main() -> qnx_ipc::Result<()> {
    eprintln!("serving /dev/hello");
    ResourceManager::new("/dev/hello")?.run(Hello)
}
```

Two types do the work:

* **`Device`** is a trait with three methods. `read` returns the file's content. `write` and `devctl` have defaults that reject the call with an error, so a read-only device only needs `read`.
* **`ResourceManager`** takes over a path. `run` attaches the device there and then answers messages on the calling thread until the program is killed.

You never see a QNX message in this code. The library connects QNX's resource manager framework to the trait, and the framework handles `open`, `close`, `stat` and permissions for you.

Each `open` of the path gets its own snapshot: the library calls `read` on the first read of that open file and serves every later read from the result. So a reader always sees consistent content, even if it reads one byte at a time.

---

## Create a counter device
Duration: 5:00

Now write your own. Start with a counter you can read.

1. Back on your Linux machine, create `crates/qnx-resmgr/examples/my_counter.rs` in the repository with this content:

    ```rust
    //! Serves `/dev/counter` until killed: `cat /dev/counter` prints the count.
    //!
    //! Run as root (attaching under `/dev` needs it).

    use std::sync::atomic::{AtomicU64, Ordering};

    use qnx_resmgr::{Device, ResourceManager};

    struct Counter {
        count: AtomicU64,
    }

    impl Device for Counter {
        fn read(&self) -> qnx_ipc::Result<Vec<u8>> {
            let count = self.count.load(Ordering::SeqCst);
            Ok(format!("{count}\n").into_bytes())
        }
    }

    fn main() -> qnx_ipc::Result<()> {
        eprintln!("serving /dev/counter");
        let counter = Counter {
            count: AtomicU64::new(0),
        };
        ResourceManager::new("/dev/counter")?.run(counter)
    }
    ```

    The library may call your device from any thread, so `Device` requires `Send + Sync` and its methods take `&self`. An `AtomicU64` gives you a counter that's safe to change through `&self`.

2. In your first terminal, run it:

    ```sh
    cargo run -p qnx-resmgr --example my_counter --target $QNX_RUST_TARGET
    ```

    ```text
    OUTPUT_STAGE1_RUN
    ```

3. In the QNX shell in your second terminal, read it:

    ```shell
    cat /dev/counter
    ```

    ```text
    OUTPUT_STAGE1_CAT
    ```

4. Try writing to it:

    ```shell
    echo 5 > /dev/counter
    echo $?
    printf '5\n' > /dev/counter
    ```

    ```text
    OUTPUT_STAGE1_ECHO
    ```

    The device doesn't implement `write` yet, so the library's default answers with `ENOSYS` ("Function not implemented"). The `echo` on this target only reports a failed write through its exit status, 1, while `printf` prints the error. Any error your device returns reaches the client as an `errno` like this one.

5. Stop it:

    ```shell
    slay my_counter
    ```

---

## Accept writes
Duration: 5:00

Make `echo 5 > /dev/counter` add 5 to the count.

1. Replace `my_counter.rs` with this version. It adds a `write` method and an `EINVAL` constant:

    ```rust
    //! Serves `/dev/counter` until killed: `cat /dev/counter` prints the count and
    //! `echo 5 > /dev/counter` adds 5 to it.
    //!
    //! Run as root (attaching under `/dev` needs it).

    use std::sync::atomic::{AtomicU64, Ordering};

    use qnx_ipc::Error;
    use qnx_ipc_sys as sys;
    use qnx_resmgr::{Device, ResourceManager};

    const EINVAL: i32 = sys::EINVAL as i32;

    struct Counter {
        count: AtomicU64,
    }

    impl Device for Counter {
        fn read(&self) -> qnx_ipc::Result<Vec<u8>> {
            let count = self.count.load(Ordering::SeqCst);
            Ok(format!("{count}\n").into_bytes())
        }

        fn write(&self, data: &[u8]) -> qnx_ipc::Result<usize> {
            let text = std::str::from_utf8(data).map_err(|_| Error::Os(EINVAL))?;
            let n: u64 = text.trim().parse().map_err(|_| Error::Os(EINVAL))?;
            self.count.fetch_add(n, Ordering::SeqCst);
            Ok(data.len())
        }
    }

    fn main() -> qnx_ipc::Result<()> {
        eprintln!("serving /dev/counter");
        let counter = Counter {
            count: AtomicU64::new(0),
        };
        ResourceManager::new("/dev/counter")?.run(counter)
    }
    ```

    `write` gets each write's whole payload, here the text `5` plus a newline from `echo`. It returns how many bytes it took. Text that isn't a number gets `EINVAL` ("Invalid argument").

2. Run it again in your first terminal:

    ```sh
    cargo run -p qnx-resmgr --example my_counter --target $QNX_RUST_TARGET
    ```

3. In the QNX shell, add to the counter, read it, and send it something it can't parse:

    ```shell
    echo 5 > /dev/counter
    echo 2 > /dev/counter
    cat /dev/counter
    printf 'hello\n' > /dev/counter
    ```

    ```text
    OUTPUT_STAGE2
    ```

    The two writes added up to 7, and `hello` got the `EINVAL` your `write` returned.

4. Stop it:

    ```shell
    slay my_counter
    ```

---

## Add a devctl command
Duration: 6:00

Text works well for people and shell scripts. Programs often want something more direct, like reading the count as a number or resetting it. On QNX that's what `devctl()` is for: it sends a numbered command and a block of data to a device and gets data back.

A `devctl` command number packs four things, the way the `__DIOF`, `__DIOT` and `__DION` macros in `<devctl.h>` build it: the size of the data, a class, a command number, and the direction the data goes. `_DCMD_MISC` (`0x05`) is the class QNX recommends for your own commands. You'll add two commands:

* `DCMD_COUNTER_GET`, which is `__DIOF(_DCMD_MISC, 1, uint64_t)` in C: 8 bytes come back from the device.
* `DCMD_COUNTER_RESET`, which is `__DION(_DCMD_MISC, 2)` in C: no data either way.

1. Replace `my_counter.rs` with the finished version:

    ```rust
    //! Serves `/dev/counter` until killed: `cat /dev/counter` prints the count,
    //! `echo 5 > /dev/counter` adds 5 to it, and two `devctl` commands read the
    //! count as a number or reset it.
    //!
    //! Run as root (attaching under `/dev` needs it).

    use std::mem::size_of;
    use std::sync::atomic::{AtomicU64, Ordering};

    use qnx_ipc::Error;
    use qnx_ipc_sys as sys;
    use qnx_resmgr::{Device, ResourceManager};

    const EINVAL: i32 = sys::EINVAL as i32;
    const ENOTTY: i32 = sys::ENOTTY as i32;

    /// `_DCMD_MISC` from `<devctl.h>`: the class for your own commands.
    const DCMD_MISC: u32 = 0x05;

    /// `__DIOF(_DCMD_MISC, 1, uint64_t)`: the count comes back as a `u64`.
    const DCMD_COUNTER_GET: u32 =
        ((size_of::<u64>() as u32) << 16) | (DCMD_MISC << 8) | 1 | sys::_POSIX_DEVDIR_FROM;

    /// `__DION(_DCMD_MISC, 2)`: sets the count to 0, no data.
    const DCMD_COUNTER_RESET: u32 = (DCMD_MISC << 8) | 2 | sys::_POSIX_DEVDIR_NONE;

    struct Counter {
        count: AtomicU64,
    }

    impl Device for Counter {
        fn read(&self) -> qnx_ipc::Result<Vec<u8>> {
            let count = self.count.load(Ordering::SeqCst);
            Ok(format!("{count}\n").into_bytes())
        }

        fn write(&self, data: &[u8]) -> qnx_ipc::Result<usize> {
            let text = std::str::from_utf8(data).map_err(|_| Error::Os(EINVAL))?;
            let n: u64 = text.trim().parse().map_err(|_| Error::Os(EINVAL))?;
            self.count.fetch_add(n, Ordering::SeqCst);
            Ok(data.len())
        }

        fn devctl(&self, cmd: u32, data: &mut [u8]) -> qnx_ipc::Result<usize> {
            match cmd {
                DCMD_COUNTER_GET => {
                    let count = self.count.load(Ordering::SeqCst).to_ne_bytes();
                    let out = data.get_mut(..count.len()).ok_or(Error::Os(EINVAL))?;
                    out.copy_from_slice(&count);
                    Ok(count.len())
                }
                DCMD_COUNTER_RESET => {
                    self.count.store(0, Ordering::SeqCst);
                    Ok(0)
                }
                _ => Err(Error::Os(ENOTTY)),
            }
        }
    }

    fn main() -> qnx_ipc::Result<()> {
        eprintln!("serving /dev/counter");
        let counter = Counter {
            count: AtomicU64::new(0),
        };
        ResourceManager::new("/dev/counter")?.run(counter)
    }
    ```

    `devctl` gets the full command word and a buffer as big as the client's data. For `DCMD_COUNTER_GET` it writes the count into the buffer and returns how many bytes it wrote. Commands it doesn't know get `ENOTTY`, the usual answer for "not a command this device supports".

    Negative
    : Any program that can open the path can send any command, even if it opened it read-only. Check in your device what each command may change. Here, anyone who can open `/dev/counter` can reset it.

2. Run it in your first terminal:

    ```sh
    cargo run -p qnx-resmgr --example my_counter --target $QNX_RUST_TARGET
    ```

3. In the QNX shell, give it a count to work with:

    ```shell
    echo 40 > /dev/counter
    echo 2 > /dev/counter
    cat /dev/counter
    ```

    ```text
    OUTPUT_STAGE3_CAT
    ```

Leave the counter running. Next, a C program will use the new commands.

---

## Talk to the counter from C
Duration: 6:00

Any QNX program can use your device, whatever language it's written in. Here's a C client that reads the count with `DCMD_COUNTER_GET`, resets it with `DCMD_COUNTER_RESET`, and then reads the file with plain `read()`.

1. Leave the QNX shell for now:

    ```shell
    exit
    ```

2. Create `c/my_counter_client.c` in the repository:

    ```c
    /* Uses /dev/counter from C: reads the count with devctl(), resets it, then
     * reads the file with read(). */
    #include <devctl.h>
    #include <errno.h>
    #include <fcntl.h>
    #include <inttypes.h>
    #include <stdint.h>
    #include <stdio.h>
    #include <string.h>
    #include <unistd.h>

    /* The same command numbers as in the Rust device. */
    #define DCMD_COUNTER_GET   __DIOF(_DCMD_MISC, 1, uint64_t)
    #define DCMD_COUNTER_RESET __DION(_DCMD_MISC, 2)

    int main(void)
    {
        int fd = open("/dev/counter", O_RDWR);
        if (fd == -1) {
            perror("open /dev/counter");
            return 1;
        }

        uint64_t count = 0;
        int err = devctl(fd, DCMD_COUNTER_GET, &count, sizeof count, NULL);
        if (err != EOK) {
            fprintf(stderr, "DCMD_COUNTER_GET: %s\n", strerror(err));
            return 1;
        }
        printf("devctl: the count is %" PRIu64 "\n", count);

        err = devctl(fd, DCMD_COUNTER_RESET, NULL, 0, NULL);
        if (err != EOK) {
            fprintf(stderr, "DCMD_COUNTER_RESET: %s\n", strerror(err));
            return 1;
        }
        printf("devctl: reset the count\n");

        char text[32];
        ssize_t n = read(fd, text, sizeof text - 1);
        if (n == -1) {
            perror("read /dev/counter");
            return 1;
        }
        text[n] = '\0';
        printf("read: %s", text);

        close(fd);
        return 0;
    }
    ```

    In C, `devctl()` returns an error number directly (`EOK` on success) instead of setting `errno`.

3. Build it with QNX's C compiler, `qcc`, through the repository's helper:

    ```sh
    tools/build-c.sh c/my_counter_client.c "$CARGO_TARGET_DIR/my_counter_client"
    ```

4. Run it on the target. `tools/qnx-run` is the same script cargo uses: it copies the program over, runs it, and deletes it afterwards.

    ```sh
    tools/qnx-run "$CARGO_TARGET_DIR/my_counter_client"
    ```

    ```text
    OUTPUT_C
    ```

    The C macros and the Rust constants produce the same command numbers, so the Rust device recognized both commands.

5. Log back in, check the count from the shell, and stop the counter:

    ```sh
    qnx
    ```

    ```shell
    cat /dev/counter
    slay my_counter
    exit
    ```

    ```text
    OUTPUT_FINAL_CAT
    ```

The finished example is in the repository as [`crates/qnx-resmgr/examples/counter_device.rs`](https://github.com/jakethehoffer/qnx-ipc/blob/main/crates/qnx-resmgr/examples/counter_device.rs), and the C client as [`docs/codelab/write-qnx-resource-manager-rust/counter_client.c`](https://github.com/jakethehoffer/qnx-ipc/blob/main/docs/codelab/write-qnx-resource-manager-rust/counter_client.c), if you want to compare.

---

## How it works
Duration: 4:00

QNX's kernel does very little by itself: it schedules threads and passes messages. Almost everything else, including file systems, the network stack and drivers, is a separate process that receives messages. A resource manager is one of these processes.

Here's what happened when you ran `cat /dev/counter`:

1. When your program started, `ResourceManager::run` created a channel for messages and registered `/dev/counter` with QNX's process manager, which keeps track of which process owns which path.
2. `cat` called `open("/dev/counter")`. The C library asked the process manager who owns that path, connected to your program's channel, and sent it an open message. QNX's resource manager framework (`iofunc`) handled the open and checked permissions.
3. `cat` called `read()`. That became a read message to your program, and `cat` was blocked until the reply came back. The library called your `Device::read`, and the reply carried your bytes into `cat`'s buffer.
4. `write()` and `devctl()` work the same way: a message to your program, a call to your method, a reply with the result or the `errno`.

The library keeps the QNX parts safe: it owns the kernel objects and releases them, makes sure each message gets exactly one reply, and turns a panic in your device into an `EIO` error for the client while it keeps serving. The [architecture notes](https://github.com/jakethehoffer/qnx-ipc/blob/main/docs/architecture.md) explain how.

### Why a file interface matters

* **Every tool works.** `cat`, `echo`, shell scripts and programs in any language can use your device with nothing extra. You tested yours from the shell before writing a single line of client code.
* **One permission model.** The path has normal file permissions, so you control access the same way as for any file.
* **Drivers are just programs.** Your device ran as an ordinary process. If it crashes, it doesn't take the kernel down with it, and you can restart it.
* **Priority follows the request.** When a client sends a message, QNX runs the server's thread at the client's priority while it handles that message. Urgent requests get handled at urgent priority, without the server having to manage it.

---

## Clean up and next steps
Duration: 2:00

### Clean up

When you're done, stop the QNX target from your Linux machine:

```sh
tools/qemu-down.sh
```

### Where to go next

* Run the library's [vehicle-signals demo](https://github.com/jakethehoffer/qnx-ipc/blob/main/demo/README.md) with `tools/demo.sh`. It serves signals as files under `/dev/vehicle` and shows priority inheritance between a Rust server and Rust and C clients.
* Read the `Device` and `ResourceManager` documentation: `env -u RUSTC cargo doc --no-deps --workspace --target x86_64-unknown-linux-gnu --open`.
* Use `ResourceManager::spawn` to serve a device on a background thread while your program does other work.
* Learn more about resource managers in QNX's [Writing a Resource Manager](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.resmgr/topic/about.html) guide.

### How this codelab was made

The `qnx-ipc` library and this codelab were written by an AI coding agent (Claude) directed by Jake Hoffman. Every command and every code block here was run on QNX 8.0 under QEMU on 2026-11-15, and the output shown is what it printed.

Questions or problems? [Open an issue](https://github.com/jakethehoffer/qnx-ipc/issues).
