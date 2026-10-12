# app-backend — Release runbook

PR-gated release / hotfix / rollback flow for **app-backend**, built from the reusable workflows
of [aragon/github-templates](https://github.com/aragon/github-templates) (see its
`docs/release-design.md`), the same modules the frontend (`app`) runs on. Adapted for this repo:
version via **semantic-release** (dry-run, log-parsed), changelog via **conventional-changelog**,
**build-on-server Docker** deploy (no image registry), **forward-only** DB migrations.

> `release-finalize` is the only place a release tag is created, so there is no double-tagging.

---

## Branch model

| Branch | Role | Merge method |
|---|---|---|
| `development` | default branch; integration of feature work | **squash** feature PRs |
| `main` | release line; every merge is a release/hotfix | **merge commit** (preserves dev↔main lineage & tag reachability) |
| `release/x.y.z` | cut from `development` by the release start | merge-commit into `main` |
| `hotfix/x.y.z` | cut from `main` by Hotfix — Start | merge-commit into `main` |
| back-merge PR `main → development` | keeps `development` in sync after every release/hotfix | **merge** (never squash) |

⚠️ Do **not** squash-merge into `main` — squashing breaks tag reachability and the
next release start would mis-compute the version. The back-merge PR into
`development` must also stay a merge (so `development` keeps descending from the
release tags). Per-branch `allowed_merge_methods` rulesets can enforce this.

## The three gates

| Gate | Where | Mechanism |
|---|---|---|
| **Approve #1** | `release.yml` deploy-staging → **staging** | `staging` Environment "Required reviewers" pauses the deploy |
| **Approve #2** | merge the release PR into `main` | PR review + **CODEOWNERS** (`* @aragon/app-team`) |
| **CI Gate** | `app-production.yml` deploy → **production** | `production` Environment "Required reviewers" pauses the deploy |

A gate is the `environment:` key on `deploy-reusable.yml`'s deploy job **plus** the
Required-reviewers rule on that GitHub Environment (repo Settings → Environments —
not a file). Both `staging` and `production` MUST have Required reviewers, or the
deploys won't pause. Every gate is announced in the release's Slack thread with the team ping
and the link to approve.

### Prerequisites (infra)

- `@aragon/app-team` has access to the repo (so CODEOWNERS resolves the reviewer).
- The 1Password release PAT `ARABOT_APP_BACKEND_RELEASES` has org **`read:org`** —
  CODEOWNERS auto-requests the team on every PR and `gh pr create` reads the
  reviewer back; without it gh fails on `reviewRequests`.
- `staging` + `production` Environments have Required reviewers.
- Vault `kv_backend2_infra` has `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_CODEOWNERS_GROUP_ID`
  (team ping on the gates), `LINEAR_API_TOKEN` (tickets in the summary) and
  `LINEAR_PIPELINE_ACCESS_KEY` (the "App back-end" Linear release pipeline).

---

## Workflows & operator steps

All release PRs target `main`. Every release is one Slack thread: the head message is the
release's status line (Started → Completed or Cancelled) and keeps the summary; everything
after is a reply. The thread is correlated via a `<!-- slack_ts: … -->` marker embedded in the
PR/release body, alongside `<!-- release_actor: … -->` (who the release is attributed to, so a
refresh does not re-attribute it to the last pusher). The PR body is owned by the automation
and rewritten on every push. A `slack_ts` older than the PR is ignored, so a body copied from an
earlier release cannot make the automation rewrite that release's Slack message. If any flow
fails, the thread gets a ❌ message with the link to the run.

### 1. Release start (`release.yml`) — scheduled or manual
Runs automatically every Monday at **14:37 UTC** (auto release); the scheduled run bases
off `development` and green-skips when a release PR or the back-merge PR (main →
development) is still open, or there are no releasable commits since the last tag. To
start one manually, dispatch **Release** **on `development`** (Actions → "Release" → Run
workflow → branch `development`; leave `base_commit` empty). It:
- computes the next version (`semantic-release --dry-run`, log-parsed) with a
  **stale-lineage guard** (fails if the computed version ≤ the latest tag — that means
  `development` needs a back-merge first);
- cuts `release/x.y.z` from `development`, commits the version bump + CHANGELOG
  section (reviewable in the PR), pushes the branch;
- opens the PR → `main`, starts the Slack thread (version, PR link, changelog,
  DB-migration flag, open-tickets warning) and creates the release in Linear.
- **Guard:** only one open `release/*` PR at a time.

### 2. Release PR (`release.yml`) — on PR sync into `main`
On `release/*` / `hotfix/*` PRs into `main`:
- the fast checks (lint, format, unit + coverage) and the staging deploy run in
  **parallel** — the deploy is gated by Approve #1, not by the checks; merge is
  where test results gate (Approve #2);
- deploy to **staging** → **Approve #1** (the staging Environment pauses it;
  Slack thread + team ping, then the result with what to do next);
- on every **push** to a `release/*` PR (not on open — that would race the start's
  own body edit), the release summary in the PR body and the Slack head message are
  regenerated — including the **⚠️ Open tickets** warning (Linear tickets referenced
  by the release that are not completed/canceled, with their current status). The
  warning never blocks; merging stays a human decision;
- after approval: non-blocking E2E (staging) + Slack note.
- `unit-dep.yml` / `integration-test.yml` run on the same PR and are the required
  checks for **merge (Approve #2)**.
- on the same pushes, `regen-changelog` rebuilds the CHANGELOG.md section
  (latest tag → HEAD, same `conventional-changelog-cli` preset as the start)
  and pushes it back as `chore(release): regenerate changelog` (signed, release
  PAT — so the required checks re-run on the new head). The file — and the
  Release notes finalize extracts from it — keeps matching what ships. Manual
  edits to the section do **not** survive the next push, and non-conventional
  commit subjects are still dropped by the generator.

### 3. Merge the PR into `main` = Approve #2
Review + CODEOWNERS approval, then **merge commit** (not squash). This fires
finalize, back-merge, and (if a hotfix) cherry-pick.

### 4. Release finalize (`release.yml`) — on PR close (merged) into `main`
Reads the version from `package.json`, extracts the CHANGELOG section, creates the
tag **`vX.Y.Z`** + a published GitHub Release (carrying the Slack ts). The publish
triggers the production deploy.

### 5. Production deploy (`app-production.yml`) — on Release `published`
Deploys the tag to **production** → **CI Gate** (production Environment pauses it;
the thread gets the "waiting for approval" ping). After approval: deploy result,
non-blocking E2E (prod) + Slack note, then the head message flips to **Completed** and
the Linear release is marked complete. Also dispatchable manually with a tag
(re-deploy / rollback target), which goes through the same gate without closing a release.

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

### 10. Release cancel (`release.yml`) — on PR close
On any close of a `release/*` / `hotfix/*` PR the PR's `release.yml` run still waiting
on the Approve #1 gate is cancelled (the gate is moot once the PR is gone). Closed
without merging, in addition: the thread hears it was abandoned, the head message flips
to **Cancelled** and the Linear release is canceled.

### 11. Develop → DEV deploy (`develop-deploy.yml`) — on push to `development`
Auto-deploys `development` to the DEV environment on every push (and on manual
`workflow_dispatch`). No gating — DEV is the continuous-integration environment.

### Manual / out-of-cycle deploys (outside the release flow)
For ad-hoc / emergency deploys that don't go through a release:
- **Any env** — dispatch `app-deploy-docker.yml` (build-on-server deploy): pick the
  target with the `environment` input (sandbox / development / staging / production) and
  it builds the branch it is **dispatched from** (`github.ref_name`). Run it from the
  branch whose code you want, per convention: `production` ← `main` (the workflow
  enforces this and fails otherwise), `staging` ← a `release/*` branch only, `sandbox`
  ← whatever branch you're testing, `development` ← `development` (normally
  auto-deployed on merge — this job is the manual fallback).
- **Production re-deploy of a tag** — dispatch `app-production.yml` with a tag, or
  use `rollback.yml`.
- **DEV** — dispatch `develop-deploy.yml`.

Production/staging dispatches still pause on their Environment approval gate and open their
own Slack thread.

---

## Concurrency / one-active guards

- One open `release/*` and one open `hotfix/*` at a time (start workflows guard).
- `release.yml` runs one run per PR (`concurrency: release-<PR>`, cancel-in-progress): a
  push supersedes the previous run, including its deploy waiting on Approve #1 — which
  would otherwise hold the group and queue every later run behind a human. The close
  runs (finalize, cancel) have a group of their own and are never cancelled.
- `deploy-reusable` serializes per-environment (`concurrency: deploy-<env>`,
  `cancel-in-progress: false`) — a hotfix + release deploying to the same env queue
  ("two deploys, one waiting" is expected).
- A hotfix may run alongside an open release: merge the hotfix first, then merge
  the auto back-merge (main → development) and the cherry-pick PR into the release.
  If the pending release is also patch-level it computes the **same** version →
  finalize fails on a duplicate tag; re-cut the release version.

## Versioning

The shared `compute-version` step runs `semantic-release --dry-run --branches <base>` and
parses "next release version is X.Y.Z" from the log. The CHANGELOG is generated by
`conventional-changelog-cli` (conventionalcommits preset). The tag is created **only** by
`release-finalize`.

> **Lineage note:** `development` must descend from the latest release tag, or
> semantic-release baselines on a stale tag. The post-release back-merge keeps it
> in sync; a one-time bootstrap merge `main → development` repairs it initially.

## What stays in this repo

The deploy itself (`deploy-reusable.yml`): it reads three differently-scoped 1Password service
accounts (server access per environment, the application configs in `temporal_backend2`, Slack in
`kv_backend2_infra`), which the shared `deploy-docker.yml` cannot take. Moving onto it needs one
service account that reads all three vaults; until then only the ceremony around the deploy is
shared. Also repo-specific by nature: the back-merge, the hotfix start and cherry-pick, the
CHANGELOG regeneration on release-PR pushes, the DB-migration flag.
