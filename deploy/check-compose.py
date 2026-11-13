#!/usr/bin/env python3
"""Validate the persistent production boundary without production credentials."""
import json
import os
import subprocess

env = dict(os.environ, POSTGRES_PASSWORD="ci-placeholder-only", DATABASE_URL="postgresql://sibol:ci-placeholder-only@postgres:5432/sibol", BETTER_AUTH_SECRET="ci-placeholder-secret-at-least-32-characters", BACKUP_AGE_RECIPIENT="age1-ci-placeholder", TUNNEL_TOKEN="ci-placeholder-only", SOURCE_COMMIT="a" * 40)
result = subprocess.run(["docker", "compose", "--env-file", "/dev/null", "-f", "docker-compose.coolify.yml", "config", "--format", "json"], env=env, capture_output=True, text=True, check=True)
config = json.loads(result.stdout)
assert set(config["volumes"]) == {"sibol_data", "sibol_backups"}, "Persistent volume identities must be preserved"
assert config["networks"]["database"]["internal"], "PostgreSQL network must remain internal"
services = config["services"]
assert all(not service.get("ports") for service in services.values()), "Production services must not publish host ports"
assert services["postgres"]["volumes"][0]["target"] == "/var/lib/postgresql/data"
assert services["server"]["depends_on"]["migrate"]["condition"] == "service_completed_successfully"
assert services["migrate"]["depends_on"]["backup-init"]["condition"] == "service_completed_successfully"
assert services["backup-init"]["entrypoint"] == ["/usr/local/bin/backup-once.sh"]
assert "profiles" not in services["migrate"], "Release migrations must be an explicit single prerequisite job"
print("Production Compose storage, migration, backup and network boundaries passed")
