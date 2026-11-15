export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { gatewayLifecycle } = await import('./lib/gateway/server/lifecycle');
    gatewayLifecycle.refresh();
    process.prependOnceListener('SIGTERM', () => gatewayLifecycle.setStatus('draining'));
    process.prependOnceListener('SIGINT', () => gatewayLifecycle.setStatus('draining'));
  }
}
