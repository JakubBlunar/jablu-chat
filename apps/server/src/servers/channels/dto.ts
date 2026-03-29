import { ChannelType } from '@prisma/client'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength
} from 'class-validator'
import { Transform } from 'class-transformer'

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'name must be lowercase letters, numbers, and hyphens only'
  })
  name: string

  @IsEnum(ChannelType)
  type: ChannelType

  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => (value === '' ? null : value))
  categoryId?: string | null
}

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'name must be lowercase letters, numbers, and hyphens only'
  })
  name?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number

  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => (value === '' ? null : value))
  categoryId?: string | null

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean
}

export class ReorderChannelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  channelIds!: string[]
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number
}

export class ReorderCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  categoryIds!: string[]
}
