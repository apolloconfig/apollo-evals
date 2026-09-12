#!/bin/sh
set -eu
cd /workspace
python3 -m apollo_testkit.grade cli-config-sync-release
