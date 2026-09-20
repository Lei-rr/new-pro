export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const badRequest = (message: string) => new HttpError(400, message)
export const unauthorized = (message = '未授权或登录已过期，请重新登录') => new HttpError(401, message)

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError
}
