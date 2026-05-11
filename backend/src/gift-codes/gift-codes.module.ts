import { Module } from '@nestjs/common';
import { GiftCodesService } from './gift-codes.service';
import {
  GiftCodesController,
  GiftCodesAdminController,
} from './gift-codes.controller';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [],
  controllers: [GiftCodesController, GiftCodesAdminController],
  providers: [GiftCodesService, PrismaService],
})
export class GiftCodesModule {}
