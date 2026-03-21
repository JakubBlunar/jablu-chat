import { IsArray, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateDmDto {
  @IsUUID()
  recipientId: string;
}

export class CreateGroupDmDto {
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[];

  @IsOptional()
  @IsString()
  @Length(1, 100)
  groupName?: string;
}
