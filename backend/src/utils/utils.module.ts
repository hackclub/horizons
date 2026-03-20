import { Module } from '@nestjs/common';
import { UrlCheckController } from './url-check.controller';

@Module({
  controllers: [UrlCheckController],
})
export class UtilsModule {}
