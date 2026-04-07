import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'

export class EmbedDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string

  @IsOptional()
  @IsUrl()
  url?: string

  @IsOptional()
  @IsUrl()
  imageUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  siteName?: string
}
