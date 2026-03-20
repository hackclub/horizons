import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AirtableService } from '../airtable/airtable.service';

import { createHmac } from 'crypto';
import * as jose from 'jose';

interface HackClubTokenResponse {
  access_token: string;
  token_type: string;
  id_token: string;
}

interface HackClubAddress {
  street_address?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
}

interface HackClubIdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  updated_at?: number;
  email?: string;
  email_verified?: boolean;
  birthdate?: string;
  address?: HackClubAddress;
  slack_id?: string;
  verification_status?: string;
  ysws_eligible?: boolean;
}

@Injectable()
export class AuthService {
  private readonly SESSION_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;
  private readonly HACKCLUB_AUTH_URL = 'https://auth.hackclub.com';
  private readonly STATE_TTL_MS = 600000; // 10 minutes
  private jwks: jose.JWTVerifyGetKey | null = null;

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

  private verifyState(encodedState: string): { referralCode: string | null; timestamp: number; redirectPath: string | null } {
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

  constructor(
    private prisma: PrismaService,
    private airtableService: AirtableService,
  ) {}

  getAuthUrl(email?: string, referralCode?: string, redirectPath?: string): { url: string } {
    const clientId = process.env.HACKCLUB_CLIENT_ID;
    const redirectUri = process.env.HACKCLUB_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new HttpException('OAuth not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const state = this.signState({
      referralCode: referralCode || null,
      timestamp: Date.now(),
      redirectPath: redirectPath || null,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email name profile birthdate address verification_status slack_id basic_info',
      state,
    });

    if (email) {
      params.set('login_hint', email);
    }

    return {
      url: `${this.HACKCLUB_AUTH_URL}/oauth/authorize?${params.toString()}`,
    };
  }

  async handleCallback(code: string, state?: string): Promise<{ sessionId: string; isNewUser: boolean; user: any; redirectPath: string | null }> {
    const clientId = process.env.HACKCLUB_CLIENT_ID;
    const clientSecret = process.env.HACKCLUB_CLIENT_SECRET;
    const redirectUri = process.env.HACKCLUB_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new HttpException('OAuth not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (!state) {
      throw new BadRequestException('Missing state parameter');
    }

    const { referralCode, redirectPath } = this.verifyState(state);

    const tokenResponse = await fetch(`${this.HACKCLUB_AUTH_URL}/oauth/token`, {
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
      console.error('Token exchange failed:', error);
      throw new UnauthorizedException('Failed to authenticate with Hack Club');
    }

    const tokens: HackClubTokenResponse = await tokenResponse.json();

    const userInfoResponse = await fetch(`${this.HACKCLUB_AUTH_URL}/oauth/userinfo`, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new UnauthorizedException('Failed to fetch user info from Hack Club');
    }

    const userInfo = await userInfoResponse.json();

    if (!userInfo.email) {
      throw new BadRequestException('Email not provided by Hack Club Auth');
    }

    const claims: HackClubIdTokenClaims = {
      iss: this.HACKCLUB_AUTH_URL,
      sub: userInfo.sub,
      aud: process.env.HACKCLUB_CLIENT_ID!,
      exp: 0,
      iat: 0,
      email: userInfo.email,
      email_verified: userInfo.email_verified,
      name: userInfo.name,
      given_name: userInfo.given_name,
      family_name: userInfo.family_name,
      nickname: userInfo.nickname,
      updated_at: userInfo.updated_at,
      birthdate: userInfo.birthdate,
      address: userInfo.address,
      slack_id: userInfo.slack_id,
      verification_status: userInfo.verification_status,
      ysws_eligible: userInfo.ysws_eligible,
    };

    const { user, isNewUser } = await this.findOrCreateUser(claims, referralCode);

    if (!isNewUser && claims.ysws_eligible === false) {
      throw new ForbiddenException('You are not eligible for YSWS.');
    }

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.userId,
        expiresAt: new Date(Date.now() + this.SESSION_EXPIRY_MS),
      },
    });

    return {
      sessionId: session.id,
      isNewUser: !user.onboardComplete || user.firstName === 'Temporary',
      user: {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      redirectPath,
    };
  }

  private async verifyIdToken(idToken: string): Promise<HackClubIdTokenClaims> {
    if (!this.jwks) {
      this.jwks = jose.createRemoteJWKSet(new URL(`${this.HACKCLUB_AUTH_URL}/oauth/discovery/keys`));
    }

    try {
      const { payload } = await jose.jwtVerify(idToken, this.jwks, {
        issuer: this.HACKCLUB_AUTH_URL,
        audience: process.env.HACKCLUB_CLIENT_ID,
      });
      return payload as unknown as HackClubIdTokenClaims;
    } catch (error) {
      console.error('ID token verification failed:', error);
      throw new UnauthorizedException('Invalid ID token');
    }
  }

  private async findOrCreateUser(claims: HackClubIdTokenClaims, referralCode: string | null) {
    const email = claims.email!;
    const hcaId = claims.sub;

    let existingUser = await this.prisma.user.findUnique({ where: { hcaId } });
    if (!existingUser) {
      existingUser = await this.prisma.user.findUnique({ where: { email } });
    }

    if (!existingUser) {
      const hackatimeAccount = await this.checkHackatimeAccount(email);

      const firstName = claims.given_name || 'Temporary';
      const lastName = claims.family_name || 'User';
      const birthday = claims.birthdate ? new Date(claims.birthdate) : null;
      const slackUserId = claims.slack_id || null;
      const verificationStatus = claims.verification_status || null;

      let rafflePos: string | null = null;
      try {
        const airtableUser = await this.prisma.$queryRaw<Array<{
          code: string | null;
        }>>`
          SELECT CAST(code AS TEXT) as code
          FROM users_airtable
          WHERE email = ${email}
          LIMIT 1
        `;

        if (airtableUser && airtableUser.length > 0) {
          rafflePos = airtableUser[0].code ?? null;
        } else {
          const maxUserCodeResult = await this.prisma.$queryRaw<Array<{ max_code: string | null }>>`
            SELECT CAST(MAX(CAST(raffle_pos AS INTEGER)) AS TEXT) as max_code
            FROM users WHERE raffle_pos IS NOT NULL AND raffle_pos ~ '^[0-9]+$'
          `;
          const maxAirtableCodeResult = await this.prisma.$queryRaw<Array<{ max_code: string | null }>>`
            SELECT CAST(MAX(code) AS TEXT) as max_code FROM users_airtable
          `;
          const maxUserCode = maxUserCodeResult?.[0]?.max_code ? parseInt(maxUserCodeResult[0].max_code, 10) : 0;
          const maxAirtableCode = maxAirtableCodeResult?.[0]?.max_code ? parseInt(maxAirtableCodeResult[0].max_code, 10) : 0;
          rafflePos = (Math.max(maxUserCode, maxAirtableCode) + 1).toString();
        }
      } catch (error) {
        console.error('Error checking users_airtable:', error);
      }

      existingUser = await this.prisma.user.create({
        data: {
          hcaId,
          email,
          firstName,
          lastName,
          birthday,
          slackUserId,
          verificationStatus,
          addressLine1: claims.address?.street_address?.split('\n')[0] || null,
          addressLine2: claims.address?.street_address?.split('\n')[1] || null,
          city: claims.address?.locality || null,
          state: claims.address?.region || null,
          zipCode: claims.address?.postal_code || null,
          country: claims.address?.country || null,
          role: 'user',
          hackatimeAccount: hackatimeAccount?.toString() || null,
          referralCode,
          rafflePos,
        },
      });

      this.airtableService.syncUserEvent(email, existingUser.userId, 'signUp').catch((err) =>
        console.error('Error syncing signUp event to Airtable:', err),
      );

      return { user: existingUser, isNewUser: true };
    }

    const updateData: Record<string, any> = {};
    if (!existingUser.hcaId) {
      updateData.hcaId = hcaId;
    }
    if (referralCode && !existingUser.referralCode) {
      updateData.referralCode = referralCode;
    }
    if (claims.given_name && existingUser.firstName !== claims.given_name) {
      updateData.firstName = claims.given_name;
    }
    if (claims.family_name && existingUser.lastName !== claims.family_name) {
      updateData.lastName = claims.family_name;
    }
    if (claims.slack_id && existingUser.slackUserId !== claims.slack_id) {
      updateData.slackUserId = claims.slack_id;
    }
    if (claims.verification_status && existingUser.verificationStatus !== claims.verification_status) {
      updateData.verificationStatus = claims.verification_status;
    }
    if (claims.birthdate) {
      const incomingBirthday = new Date(claims.birthdate);
      if (!existingUser.birthday || existingUser.birthday.getTime() !== incomingBirthday.getTime()) {
        updateData.birthday = incomingBirthday;
      }
    }
    if (claims.address) {
      const line1 = claims.address.street_address?.split('\n')[0] || null;
      const line2 = claims.address.street_address?.split('\n')[1] || null;
      if (line1 && existingUser.addressLine1 !== line1) updateData.addressLine1 = line1;
      if (line2 && existingUser.addressLine2 !== line2) updateData.addressLine2 = line2;
      if (claims.address.locality && existingUser.city !== claims.address.locality) updateData.city = claims.address.locality;
      if (claims.address.region && existingUser.state !== claims.address.region) updateData.state = claims.address.region;
      if (claims.address.postal_code && existingUser.zipCode !== claims.address.postal_code) updateData.zipCode = claims.address.postal_code;
      if (claims.address.country && existingUser.country !== claims.address.country) updateData.country = claims.address.country;
    }

    if (Object.keys(updateData).length > 0) {
      existingUser = await this.prisma.user.update({
        where: { userId: existingUser.userId },
        data: updateData,
      });
    }

    return { user: existingUser, isNewUser: false };
  }

  async getCurrentUser(sessionId: string) {
    if (!sessionId) {
      throw new UnauthorizedException('Session not found');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            userId: true,
            hcaId: true,
            firstName: true,
            lastName: true,
            email: true,
            birthday: true,
            slackUserId: true,
            verificationStatus: true,
            role: true,
            onboardComplete: true,
            onboardedAt: true,
            hackatimeAccount: true,
            referralCode: true,
            rafflePos: true,
            createdAt: true,
            updatedAt: true,
            addressLine1: true,
            city: true,
            state: true,
            country: true,
            zipCode: true,
            projects: {
              include: { submissions: true },
            },
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = session.user as any;
    const hasAddress = !!(user.addressLine1 && user.city && user.state && user.country && user.zipCode);
    const { addressLine1, city, state, country, zipCode, ...userWithoutAddress } = user;
    if (userWithoutAddress.projects) {
      userWithoutAddress.projects = userWithoutAddress.projects.map(({ isFraud: _, hoursJustification: __, ...project }: any) => project);
    }
    return { ...userWithoutAddress, hasAddress };
  }

  async logout(sessionId: string) {
    if (sessionId) {
      await this.prisma.userSession.deleteMany({ where: { id: sessionId } });
    }
    return { message: 'Logged out successfully' };
  }

  async getRafflePos(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { rafflePos: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { rafflePos: user.rafflePos };
  }

  async completeOnboarding(userId: number) {
    const user = await this.prisma.user.update({
      where: { userId },
      data: { onboardComplete: true },
    });

    return {
      message: 'Onboarding completed successfully',
      user: {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        onboardComplete: user.onboardComplete,
      },
    };
  }

  async getOnboardingStatus(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        onboardComplete: true,
        firstName: true,
        lastName: true,
        birthday: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const defaultBirthday = new Date('2000-01-01');
    const needsBirthday = user.birthday.getTime() === defaultBirthday.getTime();
    const isTemporaryUser = user.firstName === 'Temporary';

    return {
      onboardComplete: user.onboardComplete,
      needsBirthday,
      isTemporaryUser,
      hasPrefilledData: !isTemporaryUser && !needsBirthday,
    };
  }

  async checkHackatimeAccount(email: string): Promise<number | null> {
    const STATS_API_KEY = process.env.STATS_API_KEY;

    if (!STATS_API_KEY) {
      console.warn('STATS_API_KEY not configured, skipping Hackatime lookup');
      return null;
    }

    try {
      const encodedEmail = encodeURIComponent(email);
      const url = `https://hackatime.hackclub.com/api/v1/users/lookup_email/${encodedEmail}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${STATS_API_KEY}` },
      });

      if (!res.ok) {
        if (res.status === 404) return null;
        console.error('Failed to check Hackatime account:', res.status);
        return null;
      }

      const data = await res.json();
      return data.user_id || null;
    } catch (error) {
      console.error('Error checking Hackatime account:', error);
      return null;
    }
  }
}
