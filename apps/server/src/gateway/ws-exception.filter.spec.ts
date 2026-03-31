import { BadRequestException } from '@nestjs/common'
import { WsException } from '@nestjs/websockets'
import { WsExceptionFilter } from './ws-exception.filter'

describe('WsExceptionFilter', () => {
  let filter: WsExceptionFilter
  let mockEmit: jest.Mock

  function makeHost() {
    mockEmit = jest.fn()
    return {
      switchToWs: () => ({
        getClient: () => ({ emit: mockEmit })
      })
    } as any
  }

  beforeEach(() => {
    filter = new WsExceptionFilter()
  })

  it('formats BadRequestException with message array (validation errors)', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['channelId must be a UUID', 'content must be shorter than 4000 characters'],
      error: 'Bad Request'
    })

    filter.catch(exception, makeHost())

    expect(mockEmit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'channelId must be a UUID; content must be shorter than 4000 characters'
    })
  })

  it('formats BadRequestException with string message', () => {
    const exception = new BadRequestException('Something went wrong')

    filter.catch(exception, makeHost())

    expect(mockEmit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'Something went wrong'
    })
  })

  it('formats WsException with string error', () => {
    const exception = new WsException('Unauthorized')

    filter.catch(exception, makeHost())

    expect(mockEmit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'Unauthorized'
    })
  })

  it('formats WsException with object error', () => {
    const exception = new WsException({ message: 'Token expired' })

    filter.catch(exception, makeHost())

    expect(mockEmit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'Token expired'
    })
  })

  it('formats generic Error as internal error', () => {
    const exception = new Error('Database connection lost')

    filter.catch(exception, makeHost())

    expect(mockEmit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'Internal error'
    })
  })

  it('formats non-Error value as internal error', () => {
    filter.catch('some string', makeHost())

    expect(mockEmit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'Internal error'
    })
  })
})
