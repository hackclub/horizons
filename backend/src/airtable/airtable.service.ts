import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class AirtableService {
  private readonly AIRTABLE_API_KEY = process.env.YSWS_AIRTABLE_API_KEY;
  private readonly YSWS_BASE_ID = process.env.YSWS_BASE_ID;
  private readonly APPROVED_PROJECTS_TABLE_ID = process.env.YSWS_APPROVED_PROJECTS_TABLE_ID;

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
          console.log('GitHub username extraction: repoUrl is empty after trim');
          return '';
        }

        try {
          const url = new URL(trimmedUrl);
          console.log('GitHub username extraction: parsed URL', { hostname: url.hostname, pathname: url.pathname });
          
          if (url.hostname !== 'github.com' && !url.hostname.endsWith('.github.com')) {
            console.log('GitHub username extraction: not a GitHub URL', url.hostname);
            return '';
          }

          const pathParts = url.pathname.split('/').filter(Boolean);
          console.log('GitHub username extraction: pathParts', pathParts);
          
          if (pathParts.length === 0) {
            console.log('GitHub username extraction: no path parts');
            return '';
          }

          const username = pathParts[0];
          console.log('GitHub username extraction: extracted username', username);
          return username;
        } catch (error) {
          console.error('GitHub username extraction error:', error, 'for URL:', trimmedUrl);
          return '';
        }
      };

      console.log('Extracting GitHub username from repoUrl:', data.project.repoUrl);
      console.log('Available URLs - playableUrl:', data.project.playableUrl, 'repoUrl:', data.project.repoUrl);
      const githubUsername = extractGithubUsername(data.project.repoUrl);
      console.log('Final GitHub username:', githubUsername, 'from repoUrl:', data.project.repoUrl);


      const fields: any = {
        'First Name': data.user.firstName,
        'Last Name': data.user.lastName,
        'Email': data.user.email,
        'Birthday': data.user.birthday.toISOString().split('T')[0],
        'Address (Line 1)': data.user.addressLine1,
        'Address (Line 2)': data.user.addressLine2 || '',
        'City': data.user.city,
        'State / Province': data.user.state,
        'Country': data.user.country,
        'ZIP / Postal Code': data.user.zipCode,
        'Playable URL': data.project.playableUrl,
        'Code URL': data.project.repoUrl,
        'Screenshot': [
          {
            url: data.project.screenshotUrl,
            filename: `screenshot-${Date.now()}.png`
          }
        ],
        'Optional - Override Hours Spent': data.project.approvedHours,
        'Optional - Override Hours Spent Justification': data.project.hoursJustification,
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

  async updateApprovedProject(airtableRecId: string, data: {
    playableUrl?: string;
    repoUrl?: string;
    screenshotUrl?: string;
    description?: string;
    approvedHours?: number;
    hoursJustification?: string;
  }): Promise<void> {

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
            if (url.hostname !== 'github.com' && !url.hostname.endsWith('.github.com')) {
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
        fields['Screenshot'] = [
          {
            url: data.screenshotUrl,
            filename: `screenshot-${Date.now()}.png`
          }
        ];
      }

      if (data.description !== undefined) {
        fields['Description'] = data.description;
      }

      if (data.approvedHours !== undefined) {
        fields['Optional - Override Hours Spent'] = data.approvedHours;
      }

      if (data.hoursJustification !== undefined) {
        fields['Optional - Override Hours Spent Justification'] = data.hoursJustification;
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

      console.log(`Successfully updated Airtable record ${airtableRecId} in Approved Projects table`);
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
