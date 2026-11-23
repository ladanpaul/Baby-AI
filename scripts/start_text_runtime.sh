#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PYTHON="$ROOT_DIR/.venv-text/bin/python"
DEFAULT_MODEL="mlx-community/Qwen2.5-3B-Instruct-4bit"
MODEL="${1:-${CHAT_MODEL:-$DEFAULT_MODEL}}"
HOST="${CHAT_RUNTIME_HOST:-127.0.0.1}"
PORT="${CHAT_RUNTIME_PORT:-8080}"
MAX_TOKENS="${CHAT_RUNTIME_MAX_TOKENS:-2048}"

if [ ! -x "$VENV_PYTHON" ]; then
  echo "Missing $VENV_PYTHON" >&2
  echo "Create the text runtime venv first before starting the server." >&2
  exit 1
fi

cd "$ROOT_DIR"

exec "$VENV_PYTHON" -m mlx_lm server \
  --model "$MODEL" \
  --host "$HOST" \
  --port "$PORT" \
  --max-tokens "$MAX_TOKENS"
