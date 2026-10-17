import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator'

export class DmAttachmentsQueryDto {
  @IsOptional()
  @IsIn(['media', 'files'])
  kind: 'media' | 'files' = 'media'

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  page = 0

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30
}

export class CreateDmDto {
  @IsUUID()
  recipientId: string
}

export class CreateGroupDmDto {
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[]

  @IsOptional()
  @IsString()
  @Length(1, 100)
  groupName?: string
}

export class SendDmMessageDto {
  @IsString()
  @Length(1, 4000)
  content: string
}
