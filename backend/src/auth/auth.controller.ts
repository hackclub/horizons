import { Controller, Post, Get, Req, Res, Query, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import {
  AuthUrlResponse,
  AuthCallbackResponse,
  LogoutResponse,
  CompleteOnboardingResponse,
  OnboardingStatusResponse,
  RafflePosResponse,
  ReferralCodeResponse,
  ReferralsResponse,
} from './response';

@ApiTags('Auth')
@Controller('api/user/auth')
export class AuthController {
  private readonly SESSION_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;

  constructor(private authService: AuthService) {}

  @Get('login')
  @Public()
  @ApiOperation({ summary: 'Get HCA OAuth login URL' })
  @ApiQuery({ name: 'referralCode', required: false })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'utm_source', required: false })
  @ApiOkResponse({ type: AuthUrlResponse })
  async getAuthUrl(
    @Query('referralCode') referralCode?: string,
    @Query('email') email?: string,
    @Query('utm_source') utmSource?: string,
  ): Promise<AuthUrlResponse> {
    return this.authService.getAuthUrl(email, referralCode, undefined, utmSource);
  }

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Handle HCA OAuth callback and redirect to app' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: false })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.authService.handleCallback(code, state);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite:
        process.env.NODE_ENV === 'production'
          ? ('strict' as const)
          : ('lax' as const),
      path: '/',
      domain:
        process.env.COOKIE_DOMAIN ||
        (process.env.NODE_ENV === 'production' ? undefined : 'localhost'),
    };

    res.cookie('sessionId', result.sessionId, {
      ...cookieOptions,
      maxAge: this.SESSION_EXPIRY_MS,
    });

    if (result.isNewUser) {
      res.cookie('email', result.user.email, {
        ...cookieOptions,
        maxAge: 10 * 60 * 1000,
      });
    }

    const defaultPath = result.isNewUser ? '/app/onboarding' : '/app';
    // const defaultPath = '/app';
    const redirectPath = result.redirectPath ?? defaultPath;
    // Prevent open redirect: only allow relative paths starting with /
    const destination =
      typeof redirectPath === 'string' &&
      redirectPath.startsWith('/') &&
      !redirectPath.startsWith('//')
        ? redirectPath
        : '/app';
    res.redirect(destination);
  }

  @Get('me')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get current user' })
  async getCurrentUser(@Req() req: Request) {
    return this.authService.getCurrentUser(req.cookies.sessionId);
  }

  @Post('verify-session')
  @ApiOperation({ summary: 'Verify current session' })
  async verifySession(@Req() req: Request) {
    const sessionId = req.cookies.sessionId;
    return this.authService.getCurrentUser(sessionId);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and clear session' })
  @ApiOkResponse({ type: LogoutResponse })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponse> {
    const sessionId = req.cookies.sessionId;

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite:
        process.env.NODE_ENV === 'production'
          ? ('strict' as const)
          : ('lax' as const),
      path: '/',
      domain:
        process.env.COOKIE_DOMAIN ||
        (process.env.NODE_ENV === 'production' ? undefined : 'localhost'),
    };

    res.clearCookie('sessionId', cookieOptions);
    res.clearCookie('email', cookieOptions);

    return this.authService.logout(sessionId);
  }

  @Post('complete-onboarding')
  @ApiOperation({ summary: 'Mark onboarding as complete' })
  @ApiOkResponse({ type: CompleteOnboardingResponse })
  async completeOnboarding(
    @Req() req: Request,
  ): Promise<CompleteOnboardingResponse> {
    const userId = req.user.userId;
    return this.authService.completeOnboarding(userId);
  }

  @Get('onboarding-status')
  @ApiOperation({ summary: 'Get onboarding status' })
  @ApiOkResponse({ type: OnboardingStatusResponse })
  async getOnboardingStatus(
    @Req() req: Request,
  ): Promise<OnboardingStatusResponse> {
    const userId = req.user.userId;
    return this.authService.getOnboardingStatus(userId);
  }

  @Get('raffle-pos')
  @ApiOperation({ summary: 'Get raffle position' })
  @ApiOkResponse({ type: RafflePosResponse })
  async getRafflePos(@Req() req: Request): Promise<RafflePosResponse> {
    const userId = req.user.userId;
    return this.authService.getRafflePos(userId);
  }

  @Get('referral-code')
  @ApiOperation({ summary: 'Get or generate referral code' })
  @ApiOkResponse({ type: ReferralCodeResponse })
  async getReferralCode(@Req() req: Request): Promise<ReferralCodeResponse> {
    const userId = req.user.userId;
    return this.authService.getReferralCode(userId);
  }

  @Get('referrals')
  @ApiOperation({ summary: 'Get list of users referred by current user' })
  @ApiOkResponse({ type: ReferralsResponse })
  async getReferrals(@Req() req: Request): Promise<ReferralsResponse> {
    const userId = req.user.userId;
    return this.authService.getReferrals(userId);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Get re-login URL to force sync user data from HCA',
  })
  @ApiOkResponse({ type: AuthUrlResponse })
  async syncHcaData(
    @Req() req: Request,
    @Body() body: { redirectPath?: string },
  ): Promise<AuthUrlResponse> {
    return this.authService.getAuthUrl(
      req.user.email,
      undefined,
      body?.redirectPath,
    );
  }
}
