import categoriesRouter from './categories.js';
import healthRouter from './health.js';
import adminRouter from './admin.js';
import miscRouter from './misc.js';
import sellerRouter from './seller.js';
import migrationRouter from './migration.js';

export function registerRoutes(app) {
  // Low-coupling routes (Batch 1)
  app.use(categoriesRouter);
  app.use(healthRouter);
  app.use(adminRouter);
  app.use(sellerRouter);
  app.use(migrationRouter);
  app.use(miscRouter);  // Must be last (includes 404 handler)
}
