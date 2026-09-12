#!/bin/sh
set -eu
cp /solution/TypedRead.java /workspace/src/main/java/scenario/TypedRead.java
mvn -o -q compile
