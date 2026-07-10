FROM python:3.12-alpine

WORKDIR /app
COPY server.py /app/server.py

ENV PORT=8787
ENV DB_PATH=/data/analytics.sqlite3
ENV STATS_TZ=Asia/Shanghai

VOLUME ["/data"]
EXPOSE 8787

CMD ["python", "/app/server.py"]
