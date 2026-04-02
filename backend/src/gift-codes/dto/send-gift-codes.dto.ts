import { IsString, IsArray, IsEmail, IsNotEmpty, IsUrl } from 'class-validator';

export class SendGiftCodesDto {
  @IsArray()
  @IsEmail({}, { each: true })
  emails: string[];

  @IsString()
  @IsNotEmpty()
  itemDescription: string;

  @IsString()
  @IsUrl()
  imageUrl: string;

  @IsString()
  @IsUrl()
  filloutUrl: string;
}
