#!/usr/bin/env python3
"""Build ordinary Docker images; Harbor owns every evaluation container and process."""

import argparse
import base64
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGES = {
    "agent": "images/Dockerfile.agent",
    "control": "images/Dockerfile.control",
    "verifier": "images/Dockerfile.verifier",
}


def image_id(name):
    return json.loads(subprocess.check_output(["docker", "image", "inspect", name], text=True))[0]


def prepare_codex():
    architecture = subprocess.check_output(
        ["docker", "info", "--format", "{{.Architecture}}"], text=True
    ).strip()
    arch = {"aarch64": "arm64", "arm64": "arm64", "x86_64": "x64", "amd64": "x64"}[architecture]
    locked = json.loads((ROOT / "artifacts.lock.json").read_text())["codex"]["linux"][arch]
    path = ROOT / ".cache/build/codex.tgz"
    path.parent.mkdir(parents=True, exist_ok=True)
    expected = locked["integrity"].removeprefix("sha512-")

    def valid():
        return (
            path.exists()
            and base64.b64encode(hashlib.sha512(path.read_bytes()).digest()).decode() == expected
        )

    if not valid():
        temporary = path.with_suffix(".partial")
        print(f"Downloading locked Codex executable for Linux {arch}", flush=True)
        with urllib.request.urlopen(locked["url"], timeout=120) as response, temporary.open("wb") as output:
            while block := response.read(1024 * 1024):
                output.write(block)
        temporary.replace(path)
        if not valid():
            path.unlink()
            raise ValueError("Codex package integrity mismatch")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Rebuild without Docker layer cache")
    args = parser.parse_args()
    subprocess.run(["docker", "compose", "version"], check=True)
    codex_sha = prepare_codex()
    for name, dockerfile in IMAGES.items():
        command = ["docker", "build", "-f", dockerfile, "-t", f"apollo-evals/{name}:0.2.0"]
        if name == "agent":
            command += ["--build-arg", f"CODEX_ARCHIVE_SHA256={codex_sha}"]
        if args.force:
            command.append("--no-cache")
        subprocess.run(command + ["."], cwd=ROOT, check=True)
    inputs = [
        *ROOT.glob("images/*"),
        *ROOT.glob("apollo_testkit/*.py"),
        *ROOT.glob("tasks/*/case.py"),
    ]
    record = {
        "images": {},
        "sources": {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(inputs)
            if p.is_file()
        },
    }
    for name in IMAGES:
        ref = f"apollo-evals/{name}:0.2.0"
        data = image_id(ref)
        record["images"][ref] = {"id": data["Id"], "architecture": data["Architecture"], "os": data["Os"]}
    destination = ROOT / ".cache/images.json"
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(record, indent=2) + "\n")
    print(f"Prepared image identities: {destination}")


if __name__ == "__main__":
    main()
