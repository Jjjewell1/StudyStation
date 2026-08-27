FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

COPY sync/requirements.txt /app/sync/requirements.txt
RUN pip install -r /app/sync/requirements.txt

# supercronic = cron runner that logs to stdout (visible in Coolify logs).
# Downloaded via python urllib since slim images lack curl/wget.
ARG SUPERCRONIC_VERSION=v0.2.33
RUN ARCH="$(dpkg --print-architecture)" && \
    python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-'+'$ARCH', '/usr/local/bin/supercronic')" && \
    chmod +x /usr/local/bin/supercronic

COPY sync/entrypoint.sh /app/entrypoint.sh
COPY sync/trigger_server.py /app/trigger_server.py
COPY sync/schema.sql /app/schema.sql
COPY sync/config.py /app/config.py
COPY sync/db.py /app/db.py
COPY sync/main.py /app/main.py
COPY studystation /app/studystation
RUN chmod +x /app/entrypoint.sh && python -m compileall -q /app

ENTRYPOINT ["/app/entrypoint.sh"]
