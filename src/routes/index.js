import categoriesRouter from './categories.js';
import healthRouter from './health.js';
import adminRouter from './admin.js';
import miscRouter from './misc.js';
import sellerRouter from './seller.js';
import migrationRouter from './migration.js';
import sellerDashboardRouter from './seller-dashboard.js';
import promosRouter from './promos.js';
import analyticsRouter from './analytics.js';
import messagingRouter from './messaging.js';
import offersRouter from './offers.js';
import disputesRouter from './disputes.js';
import orderNotesRouter from './order-notes.js';

export function registerRoutes(app) {
  // Batch 1: low-coupling routes
  app.use(categoriesRouter);
  app.use(healthRouter);
  app.use(adminRouter);
  app.use(sellerRouter);
  app.use(migrationRouter);

  // Batch 6: seller, messaging, offers
  app.use(sellerDashboardRouter);
  app.use(promosRouter);
  app.use(analyticsRouter);
  app.use(messagingRouter);
  app.use(offersRouter);
  app.use(disputesRouter);
  app.use(orderNotesRouter);

  // Must be last (includes 404 handler)
  app.use(miscRouter);
}
