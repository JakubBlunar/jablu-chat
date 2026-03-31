import { IsArray, IsEmail, IsOptional, IsString, IsUUID, Length } from 'class-validator'

export class AdminCreateServerDto {
  @IsString()
  @Length(1, 100)
  name: string

  @IsUUID()
  ownerUserId: string
}

export class AdminLoginDto {
  @IsString()
  username: string

  @IsString()
  password: string
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  username?: string

  @IsOptional()
  @IsString()
  @Length(1, 32)
  displayName?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string
}

export class AdminCreateInviteDto {
  @IsEmail()
  email: string

  @IsOptional()
  @IsUUID()
  serverId?: string
}

export class AdminAddServerMemberDto {
  @IsUUID()
  userId: string
}

export class AdminUpdateMemberRolesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[]
}

export class AdminCreateRoleDto {
  @IsString()
  @Length(1, 100)
  name: string

  @IsOptional()
  @IsString()
  color?: string

  @IsOptional()
  @IsString()
  permissions?: string
}

export class AdminUpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string

  @IsOptional()
  @IsString()
  color?: string | null

  @IsOptional()
  @IsString()
  permissions?: string

  @IsOptional()
  position?: number

  @IsOptional()
  selfAssignable?: boolean

  @IsOptional()
  isAdmin?: boolean
}
