#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# E15-S8 — prove the Container-Insights-free task-stop alert path, end to end.
#
# Run this AFTER the E15-S8 apply has landed. It answers one question with
# evidence rather than assertion: does an ECS task that dies on the evia-beta
# cluster reach the ops SNS topic, and from there the ops SQS sink, through the
# EventBridge rule rather than through CloudWatch?
#
# What it does, in order:
#   1. preflight (read-only) — rule enabled, target is the ops topic, the topic
#      policy admits events.amazonaws.com for that rule, Container Insights is
#      actually off, the three running-tasks-low alarms are actually gone, the
#      sink queue exists. Any miss stops the run before anything is started.
#   2. registers a throwaway task definition (family <prefix>-verify-task-stop)
#      from the image the api service is already running, whose container is
#      `/bin/sh -c 'exit 3'` — it cannot open a port, touch the database or
#      reach any Okuvu code path.
#   3. run-task with that definition in the SAME subnets and security group as
#      the live api service, so the pull path and network placement are the
#      production ones.
#   4. waits for a message in the ops sink whose detail.taskArn is that task,
#      then prints the SNS envelope's event fields: task ARN, stopCode,
#      stoppedReason, exit code, and the elapsed time.
#   5. deregisters the throwaway task definition (trap, so it is cleaned up even
#      on failure). The stopped task itself is left in place — it is inert and
#      ECS garbage-collects it.
#
# It never stops, restarts, scales or deregisters a service. The only mutating
# calls are RegisterTaskDefinition / DeregisterTaskDefinition on its own family,
# RunTask of its own task, and DeleteMessage of the single message it proved.
# Other messages already sitting in the sink are read and left alone.
#
# Cost: one Fargate task at api size running for ~40 s, about $0.001.
#
# Usage:  ./scripts/verify-e15s8-task-stop-alert.sh
# Requires: awscli v2 configured for the account, python3. Env overrides:
#   AWS_REGION (default ap-south-1), CLUSTER (evia-beta), PREFIX (evia-beta),
#   TIMEOUT_SECONDS (default 300).
# ---------------------------------------------------------------------------
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
CLUSTER="${CLUSTER:-evia-beta}"
PREFIX="${PREFIX:-evia-beta}"
TIMEOUT="${TIMEOUT_SECONDS:-300}"

RULE_NAME="${PREFIX}-task-stopped"
SINK_QUEUE="${PREFIX}-ops-alerts-sink"
TASK_FAMILY="${PREFIX}-verify-task-stop"

say()  { printf '%s\n' "$*"; }
step() { printf '\n=== %s\n' "$*"; }
die()  { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:${PREFIX}-ops-alerts"
RULE_ARN="arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}"

say "E15-S8 task-stop alert verification"
say "  account ${ACCOUNT_ID}  region ${REGION}  cluster ${CLUSTER}"
say "  rule    ${RULE_ARN}"
say "  topic   ${TOPIC_ARN}"
say "  sink    ${SINK_QUEUE}"

# ---------------------------------------------------------------------------
step "1/5 preflight"
STATE="$(aws events describe-rule --name "${RULE_NAME}" --region "${REGION}" \
          --query State --output text 2>/dev/null || true)"
[ "${STATE}" = "ENABLED" ] || die "rule ${RULE_NAME} is '${STATE:-missing}' — apply the E15-S8 change first"
say "  rule state: ENABLED"

aws events list-targets-by-rule --rule "${RULE_NAME}" --region "${REGION}" \
  --query 'Targets[].Arn' --output text | tr '\t' '\n' | grep -qx "${TOPIC_ARN}" \
  || die "rule ${RULE_NAME} has no target pointing at ${TOPIC_ARN}"
say "  target: ${TOPIC_ARN}"

POLICY="$(aws sns get-topic-attributes --topic-arn "${TOPIC_ARN}" --region "${REGION}" \
          --query 'Attributes.Policy' --output text)"
printf '%s' "${POLICY}" | python3 -c '
import json, sys
pol = json.load(sys.stdin)
arn = sys.argv[1]
ok = False
for st in pol.get("Statement", []):
    pr = st.get("Principal", {})
    svc = pr.get("Service")
    svc = svc if isinstance(svc, list) else [svc]
    if "events.amazonaws.com" not in svc:
        continue
    src = st.get("Condition", {}).get("ArnEquals", {}).get("aws:SourceArn")
    src = src if isinstance(src, list) else [src]
    if arn in src:
        ok = True
sys.exit(0 if ok else 1)
' "${RULE_ARN}" || die "topic policy does not let ${RULE_ARN} publish — the rule's target will fail silently"
say "  topic policy admits events.amazonaws.com for this rule"

INSIGHTS="$(aws ecs describe-clusters --clusters "${CLUSTER}" --include SETTINGS \
            --region "${REGION}" \
            --query "clusters[0].settings[?name=='containerInsights'].value | [0]" \
            --output text)"
[ "${INSIGHTS}" = "disabled" ] || die "containerInsights is '${INSIGHTS}' on ${CLUSTER} — expected disabled"
say "  containerInsights: disabled"

LEFT="$(aws cloudwatch describe-alarms --region "${REGION}" \
        --alarm-name-prefix "${PREFIX}-" \
        --query "length(MetricAlarms[?ends_with(AlarmName,'-running-tasks-low')])" \
        --output text)"
[ "${LEFT}" = "0" ] || die "${LEFT} running-tasks-low alarm(s) still exist — they can only read data Container Insights no longer publishes"
say "  running-tasks-low alarms remaining: 0"

QUEUE_URL="$(aws sqs get-queue-url --queue-name "${SINK_QUEUE}" --region "${REGION}" \
             --query QueueUrl --output text)"
say "  sink queue: ${QUEUE_URL}"

aws ecs describe-services --cluster "${CLUSTER}" --services "${PREFIX}-api" \
  --region "${REGION}" \
  --query 'services[0].networkConfiguration.awsvpcConfiguration' --output json > /tmp/e15s8-net.json
SUBNETS="$(python3 -c 'import json;print(" ".join(json.load(open("/tmp/e15s8-net.json"))["subnets"]))')"
SGS="$(python3 -c 'import json;print(" ".join(json.load(open("/tmp/e15s8-net.json"))["securityGroups"]))')"
say "  placing the throwaway task in the api service's subnets (${SUBNETS// /,}) and SG (${SGS// /,})"

# ---------------------------------------------------------------------------
step "2/5 register a throwaway task definition"
TD_ARN=""
cleanup() {
  if [ -n "${TD_ARN}" ]; then
    aws ecs deregister-task-definition --task-definition "${TD_ARN}" --region "${REGION}" \
      --query 'taskDefinition.status' --output text >/dev/null 2>&1 || true
    say "  deregistered ${TD_ARN}"
  fi
  rm -f /tmp/e15s8-net.json /tmp/e15s8-td.json /tmp/e15s8-task.txt
}
trap cleanup EXIT

aws ecs describe-task-definition --task-definition "${PREFIX}-api" --region "${REGION}" \
  --query 'taskDefinition' --output json > /tmp/e15s8-td.json
python3 - "${TASK_FAMILY}" <<'PY' > /tmp/e15s8-td-probe.json
import json, sys
td = json.load(open("/tmp/e15s8-td.json"))
src = td["containerDefinitions"][0]
probe = {
    "family": sys.argv[1],
    "requiresCompatibilities": ["FARGATE"],
    "networkMode": "awsvpc",
    "cpu": td["cpu"],
    "memory": td["memory"],
    "executionRoleArn": td["executionRoleArn"],
    "taskRoleArn": td["taskRoleArn"],
    "runtimePlatform": td["runtimePlatform"],
    # no logConfiguration: this task must not write into the api log group
    "containerDefinitions": [{
        "name": "verify",
        "image": src["image"],
        "essential": True,
        "entryPoint": ["/bin/sh", "-c"],
        "command": ["echo 'E15-S8 verification task exiting 3'; exit 3"],
    }],
}
print(json.dumps(probe))
PY
TD_ARN="$(aws ecs register-task-definition --cli-input-json file:///tmp/e15s8-td-probe.json \
          --region "${REGION}" --query 'taskDefinition.taskDefinitionArn' --output text)"
say "  registered ${TD_ARN} (image $(python3 -c 'import json;print(json.load(open("/tmp/e15s8-td-probe.json"))["containerDefinitions"][0]["image"])'))"

# ---------------------------------------------------------------------------
step "3/5 run it and let it fail"
TASK_ARN="$(aws ecs run-task --cluster "${CLUSTER}" --task-definition "${TD_ARN}" \
            --launch-type FARGATE --count 1 --platform-version LATEST \
            --network-configuration "$(python3 -c '
import json
print(json.dumps({"awsvpcConfiguration": {
    "subnets": json.load(open("/tmp/e15s8-net.json"))["subnets"],
    "securityGroups": json.load(open("/tmp/e15s8-net.json"))["securityGroups"],
    "assignPublicIp": "DISABLED"}}))')" \
            --region "${REGION}" \
            --query 'tasks[0].taskArn' --output text)"
[ -n "${TASK_ARN}" ] || die "run-task returned no task ARN"
STARTED_AT="$(date -u +%s)"
say "  task ${TASK_ARN}"
say "  waiting up to ${TIMEOUT}s for its stop event to come back through the sink"

# ---------------------------------------------------------------------------
step "4/5 read the alert out of the ops sink"
RESULT=""
for _ in $(seq 1 $(( TIMEOUT / 5 ))); do
  BODY="$(aws sqs receive-message --queue-url "${QUEUE_URL}" --max-number-of-messages 10 \
           --wait-time-seconds 5 --region "${REGION}" --output json)"
  RESULT="$(printf '%s' "${BODY}" | python3 -c '
import json, sys
want = sys.argv[1]
raw = sys.stdin.read().strip()
if not raw:
    sys.exit(0)
for m in json.loads(raw).get("Messages", []):
    # The sink also carries CloudWatch alarm notifications and any older test
    # publishes: those are SNS envelopes whose Message is not an EventBridge
    # event, and an older one sitting in the queue must not abort the read.
    try:
        body = json.loads(m["Body"])
        inner = json.loads(body["Message"]) if isinstance(body.get("Message"), str) else body
        if not isinstance(inner, dict):
            continue
    except (ValueError, TypeError, KeyError):
        continue
    d = inner.get("detail", {}) or {}
    if d.get("taskArn") == want:
        print(json.dumps({
            "receipt": m["ReceiptHandle"],
            "sns_envelope": "Message" in body,
            "source": inner.get("source"),
            "detail-type": inner.get("detail-type"),
            "taskArn": d.get("taskArn"),
            "lastStatus": d.get("lastStatus"),
            "desiredStatus": d.get("desiredStatus"),
            "stopCode": d.get("stopCode"),
            "stoppedReason": d.get("stoppedReason"),
            "exitCodes": [c.get("exitCode") for c in d.get("containers", [])],
        }))
        break
' "${TASK_ARN}")"
  [ -n "${RESULT}" ] && break
  sleep 1
done

[ -n "${RESULT}" ] || die "no alert for ${TASK_ARN} in ${SINK_QUEUE} within ${TIMEOUT}s.
  Diagnose, in this order:
    aws events list-targets-by-rule --rule ${RULE_NAME}          # target present?
    aws sns get-topic-attributes --topic-arn ${TOPIC_ARN}         # policy has events.amazonaws.com + rule ARN?
    aws events list-rule-names-by-target --target-arn ${TOPIC_ARN} # rule bound to the topic?
    the rule only matches tasks that stopped UNEXPECTEDLY: a task killed
    by stop-task (stopCode UserInitiated) is intentionally silent."

ELAPSED=$(( $(date -u +%s) - STARTED_AT ))
say ""
printf '%s' "${RESULT}" | python3 -c '
import json, sys
r = json.load(sys.stdin)
print("  alert received (SNS envelope: %s)" % r["sns_envelope"])
print("  source / detail-type : %s / %s" % (r["source"], r["detail-type"]))
print("  task ARN             : %s" % r["taskArn"])
print("  lastStatus           : %s" % r["lastStatus"])
print("  desiredStatus        : %s" % r["desiredStatus"])
print("  stopCode             : %s" % r["stopCode"])
print("  stoppedReason        : %s" % r["stoppedReason"])
print("  container exit codes : %s" % r["exitCodes"])
'
say "  end to end in ${ELAPSED}s"

aws sqs delete-message --queue-url "${QUEUE_URL}" --region "${REGION}" \
  --receipt-handle "$(printf '%s' "${RESULT}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["receipt"])')"
say "  removed the proof message from the sink (other messages untouched)"

# ---------------------------------------------------------------------------
step "5/5 verdict"
say "PASS — an ECS task that died on ${CLUSTER} published to ${PREFIX}-ops-alerts"
say "       through EventBridge rule ${RULE_NAME}, with Container Insights off."
say "       task: ${TASK_ARN}"
