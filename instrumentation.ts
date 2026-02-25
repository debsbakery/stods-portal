export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run cron jobs in production
    if (process.env.NODE_ENV === 'production') {
      try {
        const { startARScheduler } = await import('./lib/cron/ar-scheduler')
        
        startARScheduler()
        
        console.log('✅ Cron jobs initialized')
      } catch (error) {
        console.error('❌ Failed to initialize cron jobs:', error)
      }
    } else {
      console.log('⏭️ Skipping cron jobs in development')
    }
  }
}