#!/usr/bin/env python3
"""Make the pipeline, not terraform, the owner of ECS image revisions.

Without this, `terraform apply` rolls all three services back to whatever
`var.image_tag` says, because scripts/ecs-image-pin.py registers new task
definitions directly. That is the drift trap: a plan generated for an
unrelated change silently reverts a deploy.
"""
import pathlib, re, sys

TARGETS = {
    "infrastructure/aws/evia-beta/ecs.tf": ["api", "worker"],
    "infrastructure/aws/evia-beta/portal.tf": ["portal"],
}

LIFECYCLE = """
  # The build pipeline owns image revisions (scripts/ecs-image-pin.py). Terraform
  # manages the shape of the task definition, not which revision is deployed.
  lifecycle {
    ignore_changes = [container_definitions]
  }
"""

SERVICE_LC = """
  # The pipeline updates this to the revision it registered; terraform must not
  # drag the service back to an older revision on an unrelated apply.
  lifecycle {
    ignore_changes = [task_definition]
  }
"""

changed = 0
for rel, names in TARGETS.items():
    p = pathlib.Path(rel)
    src = p.read_text()
    orig = src
    for n in names:
        anchor = 'tags = merge(local.common_tags, {\n    Name     = "${var.name_prefix}-%s-task"' % n
        if anchor in src and "ignore_changes = [container_definitions]" not in src.split(anchor)[0][-800:]:
            src = src.replace(anchor, LIFECYCLE.lstrip("\n") + "\n" + anchor, 1)
            changed += 1
        elif anchor not in src:
            print(f"WARN task-def anchor missing: {rel} {n}", file=sys.stderr)

        anchor_s = 'tags = merge(local.common_tags, {\n    Name     = "${var.name_prefix}-%s-service"' % n
        if anchor_s in src:
            src = src.replace(anchor_s, SERVICE_LC.lstrip("\n") + "\n" + anchor_s, 1)
            changed += 1
        else:
            print(f"WARN service anchor missing: {rel} {n}", file=sys.stderr)

    if src != orig:
        p.write_text(src)

print("insertions:", changed)
for rel in TARGETS:
    t = pathlib.Path(rel).read_text()
    print(rel, "ignore_changes(container_definitions)=", t.count("ignore_changes = [container_definitions]"),
          "ignore_changes(task_definition)=", t.count("ignore_changes = [task_definition]"))
