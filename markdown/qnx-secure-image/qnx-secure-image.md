id: qnx-secure-image
title: Lock a QNX 8.0 system to its design with a security policy
summary: Teach secpolgenerate what your system does, check what it learned, boot QNX 8.0 in fully secure mode, prove the kernel runs your policy, and find its refusals in a kernel trace. Run from scratch on QNX 8.0 x86_64 in QEMU by the author and checked again from an empty folder by AI agents that had never seen it.
categories: Security
tags: intermediate
difficulty: 3
status: published
authors: Dmytro Topka
feedback_link: https://github.com/DmitriyTopka/qnx-blueprint/issues


# Lock a QNX 8.0 system to its design with a security policy

## Welcome
Duration: 2:00

On QNX 8.0 a security policy decides which process may open a channel to
which. Booted with `mkqnximage --secpol=secure`, the kernel holds every
process to the policy, and a connection it does not allow fails with
`Operation not permitted`. That turns a design rule like "display gets its
position from nav, never from gps directly" into something the kernel
enforces.

The hard part is the policy. `secpolgenerate` can learn one by watching the
system, but it learns whatever happened, bugs included, and there are things
it cannot see at all. In this codelab you will:

1. build a small five-process system and an image in learning mode;
2. teach `secpolgenerate` the system, and watch one bad run poison the policy;
3. read and check what it learned;
4. add what learning cannot see;
5. boot a fully secure image and prove the kernel runs your policy, byte for byte;
6. watch the kernel refuse a backdoor, and find each refusal in a kernel trace.

No hardware is needed. The outputs here come from a run from scratch on
5 November 2026 with QNX SDP 8.0 and QEMU; a second reader, an AI agent with
no access to our notes, then followed the codelab word for word, and its report is in
[docs/codelab/secure-image/OUTSIDER_RUN.md](https://github.com/DmitriyTopka/qnx-blueprint/blob/main/docs/codelab/secure-image/OUTSIDER_RUN.md).
Some numbers change from run to run: the length of the learned policy, the
order of types in a rule, the md5 of your policy and how many refusals a
trace catches. Each step says what must hold. Long tool outputs are
shortened to the lines that matter.

Positive
: Want to see it first? [A recorded run of this whole codelab](https://youtu.be/OHoixOUmPH8)
(6 minutes, QNX 8.0 in QEMU, real output; builds and boots are sped up).

---

## Prerequisites
Duration: 5:00

- QNX SDP 8.0 installed with QNX Software Center (the free non-commercial
  license is enough), and `source qnxsdp-env.sh` done in your shell, so that
  `qcc`, `mkqnximage` and `secpolcompile` are on the path.
- `qemu-system-x86_64` on the same host.
- An ssh key pair, here `$HOME/.ssh/id_ed25519.pub`.
- The demo system from the Blueprint repository: one C file that becomes five
  processes, and the contract that says who may talk to whom.

Every step below starts in the lab folder, `$LAB`. Set it once per shell:

```console
git clone https://github.com/DmitriyTopka/qnx-blueprint.git
mkdir secure-lab && cd secure-lab && export LAB=$PWD
cp ../qnx-blueprint/demo/cockpit/cockpit.c ../qnx-blueprint/demo/cockpit/blueprint.yaml .
```

The design, from `blueprint.yaml`:

```yaml
allow:
  - display -> nav
  - display -> camera
  - display -> logger
  - nav -> gps
  - nav -> logger
```

Display must never read gps directly. The program has a switch,
`COCKPIT_FAULT=backdoor`, that makes it do exactly that, so you can see what
the policy does with it.

Positive
: Optional: the `blueprint` command, used in two steps to check policies and
traces against the contract. Each of those steps also shows how to do it by
hand. Install it in a virtual environment: on Ubuntu 22.04 the system pip
installs it as an empty `UNKNOWN` package without saying so.

```console
python3 -m venv $LAB/.venv && $LAB/.venv/bin/pip install $LAB/../qnx-blueprint
export PATH=$LAB/.venv/bin:$PATH && blueprint --help
```

---

## Build the system
Duration: 2:00

The five roles are one binary. It decides what to be from its own name.

```console
cd $LAB
qcc -Vgcc_ntox86_64 -o cockpit cockpit.c
```

No extra libraries, a second or two. The roles are gps, nav, camera, logger
and display. Each server registers a name with `name_attach()`, and each
client finds its servers with `name_open()`.

---

## Build an image in learning mode
Duration: 5:00

`mkqnximage --secpol=develop` builds an image that starts `secpolgenerate`.
It records what every process does and writes it down as policy rules.
Nothing is refused yet.

A stock image already has `tracelogger`. Add the five roles, `traceprinter`
and the `sshd-auth` helper that sshd needs:

```console
mkdir -p $LAB/dev/local/snippets && cd $LAB/dev
for r in gps nav camera logger display; do
  echo "[perms=755] bin/$r=$LAB/cockpit" >> local/snippets/system_files.custom
done
echo '[perms=755] bin/traceprinter=usr/bin/traceprinter' >> local/snippets/system_files.custom
echo '[perms=555] /usr/libexec/sshd-auth=usr/libexec/sshd-auth' >> local/snippets/ifs_files.custom
mkqnximage --type=qemu --arch=x86_64 --secpol=develop \
  --ssh-ident=$HOME/.ssh/id_ed25519.pub --build
```

The build takes 20 to 30 seconds. Boot it in the background:

```console
cd $LAB/dev
qemu-system-x86_64 -m 1G -smp 2 -cpu max -display none -serial file:serial.log \
  -kernel output/ifs.bin -drive file=output/disk-qemu.vmdk,if=ide,id=drv0 \
  -netdev user,id=net0,hostfwd=tcp::2230-:22 -device virtio-net-pci,netdev=net0 &
```

To reboot this image later, run `kill %1` in the same shell (or kill that
qemu process) and start the same line again.

When `serial.log` says `Startup complete` (about 10 seconds), open a second
terminal for an interactive session on the target, and keep this one for the
host: QEMU is its job, so `kill %1` only works here. The `#` lines below are
typed in the second terminal:

```console
ssh -p 2230 root@localhost
# ls /dev/secpolgenerate
control  errors  policy  request  unused
```

`/dev/secpolgenerate` is the learner. `policy` is what it has learned so far.

Negative
: Type the target commands in an interactive ssh session. Lines that end in
`&` keep processes running, and a one-shot `ssh host "command"` waits for
them and never returns.

---

## Teach it the system
Duration: 8:00

Start every process with a type, the name the policy will use for it.
`on -T` sets the type at start:

```console
# on -T logger_t logger & on -T gps_t gps & on -T camera_t camera & on -T nav_t nav & sleep 1
# COCKPIT_FAULT=ok on -T display_t display 5
display 00: route via pos 50.450 | frame 1
display 01: route via pos 50.451 | frame 2
display 02: route via pos 50.452 | frame 3
display 03: route via pos 50.453 | frame 4
display 04: route via pos 50.454 | frame 5
# slay -Q -s KILL gps nav camera logger
```

The shell also prints job lines such as `[1] 704534` when a server starts
and `[4] + Killed ...` after `slay`. They are not shown here; ignore them.

Do everything else the finished system will have to do, because anything not
learned now is refused later. From the host terminal, log in once more and
copy a file both ways:

```console
ssh -p 2230 root@localhost true
echo hi > /tmp/up.txt && scp -P 2230 /tmp/up.txt root@localhost:/tmp/
scp -P 2230 root@localhost:/tmp/up.txt /tmp/down.txt
```

On the target, run `pidin` once (`slay` already ran above). Then look at
what display learned:

```console
# pidin
# grep -A4 "^allow display_t self:ability" /dev/secpolgenerate/policy | grep channel_connect
    channel_connect:logger_t,camera_t,nav_t
```

That is the design: display may connect to logger, camera and nav. The
order of the three can differ in your run; the set must not.

Negative
: Do not run `tracelogger` while it learns. `secpolgenerate` learns from the
same kernel trace events, and a running tracelogger takes them away. The
policy then declares your types and has no rules for them. The QNX
documentation does not say so.

---

## Watch one bad run poison the policy
Duration: 5:00

Now run the build with the backdoor once, still in learning mode:

```console
# on -T logger_t logger & on -T gps_t gps & on -T camera_t camera & on -T nav_t nav & sleep 1
# COCKPIT_FAULT=backdoor on -T display_t display 3
display 00: route via pos 50.450 | frame 1
display 01: route via pos 50.451 | frame 2
display 02: route via pos 50.452 | frame 3
# slay -Q -s KILL gps nav camera logger
# grep -A4 "^allow display_t self:ability" /dev/secpolgenerate/policy | grep channel_connect
    channel_connect:logger_t,camera_t,gps_t,nav_t
```

`gps_t` is in now. The backdoor worked, so the learner wrote it down, and a
secure image built from this policy would allow it forever. Keep this
poisoned policy for the next step:

```console
# cat /dev/secpolgenerate/policy > /tmp/learned-backdoor.secpol
```

```console
scp -P 2230 root@localhost:/tmp/learned-backdoor.secpol $LAB/
```

Learning keeps everything until the next boot. Reboot the image (`kill %1`
and the same qemu line, from `$LAB/dev`) and log in again. The learner
starts empty:

```console
# grep -A4 "^allow display_t self:ability" /dev/secpolgenerate/policy | grep channel_connect || echo "display_t has no rules yet"
display_t has no rules yet
```

Now go back to **Teach it the system** and do it again, with the healthy
build only (`COCKPIT_FAULT=ok`), including the extra logins and the scp.
Do not run the backdoor this time. Then save the clean policy:

```console
# cat /dev/secpolgenerate/policy > /tmp/learned.secpol
```

```console
scp -P 2230 root@localhost:/tmp/learned.secpol $LAB/
```

---

## Check what it learned against the design
Duration: 3:00

The learned policy has over 500 lines (534 and 541 in our two runs). Most
rules are for QNX's own services. The lines for your types are the ones to
read, and the question for each `channel_connect` is: is this edge in the
design?

By hand, list every type each of your processes may connect to:

```console
cd $LAB
grep -A4 -E "^allow (gps|nav|camera|logger|display)_t self:ability" learned.secpol | grep -E "allow|channel_connect"
```

With Blueprint, against the contract:

```console
$ blueprint secpol -c blueprint.yaml --check learned.secpol
PASS: learned.secpol 0 errors, 0 warnings against blueprint.yaml
$ blueprint secpol -c blueprint.yaml --check learned-backdoor.secpol
FAIL  [secpol] policy lets display connect to gps, which the contract forbids
      learned-backdoor.secpol line 202 allows display_t to connect to gps_t. The kernel will not stop
      this path, so a build that adds it only shows up in a trace. Remove the rule, or add
      'display -> gps' to the contract if the design changed.
FAIL: learned-backdoor.secpol 1 error, 0 warnings against blueprint.yaml
```

The line number can differ in your run. Run this check in CI on every
learned policy before it goes into an image.

---

## Boot it secure, and see what learning missed
Duration: 8:00

Build a second image in secure mode from the clean policy. Keep a way back
first: if a secure image refuses ssh, the console is all you have, so start
a second sshd in debug mode that writes to the console:

```console
mkdir -p $LAB/sec/local/snippets && cd $LAB/sec
cp $LAB/dev/local/snippets/*.custom local/snippets/
echo 'on -T sshd_t /system/bin/sshd -d -e -p 2200 -f /system/etc/ssh/sshd_config >/dev/ser1 2>&1 &' > local/snippets/post_start.custom
secpolcompile -o /tmp/check.bin $LAB/learned.secpol
mkqnximage --type=qemu --arch=x86_64 --secpol=secure --policy=$LAB/learned.secpol \
  --ssh-ident=$HOME/.ssh/id_ed25519.pub --build
```

`secpolcompile` here is only a syntax check; `mkqnximage` compiles the
policy into the image itself. Stop the learning image and boot the secure
one, with port 2231 for ssh and 2232 for the debug sshd:

```console
cd $LAB/sec && kill %1
qemu-system-x86_64 -m 1G -smp 2 -cpu max -display none -serial file:serial.log \
  -kernel output/ifs.bin -drive file=output/disk-qemu.vmdk,if=ide,id=drv0 \
  -netdev user,id=net0,hostfwd=tcp::2231-:22,hostfwd=tcp::2232-:2200 \
  -device virtio-net-pci,netdev=net0 &
```

The normal ssh login works, because the learner saw it. The first login can
take up to 20 seconds; wait for the prompt. Two things fail. Tracing:

```console
# tracelogger -w -s 1 -f /tmp/t.kev
tracelogger: tracelog_start: Operation not permitted
```

And the debug sshd: `ssh -p 2232 root@localhost` just disconnects, and
`serial.log` shows why:

```console
ssh -p 2232 root@localhost
Connection closed by 127.0.0.1 port 2232
grep initgroups $LAB/sec/serial.log
initgroups: root: Operation not permitted
```

`sshd -d` serves one connection and exits, so a second try gets
`Connection reset by peer`; reboot the image to try again.

Tracing cannot be learned, for the reason in the warning two steps back: the
learner and tracelogger use the same trace events. The debug sshd started
from `post_start` runs a path the learner never saw. Write the final policy
as the learned one plus the tracing rule:

```console
cd $LAB
cp learned.secpol secure.secpol
cat >> secure.secpol <<'EOF'

# Added by hand: secpolgenerate cannot learn tracing, so let the root shell trace.
allow user_root_t self:ability {
    trace
};
EOF
```

If you want the debug sshd too, also add
`allow sshd_t self:ability { setgid:0 setuid:0 };`. The run shown here leaves
it out; leave it out of a production image.

Rebuild and boot again, still in `$LAB/sec`:

```console
cd $LAB/sec && kill %1
mkqnximage --type=qemu --arch=x86_64 --secpol=secure --policy=$LAB/secure.secpol \
  --ssh-ident=$HOME/.ssh/id_ed25519.pub --build
qemu-system-x86_64 -m 1G -smp 2 -cpu max -display none -serial file:serial.log \
  -kernel output/ifs.bin -drive file=output/disk-qemu.vmdk,if=ide,id=drv0 \
  -netdev user,id=net0,hostfwd=tcp::2231-:22,hostfwd=tcp::2232-:2200 \
  -device virtio-net-pci,netdev=net0 &
```

Negative
: In an earlier run on x86_64, from a shorter learning session, the normal
ssh login itself failed this way until `sshd_t` got `setgid:0 setuid:0`.
aarch64 never needed it. If your secure image drops ssh after the key
exchange, the debug sshd on the console tells you which ability is missing.

---

## Prove the kernel runs your policy
Duration: 3:00

Two checks on the running secure image. Nothing is learning:

```console
# ls /dev/secpolgenerate
ls: /dev/secpolgenerate: No such file or directory
```

And the policy the kernel loaded at boot is the file you wrote. On the host
(on macOS use `md5 -q` instead of `md5sum`):

```console
$ secpolcompile -o /tmp/secure.bin $LAB/secure.secpol && md5sum /tmp/secure.bin
6c63e5e9d49af0e9b5f0c21db923d32d  /tmp/secure.bin
```

On the target:

```console
# md5sum /proc/boot/secpol.bin
6c63e5e9d49af0e9b5f0c21db923d32d  /proc/boot/secpol.bin
```

Your sum will be different from ours; the two must be the same as each
other. Put this pair in your release checklist: it is the shortest proof
that the image you ship enforces the policy you reviewed.

---

## Watch the kernel refuse
Duration: 3:00

Start the servers with their types and run display three ways:

```console
# on -T logger_t logger & on -T gps_t gps & on -T camera_t camera & on -T nav_t nav & sleep 1
# COCKPIT_FAULT=ok on -T display_t display 2
display 00: route via pos 50.450 | frame 1
display 01: route via pos 50.451 | frame 2
# COCKPIT_FAULT=backdoor on -T display_t display 2
cockpit: cannot open cockpit-gps: Operation not permitted
# COCKPIT_FAULT=ok display 2
cockpit: cannot open cockpit-nav: Operation not permitted
```

The healthy build runs. The backdoor gets `EPERM` from `name_open()`,
because the policy has no `channel_connect` from `display_t` to `gps_t`.
And display started without its type is refused even its own path to nav:
in secure mode a process without a type gets nothing, so every start script
needs its `on -T`. Leave the servers running for the next step.

---

## Find the refusals in a kernel trace
Duration: 5:00

The application prints one error. The kernel trace shows every refusal, and
you can check for them in CI. Start the trace and the backdoor build on one
line, so the trace is running when display tries (the `trace` ability you
added makes this work):

```console
# tracelogger -w -s 6 -f /tmp/backdoor.kev & sleep 1; COCKPIT_FAULT=backdoor on -T display_t display 2
cockpit: cannot open cockpit-gps: Operation not permitted
```

Wait for the six seconds to pass. A refused connection is a `ConnectAttach`
kernel call that returns -1 with errno 1, `EPERM`:

```console
# traceprinter -f /tmp/backdoor.kev | grep -c "CONNECT_ATTACH.*errno:1"
182
# traceprinter -f /tmp/backdoor.kev | grep -m1 "CONNECT_ATTACH.*errno:1"
t:0x51f9c73a9 CPU:01 KER_EXIT        :CONNECT_ATTACH/39  ret_val:-1, errno:1
fprintf() failed with 32 (Broken pipe)
# slay -Q -s KILL gps nav camera logger
```

The count depends on how many of display's retries the trace caught: the
program tries `name_open()` 200 times, 20 ms apart. With the one-line start
above we saw 89, 182 and 193; with a trace started by hand a few seconds
earlier, 104 and 84. What must hold is that it is not zero. Copy the trace to
the host and let Blueprint say who tried to reach whom:

```console
cd $LAB && scp -P 2231 root@localhost:/tmp/backdoor.kev .
blueprint check backdoor.kev -c blueprint.yaml
FAIL  [kernel-denied] the kernel refused display's connection to gps, which the contract forbids
```

Our trace is in `docs/codelab/secure-image/backdoor.kev.gz`. A refusal of an
edge the contract allows would mean the policy and the design disagree, or
a process was started without its type.

---

## What you learned
Duration: 1:00

- `secpolgenerate` writes down whatever happened, so one bad run puts a
  backdoor into the policy until the next boot. Learn only from builds you
  trust, and check the result against the design before it ships.
- It cannot learn tracing while tracing, and it cannot learn paths it never
  saw, like a debug sshd. Those rules are yours to add, with a comment.
- `md5sum /proc/boot/secpol.bin` on the target against the compiled file on
  the host proves which policy the kernel enforces.
- In secure mode a refused connection is `ConnectAttach` returning `EPERM`,
  visible in the kernel trace, so CI can catch a backdoor the policy blocked
  before someone ships the same build without the policy.

The companion codelab,
[Check a QNX system's architecture on every build](https://dmitriytopka.github.io/qnx-blueprint/codelab/),
checks the same contract against kernel traces in CI.
