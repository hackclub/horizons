import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShopService } from './shop.service';
import {
  ShopController,
  ShopAuthController,
  ShopAdminController,
} from './shop.controller';
import { PrismaService } from '../prisma.service';
import { MailModule } from '../mail/mail.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [ConfigModule, MailModule, BalanceModule],
  controllers: [ShopController, ShopAuthController, ShopAdminController],
  providers: [ShopService, PrismaService],
})
export class ShopModule {}
