import { IsOptional, IsString, IsUUID, Length } from 'class-validator'

export class CreateServerDto {
  @IsString()
  @Length(1, 100)
  name: string
}

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string
}

export class UpdateMemberRoleDto {
  @IsUUID()
  roleId: string
}
