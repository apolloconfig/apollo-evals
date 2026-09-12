#!/bin/sh
set -eu
cd /workspace
python3 -m apollo_testkit.grade java-client-cluster-precedence
