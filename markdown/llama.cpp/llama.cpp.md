id: running-llama-cpp-qnx
title: Running llama.cpp on QNX 8.0 with Vulkan GPU Acceleration
summary: Install the llama.cpp packages on QNX 8.0, set up a Vulkan-capable QEMU target, load a model, and run LLM inference on CPU and on the GPU
categories: qnx, llama.cpp, vulkan, ai
tags: intermediate
difficulty: 2
status: published
authors: Elliott Mazzuca
feedback_link: https://github.com/qnx/codelabs/issues

# Running llama.cpp on QNX 8.0 with Vulkan GPU Acceleration

## Introduction

`llama.cpp` is a C/C++ implementation of LLM inference. It runs language models efficiently on CPUs and, where a GPU backend is available, can offload model layers to the GPU for faster token generation.

This codelab walks through getting `llama.cpp` running on **QNX 8.0**: installing the packages from the QNX repository, setting up a Vulkan-capable QEMU target, putting a model on the device, and running inference both CPU-only and with Vulkan GPU offload. It finishes with a CPU-vs-Vulkan benchmark so you can see the difference for yourself.

**What you will learn:**

* How to install `llama.cpp` and the Vulkan backend from the QNX package repository
* How to confirm the Vulkan device is detected on a QNX target
* How to launch a Vulkan-capable QNX QEMU target (virtio-gpu Venus)
* How to put a GGUF model on the target
* How to run inference on CPU and with Vulkan GPU offload
* How to benchmark CPU vs Vulkan and read the results correctly

**Prerequisites:**

* A QNX 8.0 target (this codelab uses an x86_64 QEMU target)
* The target's `apk` repositories configured to the QNX package repos
* For the GPU path: a Linux host able to run QEMU with a Venus-capable virtio-gpu
* Basic comfort with a shell and `ssh`/`scp`

> **Note on hardware:** The validated GPU path in this codelab is a QNX x86_64 QEMU target using virtio-gpu Venus. The CPU path works on any QNX 8.0 target. GPU acceleration on physical hardware depends on the QNX graphics stack available for that board and is outside the scope of this codelab.

---

## What you are installing — Overview

The packages split into a few pieces so you only pull in what you need:

| **Package** | **Purpose** |
| :--- | :--- |
| `llama.cpp` | Main command-line tools (`llama-cli`, `llama-completion`, `llama-bench`). |
| `llama.cpp-libs` | Private shared libraries and CPU backend used by the binaries. |
| `llama.cpp-vulkan` | Vulkan GPU backend (`libggml-vulkan.so`). Install this for GPU offload. |
| `llama.cpp-extras` | Additional utility binaries (tokenizer, quantize, gguf tools, and more). |
| `llama-server` | HTTP server for serving inference over a socket. |
| `llama.cpp-dev` | CMake / pkg-config files. Only needed if you build against llama.cpp. |

The Vulkan backend depends on a shader-compiler toolchain that is packaged separately. You install these alongside the Vulkan backend:

| **Package** | **Role** |
| :--- | :--- |
| `spirv-headers` | Khronos SPIR-V registry headers. |
| `spirv-tools` | SPIR-V tools and libraries. |
| `glslang` | Khronos GLSL front end and SPIR-V generator. |
| `shaderc` | Provides the shader tooling llama.cpp's Vulkan backend relies on. |

You do not need to understand the internals to use the packages. The QNX port carries a small number of QNX-specific source patches and enables the Vulkan backend; everything below works against the installed packages.

---

## Step 1 — Confirm your package repositories

The QNX images point `apk` at the QNX package repositories. Check your configuration:

```bash
cat /etc/apk/repositories
```

You should see the QNX repositories listed, for example:

```
https://repo.oss.qnx.com/8.0.3/core
https://repo.oss.qnx.com/8.0.3/extra
```

The `llama.cpp` packages live in the **extra** repository. Update the package index:

```bash
sudo apk update
```

Confirm the packages are visible before installing:

```bash
apk search llama.cpp
apk search shaderc spirv-headers spirv-tools glslang
```

> **If the search returns nothing:** the packages may not be published to your configured repository yet, or your repositories list does not include the `extra` repo. Confirm the `extra` repository line is present and that `apk update` succeeded.

---

## Step 2 — Install llama.cpp and the Vulkan backend

Install the shader toolchain, the core `llama.cpp` packages, and the Vulkan backend together:

```bash
sudo apk add \
  spirv-headers \
  spirv-tools \
  glslang \
  shaderc \
  llama.cpp \
  llama.cpp-libs \
  llama.cpp-vulkan \
  llama.cpp-extras \
  llama-server
```

If you only want CPU inference, you can omit `llama.cpp-vulkan` and the shader toolchain. The Vulkan packages are only needed for GPU offload.

Confirm the tools are installed:

```bash
llama-cli --help
```

---

## Step 3 — Confirm the Vulkan device is detected

List the backends and devices `llama.cpp` can see:

```bash
llama-cli --list-devices
```

On a working Vulkan target you should see a Vulkan device listed, for example:

```
Vulkan0: Virtio-GPU Venus
```

If you also have `vulkaninfo` available, you can confirm the Vulkan runtime independently:

```bash
vulkaninfo --summary
```

> **No Vulkan device listed?** See the Troubleshooting step at the end. The most common causes are a missing `llama.cpp-vulkan` package, a missing `qnx-vulkan` runtime, or a QEMU target that was not launched with a Venus-capable GPU.

---

## Step 4 — (GPU path) Launch a Vulkan-capable QEMU target

Skip this step if you are running on a target that already has a working Vulkan device. This step covers bringing up a QNX x86_64 QEMU target with virtio-gpu Venus on a Linux host.

The validated launch configuration is:

| Setting | Value |
| :--- | :--- |
| Memory | 20G |
| vCPUs | 8 |
| GPU | `virtio-gpu-gl,blob=on,hostmem=4G,venus=on` |
| Display | `egl-headless` |
| SSH port | 2227 |

A representative QEMU invocation (adapt paths to your image and SDP):

```bash
qemu-system-x86_64 \
  -machine q35 \
  -m 20G \
  -smp 8 \
  -display egl-headless \
  -device virtio-gpu-gl,blob=on,hostmem=4G,venus=on \
  -netdev user,id=net0,hostfwd=tcp::2227-:22 \
  -device virtio-net-pci,netdev=net0 \
  ... your QNX disk image and boot options ...
```

> **Host render server note:** Venus needs the host's `virgl_render_server` to be reachable. On some hosts the virglrenderer library expects the render server under `/usr/local/libexec`. If Venus fails to initialize, make sure the `virgl_render_server` binary on your host is on `PATH` or where your virglrenderer build expects it.

Once the target is booted, connect over SSH and re-confirm the device:

```bash
ssh -p 2227 qnx@localhost
vulkaninfo --summary
llama-cli --list-devices
```

---

## Step 5 — Put a model on the target

`llama.cpp` reads models in **GGUF** format. Models are not part of the packages; you download a GGUF file and copy it onto the target.

Start with a small quantized model to prove the setup, then move to a larger one. This codelab uses Qwen2.5 0.5B and 1.5B in `Q4_K_M` quantization.

GGUF models are hosted on sites like Hugging Face. The simplest way to get one is to download the `.gguf` file directly on your host, no special tooling required. You can download it from the model's page in a browser, or fetch the direct file URL with `curl`/`wget`:

```bash
curl -L -o /tmp/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf \
  https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
```

> **Optional:** If you already have the Hugging Face CLI (`pip install huggingface_hub`), you can instead run `huggingface-cli download bartowski/Qwen2.5-1.5B-Instruct-GGUF Qwen2.5-1.5B-Instruct-Q4_K_M.gguf --local-dir /tmp`. This is just a convenience; it is a host-side Python tool and is not part of the QNX packages.

Copy the model to the target:

```bash
scp -P 2227 \
  /tmp/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf \
  qnx@localhost:/var/home/qnx/
```

> **Alternative:** If your QNX target can reach the internet directly, you can run the same `curl` command from Step 5 on the target itself and skip the `scp` step. The `scp` approach is useful when the target has no internet access, or when you already have the model downloaded on your host.

Verify the copy on the target:

```bash
sha256sum /var/home/qnx/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
```

The hash should match the file you downloaded from the source. (For the 1.5B model above, the validated SHA-256 was `1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370`.)

> **Model choice guidance:** Use a small GGUF first to prove the package and runtime setup. `Q4_K_M` quantization is a good balance of quality and memory use. Larger models tend to show a clearer GPU generation benefit.

---

## Step 6 — Run inference on CPU

GPU offload is controlled at runtime with the `-ngl` flag (number of GPU layers):

| Mode | Option | Meaning |
| :--- | :--- | :--- |
| CPU-only | `-ngl 0` | Keep all model layers on the CPU. |
| Vulkan offload | `-ngl 99` | Offload as many model layers as possible to the GPU. |

Run a CPU-only completion first:

```bash
llama-completion \
  -m /var/home/qnx/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  -p "Hello from QNX. Say one short sentence." \
  -n 32 \
  -ngl 0
```

This works on any QNX 8.0 target, no GPU required. If it generates text, your model and runtime are good.

---

## Step 7 — Run inference with Vulkan GPU offload

Now run the same model with layers offloaded to the GPU:

```bash
env MESA_LOG_FILE=/tmp/llama-mesa.log \
llama-completion \
  -m /var/home/qnx/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  -p "Hello from QNX Vulkan. Say one short sentence." \
  -n 32 \
  -ngl 99
```

You should see the model report that it is using the Vulkan device and offloading layers, for example:

```
using device Vulkan0 (Virtio-GPU Venus)
load_tensors: offloading output layer to GPU
load_tensors: offloading 23 repeating layers to GPU
load_tensors: offloaded 25/25 layers to GPU
Vulkan0 model buffer size = 373.71 MiB
Vulkan0 KV buffer size = 384.00 MiB
```

followed by generated text.

> **Harmless log noise:** You may see `MESA-VIRTIO: debug: failed to dup sync fd`. In the validated setup this did not prevent device detection, offload, or inference. Setting `MESA_LOG_FILE` (as above) keeps this noise out of your terminal.

---

## Step 8 — Run the HTTP server

`llama-server` exposes inference over HTTP. Start it bound to localhost:

```bash
llama-server \
  -m /var/home/qnx/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  -ngl 99 \
  --host 127.0.0.1 \
  --port 18081
```

From another shell on the target, send a completion request:

```bash
curl http://127.0.0.1:18081/completion \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello from the server!", "n_predict":32}'
```

You will get a JSON response whose `content` field holds the generated text, along with timing fields (`prompt_per_second`, `predicted_per_second`) you can use to gauge throughput.

---

## Step 9 — Benchmark CPU vs Vulkan

Use `llama-bench` to compare CPU and Vulkan on the same model. Run CPU-only:

```bash
llama-bench -m /var/home/qnx/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf -ngl 0
```

Then Vulkan offload:

```bash
llama-bench -m /var/home/qnx/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf -ngl 99
```

`llama-bench` reports two phases separately, and they behave differently:

* **`pp` (prompt processing / prefill)** — reading the prompt into the model
* **`tg` (token generation / decode)** — producing new tokens

In the validated QEMU/Venus setup, the GPU win was on **token generation**, while **prompt processing** was sometimes faster on CPU. That split is expected in this environment: prefill is sensitive to offload overhead and CPU-side scheduling, while generation benefits more from the GPU path once layers are resident on the device.

Representative results from the validated setup:

**Qwen2.5 0.5B, token generation (tg256):**

| Mode | tg256 |
| :--- | :--- |
| CPU `-ngl 0` | 12.41 tok/s |
| Vulkan `-ngl 99` | 19.19 tok/s |

About 1.55x faster generation with Vulkan.

**Qwen2.5 1.5B (llama-bench, 128):**

| Mode | pp128 (prefill) | tg128 (generation) |
| :--- | :--- | :--- |
| CPU `-ngl 0` | 27.77 tok/s | 6.48 tok/s |
| Vulkan `-ngl 99` | 16.42 tok/s | 10.29 tok/s |

Here CPU was faster for prompt processing (27.77 vs 16.42 tok/s), but Vulkan was about 1.59x faster for token generation (10.29 vs 6.48 tok/s). When you compare runs, make sure you are comparing the same phase.

---

## Troubleshooting

### No Vulkan device

Run:

```bash
vulkaninfo --summary
llama-cli --list-devices
```

Then check:

* `llama.cpp-vulkan` is installed (`apk info -e llama.cpp-vulkan`)
* the `qnx-vulkan` runtime is installed
* on QEMU, the target was launched with a Venus-capable GPU (`virtio-gpu-gl,...,venus=on`)
* the Vulkan/Screen runtime packages are present

### Inference hangs during model load

A bad GPU state can stall during model upload. Recover by:

1. Rebooting the target
2. Relaunching with the known-good Venus configuration (Step 4)
3. Re-running `vulkaninfo --summary` and `llama-cli --list-devices`

### Mesa debug noise

Keep stderr readable by redirecting Mesa logs:

```bash
env MESA_LOG_FILE=/tmp/llama-mesa.log llama-completion ...
```

### Converting models is not included

The `convert_hf_to_gguf.py` converter is not packaged on QNX yet, because its Python ML dependency stack is not currently available. Use models that are already in **GGUF** format (for example, the `Q4_K_M` GGUF files used in this codelab). Treat HF-to-GGUF conversion as a host-side step you do before copying the model to the target.

---

## Summary

You installed and ran `llama.cpp` on QNX 8.0, with both CPU and Vulkan GPU inference. Key points to carry forward:

* Install `llama.cpp`, `llama.cpp-libs`, and `llama.cpp-extras` for the tools; add `llama.cpp-vulkan` plus the shader toolchain (`spirv-headers`, `spirv-tools`, `glslang`, `shaderc`) for GPU offload
* Confirm the device with `llama-cli --list-devices` before expecting GPU acceleration
* GPU offload is controlled at runtime with `-ngl`: `-ngl 0` for CPU, `-ngl 99` for full Vulkan offload
* Models are GGUF files you copy onto the target; the converter is not packaged, so use pre-converted GGUF models
* `llama-bench` reports prefill (`pp`) and generation (`tg`) separately; in the validated QEMU/Venus setup the Vulkan win was on token generation
* For the GPU path on QEMU, launch with a Venus-capable virtio-gpu and confirm with `vulkaninfo --summary`
