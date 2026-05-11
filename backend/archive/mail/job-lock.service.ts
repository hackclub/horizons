import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { randomBytes } from 'crypto';

@Injectable()
export class JobLockService {
  private readonly workerId: string;
  private readonly lockTTL = 300;
  private readonly maxAttempts = 3;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    this.workerId = `worker-${process.env.HOSTNAME || randomBytes(8).toString('hex')}`;
    console.log(
      `Job lock service initialized with worker ID: ${this.workerId}`,
    );
  }

  async acquireJobLock(jobId: string): Promise<boolean> {
    const lockKey = `email-job-lock:${jobId}`;

    const acquired = await this.redis.acquireLock(
      lockKey,
      this.workerId,
      this.lockTTL,
    );

    if (acquired) {
      try {
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - 5 * 60 * 1000);

        const updated = await this.prisma.emailJob.updateMany({
          where: {
            id: jobId,
            OR: [{ lockedBy: null }, { lockedAt: { lt: staleThreshold } }],
          },
          data: {
            lockedBy: this.workerId,
            lockedAt: now,
          },
        });

        if (updated.count === 0) {
          await this.redis.releaseLock(lockKey, this.workerId);
          return false;
        }

        return true;
      } catch (error) {
        await this.redis.releaseLock(lockKey, this.workerId);
        throw error;
      }
    }

    return false;
  }

  async releaseJobLock(jobId: string): Promise<void> {
    const lockKey = `email-job-lock:${jobId}`;
    await this.redis.releaseLock(lockKey, this.workerId);

    await this.prisma.emailJob.updateMany({
      where: {
        id: jobId,
        lockedBy: this.workerId,
      },
      data: {
        lockedBy: null,
        lockedAt: null,
      },
    });
  }

  async extendJobLock(jobId: string): Promise<boolean> {
    const lockKey = `email-job-lock:${jobId}`;
    return await this.redis.extendLock(lockKey, this.workerId, this.lockTTL);
  }

  async getAvailableJobs(limit: number = 50): Promise<any[]> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 5 * 60 * 1000);

    const jobs = await this.prisma.emailJob.findMany({
      where: {
        status: {
          in: ['pending', 'scheduled'],
        },
        attempts: {
          lt: this.maxAttempts,
        },
        OR: [
          {
            status: 'pending',
            lockedBy: null,
          },
          {
            status: 'scheduled',
            scheduledFor: {
              lte: now,
            },
            OR: [{ lockedBy: null }, { lockedAt: { lt: staleThreshold } }],
          },
          {
            lockedAt: { lt: staleThreshold },
          },
        ],
      },
      take: limit,
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    });

    return jobs;
  }

  async markJobProcessing(jobId: string): Promise<void> {
    await this.prisma.emailJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
      },
    });
  }

  async markJobSent(jobId: string): Promise<void> {
    await this.prisma.emailJob.update({
      where: { id: jobId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        lockedBy: null,
        lockedAt: null,
      },
    });
  }

  async markJobFailed(jobId: string, errorMessage: string): Promise<void> {
    const job = await this.prisma.emailJob.findUnique({
      where: { id: jobId },
      select: { attempts: true },
    });

    const newAttempts = (job?.attempts || 0) + 1;
    const shouldFail = newAttempts >= this.maxAttempts;

    await this.prisma.emailJob.update({
      where: { id: jobId },
      data: {
        status: shouldFail ? 'failed' : 'pending',
        attempts: newAttempts,
        failedAt: shouldFail ? new Date() : undefined,
        errorMessage: shouldFail ? errorMessage : undefined,
        lockedBy: null,
        lockedAt: null,
      },
    });
  }

  getWorkerId(): string {
    return this.workerId;
  }
}
