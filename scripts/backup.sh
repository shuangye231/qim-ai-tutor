#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$APP_DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/qima-data-$STAMP.tar.gz" -C "$APP_DIR" data static
echo "Backup created: $BACKUP_DIR/qima-data-$STAMP.tar.gz"
