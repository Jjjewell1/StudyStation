#!/bin/sh
# Entrypoint: RUN_ONCE=1 -> single sync run and exit (testing/manual).
# Otherwise generate a crontab from SYNC_SCHEDULE and hand off to supercronic.
set -eu

if [ "${RUN_ONCE:-0}" = "1" ]; then
    echo "[entrypoint] RUN_ONCE=1 - running one sync now"
    exec python -u main.py
fi

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
