#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../desktop/connect"
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags='-s -w -H windowsgui' -o ../../public/downloads/DropsoConnect.exe .
cd ../..
python3 scripts/connect/package.py
