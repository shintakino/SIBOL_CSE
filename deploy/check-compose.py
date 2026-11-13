#!/usr/bin/env python3
"""Validate the persistent production boundary without production credentials."""
import json
import os
import re
from pathlib import Path
import subprocess

env = dict(os.environ, POSTGRES_PASSWORD="ci-placeholder-only", DATABASE_URL="postgresql://sibol:ci-placeholder-only@postgres:5432/sibol", BETTER_AUTH_SECRET="ci-placeholder-secret-at-least-32-characters", BACKUP_AGE_RECIPIENT="age1-ci-placeholder", TUNNEL_TOKEN="ci-placeholder-only", SIBOL_RELEASE_SHA="a" * 40)
result = subprocess.run(["docker", "compose", "--env-file", "/dev/null", "-f", "docker-compose.coolify.yml", "config", "--format", "json"], env=env, capture_output=True, text=True, check=True)
config = json.loads(result.stdout)
assert set(config["volumes"]) == {"sibol_data", "sibol_backups", "sibol_mail"}, "Persistent volume identities must be preserved"
assert config["networks"]["database"]["internal"], "PostgreSQL network must remain internal"
services = config["services"]
assert all(not service.get("ports") for service in services.values()), "Production services must not publish host ports"
assert services["postgres"]["volumes"][0]["target"] == "/var/lib/postgresql/data"
assert services["server"]["depends_on"]["migrate"]["condition"] == "service_completed_successfully"
assert services["migrate"]["depends_on"]["backup-init"]["condition"] == "service_completed_successfully"
assert services["backup-init"]["entrypoint"] == ["/usr/local/bin/backup-once.sh"]
assert services["mailpit"]["environment"]["MP_DATABASE"] == "/data/mailpit.db"
assert services["mailpit"]["volumes"][0]["source"] == "sibol_mail"
assert "profiles" not in services["migrate"], "Release migrations must be an explicit single prerequisite job"
print("Production Compose storage, migration, backup and network boundaries passed")

resource = "q52xajsad67xkcmtdwjto1uu"
assert config["name"] == resource
for key, suffix in [("sibol_data", "sibol-data"), ("sibol_backups", "sibol-backups"), ("sibol_mail", "sibol-mail")]:
    volume = config["volumes"][key]
    assert volume.get("external") and volume["name"] == f"{resource}_{suffix}", "Existing production volumes must be attached by their exact external name"
expected_networks = {
    "postgres": {"database"}, "backup-init": {"database"}, "migrate": {"database"},
    "server": {"application", "database"}, "web": {"application", "edge"},
    "backup": {"database"}, "mailpit": {"application"}, "tunnel": {"edge"},
}
for name, service in services.items():
    assert set(service["networks"]) == expected_networks[name]
    assert not service.get("env_file"), "No service may receive the full runtime env file"
    assert service["labels"]["coolify.applicationUuid"] == resource
    assert service["container_name"] == f"{name}-{resource}"
print("Raw Compose ownership, exact external volumes and per-service networks passed")

# Coolify 4.7.5's raw parser appends list labels; mapping labels would become
# mixed numeric/string mappings and Docker Compose would reject the result.
label_blocks = re.findall(r"^    labels:\n((?:      .+\n)+)", Path("docker-compose.coolify.yml").read_text(), re.MULTILINE)
assert len(label_blocks) == len(services)
assert all(all(line.startswith("      - ") for line in block.splitlines()) for block in label_blocks)
print("Installed Coolify raw-parser label compatibility passed")

# The CI control plane must survive replacement of every application container.
gateway_env = dict(env, SIBOL_DEPLOY_TUNNEL_TOKEN="ci-placeholder-only")
gateway = json.loads(subprocess.check_output(["docker", "compose", "--env-file", "/dev/null", "-f", "deploy/docker-compose.gateway.yml", "config", "--format", "json"], env=gateway_env, text=True))
assert gateway["name"] == "sibol-deploy-gateway"
assert set(gateway["services"]) == {"gateway"}
gateway_service = gateway["services"]["gateway"]
assert not gateway_service.get("ports")
assert set(gateway_service["environment"]) == {"TUNNEL_TOKEN"}
assert gateway_service["read_only"] and gateway_service["restart"] == "unless-stopped"
assert set(gateway_service["networks"]) == {"default"}
print("Independent deployment gateway isolation passed")
