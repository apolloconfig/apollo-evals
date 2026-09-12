from apollo_testkit.control import APIError, Apollo
from apollo_testkit.fixtures import definition, initialize


class RecordingApollo:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            if name == "token":
                return "ephemeral-test-token"
            return {"id": 42}

        return call


def test_scoped_fixture_requests_only_required_capabilities():
    api = RecordingApollo()
    state = initialize(api, definition("cli-auth-capability-scope", 123))
    calls = [c for c in api.calls if c[0] == "token"]
    assert calls == [("token", (state["public"]["targetApp"],), {"scoped": True})]


def test_java_fixture_does_not_grant_management_token():
    api = RecordingApollo()
    initialize(api, definition("java-client-typed-read", 123))
    assert not any(c[0] == "token" for c in api.calls)


def test_namespace_reads_only_suppress_real_not_found():
    api = Apollo()

    def error(path, **kwargs):
        raise APIError(503, "backend unavailable")

    api.request = error
    try:
        api.optional("/test")
    except APIError as exception:
        assert exception.status == 503
    else:
        raise AssertionError("infrastructure error was treated as empty state")


def test_snapshot_accepts_the_servers_active_release_array():
    from apollo_testkit.fixtures import snapshot

    state = definition("cli-release-rollback", 123)
    api = RecordingApollo()
    api.ns = Apollo.ns
    api.snapshot_namespace = lambda *args, **kwargs: {"items": [], "release": None, "config": {}}
    api.configuration = lambda *args: {}
    api.request = lambda path: [{"id": 1}, {"id": 2}]
    assert snapshot(api, state)["activeReleases"] == [{"id": 1}, {"id": 2}]
    api.request = lambda path: {"content": [{"id": 3}]}
    assert snapshot(api, state)["activeReleases"] == [{"id": 3}]
