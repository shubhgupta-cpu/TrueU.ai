// Creates the app's tables and fields in Airtable from schema.mjs. Additive only:
// - creates tables that don't exist yet, and adds missing fields to tables this script created
//   (their IDs are recorded in manifest.json);
// - never modifies, renames or deletes anything else — the base's other tables are left alone;
// - stops before changing anything if a schema table name is already used by another table.
//
//   node scripts/airtable/apply.mjs --dry-run   # show the plan
//   node scripts/airtable/apply.mjs             # apply it
import { client, loadEnv, readManifest, writeManifest } from './lib.mjs';
import { LINKS, TABLES } from './schema.mjs';

const dryRun = process.argv.includes('--dry-run');
const env = loadEnv();
const at = client(env);
const manifest = readManifest(env.baseId);

/** Schema builder → Airtable field payload. */
function toPayload(f) {
  const out = { name: f.name, type: f.type };
  if (f.options) out.options = f.options;
  if (f.description) out.description = f.description;
  return out;
}

const existing = await at.tables();
const byId = new Map(existing.map((t) => [t.id, t]));
const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));

// 1. Safety check before any change.
const conflicts = TABLES.filter((t) => {
  const same = byName.get(t.name.toLowerCase());
  return same && manifest.tables[t.name] !== same.id;
});
if (conflicts.length) {
  console.error(
    `Stopped: these names are already used by tables this project didn't create: ${conflicts
      .map((t) => t.name)
      .join(', ')}. Nothing was changed.`,
  );
  process.exit(1);
}

let createdTables = 0;
let createdFields = 0;
const log = (s) => console.log(`${dryRun ? '[dry run] ' : ''}${s}`);

// 2. Tables and plain fields.
for (const table of TABLES) {
  const id = manifest.tables[table.name];
  const current = id ? byId.get(id) : undefined;
  if (!current) {
    log(`create table "${table.name}" (${table.fields.length} fields)`);
    if (!dryRun) {
      const t = await at.createTable({
        name: table.name,
        description: table.description,
        fields: table.fields.map(toPayload),
      });
      manifest.tables[table.name] = t.id;
      writeManifest(manifest); // saved after every table so a failed run can resume
      byId.set(t.id, t);
    }
    createdTables++;
    continue;
  }
  const have = new Set(current.fields.map((f) => f.name.toLowerCase()));
  for (const f of table.fields) {
    if (have.has(f.name.toLowerCase())) continue;
    log(`add field "${table.name}.${f.name}"`);
    if (!dryRun) await at.createField(current.id, toPayload(f));
    createdFields++;
  }
}

// 3. Links (every table exists now). Airtable adds the reverse field automatically.
const fresh = dryRun ? [...byId.values()] : await at.tables();
const tableById = new Map(fresh.map((t) => [t.id, t]));
for (const [tableName, field, target, description] of LINKS) {
  const tableId = manifest.tables[tableName];
  const targetId = manifest.tables[target];
  const table = tableId ? tableById.get(tableId) : undefined;
  if (table?.fields.some((f) => f.name.toLowerCase() === field.toLowerCase())) continue;
  log(`link "${tableName}.${field}" → ${target}`);
  if (!dryRun) {
    await at.createField(tableId, {
      name: field,
      type: 'multipleRecordLinks',
      options: { linkedTableId: targetId },
      ...(description ? { description } : {}),
    });
  }
  createdFields++;
}

console.log(
  `${dryRun ? 'Would create' : 'Created'} ${createdTables} tables and ${createdFields} fields/links.` +
    (existing.length ? ` Untouched: ${existing.filter((t) => !Object.values(manifest.tables).includes(t.id)).map((t) => t.name).join(', ')}.` : ''),
);
