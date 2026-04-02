import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type UploadableFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly apiKey: string | null;
  private readonly baseUrl = 'https://cdn.hackclub.com/api/v4';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('HC_CDN_API_KEY') ?? null;
    if (!this.apiKey) {
      this.logger.warn(
        'HC_CDN_API_KEY is not set – file uploads will be disabled',
      );
    }
  }

  async uploadImage(file: UploadableFile) {
    if (!this.apiKey) {
      throw new BadRequestException('File uploads are not configured');
    }
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are allowed');
    }

    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype,
    });
    const formData = new FormData();
    formData.append('file', blob, file.originalname);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      });
    } catch {
      throw new InternalServerErrorException('Failed to upload image');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`CDN upload failed (${response.status}): ${body}`);
      if (response.status === 401) {
        throw new InternalServerErrorException('CDN authentication failed');
      }
      if (response.status === 402) {
        throw new BadRequestException('CDN storage quota exceeded');
      }
      throw new InternalServerErrorException('Failed to upload image');
    }

    const data = await response.json();
    return { url: data.url };
  }
}
