import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateImageGenerationDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  /** Must be one of `MEDIA_ASPECT_RATIOS`; anything else is refused, not coerced. */
  @IsOptional()
  @IsIn(['1:1', '3:4', '4:3', '9:16', '16:9'])
  aspectRatio?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  count?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{1,80}$/, { message: 'model may only contain letters, digits, dot, underscore, colon and dash.' })
  model?: string;
}
