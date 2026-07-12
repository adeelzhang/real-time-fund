# Apex Domain Redirect Design

## Goal

Make `https://myfunds.cc` work without a Cloudflare 525 error and permanently redirect every request to the canonical `https://www.myfunds.cc` URL.

## Current State

- Cloudflare proxies `myfunds.cc`, `www.myfunds.cc`, and `console.myfunds.cc` to `154.64.224.107`.
- `www.myfunds.cc` and `console.myfunds.cc` return HTTP 200.
- The active Caddyfile has site blocks for `www.myfunds.cc` and `console.myfunds.cc`, but no block for `myfunds.cc`.
- Caddy therefore does not manage a TLS certificate for `myfunds.cc`, and Cloudflare returns HTTP 525 during the origin TLS handshake.

## Change

Add this independent site block to `/opt/sub2api/deploy/caddy/Caddyfile`:

```caddyfile
myfunds.cc {
    redir https://www.myfunds.cc{uri} permanent
}
```

The redirect preserves the request path and query string through Caddy's `{uri}` placeholder and returns HTTP 308, Caddy's `permanent` redirect status. Existing `www` and `console` routes remain unchanged.

## Deployment

1. Create a timestamped backup of the current Caddyfile.
2. Insert the new site block.
3. Run `caddy validate` inside the running `sub2api-caddy` container.
4. Reload Caddy without restarting the dependent application containers.
5. Wait for Caddy to obtain the `myfunds.cc` certificate.

## Verification

- Confirm Caddy reports successful certificate issuance for `myfunds.cc`.
- Confirm `https://myfunds.cc/` redirects to `https://www.myfunds.cc/`.
- Confirm a path and query string such as `/test?a=1` are preserved.
- Confirm `https://www.myfunds.cc` and `https://console.myfunds.cc` still return HTTP 200.

## Rollback

Restore the timestamped Caddyfile backup, validate it, and reload Caddy. No DNS, application code, container image, or application data changes are involved.
