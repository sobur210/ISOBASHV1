import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AiCapability, AiMode } from '../../ai/provider.types';

const CAPABILITIES: AiCapability[] = ['language', 'vision', 'embeddings', 'image-generation', 'video-generation', 'research'];
const MODES: AiMode[] = ['online', 'offline', 'hybrid'];

export class GenerateRequestDto {
  @IsIn(CAPABILITIES, { message: 'capability must be one of: language, vision, embeddings, image-generation, video-generation, research' })
  declare capability: AiCapability;

  @IsString()
  @IsNotEmpty({ message: 'input must not be empty' })
  @MaxLength(100_000, { message: 'input exceeds 100,000 characters' })
  declare input: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare model?: string;

  @IsOptional()
  @IsIn(MODES, { message: 'mode must be one of: online, offline, hybrid' })
  declare mode?: AiMode;
}