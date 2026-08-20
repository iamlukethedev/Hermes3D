#!/usr/bin/env bash
#
# Install the Hermes3D office bridge into every Hermes profile.
#
# Plugins are scoped to a HERMES_HOME, and each Hermes profile has its own, so
# a plugin installed only in the default home stays silent for every other
# agent. This copies the plugin into the default home plus each profile and
# enables it in all of them. Re-running is safe.
#
# Usage:  ./install.sh            install and enable everywhere
#         ./install.sh --uninstall  remove it everywhere

set -euo pipefail

PLUGIN_NAME="hermes3d-office-bridge"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
UNINSTALL=0
[[ "${1:-}" == "--uninstall" ]] && UNINSTALL=1

find_hermes() {
  if command -v hermes >/dev/null 2>&1; then
    command -v hermes
    return 0
  fi
  if [[ -x "$HERMES_ROOT/hermes-agent/hermes" ]]; then
    echo "$HERMES_ROOT/hermes-agent/hermes"
    return 0
  fi
  return 1
}

if ! HERMES_BIN="$(find_hermes)"; then
  echo "error: could not find the 'hermes' command." >&2
  echo "       Add it to PATH, or set HERMES_ROOT to your Hermes install." >&2
  exit 1
fi

if [[ ! -d "$HERMES_ROOT" ]]; then
  echo "error: no Hermes home at $HERMES_ROOT" >&2
  exit 1
fi

# Every target: the default home, then one per profile. A profile flag of ""
# means the default profile.
targets=("$HERMES_ROOT|")
if [[ -d "$HERMES_ROOT/profiles" ]]; then
  for profile_dir in "$HERMES_ROOT"/profiles/*/; do
    [[ -d "$profile_dir" ]] || continue
    targets+=("${profile_dir%/}|$(basename "$profile_dir")")
  done
fi

for target in "${targets[@]}"; do
  home="${target%%|*}"
  profile="${target##*|}"
  label="${profile:-default}"
  dest="$home/plugins/$PLUGIN_NAME"

  if (( UNINSTALL )); then
    if [[ -n "$profile" ]]; then
      "$HERMES_BIN" -p "$profile" plugins disable "$PLUGIN_NAME" >/dev/null 2>&1 || true
    else
      "$HERMES_BIN" plugins disable "$PLUGIN_NAME" >/dev/null 2>&1 || true
    fi
    rm -rf "$dest"
    echo "  removed from $label"
    continue
  fi

  mkdir -p "$home/plugins"
  rm -rf "$dest"
  cp -R "$SOURCE_DIR" "$dest"
  rm -f "$dest/install.sh"

  if [[ -n "$profile" ]]; then
    "$HERMES_BIN" -p "$profile" plugins enable "$PLUGIN_NAME" >/dev/null 2>&1 || true
  else
    "$HERMES_BIN" plugins enable "$PLUGIN_NAME" >/dev/null 2>&1 || true
  fi
  echo "  installed for $label"
done

if (( UNINSTALL )); then
  echo
  echo "Done. Restart the backend to unload it."
  exit 0
fi

echo
if ! grep -qs 'HERMES_DASHBOARD_SESSION_TOKEN' "$HERMES_ROOT/.env"; then
  echo "WARNING: HERMES_DASHBOARD_SESSION_TOKEN is not pinned in $HERMES_ROOT/.env."
  echo "         Without it the backend mints a random token each start and the"
  echo "         office cannot subscribe. Pin one with:"
  echo
  echo "           echo \"HERMES_DASHBOARD_SESSION_TOKEN=\$(openssl rand -hex 32)\" >> $HERMES_ROOT/.env"
  echo
fi
echo "Done. Restart the backend so the plugin loads."
