#!/usr/bin/env bash
# Recompute each pod's cc_init_data annotation from its policy file and write it
# into the deployment manifest. Run after editing any policy in POLICY_DIR.
#
#   annotation = base64( gzip( policy/store/initdata_<pod>.toml ) )
#
# Each StatefulSet gets the annotation built from initdata_<statefulset-name>.toml.
set -euo pipefail
cd "$(dirname "$0")"

MANIFEST=${1:-aks-store-all-in-one-confidential.yaml}
POLICY_DIR=${POLICY_DIR:-policy/store}
KEY="io.katacontainers.config.hypervisor.cc_init_data"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Precompute one annotation file per pod: $tmp/<pod>
for f in "$POLICY_DIR"/initdata_*.toml; do
  pod=$(basename "$f" .toml); pod=${pod#initdata_}
  gzip -c -9 -n "$f" | base64 -w0 > "$tmp/$pod"
done

# Walk the manifest; for each StatefulSet, replace its cc_init_data value with
# the annotation built from the policy named after that StatefulSet.
awk -v anndir="$tmp" -v key="$KEY" '
  $0 ~ /^kind: StatefulSet[[:space:]]*$/ { awaiting=1 }
  awaiting && /^  name:/ { pod=$2; awaiting=0 }
  index($0, key":") {
    annfile=anndir"/"pod
    if ((getline ann < annfile) <= 0) {
      print "no policy for pod \x27" pod "\x27 (expected " annfile ")" > "/dev/stderr"; exit 1
    }
    close(annfile)
    match($0, /^[[:space:]]*/); indent=substr($0,1,RLENGTH)
    print indent key ": " ann
    next
  }
  { print }
' "$MANIFEST" > "$MANIFEST.tmp"

mv "$MANIFEST.tmp" "$MANIFEST"
echo "Updated cc_init_data in $MANIFEST for: $(ls "$tmp" | tr '\n' ' ')"
