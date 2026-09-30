import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { realtimeEnabled, userTopic } from '../utils/realtime.js';

const router = Router();

router.get('/api/realtime/topic', authRequired, (req, res) => {
  if (!realtimeEnabled()) return res.json({ enabled: false });
  return res.json({ enabled: true, topic: userTopic(req.user.id) });
});

export default router;
