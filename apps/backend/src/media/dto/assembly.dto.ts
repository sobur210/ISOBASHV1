import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StrictBoolean } from '../../shared/dto/strict-boolean.decorator';
import { ASSEMBLY_RESOLUTIONS } from '../../ai/video-assembly.types';

/**
 * Request body for `POST /media/assembly`.
 *
 * The caller supplies the *scenes*, not a prompt. There is no prompt here because
 * there is nothing to infer: a report or summary already has a title, headings and
 * paragraphs, and the feature's job is to lay that out and read it aloud.
 *
 * Every limit below is a plan limit from JSON2Video's free tier (600 credits,
 * 1080p, 60 seconds), not an invented one. The provider refuses an over-long movie
 * and a >2MB body anyway; failing here first means the user finds out before
 * waiting minutes for a render that was never going to succeed.
 */

/**
 * One scene. `@Matches` for a non-empty body instead of `@IsNotEmpty`, because a
 * scene of whitespace produces a provider error naming a field the user never
 * filled in, which is a worse message than a validation one.
 */
export class AssemblySceneDto {
  /** Rendered as the scene's heading line. */
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200)
  heading!: string;

  /** Narration and on-screen text. JSON2Video charges TTS 0 credits, so this is free to read aloud. */
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(4000)
  body!: string;
}

export class CreateAssemblyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  /**
   * Capped at 40 because a single movie cannot exceed 60 seconds and each scene
   * costs at least a few seconds to read. Past this the total is refused on
   * duration, not on a magic number here.
   */
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AssemblySceneDto)
  scenes!: AssemblySceneDto[];

  /**
   * Narration on/off. Uses `StrictBoolean` so `"false"` cannot become `true`:
   * a summary that silently gains a voice is a wrong result, not a cosmetic one.
   */
  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  voiceover?: boolean | string;

  /** Appended as a closing scene, e.g. a source line or a call to action. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  outro?: string;

  /** Must be one of the plan's sizes; `full-hd` is the free ceiling. */
  @IsString()
  @IsIn(ASSEMBLY_RESOLUTIONS as unknown as string[])
  resolution!: (typeof ASSEMBLY_RESOLUTIONS)[number];

  /**
   * Where the content came from, recorded on the asset so an assembled video can
   * be traced back to the report or summary it was built from.
   */
  @IsString()
  @IsIn(['research', 'chat'])
  source!: 'research' | 'chat';

  /** Id of the report or conversation, when there is one. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  projectId?: number;
}
