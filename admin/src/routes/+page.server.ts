import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  const apiUrl = process.env.PUBLIC_API_URL || 'http://localhost:3000';

  const userResponse = await fetch(`${apiUrl}/api/user/auth/me`, {
    credentials: 'include',
  });

  if (userResponse.status === 401) {
    throw redirect(302, '/login');
  }

  if (!userResponse.ok) {
    throw error(500, 'Failed to verify session');
  }

  const user = await userResponse.json();

  if (user.role !== 'admin') {
    throw redirect(302, '/app/projects');
  }

  let metrics = {
    totalHackatimeHours: 0,
    totalApprovedHours: 0,
    totalUsers: 0,
    totalProjects: 0,
    totalSubmittedHackatimeHours: 0,
  };

  try {
    const metricsResponse = await fetch(`${apiUrl}/api/admin/metrics`, { credentials: 'include' });
    if (metricsResponse.ok) {
      const metricsData = await metricsResponse.json();
      metrics = metricsData.totals ?? metricsData;
    }
  } catch {
  }

  return {
    user,
    submissions: [],
    projects: [],
    users: [],
    metrics,
    shopItems: [],
    shopTransactions: [],
    apiUrl,
  };
};


