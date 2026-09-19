import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  declare email: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(72, { message: 'password must not exceed 72 characters' })
  declare password: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare name?: string;
}