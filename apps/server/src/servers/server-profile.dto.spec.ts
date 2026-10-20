import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateServerProfileDto } from './dto'

describe('UpdateServerProfileDto', () => {
  it.each([
    { displayName: 'n'.repeat(32), bio: 'b'.repeat(1000) },
    { displayName: '', bio: '' },
    { displayName: null, bio: null },
    { displayName: 'A' },
    { bio: 'Description' }
  ])('accepts valid profile fields: %p', async (input) => {
    expect(await validate(plainToInstance(UpdateServerProfileDto, input))).toHaveLength(0)
  })

  it.each([{ displayName: 'n'.repeat(33) }, { bio: 'b'.repeat(1001) }, { displayName: 42 }, { bio: ['not a string'] }])(
    'rejects invalid profile fields: %p',
    async (input) => {
      expect(await validate(plainToInstance(UpdateServerProfileDto, input))).not.toHaveLength(0)
    }
  )
})
