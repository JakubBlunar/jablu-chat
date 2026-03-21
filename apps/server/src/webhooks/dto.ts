import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class ExecuteWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;
}
