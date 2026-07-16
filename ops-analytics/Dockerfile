FROM python:3.12-alpine

WORKDIR /app
RUN pip install --no-cache-dir maxminddb==3.1.1
COPY server.py /app/server.py
COPY static /app/static

ENV PORT=8787
ENV DB_PATH=/data/analytics.sqlite3
ENV STATS_TZ=Asia/Shanghai

VOLUME ["/data"]
EXPOSE 8787

CMD ["python", "/app/server.py"]
