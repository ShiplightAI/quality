#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skill_root="${repo_root}/agent-skills/quality"
failures=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

forbid_regex() {
  local pattern="$1"
  local search_path="$2"
  local message="$3"
  local matches
  local status

  if matches="$(grep -REn -- "${pattern}" "${search_path}" 2>&1)"; then
    printf '%s\n' "${matches}" >&2
    fail "${message}"
  else
    status=$?
    if ((status != 1)); then
      printf '%s\n' "${matches}" >&2
      fail "could not inspect ${search_path}"
    fi
  fi
}

forbid_fixed() {
  local pattern="$1"
  local search_path="$2"
  local message="$3"
  local matches
  local status

  if matches="$(grep -Fn -- "${pattern}" "${search_path}" 2>&1)"; then
    printf '%s\n' "${matches}" >&2
    fail "${message}"
  else
    status=$?
    if ((status != 1)); then
      printf '%s\n' "${matches}" >&2
      fail "could not inspect ${search_path}"
    fi
  fi
}

# `git check-ignore` cannot classify a path that does not exist in the working
# tree, so a directory-only pattern such as `.agents/` never matches the bare
# name `.agents`. Probe with the trailing slash the pattern itself uses.
require_ignored() {
  local path="$1"
  local message="$2"

  if ! git -C "${repo_root}" check-ignore -q "${path}"; then
    fail "${message}"
  fi
}

for required_command in grep git diff node npx; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    fail "required command is unavailable: ${required_command}"
  fi
done

if ((failures > 0)); then
  exit 1
fi

forbid_regex \
  'npx( --yes)? @shiplightai/quality-tools( |$)' \
  "${skill_root}" \
  "quality-tools command examples must pin the 0.3 interface"

if ! grep -Eq '@shiplightai/quality-tools@\^0\.3\.0 observations --help' \
  "${skill_root}/SKILL.md"; then
  fail "SKILL.md must verify the 0.3 observations interface before use"
fi

source_template="${skill_root}/references/improve/assets/observation-sources.template.yaml"
if ! grep -Fq "change \`transport\` above to \`\"local-folder\"\`" "${source_template}" ||
  grep -Fq '# transport: "local-folder"' "${source_template}"; then
  fail "the local-folder example must replace, not duplicate, the transport key"
fi

if ! grep -Fq '## Producer edit boundary' "${skill_root}/SKILL.md" ||
  ! grep -Fq 'When explicitly authorized, Quality may add only mechanical workflow glue' \
    "${skill_root}/SKILL.md"; then
  fail "SKILL.md must define the producer edit boundary it references"
fi

if ! grep -Fq 'If editing the producer is explicitly authorized' \
  "${skill_root}/references/improve/index.md"; then
  fail "producer mutation must have an explicit authorization branch"
fi

if [[ -e "${skill_root}/references/improve/assets/quality-observations.schema.json" ]]; then
  fail "use the published observations schema instead of a bundled static copy"
fi

# Same rule for every config schema. A vendored copy cannot be checked against
# the engine's, so it drifts the moment the contract moves -- which is exactly
# what happened when the `host` transport landed, and what left the views copy
# enforcing rules the parser did not. Each is emitted from the engine's own
# constants by `quality-tools <sources|sets|views> schema`; fetch that instead.
for vendored in observation-sources observation-sets views; do
  if [[ -e "${skill_root}/references/improve/assets/${vendored}.schema.json" ]]; then
    fail "use a quality-tools schema command instead of bundling ${vendored}.schema.json"
  fi
done

forbid_regex \
  'machine-readable result|acquisition/parser problems|acquired and parsed' \
  "${skill_root}" \
  "quality skill contains pre-canonical observation terminology"

forbid_fixed \
  '--output <shard.json>' \
  "${skill_root}/references/improve/index.md" \
  "the single-record example must directly produce quality-observations.json"

brownfield_reference="${skill_root}/references/map-project/brownfield-reconstruction.md"
forbid_regex \
  'Spec Kit|specify' \
  "${brownfield_reference}" \
  "Quality brownfield reconstruction must know only the spec-project handoff"

if ! grep -Fq '`spec-project` is installed for the active agent' \
  "${brownfield_reference}"; then
  fail "the optional spec-project handoff must be gated on local installation"
fi

observation_template="${skill_root}/references/improve/assets/quality-observations.template.json"
if ! npx --yes @shiplightai/quality-tools@^0.3.0 observations validate \
  "${observation_template}" >/dev/null; then
  fail "published quality-tools must accept the canonical observation template"
fi

workflow="${repo_root}/.github/workflows/quality-skill.yml"
if [[ ! -f "${workflow}" ]] ||
  ! grep -Fq 'run: scripts/check-quality-skill.sh' "${workflow}"; then
  fail "quality skill review contracts must run in CI"
fi

require_ignored .agents/ \
  ".agents must be excluded as generated installation state"

require_ignored .claude/ \
  "the local agent workspace must be excluded"

require_ignored skills-lock.json \
  "the machine-local skills lock must be excluded"

if [[ -e "${repo_root}/.agents/skills/quality" ]] &&
  ! diff -qr "${skill_root}" "${repo_root}/.agents/skills/quality" >/dev/null; then
  fail "the installed quality skill must match the canonical source"
fi

if ((failures > 0)); then
  exit 1
fi

printf 'Quality skill review contracts pass.\n'
