#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY="https://github.com/burnoutberni/WikiCollab.git"
HEALTH_URL="https://wikicollab.toolforge.org/api/health"

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

toolforge envvars create APP_VERSION "$VERSION"

echo "Starting Toolforge build from ${VERSION}..."

toolforge build start \
  --ref "$VERSION" \
  "$REPOSITORY"

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
