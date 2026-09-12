#!/bin/sh
set -eu
cp /solution/MixedNamespaceFormats.java /workspace/src/main/java/scenario/MixedNamespaceFormats.java
mvn -o -q compile
