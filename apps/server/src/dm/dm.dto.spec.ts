import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { DmAttachmentsQueryDto, UpdateDmPreferencesDto, UpdateGroupDmDto } from './dto'

describe('DM request validation', () => {
  it.each([{ page: '-1' }, { page: '1.5' }, { limit: '0' }, { limit: '101' }, { kind: 'anything' }])('rejects invalid attachment pagination: %j', async (query) => {
    expect((await validate(plainToInstance(DmAttachmentsQueryDto, query))).length).toBeGreaterThan(0)
  })
  it('transforms and validates pagination defaults', async () => {
    const query = plainToInstance(DmAttachmentsQueryDto, { page: '2', limit: '30' })
    expect(await validate(query)).toEqual([])
    expect(query).toMatchObject({ page: 2, limit: 30, kind: 'media' })
  })
  it.each([{ muted: null }, { isFavorite: 'true' }])('rejects invalid preferences: %j', async (body) => {
    expect((await validate(plainToInstance(UpdateDmPreferencesDto, body))).length).toBeGreaterThan(0)
  })
  it('allows clearing a group name but not an oversized name', async () => {
    expect(await validate(plainToInstance(UpdateGroupDmDto, { groupName: null }))).toEqual([])
    expect((await validate(plainToInstance(UpdateGroupDmDto, { groupName: 'a'.repeat(101) }))).length).toBeGreaterThan(0)
  })
})
