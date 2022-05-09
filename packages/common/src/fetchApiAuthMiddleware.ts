// **NOTE** This is an untested proof-of-concept for using fetch middleware to handle
// session API key based authentication.

import 'cross-fetch/polyfill';
import { FetchMiddleware, hostMatches, ResponseContext } from './fetchUtil';

export interface SessionAuthDataStore {
  get(host: string): Promise<{ authKey: string } | undefined> | { authKey: string } | undefined;
  set(host: string, authData: { authKey: string }): Promise<void> | void;
  delete(host: string): Promise<void> | void;
}

export interface ApiSessionAuthMiddlewareOpts {
  /** The middleware / API key header will only be added to requests matching this host. */
  host?: RegExp | string;
  /** The http header name used for specifying the API key value. */
  httpHeader?: string;
  authPath: string;
  authRequestMetadata: Record<string, string>;
  authDataStore?: SessionAuthDataStore;
}

export function createApiSessionAuthMiddleware({
  host = /(.*)api(.*)\.stacks\.co$/i,
  httpHeader = 'x-api-key',
  authPath = '/request_key',
  authRequestMetadata = {},
  authDataStore = createInMemoryAuthDataStore(),
}: ApiSessionAuthMiddlewareOpts): FetchMiddleware {
  // Local temporary cache of any previous auth request promise, used so that
  // multiple re-auth requests are not running in parallel.
  let pendingAuthRequest: Promise<{ authKey: string }> | null = null;

  const authMiddleware: FetchMiddleware = {
    pre: async context => {
      // Skip middleware if host does not match pattern
      const reqUrl = new URL(context.url);
      if (!hostMatches(reqUrl.host, host)) return;

      const authData = await authDataStore.get(reqUrl.host);
      if (authData) {
        context.init.headers = setRequestHeader(context.init, httpHeader, authData.authKey);
      }
    },
    post: async context => {
      // Skip middleware if response was successful
      if (context.response.status !== 401) return;

      // Skip middleware if host does not match pattern
      const reqUrl = new URL(context.url);
      if (!hostMatches(reqUrl.host, host)) return;

      // Retry original request after authorization request
      if (!pendingAuthRequest) {
        // Check if for any currently pending auth requests and re-use it to avoid creating multiple in parallel
        pendingAuthRequest = resolveAuthToken(context, authPath, authRequestMetadata)
          .then(async result => {
            // If the request is successfull, add the key to storage.
            await authDataStore.set(reqUrl.host, result);
            return result;
          })
          .finally(() => {
            // When the request is completed (either successful or rejected) remove reference
            pendingAuthRequest = null;
          });
      }
      const { authKey } = await pendingAuthRequest;
      // Retry the request using the new API key auth header.
      context.init.headers = setRequestHeader(context.init, httpHeader, authKey);
      return context.fetch(context.url, context.init);
    },
  };
  return authMiddleware;
}

function createInMemoryAuthDataStore(): SessionAuthDataStore {
  const map = new Map<string, { authKey: string }>();
  const store: SessionAuthDataStore = {
    get: host => {
      return map.get(host);
    },
    set: (host, authData) => {
      map.set(host, authData);
    },
    delete: host => {
      map.delete(host);
    },
  };
  return store;
}

function setRequestHeader(requestInit: RequestInit, headerKey: string, headerValue: string) {
  const headers = new Headers(requestInit.headers);
  headers.set(headerKey, headerValue);
  return headers;
}

async function resolveAuthToken(
  context: ResponseContext,
  authPath: string,
  authRequestMetadata: Record<string, string>
) {
  const reqUrl = new URL(context.url);
  const authEndpoint = new URL(reqUrl.origin);
  authEndpoint.pathname = authPath;
  const authReq = await context.fetch(authEndpoint.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(authRequestMetadata),
  });
  if (authReq.ok) {
    const authRespBody: { auth_key: string } = await authReq.json();
    return { authKey: authRespBody.auth_key };
  } else {
    let respBody = '';
    try {
      respBody = await authReq.text();
    } catch (error) {
      respBody = `Error fetching API auth key: ${authReq.status} - Error fetching response body: ${error}`;
    }
    throw new Error(`Error fetching API auth key: ${authReq.status} - ${respBody}`);
  }
}
