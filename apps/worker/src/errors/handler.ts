import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode =
    'statusCode' in error ? (error as FastifyError).statusCode ?? 500 : 500;

  request.log.error({ err: error }, 'Unhandled error');

  const body: ErrorResponse = {
    error: {
      code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
      message: statusCode >= 500 ? 'An unexpected error occurred' : error.message,
    },
  };

  reply.status(statusCode).send(body);
}
