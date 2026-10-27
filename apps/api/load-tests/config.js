// AWS ALB hostname (Route53 alias, see infrastructure/aws/evia-beta/dns.tf).
// Override with WS_URL for a one-off run.
export const WS_URL = process.env.WS_URL || 'wss://beta.api.okuvu.in/ws';
export const LOAD_TEST_KEY = process.env.LOAD_TEST_KEY;
export const VUS = 50;
export const RAMP_UP = '2m';
export const HOLD = '5m';
export const RAMP_DOWN = '1m';
export const INTER_TURN_MIN_MS = 6000;
export const INTER_TURN_MAX_MS = 10000;
export const TURNS_PER_SESSION = 10;
