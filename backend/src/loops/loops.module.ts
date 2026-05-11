import { Module } from '@nestjs/common';
import { LoopsService } from './loops.service';

@Module({
  providers: [LoopsService],
  exports: [LoopsService],
})
export class LoopsModule {}
