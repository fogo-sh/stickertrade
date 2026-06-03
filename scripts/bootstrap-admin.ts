import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'

import bcrypt from 'bcryptjs'
import * as s from 'remix/data-schema'

import { db } from '../app/data/db.ts'
import { config, users, UserRoles } from '../app/data/schema.ts'
import { newPasswordSchema, usernameSchema } from '../app/data/validators.ts'

const USAGE = `Usage:
  bootstrap-admin --username <name> --password <password>

Options:
  --username, -u   Username for the new admin (3-16 chars, [a-zA-Z0-9_-])
  --password, -p   Password for the new admin (8-64 chars)
  --help, -h       Show this message

Notes:
  - Refuses to overwrite an existing user. Pick a different username if the
    chosen one already exists.
  - Passes appear in shell history. Wrap with 'history -d $(history 1)' or
    use a leading space (with HISTCONTROL=ignorespace) to avoid that.`

function fail(message: string): never {
  console.error(message)
  console.error('')
  console.error(USAGE)
  process.exit(1)
}

async function ensureConfigRow(): Promise<void> {
  const existing = await db.findOne(config, { where: { id: 1 } })
  if (existing) return
  await db.create(config, { id: 1, invitations_enabled: true })
}

const { values } = parseArgs({
  options: {
    username: { type: 'string', short: 'u' },
    password: { type: 'string', short: 'p' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: true,
})

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

if (!values.username) fail('Missing required --username')
if (!values.password) fail('Missing required --password')

const usernameResult = s.parseSafe(usernameSchema, values.username)
if (!usernameResult.success) {
  fail(`Invalid --username: ${usernameResult.issues[0]?.message ?? 'invalid'}`)
}

const passwordResult = s.parseSafe(newPasswordSchema, values.password)
if (!passwordResult.success) {
  fail(`Invalid --password: ${passwordResult.issues[0]?.message ?? 'invalid'}`)
}

const username = usernameResult.value
const password = passwordResult.value

const existing = await db.findOne(users, { where: { username } })
if (existing) fail(`User "${username}" already exists.`)

await ensureConfigRow()

const now = Date.now()
await db.create(users, {
  id: randomUUID(),
  username,
  role: UserRoles.Admin,
  password_hash: await bcrypt.hash(password, 10),
  invitation_limit: 100,
  created_at: now,
  updated_at: now,
})

console.log(`Admin user "${username}" created.`)
