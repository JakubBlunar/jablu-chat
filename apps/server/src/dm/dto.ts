import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator'

export class UpdateDmPreferencesDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isFavorite?: boolean

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  muted?: boolean
}

export class UpdateGroupDmDto {
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @Length(0, 100)
  groupName?: string | null
}

export class AddGroupMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @IsUUID('4', { each: true })
  memberIds: string[]
}

export class DmAttachmentsQueryDto {
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
