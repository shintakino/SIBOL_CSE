#!/usr/bin/env python3
"""Deploy one CI-validated main revision to the scoped Coolify application."""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = "shintakino/SIBOL_CSE"
ORIGIN = "https://sibol.shintakino.qzz.io"

class ReleaseError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        return None

OPENER = urllib.request.build_opener(NoRedirect())

def request(url, method="GET", data=None, token=None):
    headers = {"Accept": "application/json", "User-Agent": "Sibol-release", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(), method=method, headers=headers)
    try:
        with OPENER.open(req, timeout=45) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise ReleaseError("API response exceeded the permitted size")
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        raise ReleaseError(f"API request returned HTTP {error.code}") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise ReleaseError("API request failed or returned invalid JSON") from None

def main():
    revision = os.environ.get("SIBOL_DEPLOY_SHA", os.environ.get("GITHUB_SHA", ""))
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ReleaseError("A full source SHA is required")
    resource = os.environ.get("COOLIFY_APPLICATION_UUID", "")
    if not re.fullmatch(r"[a-z0-9]{20,32}", resource):
        raise ReleaseError("Invalid Coolify application UUID")
    base = os.environ.get("COOLIFY_API_URL", "https://sibol-deploy.shintakino.qzz.io/api/v1").rstrip("/")
    parsed = urllib.parse.urlparse(base)
    if (parsed.scheme, parsed.netloc, parsed.path) not in [
        ("https", "sibol-deploy.shintakino.qzz.io", "/api/v1"),
        ("http", "127.0.0.1:8001", "/api/v1"),
    ]:
        raise ReleaseError("Refusing an untrusted deployment API origin")
    token = os.environ.get("COOLIFY_TOKEN", "")
    if not token or "\n" in token:
        raise ReleaseError("A scoped Coolify token is required")
    head = request(f"https://api.github.com/repos/{REPOSITORY}/git/ref/heads/main")
    if head["object"]["sha"] != revision:
        print("Skipped superseded main revision")
        return
    app = request(f"{base}/applications/{resource}", token=token)
    if app.get("uuid") != resource or app.get("build_pack") != "dockercompose" or app.get("git_branch") != "main":
        raise ReleaseError("Coolify resource differs from the expected application")
    source = app.get("git_repository", "").removesuffix(".git").rstrip("/")
    if source not in [f"https://github.com/{REPOSITORY}", REPOSITORY]:
        raise ReleaseError("Coolify source repository differs from Sibol")
    if app.get("docker_compose_location") != "/docker-compose.coolify.yml":
        raise ReleaseError("Unexpected production Compose location")
    # Compose parsing may persist defaults for Coolify's SOURCE_COMMIT variable.
    # Own the runtime revision explicitly instead of relying on that default.
    request(f"{base}/applications/{resource}/envs/bulk", "PATCH", {"data": [{
        "key": "SIBOL_RELEASE_SHA", "value": revision, "is_preview": False,
        "is_buildtime": False, "is_runtime": True, "is_literal": True,
    }]}, token)
    request(f"{base}/applications/{resource}", "PATCH", {"git_commit_sha": revision}, token)
    queued = request(f"{base}/deploy", "POST", {"uuid": resource}, token)
    entries = queued.get("deployments", [])
    deployment = entries[0].get("deployment_uuid") if entries else None
    if not deployment or not re.fullmatch(r"[a-zA-Z0-9-]+", deployment):
        raise ReleaseError("Coolify did not acknowledge a deployment")
    print(f"Queued source {revision[:12]} in Coolify ({deployment})", flush=True)
    deadline = time.monotonic() + 1800
    finished = False
    while time.monotonic() < deadline:
        time.sleep(10)
        try:
            state = request(f"{base}/deployments/{deployment}", token=token)
            status = state.get("status")
            if status in ["failed", "cancelled", "canceled"]:
                raise ReleaseError(f"Coolify deployment {status}; inspect its private logs")
            if status == "finished":
                finished = True
                health = request(f"{ORIGIN}/api/health/ready?release={revision}")
                if health.get("status") == "ready" and health.get("release") == revision:
                    break
        except ReleaseError as error:
            if "deployment failed" in str(error) or "deployment cancel" in str(error):
                raise
            # Tunnel replacement may briefly interrupt polling during a deployment.
    else:
        raise ReleaseError("Deployment did not become ready with the expected source revision")
    if not finished:
        raise ReleaseError("Missing successful Coolify deployment receipt")
    req = urllib.request.Request(ORIGIN + "/sign-in", headers={"Cache-Control": "no-cache", "User-Agent": "Sibol-release"})
    try:
        with OPENER.open(req, timeout=30) as response:
            if response.status != 200:
                raise ReleaseError("Public sign-in verification failed")
    except (urllib.error.URLError, TimeoutError):
        raise ReleaseError("Public sign-in verification failed") from None
    receipt = {"revision": revision, "deployment": deployment, "origin": ORIGIN, "ready": True, "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    Path("deployment-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Verified {ORIGIN} at {revision[:12]}")

if __name__ == "__main__":
    try:
        main()
    except ReleaseError as error:
        print(f"Deployment failed: {error}", file=sys.stderr)
        sys.exit(1)
