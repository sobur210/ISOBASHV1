import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatStreamRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  conversationId?: string;

  @IsString()
  @IsNotEmpty({ message: 'input must not be empty' })
  @MaxLength(100_000, { message: 'input exceeds 100,000 characters' })
  declare input: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;
}