const https = require('node:https')
const fs = require('node:fs')

const token = process.env.SLACK_BOT_TOKEN
const channel = process.env.SLACK_CHANNEL_ID
const threadTs = process.env.SLACK_THREAD_TS || ''
const message = process.env.SLACK_MESSAGE || ''

if (!token || !channel || !message) {
  // biome-ignore lint/suspicious/noConsole: CLI script
  console.error('Missing required env: SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_MESSAGE')
  process.exit(1)
}

function mdToMrkdwn(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*') // bold
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>') // links
    .replace(/^### (.+)$/gm, '*$1*') // h3
    .replace(/^## (.+)$/gm, '*$1*') // h2
    .replace(/^# (.+)$/gm, '*$1*') // h1
    .replace(/`([^`]+)`/g, '`$1`') // inline code (no-op, same syntax)
}

const payload = {
  channel,
  text: mdToMrkdwn(message),
  unfurl_links: false,
  unfurl_media: false,
}

if (threadTs) {
  payload.thread_ts = threadTs
}

const body = JSON.stringify(payload)

const req = https.request(
  {
    hostname: 'slack.com',
    path: '/api/chat.postMessage',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  res => {
    let data = ''
    res.on('data', chunk => {
      data += chunk
    })
    res.on('end', () => {
      try {
        const json = JSON.parse(data)
        if (!json.ok) {
          // biome-ignore lint/suspicious/noConsole: CLI script
          console.error(`Slack API error: ${json.error}`)
          process.exit(1)
        }
        const ts = json.ts || ''
        // biome-ignore lint/suspicious/noConsole: CLI script
        console.log(`Message posted (ts: ${ts})`)

        // Write ts to GITHUB_OUTPUT for composite action
        const outputFile = process.env.GITHUB_OUTPUT
        if (outputFile) {
          fs.appendFileSync(outputFile, `ts=${ts}\n`)
        }
      } catch (e) {
        // biome-ignore lint/suspicious/noConsole: CLI script
        console.error(`Failed to parse Slack response: ${e.message}`)
        process.exit(1)
      }
    })
  },
)

req.on('error', e => {
  // biome-ignore lint/suspicious/noConsole: CLI script
  console.error(`Request error: ${e.message}`)
  process.exit(1)
})

req.write(body)
req.end()
