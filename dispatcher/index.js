/**
 * VidyaSetu — Workers for Platforms (WfP) dynamic dispatch worker.
 *
 * The wildcard route '*.pragnya.nasven.com' points here. This worker extracts the
 * school slug from the request hostname and dispatches to the user worker with that
 * name inside the dispatch namespace:
 *
 *   greenwood.pragnya.nasven.com -> env.DISPATCHER.get("greenwood")
 *
 * The apex domain ('pragnya.nasven.com') is served by the shared 'school-management'
 * worker, so only subdomain routing is needed here.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();

    const baseDomain = (env.DISPATCH_BASE_DOMAIN || 'pragnya.nasven.com').toLowerCase();
    if (!hostname.endsWith('.' + baseDomain)) {
      return new Response('Not found', { status: 404 });
    }

    const subdomain = hostname.slice(0, -(baseDomain.length + 1)).split('.').pop();
    if (!subdomain || subdomain === 'www') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const userWorker = env.DISPATCHER.get(subdomain);
      return await userWorker.fetch(request);
    } catch (err) {
      const message = String((err && err.message) || err);
      if (message.includes('Worker not found')) {
        return new Response('Not found', { status: 404 });
      }
      console.error('Dispatch error for subdomain "' + subdomain + '":', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
