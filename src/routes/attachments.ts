import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { upload } from '../middleware/upload';
import * as ctrl from '../controllers/attachments.controller';

const router = Router();
router.use(authenticate);

// Task-scoped attachment routes
router.post('/tasks/:id/attachments', upload.single('file'), (req, res, next) =>
  ctrl.uploadAttachment(req as AuthRequest, res, next)
);
router.get('/tasks/:id/attachments', (req, res, next) =>
  ctrl.listAttachments(req as AuthRequest, res, next)
);

// Attachment-scoped routes
router.delete('/attachments/:aid', (req, res, next) =>
  ctrl.deleteAttachment(req as AuthRequest, res, next)
);
router.get('/attachments/:aid/download', (req, res, next) =>
  ctrl.downloadAttachment(req as AuthRequest, res, next)
);

export default router;
