import { ForumLayout, ForumSortOrder } from '../prisma-client'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength
} from 'class-validator'
import { Transform } from 'class-transformer'

export class CreateForumPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(5)
  tagIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  attachmentIds?: string[]
}

export class UpdateForumPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(5)
  tagIds?: string[]
}

export class ListForumPostsDto {
  @IsOptional()
  @IsEnum(ForumSortOrder)
  sort?: ForumSortOrder

  @IsOptional()
  @IsUUID('4')
  tagId?: string

  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @Transform(({ value }) => (value != null ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  limit?: number
}

export class CreateForumTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string
}

export class UpdateForumTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string | null
}

export class UpdateChannelForumSettingsDto {
  @IsOptional()
  @IsEnum(ForumSortOrder)
  defaultSortOrder?: ForumSortOrder

  @IsOptional()
  @IsEnum(ForumLayout)
  defaultLayout?: ForumLayout

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (value === '' ? null : value))
  postGuidelines?: string | null

  @IsOptional()
  @IsBoolean()
  requireTags?: boolean
}
