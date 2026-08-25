FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

COPY api/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY api/app.py /app/app.py
COPY api/db.py /app/db.py
COPY api/google_client.py /app/google_client.py
COPY api/google_routes.py /app/google_routes.py
RUN python -m compileall -q /app

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
