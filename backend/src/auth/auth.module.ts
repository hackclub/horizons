import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';
import { CachetModule } from '../cachet/cachet.module';

@Module({
  imports: [AirtableModule, CachetModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
})
export class AuthModule {}
