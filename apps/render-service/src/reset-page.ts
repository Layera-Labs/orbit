/**
 * The password-reset page the service serves at `GET /reset`.
 *
 * WHY THE SERVICE SERVES A PAGE AT ALL. The reset token is a signed JWT —
 * ~300 characters. Emailing it as "paste this code into the app" is technically
 * a working flow and practically an unusable one: no one selects a 300-character
 * blob out of a mail client on a phone, and every mail client hard-wraps it, so
 * what comes back off the clipboard carries newlines the token no longer
 * survives. The alternatives were a deep link (the app has no URL scheme, and a
 * link that opens nothing is worse than none) or a page on `apps/web` (not
 * deployed). The API is deployed, is already on HTTPS, and is the one origin
 * that can both hold the form and answer it — so it serves the page itself.
 *
 * THE TOKEN IS NEVER INTERPOLATED INTO THIS MARKUP. It arrives in the query
 * string and is read client-side out of `location.search`. That makes the
 * response a CONSTANT — there is no injection surface here at all, which is the
 * same rule `packages/video`'s SVG builder follows for the same reason. Three
 * headers do the rest of the work, and each is load-bearing:
 *
 *   - `Referrer-Policy: no-referrer` — the token is IN THE URL. Any outbound
 *     request from this page would otherwise carry it in the `Referer` header.
 *   - `Content-Security-Policy` with no `connect-src` beyond `'self'` — so even
 *     if something were injected it could not post the token anywhere else.
 *     `'unsafe-inline'` is required because the page is one self-contained file
 *     with no separate assets to hash; it is safe precisely because the file is
 *     a constant.
 *   - `frame-ancestors 'none'` — a reset form is a clickjacking target.
 *
 * The page also strips the token from the address bar with `replaceState` as
 * soon as it has read it, so it does not sit in browser history or get shared
 * when someone copies the URL.
 */

/**
 * Orbit's mark, drawn inline: a planet, a tilted ring, and one dot on the ring.
 * Static — the animated version belongs in the app, and nothing here may depend
 * on motion running.
 */
const MARK = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
  <ellipse cx="20" cy="20" rx="18" ry="7" transform="rotate(-24 20 20)"
           fill="none" stroke="#5b4bff" stroke-width="1.6" opacity=".55"/>
  <circle cx="20" cy="20" r="8.5" fill="#5b4bff"/>
  <circle cx="35.4" cy="13.2" r="2.4" fill="#8b83ff"/>
</svg>`;

/**
 * The same ring as the mark, drawn once at page scale and bled off two edges so
 * the form sits inside the orbit rather than on a flat field.
 *
 * It is the brand's own geometry rather than atmosphere-by-default: not a
 * radial glow behind the content, not drifting blurred blobs, not graph paper.
 * One stroked ellipse, at the mark's own -24 degrees, quiet enough to read as a
 * surface and not as an object competing with the form.
 */
const FIELD = `<svg class="field" viewBox="0 0 900 900" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
  <ellipse cx="450" cy="450" rx="430" ry="168" transform="rotate(-24 450 450)"
           fill="none" stroke="#5b4bff" stroke-width="1.25" opacity=".16"/>
  <ellipse cx="450" cy="450" rx="300" ry="117" transform="rotate(-24 450 450)"
           fill="none" stroke="#5b4bff" stroke-width="1.25" opacity=".08"/>
</svg>`;

/**
 * One string, no template holes. Deliberately a plain `const` and not a
 * function taking anything: the moment this takes an argument, someone will
 * pass it the token.
 */
export const RESET_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Set a new password &middot; Orbit</title>
<style>
  :root {
    color-scheme: dark;
    --ink: #f4f4f6;
    --ink2: #a7a7b3;
    --bg: #0e0e11;
    --card: #17171a;
    --line: #2a2a30;
    --accent: #5b4bff;
    --bad: #ff6b6b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    background: var(--bg);
    color: var(--ink);
    font: 400 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /*
   * Sized off the LONGER edge and pulled left of the column, so the ring bleeds
   * off two sides at every viewport instead of sitting as a symmetric halo
   * centred behind the form — which is the version that reads as machine-made.
   */
  .field {
    position: fixed;
    left: 50%;
    top: 50%;
    width: max(150vw, 150vh);
    height: max(150vw, 150vh);
    transform: translate(-62%, -46%);
    pointer-events: none;
    z-index: 0;
  }
  main { position: relative; z-index: 1; width: 100%; max-width: 380px; }
  .mark { width: 52px; height: 52px; display: block; margin: 0 0 26px; }
  h1 { margin: 0 0 8px; font-size: 27px; line-height: 1.2; font-weight: 650; letter-spacing: -0.018em; }
  .sub { margin: 0 0 28px; color: var(--ink2); font-size: 15px; }
  form { display: grid; gap: 14px; }
  label { display: grid; gap: 7px; font-size: 13px; color: var(--ink2); }
  input {
    width: 100%;
    padding: 13px 14px;
    border: 1px solid var(--line);
    border-radius: 11px;
    background: var(--card);
    color: var(--ink);
    font: inherit;
    font-size: 16px; /* under 16px iOS Safari zooms the whole page on focus */
  }
  input:focus-visible { outline: none; border-color: var(--accent); }
  button {
    margin-top: 4px;
    padding: 14px 16px;
    border: 0;
    border-radius: 11px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: .45; cursor: default; }
  .note { margin: 0; font-size: 14px; }
  .note.bad { color: var(--bad); }
  .foot { margin: 26px 0 0; font-size: 13px; color: var(--ink2); }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${FIELD}
<main>
  ${MARK}
  <h1 id="title">Set a new password</h1>
  <p class="sub" id="sub">Choose a new password for your Orbit account.</p>

  <form id="form" novalidate>
    <label>New password
      <input id="pw" type="password" autocomplete="new-password" minlength="8" required>
    </label>
    <label>Confirm password
      <input id="pw2" type="password" autocomplete="new-password" minlength="8" required>
    </label>
    <p class="note bad" id="err" hidden></p>
    <button id="go" type="submit">Update password</button>
  </form>

  <p class="foot" id="foot">Passwords must be at least 8 characters. This link expires an hour after it was sent and works once.</p>
</main>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('token') || '';
  var form = document.getElementById('form');
  var err = document.getElementById('err');
  var go = document.getElementById('go');

  /*
   * The rules footnote belongs to the FORM, so it leaves with it. Left standing
   * it tells someone who has just finished, or who has no form at all, how long
   * their link lasts — which reads as a page that has not noticed what happened.
   */
  function retire(title, sub) {
    form.hidden = true;
    document.getElementById('foot').hidden = true;
    document.getElementById('title').textContent = title;
    document.getElementById('sub').textContent = sub;
  }

  // Out of the address bar, out of history, out of anything the user copies.
  if (token && history.replaceState) history.replaceState(null, '', location.pathname);

  function fail(msg) { err.textContent = msg; err.hidden = false; }

  if (!token)
    retire(
      'This link is incomplete',
      'It is missing its reset code. Open the link from your email again, or ask for a new one from the app.'
    );

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    var pw = document.getElementById('pw').value;
    var pw2 = document.getElementById('pw2').value;
    if (pw.length < 8) return fail('Use at least 8 characters.');
    if (pw !== pw2) return fail('Those two passwords do not match.');

    go.disabled = true;
    go.textContent = 'Updating\\u2026';
    fetch('/v1/auth/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token, password: pw })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    }).then(function (r) {
      if (r.ok) {
        // The response carries a session token. This page deliberately drops it:
        // the user signs in on their own device, and a session minted in a
        // browser reached from an email is not one worth keeping.
        retire('Password updated', 'Sign in with your new password in the Orbit app.');
        return;
      }
      go.disabled = false;
      go.textContent = 'Update password';
      var kind = r.data && r.data.kind;
      fail(
        kind === 'invalid-token'
          ? 'This reset link is invalid, has expired, or has already been used. Ask for a new one from the app.'
          : kind === 'weak-password'
            ? 'Use at least 8 characters.'
            : (r.data && r.data.error) || 'Something went wrong. Try again.'
      );
    }).catch(function () {
      go.disabled = false;
      go.textContent = 'Update password';
      fail('Could not reach the server. Check your connection and try again.');
    });
  });
})();
</script>
</body>
</html>
`;

/**
 * Headers the page must be served with. Split out so the route stays one line
 * and so the test can assert them without scraping the response.
 */
export const RESET_PAGE_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  // No `connect-src` beyond self: the token cannot leave this origin.
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
  // The token rides in the query string, so a referrer would carry it out.
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};
