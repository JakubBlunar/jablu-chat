import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ServerRole } from '@prisma/client';

export class CreateServerDto {
  @IsString()
  @Length(1, 100)
  name: string;
}

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
}

export class UpdateMemberRoleDto {
  @IsEnum(ServerRole)
  role: ServerRole;
}
