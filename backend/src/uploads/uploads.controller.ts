import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { UploadsService, UploadableFile } from './uploads.service';

@Controller('api/uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post()
  @Throttle({ default: { limit: 2, ttl: 60 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024,
      },
    }),
  )
  async upload(@UploadedFile() file: UploadableFile) {
    return this.uploadsService.uploadImage(file);
  }
}
