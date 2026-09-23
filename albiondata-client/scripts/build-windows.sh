#!/usr/bin/env bash

set -eo pipefail

# PATCH LOCAL (Albion Profit Pro): release identity and update policy are build
# inputs. The safe default is explicit and does not depend on an empty version.
BUILD_VERSION="${VERSION:-${GITHUB_REF_NAME:-dev}}"
BUILD_VERSION="${BUILD_VERSION#v}"
export VERSION="$BUILD_VERSION"
UPDATE_CHANNEL="${UPDATE_CHANNEL:-disabled}"
UPDATE_GITHUB_OWNER="${UPDATE_GITHUB_OWNER:-}"
UPDATE_GITHUB_REPO="${UPDATE_GITHUB_REPO:-}"
BUILD_PROFILE="${BUILD_PROFILE:-release}"
PUBLIC_INGEST_BASE_URL="${PUBLIC_INGEST_BASE_URL:-}"
CALCULATOR_URL="${CALCULATOR_URL:-}"
BUILD_LDFLAGS="-s -w -X main.version=${BUILD_VERSION} -X main.updateChannel=${UPDATE_CHANNEL} -X main.updateGithubOwner=${UPDATE_GITHUB_OWNER} -X main.updateGithubRepo=${UPDATE_GITHUB_REPO} -X github.com/ao-data/albiondata-client/client.buildProfile=${BUILD_PROFILE} -X github.com/ao-data/albiondata-client/client.releasePublicIngestBaseURL=${PUBLIC_INGEST_BASE_URL} -X github.com/ao-data/albiondata-client/client.releaseCalculatorURL=${CALCULATOR_URL}"

rm -f rsrc_windows_*
rm -f albiondata-client.exe
rm -f albiondata-client.*.bak
rm -f .albiondata-client.*.old

rm -f albiondata-client-amd64-installer.exe

go install github.com/tc-hib/go-winres@v0.3.1

export PATH="$PATH:/root/go/bin"

go-winres make

env GOOS=windows GOARCH=amd64 go build -ldflags "$BUILD_LDFLAGS" -o albiondata-client.exe -v -x albiondata-client.go

go-winres patch albiondata-client.exe

cd pkg/nsis
make nsis

cd ../..
ls -la albiondata-client*

cp albiondata-client.exe albiondata-client.exe.copy
gzip -9 albiondata-client.exe
mv albiondata-client.exe.gz update-windows-amd64.exe.gz
mv albiondata-client.exe.copy albiondata-client.exe

# PATCH LOCAL (Albion Profit Pro): checksums are release assets and can be
# verified before installation. Code signing remains a documented manual gate.
sha256sum update-windows-amd64.exe.gz > update-windows-amd64.exe.gz.sha256
sha256sum albiondata-client-amd64-installer.exe > albiondata-client-amd64-installer.exe.sha256
