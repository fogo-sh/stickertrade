import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'

import { adapter } from '../app/data/db.ts'

const migrations = await loadMigrations('./migrations')
const runner = createMigrationRunner(adapter, migrations)

const direction = process.argv[2] === 'down' ? 'down' : 'up'

if (direction === 'down') {
  await runner.down()
  console.log('Migrations rolled back.')
} else {
  await runner.up()
  console.log('Migrations applied.')
}
