#include "OpenCv_Min.hpp"

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>

#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstddef>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {

volatile std::sig_atomic_t stop_requested = 0;

void on_signal(int)
{
    stop_requested = 1;
}

void check_screen(int result, const char* operation)
{
    if (result != 0) {
        const int saved_errno = errno;
        throw std::runtime_error(
            std::string(operation) + ": " +
            std::strerror(saved_errno));
    }
}

void check_camera(camera_error_t result, const char* operation)
{
    if (result != CAMERA_EOK) {
        throw std::runtime_error(
            std::string(operation) + ": camera error " +
            std::to_string(static_cast<int>(result)));
    }
}

void create_display(opencv_min::App& app)
{
    using namespace opencv_min;

    check_screen(
        screen_create_context(
            &app.context, SCREEN_APPLICATION_CONTEXT),
        "screen_create_context");

    check_screen(
        screen_create_window(&app.window, app.context),
        "screen_create_window");

    int format = SCREEN_FORMAT_RGBA8888;
    int usage = SCREEN_USAGE_WRITE;
    int size[2] = {WIDTH, HEIGHT};
    int position[2] = {0, 0};

    check_screen(
        screen_set_window_property_iv(
            app.window, SCREEN_PROPERTY_FORMAT, &format),
        "set window format");

    check_screen(
        screen_set_window_property_iv(
            app.window, SCREEN_PROPERTY_USAGE, &usage),
        "set window usage");

    check_screen(
        screen_set_window_property_iv(
            app.window, SCREEN_PROPERTY_BUFFER_SIZE, size),
        "set buffer size");

    check_screen(
        screen_set_window_property_iv(
            app.window, SCREEN_PROPERTY_SIZE, size),
        "set window size");

    check_screen(
        screen_set_window_property_iv(
            app.window, SCREEN_PROPERTY_SOURCE_SIZE, size),
        "set source size");

    check_screen(
        screen_set_window_property_iv(
            app.window, SCREEN_PROPERTY_POSITION, position),
        "set window position");

    check_screen(
        screen_create_window_buffers(app.window, 2),
        "screen_create_window_buffers");

    int visible = 1;
    check_screen(
        screen_set_window_property_iv(
            app.window, SCREEN_PROPERTY_VISIBLE, &visible),
        "set window visibility");

    int actual_format = 0;
    check_screen(
        screen_get_window_property_iv(
            app.window, SCREEN_PROPERTY_FORMAT, &actual_format),
        "query window format");

    std::printf(
        "Screen format=%d; RGBA8888=%d\n",
        actual_format,
        static_cast<int>(SCREEN_FORMAT_RGBA8888));

    std::fflush(stdout);
}

} // namespace

namespace opencv_min {

void on_frame(camera_handle_t,
              camera_buffer_t* buffer,
              void* user)
{
    // Validate callback arguments before dereferencing them.
    if (!user || !buffer || !buffer->framebuf) {
        return;
    }

    auto& app = *static_cast<App*>(user);

    // Include locking and all processing inside the exception boundary.
    try {
        std::lock_guard<std::mutex> lock(app.render_mutex);

        if (stop_requested || app.failed.load()) {
            return;
        }

        if (!app.window) {
            throw std::runtime_error("Screen window is not initialized");
        }

        if (buffer->frametype != CAMERA_FRAMETYPE_YCBYCR) {
            throw std::runtime_error(
                "Expected YCBYCR/YUYV frames; received type " +
                std::to_string(static_cast<int>(buffer->frametype)));
        }

        const auto& frame = buffer->framedesc.ycbycr;

        if (frame.width != static_cast<unsigned>(WIDTH) ||
            frame.height != static_cast<unsigned>(HEIGHT) ||
            frame.stride < static_cast<unsigned>(WIDTH * 2)) {
            throw std::runtime_error(
                "Unexpected camera dimensions or stride");
        }

        // Read-only wrapper around the camera's packed YUYV data.
        // Respect the camera's actual row stride.
        cv::Mat yuyv(
            HEIGHT,
            WIDTH,
            CV_8UC2,
            buffer->framebuf,
            static_cast<std::size_t>(frame.stride));

        // Conversion allocates a writable three-channel image.
        cv::Mat bgr;
        cv::cvtColor(yuyv, bgr, cv::COLOR_YUV2BGR_YUY2);

        cv::rectangle(
            bgr,
            cv::Rect(
                WIDTH / 4,
                HEIGHT / 4,
                WIDTH / 2,
                HEIGHT / 2),
            cv::Scalar(0, 255, 0),
            3);

        // Four channels are required by the copy below.
        // Do NOT replace this with COLOR_BGR2RGB.
        cv::Mat rgba;
        cv::cvtColor(bgr, rgba, cv::COLOR_BGR2BGRA);


        if (rgba.empty() ||
            rgba.type() != CV_8UC4 ||
            rgba.cols != WIDTH ||
            rgba.rows != HEIGHT) {
            throw std::runtime_error(
                "Expected WIDTH x HEIGHT four-channel output");
        }

        // Size the array to the actual number of window buffers.
        int buffer_count = 0;
        check_screen(
            screen_get_window_property_iv(
                app.window,
                SCREEN_PROPERTY_BUFFER_COUNT,
                &buffer_count),
            "get window buffer count");

        if (buffer_count <= 0 || buffer_count > 16) {
            throw std::runtime_error("Invalid window buffer count");
        }

        std::vector<screen_buffer_t> buffers(
            static_cast<std::size_t>(buffer_count), nullptr);

        check_screen(
            screen_get_window_property_pv(
                app.window,
                SCREEN_PROPERTY_RENDER_BUFFERS,
                reinterpret_cast<void**>(buffers.data())),
            "get render buffers");

        screen_buffer_t target = buffers[0];

        if (!target) {
            throw std::runtime_error("No rendering buffer available");
        }

        void* pixels = nullptr;
        int stride = 0;
        int buffer_size[2] = {0, 0};
        int buffer_format = 0;

        check_screen(
            screen_get_buffer_property_pv(
                target, SCREEN_PROPERTY_POINTER, &pixels),
            "get buffer pointer");

        check_screen(
            screen_get_buffer_property_iv(
                target, SCREEN_PROPERTY_STRIDE, &stride),
            "get buffer stride");

        check_screen(
            screen_get_buffer_property_iv(
                target, SCREEN_PROPERTY_BUFFER_SIZE, buffer_size),
            "get buffer size");

        check_screen(
            screen_get_buffer_property_iv(
                target, SCREEN_PROPERTY_FORMAT, &buffer_format),
            "get buffer format");

        const std::size_t row_bytes =
            static_cast<std::size_t>(rgba.cols) * rgba.elemSize();

        if (!pixels ||
            stride <= 0 ||
            static_cast<std::size_t>(stride) < row_bytes ||
            buffer_size[0] < WIDTH ||
            buffer_size[1] < HEIGHT ||
            buffer_format != SCREEN_FORMAT_RGBA8888) {
            throw std::runtime_error(
                "Screen buffer dimensions, format, or stride mismatch");
        }

        static bool logged = false;
        if (!logged) {
            std::printf(
                "Camera: type=%d size=%ux%u stride=%u\n"
                "Image: channels=%d row_bytes=%zu\n"
                "Screen: size=%dx%d stride=%d format=%d\n",
                static_cast<int>(buffer->frametype),
                static_cast<unsigned>(frame.width),
                static_cast<unsigned>(frame.height),
                static_cast<unsigned>(frame.stride),
                rgba.channels(),
                row_bytes,
                buffer_size[0],
                buffer_size[1],
                stride,
                buffer_format);

            std::fflush(stdout);
            logged = true;
        }

        auto* destination = static_cast<unsigned char*>(pixels);

        for (int row = 0; row < rgba.rows; ++row) {
            std::memcpy(
                destination +
                    static_cast<std::size_t>(row) *
                    static_cast<std::size_t>(stride),
                rgba.ptr(row),
                row_bytes);
        }

        check_screen(
            screen_post_window(
                app.window, target, 0, nullptr, 0),
            "screen_post_window");
    }
    catch (const std::exception& error) {
        std::fprintf(stderr, "Frame error: %s\n", error.what());
        app.failed.store(true);
    }
    catch (...) {
        std::fprintf(stderr, "Unknown frame error\n");
        app.failed.store(true);
    }
}

} // namespace opencv_min

int main()
{
    using namespace opencv_min;

    std::signal(SIGINT, on_signal);
    std::signal(SIGTERM, on_signal);

    App app;
    camera_handle_t camera = {};
    bool camera_opened = false;
    bool streaming = false;
    int result = 0;

    try {
        create_display(app);

        check_camera(
            camera_open(
                static_cast<camera_unit_t>(CAMERA_UNIT),
                CAMERA_MODE_RW | CAMERA_MODE_ROLL,
                &camera),
            "camera_open");
        camera_opened = true;

        check_camera(
            camera_set_vf_mode(camera, CAMERA_VFMODE_VIDEO),
            "camera_set_vf_mode");

        check_camera(
            camera_set_vf_property(
                camera,
                CAMERA_IMGPROP_CREATEWINDOW, 0,
                CAMERA_IMGPROP_FORMAT, CAMERA_FRAMETYPE_YCBYCR,
                CAMERA_IMGPROP_WIDTH,
                static_cast<unsigned int>(WIDTH),
                CAMERA_IMGPROP_HEIGHT,
                static_cast<unsigned int>(HEIGHT)),
            "camera_set_vf_property");

        check_camera(
            camera_start_viewfinder(
                camera, on_frame, nullptr, &app),
            "camera_start_viewfinder");
        streaming = true;

        std::printf(
            "OpenCV_Min_verified: live video with one green rectangle.\n"
            "Press Ctrl+C to stop.\n");
        std::fflush(stdout);

        while (!stop_requested && !app.failed.load()) {
            std::this_thread::sleep_for(
                std::chrono::milliseconds(100));
        }

        if (app.failed.load()) {
            result = 1;
        }
    }
    catch (const std::exception& error) {
        std::fprintf(stderr, "Startup error: %s\n", error.what());
        result = 1;
    }

    // Stop callbacks before releasing anything they use.
    if (streaming) {
        const camera_error_t error = camera_stop_viewfinder(camera);

        if (error != CAMERA_EOK) {
            std::fprintf(
                stderr,
                "camera_stop_viewfinder failed: %d\n",
                static_cast<int>(error));

            // Avoid destroying callback resources while capture
            // may still be active. Process exit performs cleanup.
            return 1;
        }
    }

    if (camera_opened) {
        const camera_error_t error = camera_close(camera);
        if (error != CAMERA_EOK) {
            std::fprintf(
                stderr, "camera_close failed: %d\n",
                static_cast<int>(error));
            result = 1;
        }
    }

    if (app.window) {
        screen_destroy_window(app.window);
        app.window = nullptr;
    }

    if (app.context) {
        screen_destroy_context(app.context);
        app.context = nullptr;
    }

    return result;
}