/*
 * ctl: a 1 ms control loop on QNX 8.0.
 *
 * A timer delivers a pulse on a private channel every millisecond and the
 * loop wakes on MsgReceivePulse. Every second it prints how many ticks it
 * ran and how many it missed, measured with ClockCycles. It publishes a
 * heartbeat in shared memory for the watchdog.
 *
 *   ctl [-r prio] [-s seconds]
 *     -r  SCHED_FIFO priority (default 60)
 *     -s  run for this many seconds (default: forever)
 */
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/neutrino.h>
#include <sys/syspage.h>
#include <time.h>
#include <unistd.h>
#include "loop.h"

#define PULSE_TICK (_PULSE_CODE_MINAVAIL + 1)

static void die(const char *what) { perror(what); exit(1); }

int main(int argc, char **argv)
{
    int prio = 60, seconds = 0, opt;
    while ((opt = getopt(argc, argv, "r:s:")) != -1) {
        if (opt == 'r') prio = atoi(optarg);
        else if (opt == 's') seconds = atoi(optarg);
        else { fprintf(stderr, "usage: ctl [-r prio] [-s seconds]\n"); return 1; }
    }

    /* 1. Check the tick your timer will run on. QNX timers expire on
          system clock ticks, so read it instead of assuming it. */
    struct _clockperiod cp;
    struct timespec res;
    if (ClockPeriod(CLOCK_REALTIME, NULL, &cp, 0) == 0 && clock_getres(CLOCK_MONOTONIC, &res) == 0)
        printf("ctl: system clock period %u ns, timer resolution %ld ns\n", cp.nsec, res.tv_nsec);

    /* 2. Run the loop at a real-time priority. */
    struct sched_param sp = { .sched_priority = prio };
    if (pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp) != EOK) die("SCHED_FIFO");

    /* 3. A private channel and a 1 ms timer that pulses it. */
    int chid = ChannelCreate(_NTO_CHF_PRIVATE);
    if (chid == -1) die("ChannelCreate");
    int coid = ConnectAttach(0, 0, chid, _NTO_SIDE_CHANNEL, 0);
    if (coid == -1) die("ConnectAttach");
    struct sigevent ev;
    SIGEV_PULSE_INIT(&ev, coid, prio, PULSE_TICK, 0);
    timer_t tid;
    if (timer_create(CLOCK_MONOTONIC, &ev, &tid) == -1) die("timer_create");
    struct itimerspec its = { .it_value = { 0, 1000000 }, .it_interval = { 0, 1000000 } };
    if (timer_settime(tid, 0, &its, NULL) == -1) die("timer_settime");

    /* 4. The heartbeat the watchdog watches. */
    int fd = shm_open(HB_SHM, O_RDWR | O_CREAT, 0600);
    if (fd == -1 || ftruncate(fd, sizeof(heartbeat_t)) == -1) die("shm");
    heartbeat_t *hb = mmap(NULL, sizeof(*hb), PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (hb == MAP_FAILED) die("mmap");
    atomic_store(&hb->safe, 0);

    const uint64_t cps = SYSPAGE_ENTRY(qtime)->cycles_per_sec;
    const uint64_t period = cps / 1000;
    uint64_t last = 0, second_start = ClockCycles(), ticks = 0, missed = 0, total = 0;
    printf("ctl: running at priority %d, 1 ms timer pulse\n", prio);

    for (;;) {
        struct _pulse p;
        if (MsgReceivePulse(chid, &p, sizeof(p), NULL) == -1) continue;
        if (p.code != PULSE_TICK) continue;

        uint64_t now = ClockCycles();
        if (last) {
            uint64_t gap = now - last;
            if (gap > period + period / 2) missed += gap / period - 1;   /* whole periods lost */
        }
        last = now;
        ticks++;
        atomic_fetch_add(&hb->beat, 1);

        /* ... the real control work would go here, and it would look at
           hb->safe: once the watchdog has fired, stay in the safe state ... */

        if (now - second_start >= cps) {
            total++;
            printf("ctl: %3llu s  ticks %4llu  missed %4llu%s\n", (unsigned long long)total,
                   (unsigned long long)ticks, (unsigned long long)missed,
                   atomic_load(&hb->safe) ? "  (watchdog has forced safe state)" : "");
            fflush(stdout);
            ticks = missed = 0;
            second_start = now;
            if (seconds && (int)total >= seconds) break;
        }
    }
    return 0;
}
