import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../auth/current-user.decorator';
import { SearchService } from './search.service';

class SearchQueryDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsOptional()
  @IsBooleanString()
  dmOnly?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

@Controller('search')
@UseGuards(AuthGuard('jwt'))
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('messages')
  searchMessages(
    @CurrentUser() user: { id: string },
    @Query() query: SearchQueryDto,
  ) {
    return this.search.searchMessages(
      user.id,
      query.q,
      query.serverId,
      query.channelId,
      query.dmOnly === 'true',
      query.limit,
      query.offset,
    );
  }
}
