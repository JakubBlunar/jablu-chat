import 'reflect-metadata'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { registerSchema } from '@chat/shared'
import { RegisterDto } from './dto'

it.each(['reno', 'reno_1', 'de-Entropie', 'a'.repeat(20)])(
  'accepts the same valid username %s at both boundaries',
  async (username) => {
    const input = { username, email: 'user@example.invalid', password: 'LongPassword123' }
    expect(registerSchema.safeParse(input).success).toBe(true)
    expect(await validate(plainToInstance(RegisterDto, input))).toHaveLength(0)
  }
)
it.each(['jt', 'abc', 'ren o', ' reno', 'reno ', 'reno\t', 'reno\nname', 'a'.repeat(21)])(
  'rejects short, spaced or oversized username %j at both boundaries',
  async (username) => {
    const input = { username, email: 'user@example.invalid', password: 'LongPassword123' }
    expect(registerSchema.safeParse(input).success).toBe(false)
    expect(await validate(plainToInstance(RegisterDto, input))).not.toHaveLength(0)
  }
)
