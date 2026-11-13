#!/usr/bin/env python3
"""Read-only host audit of Sibol's actual Docker isolation after deployment."""
import json
import re
import subprocess
import sys
import urllib.request

RESOURCE = "q52xajsad67xkcmtdwjto1uu"
EXPECTED_NETWORKS = {
    "postgres": {"database"}, "backup-init": {"database"}, "migrate": {"database"},
    "server": {"application", "database"}, "web": {"application", "edge"},
    "backup": {"database"}, "mailpit": {"application"}, "tunnel": {"edge"},
}
CREDENTIAL_KEYS = {"POSTGRES_PASSWORD", "DATABASE_URL", "BETTER_AUTH_SECRET", "SMTP_URL", "TUNNEL_TOKEN", "PGPASSWORD", "BACKUP_AGE_RECIPIENT"}
EXPECTED_CREDENTIALS = {
    "postgres": {"POSTGRES_PASSWORD"}, "backup-init": {"PGPASSWORD", "BACKUP_AGE_RECIPIENT"},
    "migrate": {"DATABASE_URL"}, "server": {"DATABASE_URL", "BETTER_AUTH_SECRET", "SMTP_URL"},
    "web": set(), "backup": {"PGPASSWORD", "BACKUP_AGE_RECIPIENT"},
    "mailpit": set(), "tunnel": {"TUNNEL_TOKEN"},
}
EXPECTED_VOLUMES = {
    "postgres": {"/var/lib/postgresql/data": RESOURCE + "_sibol-data"},
    "backup-init": {"/backups": RESOURCE + "_sibol-backups"},
    "backup": {"/backups": RESOURCE + "_sibol-backups"},
    "mailpit": {"/data": RESOURCE + "_sibol-mail"},
}


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True, stderr=subprocess.DEVNULL)


def audit():
    ids = docker("ps", "-aq", "--filter", "label=coolify.applicationUuid=" + RESOURCE).split()
    if not ids:
        raise RuntimeError("No Sibol containers found")
    containers = json.loads(docker("inspect", *ids))
    seen = set()
    revision = None
    for container in containers:
        labels = container["Config"]["Labels"]
        service = labels.get("com.docker.compose.service")
        if service not in EXPECTED_NETWORKS or service in seen:
            raise RuntimeError("Unexpected or duplicate Sibol service")
        seen.add(service)
        if labels.get("com.docker.compose.project") != RESOURCE:
            raise RuntimeError("Compose project differs from the fixed production project")
        if container["HostConfig"].get("PortBindings"):
            raise RuntimeError(service + " publishes a host port")
        networks = set(container["NetworkSettings"]["Networks"])
        expected = {RESOURCE + "_" + n for n in EXPECTED_NETWORKS[service]}
        # Exited one-shot jobs have no live network endpoint. Their configured
        # network remains in HostConfig and the long-running services are checked.
        if container["State"]["Running"] and networks != expected:
            raise RuntimeError(service + " is attached to an unexpected network")
        env = dict(entry.split("=", 1) for entry in container["Config"]["Env"])
        if set(env) & CREDENTIAL_KEYS != EXPECTED_CREDENTIALS[service]:
            raise RuntimeError(service + " has unexpected credential keys")
        for target, volume in EXPECTED_VOLUMES.get(service, {}).items():
            if not any(m.get("Name") == volume and m["Destination"] == target for m in container["Mounts"]):
                raise RuntimeError(service + " lost its preserved volume mount")
        state = container["State"]
        if service in {"backup-init", "migrate"}:
            if state["Status"] != "exited" or state["ExitCode"] != 0:
                raise RuntimeError(service + " did not complete successfully")
        elif not state["Running"] or (state.get("Health") and state["Health"]["Status"] != "healthy"):
            raise RuntimeError(service + " is not healthy")
        if service == "server":
            revision = env.get("SIBOL_RELEASE_SHA", "")
    if seen != set(EXPECTED_NETWORKS):
        raise RuntimeError("Missing production services")
    network = json.loads(docker("network", "inspect", RESOURCE + "_database"))[0]
    if not network["Internal"]:
        raise RuntimeError("PostgreSQL network is not internal")
    if not re.fullmatch(r"[a-f0-9]{40}", revision or ""):
        raise RuntimeError("API has no validated runtime revision")
    req = urllib.request.Request("https://sibol.shintakino.qzz.io/api/health/ready", headers={"User-Agent": "Sibol-release", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as response:
        health = json.load(response)
    if health != {"status": "ready", "release": revision}:
        raise RuntimeError("Public readiness differs from the running source revision")
    print(json.dumps({"revision": revision, "services": len(seen), "internalDatabase": True, "restrictedCredentials": True, "preservedVolumes": True, "noPublishedPorts": True, "healthy": True}))


if __name__ == "__main__":
    try:
        audit()
    except (RuntimeError, subprocess.CalledProcessError, OSError, ValueError, KeyError) as error:
        # Never print inspect payloads, command output or environment values.
        print("Live deployment audit failed: " + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
