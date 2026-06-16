# app-backend — Release runbook

PR-gated release / hotfix / rollback flow for **app-backend**. Modeled on the
frontend (`app`) flow, adapted for this repo: version via **semantic-release**
(dry-run, log-parsed), changelog via **conventional-changelog**, **build-on-server
Docker** deploy (no image registry), **forward-only** DB migrations.

> The legacy `release.yml` (semantic-release on `push:main`) has been **removed** —
> `release-finalize.yml` is the only place a release tag is created, so there is no
> double-tagging.

---

## Branch model

| Branch | Role | Merge method |
|---|---|---|
| `development` | default branch; integration of feature work | **squash** feature PRs |
| `main` | release line; every merge is a release/hotfix | **merge commit** (preserves dev↔main lineage & tag reachability) |
| `release/x.y.z` | cut from `development` by Release — Start | merge-commit into `main` |
| `hotfix/x.y.z` | cut from `main` by Hotfix — Start | merge-commit into `main` |
| back-merge PR `main → development` | keeps `development` in sync after every release/hotfix | **merge** (never squash) |

⚠️ Do **not** squash-merge into `main` — squashing breaks tag reachability and the
next `release-start` would mis-compute the version. The back-merge PR into
`development` must also stay a merge (so `development` keeps descending from the
release tags). Per-branch `allowed_merge_methods` rulesets can enforce this.

## The three gates

| Gate | Where | Mechanism |
|---|---|---|
| **Approve #1** | `release-pr.yml` deploy → **staging** | `staging` Environment "Required reviewers" pauses the deploy |
| **Approve #2** | merge the release PR into `main` | PR review + **CODEOWNERS** (`* @aragon/app-team`) |
| **CI Gate** | `app-production.yml` deploy → **production** | `production` Environment "Required reviewers" pauses the deploy |

A gate is the `environment:` key on `deploy-reusable.yml`'s deploy job **plus** the
Required-reviewers rule on that GitHub Environment (repo Settings → Environments —
not a file). Both `staging` and `production` MUST have Required reviewers, or the
deploys won't pause.

### Prerequisites (infra)

- `@aragon/app-team` has access to the repo (so CODEOWNERS resolves the reviewer).
- The 1Password release PAT `ARABOT_APP_BACKEND_RELEASES` has org **`read:org`** —
  CODEOWNERS auto-requests the team on every PR and `gh pr create` reads the
  reviewer back; without it gh fails on `reviewRequests`.
- `staging` + `production` Environments have Required reviewers.
- Vault has `SLACK_CODEOWNERS_GROUP_ID` (team ping on the gates).
- Repo variable `RELEASE_V2_ENABLED=true` — the permanent DEV auto-deploy
  kill-switch: keep it `true` so `develop-deploy` deploys on push to `development`;
  set `false` to pause DEV auto-deploys (`workflow_dispatch` still works either way).

---

## Workflows & operator steps

All release PRs target `main`. Slack threads are correlated via a
`<!-- slack_ts: … -->` marker embedded in the PR/release body.

### 1. Release — Start (`release-start.yml`) — manual
Dispatch **on `development`** (Actions → "Release — Start" → Run workflow → branch
`development`; leave `base_commit` empty). It:
- computes the next version (`semantic-release --dry-run --branches development`,
  log-parsed) with a **stale-lineage guard** (fails if the computed version ≤ the
  latest tag — that means `development` needs a back-merge first);
- cuts `release/x.y.z` from `development`, commits the version bump + CHANGELOG
  section (reviewable in the PR), force-pushes the branch;
- opens the PR → `main` and starts the Slack thread (version, PR link, changelog,
  DB-migration flag).
- **Guard:** only one open `release/*` PR at a time.

### 2. Release — PR (`release-pr.yml`) — on PR sync into `main`
On `release/*` / `hotfix/*` PRs into `main`:
- fast checks (lint, format, unit + coverage);
- deploy to **staging** → **Approve #1** (the staging Environment pauses it;
  Slack thread + team ping);
- after approval: non-blocking E2E (staging) + Slack note.
- `unit-dep.yml` / `integration-test.yml` run on the same PR and are the required
  checks for **merge (Approve #2)**.

### 3. Merge the PR into `main` = Approve #2
Review + CODEOWNERS approval, then **merge commit** (not squash). This fires
finalize, back-merge, and (if a hotfix) cherry-pick.

### 4. Release — Finalize (`release-finalize.yml`) — on PR close (merged) into `main`
Reads the version from `package.json`, extracts the CHANGELOG section, creates the
tag **`vX.Y.Z`** + a published GitHub Release (carrying the Slack ts). The publish
triggers production deploy.

### 5. Production deploy (`app-production.yml`) — on Release `published`
Deploys the tag to **production** → **CI Gate** (production Environment pauses it;
a parallel `notify-gate` posts to Slack). After approval: deploy + non-blocking
E2E (prod) + "release complete" Slack note. Also dispatchable manually with a tag
(re-deploy / rollback target).

### 6. Back-merge (`release-backmerge.yml`) — on PR close (merged) into `main`
Opens an **idempotent** PR `main → development` so whatever shipped flows back to
`development` immediately. Decoupled from tagging — a finalize failure can't block
it. Merge it (merge method) to keep `development` in sync. "No commits / already
exists" is a no-op.

### 7. Hotfix — Start (`hotfix-start.yml`) — manual
Branches `hotfix/x.y.z` from **`main`** (TARGET_BRANCH), bumps the patch version,
opens the PR → `main`, posts Slack instructions. Push the fix to the branch; CI
re-runs on sync (same gates as a release). Merging → finalize → production.
- **Guard:** only one open `hotfix/*` at a time.

### 8. Cherry-pick hotfix into an open release (`release-hotfix-cherrypick.yml`)
When a `hotfix/*` PR merges into `main` **and** a `release/*` PR is still open, the
release branch (cut earlier) is missing the fix. This ports **only the fix commits**
(NOT the `chore(release)` bump, NOT all of `development`) onto a `sync/…` branch off
the release and opens a PR into it. Never auto-merged; the release keeps its own
version. On conflict it commits the conflicted state and opens a **DRAFT** PR
flagged "resolve manually".

### 9. Rollback (`rollback.yml`) — manual
Redeploys a previous tag to **production** (build-on-server rebuild; there is no
image registry). Behind the CI Gate. ⚠️ **Code only** — DB migrations are
forward-only and are **not** reverted; for migration-bearing releases, fix forward
(hotfix) instead.

### 10. Release — Cancel (`release-cancel.yml`) — on PR close
If a `release/*` / `hotfix/*` PR closes:
- cancels its `release-pr` run if it's still waiting on the Approve #1 gate (the
  gate is moot once the PR is gone);
- if closed **without** merging, notifies the Slack thread it was abandoned.

### 11. Develop → DEV deploy (`develop-deploy.yml`) — on push to `development`
Auto-deploys `development` to the DEV environment. Gated by `RELEASE_V2_ENABLED`
(push only deploys when it's `true`; `workflow_dispatch` always works).

### Manual / out-of-cycle deploys (outside the release flow)
For ad-hoc / emergency deploys that don't go through a release:
- **Any env** — dispatch `app-deploy-docker.yml` (build-on-server deploy): pick the
  target with the `environment` input (sandbox / development / staging / production) and
  it builds the branch it is **dispatched from** (`github.ref_name`). Run it from the
  branch whose code you want, per convention: `production` ← `main` (the workflow
  enforces this and fails otherwise), `staging` ← a `release/*` branch only, `sandbox`
  ← whatever branch you're testing, `development` ← `development` (normally
  auto-deployed on merge — this job is the manual fallback). Kept on purpose.
- **Production re-deploy of a tag** — dispatch `app-production.yml` with a tag, or
  use `rollback.yml`.
- **DEV** — dispatch `develop-deploy.yml`.

Production/staging dispatches still pause on their Environment approval gate.

---

## Concurrency / one-active guards

- One open `release/*` and one open `hotfix/*` at a time (start workflows guard).
- `deploy-reusable` serializes per-environment (`concurrency: deploy-<env>`,
  `cancel-in-progress: false`) — a hotfix + release deploying to the same env queue
  ("two deploys, one waiting" is expected).
- A hotfix may run alongside an open release: merge the hotfix first, then merge
  the auto back-merge (main → development) and the cherry-pick PR into the release.
  If the pending release is also patch-level it computes the **same** version →
  finalize fails on a duplicate tag; re-cut the release version.

## Versioning

`release-start` runs `semantic-release --dry-run --branches <base>` and parses
"next release version is X.Y.Z" from the log. `--branches` tracks the dispatch
branch. The CHANGELOG is generated by `conventional-changelog-cli`
(conventionalcommits preset). The tag is created **only** by `release-finalize`.

> **Lineage note:** `development` must descend from the latest release tag, or
> semantic-release baselines on a stale tag. The post-release back-merge keeps it
> in sync; a one-time bootstrap merge `main → development` repairs it initially.
