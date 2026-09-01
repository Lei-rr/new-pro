/** 业务错误：路由层捕获并转为对应 HTTP 状态码 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string): AppError {
  return new AppError(message, 400);
}

export function notFound(message: string): AppError {
  return new AppError(message, 404);
}
