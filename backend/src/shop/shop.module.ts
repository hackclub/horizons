import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShopService } from './shop.service';
import {
  ShopController,
  ShopAuthController,
  ShopAdminController,
} from './shop.controller';
import { PrismaService } from '../prisma.service';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [ConfigModule, BalanceModule],
  controllers: [ShopController, ShopAuthController, ShopAdminController],
  providers: [ShopService, PrismaService],
})
export class ShopModule {}
