/* watcher: a server that learns the moment a client disappears. */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <sys/dispatch.h>
#include <sys/neutrino.h>

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    name_attach_t *att = name_attach(NULL, "guard-watch", 0);
    if (att == NULL) { perror("name_attach"); return 1; }
    printf("watcher ready\n");

    for (;;) {
        union { uint16_t type; struct _pulse pulse; char text[64]; } m;
        struct _msg_info info;
        int rcvid = MsgReceive(att->chid, &m, sizeof(m), &info);

        if (rcvid == 0) { /* a pulse, not a message */
            if (m.pulse.code == _PULSE_CODE_DISCONNECT) {
                printf("a client went away: the kernel sent a disconnect pulse (scoid %d)\n", m.pulse.scoid);
                ConnectDetach(m.pulse.scoid);
            }
            continue;
        }
        if (rcvid < 0) continue;
        if (m.type == _IO_CONNECT) { /* name_open() asking to connect */
            MsgReply(rcvid, EOK, NULL, 0);
            continue;
        }
        m.text[info.msglen < (int)sizeof(m.text) ? info.msglen : (int)sizeof(m.text) - 1] = '\0';
        printf("message from pid %d: \"%s\"\n", (int)info.pid, m.text);
        MsgReply(rcvid, 2, "ok", 2);
    }
}
