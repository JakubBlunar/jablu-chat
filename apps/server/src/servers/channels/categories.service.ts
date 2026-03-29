import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Permission } from '@chat/shared'
import { EventBusService } from '../../events/event-bus.service'
import { PrismaService } from '../../prisma/prisma.service'
import { RolesService } from '../../roles/roles.service'
import { AuditLogService } from '../audit-log.service'

@Injectable()
export class CategoriesService {
  constructor(
    private readonly events: EventBusService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly roles: RolesService
  ) {}

  async getCategories(serverId: string, userId: string) {
    await this.roles.requireMembership(serverId, userId)
    return this.prisma.channelCategory.findMany({
      where: { serverId },
      orderBy: { position: 'asc' }
    })
  }

  async createCategory(serverId: string, userId: string, name: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)
    const maxPos = await this.prisma.channelCategory.aggregate({
      where: { serverId },
      _max: { position: true }
    })
    const position = (maxPos._max.position ?? -1) + 1
    const category = await this.prisma.channelCategory.create({
      data: { serverId, name, position }
    })
    await this.auditLog.log(serverId, userId, 'category.create', 'category', category.id, name)
    this.events.emit('category:created', { serverId, category })
    return category
  }

  async updateCategory(serverId: string, categoryId: string, userId: string, data: { name?: string; position?: number }) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)
    const category = await this.prisma.channelCategory.findFirst({
      where: { id: categoryId, serverId }
    })
    if (!category) throw new NotFoundException('Category not found')
    if (data.name === undefined && data.position === undefined) return category
    const updated = await this.prisma.channelCategory.update({
      where: { id: categoryId },
      data
    })
    await this.auditLog.log(serverId, userId, 'category.update', 'category', categoryId, data.name ? `Renamed to "${data.name}"` : 'Position changed')
    this.events.emit('category:updated', { serverId, category: updated })
    return updated
  }

  async deleteCategory(serverId: string, categoryId: string, userId: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)
    const category = await this.prisma.channelCategory.findFirst({
      where: { id: categoryId, serverId }
    })
    if (!category) throw new NotFoundException('Category not found')

    await this.prisma.channel.updateMany({
      where: { categoryId },
      data: { categoryId: null }
    })
    await this.prisma.channelCategory.delete({ where: { id: categoryId } })
    await this.auditLog.log(serverId, userId, 'category.delete', 'category', categoryId, category.name)
    this.events.emit('category:deleted', { serverId, categoryId })
  }

  async reorderCategories(serverId: string, userId: string, categoryIds: string[]) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)
    const categories = await this.prisma.channelCategory.findMany({
      where: { id: { in: categoryIds }, serverId },
      select: { id: true }
    })
    if (categories.length !== categoryIds.length) {
      throw new BadRequestException('Some category IDs do not belong to this server')
    }
    await this.prisma.$transaction(
      categoryIds.map((id, i) =>
        this.prisma.channelCategory.update({ where: { id }, data: { position: i } })
      )
    )
    await this.auditLog.log(serverId, userId, 'category.reorder', 'server', serverId, `Reordered ${categoryIds.length} categories`)
    this.events.emit('category:reorder', { serverId, categoryIds })
  }
}
