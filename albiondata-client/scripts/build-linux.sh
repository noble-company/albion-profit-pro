#!/usr/bin/env bash

set -eo pipefail

# PATCH LOCAL (Albion Profit Pro): explicit, fail-closed release metadata.
BUILD_VERSION="${VERSION:-${GITHUB_REF_NAME:-dev}}"
BUILD_VERSION="${BUILD_VERSION#v}"
UPDATE_CHANNEL="${UPDATE_CHANNEL:-disabled}"
UPDATE_GITHUB_OWNER="${UPDATE_GITHUB_OWNER:-}"
UPDATE_GITHUB_REPO="${UPDATE_GITHUB_REPO:-}"
BUILD_PROFILE="${BUILD_PROFILE:-release}"
PUBLIC_INGEST_BASE_URL="${PUBLIC_INGEST_BASE_URL:-}"
CALCULATOR_URL="${CALCULATOR_URL:-}"
BUILD_LDFLAGS="-s -w -X main.version=${BUILD_VERSION} -X main.updateChannel=${UPDATE_CHANNEL} -X main.updateGithubOwner=${UPDATE_GITHUB_OWNER} -X main.updateGithubRepo=${UPDATE_GITHUB_REPO} -X github.com/ao-data/albiondata-client/client.buildProfile=${BUILD_PROFILE} -X github.com/ao-data/albiondata-client/client.releasePublicIngestBaseURL=${PUBLIC_INGEST_BASE_URL} -X github.com/ao-data/albiondata-client/client.releaseCalculatorURL=${CALCULATOR_URL}"

sudo apt-get update && sudo apt-get install -y libpcap-dev patchelf

env | sort

go build -ldflags "$BUILD_LDFLAGS" albiondata-client.go
patchelf --replace-needed libpcap.so.0.8 libpcap.so albiondata-client

./albiondata-client -version

cp albiondata-client albiondata-client.old
gzip -9 albiondata-client
mv albiondata-client.gz update-linux-amd64.gz
mv albiondata-client.old albiondata-client
sha256sum update-linux-amd64.gz > update-linux-amd64.gz.sha256 # PATCH LOCAL (Albion Profit Pro)
