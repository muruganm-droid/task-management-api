import { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  res.json({
    ok: true,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? 'SET (' + process.env.DATABASE_URL.substring(0, 20) + '...)' : 'NOT SET',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
    },
  });
}
