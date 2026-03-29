import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../../auth/current-user.decorator'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto, ReorderCategoriesDto, UpdateCategoryDto } from './dto'

@Controller('servers/:serverId/categories')
@UseGuards(AuthGuard('jwt'))
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.categories.getCategories(serverId, user.id)
  }

  @Post()
  create(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCategoryDto
  ) {
    return this.categories.createCategory(serverId, user.id, dto.name)
  }

  @Patch('reorder')
  reorder(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ReorderCategoriesDto
  ) {
    return this.categories.reorderCategories(serverId, user.id, dto.categoryIds)
  }

  @Patch(':id')
  update(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('id', ParseUUIDPipe) categoryId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCategoryDto
  ) {
    return this.categories.updateCategory(serverId, categoryId, user.id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('id', ParseUUIDPipe) categoryId: string,
    @CurrentUser() user: { id: string }
  ) {
    await this.categories.deleteCategory(serverId, categoryId, user.id)
  }
}
