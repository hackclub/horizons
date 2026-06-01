import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { resolveAttachmentUrl } from './resolve-cdn-url';

@Injectable()
export class AirtableService {
  constructor(private prisma: PrismaService) {}
  private readonly pendingPreAuthSyncs = new Map<
    string,
    { promise: Promise<void>; createdAt: number }
  >();
  private static readonly PENDING_SYNC_TTL_MS = 30_000;
  private readonly AIRTABLE_API_KEY = process.env.YSWS_AIRTABLE_API_KEY;
  private readonly YSWS_BASE_ID = process.env.YSWS_BASE_ID;
  private readonly APPROVED_PROJECTS_TABLE_ID =
    process.env.YSWS_APPROVED_PROJECTS_TABLE_ID;
  private readonly USERS_TABLE_ID = process.env.YSWS_USERS_TABLE_ID;

  // async createYSWSSubmission(data: {
  //   user: {
  //     firstName: string;
  //     lastName: string;
  //     email: string;
  //     birthday: Date;
  //     addressLine1: string;
  //     addressLine2?: string;
  //     city: string;
  //     state: string;
  //     country: string;
  //     zipCode: string;
  //   };
  //   project: {
  //     projectTitle: string;
  //     description: string;
  //     playableUrl: string;
  //     repoUrl: string;
  //     screenshotUrl: string;
  //     nowHackatimeHours: number;
  //     nowHackatimeProjects: string[];
  //   };
  //   submission: {
  //     description: string;
  //     playableUrl: string;
  //     repoUrl: string;
  //     screenshotUrl: string;
  //   };
  // }): Promise<{ recordId: string }> {
  //   if (!this.AIRTABLE_API_KEY) {
  //     throw new HttpException(
  //       'Airtable API key not configured',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }

  //   try {
  //     const fields = {
  //       'First Name': data.user.firstName,
  //       'Last Name': data.user.lastName,
  //       'Email': data.user.email,
  //       'Birthday': data.user.birthday.toISOString().split('T')[0],
  //       'Address (Line 1)': data.user.addressLine1,
  //       'Address (Line 2)': data.user.addressLine2 || '',
  //       'City': data.user.city,
  //       'State / Province': data.user.state,
  //       'Country': data.user.country,
  //       'ZIP / Postal Code': data.user.zipCode,
  //       'Code URL': data.project.repoUrl,
  //       'Playable URL': data.project.playableUrl,
  //       'Description': data.project.description,
  //       'Screenshot': [
  //         {
  //           url: data.project.screenshotUrl,
  //           filename: `screenshot-${Date.now()}.png`
  //         }
  //       ],
  //       'Optional - Override Hours Spent': data.project.nowHackatimeHours,
  //       'Hackatime Projects': data.project.nowHackatimeProjects.join(', '),
  //       'Automation - First Submitted At': new Date().toISOString(),
  //       'Automation - Submit to Unified YSWS': true,
  //     };

  //     const response = await fetch(
  //       `https://api.airtable.com/v0/${this.BASE_ID}/${this.YSWS_TABLE_ID}`,
  //       {
  //         method: 'POST',
  //         headers: {
  //           Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({
  //           records: [
  //             {
  //               fields,
  //             },
  //           ],
  //         }),
  //       },
  //     );

  //     if (!response.ok) {
  //       const errorData = await response.json();
  //       console.error('Airtable API error:', errorData);
  //       throw new HttpException(
  //         'Failed to create YSWS submission record',
  //         response.status || HttpStatus.BAD_REQUEST,
  //       );
  //     }

  //     const result = await response.json();
  //     return { recordId: result.records[0].id };
  //   } catch (error) {
  //     console.error('Error creating YSWS submission:', error);
  //     if (error instanceof HttpException) {
  //       throw error;
  //     }
  //     throw new HttpException(
  //       'Internal server error',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  // async updateYSWSSubmission(recordId: string, data: {
  //   approvedHours?: number;
  //   hoursJustification?: string;
  //   status?: string;
  // }): Promise<void> {
  //   if (!this.AIRTABLE_API_KEY) {
  //     throw new HttpException(
  //       'Airtable API key not configured',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }

  //   try {
  //     const fields: any = {};

  //     if (data.approvedHours !== undefined) {
  //       fields['Optional - Override Hours Spent'] = data.approvedHours;
  //     }

  //     if (data.hoursJustification !== undefined) {
  //       fields['Optional - Override Hours Spent Justification'] = data.hoursJustification;
  //     }

  //     const response = await fetch(
  //       `https://api.airtable.com/v0/${this.BASE_ID}/${this.YSWS_TABLE_ID}/${recordId}`,
  //       {
  //         method: 'PATCH',
  //         headers: {
  //           Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({
  //           fields,
  //         }),
  //       },
  //     );

  //     if (!response.ok) {
  //       const errorData = await response.json();
  //       console.error('Airtable update error:', errorData);
  //       throw new HttpException(
  //         'Failed to update YSWS submission record',
  //         response.status || HttpStatus.BAD_REQUEST,
  //       );
  //     }
  //   } catch (error) {
  //     console.error('Error updating YSWS submission:', error);
  //     if (error instanceof HttpException) {
  //       throw error;
  //     }
  //     throw new HttpException(
  //       'Internal server error',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  private async computeUserStats(userId: number): Promise<{
    approvedHours: number;
    hoursInReview: number;
    unsubmittedHours: number;
    chosenEventSlug: string | null;
    country: string | null;
  }> {
    const [
      approvedAgg,
      unsubmittedAgg,
      hoursInReviewResult,
      pinnedEvent,
      userProfile,
    ] = await Promise.all([
      this.prisma.project.aggregate({
        where: { userId, deletedAt: null },
        _sum: { approvedHours: true },
      }),
      this.prisma.project.aggregate({
        where: { userId, deletedAt: null, submissions: { none: {} } },
        _sum: { nowHackatimeHours: true },
      }),
      // Mirrors MetricsService.computeReviewHours: a project counts as
      // in-review when its latest submission is still pending and the
      // reviewer hasn't decided. Scoped to this user.
      this.prisma.$queryRaw<Array<{ total_hours: number }>>`
          SELECT COALESCE(SUM(p.now_hackatime_hours), 0) as total_hours
          FROM projects p
          WHERE p.user_id = ${userId}
            AND p.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM submissions s
              WHERE s.project_id = p.project_id
                AND s.approval_status = 'pending'
                AND s.review_passed IS NULL
                AND s.created_at = (
                  SELECT MAX(s2.created_at) FROM submissions s2
                  WHERE s2.project_id = p.project_id
                )
            )
        `,
      this.prisma.pinnedEvent.findUnique({
        where: { userId },
        include: { event: { select: { slug: true } } },
      }),
      this.prisma.user.findUnique({
        where: { userId },
        select: { country: true },
      }),
    ]);

    return {
      approvedHours:
        Math.round((approvedAgg._sum.approvedHours ?? 0) * 10) / 10,
      hoursInReview:
        Math.round(Number(hoursInReviewResult[0]?.total_hours ?? 0) * 10) / 10,
      unsubmittedHours:
        Math.round((unsubmittedAgg._sum.nowHackatimeHours ?? 0) * 10) / 10,
      chosenEventSlug: pinnedEvent?.event?.slug ?? null,
      country: userProfile?.country ?? null,
    };
  }

  private statsToFields(stats: {
    approvedHours: number;
    hoursInReview: number;
    unsubmittedHours: number;
    chosenEventSlug: string | null;
    country: string | null;
  }): Record<string, any> {
    return {
      'Approved Hours': stats.approvedHours,
      'Hours in Review': stats.hoursInReview,
      'Unsubmitted Hours': stats.unsubmittedHours,
      'Chosen Event': stats.chosenEventSlug ?? '',
      Country: stats.country ?? '',
    };
  }

  private async findUserRecord(
    email: string,
  ): Promise<{ id: string; fields: Record<string, any> } | null> {
    if (!this.AIRTABLE_API_KEY || !this.YSWS_BASE_ID || !this.USERS_TABLE_ID) {
      return null;
    }

    const formula = encodeURIComponent(`{Email} = "${email}"`);
    const response = await fetch(
      `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.USERS_TABLE_ID}?filterByFormula=${formula}&maxRecords=1`,
      {
        headers: {
          Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    const record = result.records?.[0];
    return record ? { id: record.id, fields: record.fields } : null;
  }

  private cleanExpiredPendingSyncs(): void {
    const now = Date.now();
    for (const [email, entry] of this.pendingPreAuthSyncs) {
      if (now - entry.createdAt > AirtableService.PENDING_SYNC_TTL_MS) {
        this.pendingPreAuthSyncs.delete(email);
      }
    }
  }

  async syncPreAuthSignUp(email: string): Promise<void> {
    this.cleanExpiredPendingSyncs();
    const promise = this._syncPreAuthSignUp(email);
    this.pendingPreAuthSyncs.set(email, { promise, createdAt: Date.now() });
    promise.finally(() => this.pendingPreAuthSyncs.delete(email));
    return promise;
  }

  private async _syncPreAuthSignUp(email: string): Promise<void> {
    if (!this.AIRTABLE_API_KEY || !this.YSWS_BASE_ID || !this.USERS_TABLE_ID) {
      return;
    }

    const fieldName = 'Loops - horizonsSignUpAt';
    const now = new Date().toISOString().split('T')[0];

    try {
      const existingRecord = await this.findUserRecord(email);

      if (existingRecord) {
        if (!existingRecord.fields[fieldName]) {
          await fetch(
            `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.USERS_TABLE_ID}/${existingRecord.id}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: { [fieldName]: now },
              }),
            },
          );
        }
      } else {
        await fetch(
          `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.USERS_TABLE_ID}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              records: [
                {
                  fields: {
                    Email: email,
                    [fieldName]: now,
                  },
                },
              ],
            }),
          },
        );
      }
    } catch (error) {
      console.error('Error syncing pre-auth signUp to Airtable:', error);
    }
  }

  async syncUserEvent(
    email: string,
    userId: number,
    event:
      | 'signUp'
      | 'authedWithHCA'
      | 'firstProjectCreated'
      | 'firstSubmit'
      | 'onboardingCompleted'
      | 'eventTicketPurchased',
    dateOverride?: string,
  ): Promise<void> {
    if (!this.AIRTABLE_API_KEY || !this.YSWS_BASE_ID || !this.USERS_TABLE_ID) {
      return;
    }

    const entry = this.pendingPreAuthSyncs.get(email);
    if (entry) {
      await entry.promise.catch(() => {});
    }

    const fieldMap: Record<string, string> = {
      signUp: 'Loops - horizonsSignUpAt',
      authedWithHCA: 'Loops - horizonsAuthedWithHCA',
      firstProjectCreated: 'Loops - horizonsFirstProjectCreatedAt',
      firstSubmit: 'Loops - horizonsFirstSubmitAt',
      onboardingCompleted: 'Loops - horizonsOnboardingCompletedAt',
      eventTicketPurchased: 'Loops - horizonsEventTicketPurchasedAt',
    };

    const fieldName = fieldMap[event];
    const now = dateOverride || new Date().toISOString().split('T')[0];

    try {
      let user = await this.prisma.user.findUnique({
        where: { email },
        select: { referralCode: true },
      });

      if (!user?.referralCode) {
        user = await this.prisma.user.update({
          where: { email },
          data: { referralCode: userId.toString() },
          select: { referralCode: true },
        });
      }

      let recordId: string | null = null;
      const [existingRecord, stats] = await Promise.all([
        this.findUserRecord(email),
        this.computeUserStats(userId).catch(() => null),
      ]);

      if (existingRecord) {
        recordId = existingRecord.id;

        const fieldsToUpdate: Record<string, any> = {};
        if (!existingRecord.fields[fieldName]) {
          if (
            event === 'authedWithHCA' &&
            existingRecord.fields['Loops - horizonsSignUpAt']
          ) {
            fieldsToUpdate[fieldName] =
              existingRecord.fields['Loops - horizonsSignUpAt'];
          } else {
            fieldsToUpdate[fieldName] = now;
          }
        }
        if (!existingRecord.fields['Horizons User ID']) {
          fieldsToUpdate['Horizons User ID'] = userId;
        }
        if (user?.referralCode) {
          fieldsToUpdate['Referral Code'] = user.referralCode;
        }
        if (stats) {
          Object.assign(fieldsToUpdate, this.statsToFields(stats));
        }

        if (Object.keys(fieldsToUpdate).length > 0) {
          await fetch(
            `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.USERS_TABLE_ID}/${existingRecord.id}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: fieldsToUpdate,
              }),
            },
          );
        }
      } else {
        const response = await fetch(
          `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.USERS_TABLE_ID}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              records: [
                {
                  fields: {
                    Email: email,
                    'Horizons User ID': userId,
                    [fieldName]: now,
                    ...(user?.referralCode
                      ? { 'Referral Code': user.referralCode }
                      : {}),
                    ...(stats ? this.statsToFields(stats) : {}),
                  },
                },
              ],
            }),
          },
        );

        if (response.ok) {
          const result = await response.json();
          recordId = result.records?.[0]?.id ?? null;
        }
      }

      if (recordId) {
        await this.prisma.user.update({
          where: { email },
          data: { airtableRecId: recordId },
        });
      }
    } catch (error) {
      console.error(`Error syncing user event '${event}' to Airtable:`, error);
    }
  }

  /**
   * Push the dynamic stats fields (approved/in-review/unsubmitted hours,
   * chosen event slug) to an existing Airtable user record. No-op if the
   * record doesn't exist yet — syncUserEvent is responsible for creating it.
   * Callers should fire this whenever the underlying values change
   * (submission lifecycle, pinned event changes).
   */
  async syncUserStats(email: string): Promise<void> {
    if (!this.AIRTABLE_API_KEY || !this.YSWS_BASE_ID || !this.USERS_TABLE_ID) {
      return;
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { userId: true },
      });
      if (!user) return;

      const existingRecord = await this.findUserRecord(email);
      if (!existingRecord) return;

      const stats = await this.computeUserStats(user.userId);
      await fetch(
        `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.USERS_TABLE_ID}/${existingRecord.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: this.statsToFields(stats),
          }),
        },
      );
    } catch (error) {
      console.error('Error syncing user stats to Airtable:', error);
    }
  }

  /**
   * Iterate every user with an Airtable record and refresh their stats
   * fields. Used by the daily cron to fix drift for users whose stats
   * changed via paths that don't fire a live sync (e.g. Hackatime recalc).
   * Batches up to 10 records per Airtable PATCH and paces requests to stay
   * well under the 5 req/sec base limit.
   */
  async syncAllUserStats(): Promise<{
    updated: number;
    skipped: number;
    failed: number;
  }> {
    if (!this.AIRTABLE_API_KEY || !this.YSWS_BASE_ID || !this.USERS_TABLE_ID) {
      return { updated: 0, skipped: 0, failed: 0 };
    }

    const users = await this.prisma.user.findMany({
      where: { airtableRecId: { not: null } },
      select: { userId: true, airtableRecId: true },
    });

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const chunk = users.slice(i, i + BATCH_SIZE);
      const records = await Promise.all(
        chunk.map(async (u) => {
          try {
            const stats = await this.computeUserStats(u.userId);
            return { id: u.airtableRecId!, fields: this.statsToFields(stats) };
          } catch (err) {
            console.error(
              `Error computing stats for user ${u.userId}:`,
              err,
            );
            return null;
          }
        }),
      );
      const validRecords = records.filter(
        (r): r is { id: string; fields: Record<string, any> } => r !== null,
      );
      skipped += records.length - validRecords.length;
      if (validRecords.length === 0) continue;

      try {
        const response = await fetch(
          `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.USERS_TABLE_ID}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records: validRecords }),
          },
        );
        if (response.ok) {
          updated += validRecords.length;
        } else {
          failed += validRecords.length;
          const errorText = await response.text().catch(() => '');
          console.error(
            `Airtable batch update failed (${response.status}):`,
            errorText,
          );
        }
      } catch (err) {
        failed += validRecords.length;
        console.error('Airtable batch update threw:', err);
      }

      // Pace batches: 5 req/sec base limit. 250ms keeps us at 4 req/sec.
      if (i + BATCH_SIZE < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    return { updated, skipped, failed };
  }

  async createApprovedProject(data: {
    user: {
      firstName: string;
      lastName: string;
      email: string;
      birthday: Date;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      country: string;
      zipCode: string;
    };
    project: {
      playableUrl: string;
      repoUrl: string;
      screenshotUrl: string;
      approvedHours: number;
      hoursJustification: string;
      description?: string;
    };
  }): Promise<{ recordId: string }> {
    if (!this.AIRTABLE_API_KEY) {
      throw new HttpException(
        'Airtable API key not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const extractGithubUsername = (repoUrl: string): string => {
        if (!repoUrl) {
          console.log('GitHub username extraction: repoUrl is empty or null');
          return '';
        }

        const trimmedUrl = repoUrl.trim();
        if (!trimmedUrl) {
          console.log(
            'GitHub username extraction: repoUrl is empty after trim',
          );
          return '';
        }

        try {
          const url = new URL(trimmedUrl);
          console.log('GitHub username extraction: parsed URL', {
            hostname: url.hostname,
            pathname: url.pathname,
          });

          if (
            url.hostname !== 'github.com' &&
            !url.hostname.endsWith('.github.com')
          ) {
            console.log(
              'GitHub username extraction: not a GitHub URL',
              url.hostname,
            );
            return '';
          }

          const pathParts = url.pathname.split('/').filter(Boolean);
          console.log('GitHub username extraction: pathParts', pathParts);

          if (pathParts.length === 0) {
            console.log('GitHub username extraction: no path parts');
            return '';
          }

          const username = pathParts[0];
          console.log(
            'GitHub username extraction: extracted username',
            username,
          );
          return username;
        } catch (error) {
          console.error(
            'GitHub username extraction error:',
            error,
            'for URL:',
            trimmedUrl,
          );
          return '';
        }
      };

      console.log(
        'Extracting GitHub username from repoUrl:',
        data.project.repoUrl,
      );
      console.log(
        'Available URLs - playableUrl:',
        data.project.playableUrl,
        'repoUrl:',
        data.project.repoUrl,
      );
      const githubUsername = extractGithubUsername(data.project.repoUrl);
      console.log(
        'Final GitHub username:',
        githubUsername,
        'from repoUrl:',
        data.project.repoUrl,
      );

      // Airtable's attachment downloader can't follow cdn.hackclub.com's 302
      // when the Location contains unencoded chars; pre-resolve so we hand it
      // the final user-cdn URL.
      const screenshotUrl = await resolveAttachmentUrl(
        data.project.screenshotUrl,
      );

      const fields: any = {
        'First Name': data.user.firstName,
        'Last Name': data.user.lastName,
        Email: data.user.email,
        Birthday: data.user.birthday.toISOString().split('T')[0],
        'Address (Line 1)': data.user.addressLine1,
        'Address (Line 2)': data.user.addressLine2 || '',
        City: data.user.city,
        'State / Province': data.user.state,
        Country: data.user.country,
        'ZIP / Postal Code': data.user.zipCode,
        'Playable URL': data.project.playableUrl,
        'Code URL': data.project.repoUrl,
        Screenshot: [
          {
            url: screenshotUrl,
            filename: `screenshot-${Date.now()}.png`,
          },
        ],
        'Optional - Override Hours Spent': data.project.approvedHours,
        'Optional - Override Hours Spent Justification':
          data.project.hoursJustification,
        'Approved At': new Date().toISOString().split('T')[0],
      };

      if (githubUsername) {
        fields['GitHub Username'] = githubUsername;
      }

      if (data.project.description) {
        fields['Description'] = data.project.description;
      }

      if (!this.AIRTABLE_API_KEY) {
        throw new HttpException(
          'Airtable API key not configured for Unified YSWS',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const response = await fetch(
        `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.APPROVED_PROJECTS_TABLE_ID}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            records: [
              {
                fields,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Airtable API error:', errorData);
        throw new HttpException(
          'Failed to create Approved Projects record',
          response.status || HttpStatus.BAD_REQUEST,
        );
      }

      const result = await response.json();
      return { recordId: result.records[0].id };
    } catch (error) {
      console.error('Error creating Approved Projects record:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateApprovedProject(
    airtableRecId: string,
    data: {
      playableUrl?: string;
      repoUrl?: string;
      screenshotUrl?: string;
      description?: string;
      approvedHours?: number;
      hoursJustification?: string;
    },
  ): Promise<void> {
    if (!this.AIRTABLE_API_KEY) {
      throw new HttpException(
        'Airtable API key not configured for Unified YSWS',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const fields: any = {};

      if (data.playableUrl !== undefined) {
        fields['Playable URL'] = data.playableUrl;
      }

      if (data.repoUrl !== undefined) {
        fields['Code URL'] = data.repoUrl;

        // Extract and update GitHub username if repo URL changed
        const extractGithubUsername = (repoUrl: string): string => {
          if (!repoUrl) return '';
          const trimmedUrl = repoUrl.trim();
          if (!trimmedUrl) return '';

          try {
            const url = new URL(trimmedUrl);
            if (
              url.hostname !== 'github.com' &&
              !url.hostname.endsWith('.github.com')
            ) {
              return '';
            }
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length === 0) return '';
            return pathParts[0];
          } catch (error) {
            return '';
          }
        };

        const githubUsername = extractGithubUsername(data.repoUrl);
        if (githubUsername) {
          fields['GitHub Username'] = githubUsername;
        }
      }

      if (data.screenshotUrl !== undefined) {
        const screenshotUrl = await resolveAttachmentUrl(data.screenshotUrl);
        fields['Screenshot'] = [
          {
            url: screenshotUrl,
            filename: `screenshot-${Date.now()}.png`,
          },
        ];
      }

      if (data.description !== undefined) {
        fields['Description'] = data.description;
      }

      if (data.approvedHours !== undefined) {
        fields['Optional - Override Hours Spent'] = data.approvedHours;
      }

      if (data.hoursJustification !== undefined) {
        fields['Optional - Override Hours Spent Justification'] =
          data.hoursJustification;
      }

      // Only make request if there are fields to update
      if (Object.keys(fields).length === 0) {
        return;
      }

      const response = await fetch(
        `https://api.airtable.com/v0/${this.YSWS_BASE_ID}/${this.APPROVED_PROJECTS_TABLE_ID}/${airtableRecId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${this.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Airtable update error:', errorData);
        throw new HttpException(
          'Failed to update Approved Projects record',
          response.status || HttpStatus.BAD_REQUEST,
        );
      }

      console.log(
        `Successfully updated Airtable record ${airtableRecId} in Approved Projects table`,
      );
    } catch (error) {
      console.error('Error updating Approved Projects record:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
