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
  // All route modules define paths like '/orders', '/products', etc.
  // The client sends requests to '/api/orders', so we mount under '/api'.
  app.use('/api', categoriesRouter);
  app.use('/api', healthRouter);
  app.use('/api', adminRouter);
  app.use('/api', sellerRouter);
  app.use('/api', migrationRouter);

  // Auth routes
  app.use('/api', authRouter);

  // Social routes
  app.use('/api', socialRouter);

  // Product routes
  app.use('/api', productsRouter);

  // Order routes
  app.use('/api', ordersRouter);

  // Batch 6: seller, messaging, offers
  app.use('/api', sellerDashboardRouter);
  app.use('/api', promosRouter);
  app.use('/api', analyticsRouter);
  app.use('/api', messagingRouter);
  app.use('/api', offersRouter);
  app.use('/api', disputesRouter);
  app.use('/api', orderNotesRouter);

  // Batch 7: payments, payouts, subscriptions, feed
  app.use('/api', paymentsRouter);
  app.use('/api', payoutsRouter);
  app.use('/api', subscriptionsRouter);
  app.use('/api', feedRouter);

  // Must be last (includes 404 handler)
  app.use('/api', miscRouter);
}
