import { IsInt, IsOptional, Min } from 'class-validator'

export class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInMinutes?: number
}
