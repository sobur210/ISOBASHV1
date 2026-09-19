import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiError, ErrorFormat } from './api-error';
import { AiProviderError } from '../../ai/provider.types';

function requestIdFrom(req?: Request): string {
  const header = req?.headers['x-request-id'];
  return typeof header === 'string' && header ? header : 'unknown';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: unknown;

    if (exception instanceof ApiError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof AiProviderError) {
      status =
        exception.code === 'NO_PROVIDER_AVAILABLE' || exception.code === 'NO_HEALTHY_PROVIDER'
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.BAD_GATEWAY;
      code = exception.code;
      message = exception.message;
      details = { provider: exception.provider };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (status === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = exception.message;
      } else if (typeof body === 'object' && body !== null && 'message' in body) {
        const raw = (body as { message?: unknown }).message;
        message = Array.isArray(raw) ? raw.join(', ') : String(raw ?? exception.message);
        code = 'VALIDATION_FAILED';
        details = Array.isArray(raw) ? raw : undefined;
      } else {
        message = exception.message;
        code = exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      if (message === 'Cannot GET' || message.startsWith('Cannot ')) {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const format: ErrorFormat = {
      error: {
        code,
        message,
        status,
        requestId: requestIdFrom(request),
        path: request.url,
        timestamp: new Date().toISOString(),
        details,
      },
    };

    response.status(status).json(format);
  }
}