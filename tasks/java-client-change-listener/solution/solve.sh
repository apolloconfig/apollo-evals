#!/bin/sh
set -eu
cp /solution/ChangeListenerApp.java /workspace/src/main/java/scenario/ChangeListenerApp.java
mvn -o -q compile
