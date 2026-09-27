import { IsString, MaxLength, MinLength } from 'class-validator';

export class MfaSetupDto {
  @IsString()
  @MinLength(1, { message: 'password must not be empty' })
  @MaxLength(72)
  declare password: string;
}