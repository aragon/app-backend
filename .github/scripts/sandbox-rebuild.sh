#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="${DRY_RUN:-true}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
LEFT_OUT=$(mktemp)

git fetch --quiet origin development sandbox
OLD=$(git rev-parse origin/sandbox)
git checkout --quiet -B sandbox-build origin/development

PRS=$(gh pr list --label Sandbox --state open --limit 100 \
  --json number,headRefOid,headRefName,isCrossRepository \
  --jq 'map(select((.isCrossRepository | not) and .headRefName != "sandbox")) | sort_by(.number)[] | "\(.number) \(.headRefOid) \(.headRefName)"')

INCLUDED=""
# The list is read on fd 3: git and gh inside the loop would eat stdin.
while read -r NUMBER SHA REF <&3; do
  [[ -n "$NUMBER" ]] || continue
  git fetch --quiet origin "$SHA"
  if git merge --quiet --no-ff -m "Merge PR #$NUMBER ($REF) into sandbox" "$SHA"; then
    INCLUDED="$INCLUDED $NUMBER"
    continue
  fi
  FILES=$(git diff --name-only --diff-filter=U | paste -sd, - | sed 's/,/, /g')
  # A merge that fails without a conflict (a signing error) must stop the run, not drop the PR.
  if [[ -z "$FILES" ]]; then
    echo "Merge of PR #$NUMBER failed without a conflict" >&2
    exit 1
  fi
  git merge --abort
  printf '%s\t%s\t%s\n' "$NUMBER" "${SHA:0:9}" "$FILES" >> "$LEFT_OUT"
done 3<<< "$PRS"

# Every rebuild makes new merge commits, so only the tree tells if the code changed.
CHANGED=false
if [[ "$(git rev-parse 'HEAD^{tree}')" != "$(git rev-parse "$OLD^{tree}")" ]]; then
  CHANGED=true
fi

{
  echo "### Sandbox rebuild"
  echo "- development: $(git rev-parse --short origin/development)"
  echo "- included:${INCLUDED:- none}"
  echo "- left out: $(wc -l < "$LEFT_OUT")"
  while IFS=$'\t' read -r NUMBER HEAD_SHA FILES; do
    echo "  - #$NUMBER at $HEAD_SHA conflicts in: $FILES"
  done < "$LEFT_OUT"
  echo "- code changed: $CHANGED"
  echo "- dry run: $DRY_RUN"
  echo
  echo "Changes on sandbox:"
  echo '```'
  git diff --stat "$OLD" HEAD
  echo '```'
} >> "$SUMMARY"

if [[ "$DRY_RUN" != false ]]; then
  exit 0
fi

if [[ "$CHANGED" == true ]]; then
  BACKUP="backup/sandbox-$(date -u +%Y%m%d)-${OLD:0:9}"
  git push origin "$OLD:refs/heads/$BACKUP"
  git push --force-with-lease="refs/heads/sandbox:$OLD" origin HEAD:refs/heads/sandbox

  CUTOFF=$(date -u -d '14 days ago' +%Y%m%d)
  while read -r _ REF <&3; do
    BRANCH=${REF#refs/heads/}
    if [[ "$BRANCH" =~ ^backup/sandbox-([0-9]{8})-[0-9a-f]{9}$ && "${BASH_REMATCH[1]}" < "$CUTOFF" ]]; then
      git push --quiet origin --delete "$BRANCH" || echo "Could not delete $BRANCH" >&2
    fi
  done 3< <(git ls-remote --heads origin 'refs/heads/backup/sandbox-*')
fi

if [[ -s "$LEFT_OUT" ]]; then
  BOT=$(gh api user --jq .login)
  while IFS=$'\t' read -r NUMBER HEAD_SHA FILES <&3; do
    BODY="Left out of sandbox at $HEAD_SHA, it conflicts in: $FILES. Merge development into this branch, or the Sandbox PR it builds on."
    LAST=$(gh pr view "$NUMBER" --json comments \
      --jq "[.comments[] | select(.author.login == \"$BOT\")] | last | .body // \"\"")
    if [[ "$LAST" != "$BODY" ]]; then
      gh pr comment "$NUMBER" --body "$BODY"
    fi
  done 3< "$LEFT_OUT"
fi
