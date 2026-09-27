import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AiCapability, AiMode } from '../provider.types';

const CAPABILITIES: AiCapability[] = ['language', 'vision', 'embeddings', 'image-generation', 'video-generation', 'research'];
const MODES: AiMode[] = ['online', 'offline', 'hybrid'];

/** Phase 9: ask the router what it would do, without spending a model call. */
export class RoutePreviewDto {
  @IsIn(CAPABILITIES, { message: 'capability must be one of: language, vision, embeddings, image-generation, video-generation, research' })
  declare capability: AiCapability;

  @IsOptional()
  @IsIn(MODES, { message: 'mode must be one of: online, offline, hybrid' })
  declare mode?: AiMode;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare model?: string;
}
