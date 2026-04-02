import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
} from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsNumber()
  rsvpNumber?: number;

  @IsOptional()
  @IsNumber()
  rafflePosition?: number;

  @IsOptional()
  @IsString()
  stickerToken?: string;
}
