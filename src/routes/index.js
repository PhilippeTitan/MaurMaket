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
  // Batch 1: low-coupling routes
  app.use(categoriesRouter);
  app.use(healthRouter);
  app.use(adminRouter);
  app.use(sellerRouter);
  app.use(migrationRouter);

  // Auth routes (signup, login, profile, password, Google, email verify, deletion, seller onboarding)
  app.use(authRouter);

  // Social routes (addresses, reviews, wishlist, follow, notifications, nearby, storefront)
  app.use(socialRouter);

  // Product routes (list, detail, create, update, delete, co-purchases)
  app.use(productsRouter);

  // Order routes (CRUD, checkout, meetup, escrow, payment retry)
  app.use(ordersRouter);

  // Batch 6: seller, messaging, offers
  app.use(sellerDashboardRouter);
  app.use(promosRouter);
  app.use(analyticsRouter);
  app.use(messagingRouter);
  app.use(offersRouter);
  app.use(disputesRouter);
  app.use(orderNotesRouter);

  // Batch 7: payments, payouts, subscriptions, feed
  app.use(paymentsRouter);
  app.use(payoutsRouter);
  app.use(subscriptionsRouter);
  app.use(feedRouter);

  // Must be last (includes 404 handler)
  app.use(miscRouter);
}
