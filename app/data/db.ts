import { DatabaseSync } from 'node:sqlite'

import { createDatabase } from 'remix/data-table'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'

const DB_PATH = process.env.DATABASE_URL ?? './db/stickertrade.sqlite'

const sqlite = new DatabaseSync(DB_PATH)
sqlite.exec('PRAGMA foreign_keys = ON')
sqlite.exec('PRAGMA journal_mode = WAL')

export const adapter = createSqliteDatabaseAdapter(sqlite)
export const db = createDatabase(adapter)
export const rawSqlite = sqlite
