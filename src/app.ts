import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import path from 'path';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import commentRoutes from './routes/comments';
import notificationRoutes from './routes/notifications';
import dashboardRoutes from './routes/dashboard';
import searchRoutes from './routes/search';
import attachmentRoutes from './routes/attachments';
import aiRoutes from './routes/ai';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

const app = express();

// Security & parsing
app.use(helmet());
const corsOrigin = process.env.CORS_ORIGIN?.trim() || '*';
app.use(cors({ origin: corsOrigin, credentials: corsOrigin !== '*' }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', attachmentRoutes);
app.use('/api/ai', aiRoutes);

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
