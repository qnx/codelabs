summary: Build the QNX OpenCV port and display live camera video with one fixed rectangle on QNX Everywhere.

id: opencv-minimal

categories: QNX, OpenCV

environments: Web

status: Draft

authors: Bill Xie-Li

# Minimal OpenCV on QNX Everywhere

## Overview

This codelab describes how to build and install the QNX OpenCV port on an Ubuntu development host, compile a minimal C++ camera application, and run it on a Raspberry Pi 5 using a configured QNX Everywhere target image.

The application uses the QNX Camera API to receive frames, OpenCV to convert the image and draw one fixed green rectangle, and QNX Screen to display the processed video on the target's connected display.

### What you'll learn

- Prepare a separate workspace for OpenCV sources and installed libraries.
- Build the QNX OpenCV port.
- Compile `OpenCv_Min.cpp` using the QNX SDP 8.0 toolchain.
- Deploy the application and its shared libraries.
- Verify camera capture, drawing, display, and shutdown.

### Draft validation status

The author has compiled the example for AArch64 and reported working camera video and rectangle display. Correct color reproduction remains under investigation. The latest conversion changes are not yet confirmed as a fix.

The original write-up reports QNX “8.05”, Raspberry Pi 5, and a Logitech “x920” camera. Confirm the exact image release and camera model before publication.

This example does not perform object detection. The rectangle has a fixed position and size. ArUco, pose estimation, QPP, ROS, and recording are outside its scope.

## Prerequisites

### Ubuntu development host

- QNX SDP 8.0 with an AArch64 compiler and the Camera and Screen development headers/libraries.
- Git, Make, and the build dependencies specified by the selected QNX OpenCV port revision.
- The SDP package `com.qnx.qnx800.target.screen.img_codecs`, as required by the port README.
- Network access to the target for deployment.

### QNX Everywhere target

This codelab assumes the target is already configured with:

- Sensor Framework and a running sensor service.
- Camera Framework / CamAPI (`libcamapi`).
- USB camera support and the USB stack.
- An active sensor configuration for the connected camera.
- Screen Graphics Subsystem and a connected display.

These are prerequisites, not components installed by this codelab. Screen is required for this displayed-video example, although headless OpenCV processing does not require display output.

The provided example requests camera unit 5, 640×480 frames, and `CAMERA_FRAMETYPE_YCBYCR` (YUY2). Verify these settings against the target configuration and camera capabilities. Do not assume every QNX Everywhere image uses the same camera unit.

### Python and NumPy

The application itself is C++ and does not use Python or NumPy at runtime. However, the upstream port's documented build workflow includes Python 3.11 and NumPy. This draft follows that workflow rather than assuming those build steps can be omitted. A separately validated C++-only port configuration could simplify this section later.

## Prepare a Separate OpenCV Workspace

Run the following on Ubuntu, not on the Pi:

```bash
mkdir -p "$HOME/opencv-validation"
cd "$HOME/opencv-validation"
export STAGING_FOLDER="$HOME/opencv-validation/stage"
mkdir -p "$STAGING_FOLDER"
```

Keep this workspace outside the codelab repository:

```text
~/opencv-validation/
    build-files/
    opencv/
    numpy/
    muslflt/
    env/
    stage/

<codelab-repository>/
    markdown/opencv-minimal/
        opencv-minimal.md
        OpenCv_Min.cpp
        OpenCv_Min.hpp
```

Installing dependencies here does not add them to the codelab repository. Commit only the tutorial and example files.

### Reuse an existing installation

If OpenCV has already been staged, inspect it before rebuilding:

```bash
find "$STAGING_FOLDER" -type f -path '*/opencv2/core.hpp'
find "$STAGING_FOLDER/aarch64le" \
    \( -name 'libopencv_core.so*' -o -name 'libopencv_imgproc.so*' \) -print
```

If compatible headers and AArch64 libraries are present, skip to compilation. Do not use Ubuntu-native OpenCV libraries to link a QNX target executable.

## Obtain the QNX OpenCV Port

On Ubuntu:

```bash
cd "$HOME/opencv-validation"
git clone https://github.com/qnx-ports/build-files.git
git clone https://github.com/qnx-ports/numpy.git
git clone https://github.com/qnx-ports/opencv.git
git clone https://github.com/qnx-ports/muslflt.git

cd numpy
git submodule update --init --recursive
cd ..
```

Skip individual clone commands if the repositories already exist. Do not overwrite an existing validated checkout.

Read the build instructions for the checked-out revision:

```bash
cat build-files/ports/opencv/README.md
```

Record the revisions used for reproducibility:

```bash
for repo in build-files numpy opencv muslflt; do
    printf '%s: ' "$repo"
    git -C "$repo" rev-parse HEAD
done
```

## Prepare the Host Build Environment

The following Python setup is adapted from the port README. Check compatibility with the Ubuntu release before adding the third-party deadsnakes repository. On a managed host, follow the organization's package-source requirements.

```bash
sudo apt-get update
sudo apt-get install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt-get update
sudo apt-get install -y \
    python3.11-dev python3.11-venv python3.11-distutils gfortran

cd "$HOME/opencv-validation"
python3.11 -m venv env
source env/bin/activate
pip install -U pip Cython==0.29.35 wheel requests

source "$HOME/qnx800/qnxsdp-env.sh"
export STAGING_FOLDER="$HOME/opencv-validation/stage"
which q++
```

Replace `$HOME/qnx800` if the SDP is installed elsewhere. Resolve missing host build tools using the selected port revision's prerequisites before continuing.

## Build and Install the Port

All commands in this step run on Ubuntu from the separate workspace.

### Build muslflt

The port README recommends staging muslflt for consistent math behavior. It is not presented here as a universal requirement for every OpenCV operation.

```bash
cd "$HOME/opencv-validation"
make -C build-files/ports/muslflt/ \
    INSTALL_ROOT_nto="$STAGING_FOLDER" \
    USE_INSTALL_ROOT=true \
    QNX_PROJECT_ROOT="$PWD/muslflt" \
    install -j4
```

### Build NumPy

This follows the upstream workflow. Unlike the muslflt and OpenCV commands, this documented NumPy command does not specify the same staging override. Review the NumPy port README for its installation destination; do not assume its output is under `$STAGING_FOLDER`.

```bash
PREFIX="/usr" QNX_PROJECT_ROOT="$PWD/numpy" \
    make -C build-files/ports/numpy install -j4
```

### Build OpenCV

```bash
BUILD_TESTING="ON" QNX_PROJECT_ROOT="$PWD/opencv" \
    make -C build-files/ports/opencv \
    INSTALL_ROOT_nto="$STAGING_FOLDER" \
    USE_INSTALL_ROOT=true \
    install -j4
```

`BUILD_TESTING=ON` follows the documented workflow. Building test binaries is not the same as running them; the minimal application does not require those tests to be deployed.

### Verify the staged files

```bash
find "$STAGING_FOLDER" -type f -path '*/opencv2/core.hpp'
find "$STAGING_FOLDER/aarch64le" \
    \( -name 'libopencv_core.so*' -o -name 'libopencv_imgproc.so*' \) -print
```

The author's existing installation contained OpenCV 4.9.0 at:

```text
stage/usr/local/include/opencv4/
stage/aarch64le/usr/local/lib/
```

A new checkout may produce a different version. Use the actual installed library names rather than assuming `.409` always applies.

## Understand the Minimal Application

Keep the supplied two-file example alongside this Markdown document. The latest supplied `OpenCv_Min.cpp` is the basis for this draft; the application source is not duplicated here to avoid maintaining two divergent copies.

### OpenCv_Min.hpp

The header declares camera unit and frame dimensions, the Screen application state, the render mutex, the failure flag, and the frame callback.

### OpenCv_Min.cpp

The implementation:

1. Creates a Screen window and two rendering buffers.
2. Opens the configured camera unit.
3. Requests YCBYCR frames at the configured dimensions and disables the Camera Framework's own window.
4. Wraps each camera frame using its actual stride.
5. Converts the image, draws one fixed rectangle, and produces a four-channel display image.
6. Copies rows into the available Screen buffer using Screen's actual stride.
7. Posts the buffer for display.
8. Stops capture and releases camera and Screen resources on exit.

Add the explicit include if it is absent:

```cpp
#include <cerrno>
```

### Image conversion and drawing

The minimal example receives CAMERA_FRAMETYPE_YCBYCR frames from the Camera Framework.

The camera buffer is wrapped directly in an OpenCV cv::Mat without copying the original frame:

cv::Mat yuyv(
    HEIGHT,
    WIDTH,
    CV_8UC2,
    buffer->framebuf,
    frame.stride);
The application converts the camera image into a writable OpenCV image:

cv::Mat bgr;
cv::cvtColor(yuyv, bgr, cv::COLOR_YUV2BGR_YUY2);
A fixed green rectangle is then drawn as a basic processing example:

cv::rectangle(
    bgr,
    cv::Rect(
        WIDTH / 4,
        HEIGHT / 4,
        WIDTH / 2,
        HEIGHT / 2),
    cv::Scalar(0, 255, 0),
    3);
Before display, the image is converted into a four-channel format compatible with the Screen buffer:

cv::Mat rgba;
cv::cvtColor(bgr, rgba, cv::COLOR_BGR2BGRA);
The resulting image is copied into the Screen rendering buffer and displayed on the target.

The camera image is processed entirely in memory and no intermediate image files are created.
## Compile the Application

Run on Ubuntu from the directory containing both source files:

```bash
source "$HOME/qnx800/qnxsdp-env.sh"
export STAGING_FOLDER="$HOME/opencv-validation/stage"

q++ -Vgcc_ntoaarch64le \
    -std=c++17 -Wall -Wextra \
    -I"$STAGING_FOLDER/usr/local/include/opencv4" \
    OpenCv_Min.cpp \
    -L"$STAGING_FOLDER/aarch64le/usr/local/lib" \
    -lopencv_imgproc -lopencv_core \
    -lcamapi -lscreen \
    -o /tmp/OpenCv_Min
```

Filename capitalization matters: the source is `OpenCv_Min.cpp`, while the output here is `OpenCv_Min`.

### Verify the executable

```bash
ls -lh /tmp/OpenCv_Min
file /tmp/OpenCv_Min
ntoaarch64-readelf -d /tmp/OpenCv_Min | grep NEEDED
```

The author's output identified an AArch64 QNX executable and dependencies including OpenCV core/imgproc, CamAPI, Screen, and QNX C/C++ runtime libraries. Successful compilation does not establish successful target execution or correct colors.

## Deploy to the QNX Everywhere Target

Replace `PI_IP` with the target address. Run on Ubuntu:

```bash
PI_HOST="qnxuser@PI_IP"
OPENCV_LIB="$HOME/opencv-validation/stage/aarch64le/usr/local/lib"

scp /tmp/OpenCv_Min \
    "$OPENCV_LIB/libopencv_core.so.409" \
    "$OPENCV_LIB/libopencv_imgproc.so.409" \
    "$PI_HOST:/tmp/"
```

The `.409` names match the author's tested installation. For another version, use the SONAMEs reported by `readelf` and the matching staged files.

Copy any additional missing OpenCV runtime dependencies identified on the target. Do not blindly replace the target's core system libraries with libraries from another image or SDP.

`/tmp` is used for temporary testing. This is not a persistent installation procedure.

## Run and Verify

On the Pi:

```bash
export LD_LIBRARY_PATH="/tmp${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
ldd /tmp/OpenCv_Min
```

Resolve missing dependencies before running:

```bash
/tmp/OpenCv_Min
```

### Expected result

- Live video appears on the target's connected display.
- One fixed green rectangle appears near the center.
- Image colors are correct.
- Ctrl+C stops the application and releases resources.

The author's camera capture and rectangle display worked, but the correct-color criterion remains open. Do not mark this codelab Published until all criteria pass with the exact source included in the repository.

## Troubleshooting

### Source file not found

Compile from the directory containing `OpenCv_Min.cpp` and `OpenCv_Min.hpp`, or supply the source's full path. Check capitalization.

### Camera fails to open

Verify the camera unit against the active sensor configuration, confirm the camera is connected, and confirm the target's sensor/camera services are running. This guide does not install those services.

### Unsupported frame format or dimensions

The minimal source expects YCBYCR/YUY2 at 640×480. Check camera support and the negotiated frame description. Do not treat NV12 as packed YUY2.

### Missing shared libraries

Use `ldd` on the target and inspect the missing dependency names. Deploy matching AArch64 libraries and confirm the library search path.

### Red and blue appear swapped

Check both conversion calls and the Screen format together. Use known-color diagnostic squares to establish display byte order separately from camera decoding. Confirm the edited executable is the one actually running before changing more conversion constants.

For deployment verification, compare checksum and byte count on Ubuntu and the target:

```bash
cksum /tmp/OpenCv_Min
```

Stop the old application before starting the replacement.

### Screen does not display video

Confirm Screen is running, the display is connected, and the application reports no Screen initialization or posting errors. This example displays on the target, not inside the SSH terminal.

## What We've Covered

- Built or reused a staged QNX OpenCV installation.
- Kept dependency sources and build artifacts outside the codelab repository.
- Compiled a two-file AArch64 camera application.
- Deployed the executable and required shared libraries.
- Verified camera capture and a fixed rectangle overlay.
- Identified color validation as a remaining publication requirement.

## References

- [QNX OpenCV port build instructions](https://github.com/qnx-ports/build-files/blob/main/ports/opencv/README.md)
- [Claat Markdown formatting reference](https://github.com/googlecodelabs/tools/tree/main/claat/parser/md)
- [OpenCV color conversion reference](https://docs.opencv.org/4.13.0/d8/d01/group__imgproc__color__conversions.html)

## Author Checklist Before Publication

- Confirm the exact QNX Everywhere image release and camera model.
- Pin or record the port repository revisions.
- Validate the complete clean-build installation sequence on the supported Ubuntu release.
- Confirm the NumPy installation destination and host prerequisites.
- Verify camera unit, resolution, and frame format.
- Resolve the blue-image issue and update the conversion explanation.
- Retest the exact two source files distributed with this codelab.
- Replace version-specific deployment filenames where appropriate.
- Preview the Markdown with the repository's Claat workflow.
- Change `status: Draft` only after validation.