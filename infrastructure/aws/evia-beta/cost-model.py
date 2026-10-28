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
