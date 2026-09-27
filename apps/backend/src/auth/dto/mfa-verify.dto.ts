import { IsString, Matches, MinLength } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @MinLength(1)
  declare token: string;

  @Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit authenticator code' })
  declare code: string;
}