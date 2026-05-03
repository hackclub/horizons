#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const chunksDir = join(root, 'messages', '_chunks');
const enPath = join(root, 'messages', 'en.json');
const esPath = join(root, 'messages', 'es.json');

if (!existsSync(chunksDir)) {
	console.error(`No chunks dir at ${chunksDir}`);
	process.exit(1);
}

const files = readdirSync(chunksDir).filter((f) => f.endsWith('.json'));
const merged = { $schema: 'https://inlang.com/schema/inlang-message-format' };
const collisions = [];

for (const f of files) {
	const data = JSON.parse(readFileSync(join(chunksDir, f), 'utf8'));
	for (const [k, v] of Object.entries(data)) {
		if (k === '$schema') continue;
		if (k in merged && merged[k] !== v) {
			collisions.push({ key: k, existing: merged[k], incoming: v, file: f });
		}
		merged[k] = v;
	}
}

writeFileSync(enPath, JSON.stringify(merged, null, 2) + '\n');

const esExisting = existsSync(esPath)
	? JSON.parse(readFileSync(esPath, 'utf8'))
	: { $schema: 'https://inlang.com/schema/inlang-message-format' };

const esOut = { $schema: 'https://inlang.com/schema/inlang-message-format' };
for (const k of Object.keys(merged)) {
	if (k === '$schema') continue;
	esOut[k] = esExisting[k] ?? merged[k];
}
writeFileSync(esPath, JSON.stringify(esOut, null, 2) + '\n');

const keyCount = Object.keys(merged).length - 1;
console.log(`Merged ${keyCount} keys from ${files.length} chunks into messages/en.json`);
console.log(`Mirrored keys into messages/es.json (${Object.keys(esOut).length - 1} keys; untranslated entries fall back to English source)`);
console.log(`Collisions: ${collisions.length}`);
if (collisions.length) {
	console.log(JSON.stringify(collisions, null, 2));
}
