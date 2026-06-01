import {
  AIRTABLE_API_KEY,
  YSWS_BASE_ID,
  APPROVED_PROJECTS_TABLE_ID,
} from './env';

export interface AirtableAttachment {
  id?: string;
  url: string;
  filename?: string;
  size?: number;
  type?: string;
}

export interface AirtableRecord<F = Record<string, any>> {
  id: string;
  createdTime: string;
  fields: F;
}

interface ListResponse<F> {
  records: AirtableRecord<F>[];
  offset?: string;
}

const API_BASE = 'https://api.airtable.com/v0';

async function airtableFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (init?.method && init.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...init, headers });
}

/**
 * Iterate every record in the Approved Projects table. Paginated via
 * Airtable's `offset` cursor. Pass `fields` to limit the columns returned
 * (smaller payloads + skirts unrelated computed-field errors).
 */
export async function* iterateApprovedProjects<
  F extends Record<string, any> = Record<string, any>,
>(opts?: {
  fields?: string[];
  filterByFormula?: string;
  pageSize?: number;
}): AsyncGenerator<AirtableRecord<F>> {
  const params = new URLSearchParams();
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
  if (opts?.filterByFormula)
    params.set('filterByFormula', opts.filterByFormula);
  for (const f of opts?.fields ?? []) params.append('fields[]', f);

  let offset: string | undefined;
  do {
    if (offset) params.set('offset', offset);
    else params.delete('offset');

    const res = await airtableFetch(
      `/${YSWS_BASE_ID}/${APPROVED_PROJECTS_TABLE_ID}?${params.toString()}`,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Airtable list failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as ListResponse<F>;
    for (const rec of json.records) yield rec;
    offset = json.offset;
  } while (offset);
}

/**
 * Patch a single record. Airtable also supports batch PATCH up to 10
 * records per request — see {@link patchApprovedProjects}.
 */
export async function patchApprovedProject(
  recordId: string,
  fields: Record<string, any>,
): Promise<void> {
  const res = await airtableFetch(
    `/${YSWS_BASE_ID}/${APPROVED_PROJECTS_TABLE_ID}/${recordId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Airtable patch failed for ${recordId} (${res.status}): ${body}`,
    );
  }
}

export async function patchApprovedProjects(
  records: { id: string; fields: Record<string, any> }[],
): Promise<void> {
  if (records.length === 0) return;
  if (records.length > 10) {
    throw new Error('Airtable batch PATCH max is 10 records per call');
  }
  const res = await airtableFetch(
    `/${YSWS_BASE_ID}/${APPROVED_PROJECTS_TABLE_ID}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ records }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Airtable batch patch failed (${res.status}): ${body}`);
  }
}

/** Quick check — Airtable returns attachments as `[]` when cleared, or undefined when never set. */
export function isScreenshotMissing(value: unknown): boolean {
  if (!value) return true;
  if (!Array.isArray(value)) return true;
  return value.length === 0;
}
