import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, IsNotEmpty } from 'class-validator';

export class UpdateHackatimeProjectsDto {
  @ApiProperty({
    description: 'List of Hackatime project names to link',
    type: [String],
  })
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  projectNames: string[];
}
