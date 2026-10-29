# E15-S8 — orchestrator apply and end-to-end proof

Branch `feat/E15-S8-alerts` (95e412c) merged as `a671f42`. The child wrote the HCL and
proved the isolated rehearsal; this file records what **I** applied and observed on the real
stack, because a plan is not an apply and a rehearsal is not the live rule.

## Plan, reviewed before applying

`terraform plan -var image_tag=6de0209c9dd9` — the variable matters: `terraform.tfvars`
still pins an older tag, and applying with the tfvars unchanged plans an image change that
would roll all three services backwards.

```
# aws_cloudwatch_event_rule.task_stopped will be created
# aws_cloudwatch_event_target.task_stopped_ops_sns will be created
# aws_sns_topic_policy.ops_alerts will be created
# aws_cloudwatch_metric_alarm.service_running_tasks_low["api"] will be destroyed
# aws_cloudwatch_metric_alarm.service_running_tasks_low["portal"] will be destroyed
# aws_cloudwatch_metric_alarm.service_running_tasks_low["worker"] will be destroyed
# aws_ecs_cluster.main will be updated in-place
Plan: 3 to add, 1 to change, 3 to destroy.
```

No task definition in the diff, so `ignore_changes` from E15-S6 is holding. Applied with
`-auto-approve` at 16:07Z.

## State after apply, read back from AWS

```
alarms remaining (5, none Container Insights):
  evia-beta-api-target-5xx            AWS/ApplicationELB
  evia-beta-api-unhealthy-hosts       AWS/ApplicationELB
  evia-beta-portal-unhealthy-hosts    AWS/ApplicationELB
  evia-beta-rds-connections-high      AWS/RDS
  evia-beta-rds-free-storage-low      AWS/RDS

cluster settings: containerInsights = disabled

evia-beta-task-stopped: ENABLED, target -> arn:aws:sns:ap-south-1:562654496378:evia-beta-ops-alerts
```

## End-to-end proof, run by me

`scripts/verify-e15s8-task-stop-alert.sh` — registers a throwaway task definition from the
running api image, runs it with `exit 3`, reads the alert out of the ops SQS sink:

```
task arn:aws:ecs:ap-south-1:562654496378:task/evia-beta/a93db3c3e4b245fc856083a42714c756
alert received (SNS envelope: True)
  source / detail-type : aws.ecs / ECS Task State Change
  lastStatus           : STOPPED
  desiredStatus        : STOPPED
  stopCode             : EssentialContainerExited
  container exit codes : [3]
  end to end in 49s
PASS — an ECS task that died on evia-beta published to evia-beta-ops-alerts
       through EventBridge rule evia-beta-task-stopped, with Container Insights off.
```

## A defect in the verification script, found by running it

The first run crashed: the sink still holds CloudWatch alarm notifications from the E15-S6
proof (03:41Z), whose SNS `Message` is an alarm document, not an EventBridge event, and the
reader did `json.loads(body["Message"])` unguarded. It died on the oldest message instead of
skipping it. Fixed in `a671f42`+ (tolerant parse: non-JSON, non-dict and detail-less messages
are skipped). This is why the proof is run rather than reasoned about — the rehearsal used an
empty isolated queue and never met the case.

## Saving

Container Insights: 108 metric streams measured in `ECS/ContainerInsights` × $0.30 per
metric-month = **$32.40/month**, plus 3 alarms × $0.10 = $0.30, total **$32.70/month**
($392.40/year). Labelled an estimate in the evidence: Cost Explorer reports $0.00 for the
month, so there is no invoice to difference against. EventBridge service events on the
default bus are free.

Given up knowingly: Container Insights was the only per-service CPU/memory metric source.
CPU and memory are now visible only through the ECS `describe-services`/`describe-tasks`
API and the task-stop event. If per-service utilisation becomes a need, the AWS/ECS free
metrics give it for about $1.20/month.

## Cleanup

Both throwaway task definitions (`evia-beta-verify-task-stop:1` and `:2`) were deregistered by
the script's trap; the proof message was deleted from the sink and the older messages left
untouched.
