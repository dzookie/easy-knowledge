import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  kbId: string;

  @IsString()
  @IsNotEmpty()
  query: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @IsOptional()
  history?: ChatMessageDto[];

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  topK?: number;

  @IsOptional()
  @Min(0)
  @Max(1)
  topKScore?: number;

  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsString()
  @IsOptional()
  systemPrompt?: string;
}
