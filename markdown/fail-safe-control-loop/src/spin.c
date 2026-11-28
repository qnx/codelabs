/*
 * spin: busy threads at a chosen priority, to show that work below the
 * loop's priority cannot take its CPU away.
 *
 *   spin <threads> <seconds> <priority>
 */
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static int g_prio;
static struct timespec g_until;

static void *spin(void *arg)
{
    (void)arg;
    struct sched_param sp = { .sched_priority = g_prio };
    pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);
    volatile unsigned long x = 0;
    struct timespec now;
    do {   /* each thread stops itself: a lower priority main thread could not */
        for (int i = 0; i < 100000; i++) x++;
        clock_gettime(CLOCK_MONOTONIC, &now);
    } while (now.tv_sec < g_until.tv_sec ||
             (now.tv_sec == g_until.tv_sec && now.tv_nsec < g_until.tv_nsec));
    return NULL;
}

int main(int argc, char **argv)
{
    if (argc < 4) { fprintf(stderr, "usage: spin <threads> <seconds> <priority>\n"); return 1; }
    int n = atoi(argv[1]);
    g_prio = atoi(argv[3]);
    clock_gettime(CLOCK_MONOTONIC, &g_until);
    g_until.tv_sec += atoi(argv[2]);
    pthread_t t[32];
    if (n > 32) n = 32;
    for (int i = 0; i < n; i++) pthread_create(&t[i], NULL, spin, NULL);
    for (int i = 0; i < n; i++) pthread_join(t[i], NULL);
    printf("spin: %d threads at priority %d done\n", n, g_prio);
    return 0;
}
