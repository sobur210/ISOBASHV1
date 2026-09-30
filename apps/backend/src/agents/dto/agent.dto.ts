import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { StrictBoolean } from '../../shared/dto/strict-boolean.decorator';

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_INSTRUCTIONS = 8000;
const MAX_TOOLS = 12;
const MAX_STEPS = 12;

export class CreateAgentDto {
  @IsString()
  @MaxLength(MAX_NAME)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_INSTRUCTIONS)
  instructions?: string;

  /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_STEPS)
  maxSteps?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolNames?: string[];

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  memoryEnabled?: boolean | string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_INSTRUCTIONS)
  instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_STEPS)
  maxSteps?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolNames?: string[];

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  memoryEnabled?: boolean | string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number | null;
}

export class StartAgentRunDto {
  @IsString()
  @MaxLength(8000)
  input!: string;
}
