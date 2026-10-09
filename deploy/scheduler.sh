#!/bin/sh
# Penjadwal sederhana untuk paket Docker: memanggil endpoint cron aplikasi dan
# membuat backup harian (pg_dump + arsip dokumen). Zona waktu mengikuti TZ.
set -eu
apk add --no-cache curl tzdata >/dev/null 2>&1 || true

cat > /etc/crontabs/root <<CRON
*/10 * * * * /deploy/call-cron.sh outbox
5 8-17 * * 1-5 /deploy/call-cron.sh approvals
0 6 * * * /deploy/call-cron.sh daily
30 1 * * * /deploy/backup.sh
CRON

echo "[scheduler] aktif ($(date))"
exec crond -f -l 8
