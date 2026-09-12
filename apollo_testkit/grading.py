"""Shared evidence helpers and isolated Java execution for task-local graders."""

import json
import os
import re
import shutil
import signal
import subprocess
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

WORKSPACE = Path("/workspace")


def check(name, category, passed, detail=None):
    result = {"name": name, "category": category, "passed": bool(passed)}
    if detail is not None:
        result["detail"] = str(detail)[-1000:]
    return result


class Checks:
    """Build results in contract order without repeating names or categories."""

    def __init__(self, contract):
        self.contract = tuple(contract)
        self.results = []

    def add(self, passed, detail=None):
        if len(self.results) >= len(self.contract):
            raise ValueError("More checks were produced than declared")
        name, category = self.contract[len(self.results)]
        self.results.append(check(name, category, passed, detail))

    def finish(self):
        if len(self.results) != len(self.contract):
            raise ValueError(f"Produced {len(self.results)} of {len(self.contract)} declared checks")
        return self.results


def validate_checks(contract, checks):
    actual = [(item["name"], item["category"]) for item in checks]
    if actual != list(contract):
        raise ValueError(f"Case produced a different check contract: {actual!r}")


def read_json_lines(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def raw_http(command):
    text = command.replace("'", "").replace('"', "")
    boundary = r"(?:^|(?:&&|\|\||[;|\n])\s*|\s-(?:lc|c)\s+)"
    assignments = r"(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]+\s+)*"
    return bool(
        re.search(boundary + assignments + r"(?:[^\s;&|]*/)?(?:curl|wget|http)(?=\s|$)", text)
        or re.search(
            boundary
            + assignments
            + r"(?:[^\s;&|]*/)?apollo(?:\s+[^\s;&|]+)*\s+api\s+(?:get|post|put|patch|delete)(?=\s|$)",
            text,
        )
    )


def trajectory_commands(value):
    """Extract tool arguments, never prose claims or final answers, from ATIF."""
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key in ("command", "cmd", "bash_command") and isinstance(child, str):
                found.append(child)
            elif key in ("arguments", "parameters") and isinstance(child, str):
                try:
                    found.extend(trajectory_commands(json.loads(child)))
                except ValueError:
                    pass
            elif isinstance(child, (dict, list)):
                found.extend(trajectory_commands(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(trajectory_commands(child))
    return found


class CliEvidence:
    def __init__(self, evidence, requests, commands, trajectory=()):
        self.evidence = evidence
        self.state = evidence["state"]
        self.public = self.state["public"]
        self.target = evidence["target"]
        self.items = {item["key"]: item for item in self.target["items"] if item.get("key")}
        self.item = self.items.get(self.public["key"], {})
        self.release = (self.target["release"] or {}).get("configurations", {})
        self.config = self.target["config"]
        self.requests = requests
        self.successful = [" ".join(command["argv"]) for command in commands if command.get("exitCode") == 0]
        self.all_commands = ["apollo " + " ".join(command["argv"]) for command in commands] + list(trajectory)

    def observed(self, method, pattern):
        return any(
            request["method"] == method
            and re.search(pattern, request["path"])
            and 200 <= request["status"] < 300
            for request in self.requests
        )

    def used(self, *pairs):
        return (
            all(
                any(re.search(r"\b" + pair + r"\b", command) for command in self.successful) for pair in pairs
            )
            and not any(raw_http(command) for command in self.all_commands)
            and any(
                request["surface"] == "portal" and 200 <= request["status"] < 300 for request in self.requests
            )
        )


def safe_pom(path):
    """Use only the fixed dependency/compiler model, with no agent-selected build plugins."""
    try:
        root = ET.fromstring(path.read_text())
        ns = {"m": "http://maven.apache.org/POM/4.0.0"}
        deps = root.findall("m:dependencies/m:dependency", ns)
        if len(deps) != 1:
            return False
        dep = deps[0]
        if [dep.findtext("m:" + key, namespaces=ns) for key in ("groupId", "artifactId", "version")] != [
            "com.ctrip.framework.apollo",
            "apollo-client",
            "2.5.0",
        ]:
            return False
        if root.findall(".//m:extensions", ns) or root.findall("m:profiles", ns):
            return False
        for plugin in root.findall(".//m:plugin", ns):
            if (
                plugin.findtext("m:artifactId", namespaces=ns) != "maven-compiler-plugin"
                or plugin.find("m:executions", ns) is not None
            ):
                return False
        return True
    except (OSError, ET.ParseError):
        return False


def stop_group(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def child_env(cache):
    return {
        "PATH": os.environ["PATH"],
        "HOME": "/home/agent",
        "LANG": "C.UTF-8",
        "JAVA_HOME": os.environ.get("JAVA_HOME", "/opt/java/openjdk"),
        "APOLLO_META": "http://apollo:8080",
        "APOLLO_CACHE_DIR": str(cache),
        "MAVEN_OPTS": "-Dmaven.repo.local=/m2",
    }


def run_program(command, timeout=60, cache="/tmp/verify-cache"):
    process = subprocess.Popen(
        command,
        cwd=WORKSPACE,
        env=child_env(cache),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        user=1000,
        group=1000,
        extra_groups=[],
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return process.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        stop_group(process)
        stdout, stderr = process.communicate()
        return -1, stdout, stderr + "\nTimeout"
    finally:
        stop_group(process)


def json_output(stdout):
    for line in stdout.splitlines():
        if line.strip().startswith("{"):
            try:
                return json.loads(line)
            except ValueError:
                pass
    return None


def run_listener(command, api, state, cache):
    import queue
    import threading

    process = subprocess.Popen(
        command,
        cwd=WORKSPACE,
        env=child_env(cache),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        user=1000,
        group=1000,
        extra_groups=[],
        bufsize=1,
    )
    events = queue.Queue()

    def read_lines():
        for line in process.stdout:
            events.put(line)
        events.put(None)

    reader = threading.Thread(target=read_lines, daemon=True)
    reader.start()
    deadline, ready, change, lines = time.monotonic() + 80, None, None, []
    try:
        while time.monotonic() < deadline:
            try:
                line = events.get(timeout=0.5)
            except queue.Empty:
                continue
            if line is None:
                process.wait(timeout=2)
                break
            lines.append(line)
            data = json_output(line)
            if data and data.get("event") == "ready" and ready is None:
                ready = data
                public = state["public"]
                api.put(public["targetApp"], public["key"], state["newValue"])
                api.release(public["targetApp"], "hidden-listener-update")
            elif data and data.get("event") == "change":
                change = data
        return ready, change, process.poll(), "".join(lines)
    finally:
        stop_group(process)
        reader.join(timeout=2)


@dataclass
class JavaEvidence:
    state: dict
    api: object
    compiled: bool
    source: str
    dependency_ok: bool
    classpath: str
    variant: int
    class_name: str

    def __post_init__(self):
        self.cache = f"/tmp/verify-cache-{self.variant}"
        shutil.rmtree(self.cache, ignore_errors=True)

    @property
    def command(self):
        return ["java", "-cp", f"/workspace/target/classes:{self.classpath}", "scenario." + self.class_name]

    @property
    def uses_http(self):
        return bool(re.search(r"HttpClient|HttpURLConnection|java\.net\.http", self.source))

    @property
    def explicit_config(self):
        return bool(re.search(r"ConfigService\s*\.\s*getConfig\s*\(", self.source)) and not self.uses_http

    def run(self, arguments, *, cache_suffix=""):
        if not self.compiled:
            return -1, "", "not compiled"
        return run_program(self.command + list(arguments), cache=self.cache + cache_suffix)

    def listen(self, arguments):
        if not self.compiled:
            return None, None, None, "not compiled"
        return run_listener(self.command + list(arguments), self.api, self.state, self.cache)
