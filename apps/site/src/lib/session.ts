/**
 * The name of the cookie holding the portal session.
 *
 * In its own module rather than in the proxy route, because a Next route
 * handler may only export the HTTP verbs and a fixed set of config keys —
 * anything else is a build error. It also wants to be readable by the sign-in
 * flow that sets it, which must not import a route handler to learn it.
 *
 * httpOnly, so client JavaScript can never read it: the token authorises
 * minting API keys that bill real credits, and the whole point of proxying
 * through the server is that an XSS cannot walk off with it.
 */
export const SESSION_COOKIE = 'orbit_session';
