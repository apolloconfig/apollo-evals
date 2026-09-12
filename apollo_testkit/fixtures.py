"""Deterministic domain data. Seeds describe task variants, not agent retries."""

import base64
import hashlib
import json

LABELS = {
    "cli-config-publish": "cli-set",
    "cli-release-rollback": "cli-rollback",
    "cli-namespace-create-publish": "cli-namespace",
    "cli-config-sync-release": "cli-sync",
    "cli-public-namespace-share": "cli-public",
    "cli-auth-capability-scope": "cli-capability",
    "java-client-typed-read": "java-typed",
    "java-client-change-listener": "java-listener",
    "java-client-cluster-precedence": "java-cluster",
    "java-client-mixed-namespace-formats": "java-formats",
}


class Random:
    def __init__(self, seed):
        self.seed = seed
        self.state = (seed & 0xFFFFFFFF) or 0x9E3779B9

    def next(self):
        x = self.state
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= x >> 17
        x ^= (x << 5) & 0xFFFFFFFF
        self.state = x & 0xFFFFFFFF
        return self.state / 4294967296

    def token(self, prefix, length=10):
        value = self.next()
        number = str(value) if value else "0"
        digest = hashlib.sha256(f"{self.seed}:{prefix}:{number}".encode()).hexdigest()
        return f"{prefix}-{digest[:length]}"

    def integer(self, low, high):
        return int(self.next() * (high - low + 1)) + low


def definition(task, seed):
    rng = Random(seed)
    app = rng.token("scenario-" + LABELS[task], 10).lower()
    public = {
        "targetApp": app,
        "distractorApp": app + "-shadow",
        "key": rng.token("key", 8).replace("-", ".", 1),
        "portalUrl": "http://gateway:8070",
    }
    state = {"task": task, "seed": seed, "public": public, "distractorValue": rng.token("do-not-touch", 12)}
    rng = Random(seed)
    if task == "cli-config-publish":
        public.update(value=str(rng.integer(10000, 99999)), type=1, releaseTitle=rng.token("release", 8))
    elif task == "cli-auth-capability-scope":
        public.update(value=rng.token("scoped-value", 12), releaseTitle=rng.token("scoped-release", 8))
    elif task == "cli-release-rollback":
        public.update(stableValue=rng.token("stable", 10), badValue=rng.token("wrong", 10))
    elif task == "cli-namespace-create-publish":
        value = json.dumps(
            {"enabled": True, "percentage": rng.integer(10, 90), "label": rng.token("variant", 8)},
            separators=(",", ":"),
        )
        public.update(
            value=value,
            namespaceName=rng.token("feature", 8).lower(),
            type=3,
            releaseTitle=rng.token("namespace-release", 8),
        )
    elif task == "cli-config-sync-release":
        public["targetCluster"] = rng.token("canary", 6).lower()
        state["expected"] = {
            public["key"]: rng.token("updated", 8),
            rng.token("created-key", 6): rng.token("created-value", 8),
            rng.token("kept-key", 6): rng.token("kept-value", 8),
        }
        public["releaseTitle"] = rng.token("sync-release", 8)
    elif task == "cli-public-namespace-share":
        public["consumerApp"] = rng.token("consumer", 10).lower()
        state["consumerBaseline"] = {
            "key": rng.token("consumer-baseline", 8).replace("-", ".", 1),
            "value": rng.token("consumer-value", 12),
        }
        public.update(
            namespaceName=rng.token("shared", 10).lower(),
            value=rng.token("shared-value", 12),
            releaseTitle=rng.token("shared-release", 8),
        )
    elif task == "java-client-typed-read":
        public.update(
            stringKey=rng.token("str-key", 6),
            intKey=rng.token("int-key", 6),
            booleanKey=rng.token("bool-key", 6),
            missingKey=rng.token("missing-key", 6),
        )
        state["expected"] = {
            "string": rng.token("string-value", 10),
            "int": rng.integer(100, 999),
            "boolean": rng.integer(0, 1) == 1,
            "missing": "fallback-value",
        }
    elif task == "java-client-change-listener":
        state.update(initialValue=rng.token("initial", 10), newValue=rng.token("updated", 10))
    elif task == "java-client-cluster-precedence":
        public.update(
            preferredCluster=rng.token("canary", 8).lower(), missingCluster=rng.token("missing", 8).lower()
        )
        state["expected"] = {
            "preferredValue": rng.token("cluster-value", 12),
            "defaultValue": rng.token("default-value", 12),
        }
    elif task == "java-client-mixed-namespace-formats":
        public.update(
            yamlNamespace=rng.token("yaml", 8).lower() + ".yml",
            jsonNamespace=rng.token("json", 8).lower() + ".json",
            yamlBooleanKey="feature.enabled",
            yamlIntKey="feature.limit",
        )
        enabled, limit = rng.integer(0, 1) == 1, rng.integer(100, 999)
        state["jsonText"] = json.dumps(
            {"mode": rng.token("mode", 8), "retries": rng.integer(2, 9), "enabled": rng.integer(0, 1) == 1},
            separators=(",", ":"),
        )
        state["expected"] = {
            "yamlEnabled": enabled,
            "yamlLimit": limit,
            "jsonBase64": base64.b64encode(state["jsonText"].encode()).decode(),
        }
    if task.startswith("java-"):
        public.update(mavenRepo="/m2", apolloJavaVersion="2.5.0")
    return state


def initialize(api, state):
    p = state["public"]
    app, key, task = p["targetApp"], p["key"], state["task"]
    api.create_app(app)
    api.create_app(p["distractorApp"])
    api.put(p["distractorApp"], key, state["distractorValue"])
    api.release(p["distractorApp"], "distractor-baseline")
    if task.startswith("cli-"):
        state["token"] = api.token(app, scoped=task == "cli-auth-capability-scope")
    if task == "cli-release-rollback":
        api.put(app, key, p["stableValue"])
        api.release(app, "known-good")
        api.put(app, key, p["badValue"])
        state["badReleaseId"] = api.release(app, "accidental-bad-release")["id"]
    elif task == "cli-config-sync-release":
        for k, v in state["expected"].items():
            api.put(app, k, v)
        api.release(app, "source-current")
        api.cluster(app, p["targetCluster"])
        api.put(app, key, "stale-value", cluster=p["targetCluster"])
        api.put(app, "obsolete.key", "delete-me", cluster=p["targetCluster"])
        api.release(app, "target-stale", cluster=p["targetCluster"])
    elif task == "cli-public-namespace-share":
        api.create_app(p["consumerApp"])
        api.put(p["consumerApp"], **state["consumerBaseline"])
        api.release(p["consumerApp"], "consumer-baseline")
    elif task == "java-client-typed-read":
        for key_field, field in [("stringKey", "string"), ("intKey", "int"), ("booleanKey", "boolean")]:
            value = state["expected"][field]
            api.put(app, p[key_field], str(value).lower() if isinstance(value, bool) else value)
        api.release(app, "java-typed-values")
    elif task == "java-client-change-listener":
        api.put(app, key, state["initialValue"])
        api.release(app, "listener-initial")
    elif task == "java-client-cluster-precedence":
        api.put(app, key, state["expected"]["defaultValue"])
        api.release(app, "default-cluster-baseline")
        api.cluster(app, p["preferredCluster"])
        api.put(app, key, state["expected"]["preferredValue"], cluster=p["preferredCluster"])
        api.release(app, "preferred-cluster-value", cluster=p["preferredCluster"])
    elif task == "java-client-mixed-namespace-formats":
        e = state["expected"]
        for field, fmt in [("yamlNamespace", "yml"), ("jsonNamespace", "json")]:
            name = p[field]
            api.app_namespace(app, name.rsplit(".", 1)[0], fmt)
            api.namespace(app, name)
            content = (
                f"feature:\n  enabled: {str(e['yamlEnabled']).lower()}\n  limit: {e['yamlLimit']}\n"
                if fmt == "yml"
                else state["jsonText"]
            )
            api.text(app, name, content)
            api.release(app, fmt + "-format-baseline", name)
    return state


def snapshot(api, state):
    p, task = state["public"], state["task"]
    app, namespace = p["targetApp"], p.get("namespaceName", "application")
    result = {
        "state": {k: v for k, v in state.items() if k != "token"},
        "target": api.snapshot_namespace(app, namespace, p.get("targetCluster", "default")),
        "distractor": api.configuration(p["distractorApp"]),
    }
    if task in ("cli-namespace-create-publish", "cli-public-namespace-share"):
        result["appNamespaces"] = api.request(f"/openapi/v1/apps/{app}/appnamespaces")
    if task == "cli-config-sync-release":
        result["source"] = api.snapshot_namespace(app)
    if task == "cli-public-namespace-share":
        result["consumer"] = api.configuration(p["consumerApp"], namespace)
        result["consumerBaseline"] = api.configuration(p["consumerApp"])
    if task == "cli-release-rollback":
        releases = api.request(api.ns(app) + "/releases/active?page=0&size=100")
        result["activeReleases"] = releases if isinstance(releases, list) else releases["content"]
        if not isinstance(result["activeReleases"], list):
            raise ValueError("Invalid active-release response")
    return result
