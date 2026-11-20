/*
 * wd: a watchdog for the control loop.
 *
 * Runs above the loop's priority with its own 1 ms timer pulse and checks
 * that the heartbeat keeps moving. If the loop goes silent for longer than
 * the limit, it forces the safe state (here: sets a flag and says so; in a
 * real machine: lift the actuator, cut the power stage) and keeps holding it.
 * It never restarts the loop.
 *
 *   wd [-l limit_ms] [-r prio]
 */
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/neutrino.h>
#include <time.h>
#include <unistd.h>
#include "loop.h"

#define PULSE_TICK (_PULSE_CODE_MINAVAIL + 1)

static void die(const char *what) { perror(what); exit(1); }

int main(int argc, char **argv)
{
    int limit = 20, prio = 62, opt;
    while ((opt = getopt(argc, argv, "l:r:")) != -1) {
        if (opt == 'l') limit = atoi(optarg);
        else if (opt == 'r') prio = atoi(optarg);
        else { fprintf(stderr, "usage: wd [-l limit_ms] [-r prio]\n"); return 1; }
    }
    struct sched_param sp = { .sched_priority = prio };
    if (pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp) != EOK) die("SCHED_FIFO");

    int fd = shm_open(HB_SHM, O_RDWR, 0);
    if (fd == -1) die("shm_open (start ctl first)");
    heartbeat_t *hb = mmap(NULL, sizeof(*hb), PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (hb == MAP_FAILED) die("mmap");

    int chid = ChannelCreate(_NTO_CHF_PRIVATE);
    int coid = ConnectAttach(0, 0, chid, _NTO_SIDE_CHANNEL, 0);
    if (chid == -1 || coid == -1) die("channel");
    struct sigevent ev;
    SIGEV_PULSE_INIT(&ev, coid, prio, PULSE_TICK, 0);
    timer_t tid;
    if (timer_create(CLOCK_MONOTONIC, &ev, &tid) == -1) die("timer_create");
    struct itimerspec its = { .it_value = { 0, 1000000 }, .it_interval = { 0, 1000000 } };
    timer_settime(tid, 0, &its, NULL);

    printf("wd: watching the heartbeat, limit %d ms, priority %d\n", limit, prio);
    fflush(stdout);
    uint64_t seen = atomic_load(&hb->beat);
    int silent = 0, tripped = 0;
    for (;;) {
        struct _pulse p;
        if (MsgReceivePulse(chid, &p, sizeof(p), NULL) == -1 || p.code != PULSE_TICK) continue;
        uint64_t b = atomic_load(&hb->beat);
        if (b != seen) { seen = b; silent = 0; continue; }
        if (++silent > limit && !tripped) {
            tripped = 1;
            atomic_store(&hb->safe, 1);
            atomic_fetch_add(&hb->trips, 1);
            printf("wd: loop silent for %d ms: SAFE STATE forced, loop will not be restarted\n", silent);
            fflush(stdout);
        }
    }
}
