import { startARScheduler } from '@/lib/cron/ar-scheduler'

// Run in all server environments
if (typeof window === 'undefined') {
  startARScheduler()
}