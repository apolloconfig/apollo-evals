#!/bin/sh
set -eu
cp /solution/ClusterPrecedence.java /workspace/src/main/java/scenario/ClusterPrecedence.java
mvn -o -q compile
