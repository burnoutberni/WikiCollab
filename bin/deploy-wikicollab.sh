#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY="https://github.com/burnoutberni/WikiCollab.git"
HEALTH_URL="https://wikicollab.toolforge.org/api/health"

command -v python3 >/dev/null || {
  echo "Deployment failed: python3 is required to parse Toolforge build responses." >&2
  exit 1
}

echo "Resolving latest release tag..."

VERSION="$(
  git ls-remote \
    --refs \
    --tags \
    --sort='-version:refname' \
    "$REPOSITORY" \
    'v[0-9]*' |
    while read -r _ ref; do
      echo "${ref#refs/tags/}"
      break
    done
)"

if [[ -z "$VERSION" ]]; then
  echo "Deployment failed: could not resolve latest release tag." >&2
  exit 1
fi

echo "Deploying ${VERSION} to Toolforge..."

echo "Starting Toolforge build from ${VERSION}..."

build_response="$(toolforge build start --detach --json \
  --ref "$VERSION" \
  "$REPOSITORY")"

if ! BUILD_ID="$(python3 -c '
import json, sys
name = json.load(sys.stdin)["new_build"]["name"]
if not isinstance(name, str) or not name.strip():
    raise ValueError("Missing build name")
print(name)
' <<< "$build_response")"; then
  echo "Deployment failed: could not identify the new Toolforge build." >&2
  exit 1
fi

# Following logs can exit successfully even when the build failed. Check the
# status of this exact build rather than trusting the log stream or latest build.
toolforge build logs --follow "$BUILD_ID"

build_status="unknown"
for attempt in $(seq 1 120); do
  status_response="$(toolforge build show --json "$BUILD_ID")"
  if ! build_status="$(python3 -c '
import json, sys
status = json.load(sys.stdin)["build"]["status"]
if not isinstance(status, str):
    raise ValueError("Missing build status")
print(status)
' <<< "$status_response")"; then
    echo "Deployment failed: could not read status for build ${BUILD_ID}." >&2
    exit 1
  fi

  case "$build_status" in
    ok) break ;;
    pending|running) sleep 5 ;;
    *)
      echo "Deployment failed: build ${BUILD_ID} has status '${build_status}'." >&2
      exit 1
      ;;
  esac
done

if [[ "$build_status" != "ok" ]]; then
  echo "Deployment failed: timed out waiting for build ${BUILD_ID} to succeed." >&2
  exit 1
fi

toolforge envvars create APP_VERSION "$VERSION"

echo "Build succeeded. Restarting webservice..."

toolforge webservice buildservice restart

echo "Waiting for health endpoint..."

for attempt in $(seq 1 30); do
  if response="$(curl \
    --silent \
    --show-error \
    --fail \
    --max-time 10 \
    "$HEALTH_URL")" && [[ "$response" == *"\"version\":\"${VERSION}\""* ]]
  then
    echo
    echo "$response"
    echo "Deployment completed successfully."
    exit 0
  fi

  echo "Health check attempt ${attempt}/30 did not report ${VERSION}; retrying..."
  sleep 5
done

echo "Deployment failed: health endpoint did not report ${VERSION}." >&2
echo "Recent webservice logs:" >&2

toolforge webservice buildservice logs 2>&1 | tail -n 100 >&2 || true

exit 1
