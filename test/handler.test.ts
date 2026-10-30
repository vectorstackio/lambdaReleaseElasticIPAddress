import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  client: vi.fn(),
  command: vi.fn()
}))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class {
    constructor(config: unknown) {
      mocks.client(config)
    }
    send = mocks.send
  },
  ReleaseAddressCommand: class {
    constructor(input: unknown) {
      mocks.command(input)
    }
  }
}))

import { handler } from '../src/handler'

const invoke = (body: unknown) => handler(
  { body } as APIGatewayProxyEvent,
  {} as Context,
  vi.fn()
)

describe('release Elastic IP handler', () => {
  beforeEach(() => {
    mocks.send.mockReset().mockResolvedValue({})
    mocks.command.mockClear()
    vi.restoreAllMocks()
  })

  it.each([
    ['JSON body', JSON.stringify({ allocationId: 'eipalloc-123' })],
    ['parsed body', { allocationId: 'eipalloc-123' }]
  ])('releases an address from a %s', async (_description, body) => {
    const result = await invoke(body)
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ success: true, allocationId: 'eipalloc-123' })
    })
    expect(mocks.command).toHaveBeenCalledExactlyOnceWith({ AllocationId: 'eipalloc-123' })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf((await import('@aws-sdk/client-ec2')).ReleaseAddressCommand)
  })

  it.each([
    ['missing', {}],
    ['empty string', { allocationId: '' }],
    ['null', { allocationId: null }],
    ['false', { allocationId: false }],
    ['zero', { allocationId: 0 }],
    ['JSON object without the field', '{}']
  ])('rejects a %s allocation ID', async (_description, body) => {
    expect(await invoke(body)).toEqual({
      statusCode: 400,
      body: JSON.stringify({ error: 'allocationId is required' })
    })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.command).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', '{'],
    ['null body', null],
    ['JSON null', 'null'],
    ['undefined body', undefined]
  ])('handles %s without calling AWS', async (_description, body) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await invoke(body)).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error in releaseElasticIpLambda' })
    })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledOnce()
  })

  it('handles an AWS error without exposing it in the response', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockRejectedValue(new Error('AWS failure: secret-token'))
    const result = await invoke('{"allocationId":"eipalloc-123"}')
    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error in releaseElasticIpLambda' })
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
    expect(log).toHaveBeenCalledOnce()
  })

  it('does not log the allocation ID on a successful release', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await invoke('{"allocationId":"eipalloc-private"}')
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('does not log sensitive details from AWS errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockRejectedValue(new Error('secret-token'))
    await invoke('{"allocationId":"eipalloc-123"}')
    expect(log.mock.calls.flat().map(String).join(' ')).not.toContain('secret-token')
  })
})
