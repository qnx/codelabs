/* my-node: answers a request on CAN id 2A0 with a reply on 2A8. */
#include <devctl.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/can_dcmd.h>

#define RX "/dev/can1/rx0"
#define TX "/dev/can1/tx1"
#define REQUEST 0x2A0
#define REPLY   0x2A8

static int rx = -1, tx = -1;

/* Close both devices if they are open, then open them, trying again
 * every 10 ms until a driver answers. */
static void open_both(const char *what)
{
    close(rx);
    close(tx);
    while ((rx = open(RX, O_RDONLY)) == -1 ||
           (tx = open(TX, O_WRONLY)) == -1) {
        close(rx);
        usleep(10000);
    }
    printf("my-node: %s %s and %s\n", what, RX, TX);
}

int main(void)
{
    unsigned count = 0;
    CAN_MSG req, rep;

    setvbuf(stdout, NULL, _IOLBF, 0);
    open_both("opened");
    for (;;) {
        memset(&req, 0, sizeof(req));
        if (devctl(rx, CAN_DEVCTL_READ_CANMSG_EXT, &req, sizeof(req),
                   NULL) != EOK) {
            open_both("driver is back, reopened");
            continue;
        }
        /* libcan keeps an 11-bit id in bits 28 to 18 of mid. Skip other
         * ids, and requests with no byte to echo. */
        if (req.ext.is_extended_mid || (req.mid >> 18 & 0x7FF) != REQUEST ||
            req.len == 0)
            continue;
        memset(&rep, 0, sizeof(rep));
        rep.mid = REPLY << 18;
        rep.len = 2;
        rep.dat[0] = ++count;     /* requests answered so far */
        rep.dat[1] = req.dat[0];  /* the first byte of the request */
        while (devctl(tx, CAN_DEVCTL_WRITE_CANMSG_EXT, &rep, sizeof(rep),
                      NULL) != EOK)
            open_both("driver is back, reopened");
        printf("my-node: request %u, byte %02X, reply on %X\n",
               count, req.dat[0], REPLY);
    }
}
