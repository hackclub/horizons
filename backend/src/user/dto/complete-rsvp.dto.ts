import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class CompleteRsvpDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  birthday: string;

  @IsString()
  @IsOptional()
  referralCode?: string;
}
