#ifndef OPENCV_MIN_HPP
#define OPENCV_MIN_HPP

#include <camera/camera_api.h>
#include <screen/screen.h>

#include <atomic>
#include <mutex>

namespace opencv_min {

constexpr unsigned CAMERA_UNIT = 5;
constexpr int WIDTH = 640;
constexpr int HEIGHT = 480;

struct App {
    screen_context_t context = nullptr;
    screen_window_t window = nullptr;

    std::mutex render_mutex;
    std::atomic<bool> failed{false};
};

void on_frame(camera_handle_t handle,
              camera_buffer_t* buffer,
              void* user);

} // namespace opencv_min

#endif
