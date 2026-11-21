/* Shared by the valve resource manager and its clients. */
#ifndef VALVE_H
#define VALVE_H
#include <devctl.h>

#define VALVE_PATH "/dev/guard/valve"

/* Set or read the valve opening, in percent (0..100). */
#define DCMD_VALVE_SET __DIOT(_DCMD_MISC, 0x01, int)
#define DCMD_VALVE_GET __DIOF(_DCMD_MISC, 0x02, int)
#endif
