FROM node:20-alpine AS web-build

WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 docker.io && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --timeout 180 --retries 10 torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --timeout 180 --retries 10 -r requirements.txt

COPY app.py rag_engine.py learning_insights.py ./
COPY backend ./backend
COPY templates ./templates
COPY static ./static
COPY --from=web-build /build/web/dist ./web/dist
COPY builtin_knowledge ./builtin_knowledge

RUN useradd --create-home appuser && mkdir -p /data /model-cache && chown -R appuser:appuser /app /data /model-cache
USER appuser

EXPOSE 8899
CMD ["python", "app.py"]
