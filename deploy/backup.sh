#!/bin/sh
# Backup harian: database (format custom pg_dump) + arsip dokumen.
# Simpan juga salinan di luar server (NAS/cloud) — backup di mesin yang sama bukan backup.
set -eu
stamp=$(date +%Y%m%d-%H%M)
mkdir -p /backups
pg_dump -Fc -f "/backups/db-${stamp}.dump"
tar -czf "/backups/dokumen-${stamp}.tar.gz" -C /data storage
find /backups -type f -mtime +"${BACKUP_KEEP_DAYS:-30}" -delete
echo "[backup] $(date '+%F %T') selesai: db-${stamp}.dump, dokumen-${stamp}.tar.gz"
