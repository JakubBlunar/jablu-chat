import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  attachmentIds?: string[];
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}

export class MessageQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ToggleReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  emoji!: string;

  @IsOptional()
  isCustom?: boolean;
}
