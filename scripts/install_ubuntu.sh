#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [[ "$(id -u)" -eq 0 ]]; then SUDO=""; else SUDO="sudo"; fi
if [[ ! -r /etc/os-release ]] || ! grep -qi '^ID=ubuntu' /etc/os-release; then
  echo "This installer supports Ubuntu only."; exit 1
fi
if [[ "$(dpkg --print-architecture)" != "amd64" ]]; then
  echo "This delivery package targets Ubuntu x86_64 (amd64)."; exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Installing Docker Engine..."
  $SUDO apt-get update
  $SUDO apt-get install -y ca-certificates curl openssl
  curl -fsSL https://get.docker.com | $SUDO sh
fi
$SUDO systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin not found. Installing it..."
  $SUDO apt-get update
  $SUDO apt-get install -y docker-compose-plugin
fi

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if $SUDO docker info >/dev/null 2>&1; then DOCKER=($SUDO docker); else
    echo "Docker daemon is not available. Log out/in and rerun this script."; exit 1
  fi
fi

mkdir -p data static .hf-cache
$SUDO chown -R 1000:1000 data static .hf-cache
DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
if [[ ! -f .env ]]; then
  read -r -s -p "Set the administrator key (leave blank to generate one): " ADMIN_KEY; echo
  if [[ -z "$ADMIN_KEY" ]]; then
    ADMIN_KEY="$(openssl rand -hex 32)"
    echo "Generated administrator key: $ADMIN_KEY"
  fi
  read -r -s -p "Set the AI API key (required for AI features, leave blank to configure later): " PRO_KEY; echo
  read -r -p "AI base URL [https://api.ccode.vip/v1]: " BASE_URL
  BASE_URL="${BASE_URL:-https://api.ccode.vip/v1}"
  cat > .env <<EOF
ADMIN_API_KEY=$ADMIN_KEY
PRO_API_KEY=$PRO_KEY
CCODE_API_KEY=
CLOUD_BASE_URL=$BASE_URL
FREE_DAILY_QUESTIONS=5
PAYMENT_PROVIDER=mock
HF_ENDPOINT=https://huggingface.co
OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
HF_OFFLINE=0
DOCKER_GID=$DOCKER_GID
EOF
  chmod 600 .env
else
  echo ".env already exists; keeping the existing configuration."
  if ! grep -q '^DOCKER_GID=' .env; then echo "DOCKER_GID=$DOCKER_GID" >> .env; fi
fi

echo "Pulling code-runner images used by the OJ feature..."
"${DOCKER[@]}" pull python:3.12-slim
"${DOCKER[@]}" pull gcc:14-bookworm
echo "Building and starting Qima AI Tutor..."
"${DOCKER[@]}" compose up -d --build
"${DOCKER[@]}" compose ps
echo "Ready: http://SERVER_IP:8899"
