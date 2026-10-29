#!/usr/bin/env bash
# Run a one-off command inside the evia-beta VPC, with DATABASE_URL composed
# from the ${NAME_PREFIX}/database secret and exported.
#
# Why this exists: RDS (evia-beta-postgres) sits in private subnets and there is
# no VPN or bastion. `enable_execute_command` is false on both ECS services, so
# `aws ecs execute-command` is unavailable too. The only privileged path is
# `aws ecs run-task` with the api image, the private subnets and the ECS
# security group (which holds the 5432 egress rule to the VPC CIDR), plus a
# container command override.
#
# The secret's stored `database_url` field is password-redacted by design, so
# this script recomposes the URI from its parts (same logic as buildspec.yml
# post_build). `run-task` overrides cannot carry `secrets`, so the script
# registers a throwaway task-definition family (${NAME_PREFIX}-dbprobe) built
# from the api definition plus one extra secret (DB_SECRET_JSON = the whole
# JSON document), and deregisters it when done. The password never appears in a
# command line, an environment override, or a committed file.
#
# Usage:
#   scripts/in-vpc-db-task.sh -- '<shell command run in /app>'
#   scripts/in-vpc-db-task.sh --sql 'SELECT count(*) FROM "ToolRegistryEntry";'
#   scripts/in-vpc-db-task.sh --sql-file path/to/query.sql
#
# Optional:
#   --cluster NAME            (default evia-beta)
#   --task-definition FAMILY  definition to clone (default evia-beta-api)
#   --container NAME          container to clone/override (default api)
#   --timeout SECONDS         wait for the task to stop (default 900)
#   --log-group NAME          (default /ecs/evia-beta/api)
#   --keep                    leave the probe task definition registered
#
# Exit code is the container's exit code, so this is safe to use in CI.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
NAME_PREFIX="${NAME_PREFIX:-evia-beta}"
CLUSTER="${NAME_PREFIX}"
SOURCE_TASK_DEFINITION="${NAME_PREFIX}-api"
TIMEOUT=900
LOG_GROUP="/ecs/${NAME_PREFIX}/api"
SECRET_ID="${NAME_PREFIX}/database"
CONTAINER="api"
KEEP=0
SUBNETS="${SUBNETS:-subnet-040a4219855138e70,subnet-04873f206b25ea119}"
SECURITY_GROUP="${SECURITY_GROUP:-sg-0e2bcf3db41664230}"

COMMAND=""
SQL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; COMMAND="$1"; shift ;;
    --sql) SQL="$2"; shift 2 ;;
    --sql-file) SQL="$(cat "$2")"; shift 2 ;;
    --cluster) CLUSTER="$2"; shift 2 ;;
    --task-definition) SOURCE_TASK_DEFINITION="$2"; shift 2 ;;
    --container) CONTAINER="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --log-group) LOG_GROUP="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$COMMAND" ] && [ -n "$SQL" ]; then
  # There is no psql in the runtime image; use the pg client that ships with
  # @okuvu/prisma to run the query and print the rows as JSON.
  #
  # E16-S11: that JSON lands in /ecs/evia-beta/api, so every value passes
  # through scripts/redact-probe-rows.js first. A probe that selects an email or
  # a name (scripts/seed-beta-therapists.sql's `RETURNING email, id, name` did
  # exactly this) used to write personal data into the log group. The redactor
  # is shipped into the container base64-encoded, because the API image does not
  # carry the repo's scripts/ directory.
  # Both the redactor and the SQL travel gzip+base64'd: ECS rejects the whole
  # `overrides` document above 8192 characters, and the redactor alone is
  # 4.6KB as plain base64 (a 5.7KB .sql file blew the limit outright). Expanded
  # in-process with node's zlib so the script does not depend on a gzip binary
  # existing in the runtime image. No query parameters are passed, so
  # node-postgres uses the simple query protocol, which accepts several
  # statements in one call — which is what lets a whole seed file run at once.
  REDACT_GZ="$(gzip -9 < "${SCRIPT_DIR}/redact-probe-rows.js" | base64 | tr -d '\n')"
  SQL_GZ="$(printf '%s' "$SQL" | gzip -9 | base64 | tr -d '\n')"
  COMMAND=$(cat <<NODE
cd /app/packages/prisma
node -e '
const { Client } = require("pg");
const zlib = require("zlib");
const fs = require("fs");
const gunzip = (v) => zlib.gunzipSync(Buffer.from(v, "base64")).toString("utf8");
fs.writeFileSync("/tmp/redact-probe-rows.js", gunzip(process.env.REDACT_GZ));
const { scrub } = require("/tmp/redact-probe-rows.js");
const sql = process.env.IN_VPC_SQL_GZ ? gunzip(process.env.IN_VPC_SQL_GZ) : null;
if (!sql) { console.error("FATAL: no SQL supplied"); process.exit(2); }
(async () => {
  const c = new Client({ connectionString: process.env.PG_URL });
  await c.connect();
  const r = await c.query(sql);
  const rows = Array.isArray(r) ? (r[r.length - 1] || {}).rows : r.rows;
  console.log(JSON.stringify(scrub(rows || [])));
  await c.end();
})().catch((e) => { console.error("SQL_ERROR: " + e.message); process.exit(1); });
'
NODE
)
fi

if [ -z "$COMMAND" ]; then
  echo "usage: $0 -- '<command>' | --sql '<query>'" >&2
  exit 2
fi

WORKDIR="$(mktemp -d)"
TASKDEF_FILE="${WORKDIR}/taskdef.json"
NETWORK_FILE="${WORKDIR}/network.json"
OVERRIDES_FILE="${WORKDIR}/overrides.json"
trap 'rm -rf "$WORKDIR"' EXIT

SECRET_ARN="arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${SECRET_ID}"

# Compose DATABASE_URL inside the container from DB_SECRET_JSON. The parts are
# URL-quoted so a password containing @ : / ? still yields a valid URI.
COMPOSE=$(cat <<'SH'
export DATABASE_URL="$(node -e '
const s = JSON.parse(process.env.DB_SECRET_JSON);
const q = (v) => encodeURIComponent(String(v));
process.stdout.write(`postgresql://${q(s.username)}:${q(s.password)}@${s.host}:${s.port}/${s.dbname}?sslmode=require`);
')"
if [ -z "${DATABASE_URL}" ]; then echo "FATAL: could not compose DATABASE_URL"; exit 1; fi
# node-postgres (pg >= 8.16) treats sslmode=require as verify-full and rejects
# the RDS self-signed chain. Prisma is happy with sslmode=require, so keep
# DATABASE_URL as-is for Prisma and expose a libpq-compatible PG_URL for the
# pg-based probes.
export PG_URL="$(node -e 'const u = process.env.DATABASE_URL; process.stdout.write(u + (u.includes("?") ? "&" : "?") + "uselibpqcompat=true")')"
SH
)

export SUBNETS SECURITY_GROUP

aws ecs describe-task-definition --task-definition "$SOURCE_TASK_DEFINITION" --region "$REGION" \
  --query 'taskDefinition' --output json > "${WORKDIR}/source.json"

python3 - "$WORKDIR/source.json" "$TASKDEF_FILE" "$NETWORK_FILE" "$OVERRIDES_FILE" \
  "$CONTAINER" "$COMMAND" "$COMPOSE" "$SECRET_ARN" "${SQL_GZ}" "$NAME_PREFIX" "${REDACT_GZ}" <<'PY'
import json, os, sys

(source, taskdef_path, network_path, overrides_path, container,
 command, compose, secret_arn, sql_gz, prefix, redact_gz) = sys.argv[1:12]

with open(source) as f:
    td = json.load(f)

# Keep only the fields register-task-definition accepts.
keep = [
    "containerDefinitions", "cpu", "memory", "networkMode", "executionRoleArn",
    "taskRoleArn", "requiresCompatibilities", "runtimePlatform", "volumes",
    "ephemeralStorage", "pidMode", "proxyConfiguration",
]
clean = {k: td[k] for k in keep if k in td}
clean["family"] = f"{prefix}-dbprobe"

containers = []
for c in clean["containerDefinitions"]:
    if c.get("name") != container:
        continue  # drop sidecars; this family only ever runs the probe
    c = dict(c)
    c.pop("portMappings", None)
    secrets = [s for s in c.get("secrets", []) if s["name"] != "DB_SECRET_JSON"]
    # Plain ARN = the whole JSON document (no ":json-key::" suffix: ECS treats
    # an empty key as a malformed ARN).
    secrets.append({"name": "DB_SECRET_JSON", "valueFrom": secret_arn})
    c["secrets"] = secrets
    containers.append(c)
if not containers:
    sys.exit(f"container {container!r} not found in source task definition")

clean["containerDefinitions"] = containers
with open(taskdef_path, "w") as f:
    json.dump(clean, f)

with open(network_path, "w") as f:
    json.dump({
        "awsvpcConfiguration": {
            "subnets": os.environ["SUBNETS"].split(","),
            "securityGroups": [os.environ["SECURITY_GROUP"]],
            "assignPublicIp": "DISABLED",
        }
    }, f)

env = [{"name": "REDACT_GZ", "value": redact_gz}]
if sql_gz:
    env.append({"name": "IN_VPC_SQL_GZ", "value": sql_gz})
with open(overrides_path, "w") as f:
    json.dump({
        "containerOverrides": [{
            "name": container,
            "command": ["/bin/sh", "-c", compose + "\n" + command],
            "environment": env,
        }]
    }, f)
PY

REGISTERED="$(aws ecs register-task-definition --region "$REGION" \
  --cli-input-json "file://${TASKDEF_FILE}" \
  --query 'taskDefinition.taskDefinitionArn' --output text)"
echo "registered probe task definition ${REGISTERED}" >&2

deregister() {
  if [ "$KEEP" -eq 0 ]; then
    aws ecs deregister-task-definition --region "$REGION" \
      --task-definition "$REGISTERED" --query 'taskDefinition.status' --output text >/dev/null 2>&1 || true
    echo "deregistered ${REGISTERED}" >&2
  fi
}

TASK_ARN="$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$REGISTERED" \
  --launch-type FARGATE \
  --region "$REGION" \
  --started-by "in-vpc-db-task" \
  --network-configuration "file://${NETWORK_FILE}" \
  --overrides "file://${OVERRIDES_FILE}" \
  --query 'tasks[0].taskArn' --output text)"
echo "started ${TASK_ARN}" >&2

DEADLINE=$(( $(date +%s) + TIMEOUT ))
while :; do
  READ="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION" \
    --query 'tasks[0].[lastStatus,containers[0].exitCode,stoppedReason]' --output text)"
  STATUS="$(echo "$READ" | awk '{print $1}')"
  EXIT_CODE="$(echo "$READ" | awk '{print $2}')"
  if [ "$STATUS" = "STOPPED" ]; then break; fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "timeout waiting for ${TASK_ARN}" >&2
    deregister
    exit 3
  fi
  sleep 5
done

TASK_ID="${TASK_ARN##*/}"
aws logs get-log-events \
  --log-group-name "$LOG_GROUP" \
  --log-stream-name "${CONTAINER}/${CONTAINER}/${TASK_ID}" \
  --region "$REGION" --limit 500 \
  --query 'events[].message' --output text 2>/dev/null || \
  echo "(no log stream at ${LOG_GROUP} for ${TASK_ID})" >&2

deregister
exit "${EXIT_CODE:-1}"
