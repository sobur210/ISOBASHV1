import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartResearchDto {
  @IsString()
  @MaxLength(2000)
  question!: string;

  /** URLs the caller already trusts. Retrieved for real, with the same SSRF guards. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  urls?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}
