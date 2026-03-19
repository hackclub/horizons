import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const AIRTABLE_API_KEY = process.env.YSWS_AIRTABLE_API_KEY;
const BASE_ID = process.env.YSWS_BASE_ID;
const USERS_TABLE_ID = process.env.YSWS_USERS_TABLE_ID;
const DRY_RUN = process.argv.includes('--dry-run');

if (!AIRTABLE_API_KEY || !BASE_ID || !USERS_TABLE_ID) {
  console.error('Missing required env vars: YSWS_AIRTABLE_API_KEY, YSWS_BASE_ID, YSWS_USERS_TABLE_ID');
  process.exit(1);
}

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
}

const RATE_LIMIT_DELAY_MS = 220; // ~4.5 req/s, under Airtable's 5 req/s limit

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllAirtableUsers(): Promise<Map<string, AirtableRecord>> {
  const records = new Map<string, AirtableRecord>();
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE_ID}`);
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (!response.ok) {
      throw new Error(`Airtable list failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    for (const record of data.records) {
      const email = record.fields['Email'];
      if (email) {
        records.set(email.toLowerCase(), record);
      }
    }
    offset = data.offset;

    if (offset) await sleep(RATE_LIMIT_DELAY_MS);
  } while (offset);

  return records;
}

async function sendBatch(
  method: 'POST' | 'PATCH',
  records: Array<{ fields: Record<string, any>; id?: string }>,
  batchIndex: number,
): Promise<string[]> {
  const response = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE_ID}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    const failedEmails = records.map((r) => r.fields['Email'] || r.id || 'unknown');
    console.error(`Batch ${batchIndex} failed (${response.status}): ${errorText}`);
    return failedEmails;
  }

  return [];
}

async function processBatches(
  label: string,
  method: 'POST' | 'PATCH',
  records: Array<{ fields: Record<string, any>; id?: string }>,
): Promise<string[]> {
  const allFailed: string[] = [];

  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const batchNum = Math.floor(i / 10) + 1;
    const totalBatches = Math.ceil(records.length / 10);

    const failed = await sendBatch(method, batch, batchNum);
    allFailed.push(...failed);

    console.log(`  ${label} batch ${batchNum}/${totalBatches}: ${failed.length === 0 ? 'OK' : `${failed.length} failed`}`);

    if (i + 10 < records.length) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  return allFailed;
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function main() {
  if (DRY_RUN) {
    console.log('=== DRY RUN MODE — no changes will be made ===\n');
  }

  console.log('Fetching existing Airtable users...');
  const existingRecords = await fetchAllAirtableUsers();
  console.log(`Found ${existingRecords.size} existing Airtable user records`);

  console.log('Fetching users from database...');
  const users = await prisma.user.findMany({
    select: {
      email: true,
      createdAt: true,
      projects: {
        select: {
          createdAt: true,
          submissions: {
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  console.log(`Found ${users.length} users in database`);

  const toCreate: Array<{ fields: Record<string, any> }> = [];
  const toUpdate: Array<{ id: string; fields: Record<string, any> }> = [];

  for (const user of users) {
    const signUpAt = toDateString(user.createdAt);

    const firstProject = user.projects[0];
    const firstProjectCreatedAt = firstProject ? toDateString(firstProject.createdAt) : null;

    let firstSubmitAt: string | null = null;
    for (const project of user.projects) {
      if (project.submissions.length > 0) {
        const submissionDate = project.submissions[0].createdAt;
        if (!firstSubmitAt || toDateString(submissionDate) < firstSubmitAt) {
          firstSubmitAt = toDateString(submissionDate);
        }
      }
    }

    const existing = existingRecords.get(user.email.toLowerCase());

    if (existing) {
      const fieldsToUpdate: Record<string, any> = {};

      if (!existing.fields['Loops - horizonsSignUpAt']) {
        fieldsToUpdate['Loops - horizonsSignUpAt'] = signUpAt;
      }
      if (!existing.fields['Loops - horizonsFirstProjectCreatedAt'] && firstProjectCreatedAt) {
        fieldsToUpdate['Loops - horizonsFirstProjectCreatedAt'] = firstProjectCreatedAt;
      }
      if (!existing.fields['Loops - horizonsFirstSubmitAt'] && firstSubmitAt) {
        fieldsToUpdate['Loops - horizonsFirstSubmitAt'] = firstSubmitAt;
      }

      if (Object.keys(fieldsToUpdate).length > 0) {
        toUpdate.push({ id: existing.id, fields: fieldsToUpdate });
      }
    } else {
      const fields: Record<string, any> = {
        Email: user.email,
        'Loops - horizonsSignUpAt': signUpAt,
      };
      if (firstProjectCreatedAt) {
        fields['Loops - horizonsFirstProjectCreatedAt'] = firstProjectCreatedAt;
      }
      if (firstSubmitAt) {
        fields['Loops - horizonsFirstSubmitAt'] = firstSubmitAt;
      }
      toCreate.push({ fields });
    }
  }

  console.log(`\nBackfill plan:`);
  console.log(`  Records to create: ${toCreate.length}`);
  console.log(`  Records to update: ${toUpdate.length}`);
  console.log(`  Already up to date: ${users.length - toCreate.length - toUpdate.length}`);

  if (DRY_RUN) {
    if (toCreate.length > 0) {
      console.log(`\nSample creates (first 3):`);
      for (const rec of toCreate.slice(0, 3)) {
        console.log(`  ${rec.fields['Email']}: ${JSON.stringify(rec.fields)}`);
      }
    }
    if (toUpdate.length > 0) {
      console.log(`\nSample updates (first 3):`);
      for (const rec of toUpdate.slice(0, 3)) {
        console.log(`  ${rec.id}: ${JSON.stringify(rec.fields)}`);
      }
    }
    console.log('\nDry run complete. Run without --dry-run to apply changes.');
    return;
  }

  const allFailed: string[] = [];

  if (toCreate.length > 0) {
    console.log('\nCreating new records...');
    const failed = await processBatches('Create', 'POST', toCreate);
    allFailed.push(...failed);
  }

  if (toUpdate.length > 0) {
    console.log('\nUpdating existing records...');
    const failed = await processBatches('Update', 'PATCH', toUpdate);
    allFailed.push(...failed);
  }

  console.log('\nBackfill complete!');
  if (allFailed.length > 0) {
    console.error(`\n${allFailed.length} records failed:`);
    for (const id of allFailed) {
      console.error(`  - ${id}`);
    }
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
