#!/usr/bin/env python3
"""Decode the genpolicy-written cc_init_data annotations from a manifest into
readable per-pod files under an output directory, for inspection and debugging.

genpolicy embeds each pod's policy as gzip+base64 inside the
io.katacontainers.config.hypervisor.cc_init_data annotation, which is opaque.
This writes, per workload:
  <name>.initdata.toml   the full decoded initdata (policy.rego + aa.toml + cdh.toml)
  <name>.rego            just the policy.rego, for quick reading / diffing

The manifest annotation remains the authoritative source; these are copies.
"""
from __future__ import annotations

import base64
import gzip
import re
import sys
from pathlib import Path

import yaml

ANN = "io.katacontainers.config.hypervisor.cc_init_data"


def main() -> int:
    manifest = Path(sys.argv[1])
    outdir = Path(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)
    n = 0
    for doc in yaml.safe_load_all(manifest.read_text()):
        if not doc:
            continue
        tmpl = doc.get("spec", {}).get("template", {})
        enc = tmpl.get("metadata", {}).get("annotations", {}).get(ANN)
        if not enc:
            continue
        name = doc["metadata"]["name"]
        raw = gzip.decompress(base64.b64decode(enc)).decode()
        (outdir / f"{name}.initdata.toml").write_text(raw)
        m = re.search(r'"policy\.rego"\s*=\s*\'\'\'(.*?)\'\'\'', raw, re.S)
        if m:
            (outdir / f"{name}.rego").write_text(m.group(1))
        n += 1
        print(f"  wrote {outdir.name}/{name}.initdata.toml + .rego")
    print(f"dumped {n} policies to {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
