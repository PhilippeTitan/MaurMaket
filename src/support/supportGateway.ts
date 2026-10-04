/**
 * Future Support website/API connection point.
 *
 * Keep app features dependent on this small contract instead of calling a
 * Support website directly. Until that service exists, callers must render an
 * explicit unavailable state; do not report a case as submitted.
 */
export type SupportCaseContext = {
  source: string;
  subject: string;
  orderId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type SupportCaseResult =
  | { status: 'created'; caseId: string }
  | { status: 'not_connected' };

export interface SupportGateway {
  createCase(context: SupportCaseContext): Promise<SupportCaseResult>;
}

/** Plug in the real authenticated Support API adapter when the website ships. */
export const supportGateway: SupportGateway = {
  async createCase(_context) {
    return { status: 'not_connected' };
  },
};
