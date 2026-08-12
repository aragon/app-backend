const { execFileSync } = require('node:child_process')

const REPO_URL = 'https://github.com/aragon/app-backend'

const LINEAR_API_URL = 'https://api.linear.app/graphql'
// Linear issue identifiers like "APP-1234" embedded in commit messages.
const LINEAR_ID_RE = /\b[A-Za-z]{2,}-\d+\b/g
// Linear state types that mean a ticket is finished; anything else (triage, backlog,
// unstarted, started) counts as open and is surfaced in the summary's warning section.
const CLOSED_STATE_TYPES = new Set(['completed', 'canceled'])
// A squash commit that kept the merge-style title ("Merge pull request #N …") says
// nothing in its subject — its real changes live in the body, so the body is scanned
// for tickets and for a readable fallback title.
const MERGE_TITLE_RE = /^Merge /i
// Body-harvesting cutoff: a squashed bulk-sync PR (e.g. main back into development)
// lists a whole release worth of commits in its body, and harvesting tickets from it
// would resurface already-released work. No genuine single PR references this many.
const MAX_BODY_TICKETS = 8

const SECTION_RANK = { features: 0, fixes: 1, other: 2 }

// Resolve a Linear issue to its title + url. Returns null on ANY failure (no
// token, network error, unknown id) so the summary degrades gracefully — Linear
// enrichment is optional and must never fail the release.
async function fetchLinearIssue(issueId, token) {
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        query: 'query Issue($id: String!) { issue(id: $id) { title url state { name type } } }',
        variables: { id: issueId },
      }),
    })
    const data = await response.json()
    return data?.data?.issue ?? null
  } catch {
    return null
  }
}

// Highest semver tag by VERSION, not by graph reachability. `git describe`
// walks first-parent distance, so on the back-merge model (main→development)
// the previous release tag — which arrives via a merge's *second* parent — is
// invisible to it and the baseline silently falls back to an older tag. Sorting
// all `v*` tags by version sidesteps that entirely.
function getLatestSemverTag() {
  try {
    const out = execFileSync('git', ['tag', '--list', 'v*', '--sort=-v:refname'], { encoding: 'utf8' })
    return (
      out
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)[0] ?? null
    )
  } catch {
    return null
  }
}

// merge-base(tag, HEAD) is the correct "since previous release" cut for BOTH
// branch models: back-merge (tag is an ancestor of HEAD → merge-base == the tag
// commit → range == tag..HEAD) and release-branch (tag never merged back →
// merge-base == the divergence point). Falls back to the tag itself if git fails.
function getMergeBase(ref) {
  try {
    return execFileSync('git', ['merge-base', ref, 'HEAD'], { encoding: 'utf8' }).trim() || null
  } catch {
    return null
  }
}

function isReachable(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8', stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// Prefer PREV_DEPLOY_SHA (delta since last staging deploy) over the last
// release tag, since tags are only created on production releases and would
// otherwise grow the changelog unboundedly between releases. Returns the range
// start ref to diff from plus a human label for the "_N changes since X_" line.
function getRangeStart() {
  const prev = process.env.PREV_DEPLOY_SHA?.trim()
  if (prev && isReachable(prev)) return { ref: prev, label: `last deploy (${prev.slice(0, 7)})` }
  const tag = getLatestSemverTag()
  if (!tag) return { ref: null, label: 'initial commit' }
  // Diff from the merge-base SHA, but label with the readable tag name.
  return { ref: getMergeBase(tag) || tag, label: tag }
}

// In the staging-deploy context (PREV_DEPLOY_SHA set) we also exclude commits
// already reachable from main, so merge-from-main commits don't re-surface
// already-released history. In the release context (HEAD itself is on main)
// this filter would drop everything, so skip it.
function getCommits(fromRef, { excludeMainBranch }) {
  const range = fromRef ? `${fromRef}..HEAD` : 'HEAD'
  const mainRef = process.env.MAIN_REF || 'origin/main'
  const excludeMain = excludeMainBranch && isReachable(mainRef) ? [`^${mainRef}`] : []
  // With no range start (no reachable tag) `git log HEAD` would dump the entire
  // history; bound it so a misconfigured/stale lineage can't blow up the summary.
  const maxCount = fromRef ? [] : ['--max-count=100']
  // NUL-separated subject/body per commit, record-separated so multiline bodies parse.
  const args = ['log', range, ...maxCount, ...excludeMain, '--no-merges', '--pretty=format:%s%x00%b%x1e']
  try {
    const log = execFileSync('git', args, { encoding: 'utf8' })
    return log
      .split('\x1e')
      .map(record => record.trim())
      .filter(Boolean)
      .map(record => {
        const [subject = '', body = ''] = record.split('\x00')
        return { subject: subject.trim(), body: body.trim() }
      })
      .filter(commit => commit.subject)
  } catch {
    return []
  }
}

// Section for a message: any feat/perf line wins over fix, fix over other. Lines are
// stripped of list markers so squash bodies ("* feat: …") classify like subjects.
function sectionOf(text) {
  const lines = text.split('\n').map(line => line.replace(/^[\s*-]+/, ''))
  if (lines.some(line => /^(feat|perf)[\s(:!]/i.test(line))) return 'features'
  if (lines.some(line => /^fix[\s(:!]/i.test(line))) return 'fixes'
  return 'other'
}

// Builds the summary entries. Commits are grouped by the Linear tickets they
// reference (subject always; body too for merge-titled squashes): one entry per
// ticket regardless of how many commits carry it, titled by the ticket itself.
// Commits with no resolvable ticket stay visible under their own title, so
// missing Linear data can hide enrichment but never a change.
async function categorize(commits) {
  // Linear enrichment is optional: only attempted when a token is present, and
  // each issue is fetched at most once across all commits.
  const linearToken = process.env.LINEAR_API_TOKEN?.trim()
  const issueCache = new Map()
  async function resolveIssue(rawId) {
    const id = rawId.toUpperCase()
    if (!issueCache.has(id)) {
      issueCache.set(id, linearToken ? await fetchLinearIssue(id, linearToken) : null)
    }
    return { id, issue: issueCache.get(id) }
  }

  const prLink = n => `[#${n}](${REPO_URL}/pull/${n})`

  const tickets = new Map() // id -> { issue, section, prs }
  const titleEntries = []
  const seenTitles = new Set()

  for (const { subject, body } of commits) {
    // True merge commits never reach this loop (the git log passes --no-merges), so a
    // "Merge …" subject here is a single-parent squash that kept the merge-style title.
    if (/^chore\(release\)/i.test(subject)) continue
    const isMergeTitle = MERGE_TITLE_RE.test(subject)

    const ids = new Set((subject.match(LINEAR_ID_RE) ?? []).map(s => s.toUpperCase()))
    if (isMergeTitle) {
      const bodyIds = new Set((body.match(LINEAR_ID_RE) ?? []).map(s => s.toUpperCase()))
      if (bodyIds.size <= MAX_BODY_TICKETS) {
        for (const id of bodyIds) ids.add(id)
      }
    }

    const section = sectionOf(isMergeTitle ? `${subject}\n${body}` : subject)
    const prs = (subject.match(/#\d+\b/g) ?? []).map(s => s.slice(1))

    const resolved = []
    for (const rawId of ids) {
      const { id, issue } = await resolveIssue(rawId)
      if (issue) resolved.push({ id, issue })
    }

    if (resolved.length > 0) {
      for (const { id, issue } of resolved) {
        const entry = tickets.get(id) ?? { issue, section, prs: new Set() }
        if (SECTION_RANK[section] < SECTION_RANK[entry.section]) entry.section = section
        for (const pr of prs) entry.prs.add(pr)
        tickets.set(id, entry)
      }
      continue
    }

    // No resolvable ticket: keep the commit under its own title. A merge-style squash
    // title says nothing, so prefer the first real body line (the PR title for a
    // single-commit squash, the first commit message for a multi-commit one).
    let text = subject
    if (isMergeTitle) {
      const bodyLine = body
        .split('\n')
        .map(line => line.replace(/^[\s*-]+/, '').trim())
        .find(Boolean)
      if (bodyLine) text = /#\d+/.test(bodyLine) || prs.length === 0 ? bodyLine : `${bodyLine} (#${prs[0]})`
    }
    if (seenTitles.has(text)) continue
    seenTitles.add(text)
    titleEntries.push({ section, text: text.replace(/\(#(\d+)\)/g, (_, n) => `(${prLink(n)})`) })
  }

  const sections = { features: [], fixes: [], other: [] }
  for (const [id, { issue, section, prs }] of tickets) {
    const refs = prs.size > 0 ? ` (${[...prs].map(prLink).join(', ')})` : ''
    sections[section].push(`[${id}: ${issue.title}](${issue.url})${refs}`)
  }
  for (const { section, text } of titleEntries) {
    sections[section].push(text)
  }

  // Tickets referenced by this range that are not completed/canceled yet. Unresolved
  // ids (false positives like "UTF-8", missing issues) are cached as null, so the
  // optional chaining below skips them and they never reach the warning.
  const openIssues = []
  for (const [id, issue] of issueCache) {
    if (issue?.state && !CLOSED_STATE_TYPES.has(issue.state.type)) {
      openIssues.push({ id, ...issue })
    }
  }

  return { ...sections, openIssues }
}

function formatSection(title, items) {
  if (items.length === 0) return ''
  const bullets = items.map(i => `- ${i}`).join('\n')
  return `${title}\n${bullets}`
}

async function main() {
  const usingPrevDeploy = Boolean(process.env.PREV_DEPLOY_SHA?.trim())
  const { ref: rangeStart, label: rangeLabel } = getRangeStart()
  const commits = getCommits(rangeStart, { excludeMainBranch: usingPrevDeploy })

  if (commits.length === 0) {
    // biome-ignore lint/suspicious/noConsole: CLI script outputs to stdout
    console.log('No changes since last deploy.')
    return
  }

  const { features, fixes, other, openIssues } = await categorize(commits)
  const total = features.length + fixes.length + other.length

  // GitHub Markdown throughout: the PR body renders it natively and slackNotify.js
  // converts links/bold/bullets to mrkdwn before posting.
  const sections = [
    // Placed first so reviewers see un-QA'd tickets before approving/merging the
    // release PR; the release is warned about, never blocked.
    formatSection(
      '**⚠️ Open tickets**',
      openIssues.map(issue => `[${issue.id}: ${issue.title}](${issue.url}) — ${issue.state.name}`),
    ),
    formatSection('**Features**', features),
    formatSection('**Fixes**', fixes),
    formatSection('**Other Changes**', other),
  ]
    .filter(Boolean)
    .join('\n\n')

  let body = `_${total} changes since ${rangeLabel}_\n\n${sections}`

  // Hard cap: a GitHub PR body maxes out at 65536 chars (and Slack blocks are
  // far smaller). Truncate defensively so an unexpectedly large range can never
  // fail `gh pr create`. The full list always lives in CHANGELOG.md.
  const MAX = 60000
  if (body.length > MAX) {
    body = `${body.slice(0, MAX)}\n\n_…truncated (${total} changes) — see CHANGELOG.md for the full list_`
  }

  // biome-ignore lint/suspicious/noConsole: CLI script outputs to stdout
  console.log(body)
}

main().catch(err => {
  // biome-ignore lint/suspicious/noConsole: CLI script error output
  console.error('Failed to generate release summary:', err)
  process.exit(1)
})
