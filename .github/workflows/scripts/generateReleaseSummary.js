const { execFileSync } = require('node:child_process')

const REPO_URL = 'https://github.com/aragon/app-backend'

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
  const args = ['log', range, ...excludeMain, '--no-merges', '--pretty=format:%s']
  try {
    const log = execFileSync('git', args, { encoding: 'utf8' })
    return log.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function categorize(commits) {
  const features = []
  const fixes = []
  const other = []
  const seen = new Set()

  for (const msg of commits) {
    if (/^chore\(release\)/i.test(msg) || /^Merge /i.test(msg)) continue
    if (seen.has(msg)) continue
    seen.add(msg)

    const formatted = msg.replace(/\(#(\d+)\)/g, `(<${REPO_URL}/pull/$1|#$1>)`)

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

function main() {
  const usingPrevDeploy = Boolean(process.env.PREV_DEPLOY_SHA?.trim())
  const rangeStart = getRangeStart()
  const commits = getCommits(rangeStart, { excludeMainBranch: usingPrevDeploy })

  if (commits.length === 0) {
    // biome-ignore lint/suspicious/noConsole: CLI script outputs to stdout
    console.log('No changes since last deploy.')
    return
  }

  const { features, fixes, other } = categorize(commits)
  const total = features.length + fixes.length + other.length

  const sections = [
    formatSection('*Features*', features),
    formatSection('*Fixes*', fixes),
    formatSection('*Other Changes*', other),
  ]
    .filter(Boolean)
    .join('\n\n')

  // biome-ignore lint/suspicious/noConsole: CLI script outputs to stdout
  console.log(`_${total} changes since ${describeRange(rangeStart)}_\n\n${sections}`)
}

main()
