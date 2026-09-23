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

apt-get update && apt-get install -y libpcap-dev zip

export OSXCROSS_NO_INCLUDE_PATH_WARNINGS=1
export MACOSX_DEPLOYMENT_TARGET=10.6
export CC=/usr/osxcross/bin/o64-clang
export CXX=/usr/osxcross/bin/o64-clang++
export GOOS=darwin
export GOARCH=amd64 CGO_ENABLED=1
go build -ldflags "$BUILD_LDFLAGS" albiondata-client.go


gzip -k9 albiondata-client
mv albiondata-client.gz update-darwin-amd64.gz


# Creates a zipped folder with a run.command file that runs the client under sudo
TEMP="albiondata-client"
ZIPNAME="albiondata-client-amd64-mac.zip"
rm -rfv ./scripts/$TEMP
rm -rfv ./$ZIPNAME
rm -rfv ./scripts/update-darwin-amd64.zip
mkdir -v ./scripts/$TEMP
cp -v albiondata-client ./scripts/$TEMP/albiondata-client-executable
cd scripts
cp -v run.command ./$TEMP/run.command
chown -Rv ${USER}:${USER} ./$TEMP
chmod -v 777 ./$TEMP/*
zip -v ../$ZIPNAME -r ./"$TEMP"
cd ..
sha256sum update-darwin-amd64.gz > update-darwin-amd64.gz.sha256 # PATCH LOCAL (Albion Profit Pro)
sha256sum "$ZIPNAME" > "$ZIPNAME.sha256" # PATCH LOCAL (Albion Profit Pro)

# In theory the following works to create an app but there was a permissions issue when opening on the mac
# APP_NAME="Albion Data Client"
# TEMP="$APP_NAME".app
# ZIPNAME="albiondata-client-amd64-mac.zip"

# rm -rfv ./scripts/"$TEMP"
# rm -rfv ./scripts/"$ZIPNAME"
# mkdir -pv ./scripts/"$TEMP"/Contents/MacOS
# cp -v albiondata-client-darwin-10.6-amd64 ./scripts/"$TEMP"/Contents/MacOS/"$APP_NAME"
# chown -Rv ${USER}:${USER} ./scripts/"$TEMP"
# chmod -v 777 ./scripts/"$TEMP"/*

# cd scripts
# zip -v ../$ZIPNAME -r ./"$TEMP"
