import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHmac } from 'crypto';

interface HackatimeTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

@Injectable()
export class HackatimeService {
  private readonly HACKATIME_BASE_URL = 'https://hackatime.hackclub.com';
  private readonly STATE_TTL_MS = 600000; // 10 minutes

  constructor(private prisma: PrismaService) {}

  private getStateSecret(): string {
    const secret = process.env.STATE_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new HttpException('STATE_SECRET not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return secret;
  }

  private signState(payload: object): string {
    const data = JSON.stringify(payload);
    const signature = createHmac('sha256', this.getStateSecret()).update(data).digest('hex');
    return Buffer.from(JSON.stringify({ data, signature })).toString('base64url');
  }

  private verifyState(encodedState: string): { userId: number; timestamp: number } {
    try {
      const { data, signature } = JSON.parse(Buffer.from(encodedState, 'base64url').toString());
      const expectedSignature = createHmac('sha256', this.getStateSecret()).update(data).digest('hex');

      if (signature !== expectedSignature) {
        throw new UnauthorizedException('Invalid state signature');
      }

      const payload = JSON.parse(data);

      if (Date.now() - payload.timestamp > this.STATE_TTL_MS) {
        throw new UnauthorizedException('State expired');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new BadRequestException('Invalid state parameter');
    }
  }

  getLinkUrl(userId: number): { url: string } {
    const clientId = process.env.HACKATIME_CLIENT_ID;
    const redirectUri = process.env.HACKATIME_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new HttpException('Hackatime OAuth not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const state = this.signState({
      userId,
      timestamp: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'profile read',
      state,
    });

    return {
      url: `${this.HACKATIME_BASE_URL}/oauth/authorize?${params.toString()}`,
    };
  }

  async handleCallback(code: string, state: string): Promise<{ message: string; hackatimeUserId: string }> {
    const clientId = process.env.HACKATIME_CLIENT_ID;
    const clientSecret = process.env.HACKATIME_CLIENT_SECRET;
    const redirectUri = process.env.HACKATIME_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new HttpException('Hackatime OAuth not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (!state) {
      throw new BadRequestException('Missing state parameter');
    }

    const { userId } = this.verifyState(state);

    const tokenResponse = await fetch(`${this.HACKATIME_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Hackatime token exchange failed:', error);
      throw new UnauthorizedException('Failed to authenticate with Hackatime');
    }

    const tokens: HackatimeTokenResponse = await tokenResponse.json();

    const userInfoResponse = await fetch(`${this.HACKATIME_BASE_URL}/api/v1/authenticated/me`, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new UnauthorizedException('Failed to fetch user info from Hackatime');
    }

    const userInfo = await userInfoResponse.json();
    const hackatimeUserId = userInfo.id?.toString();

    if (!hackatimeUserId) {
      throw new BadRequestException('Could not determine Hackatime user ID');
    }

    const existingLink = await this.prisma.user.findFirst({
      where: {
        hackatimeAccount: hackatimeUserId,
        NOT: { userId },
      },
      select: { userId: true },
    });

    if (existingLink) {
      throw new BadRequestException('This Hackatime account is already linked to another user');
    }

    await this.prisma.user.update({
      where: { userId },
      data: {
        hackatimeAccount: hackatimeUserId,
        hackatimeAccessToken: tokens.access_token,
      },
    });

    return {
      message: 'Hackatime account linked successfully',
      hackatimeUserId,
    };
  }

  async checkHackatimeAccountStatus(userEmail: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        email: true,
        hackatimeAccount: true,
        hackatimeAccessToken: true,
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccessToken) {
      return {
        email: user.email,
        hasHackatimeAccount: false,
        hackatimeAccountId: null,
        tokenValid: false,
      };
    }

    const res = await fetch(`${this.HACKATIME_BASE_URL}/api/v1/authenticated/me`, {
      headers: { 'Authorization': `Bearer ${user.hackatimeAccessToken}` },
    });

    return {
      email: user.email,
      hasHackatimeAccount: true,
      hackatimeAccountId: user.hackatimeAccount || null,
      tokenValid: res.ok,
    };
  }

  async getAllHackatimeProjects(userEmail: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccount) {
      throw new HttpException('No Hackatime account linked to this user', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccessToken) {
      throw new HttpException('Hackatime access token not available. Please relink your account.', HttpStatus.UNAUTHORIZED);
    }

    const res = await fetch(
      `${this.HACKATIME_BASE_URL}/api/v1/authenticated/projects`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.hackatimeAccessToken}`,
        },
      },
    );

    if (!res.ok) {
      if (res.status === 404) {
        throw new HttpException('Hackatime projects not found for this user', HttpStatus.NOT_FOUND);
      }
      throw new HttpException('Failed to fetch hackatime projects', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return res.json();
  }

  async getUnlinkedHackatimeProjects(userEmail: string): Promise<any> {
    const allProjects = await this.getAllHackatimeProjects(userEmail);

    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        projects: {
          select: { nowHackatimeProjects: true },
        },
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const linkedProjectNames = new Set<string>();
    user.projects.forEach(project => {
      if (project.nowHackatimeProjects) {
        project.nowHackatimeProjects.forEach(name => linkedProjectNames.add(name));
      }
    });

    if (Array.isArray(allProjects)) {
      return allProjects.filter((project: any) =>
        !linkedProjectNames.has(project.name || project.projectName || project)
      );
    }

    if (allProjects.projects && Array.isArray(allProjects.projects)) {
      return {
        ...allProjects,
        projects: allProjects.projects.filter((project: any) =>
          !linkedProjectNames.has(project.name || project.projectName || project)
        ),
      };
    }

    if (allProjects.name || allProjects.projectName) {
      const projectName = allProjects.name || allProjects.projectName;
      if (linkedProjectNames.has(projectName)) {
        throw new HttpException('All hackatime projects are already linked', HttpStatus.NOT_FOUND);
      }
    }

    return allProjects;
  }

  async getLinkedHackatimeProjects(userEmail: string, projectId: number): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      select: { userId: true },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: { nowHackatimeProjects: true, userId: true },
    });

    if (!project) {
      throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
    }

    if (project.userId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    const allProjects = await this.getAllHackatimeProjects(userEmail);

    const linkedProjectNames = new Set<string>(project.nowHackatimeProjects || []);

    if (Array.isArray(allProjects)) {
      return allProjects.filter((project: any) =>
        linkedProjectNames.has(project.name || project.projectName || project)
      );
    }

    if (allProjects.projects && Array.isArray(allProjects.projects)) {
      return {
        ...allProjects,
        projects: allProjects.projects.filter((project: any) =>
          linkedProjectNames.has(project.name || project.projectName || project)
        ),
      };
    }

    if (allProjects.name || allProjects.projectName) {
      const projectName = allProjects.name || allProjects.projectName;
      if (linkedProjectNames.has(projectName)) {
        return allProjects;
      }
      return Array.isArray(allProjects) ? [] : { ...allProjects, projects: [] };
    }

    return allProjects;
  }

  async getTotalNowHackatimeHours(userId: number): Promise<number> {
    const result = await this.prisma.project.aggregate({
      where: { userId },
      _sum: { nowHackatimeHours: true },
    });
    return result._sum.nowHackatimeHours ?? 0;
  }

  async getTotalApprovedHours(userId: number): Promise<number> {
    const result = await this.prisma.project.aggregate({
      where: { userId },
      _sum: { approvedHours: true },
    });
    return result._sum.approvedHours ?? 0;
  }

  async recalculateNowHackatimeHours(userId: number): Promise<{ updatedProjects: number; totalNowHackatimeHours: number }> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        hackatimeAccount: true,
        hackatimeAccessToken: true,
        projects: {
          select: {
            projectId: true,
            nowHackatimeProjects: true,
          },
        },
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccount) {
      throw new HttpException('No Hackatime account linked to this user', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccessToken) {
      throw new HttpException('Hackatime access token not available. Please relink your account.', HttpStatus.UNAUTHORIZED);
    }

    if (!user.projects || user.projects.length === 0) {
      return { updatedProjects: 0, totalNowHackatimeHours: 0 };
    }

    const { projectsMap } = await this.fetchHackatimeProjectsData(user.hackatimeAccessToken);

    await Promise.all(
      user.projects.map(async project => {
        const projectNames = project.nowHackatimeProjects || [];
        const totalHours = await this.calculateHackatimeHours(
          projectNames,
          projectsMap,
          user.hackatimeAccount,
          user.hackatimeAccessToken,
        );
        await this.prisma.project.update({
          where: { projectId: project.projectId },
          data: { nowHackatimeHours: totalHours },
        });
      }),
    );

    const totalNowHackatimeHours = await this.getTotalNowHackatimeHours(userId);

    return { updatedProjects: user.projects.length, totalNowHackatimeHours };
  }

  private async fetchHackatimeProjectsData(accessToken: string) {
    const response = await fetch(`${this.HACKATIME_BASE_URL}/api/v1/authenticated/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new HttpException('Failed to fetch hackatime projects', HttpStatus.BAD_REQUEST);
    }

    const rawData = await response.json();
    const projectsMap = new Map<string, number>();

    const addProject = (entry: any) => {
      if (typeof entry === 'string') {
        if (!projectsMap.has(entry)) {
          projectsMap.set(entry, 0);
        }
        return;
      }

      const name = entry?.name || entry?.projectName;

      if (typeof name === 'string') {
        const duration = typeof entry?.total_seconds === 'number' ? entry.total_seconds
          : typeof entry?.total_duration === 'number' ? entry.total_duration : 0;
        projectsMap.set(name, duration);
      }
    };

    if (Array.isArray(rawData)) {
      rawData.forEach(addProject);
    } else if (Array.isArray(rawData?.projects)) {
      rawData.projects.forEach(addProject);
    } else if (rawData?.name || rawData?.projectName) {
      addProject(rawData);
    }

    return { projectsMap };
  }

  private async fetchHackatimeProjectDurationsAfterDate(
    hackatimeAccount: string,
    projectNames: string[],
    accessToken: string,
    cutoffDate: Date = new Date(process.env.HACKATIME_CUTOFF_DATE || '2025-10-10T00:00:00Z'),
  ): Promise<Map<string, number>> {
    const startDate = cutoffDate.toISOString().split('T')[0];
    const uri = `${this.HACKATIME_BASE_URL}/api/v1/users/${hackatimeAccount}/stats?features=projects&start_date=${startDate}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };

    const durationsMap = new Map<string, number>();

    for (const projectName of projectNames) {
      durationsMap.set(projectName, 0);
    }

    try {
      const response = await fetch(uri, {
        method: 'GET',
        headers,
      });

      if (response.ok) {
        const responseData = await response.json();
        const projects = responseData?.data?.projects;

        if (projects && Array.isArray(projects)) {
          for (const project of projects) {
            const name = project?.name;
            if (typeof name === 'string' && projectNames.includes(name)) {
              const duration = typeof project?.total_seconds === 'number'
                ? project.total_seconds
                : 0;
              durationsMap.set(name, duration);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching hackatime stats:', error);
    }

    return durationsMap;
  }

  private async calculateHackatimeHours(
    projectNames: string[],
    projectsMap: Map<string, number>,
    hackatimeAccount?: string,
    accessToken?: string,
  ) {
    if (hackatimeAccount && accessToken) {
      const cutoffDate = new Date(process.env.HACKATIME_CUTOFF_DATE || '2025-10-10T00:00:00Z');
      const filteredDurations = await this.fetchHackatimeProjectDurationsAfterDate(
        hackatimeAccount,
        projectNames,
        accessToken,
        cutoffDate,
      );

      let totalSeconds = 0;
      for (const name of projectNames) {
        totalSeconds += filteredDurations.get(name) || 0;
      }

      return Math.round((totalSeconds / 3600) * 10) / 10;
    }

    let totalSeconds = 0;
    for (const name of projectNames) {
      totalSeconds += projectsMap.get(name) ?? 0;
    }

    return Math.round((totalSeconds / 3600) * 10) / 10;
  }

  async getAccessToken(userId: number): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { hackatimeAccessToken: true },
    });
    return user?.hackatimeAccessToken || null;
  }

  async unlinkAccount(userId: number): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { userId },
      data: {
        hackatimeAccount: null,
        hackatimeAccessToken: null,
      },
    });
    return { message: 'Hackatime account unlinked successfully' };
  }
}
