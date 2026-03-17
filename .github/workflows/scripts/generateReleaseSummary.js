const { execFileSync } = require('node:child_process')

const REPO_URL = 'https://github.com/aragon/app-backend'

function getLastTag() {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0', 'HEAD~1'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function getCommits(fromTag) {
  const range = fromTag ? `${fromTag}..HEAD` : 'HEAD'
  try {
    const log = execFileSync('git', ['log', range, '--no-merges', '--pretty=format:%s'], { encoding: 'utf8' })
    return log.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function categorize(commits) {
  const features = []
  const fixes = []
  const other = []

  for (const msg of commits) {
    if (/^chore\(release\)/i.test(msg) || /^Merge /i.test(msg)) continue

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

function main() {
  const tag = getLastTag()
  const commits = getCommits(tag)

  if (commits.length === 0) {
    // biome-ignore lint/suspicious/noConsole: CLI script outputs to stdout
    console.log('No changes since last release.')
    return
  }

  const { features, fixes, other } = categorize(commits)

  const sections = [
    formatSection('*Features*', features),
    formatSection('*Fixes*', fixes),
    formatSection('*Other Changes*', other),
  ]
    .filter(Boolean)
    .join('\n\n')

  // biome-ignore lint/suspicious/noConsole: CLI script outputs to stdout
  console.log(sections)
}

main()
