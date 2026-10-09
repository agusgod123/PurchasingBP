#!/bin/sh
# Memanggil /api/cron/<job> dengan CRON_SECRET; log ringkas ke stdout container.
job="$1"
out=$(curl -fsS -m 55 -H "Authorization: Bearer ${CRON_SECRET}" "${APP_INTERNAL_URL}/api/cron/${job}" 2>&1) \
  && echo "[cron:${job}] $(date '+%F %T') ${out}" \
  || echo "[cron:${job}] $(date '+%F %T') GAGAL: ${out}"
