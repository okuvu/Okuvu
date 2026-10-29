#!/usr/bin/env python3
"""evia-beta monthly cost, before vs after the 2026-10-28 lean resize.

Every unit rate below was read from the ap-south-1 offer file for that service
(publication dates: AmazonECS 2026-10-19, others current at time of reading).
Hours per month = 730. Only the usage lines are assumptions; they are named.
"""
H = 730.0

RATE = {
    "fargate_vcpu": 0.04256,      # per vCPU-hour, x86_64
    "fargate_gb": 0.004655,       # per GB-hour
    "rds_t4g_micro": 0.021,       # db.t4g.micro PostgreSQL Single-AZ, per hour
    "rds_t4g_small": 0.042,       # db.t4g.small PostgreSQL Single-AZ, per hour
    "gp3_gb": 0.131,              # per GB-month
    "cache_t4g_micro": 0.016,      # Valkey, per node-hour
    "nat_hour": 0.056,
    "nat_gb": 0.056,
    "alb_hour": 0.0239,
    "alb_lcu": 0.008,
    "ipv4_hour": 0.005,
    "kms_key": 1.00,              # customer-managed key version per month
    "secret": 0.40,
    "ecr_gb": 0.10,
    "zone": 0.50,
    "logs_ingest_gb": 0.67,
    "logs_store_gb": 0.03,
    "build_min": 0.010,           # BUILD_GENERAL1_MEDIUM
    # E15-S6 observability additions. Alarm rate is the list "per alarm metric
    # month" price for standard resolution in ap-south-1; the high-resolution
    # variant (APS3-CW:HighResAlarmMonitorUsage, $0.30) and the composite one
    # (APS3-CW:CompositeAlarmMonitorUsage, $0.50) were read from the offer file.
    "cloudwatch_alarm": 0.10,
    "s3_standard_gb": 0.025,      # ap-south-1, first 50 TB
    "s3_put_1k": 0.005,           # per 1,000 PUT requests
    "cloudwatch_custom_metric": 0.30,  # per metric-month, first 10k
}

# Assumptions (named so they can be challenged)
ASSUME = {
    "nat_gb": 20,          # GB/month processed through the NAT gateway
    "lcu_avg": 1.0,        # average ALB capacity units actually consumed
    "public_ips": 3,       # 1 NAT + 2 ALB (one per AZ)
    "kms_keys": 3,         # customer-managed: secrets, data, contacts
    "secrets": 5,
    "ecr_gb": 5.72,        # measured: 5,720,409,315 bytes across three repos
    "zones": 2,            # okuvu.in public + evia-beta.local private
    "logs_ingest_gb": 2.0,
    "logs_store_gb": 2.0,
    "build_minutes": 300,  # ~10 builds of 30 min
}


def fargate(tasks, cpu, mem_gb):
    return tasks * (cpu * RATE["fargate_vcpu"] + mem_gb * RATE["fargate_gb"]) * H


def stack(rds_class, api_tasks, portal_tasks, portal_cpu, portal_mem_gb):
    lines = [
        ("Fargate api", fargate(api_tasks, 0.5, 1.0)),
        ("Fargate worker", fargate(1, 0.5, 1.0)),
        ("Fargate portal", fargate(portal_tasks, portal_cpu, portal_mem_gb)),
        ("RDS instance " + rds_class, RATE[rds_class] * H),
        ("RDS gp3 storage 20GB", 20 * RATE["gp3_gb"]),
        ("ElastiCache cache.t4g.micro", RATE["cache_t4g_micro"] * H),
        ("NAT gateway hours", RATE["nat_hour"] * H),
        ("NAT processed data", ASSUME["nat_gb"] * RATE["nat_gb"]),
        ("ALB hours", RATE["alb_hour"] * H),
        ("ALB capacity units", ASSUME["lcu_avg"] * RATE["alb_lcu"] * H),
        ("Public IPv4 x%d" % ASSUME["public_ips"], ASSUME["public_ips"] * RATE["ipv4_hour"] * H),
        ("KMS customer keys x%d" % ASSUME["kms_keys"], ASSUME["kms_keys"] * RATE["kms_key"]),
        ("Secrets Manager x%d" % ASSUME["secrets"], ASSUME["secrets"] * RATE["secret"]),
        ("ECR storage", ASSUME["ecr_gb"] * RATE["ecr_gb"]),
        ("Route53 zones x%d" % ASSUME["zones"], ASSUME["zones"] * RATE["zone"]),
        ("CloudWatch Logs ingest", ASSUME["logs_ingest_gb"] * RATE["logs_ingest_gb"]),
        ("CloudWatch Logs storage", ASSUME["logs_store_gb"] * RATE["logs_store_gb"]),
        ("CodeBuild minutes", ASSUME["build_minutes"] * RATE["build_min"]),
    ]
    return lines


before = stack("rds_t4g_small", api_tasks=2, portal_tasks=2, portal_cpu=0.5, portal_mem_gb=1.0)
after = stack("rds_t4g_micro", api_tasks=1, portal_tasks=1, portal_cpu=0.25, portal_mem_gb=0.5)

bt = sum(v for _, v in before)
at = sum(v for _, v in after)

print(f"{'line':<32}{'before':>10}{'after':>10}{'delta':>10}")
print("-" * 62)
for (name, b), (_, a) in zip(before, after):
    print(f"{name:<32}{b:>10.2f}{a:>10.2f}{a-b:>+10.2f}")
print("-" * 62)
print(f"{'TOTAL':<32}{bt:>10.2f}{at:>10.2f}{at-bt:>+10.2f}")
print()
print(f"monthly saving: ${bt-at:.2f}  ({100*(bt-at)/bt:.0f}%)")
print(f"annual saving:  ${(bt-at)*12:.2f}")
print()
fixed = at - (
    ASSUME["nat_gb"] * RATE["nat_gb"]
    + ASSUME["logs_ingest_gb"] * RATE["logs_ingest_gb"]
    + ASSUME["build_minutes"] * RATE["build_min"]
    + ASSUME["lcu_avg"] * RATE["alb_lcu"] * H
)
print(f"traffic/build-driven portion of the after total: ${at-fixed:.2f}")
print(f"fixed-per-stack portion:                          ${fixed:.2f}")

# ---------------------------------------------------------------------------
# E15-S6 observability delta.
#
# Deliberately not folded into the before/after table above: that table answers
# "what did the lean resize save", and adding lines would silently rewrite the
# comparison. These are the numbers the budget guard actually needs — and they
# expose that the after-total understates the real run rate, because it carries
# no Container Insights line while the cluster is publishing 108 metric streams.
# ---------------------------------------------------------------------------
CI_METRIC_STREAMS = 108            # aws cloudwatch list-metrics -n ECS/ContainerInsights
ALB_REQUESTS_PER_DAY = 2961        # RequestCount Sum, 24h, evia-beta-alb (measured)
ALB_OBJECTS_PER_DAY = 2 * 288      # one access-log object per 5 min per AZ, 2 AZs
ALB_BYTES_PER_REQUEST = 400        # log line before gzip; /4 for the gzip ratio
ALB_RETENTION_DAYS = 90

e15s6 = [
    ("CloudWatch alarms x5 (3 ECS, 2 RDS)", 5 * RATE["cloudwatch_alarm"]),
    ("S3 PUT requests for ALB logs", ALB_OBJECTS_PER_DAY * 30 / 1000 * RATE["s3_put_1k"]),
    (
        "S3 storage for ALB logs (90d)",
        (ALB_REQUESTS_PER_DAY * ALB_BYTES_PER_REQUEST * 30 * ALB_RETENTION_DAYS / 4)
        / 1024**3
        * RATE["s3_standard_gb"],
    ),
]

print()
print("E15-S6 additions")
print("-" * 62)
for name, v in e15s6:
    print(f"{name:<40}{v:>10.3f}")
add = sum(v for _, v in e15s6)
print("-" * 62)
print(f"{'NEW MONTHLY':<40}{add:>10.3f}")
print(f"{'NEW ANNUALISED':<40}{add * 12:>10.2f}")
print()
print(f"Container Insights (E15-S6 note, now retired): {CI_METRIC_STREAMS} streams")
print(
    "  estimated ${:.2f}/mo at the time, absent from the after-total above".format(
        CI_METRIC_STREAMS * RATE["cloudwatch_custom_metric"]
    )
)

# ---------------------------------------------------------------------------
# E15-S8 — retire Container Insights and the three running-count alarms.
#
# The metric count is measured, not assumed: `aws cloudwatch list-metrics
# --namespace ECS/ContainerInsights` returned 108 metric streams on 2026-10-29
# (18 distinct metric names across three dimension sets — 50 with
# ClusterName+TaskDefinitionFamily, 45 with ClusterName+ServiceName, 13 with
# ClusterName alone). Every stream is a CloudWatch custom metric.
#
# Rate: APS3-CW:MetricMonitorUsage in the ap-south-1 offer file — $0.30 per
# metric-month for the first 10,000 metrics. 108 x 0.30 = $32.40.
# Alarm rate: APS3-CW:AlarmMonitorUsage — $0.10 per alarm-month, first tier.
#
# The replacement path is free: ECS Task State Change events are AWS service
# events on the default bus, which EventBridge does not charge for, and the
# ops SNS topic plus its SQS subscriber already exist.
#
# This is an ESTIMATE, not a measured saving: the account's Cost Explorer
# returns $0.00 for every service for the whole of October (billing data has
# not started flowing yet), so there is no invoice line to difference. What is
# measured is the metric count; what is published is the unit price.
# ---------------------------------------------------------------------------
e15s8 = [
    (
        f"Container Insights {CI_METRIC_STREAMS} metrics @ ${RATE['cloudwatch_custom_metric']:.2f}",
        -CI_METRIC_STREAMS * RATE["cloudwatch_custom_metric"],
    ),
    ("3 running-tasks-low alarms @ $0.10", -3 * RATE["cloudwatch_alarm"]),
    ("EventBridge rule + SNS target (service events)", 0.0),
]

print()
print("E15-S8 removals")
print("-" * 62)
for name, v in e15s8:
    print(f"{name:<40}{v:>10.3f}")
saved = -sum(v for _, v in e15s8)
print("-" * 62)
print(f"{'SAVED MONTHLY':<40}{saved:>10.3f}")
print(f"{'SAVED ANNUALISED':<40}{saved * 12:>10.2f}")
print()
# The $32.40 was never inside the after-total (E15-S6 recorded it as a missing
# line), so it cannot simply be subtracted from it. Two run rates are shown:
# the modelled one the table has always published, and the real one.
modelled = at + add
ci_cost = CI_METRIC_STREAMS * RATE["cloudwatch_custom_metric"]
alarm_delta = 3 * RATE["cloudwatch_alarm"]
print(f"modelled run rate, after-total + E15-S6 additions: ${modelled:.2f}/mo")
print("  (Container Insights was never in that figure)")
print(f"real run rate before E15-S8: ${modelled + ci_cost:.2f}/mo")
print(f"real run rate after E15-S8:  ${modelled - alarm_delta:.2f}/mo")
print(f"  difference: ${(modelled + ci_cost) - (modelled - alarm_delta):.2f}/mo, matching SAVED MONTHLY")
print(f"  against the ${250.0:.0f} evia-beta-monthly budget")

