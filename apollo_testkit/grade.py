"""Native tests/test.sh entrypoint: grade artifacts and write Harbor's reward contract."""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

from .control import Apollo
from .fixtures import definition, initialize

EVIDENCE = Path("/var/lib/apollo-evals")
WORKSPACE = Path("/workspace")
OUTPUT = Path("/logs/verifier")
CLASSES = {
    "java-client-typed-read": "TypedRead",
    "java-client-change-listener": "ChangeListenerApp",
    "java-client-cluster-precedence": "ClusterPrecedence",
    "java-client-mixed-namespace-formats": "MixedNamespaceFormats",
}


def check(name, category, passed, detail=None):
    result = {"name": name, "category": category, "passed": bool(passed)}
    if detail is not None:
        result["detail"] = str(detail)[-1000:]
    return result


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


def grade_cli(evidence, requests, commands, trajectory=()):
    state = evidence["state"]
    p, task = state["public"], state["task"]
    key, target = p["key"], evidence["target"]
    items = {item["key"]: item for item in target["items"] if item.get("key")}
    item = items.get(key, {})
    release = (target["release"] or {}).get("configurations", {})
    config = target["config"]
    successful = [" ".join(command["argv"]) for command in commands if command.get("exitCode") == 0]
    all_commands = ["apollo " + " ".join(command["argv"]) for command in commands] + list(trajectory)

    def observed(method, pattern):
        return any(
            r["method"] == method and re.search(pattern, r["path"]) and 200 <= r["status"] < 300
            for r in requests
        )

    def used(*pairs):
        return (
            all(any(re.search(r"\b" + pair + r"\b", command) for command in successful) for pair in pairs)
            and not any(raw_http(command) for command in all_commands)
            and any(r["surface"] == "portal" and 200 <= r["status"] < 300 for r in requests)
        )

    checks = []
    if task == "cli-config-publish":
        checks = [
            check(
                "item value and type",
                "outcome",
                item.get("value") == p["value"] and item.get("type") == p["type"],
            ),
            check("active release contains value", "outcome", release.get(key) == p["value"]),
            check("Config Service exposes value", "outcome", config.get(key) == p["value"]),
            check(
                "used apollo config set and release create",
                "interaction",
                used("config set", "release create"),
            ),
        ]
    elif task == "cli-auth-capability-scope":
        checks = [
            check(
                "scoped item value and string type",
                "outcome",
                item.get("value") == p["value"] and item.get("type") == 0,
            ),
            check("scoped release contains value", "outcome", release.get(key) == p["value"]),
            check("Config Service exposes scoped value", "outcome", config.get(key) == p["value"]),
            check(
                "queried token capabilities through Apollo CLI",
                "interaction",
                used("auth capabilities") and observed("GET", r"/user-tokens/(?:current/)?capabilities"),
            ),
            check(
                "used config and release resource commands",
                "interaction",
                used("config set", "release create"),
            ),
        ]
    elif task in ("cli-namespace-create-publish", "cli-public-namespace-share"):
        public = task == "cli-public-namespace-share"
        meta = next((m for m in evidence["appNamespaces"] if m["name"] == p["namespaceName"]), {})
        checks = [
            check(
                "public properties AppNamespace has exact name"
                if public
                else "private properties AppNamespace metadata",
                "outcome",
                meta.get("format", "").lower() == "properties" and meta.get("isPublic") is public,
            ),
            check(
                "shared item value and string type" if public else "namespace item value and type",
                "outcome",
                item.get("value") == p["value"] and item.get("type") == p.get("type", 0),
            ),
            check(
                "shared release contains value" if public else "active release contains value",
                "outcome",
                release.get(key) == p["value"],
            ),
            check(
                "provider Config Service exposes value" if public else "Config Service exposes value",
                "outcome",
                config.get(key) == p["value"],
            ),
        ]
        if public:
            checks.append(
                check(
                    "consumer reads public Namespace value",
                    "outcome",
                    evidence["consumer"].get(key) == p["value"],
                )
            )
        checks.append(
            check(
                "used namespace, config, and release resource commands"
                if public
                else "used namespace create, config set, and release create",
                "interaction",
                used("namespace create", "config set", "release create"),
            )
        )
        if public:
            baseline = state["consumerBaseline"]
            checks.append(
                check(
                    "consumer application baseline unchanged",
                    "boundary",
                    evidence["consumerBaseline"].get(baseline["key"]) == baseline["value"],
                )
            )
    elif task == "cli-config-sync-release":
        actual = {k: v["value"] for k, v in items.items()}
        source = {i["key"]: i["value"] for i in evidence["source"]["items"] if i.get("key")}
        checks = [
            check("target added updated and deleted exactly", "outcome", actual == state["expected"], actual),
            check("target active release equals source", "outcome", release == state["expected"]),
            check("source remained unchanged", "boundary", source == state["expected"]),
            check(
                "used config diff, apply, delete, and target release create",
                "interaction",
                used("config diff", "config apply", "config delete", "release create"),
            ),
        ]
    elif task == "cli-release-rollback":
        checks = [
            check("Config Service restored stable value", "outcome", config.get(key) == p["stableValue"]),
            check("active release restored stable value", "outcome", release.get(key) == p["stableValue"]),
            check(
                "bad release is no longer active",
                "outcome",
                not any(int(r["id"]) == int(state["badReleaseId"]) for r in evidence["activeReleases"]),
            ),
            check(
                "used release list and rollback",
                "interaction",
                used("release list", "release rollback") and observed("PUT", r"/releases/\d+/rollback"),
            ),
        ]
    else:
        raise ValueError(f"Unknown CLI task: {task}")
    checks.append(
        check("distractor unchanged", "boundary", evidence["distractor"].get(key) == state["distractorValue"])
    )
    return checks


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
                p = state["public"]
                api.put(p["targetApp"], p["key"], state["newValue"])
                api.release(p["targetApp"], "hidden-listener-update")
            elif data and data.get("event") == "change":
                change = data
        return ready, change, process.poll(), "".join(lines)
    finally:
        stop_group(process)
        reader.join(timeout=2)


def java_variant(task, state, api, compiled, source, dependency_ok, classpath, variant):
    p = state["public"]
    cache = f"/tmp/verify-cache-{variant}"
    shutil.rmtree(cache, ignore_errors=True)
    cmd = ["java", "-cp", f"/workspace/target/classes:{classpath}", "scenario." + CLASSES[task]]
    uses_http = bool(re.search(r"HttpClient|HttpURLConnection|java\.net\.http", source))
    checks = [check("locked apollo-client dependency", "interaction", dependency_ok)]
    explicit = bool(re.search(r"ConfigService\s*\.\s*getConfig\s*\(", source)) and not uses_http
    if task == "java-client-change-listener":
        checks.append(
            check(
                "uses Apollo change listener API",
                "interaction",
                bool(re.search(r"addChangeListener\s*\(", source)) and not uses_http,
            )
        )
    elif task == "java-client-cluster-precedence":
        checks.append(
            check(
                "uses cluster-aware Apollo Java Client read",
                "interaction",
                explicit and "apollo.cluster" in source,
            )
        )
    elif task == "java-client-mixed-namespace-formats":
        checks.append(
            check(
                "uses normal and file Apollo Java Client reads",
                "interaction",
                explicit
                and bool(re.search(r"getConfigFile\s*\(", source))
                and bool(re.search(r"ConfigFileFormat\s*\.\s*JSON", source)),
            )
        )
        checks.append(
            check(
                "uses typed YAML getters",
                "interaction",
                bool(re.search(r"getBooleanProperty\s*\(", source))
                and bool(re.search(r"getIntProperty\s*\(", source)),
            )
        )
    else:
        checks.append(check("explicit app and namespace ConfigService call", "interaction", explicit))
        checks.append(
            check(
                "uses typed getters",
                "interaction",
                all(
                    re.search(method + r"\s*\(", source)
                    for method in ("getIntProperty", "getBooleanProperty", "getProperty")
                ),
            )
        )
    checks.append(check("program compiles offline", "outcome", compiled))
    if task == "java-client-change-listener":
        ready, change, code, output = (
            run_listener(cmd + [p["targetApp"], "application", p["key"]], api, state, cache)
            if compiled
            else (None, None, None, "not compiled")
        )
        checks += [
            check(
                "ready exposes initial value",
                "outcome",
                ready is not None and ready.get("value") == state["initialValue"],
                ready,
            ),
            check(
                "listener reports exact change",
                "outcome",
                change is not None
                and all(
                    change.get(k) == v
                    for k, v in {
                        "key": p["key"],
                        "oldValue": state["initialValue"],
                        "newValue": state["newValue"],
                        "changeType": "MODIFIED",
                    }.items()
                ),
                change,
            ),
            check("program exits normally", "outcome", code == 0, output),
        ]
    elif task == "java-client-cluster-precedence":
        for cluster, expected, name in [
            (
                p["preferredCluster"],
                state["expected"]["preferredValue"],
                "preferred cluster overrides default",
            ),
            (p["missingCluster"], state["expected"]["defaultValue"], "missing cluster falls back to default"),
        ]:
            code, stdout, stderr = (
                run_program(cmd + [p["targetApp"], "application", p["key"], cluster], cache=cache + cluster)
                if compiled
                else (-1, "", "not compiled")
            )
            checks.append(
                check(
                    name,
                    "outcome",
                    code == 0 and json_output(stdout) == {"cluster": cluster, "value": expected},
                    stdout + stderr,
                )
            )
    else:
        args = (
            [p["targetApp"], "application", p["stringKey"], p["intKey"], p["booleanKey"], p["missingKey"]]
            if task == "java-client-typed-read"
            else [
                p["targetApp"],
                p["yamlNamespace"],
                p["jsonNamespace"],
                p["yamlBooleanKey"],
                p["yamlIntKey"],
            ]
        )
        code, stdout, stderr = run_program(cmd + args, cache=cache) if compiled else (-1, "", "not compiled")
        checks.append(
            check(
                "program reads correct typed values"
                if task == "java-client-typed-read"
                else "program reads YAML types and exact JSON file",
                "outcome",
                code == 0 and json_output(stdout) == state["expected"],
                stdout + stderr,
            )
        )
    return checks


def grade_java(task, evidence):
    state = evidence["state"]
    source_path = WORKSPACE / "src/main/java/scenario" / (CLASSES[task] + ".java")
    source = source_path.read_text() if source_path.is_file() else ""
    dependency_ok = safe_pom(WORKSPACE / "pom.xml")
    # Symlinks and agent-built binaries are not accepted as submissions.
    paths = list(WORKSPACE.rglob("*"))
    safe_files = not any(path.is_symlink() for path in paths)
    for path in [WORKSPACE, *paths]:
        if not path.is_symlink():
            os.chown(path, 1000, 1000)
    shutil.rmtree(WORKSPACE / "target", ignore_errors=True)
    code, stdout, stderr = (
        run_program(
            [
                "mvn",
                "-o",
                "-q",
                "compile",
                "dependency:build-classpath",
                "-Dmdep.outputFile=target/classpath.txt",
            ],
            timeout=120,
        )
        if dependency_ok and safe_files
        else (-1, "", "Invalid project or symlink")
    )
    compiled = code == 0
    (OUTPUT / "compile.txt").write_text(stdout + stderr)
    classpath = (WORKSPACE / "target/classpath.txt").read_text().strip() if compiled else ""
    api = Apollo()
    api.ready()
    variants = []
    for index, seed in enumerate((state["seed"], state["seed"] ^ 0xA5A5A5A5)):
        fresh = initialize(api, definition(task, seed))
        variants.append(java_variant(task, fresh, api, compiled, source, dependency_ok, classpath, index))
    merged = []
    for first, second in zip(*variants, strict=True):
        assert (first["name"], first["category"]) == (second["name"], second["category"])
        merged.append(
            check(
                first["name"],
                first["category"],
                first["passed"] and second["passed"],
                {"original": first, "hidden_variant": second},
            )
        )
    p = state["public"]
    merged.append(
        check(
            "distractor unchanged",
            "boundary",
            evidence["distractor"].get(p["key"]) == state["distractorValue"],
        )
    )
    (OUTPUT / "variants.json").write_text(json.dumps(variants, ensure_ascii=False, indent=2))
    return merged


def main(task):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    evidence = json.loads((EVIDENCE / "snapshot.json").read_text())
    if evidence["state"]["task"] != task:
        raise ValueError("Snapshot belongs to a different task")
    if task.startswith("cli-"):
        requests = read_json_lines(EVIDENCE / "requests.jsonl")
        commands = read_json_lines(Path("/logs/artifacts/cli-commands.jsonl"))
        trajectory_path = Path("/logs/agent/trajectory.json")
        trajectory = (
            trajectory_commands(json.loads(trajectory_path.read_text())) if trajectory_path.exists() else []
        )
        checks = grade_cli(evidence, requests, commands, trajectory)
    else:
        checks = grade_java(task, evidence)
    passed = bool(checks) and all(c["passed"] for c in checks)
    result = {"task": task, "seed": evidence["state"]["seed"], "passed": passed, "checks": checks}
    (OUTPUT / "checks.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    (OUTPUT / "reward.txt").write_text("1\n" if passed else "0\n")
    print(json.dumps({"task": task, "passed": passed, "checks": len(checks)}))


if __name__ == "__main__":
    main(sys.argv[1])
