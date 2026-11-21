/* sandboxed: start as root, then give up what we should never need again.
 *   sandboxed             lock the abilities, then drop to uid 2002
 *   sandboxed --no-lock   only drop to uid 2002 (for comparison) */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/procmgr.h>
#include <unistd.h>

#include "valve.h"

#define LOCKED_OUT(id) (PROCMGR_ADN_NONROOT | PROCMGR_AOP_DENY | PROCMGR_AOP_LOCK | (id))

static void try_open(const char *when)
{
    int fd = open(VALVE_PATH, O_RDWR);
    if (fd < 0) {
        printf("%-28s open: %s\n", when, strerror(errno));
    } else {
        printf("%-28s open: ok\n", when);
        close(fd);
    }
}

int main(int argc, char **argv)
{
    int lock = !(argc > 1 && strcmp(argv[1], "--no-lock") == 0);
    int fd = open(VALVE_PATH, O_RDWR); /* still root: allowed */
    if (fd < 0) { perror("open"); return 1; }
    int percent = 10;
    devctl(fd, DCMD_VALVE_SET, &percent, sizeof(percent), NULL);

    /* 1. Refuse, for good, the abilities this process has no use for. The
     *    deny-and-lock applies once we are no longer root. */
    int e = EOK;
    if (lock)
        e = procmgr_ability(0,
                            LOCKED_OUT(PROCMGR_AID_FORK),
                            LOCKED_OUT(PROCMGR_AID_SPAWN),
                            PROCMGR_AID_EOL);
    if (e != EOK) printf("procmgr_ability: %s\n", strerror(e));

    /* 2. Become an ordinary user. */
    if (setgid(2002) != 0 || setuid(2002) != 0) { perror("drop"); return 1; }
    printf("now uid %d, abilities %s\n", (int)geteuid(), lock ? "locked" : "left alone");

    /* 3. What can we still do? */
    percent = 20;
    e = devctl(fd, DCMD_VALVE_SET, &percent, sizeof(percent), NULL);
    printf("%-28s %s\n", "the fd opened before:", e == EOK ? "still works" : strerror(e));
    try_open("a fresh open now:");
    pid_t p = fork();
    if (p == 0) _exit(0);
    printf("%-28s %s\n", "fork:", p < 0 ? strerror(errno) : "allowed");
    return 0;
}
