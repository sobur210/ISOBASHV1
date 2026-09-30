import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { StrictBoolean } from '../../shared/dto/strict-boolean.decorator';

export class CreateImageGenerationDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  /**
   * A style preset id from `IMAGE_STYLES`. The allow-list is enforced in the
   * service with the real list, so an unknown value is refused rather than
   * silently dropped (which would render an image the caller did not ask for).
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  style?: string;

  /**
   * Ask a routed text model to expand the description before rendering. Best
   * effort: the original words are always what the renderer falls back to.
   */
  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  enhance?: boolean | string;

  /** Must be one of `MEDIA_ASPECT_RATIOS`; anything else is refused, not coerced. */
  @IsOptional()
  @IsIn(['1:1', '3:4', '4:3', '9:16', '16:9'])
  aspectRatio?: string;

  /**
   * How many variations to render. Each is a separate render with its own seed,
   * so this is a real "give me N different takes" control, not a multiplier on
   * one image.
   */
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

export class CreateVideoGenerationDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  /** Must be one of `MEDIA_VIDEO_ASPECT_RATIOS`; anything else is refused, not coerced. */
  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  aspectRatio?: string;

  /** Must be one of `MEDIA_VIDEO_DURATIONS`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  seconds?: number;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  audio?: boolean | string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  /**
   * A stored IMAGE asset of this account to animate. Anything else (another
   * user's id, a clip, an id that does not exist) is refused at start time.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceAssetId?: string;

  /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._:/-]{1,120}$/, { message: 'model may only contain letters, digits, dot, underscore, slash, colon and dash.' })
  model?: string;
}
