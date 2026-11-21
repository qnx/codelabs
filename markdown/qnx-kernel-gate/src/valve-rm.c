/* valve-rm: a resource manager that owns one device, /dev/guard/valve.
 * The node belongs to root and is mode 0600, so only root can open it. */

/* Typed handles for the callbacks (see <sys/resmgr.h>). */
struct _iofunc_attr;
#define RESMGR_HANDLE_T struct _iofunc_attr
struct _iofunc_ocb;
#define RESMGR_OCB_T struct _iofunc_ocb

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/dispatch.h>
#include <sys/iofunc.h>
#include <sys/stat.h>

#include "valve.h"

static int percent;          /* the state of the "hardware" */
static int refused;          /* opens the kernel's permission check turned down */
static iofunc_attr_t attr;

/* Reply to a devctl with n bytes of data (n may be 0). */
static int reply(resmgr_context_t *ctp, io_devctl_t *msg, const void *data, size_t n)
{
    memset(&msg->o, 0, sizeof(msg->o));
    msg->o.ret_val = EOK;
    msg->o.nbytes = (int32_t)n;
    if (n > 0) memcpy(_DEVCTL_DATA(msg->o), data, n);
    return _RESMGR_PTR(ctp, &msg->o, sizeof(msg->o) + n);
}

static int do_devctl(resmgr_context_t *ctp, io_devctl_t *msg, iofunc_ocb_t *ocb)
{
    int s = iofunc_devctl_default(ctp, msg, ocb); /* the standard commands */
    if (s != _RESMGR_DEFAULT) return s;

    switch (msg->i.dcmd) {
    case DCMD_VALVE_SET: {
        int v = *(int *)_DEVCTL_DATA(msg->i);
        if (v < 0 || v > 100) return EINVAL;
        percent = v;
        printf("valve set to %d%%\n", percent);
        return reply(ctp, msg, NULL, 0);
    }
    case DCMD_VALVE_GET:
        return reply(ctp, msg, &percent, sizeof(percent));
    }
    return ENOSYS;
}

/* open() goes through here first. The default handler checks the caller's
 * user and group against the node's mode bits; we only count the refusals. */
static int do_open(resmgr_context_t *ctp, io_open_t *msg, RESMGR_HANDLE_T *handle, void *extra)
{
    int r = iofunc_open_default(ctp, msg, handle, extra);
    if (r == EACCES) printf("the kernel's check refused an open (%d so far)\n", ++refused);
    return r;
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    dispatch_t *dpp = dispatch_create();
    if (dpp == NULL) { perror("dispatch_create"); return 1; }

    resmgr_attr_t rattr;
    memset(&rattr, 0, sizeof(rattr));
    rattr.nparts_max = 1;
    rattr.msg_max_size = 1024;

    resmgr_connect_funcs_t cfuncs;
    resmgr_io_funcs_t ifuncs;
    iofunc_func_init(_RESMGR_CONNECT_NFUNCS, &cfuncs, _RESMGR_IO_NFUNCS, &ifuncs);
    cfuncs.open = do_open;
    ifuncs.devctl = do_devctl;

    iofunc_attr_init(&attr, S_IFCHR | 0600, NULL, NULL); /* rw for the owner only */
    attr.uid = 0;
    attr.gid = 0;

    if (resmgr_attach(dpp, &rattr, VALVE_PATH, _FTYPE_ANY, 0, &cfuncs, &ifuncs, &attr) == -1) {
        perror("resmgr_attach");
        return 1;
    }
    printf("serving %s\n", VALVE_PATH);

    dispatch_context_t *ctp = dispatch_context_alloc(dpp);
    for (;;) {
        if ((ctp = dispatch_block(ctp)) == NULL) { perror("dispatch_block"); return 1; }
        dispatch_handler(ctp);
    }
}
