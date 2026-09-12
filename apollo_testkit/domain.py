"""Shared deterministic data and common Apollo fixture operations."""

import hashlib

DISTRACTOR_CHECK = ("distractor unchanged", "boundary")


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


def base_definition(task, label, seed):
    rng = Random(seed)
    app = rng.token("scenario-" + label, 10).lower()
    public = {
        "targetApp": app,
        "distractorApp": app + "-shadow",
        "key": rng.token("key", 8).replace("-", ".", 1),
        "portalUrl": "http://gateway:8070",
    }
    return {
        "task": task,
        "seed": seed,
        "public": public,
        "distractorValue": rng.token("do-not-touch", 12),
    }


def initialize_base(api, state, *, token=False, scoped=False):
    public = state["public"]
    app, key = public["targetApp"], public["key"]
    api.create_app(app)
    api.create_app(public["distractorApp"])
    api.put(public["distractorApp"], key, state["distractorValue"])
    api.release(public["distractorApp"], "distractor-baseline")
    if token:
        state["token"] = api.token(app, scoped=scoped)
    return state


def base_snapshot(api, state):
    public = state["public"]
    namespace = public.get("namespaceName", "application")
    return {
        "state": {key: value for key, value in state.items() if key != "token"},
        "target": api.snapshot_namespace(
            public["targetApp"], namespace, public.get("targetCluster", "default")
        ),
        "distractor": api.configuration(public["distractorApp"]),
    }


def distractor_unchanged(evidence):
    state = evidence["state"]
    return evidence["distractor"].get(state["public"]["key"]) == state["distractorValue"]
