import { Matches } from 'class-validator';

export class MfaCodeDto {
  @Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit authenticator code' })
  declare code: string;
}