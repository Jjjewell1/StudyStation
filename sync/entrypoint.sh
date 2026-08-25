#!/bin/sh
# Entrypoint:
#   RUN_ONCE=1 -> single sync run and exit (testing/manual).
#   Otherwise  -> run one sync immediately (so a freshly pasted session takes
#                 effect on redeploy without waiting for the nightly slot),
#                 then generate a crontab from SYNC_SCHEDULE for supercronic.
set -eu

if [ "${RUN_ONCE:-0}" = "1" ]; then
    echo "[entrypoint] RUN_ONCE=1 - running one sync now"
    exec python -u main.py
fi

echo "[entrypoint] running startup sync (errors here won't stop cron mode)"
python -u main.py || echo "[entrypoint] startup sync exited nonzero - continuing to cron mode"

SCHED="${SYNC_SCHEDULE:-0 3 * * *}"
# supercronic wants exactly 5 fields; refuse to boot with a broken schedule
# so a typo'd env var doesn't silently disable nightly syncs.
FIELD_COUNT=$(echo "$SCHED" | awk '{print NF}')
if [ "$FIELD_COUNT" != "5" ]; then
    echo "[entrypoint] FATAL: SYNC_SCHEDULE='$SCHED' must have 5 cron fields" >&2
    exit 1
fi

echo "$SCHED python -u /app/main.py" > /app/crontab
echo "[entrypoint] cron mode, schedule: $SCHED (UTC)"
exec supercronic -passthrough-logs /app/crontab
