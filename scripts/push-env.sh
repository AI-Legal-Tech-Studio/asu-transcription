#!/usr/bin/env bash
set -uo pipefail

declare -a VARS=(
  "ANTHROPIC_API_KEY"
  "OPENROUTER_API_KEY"
  "OPENAI_API_KEY"
  "GOOGLE_API_KEY"
  "XAI_API_KEY"
  "SESSION_SECRET"
  "AUTH_USER_1_EMAIL"
  "AUTH_USER_1_PASSWORD_HASH"
  "AUTH_USER_2_EMAIL"
  "AUTH_USER_2_PASSWORD_HASH"
  "SUMMARY_MODEL"
  "TRANSCRIPTION_MODEL"
  "DATABASE_URL"
  "BLOB_READ_WRITE_TOKEN"
)

get_val() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" .env | head -1)
  [ -z "$line" ] && return 1
  local val="${line#*=}"
  if [[ "$val" == \"*\" ]]; then
    val="${val:1:${#val}-2}"
  fi
  val="${val//\\\$/\$}"
  printf '%s' "$val"
}

for key in "${VARS[@]}"; do
  val=$(get_val "$key") || { echo "skip $key"; continue; }
  for target in production preview development; do
    # Remove first (ignore failure if not present), then add
    vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    if echo "== $key -> $target" && vercel env add "$key" "$target" --value "$val" --yes 2>&1 | tail -1; then
      :
    fi
  done
done
