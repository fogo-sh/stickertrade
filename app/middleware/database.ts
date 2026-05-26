import { Database } from 'remix/data-table'
import type { Middleware } from 'remix/router'

import { db } from '../data/db.ts'

export function loadDatabase(): Middleware<{
  key: typeof Database
  value: Database
  property: 'database'
}> {
  return async (context, next) => {
    context.set(Database, db)
    return next()
  }
}
