#!/usr/bin/env node
/**
 * record-observation.js
 *
 * PostToolUse hook. stdin から Claude Code のツール実行イベントを受け取り、
 * docs/observations.jsonl に追記する。openspec-workflow の observe-patterns
 * スキルが後段でこのログを読み、instinct に蒸留する。
 *
 * 失敗してもツール実行をブロックしないよう、全てのエラーは握り潰す。
 */
const fs = require('fs')
const path = require('path')

let buf = ''
process.stdin.on('data', (chunk) => {
  buf += chunk
})
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(buf || '{}')
    const toolName = event.tool_name || '?'
    const input = event.tool_input || {}
    const entry = {
      tool: toolName,
      file: input.file_path || input.path || null,
      cmd: typeof input.command === 'string' ? input.command.slice(0, 200) : null,
      ts: new Date().toISOString(),
    }
    const dir = path.join(process.cwd(), 'docs')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'observations.jsonl'), JSON.stringify(entry) + '\n')
  } catch {
    // 決してツール実行をブロックしない
  }
  process.exit(0)
})
