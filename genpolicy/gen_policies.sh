#!/usr/bin/env bash
# Generate per-pod kata agent policies for the store demo with CoCo's genpolicy,
# writing the cc_init_data annotation into the target manifest in place.
#
# genpolicy derives each policy from the pod's full effective OCI spec plus the
# image config it pulls from the registry, pinning image digest, process args,
# env, user, capabilities, sandbox_pidns, mounts, and namespaces. This is the
# comprehensive, upstream replacement for the hand-rolled rego that used to live
# in generate_store_policies.py (which pinned only image digest + args).
#
# Usage: ./gen_policies.sh [manifest.yaml]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="${1:-$HERE/../aks-store-all-in-one-confidential.yaml}"
GENPOLICY="${GENPOLICY:-$HOME/bin/genpolicy}"
# Repo-local settings so generation is reproducible and version-controlled. This
# copy sets kata_config.oci_version to match the cluster's kata agent (the
# upstream default 1.1.0 does not match our runtime's 1.2.1, which would make the
# OCI Version check reject every container).
SETTINGS="${GENPOLICY_SETTINGS:-$HERE/genpolicy-settings.json}"
RULES="${RULES:-$HERE/../../implementation/policy/rules.rego}"
BASE_INITDATA="$HERE/base_initdata.toml"

# genpolicy pulls each image's config over HTTPS to read its ENTRYPOINT/CMD, env,
# and user. Its TLS verifier (rustls) trusts only the system store, but the local
# registry's cert is issued by CoCoRootCA, which is not installed there. Rather
# than require root to trust it system-wide, build a bundle of the system roots
# plus CoCoRootCA and pass it via SSL_CERT_FILE (honored by rustls-native-certs).
BUNDLE="$(mktemp)"
trap 'rm -f "$BUNDLE"' EXIT
cat /etc/ssl/certs/ca-certificates.crt "$HERE/cocorootca.pem" > "$BUNDLE"

# -s skips pod-spec fields this genpolicy build does not model (e.g.
# enableServiceLinks). That field only suppresses service-link env injection at
# runtime; the generated policy already admits service-link-style env via the
# svc_name_downward_env regex, so skipping it does not weaken the measured policy.
SSL_CERT_FILE="$BUNDLE" "$GENPOLICY" -s \
  -j "$SETTINGS" \
  -p "$RULES" \
  --initdata-path="$BASE_INITDATA" \
  -y "$MANIFEST"

echo "genpolicy: wrote cc_init_data policies into $MANIFEST"

# Decode the embedded policies into readable per-pod files for inspection/debug,
# under a per-manifest subfolder so multiple manifest variants don't clobber.
python3 "$HERE/dump_generated.py" "$MANIFEST" "$HERE/generated/$(basename "$MANIFEST" .yaml)"
