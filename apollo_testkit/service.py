"""Fixture initialization, business-only proxy and trusted sidecar snapshots."""

import argparse
import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .control import Apollo, NoRedirect
from .fixtures import definition, initialize, snapshot

DATA = Path("/var/lib/apollo-evals")
LOCK = threading.Lock()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)


def public_fixture(state):
    public = dict(state["public"])
    if state["task"] == "cli-auth-capability-scope":
        public.pop("targetApp", None)
        public.pop("distractorApp", None)
    return {**public, "token": state.get("token", "")}


def serve():
    api = Apollo()
    api.ready()
    state = initialize(api, definition(os.environ["APOLLO_TASK"], int(os.environ["APOLLO_SEED"])))
    save(DATA / "state.json", state)
    (DATA / "requests.jsonl").write_text("")

    class Proxy(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            self.proxy()

        def do_POST(self):
            self.proxy()

        def do_PUT(self):
            self.proxy()

        def do_DELETE(self):
            self.proxy()

        def do_PATCH(self):
            self.proxy()

        def proxy(self):
            config = self.server.server_port == 8080
            if self.path == "/_task" and not config:
                self.reply(200, json.dumps(public_fixture(state)).encode())
                return
            if self.path == "/health":
                self.reply(200, b'{"status":"UP"}')
                return
            permitted = (
                self.path.startswith(("/configs/", "/configfiles/", "/notifications/", "/services/config"))
                if config
                else self.path.startswith("/openapi/v1/")
            )
            # Management credentials and Portal login are never exposed to the agent network.
            if not config and "/user-tokens" in self.path:
                permitted = self.command == "GET" and "/capabilities" in self.path
            if not permitted:
                self.reply(403, b'{"error":"This endpoint is outside the task interface"}')
                return
            headers = {
                k: v
                for k, v in self.headers.items()
                if k.lower() not in {"host", "content-length", "cookie", "accept-encoding"}
            }
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            request = urllib.request.Request(
                (api.config_service if config else api.portal) + self.path,
                data=body if self.command not in ("GET", "HEAD") else None,
                headers=headers,
                method=self.command,
            )
            status = 502
            try:
                try:
                    response = urllib.request.build_opener(NoRedirect).open(request, timeout=90)
                except urllib.error.HTTPError as error:
                    response = error
                status = response.code
                result = response.read()
                content_type = response.headers.get("Content-Type", "application/json")
                response.close()
                if config and self.path.startswith("/services/config") and status == 200:
                    services = json.loads(result)
                    for service in services:
                        service["homepageUrl"] = "http://gateway:8080/"
                        service["homePageUrl"] = "http://gateway:8080/"
                    result = json.dumps(services).encode()
                self.reply(status, result, content_type)
            except (OSError, ValueError) as error:
                self.reply(502, json.dumps({"error": type(error).__name__}).encode())
            finally:
                record = {
                    "method": self.command,
                    "path": self.path,
                    "status": status,
                    "surface": "config" if config else "portal",
                    "userAgent": self.headers.get("User-Agent", ""),
                    "time": time.time(),
                }
                with LOCK, (DATA / "requests.jsonl").open("a") as stream:
                    stream.write(json.dumps(record) + "\n")

        def reply(self, code, body, content_type="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    servers = [ThreadingHTTPServer(("0.0.0.0", port), Proxy) for port in (8070, 8080)]
    for server in servers[:-1]:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    servers[-1].serve_forever()


def collect():
    state = json.loads((DATA / "state.json").read_text())
    api = Apollo()
    api.login()
    save(DATA / "snapshot.json", snapshot(api, state))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["serve", "snapshot"])
    args = parser.parse_args()
    serve() if args.command == "serve" else collect()
