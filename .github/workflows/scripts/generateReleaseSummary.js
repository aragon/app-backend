const { execSync } = require('node:child_process')
const fs = require('node:fs')

const runGit = command => {
  try {
    return execSync(command).toString().trim()
  } catch (error) {
    console.error(`Failed to run git command: ${command}`, error)
    return ''
  }
}

const generateSummary = async ({ core }) => {
  const previousTag = runGit('git tag --list "v*" --sort=-v:refname | head -n 1')
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD'
  console.log(`Generating release summary for range: ${range}`)

  const log = runGit(`git log ${range} --pretty=format:"%s"`)
  const lines = log.split('\n').filter(Boolean)

  const categories = {
    features: [],
    fixes: [],
    others: [],
  }

  for (const line of lines) {
    const lower = line.toLowerCase()

    // Skip release commits and merge commits
    if (lower.startsWith('chore(release)') || lower.startsWith('merge')) {
      continue
    }

    let category = 'others'
    if (lower.startsWith('feat')) {
      category = 'features'
    } else if (lower.startsWith('fix')) {
      category = 'fixes'
    } else if (lower.startsWith('perf')) {
      category = 'features'
    }

    // Clean conventional commit prefix
    let cleanLine = line.replace(/^(feat|fix|chore|docs|style|refactor|perf|test)(\(.*\))?:\s*/, '').trim()

    // Linkify PR numbers (#123 -> [#123](url))
    cleanLine = cleanLine.replace(/\(#(\d+)\)/g, '([#$1](https://github.com/aragon/app-backend/pull/$1))')

    if (cleanLine) {
      categories[category].push(cleanLine)
    }
  }

  let summary = ''

  if (categories.features.length > 0) {
    summary += '## Features\n'
    categories.features.forEach(item => (summary += `- ${item}\n`))
    summary += '\n'
  }

  if (categories.fixes.length > 0) {
    summary += '## Fixes\n'
    categories.fixes.forEach(item => (summary += `- ${item}\n`))
    summary += '\n'
  }

  if (categories.others.length > 0) {
    summary += '## Other Changes\n'
    categories.others.forEach(item => (summary += `- ${item}\n`))
    summary += '\n'
  }

  if (!summary) {
    summary = 'No significant changes detected.'
  }

  core.setOutput('summary', summary)
  console.log('Release summary generated:\n' + summary)
}

if (require.main === module) {
  const core = {
    setOutput: (name, value) => {
      const outputFile = process.env.GITHUB_OUTPUT
      if (outputFile) {
        fs.appendFileSync(outputFile, `${name}<<EOF\n${value}\nEOF\n`)
      }
    },
  }
  generateSummary({ core })
}
