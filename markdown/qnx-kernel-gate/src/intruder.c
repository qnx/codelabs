/* intruder: try to open the valve and turn it all the way up. */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#include "valve.h"

int main(void)
{
    printf("running as uid %d\n", (int)geteuid());
    int fd = open(VALVE_PATH, O_RDWR);
    if (fd < 0) {
        printf("open %s: %s\n", VALVE_PATH, strerror(errno));
        return 1;
    }
    int percent = 100;
    int e = devctl(fd, DCMD_VALVE_SET, &percent, sizeof(percent), NULL);
    printf("opened the valve and set it to 100%%: %s\n", e == EOK ? "done" : strerror(e));
    close(fd);
    return 0;
}
