import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend root before anything else
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const BASE_URL = (process.env.JOE_API_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.JOE_API_KEY || '';
const EVENT_ID = process.env.JOE_EVENT_ID || '';

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Integration tests for the Joe fraud-review API.
 * These hit the real API — run manually, not in CI.
 *
 * Usage: pnpm --filter backend jest fraud-review.integration --runInBand
 */
describe('Fraud Review API (integration)', () => {
  let joeProjectId: string;
  const dedupKey = `integration-test-${Date.now()}`;

  beforeAll(() => {
    if (!BASE_URL || !API_KEY || !EVENT_ID) {
      throw new Error(
        'Missing env vars — set JOE_API_BASE_URL, JOE_API_KEY, and JOE_EVENT_ID in backend/.env',
      );
    }
  });

  // --- 1. Create Project (POST /events/{eventId}/projects) ---
  it('should submit a project and receive an ID back', async () => {
    const payload = {
      name: 'evangan.com',
      codeLink: 'https://github.com/evan-gan/evangan.com',
      demoLink: 'https://evangan.com',
      submitter: { slackId: 'U05D1G4H754' },
      hackatimeProjects: ['evangan.com'],
      organizerPlatformId: dedupKey,
    };

    const url = `${BASE_URL}/events/${EVENT_ID}/projects`;
    console.log('POST', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { id: string };
    console.log('Submit response:', response.status, data);

    expect([200, 201]).toContain(response.status);
    expect(data).toHaveProperty('id');
    expect(typeof data.id).toBe('string');

    joeProjectId = data.id;
  });

  // --- 2. List Projects (GET /events/{eventId}/projects) ---
  // Requires projects:read permission on the API key — skip if not available
  it('should list all projects and find the one we just created', async () => {
    expect(joeProjectId).toBeDefined();

    // Give Joe time to process the submission
    await delay(2000);

    const url = `${BASE_URL}/events/${EVENT_ID}/projects`;
    console.log('GET', url);

    const response = await fetch(url, { headers: authHeaders() });
    const text = await response.text();
    console.log('List response:', response.status, text.slice(0, 500));

    if (response.status === 401 || response.status === 403) {
      console.warn('API key lacks projects:read permission — skipping list test');
      return;
    }

    expect(response.ok).toBe(true);

    const data = JSON.parse(text) as {
      projects: Array<{
        id: string;
        organizerPlatformId: string | null;
        status: string;
        review: unknown;
      }>;
    };
    expect(data).toHaveProperty('projects');
    expect(Array.isArray(data.projects)).toBe(true);

    // Find our project by organizerPlatformId
    const ourProject = data.projects.find(
      (p) => p.organizerPlatformId === dedupKey,
    );
    expect(ourProject).toBeDefined();
    expect(ourProject!.id).toBe(joeProjectId);
    expect(ourProject!.status).toBe('pending');
    console.log(
      'Found project in list:',
      ourProject!.id,
      'status=',
      ourProject!.status,
      'review=',
      ourProject!.review,
    );
  });

  // --- 3. Submit Review (POST /events/{eventId}/projects/{id}/review) ---
  it('should submit a review with a passing trust score', async () => {
    expect(joeProjectId).toBeDefined();

    const url = `${BASE_URL}/events/${EVENT_ID}/projects/${joeProjectId}/review`;
    console.log('POST', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        trustScore: 7,
        justification: 'Integration test — code appears original.',
      }),
    });

    const data = (await response.json()) as { status: string };
    console.log('Review response:', response.status, data);

    expect(response.ok).toBe(true);
    expect(data).toHaveProperty('status', 'success');
  });

  // --- 4. List again — verify project is now "complete" with review data ---
  it('should show project as complete with review data after review', async () => {
    // Give Joe time to process the review
    await delay(2000);

    const url = `${BASE_URL}/events/${EVENT_ID}/projects`;
    const response = await fetch(url, { headers: authHeaders() });
    const text = await response.text();
    console.log('List after review:', response.status, text.slice(0, 500));

    if (response.status === 401 || response.status === 403) {
      console.warn('API key lacks projects:read permission — skipping list test');
      return;
    }

    expect(response.ok).toBe(true);

    const data = JSON.parse(text) as {
      projects: Array<{
        id: string;
        status: string;
        review: { trustScore: number; justification: string } | null;
      }>;
    };

    const ourProject = data.projects.find((p) => p.id === joeProjectId);
    expect(ourProject).toBeDefined();
    expect(ourProject!.status).toBe('complete');
    expect(ourProject!.review).not.toBeNull();
    expect(ourProject!.review!.trustScore).toBe(7);

    console.log(
      'After review:',
      'status=',
      ourProject!.status,
      'trustScore=',
      ourProject!.review!.trustScore,
    );
  });

  // --- 5. Record Outcome (POST /events/{eventId}/projects/{id}/outcome) ---
  it('should record an approved outcome after review passes', async () => {
    expect(joeProjectId).toBeDefined();

    const url = `${BASE_URL}/events/${EVENT_ID}/projects/${joeProjectId}/outcome`;
    console.log('POST', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        status: 'approved',
        reason: 'Integration test — approved.',
      }),
    });

    const text = await response.text();
    console.log('Outcome response:', response.status, text);

    expect(response.ok).toBe(true);
    const data = JSON.parse(text) as { status: string };
    expect(data).toHaveProperty('status', 'success');
  });
});
