#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skill_root="${repo_root}/agent-skills/spec-project"
failures=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

require_fixed() {
  local pattern="$1"
  local path="$2"
  local message="$3"

  if ! grep -Fq -- "${pattern}" "${path}"; then
    fail "${message}"
  fi
}

forbid_regex() {
  local pattern="$1"
  local path="$2"
  local message="$3"
  local matches
  local status

  if matches="$(rg -n -- "${pattern}" "${path}" 2>&1)"; then
    printf '%s\n' "${matches}" >&2
    fail "${message}"
  else
    status=$?
    if ((status != 1)); then
      printf '%s\n' "${matches}" >&2
      fail "could not inspect ${path#"${repo_root}/"}"
    fi
  fi
}

for required_command in grep rg diff; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    fail "required command is unavailable: ${required_command}"
  fi
done

if ((failures > 0)); then
  exit 1
fi

for required in \
  "${skill_root}/SKILL.md" \
  "${skill_root}/assets/prd-template.md" \
  "${skill_root}/assets/feature-breakdown-template.md" \
  "${skill_root}/assets/portable-feature-spec-template.md" \
  "${skill_root}/references/spec-kit.md"; do
  if [[ ! -f "${required}" ]]; then
    fail "required spec-project file is missing: ${required#"${repo_root}/"}"
  fi
done

if [[ -e "${repo_root}/agent-skills/speckit-project" ]]; then
  fail "the renamed speckit-project directory must not remain"
fi

if ((failures == 0)); then
  require_fixed "name: spec-project" "${skill_root}/SKILL.md" \
    "SKILL.md must use the renamed skill name"
  require_fixed "Portable mode (default)" "${skill_root}/SKILL.md" \
    "portable Markdown must remain the default mode"
  require_fixed "## Reconcile Before Creating" "${skill_root}/SKILL.md" \
    "the existing-spec reconciliation gate is missing"
  require_fixed '| `specs/NNN-feature-name/test-spec.md` | `/shiplight cover`' \
    "${skill_root}/SKILL.md" \
    "the /shiplight cover ownership boundary is missing"
  require_fixed "## Spec Kit Ownership" "${skill_root}/references/spec-kit.md" \
    "the Spec Kit ownership contract is missing"
fi

forbid_regex 'speckit-project|spec-less|Spec-less' "${skill_root}" \
  "stale speckit-project or spec-less wording remains in spec-project"
forbid_regex '(?i:quality|\.quality)' "${skill_root}" \
  "spec-project must not know about Quality or .quality"
forbid_regex '^\| `specs/NNN-feature-name/(spec|plan|tasks)\.md` \| `?spec-project' \
  "${skill_root}/SKILL.md" \
  "spec-project must not claim Spec Kit artifact ownership"

for agent_dir in .agents .claude; do
  installed="${repo_root}/${agent_dir}/skills/spec-project"
  stale="${repo_root}/${agent_dir}/skills/speckit-project"

  if [[ -e "${stale}" ]]; then
    fail "stale installed skill remains: ${stale#"${repo_root}/"}"
  fi
  if [[ -e "${installed}" ]] && ! diff -qr "${skill_root}" "${installed}" >/dev/null; then
    fail "installed ${agent_dir} spec-project skill must match the canonical source"
  fi
done

if ((failures > 0)); then
  exit 1
fi

printf 'Spec Project skill contracts pass.\n'
