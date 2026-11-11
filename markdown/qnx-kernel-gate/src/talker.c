/* talker: send a few messages to the watcher, then crash. */
#include <stdio.h>
#include <string.h>
#include <sys/dispatch.h>
#include <sys/neutrino.h>

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    int coid = name_open("guard-watch", 0);
    if (coid < 0) { perror("name_open"); return 1; }

    for (int i = 1; i <= 3; i++) {
        char msg[32], reply[8];
        snprintf(msg, sizeof(msg), "hello %d", i);
        long r = MsgSend(coid, msg, strlen(msg), reply, sizeof(reply));
        printf("sent \"%s\", the reply status was %ld\n", msg, r);
    }
    printf("crashing now\n");
    *(volatile int *)0 = 1; /* SIGSEGV */
    return 0;
}
