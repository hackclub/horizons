import { Module } from '@nestjs/common';
import { CachetService } from './cachet.service';

@Module({
  providers: [CachetService],
  exports: [CachetService],
})
export class CachetModule {}
