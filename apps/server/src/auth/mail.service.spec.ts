import * as nodemailer from 'nodemailer'
import { MailService } from './mail.service'

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-1' })
  })
}))

const mockCreateTransport = jest.mocked(nodemailer.createTransport)

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user@example.com',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.com',
    APP_NAME: 'TestApp',
    ...overrides
  }
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback
  } as any
}

describe('MailService', () => {
  let service: MailService
  let sendMail: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' })
    mockCreateTransport.mockReturnValue({ sendMail } as any)
    service = new MailService(makeConfig())
  })

  describe('constructor', () => {
    it('creates SMTP transport with auth when credentials provided', () => {
      new MailService(makeConfig())

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'secret' }
      })
    })

    it('creates transport without auth when SMTP_USER is empty', () => {
      new MailService(makeConfig({ SMTP_USER: undefined }))

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: undefined })
      )
    })

    it('uses secure=true when port is 465', () => {
      new MailService(makeConfig({ SMTP_PORT: '465' }))

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true })
      )
    })
  })

  describe('sendPasswordReset', () => {
    it('sends email with correct from, to, and subject', async () => {
      await service.sendPasswordReset('alice@test.com', 'alice', 'https://app/reset?t=abc')

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
          to: 'alice@test.com',
          subject: 'Password Reset Request'
        })
      )
    })

    it('includes username and reset URL in HTML body', async () => {
      await service.sendPasswordReset('alice@test.com', 'alice', 'https://app/reset?t=abc')

      const html = sendMail.mock.calls[0][0].html as string
      expect(html).toContain('alice')
      expect(html).toContain('https://app/reset?t=abc')
      expect(html).toContain('TestApp')
    })

    it('does not throw when sendMail fails', async () => {
      sendMail.mockRejectedValue(new Error('SMTP timeout'))

      await expect(
        service.sendPasswordReset('alice@test.com', 'alice', 'https://app/reset')
      ).resolves.toBeUndefined()
    })
  })

  describe('sendInvite', () => {
    it('sends email with correct subject containing app name', async () => {
      await service.sendInvite('bob@test.com', 'INV-123', 'https://app/register?code=INV-123')

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "You've been invited to TestApp!"
        })
      )
    })

    it('includes invite code and register URL in HTML body', async () => {
      await service.sendInvite('bob@test.com', 'INV-123', 'https://app/register?code=INV-123')

      const html = sendMail.mock.calls[0][0].html as string
      expect(html).toContain('INV-123')
      expect(html).toContain('https://app/register?code=INV-123')
    })

    it('does not throw when sendMail fails', async () => {
      sendMail.mockRejectedValue(new Error('SMTP down'))

      await expect(
        service.sendInvite('bob@test.com', 'CODE', 'https://app/register')
      ).resolves.toBeUndefined()
    })
  })
})
