import { randomUUID } from 'node:crypto'
import { createInterface, type Interface } from 'node:readline/promises'

import bcrypt from 'bcryptjs'

import { db } from '../app/data/db.ts'
import { config, users, UserRoles } from '../app/data/schema.ts'

interface MutableInterface extends Interface {
  _writeToOutput?: (stringToWrite: string) => void
}

async function askVisible(rl: Interface, prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim()
}

async function askHidden(rl: MutableInterface, prompt: string): Promise<string> {
  process.stdout.write(prompt)
  const originalWrite = rl._writeToOutput
  rl._writeToOutput = (stringToWrite: string) => {
    // Allow newlines through (so the user sees they hit enter); swallow keystroke echoes.
    if (stringToWrite === '\n' || stringToWrite === '\r\n' || stringToWrite === '\r') {
      originalWrite?.call(rl, stringToWrite)
    }
  }
  try {
    const value = await rl.question('')
    return value
  } finally {
    rl._writeToOutput = originalWrite
  }
}

function validateUsername(value: string): string | null {
  if (value.length < 3 || value.length > 16) return 'Username must be 3-16 characters'
  if (!/^[a-zA-Z0-9_-]+$/.test(value))
    return 'Username may only contain letters, numbers, underscores, and dashes'
  return null
}

function validatePassword(value: string): string | null {
  if (value.length < 8) return 'Password must be at least 8 characters'
  if (value.length > 64) return 'Password must be 64 characters or fewer'
  return null
}

async function ensureConfigRow(): Promise<void> {
  const existing = await db.findOne(config, { where: { id: 1 } })
  if (existing) return
  await db.create(config, { id: 1, invitations_enabled: true })
}

async function main() {
  const rl: MutableInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  try {
    console.log('Bootstrap a stickertrade admin user.')
    console.log('')

    let username: string
    while (true) {
      username = await askVisible(rl, 'Username: ')
      const err = validateUsername(username)
      if (err) {
        console.log(`  ✗ ${err}`)
        continue
      }
      const existing = await db.findOne(users, { where: { username } })
      if (existing) {
        console.log(`  ✗ User "${username}" already exists. Choose a different username.`)
        continue
      }
      break
    }

    let password: string
    while (true) {
      const first = await askHidden(rl, 'Password: ')
      const err = validatePassword(first)
      if (err) {
        console.log(`  ✗ ${err}`)
        continue
      }
      const second = await askHidden(rl, 'Confirm password: ')
      if (first !== second) {
        console.log("  ✗ Passwords don't match. Try again.")
        continue
      }
      password = first
      break
    }

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

    console.log('')
    console.log(`✓ Admin user "${username}" created.`)
  } finally {
    rl.close()
  }
}

await main()
