const https = require('node:https')
const fs = require('node:fs')

const token = process.env.SLACK_BOT_TOKEN
const channel = process.env.SLACK_CHANNEL_ID
const threadTs = process.env.SLACK_THREAD_TS || ''
const updateTs = process.env.SLACK_UPDATE_TS || ''
const message = process.env.SLACK_MESSAGE || ''

if (!token || !channel) {
  // biome-ignore lint/suspicious/noConsole: CLI script
  console.log('Skipping Slack notification: missing SLACK_BOT_TOKEN or SLACK_CHANNEL_ID')
  process.exit(0)
}

if (!message) {
  // biome-ignore lint/suspicious/noConsole: CLI script
  console.error('Missing required env: SLACK_MESSAGE')
  process.exit(1)
}

function mdToMrkdwn(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*') // bold
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>') // links
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*') // headings
    .replace(/^- /gm, '• ') // list items
}

const payload = {
  channel,
  text: mdToMrkdwn(message),
  unfurl_links: false,
  unfurl_media: false,
}

// SLACK_UPDATE_TS rewrites an existing message in place (chat.update) instead of
// posting a new one; SLACK_THREAD_TS still posts a new message into a thread.
if (updateTs) {
  payload.ts = updateTs
} else if (threadTs) {
  payload.thread_ts = threadTs
}

const body = JSON.stringify(payload)

const req = https.request(
  {
    hostname: 'slack.com',
    path: updateTs ? '/api/chat.update' : '/api/chat.postMessage',
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
      if (res.statusCode < 200 || res.statusCode >= 300) {
        // biome-ignore lint/suspicious/noConsole: CLI script
        console.error(`Slack API HTTP error: ${res.statusCode} ${data}`)
        process.exit(1)
      }

      try {
        const json = JSON.parse(data)
        if (!json.ok) {
          // biome-ignore lint/suspicious/noConsole: CLI script
          console.error(`Slack API error: ${json.error}`)
          process.exit(1)
        }
        // Only accept a Slack-shaped timestamp before writing it to GITHUB_OUTPUT
        const ts = typeof json.ts === 'string' ? (json.ts.match(/^(\d+\.\d+)$/) || [])[1] || '' : ''
        // biome-ignore lint/suspicious/noConsole: CLI script
        console.log(`Message posted (ts: ${ts})`)

        const outputFile = process.env.GITHUB_OUTPUT
        if (outputFile && ts) {
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
  // Remove line separators so untrusted text cannot forge additional log entries
  const message = String(e?.message || '').replace(/[\r\n\u2028\u2029]/g, '')
  // biome-ignore lint/suspicious/noConsole: CLI script
  console.error(`Request error: ${message}`)
  process.exit(1)
})

req.write(body)
req.end()
