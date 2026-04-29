import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateHackatimeProjectsDto {
  @ApiProperty({
    description: 'List of Hackatime project names to link',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  projectNames: string[];
}
