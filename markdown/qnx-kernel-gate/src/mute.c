/* mute: a server that takes a message and never answers, and a client that
 * calls it with or without a deadline.
 *   mute server [name]
 *   mute polite [name]     same, but it keeps listening and answers the kernel's unblock pulse
 *   mute client [bounded] [name]
 * The default name is "guard-mute". */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/dispatch.h>
#include <sys/neutrino.h>
#include <unistd.h>

static int server(const char *name, int polite)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    name_attach_t *att = name_attach(NULL, name, 0);
    if (att == NULL) { perror("name_attach"); return 1; }
    printf("mute server ready\n");
    for (;;) {
        union { uint16_t type; struct _pulse pulse; char buf[32]; } m;
        int rcvid = MsgReceive(att->chid, &m, sizeof(m), NULL);
        if (rcvid > 0 && m.type == _IO_CONNECT) { MsgReply(rcvid, EOK, NULL, 0); continue; }
        if (rcvid > 0) {
            printf("got a message and I will not reply\n");
            if (!polite) for (;;) pause();   /* stall without ever listening again */
            continue;                        /* keep listening, but still do not reply */
        }
        if (rcvid == 0 && m.pulse.code == _PULSE_CODE_UNBLOCK) {
            /* The kernel asks us to release a client whose deadline has passed. */
            int victim = m.pulse.value.sival_int;
            printf("unblock pulse: releasing the client\n");
            MsgError(victim, ETIMEDOUT);
        }
    }
}

static int client(int bounded, const char *name)
{
    int coid = name_open(name, 0);
    if (coid < 0) { perror("name_open"); return 1; }
    if (bounded) {
        uint64_t deadline = 200 * 1000 * 1000ULL; /* ns */
        /* Applies to the next blocking kernel call only. */
        TimerTimeout(CLOCK_MONOTONIC, _NTO_TIMEOUT_SEND | _NTO_TIMEOUT_REPLY, NULL, &deadline, NULL);
    }
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    long r = MsgSend(coid, "ping", 4, NULL, 0);
    int e = errno;
    clock_gettime(CLOCK_MONOTONIC, &t1);
    long ms = (t1.tv_sec - t0.tv_sec) * 1000 + (t1.tv_nsec - t0.tv_nsec) / 1000000;
    if (r < 0) printf("MsgSend failed after %ld ms: %s\n", ms, strerror(e));
    else printf("MsgSend returned %ld after %ld ms\n", r, ms);
    return 0;
}

int main(int argc, char **argv)
{
    const char *cmd = argc >= 2 ? argv[1] : "";
    if (strcmp(cmd, "server") == 0 || strcmp(cmd, "polite") == 0)
        return server(argc >= 3 ? argv[2] : "guard-mute", cmd[0] == 'p');
    if (strcmp(cmd, "client") == 0) {
        int bounded = argc >= 3 && strcmp(argv[2], "bounded") == 0;
        const char *name = argc >= (bounded ? 4 : 3) ? argv[bounded ? 3 : 2] : "guard-mute";
        return client(bounded, name);
    }
    fprintf(stderr, "usage: mute server|polite [name] | mute client [bounded] [name]\n");
    return 2;
}
