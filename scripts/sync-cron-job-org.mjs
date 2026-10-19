import 'dotenv/config';
import { getScheduledJobManifest } from '../src/jobs/index.js';

const API_BASE = 'https://api.cron-job.org';
const APP_BASE = (process.env.PRODUCTION_URL || 'https://maurmaket.vercel.app').replace(/\/+$/, '');
const API_KEY = process.env.CRONJOB_API_KEY;
const schedulerSecret = process.env.JOB_SCHEDULER_SECRET;
const enabled = process.argv.includes('--enable');
const titlePrefix = 'MaurMaket job: ';

if (!API_KEY) throw new Error('CRONJOB_API_KEY is required in the local environment');
if (!schedulerSecret || schedulerSecret.length < 32) {
  throw new Error('Set JOB_SCHEDULER_SECRET to a unique random value of at least 32 characters');
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`cron-job.org API ${options.method || 'GET'} ${path} returned HTTP ${response.status}`);
  if (response.status === 204) return {};
  return response.json();
}

function fieldValues(field, min, max) {
  if (field === '*') return [-1];
  const every = field.match(/^\*\/(\d+)$/);
  if (every) {
    const step = Number(every[1]);
    return Array.from({ length: Math.ceil((max - min + 1) / step) }, (_, index) => min + index * step);
  }
  return field.split(',').map(Number);
}

function toSchedule(cron, timezone) {
  const [minute, hour, monthDay, month, weekDay] = cron.trim().split(/\s+/);
  if (!weekDay) throw new Error(`Unsupported cron expression: ${cron}`);
  return {
    timezone,
    expiresAt: 0,
    minutes: fieldValues(minute, 0, 59),
    hours: fieldValues(hour, 0, 23),
    mdays: fieldValues(monthDay, 1, 31),
    months: fieldValues(month, 1, 12),
    wdays: fieldValues(weekDay, 0, 6),
  };
}

const existingResponse = await request('/jobs');
if (existingResponse.someFailed) throw new Error('cron-job.org returned an incomplete job list; refusing to create duplicates');
const existingByTitle = new Map(
  existingResponse.jobs
    .filter((job) => job.title?.startsWith(titlePrefix))
    .map((job) => [job.title, job])
);

const manifest = getScheduledJobManifest();
for (const [index, definition] of manifest.entries()) {
  const title = `${titlePrefix}${definition.name}`;
  const current = existingByTitle.get(title);
  const job = {
    title,
    url: `${APP_BASE}/api/internal/jobs/${encodeURIComponent(definition.name)}`,
    enabled: enabled || Boolean(current?.enabled),
    saveResponses: false,
    requestTimeout: 55,
    requestMethod: 1,
    redirectSuccess: false,
    schedule: toSchedule(definition.cron, definition.timezone),
    extendedData: {
      headers: {
        'Content-Type': 'application/json',
        'X-MaurMaket-Cron-Secret': schedulerSecret,
      },
      body: JSON.stringify({ source: 'cron-job.org' }),
    },
    notification: {
      onFailure: true,
      onFailureCount: 2,
      onSuccess: true,
      onDisable: true,
    },
  };

  if (current) {
    await request(`/jobs/${current.jobId}`, {
      method: 'PATCH',
      body: JSON.stringify({ job }),
    });
    console.log(`${enabled ? 'Enabled/synced' : 'Synced'} ${definition.name} (job ${current.jobId})`);
  } else {
    const result = await request('/jobs', {
      method: 'PUT',
      body: JSON.stringify({ job }),
    });
    console.log(`Created disabled ${definition.name} (job ${result.jobId})`);
  }

  // cron-job.org limits job creation to five requests per minute.
  if (index < manifest.length - 1) await new Promise((resolve) => setTimeout(resolve, 12_500));
}

console.log(enabled
  ? 'All MaurMaket jobs are enabled.'
  : 'Jobs are configured but disabled. Deploy the authenticated Vercel endpoint, set JOB_SCHEDULER_SECRET there, then rerun with --enable.');
