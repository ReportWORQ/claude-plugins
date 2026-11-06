#!/usr/bin/env bash
# rw-env: pull this person's environment variables from the ReportWORQ lab into each Claude session (lab ADR-0030).
#
#   rw-env.sh session-start   the SessionStart hook: sign in if needed, fetch, cache, write the variables
#   rw-env.sh refresh         the same, for the skill, in a running session
#   rw-env.sh list            names and where each came from, never a value
#
# Anything printed reaches Claude, so nothing here ever prints a value or a token. If the lab can't be reached, the
# last good values are used. The lab's address is fixed here on purpose and never read from the environment.
set -u
umask 077
LAB="https://lab.reportworq.com/env"
DIR="$HOME/.config/rw-env"
TOKEN="$DIR/token"
PENDING="$DIR/pending"
CACHE="$DIR/cache"
ETAG="$DIR/etag"
REFUSALS="$DIR/refusals"
CURL=(curl -sS --proto '=https' --max-time 3)

NAME_OK='^[A-Z][A-Z0-9_]{0,127}$'
LINE_OK='^[A-Z][A-Z0-9_]{0,127}	[A-Za-z0-9+/=]*	[a-z][a-z0-9-]{0,31}$'
# A name must say it holds a credential or a plain setting, because env vars can run code through whichever program
# reads them. The lab holds the same two lists.
ALLOWED='^.*_(KEY|AUTHKEY|TOKEN|SECRET|PASSWORD|PAT|EMAIL|USER|USERNAME|SUBDOMAIN|DOMAIN|URL|ID|ORG|TENANT|ACCOUNT|REGION|PROJECT|REPO)$'
REFUSED='^(BASH_.*|LD_.*|DYLD_.*|NODE_.*|PYTHON.*|PERL.*|RUBY.*|JAVA_.*|JDK_.*|GIT_.*|SSH_.*|SSL.*|CURL_.*|REQUESTS_.*|DOCKER_.*|NPM_.*|PIP_.*|UV_.*|CARGO_.*|RUSTC_.*|DOTNET_.*|XDG_.*|.*INDEX_URL|.*PROXY.*|ANTHROPIC_.*|CLAUDE_.*|RW_ENV_.*)$'
TOKEN_OK='^rwenv_[A-Za-z0-9_-]+$'
REFUSALS_BEFORE_FORGET=3

mkdir -p "$DIR" 2>/dev/null
chmod 700 "$DIR" 2>/dev/null
WORK="$(mktemp -d "$DIR/.work.XXXXXX")" || exit 0
trap 'rm -rf "$WORK"' EXIT

json_string() { # a device name is letters, digits and a little punctuation by the time it gets here
  printf '{"%s":"%s"}' "$1" "$2"
}

start_signin() {
  local name body code user
  name="$(hostname 2>/dev/null | LC_ALL=C tr -cd 'A-Za-z0-9._-' | cut -c1-60)"
  body="$(json_string name "${name:-this computer}" | "${CURL[@]}" -X POST -H 'Content-Type: application/json' -d @- "$LAB/device/start" 2>/dev/null)" || body=""
  code="$(printf '%s\n' "$body" | sed -n 's/^device_code \([A-Za-z0-9_-]*\)$/\1/p')"
  user="$(printf '%s\n' "$body" | sed -n 's/^user_code \([A-Z2-9-]*\)$/\1/p')"
  if [ -z "$code" ] || ! printf '%s' "$user" | grep -Eq '^[A-Z2-9]{4}-[A-Z2-9]{4}$'; then
    echo "rw-env: this computer isn't connected to the ReportWORQ lab yet, and the lab can't be reached right now, so shared keys aren't available in this session. If the user asks, the computer needs to be on Tailscale, and connecting happens at the start of a new session."
    return
  fi
  printf '%s\n%s\n' "$code" "$user" > "$PENDING"
  signin_message "$user"
}

signin_message() {
  echo "rw-env: this computer isn't connected to the ReportWORQ lab yet, so shared keys aren't available in this session. At the start of your first reply, tell the user, as a clickable link: to connect it, open $LAB/device?code=$1 , sign in with Google and press Allow; their keys will be there in their next new session."
}

# Finish a sign-in started by an earlier session. Answers: done, wait (message already printed), or none.
finish_signin() {
  [ -s "$PENDING" ] || { echo none; return; }
  local code user answer
  code="$(sed -n 1p "$PENDING")"
  user="$(sed -n 2p "$PENDING")"
  answer="$(json_string device_code "$code" | "${CURL[@]}" -X POST -H 'Content-Type: application/json' -d @- "$LAB/device/token" 2>/dev/null)" || answer=""
  case "$answer" in
    token\ rwenv_*)
      printf '%s\n' "${answer#token }" | tr -d '\r\n' > "$TOKEN"
      rm -f "$PENDING"
      echo done ;;
    pending*)
      signin_message "$user" >&3
      echo wait ;;
    "")
      echo "rw-env: couldn't reach the ReportWORQ lab, so this computer's sign-in isn't finished. Shared keys aren't available in this session." >&3
      echo wait ;;
    *)
      rm -f "$PENDING"
      echo none ;;
  esac
}

name_allowed() {
  printf '%s\n' "$1" | LC_ALL=C grep -Eq "$NAME_OK" &&
    printf '%s\n' "$1" | LC_ALL=C grep -Eq "$ALLOWED" &&
    ! printf '%s\n' "$1" | LC_ALL=C grep -Eq "$REFUSED"
}

# Fetch into the cache. Answers: 200 (new), 304 (same), gone (token refused), refused (person refused), offline.
fetch() {
  local tok status have=""
  tok="$(cat "$TOKEN" 2>/dev/null)"
  printf '%s\n' "$tok" | LC_ALL=C grep -Eq "$TOKEN_OK" || { echo gone; return; }
  [ -s "$ETAG" ] && [ -f "$CACHE" ] && have="$(cat "$ETAG")"
  # The token goes through a config on stdin, so it never shows in a process listing.
  status="$( { printf 'header = "Authorization: Bearer %s"\n' "$tok"
               [ -n "$have" ] && printf 'header = "If-None-Match: \\"%s\\""\n' "$have"; } |
             "${CURL[@]}" -K - -D "$WORK/headers" -o "$WORK/body" -w '%{http_code}' "$LAB/bundle" 2>/dev/null)" || status=""
  case "$status" in
    200)
      # Anything that isn't plainly a bundle is treated as no answer, so it can't empty the cache. A name this copy of
      # the hook doesn't allow is only skipped: the lab's list may have grown since this copy.
      etag="$(sed -n 's/^[Ee][Tt][Aa][Gg]: *"\([0-9a-f]\{32\}\)".*/\1/p' "$WORK/headers")"
      [ -n "$etag" ] || { echo offline; return; }
      : > "$WORK/clean"
      while IFS= read -r line || [ -n "$line" ]; do
        printf '%s\n' "$line" | LC_ALL=C grep -Eq "$LINE_OK" || { echo offline; return; }
        name_allowed "${line%%	*}" && printf '%s\n' "$line" >> "$WORK/clean"
      done < "$WORK/body"
      LC_ALL=C sort "$WORK/clean" > "$WORK/sorted"
      describe_changes
      mv -f "$WORK/sorted" "$CACHE"
      printf '%s\n' "$etag" > "$ETAG"
      rm -f "$REFUSALS"
      echo 200 ;;
    304) rm -f "$REFUSALS"; echo 304 ;;
    401) echo gone ;;
    403) echo refused ;;
    *) echo offline ;;
  esac
}

# One line for Claude to relay: names, never values.
describe_changes() {
  [ -f "$CACHE" ] || { [ -s "$WORK/sorted" ] && echo "rw-env: this computer is connected to the ReportWORQ lab; $(wc -l < "$WORK/sorted" | tr -d ' ') keys are set for this session." >&3; return; }
  local changed removed
  changed="$(LC_ALL=C comm -13 "$CACHE" "$WORK/sorted" | cut -f1 | LC_ALL=C sort -u | paste -sd, - | sed 's/,/, /g')"
  removed="$(LC_ALL=C comm -23 <(cut -f1 "$CACHE" | LC_ALL=C sort -u) <(cut -f1 "$WORK/sorted" | LC_ALL=C sort -u) | paste -sd, - | sed 's/,/, /g')"
  [ -n "$changed" ] && echo "rw-env: tell the user their environment updated: $changed changed." >&3
  [ -n "$removed" ] && echo "rw-env: tell the user these keys were removed from their environment: $removed." >&3
}

# Write the cache as shell into the session's environment file. Values are quoted here, never trusted as shell.
emit() {
  [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -f "$CACHE" ] || return 0
  local name b64 source value quote="'\\''"
  while IFS="$(printf '\t')" read -r name b64 source; do
    name_allowed "$name" || continue
    value="$(printf '%s' "$b64" | base64 --decode 2>/dev/null)" || continue
    value=${value//\'/$quote}
    # Single quotes mean the same in bash and zsh, which is what sources this on a Mac.
    printf "export %s='%s'\n" "$name" "$value" >> "$CLAUDE_ENV_FILE"
  done < "$CACHE"
}

forget() {
  rm -f "$TOKEN" "$CACHE" "$ETAG" "$PENDING" "$REFUSALS"
}

sync_now() {
  exec 3>&1
  local state result
  if [ ! -s "$TOKEN" ]; then
    state="$(finish_signin)"
    case "$state" in
      done) ;;
      wait) return ;;
      *) start_signin; return ;;
    esac
  fi
  result="$(fetch)"
  case "$result" in
    gone)
      forget
      echo "rw-env: the ReportWORQ lab no longer accepts this computer, so its saved keys were removed."
      start_signin
      return ;;
    refused)
      # The lab says this person has no access. One fault on the lab's side must not cost everyone their keys, so only
      # a refusal that lasts removes them.
      count=$(( $(cat "$REFUSALS" 2>/dev/null || echo 0) + 1 ))
      if [ "$count" -ge "$REFUSALS_BEFORE_FORGET" ]; then
        forget
        echo "rw-env: the ReportWORQ lab no longer gives this person access, so the keys saved on this computer were removed."
        return
      fi
      echo "$count" > "$REFUSALS"
      echo "rw-env: the ReportWORQ lab refused this person's access this time. Mention it only if a key seems to be missing." ;;
    offline)
      if [ -f "$CACHE" ]; then
        echo "rw-env: couldn't reach the ReportWORQ lab, so this session uses keys saved on $(date -r "$CACHE" '+%Y-%m-%d %H:%M' 2>/dev/null || echo 'an earlier date'). Mention this only if a key seems out of date."
      fi ;;
  esac
  [ "${1:-}" = refresh ] && [ "$result" = 304 ] && echo "rw-env: already up to date."
  [ "${1:-}" = refresh ] && [ "$result" = 200 ] && echo "rw-env: saved. New values take effect in the user's next new session."
  emit
}

case "${1:-}" in
  session-start) sync_now ;;
  refresh) sync_now refresh ;;
  list)
    if [ ! -s "$CACHE" ]; then
      echo "No keys saved on this computer yet."
    else
      while IFS="$(printf '\t')" read -r name _ source; do
        printf '%s (%s)\n' "$name" "$source"
      done < "$CACHE"
    fi ;;
  *) echo "usage: rw-env.sh session-start|refresh|list" ;;
esac
exit 0
