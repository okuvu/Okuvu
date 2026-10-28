#!/usr/bin/env python3
"""Pin a new container image into an ECS task definition.

Reads a task definition (as returned by
`aws ecs describe-task-definition --query taskDefinition`), sets the image on
the first container, optionally injects the load-test environment variable and
secret, strips the read-only fields that `register-task-definition` rejects,
and writes the result to a new file.

Shared by `scripts/deploy-beta.sh`, `scripts/deploy-worker.sh` and the
CodeBuild pipeline (`buildspec.yml`) so all three roll out images the same way.

Usage:
    ecs-image-pin.py <in.json> <out.json> <image> [options]

Options:
    --container NAME          container to pin (default: first container)
    --load-test               set LOAD_TEST_MODE=true and add the
                              LOAD_TEST_KEY Secrets Manager reference
    --region REGION           required with --load-test
    --account ACCOUNT_ID      required with --load-test
"""

from __future__ import annotations

import argparse
import json
import sys

# Fields describe-task-definition returns but register-task-definition rejects.
READ_ONLY_FIELDS = (
    "taskDefinitionArn",
    "revision",
    "status",
    "requiresAttributes",
    "compatibilities",
    "registeredAt",
    "registeredBy",
    "deregisteredAt",
)


def upsert(entries: list[dict], entry: dict) -> list[dict]:
    """Replace any entry with the same `name`, then append."""
    kept = [e for e in entries if e.get("name") != entry["name"]]
    kept.append(entry)
    return kept


def pin(task_definition: dict, image: str, container: str | None, load_test: bool,
        region: str | None, account: str | None) -> dict:
    containers = task_definition.get("containerDefinitions") or []
    if not containers:
        raise SystemExit("task definition has no containerDefinitions")

    if container:
        matches = [c for c in containers if c.get("name") == container]
        if not matches:
            raise SystemExit(f"container {container!r} not found in task definition")
        target = matches[0]
    else:
        target = containers[0]

    target["image"] = image

    if load_test:
        if not region or not account:
            raise SystemExit("--load-test requires --region and --account")
        target["environment"] = upsert(
            list(target.get("environment") or []),
            {"name": "LOAD_TEST_MODE", "value": "true"},
        )
        target["secrets"] = upsert(
            list(target.get("secrets") or []),
            {
                "name": "LOAD_TEST_KEY",
                "valueFrom": f"arn:aws:secretsmanager:{region}:{account}:secret:LOAD_TEST_KEY",
            },
        )

    for field in READ_ONLY_FIELDS:
        task_definition.pop(field, None)

    return task_definition


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("image")
    parser.add_argument("--container")
    parser.add_argument("--load-test", action="store_true")
    parser.add_argument("--region")
    parser.add_argument("--account")
    args = parser.parse_args(argv)

    with open(args.source, encoding="utf-8") as handle:
        task_definition = json.load(handle)

    pinned = pin(task_definition, args.image, args.container, args.load_test,
                 args.region, args.account)

    with open(args.destination, "w", encoding="utf-8") as handle:
        json.dump(pinned, handle, indent=2)
        handle.write("\n")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
