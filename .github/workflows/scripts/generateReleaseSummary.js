const { execFileSync } = require('node:child_process')

const REPO_URL = 'https://github.com/aragon/app-backend'

const LINEAR_API_URL = 'https://api.linear.app/graphql'
// Linear issue identifiers like "APP-1234" embedded in commit subjects.
const LINEAR_ID_RE = /\b[A-Za-z]{2,}-\d+\b/g

// Resolve a Linear issue to its title + url. Returns null on ANY failure (no
// token, network error, unknown id) so the summary degrades gracefully — Linear
// enrichment is optional and must never fail the release.
async function fetchLinearIssue(issueId, token) {
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        query: 'query Issue($id: String!) { issue(id: $id) { title url } }',
        variables: { id: issueId },
      }),
    })
    const data = await response.json()
    return data?.data?.issue ?? null
  } catch {
    return null
  }
}

function getLastTag() {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0', 'HEAD~1'], { encoding: 'utf8' }).trim()
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
// otherwise grow the changelog unboundedly between releases.
function getRangeStart() {
  const prev = process.env.PREV_DEPLOY_SHA?.trim()
  if (prev && isReachable(prev)) return prev
  return getLastTag()
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
  const args = ['log', range, ...maxCount, ...excludeMain, '--no-merges', '--pretty=format:%s']
  try {
    const log = execFileSync('git', args, { encoding: 'utf8' })
    return log.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

async function categorize(commits) {
  const features = []
  const fixes = []
  const other = []
  const seen = new Set()

  // Linear enrichment is optional: only attempted when a token is present, and
  // each issue is fetched at most once (a commit referenced from several lines).
  const linearToken = process.env.LINEAR_API_TOKEN?.trim()
  const issueCache = new Map()

  // Append Slack-mrkdwn links (`<url|APP-123: title>`) for any Linear ids in the
  // subject — same link syntax as the PR linkification above. Unresolved ids
  // (false positives like "UTF-8", or missing issues) are silently dropped.
  async function linkifyLinear(msg) {
    if (!linearToken) return ''
    const ids = msg.match(LINEAR_ID_RE)
    if (!ids) return ''
    const parts = []
    const addedHere = new Set()
    for (const id of ids) {
      if (addedHere.has(id)) continue
      addedHere.add(id)
      if (!issueCache.has(id)) issueCache.set(id, await fetchLinearIssue(id, linearToken))
      const issue = issueCache.get(id)
      if (issue) parts.push(`<${issue.url}|${id}: ${issue.title}>`)
    }
    return parts.length ? ` — ${parts.join(' ')}` : ''
  }

  for (const msg of commits) {
    if (/^chore\(release\)/i.test(msg) || /^Merge /i.test(msg)) continue
    if (seen.has(msg)) continue
    seen.add(msg)

    const formatted = msg.replace(/\(#(\d+)\)/g, `(<${REPO_URL}/pull/$1|#$1>)`) + (await linkifyLinear(msg))

    if (/^feat[\s(:]/i.test(msg) || /^perf[\s(:]/i.test(msg)) {
      features.push(formatted)
    } else if (/^fix[\s(:]/i.test(msg)) {
      fixes.push(formatted)
    } else {
      other.push(formatted)
    }
  }

  return { features, fixes, other }
}

function formatSection(title, items) {
  if (items.length === 0) return ''
  const bullets = items.map(i => `- ${i}`).join('\n')
  return `${title}\n${bullets}`
}

function describeRange(rangeStart) {
  if (!rangeStart) return 'initial commit'
  // If it looks like a SHA, label it as the previous deploy; otherwise it's a tag.
  return /^[0-9a-f]{7,40}$/i.test(rangeStart) ? `last deploy (${rangeStart.slice(0, 7)})` : rangeStart
}

async function main() {
  const usingPrevDeploy = Boolean(process.env.PREV_DEPLOY_SHA?.trim())
  const rangeStart = getRangeStart()
  const commits = getCommits(rangeStart, { excludeMainBranch: usingPrevDeploy })

  if (commits.length === 0) {
    // biome-ignore lint/suspicious/noConsole: CLI script outputs to stdout
    console.log('No changes since last deploy.')
    return
  }

  const { features, fixes, other } = await categorize(commits)
  const total = features.length + fixes.length + other.length

  const sections = [
    formatSection('*Features*', features),
    formatSection('*Fixes*', fixes),
    formatSection('*Other Changes*', other),
  ]
    .filter(Boolean)
    .join('\n\n')

  let body = `_${total} changes since ${describeRange(rangeStart)}_\n\n${sections}`

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
