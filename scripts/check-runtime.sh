#!/bin/sh
# Keep the real entrypoint: ownership repair, migrations, privilege drop, server.
set -eu
container=$(docker run -d --network none --tmpfs /app/db --tmpfs /app/tmp \
  --tmpfs /app/tmp/uploads --tmpfs /app/tmp/sessions \
  -e SESSION_SECRET=runtime-compatibility-test-only "${1:?built image required}")
trap 'docker logs "$container"; docker rm -f "$container" >/dev/null' EXIT

docker exec -i -u app "$container" node --import remix/node-tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
assert.equal(process.versions.node.split('.')[0], '26');
assert.equal(process.config.variables.v8_enable_pointer_compression, 1);
const db = new DatabaseSync('/app/db/runtime-probe.sqlite');
db.exec('CREATE TABLE runtime_probe(value INTEGER); INSERT INTO runtime_probe VALUES (26)');
assert.equal(db.prepare('SELECT value FROM runtime_probe').get().value, 26);
db.close();
const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
assert.equal((await sharp(image).metadata()).width, 2);
for (const path of ['/', '/login', '/stickers', '/assets/app/assets/entry.ts']) {
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { response = await fetch(`http://127.0.0.1:44100${path}`); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.equal(response?.status, 200, path);
  assert.ok((await response.text()).length > 0, path);
  console.log(path, response.status);
}
// The entrypoint already applied these migrations. Check the idempotent path too.
await import('./scripts/migrate.ts');
console.log(process.version, 'pointer compression=1; Remix loader, SQLite, migrations and sharp OK');
JS
