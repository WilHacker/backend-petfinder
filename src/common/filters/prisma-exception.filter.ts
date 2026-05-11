import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

type PrismaError = Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError;

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: PrismaError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.handleKnownError(exception, response);
      return;
    }

    // PrismaClientValidationError — payload mal formado que llega a la capa de BD
    this.logger.error('Prisma validation error', exception.message);
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Los datos enviados no son válidos',
    });
  }

  private handleKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
    response: Response,
  ): void {
    switch (exception.code) {
      case 'P2002':
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: this.buildUniqueMessage(exception),
        });
        break;

      case 'P2003':
        response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'El recurso relacionado no existe',
        });
        break;

      case 'P2014':
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'El registro ya está asociado a esta relación',
        });
        break;

      case 'P2025':
        response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'El registro no fue encontrado',
        });
        break;

      default:
        this.logger.error(`Prisma error no manejado [${exception.code}]`, exception.message);
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: 'Error interno de base de datos',
        });
    }
  }

  private buildUniqueMessage(exception: Prisma.PrismaClientKnownRequestError): string {
    const fields = exception.meta?.target as string[] | string | undefined;
    const fieldList = Array.isArray(fields) ? fields : [fields ?? ''];

    if (fieldList.includes('correo_electronico')) return 'El correo electrónico ya está registrado';
    if (fieldList.includes('ci')) return 'El CI ya está registrado';
    if (fieldList.includes('token_acceso')) return 'El QR ya está asignado a otra mascota';
    if (fieldList.some((f) => f.includes('mascota'))) return 'Esta mascota ya está registrada';

    return 'Ya existe un registro con estos datos';
  }
}
