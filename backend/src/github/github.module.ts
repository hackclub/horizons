import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';

@Module({
  imports: [ConfigModule],
  controllers: [GitHubController],
  providers: [GitHubService],
  exports: [GitHubService],
})
export class GitHubModule {}
