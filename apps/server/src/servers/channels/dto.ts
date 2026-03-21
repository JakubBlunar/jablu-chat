import { ChannelType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'name must be lowercase letters, numbers, and hyphens only',
  })
  name: string;

  @IsEnum(ChannelType)
  type: ChannelType;
}

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'name must be lowercase letters, numbers, and hyphens only',
  })
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
