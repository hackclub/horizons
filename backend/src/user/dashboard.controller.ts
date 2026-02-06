import { Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
// import { PrismaClient } from '../../generated/prisma/client';

@Controller('admin/dashboard')
export class DashboardController {
  // private mailServicePrisma: PrismaClient;

  constructor(private readonly adminService: AdminService) {
    const mailDbUrl = process.env.MAIL_SERVICE_DATABASE_URL || process.env.DATABASE_URL;
    if (!mailDbUrl) {
      throw new Error('MAIL_SERVICE_DATABASE_URL or DATABASE_URL must be configured');
    }
    
    // this.mailServicePrisma = new PrismaClient({
    //   datasources: {
    //     db: {
    //       url: mailDbUrl,
    //     },
    //   },
    // });
  }

  @Get('email-jobs')
  @HttpCode(200)
  async getEmailJobs(
    @Headers('cookie') cookies: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    console.log('getEmailJobs called with:', { status, page, limit });
    // const token = this.extractTokenFromCookie(cookies);
    // await this.adminService.validateSession(token);

    // const pageNum = parseInt(page || '1', 10);
    // const limitNum = parseInt(limit || '50', 10);
    // const skip = (pageNum - 1) * limitNum;

    // const where = status ? { status } : {};

    // const [jobs, total] = await Promise.all([
    //   this.mailServicePrisma.emailJob.findMany({
    //     where,
    //     orderBy: { createdAt: 'desc' },
    //     skip,
    //     take: limitNum,
    //   }),
    //   this.mailServicePrisma.emailJob.count({ where }),
    // ]);

    // return {
    //   jobs,
    //   pagination: {
    //     total,
    //     page: pageNum,
    //     limit: limitNum,
    //     totalPages: Math.ceil(total / limitNum),
    //   },
    // };
    return { message: 'getEmailJobs logged' };
  }

  @Get('stats')
  @HttpCode(200)
  async getStats(@Headers('cookie') cookies: string): Promise<any> {
    console.log('getStats called');
    // const token = this.extractTokenFromCookie(cookies);
    // await this.adminService.validateSession(token);

    // const [total, pending, sent, failed] = await Promise.all([
    //   this.mailServicePrisma.emailJob.count(),
    //   this.mailServicePrisma.emailJob.count({ where: { status: 'pending' } }),
    //   this.mailServicePrisma.emailJob.count({ where: { status: 'sent' } }),
    //   this.mailServicePrisma.emailJob.count({ where: { status: 'failed' } }),
    // ]);

    // const recentJobs = await this.mailServicePrisma.emailJob.findMany({
    //   orderBy: { createdAt: 'desc' },
    //   take: 10,
    // });

    // return {
    //   stats: {
    //     total,
    //     pending,
    //     sent,
    //     failed,
    //   },
    //   recentJobs,
    // };
    return { message: 'getStats logged' };
  }

  private extractTokenFromCookie(cookies: string): string {
    if (!cookies) {
      throw new HttpException(
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const cookieArray = cookies.split(';').map(c => c.trim());
    const sessionCookie = cookieArray.find(c => c.startsWith('admin_session='));
    
    if (!sessionCookie) {
      throw new HttpException(
        'Session cookie not found',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return sessionCookie.split('=')[1];
  }

  async onModuleDestroy() {
    // await this.mailServicePrisma.$disconnect();
  }
}

