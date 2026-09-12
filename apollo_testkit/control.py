"""Administrative API used only inside the fixture and verifier services."""

import json
import time
import urllib.error
import urllib.parse
import urllib.request


class APIError(RuntimeError):
    def __init__(self, status, message):
        self.status = status
        super().__init__(f"Apollo HTTP {status}: {message[:400]}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Apollo:
    def __init__(self, host="apollo"):
        self.portal = f"http://{host}:8070"
        self.config_service = f"http://{host}:8080"
        self.cookie = ""

    def login(self):
        request = urllib.request.Request(
            self.portal + "/signin",
            data=b"username=apollo&password=admin",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            response = urllib.request.build_opener(NoRedirect).open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        cookie = response.headers.get("Set-Cookie", "")
        if response.code not in (200, 302) or not cookie:
            raise APIError(response.code, "Portal login failed")
        self.cookie = cookie.split(";", 1)[0]
        response.close()

    def request(self, path, method="GET", body=None, *, config=False):
        headers = {"Accept": "application/json"}
        if not config:
            headers["Cookie"] = self.cookie
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, separators=(",", ":")).encode()
        request = urllib.request.Request(
            (self.config_service if config else self.portal) + path,
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode()
        except urllib.error.HTTPError as error:
            raise APIError(error.code, error.read().decode(errors="replace")) from error
        return json.loads(raw) if raw else None

    def ready(self, timeout=180):
        deadline = time.monotonic() + timeout
        last = None
        while time.monotonic() < deadline:
            try:
                self.request("/health", config=True)
                self.login()
                try:
                    self.request(self.ns("SampleApp"))
                except APIError as error:
                    if error.status != 404:
                        raise
                return
            except (OSError, APIError, ValueError) as error:
                last = error
                time.sleep(1)
        raise TimeoutError(f"Apollo did not become ready: {last}")

    @staticmethod
    def ns(app, namespace="application", cluster="default"):
        q = lambda value: urllib.parse.quote(str(value), safe="")
        return f"/openapi/v1/envs/LOCAL/apps/{q(app)}/clusters/{q(cluster)}/namespaces/{q(namespace)}"

    def create_app(self, app):
        self.request(
            "/apps",
            "POST",
            {
                "appId": app,
                "name": app,
                "orgId": "TEST1",
                "orgName": "样例部门1",
                "ownerName": "apollo",
                "admins": ["apollo"],
            },
        )

    def token(self, app, *, scoped=False):
        body = {"name": f"eval-{app}", "appIds": [app], "envs": ["LOCAL"]}
        if scoped:
            body.update(
                operations=["config:read", "config:modify", "config:release"],
                namespaces=[
                    {
                        "appId": app,
                        "env": "LOCAL",
                        "clusterName": "default",
                        "namespaceName": "application",
                    }
                ],
            )
        return self.request("/openapi/v1/user-tokens", "POST", body)["tokenValue"]

    def app_namespace(self, app, name, fmt="properties", public=False):
        self.request(
            f"/openapi/v1/apps/{app}/appnamespaces",
            "POST",
            {
                "name": name,
                "appId": app,
                "format": fmt,
                "isPublic": public,
                "appendNamespacePrefix": not public,
                "comment": "apollo-evals",
            },
        )

    def namespace(self, app, namespace, cluster="default"):
        try:
            self.request(
                "/openapi/v1/namespaces",
                "POST",
                [
                    {
                        "appId": app,
                        "env": "LOCAL",
                        "clusterName": cluster,
                        "appNamespaceName": namespace,
                    }
                ],
            )
        except APIError as error:
            if "create namespace failed for" not in str(error):
                raise
            self.request(self.ns(app, namespace, cluster) + "?fillItemDetail=false")

    def cluster(self, app, cluster):
        self.request(
            f"/openapi/v1/envs/LOCAL/apps/{app}/clusters?operator=apollo",
            "POST",
            {
                "appId": app,
                "name": cluster,
                "dataChangeCreatedBy": "apollo",
                "dataChangeLastModifiedBy": "apollo",
            },
        )
        self.namespace(app, "application", cluster)

    def put(self, app, key, value, kind=0, namespace="application", cluster="default"):
        base = self.ns(app, namespace, cluster)
        body = {
            "key": key,
            "value": str(value),
            "type": kind,
            "dataChangeCreatedBy": "apollo",
            "dataChangeLastModifiedBy": "apollo",
        }
        try:
            self.request(
                base
                + "/items/"
                + urllib.parse.quote(key, safe="")
                + "?createIfNotExists=true&operator=apollo",
                "PUT",
                body,
            )
        except APIError as error:
            if error.status != 404:
                raise
            self.request(base + "/items?operator=apollo", "POST", body)

    def text(self, app, namespace, content):
        self.request(
            self.ns(app, namespace) + "/items?operator=apollo",
            "PUT",
            {
                "appId": app,
                "env": "LOCAL",
                "clusterName": "default",
                "namespaceName": namespace,
                "format": namespace.rsplit(".", 1)[-1],
                "configText": content,
                "operator": "apollo",
            },
        )

    def release(self, app, title, namespace="application", cluster="default"):
        return self.request(
            self.ns(app, namespace, cluster) + "/releases?operator=apollo",
            "POST",
            {
                "releaseTitle": title,
                "releaseComment": "apollo-evals",
                "releasedBy": "apollo",
                "isEmergencyPublish": False,
            },
        )

    def optional(self, path, *, config=False, default=None):
        try:
            return self.request(path, config=config)
        except APIError as error:
            if error.status == 404:
                return default
            raise

    def configuration(self, app, namespace="application", cluster="default"):
        data = self.optional(f"/configs/{app}/{cluster}/{namespace}", config=True, default={})
        return data.get("configurations", {})

    def snapshot_namespace(self, app, namespace="application", cluster="default"):
        base = self.ns(app, namespace, cluster)
        items = self.optional(base + "/items?page=0&size=500", default={}).get("content", [])
        return {
            "items": items,
            "release": self.optional(base + "/releases/latest"),
            "config": self.configuration(app, namespace, cluster),
        }
