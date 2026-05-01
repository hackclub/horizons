import { Module } from '@nestjs/common';
import { HuddlesController } from './huddles.controller';
import { HuddlesService } from './huddles.service';

@Module({
  controllers: [HuddlesController],
  providers: [HuddlesService],
  exports: [HuddlesService],
})
export class HuddlesModule {}
