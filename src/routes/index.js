import categoriesRouter from './categories.js';
import healthRouter from './health.js';
import adminRouter from './admin.js';
import miscRouter from './misc.js';
import sellerRouter from './seller.js';
import migrationRouter from './migration.js';
import authRouter from './auth.js';
import socialRouter from './social.js';
import productsRouter from './products.js';
import ordersRouter from './orders.js';
import sellerDashboardRouter from './seller-dashboard.js';
import promosRouter from './promos.js';
import analyticsRouter from './analytics.js';
import messagingRouter from './messaging.js';
import offersRouter from './offers.js';
import disputesRouter from './disputes.js';
import orderNotesRouter from './order-notes.js';
import paymentsRouter from './payments.js';
import payoutsRouter from './payouts.js';
import subscriptionsRouter from './subscriptions.js';
import feedRouter from './feed.js';

export function registerRoutes(app) {
  // Routes WITH /api in their path → mount at root
  // Routes WITHOUT /api in their path → mount under '/api'

  // Root-mounted (paths already include /api)
  app.use(healthRouter);
  app.use(adminRouter);
  app.use(sellerRouter);
  app.use(migrationRouter);
  app.use(sellerDashboardRouter);
  app.use(promosRouter);
  app.use(analyticsRouter);
  app.use(messagingRouter);
  app.use(offersRouter);
  app.use(disputesRouter);
  app.use(orderNotesRouter);
  app.use(paymentsRouter);
  app.use(payoutsRouter);
  app.use(subscriptionsRouter);
  app.use(feedRouter);

  // Mounted under /api (paths don't include /api)
  app.use('/api', authRouter);
  app.use('/api', ordersRouter);
  app.use('/api', socialRouter);
  app.use('/api', categoriesRouter);
  app.use('/api', productsRouter);

  // Batch 6: seller, messaging, offers — already have /api prefix
  app.use(sellerDashboardRouter);
  app.use(promosRouter);
  app.use(analyticsRouter);
  app.use(messagingRouter);
  app.use(offersRouter);
  app.use(disputesRouter);
  app.use(orderNotesRouter);

  // Batch 7: payments, payouts, subscriptions, feed — already have /api prefix
  app.use(paymentsRouter);
  app.use(payoutsRouter);
  app.use(subscriptionsRouter);
  app.use(feedRouter);

  // Must be last (includes 404 handler)
  app.use(miscRouter);
}
