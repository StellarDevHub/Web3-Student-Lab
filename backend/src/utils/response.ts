import { Response } from 'express';

export const sendSuccess = (res: Response, data: any) => {
  return res.status(200).json({
    status: 'success',
    ...data,
  });
};

export const sendError = (res: Response, error: any, statusCode: number = 500) => {
  return res.status(statusCode).json({
    status: 'error',
    message: error.message || 'An error occurred',
    ...(process.env.NODE_ENV === 'development' && { error: error.stack }),
  });
};

export class ApiResponse {
  static success(message: string, data?: any) {
    return {
      status: 'success',
      message,
      ...(data && { data }),
    };
  }

  static error(message: string, errors?: any) {
    return {
      status: 'error',
      message,
      ...(errors && { errors }),
    };
  }
}
