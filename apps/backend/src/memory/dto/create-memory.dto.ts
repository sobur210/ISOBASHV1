import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMemoryDto {
  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsIn(['FACT', 'PREFERENCE', 'SUMMARY', 'NOTE'])
  kind?: 'FACT' | 'PREFERENCE' | 'SUMMARY' | 'NOTE';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;
}
