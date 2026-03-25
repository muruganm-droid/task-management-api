import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/auth.controller';

const router = Router();

const authLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/logout', ctrl.logout);
router.post('/refresh', ctrl.refresh);
router.post('/forgot-password', authLimiter, ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);

export default router;
