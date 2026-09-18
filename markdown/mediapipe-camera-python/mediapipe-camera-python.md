id: mediapipe-camera-python
title: Run MediaPipe face detection from a QNX camera with Python
summary: Install prebuilt MediaPipe on QNX and run live face detection with Raspberry Pi Camera Module 3.
categories: qnx, mediapipe, qnx-sensor-framework, AI, camera
tags: intermediate
difficulty: 2
status: published
authors: Elliott Mazzuca
feedback_link: https://github.com/qnx/codelabs/issues


# Run MediaPipe face detection from a QNX camera with Python

## Welcome
Duration: 2:00

This guide shows how to run a MediaPipe application on QNX using the prebuilt Python package.
It focuses on the QNX camera and display integration, not on teaching MediaPipe itself. Refer
to the [official MediaPipe documentation](https://ai.google.dev/edge/mediapipe/solutions/guide)
for details about its APIs and models.

You will run face detection from a Raspberry Pi Camera Module 3, save an annotated frame,
then show the live result through QNX Screen with SDL's hardware-accelerated OpenGL ES
renderer.

This is the short Python path. The existing
[MediaPipe Camera Sample](https://qnx.github.io/codelabs/mediapipe-camera-sample/)
remains available if you want to build the C++ examples from source.

### What you'll build

The data path has four parts:

1. The QNX Camera Library captures frames from the Raspberry Pi Camera Module 3. This codelab
   uses the camera's NV12 output, and the companion helper intentionally handles NV12 for this
   sample. It uses event mode, validates the native buffer ABI and returned format, and bounds
   each frame wait with the documented QNX pulse timeout APIs. Other Camera Library formats and
   capabilities are outside this codelab.
2. OpenCV converts NV12 to RGB and draws the face boxes and keypoints.
3. MediaPipe Tasks runs the BlazeFace short-range face detector. MediaPipe is the perception
   layer; it does not open the camera on this target.
4. PySDL2 sends the annotated RGB frames to SDL's exact `opengles2` renderer through QNX
   Screen. The demo verifies that the selected OpenGL ES renderer is Broadcom V3D and will not
   silently fall back to software.

---

## Prerequisites
Duration: 3:00

Use a [Raspberry Pi 5](https://www.raspberrypi.com/products/raspberry-pi-5/) with a
[Raspberry Pi Camera Module 3](https://www.raspberrypi.com/products/camera-module-3/).

The following platform components must already be present in the target image; this codelab does
not install them:

- A QNX 8.0.5 QSTI aarch64 image for Raspberry Pi 5 with its matching QNX APK repositories.
  Keep the repository configuration supplied with that image. It includes older core/extra
  fallback repositories; do not add the incompatible old 8.0.4 `qnx-extra` repository.
- The QNX Sensor Framework, which exposes the Raspberry Pi Camera Module 3 to the Camera
  Library through the image's `/etc/config/sensor/sensor_rpi5.conf` configuration.
- QNX Screen with the Raspberry Pi graphics stack, which SDL uses to create the live window.
- A display connected to the Pi for the live step.
- Network access from the target to its APK repositories and Google Cloud Storage.
- A shell on the target with `sudo` access.

Connect Camera Module 3 to **DISP0** with the Pi powered off. These instructions and both
companion demos select **camera unit 3**, as configured in the QNX 8.0.5 QSTI image.
Camera unit numbers depend on the image and configuration; they are not physical connector
numbers. The helper requires NV12 and rejects other frame formats.

---

## Install MediaPipe and the display dependencies
Duration: 4:00

On the QNX target, install MediaPipe, SDL, and the small tools used by the codelab:

```bash
sudo apk update
sudo apk add mediapipe python3-pip curl sdl2-compat
python3 -m pip install PySDL2==0.9.17 --break-system-packages
```

The `mediapipe` package supplies the MediaPipe Tasks Python API and its OpenCV and NumPy
dependencies. `sdl2-compat` supplies the QNX SDL library; PySDL2 is its Python binding.

Check the imports before continuing:

```bash
python3 -c 'import cv2, mediapipe, numpy, sdl2; print("OpenCV", cv2.__version__, "MediaPipe", mediapipe.__version__, "NumPy", numpy.__version__, "PySDL2", sdl2.__version__)'
```

Example output (package versions may vary):

```text
OpenCV 4.12.0 MediaPipe 0.10.26 NumPy 2.4.1 PySDL2 0.9.17
```

Repository updates may provide newer compatible versions.

---

## Get the companion files and face model
Duration: 4:00

Create a workspace and download the companion archive:

```bash
mkdir -p ~/mediapipe-camera-python
cd ~/mediapipe-camera-python
curl --fail --location \
  https://raw.githubusercontent.com/qnx/codelabs/main/markdown/mediapipe-camera-python/mediapipe-camera-python-companion.tar.gz \
  --output companion.tar.gz
tar -xzf companion.tar.gz
ls qnx_camera_helper.py demo_capture_faces.py demo_display_faces.py
```

The `ls` command should print all three file names. The demos import `qnx_camera_helper.py`; you
do not need to build any native code.

You are still in `~/mediapipe-camera-python`, so `mkdir -p models` creates
`~/mediapipe-camera-python/models`. Download the versioned MediaPipe BlazeFace short-range model
there and verify its checksum:

```bash
mkdir -p models
curl --fail --location \
  https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite \
  --output models/blaze_face_short_range.tflite
printf '%s  %s\n' \
  b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f \
  models/blaze_face_short_range.tflite | sha256sum -c -
```

Expected output:

```text
models/blaze_face_short_range.tflite: OK
```

This model is intended for short-range face detection and returns a face box plus six facial
keypoints. It does not identify a person. See the
[MediaPipe BlazeFace model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf)
for its intended use, limitations, and Apache 2.0 license.

View the available demo options:

```bash
python3 demo_capture_faces.py --help
python3 demo_display_faces.py --help
```

---

## Select Raspberry Pi Camera Module 3
Duration: 3:00

Check the image's configuration and currently running service before changing anything:

```bash
ls -l /etc/config/sensor/sensor_rpi5.conf
sudo pidin ar | grep '[s]ensor'
waitfor /dev/sensor/camera3 10
ls -l /dev/sensor/camera3
```

On QNX 8.0.5 QSTI, the default sensor service starts with
`/etc/config/sensor/sensor_rpi5.conf` and exposes camera3 when the camera is detected.
If these checks succeed, continue to capture; no service restart is needed. The next step
checks that the camera supplies NV12 frames.

If the configuration file or camera3 is missing, check the image version, DISP0 connection,
and sensor startup diagnostics before continuing.

---

## Capture and annotate frames
Duration: 4:00

Process 60 real-camera frames and save the last annotated RGB image:

```bash
cd ~/mediapipe-camera-python
python3 demo_capture_faces.py --camera-unit 3 --frames 60 --output annotated_face.png
```

Place a face in view of the camera. Example output:

```text
camera open; running 60 frames
  frame 0 faces=1 size=2304x1296
  ...
PROCESSED 60 frames in 2.4s = 25.1 FPS; max faces=1
wrote annotated_face.png
CLEAN EXIT
```

The frame size comes from the selected NV12 stream. Face counts and frame rate vary with
the scene and system load.

To inspect the result on your development computer, run this command there and replace
`TARGET_IP` with the Pi's address:

```bash
scp <TARGET_USER>@<TARGET_IP>:~/mediapipe-camera-python/annotated_face.png .
```

Open `annotated_face.png` on your development computer. Detected faces should have a green
bounding box and facial keypoints. If there are no annotations, place a face closer to the
camera and repeat the capture.

---

## Run the hardware-accelerated live display
Duration: 4:00

Run the live demo for up to 1,200 frames. Press Escape in the window to stop earlier:

```bash
cd ~/mediapipe-camera-python
python3 demo_display_faces.py --camera-unit 3 --frames 1200 --width 1152 --height 648
```

During setup, the demo lists the available SDL render drivers and then verifies the selected
one. Look for these lines:

```text
renderer selected name=opengles2 flags=0x...
GLES vendor='Broadcom' renderer='V3D ...' version='OpenGL ES ...'
window+renderer+texture created (1152x648), video_driver=qnx renderer=opengles2
```

Those checks establish that this run selected SDL's accelerated OpenGL ES path on the Broadcom
V3D driver. Requesting an accelerated flag alone would not be enough, so the demo fails if the
renderer name, acceleration flag, or V3D identity does not match.

While it runs, the window shows the camera image with face boxes and keypoints. The terminal
reports face counts, end-to-end FPS, process CPU use, and per-stage timing. On a normal stop it
releases MediaPipe, SDL, camera buffers, the viewfinder, and QNX pulse resources, then prints:

```text
CLEAN EXIT
```

A successful live run shows an updating QNX Screen window with face annotations, reports
the `opengles2` renderer backed by Broadcom `V3D`, and prints `CLEAN EXIT` when it stops.
Performance depends on the scene and system load.

---

## Troubleshooting
Duration: 4:00

### The camera shows color bars or `/dev/sensor/camera3` is missing

Check that Camera Module 3 is connected to DISP0, the target uses a QNX 8.0.5 QSTI
image, and the sensor service uses `/etc/config/sensor/sensor_rpi5.conf`. Color bars can indicate
a simulated stream. Verify the selected unit and its NV12 output against the active
configuration before proceeding. Other images may use different camera units; both demos
accept `--camera-unit` to select a verified compatible stream.

### A frame wait times out

The helper bounds each frame wait and reports a `TimeoutError` instead of hanging. Confirm the
QNX Sensor Framework service is running, then stop any other
application that has the selected camera unit open and try again.

### `opengles2` or V3D verification fails

The demo will not hide the failure with a software fallback. Confirm that QNX Screen is running
with the Raspberry Pi graphics stack and that the image provides `libEGL.so.1`,
`libGLESv2.so.1`, and the V3D driver. You can isolate display performance with the explicit
diagnostic mode:

```bash
python3 demo_display_faces.py --camera-unit 3 --frames 120 --renderer software
```

This proves the software display path only. It is not evidence of hardware acceleration.

### `ModuleNotFoundError: No module named 'sdl2'`

Install the Python binding again as your normal target user:

```bash
python3 -m pip install PySDL2==0.9.17 --break-system-packages
```

---

## Next steps
Duration: 1:00

You now have a complete QNX Camera Library to MediaPipe Tasks to hardware-accelerated display
pipeline. The companion demos expose model path, camera unit, frame count, frame timeout,
display size, and renderer options through `--help`, so you can adapt the run without editing
the camera integration.

For another task, keep the QNX camera and display helpers and replace `FaceDetector` with the
corresponding MediaPipe Tasks API and model. Keep capture in the QNX Camera Library; OpenCV's
`VideoCapture(0)` is not the camera path used by this target.
