/* Shared memory between the control loop and its watchdog. */
#ifndef LOOP_H
#define LOOP_H
#include <stdatomic.h>
#include <stdint.h>

#define HB_SHM "/failsafe_hb"

typedef struct {
    _Atomic uint64_t beat;      /* the loop bumps this on every tick       */
    _Atomic uint32_t safe;      /* the watchdog sets this to force safe    */
    _Atomic uint32_t trips;     /* how many times the watchdog fired       */
} heartbeat_t;

#endif
