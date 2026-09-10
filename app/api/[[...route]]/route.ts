import { handle } from 'hono/vercel';
import app from '@/api/index';

// Export Next.js HTTP method handlers bound to Hono instance
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
