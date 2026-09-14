// Aplica um arquivo SQL na base remota via Management API (usa o token do opencode MCP).
// Uso: node apply.mjs caminho/para/migracao.sql [--query "sql de verificacao"]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ref = 'tcaygumxsfjeuficioja'
const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'mcp-auth.json')
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'))
const token = auth.supabase?.tokens?.accessToken
if (!token) {
  console.error('Token não encontrado em', authPath)
  process.exit(1)
}

const argv = process.argv.slice(2)
const sqlFile = argv[0]
if (!sqlFile) {
  console.error('Informe o arquivo SQL.')
  process.exit(1)
}

const verifIdx = argv.indexOf('--query')
let query = null
if (verifIdx >= 0) query = argv[verifIdx + 1]

const sql = fs.readFileSync(sqlFile, 'utf8')

async function post(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error('ERRO', res.status, text)
    process.exit(1)
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const out = await post(sql)
console.log('ok:', out === null || (Array.isArray(out) && out.length === 0) ? JSON.stringify(out) : out)
if (query) {
  const ver = await post(query)
  console.log('verificacao:', JSON.stringify(ver, null, 1))
}