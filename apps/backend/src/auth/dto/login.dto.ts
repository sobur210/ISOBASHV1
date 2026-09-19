import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  declare email: string;

  @IsString()
  @MinLength(1, { message: 'password must not be empty' })
  @MaxLength(72)
  declare password: string;
}