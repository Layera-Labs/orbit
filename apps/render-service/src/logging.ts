/**
 * One shape for every line this service writes.
 *
 * Before this there were twenty `console.*` calls in three files and three
 * different formats among them: prose with an `[orbit]` prefix, hand-built JSON
 * keyed `event`, and hand-built JSON keyed `evt`. A pipeline can parse one of
 * those. An operator grepping for a request can follow none of them, because
 * nothing carried an identifier connecting a failure to the request that caused
 * it — the access line said a POST returned 500, and the error line said what
 * broke, and joining them meant guessing from timestamps.
 *
 * So: JSON, always, with `t`, `level` and `event` on every line and a `msg` for
 * the prose that used to be the whole message. Everything else is a field. The
 * point is not the format, it is that `rid` can appear on both halves.
 *
 * Deliberately not a logging library. There are three call shapes and one sink;
 * pino would bring a dependency, a transport and a configuration surface to
 * replace fifteen lines, and the thing that makes logs useful here is the
 * request id, not the writer.
 */
import { randomBytes } from "node:crypto";

/**
 * Short, random, and OURS.
 *
 * Not taken from an inbound `X-Request-Id`. That header is client-controlled,
 * so honouring it would let a caller put chosen text into the logs and give two
 * unrelated requests the same identifier. A gateway that wants end-to-end
 * correlation can log the id from the `X-Request-Id` this service RETURNS —
 * that direction needs no trust.
 *
 * Eight bytes: enough that a collision inside one log-retention window is not a
 * thing that happens, short enough to read out over a call.
 */
export function newRequestId(): string {
  return randomBytes(8).toString("hex");
}

export type LogFields = Record<string, unknown>;

function emit(
  level: "info" | "warn" | "error",
  event: string,
  fields: LogFields,
): void {
  /*
   * `t`, `level` and `event` lead every line, and the caller cannot displace
   * them. A field named `event` silently overwriting the event is precisely the
   * sort of thing that gets found during an incident rather than before one —
   * `event` is the key every query filters on.
   *
   * The reserved names are destructured out rather than the fields being
   * spread first, because spreading first would fix the precedence and put the
   * three keys that matter most at the END of the line, after whatever the
   * caller passed. Both properties are wanted: they lead, and they win.
   */
  const { t: _t, level: _level, event: _event, ...rest } = fields;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    ...rest,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logInfo = (event: string, fields: LogFields = {}): void =>
  emit("info", event, fields);
export const logWarn = (event: string, fields: LogFields = {}): void =>
  emit("warn", event, fields);
export const logError = (event: string, fields: LogFields = {}): void =>
  emit("error", event, fields);

/**
 * What the operator pays, per unit, in cents. Empty by default and that is the
 * point.
 *
 * `ORBIT_PROVIDER_RATES` is JSON keyed `"<provider>:<unit>"`, e.g.
 *   {"runway:video-seconds": 5, "elevenlabs:characters": 0.003}
 *
 * A price belongs to the operator's contract, not to this codebase. Rates
 * differ per plan, change without notice, and a confident-looking wrong number
 * in a log is worse than no number — someone will build a margin calculation on
 * it. So `costCents` appears only where the operator has said what they pay,
 * and the measured `units` is always there so any estimate can be recomputed
 * from a real invoice afterwards.
 */
function parseRates(): Record<string, number> {
  const raw = process.env.ORBIT_PROVIDER_RATES;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed))
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    return out;
  } catch {
    logWarn("provider-rates-invalid", {
      msg: "ORBIT_PROVIDER_RATES is not valid JSON — provider cost will not be estimated",
    });
    return {};
  }
}
let rates: Record<string, number> | undefined;

/** Usage as this service reports it: what the provider measured, plus a price. */
export interface ProviderCall {
  provider: string;
  model?: string;
  ms: number;
  units?: number;
  unit?: string;
}

/**
 * One line per provider call, with the request that caused it.
 *
 * This is the number that answers "why is generation slow" and "what did that
 * cost" — neither of which was answerable at all before, because a provider
 * call produced no log of its own and the only timing was the whole request.
 */
export function logProviderCall(
  op: string,
  usage: ProviderCall,
  rid?: string,
): void {
  rates ??= parseRates();
  const key = usage.unit ? `${usage.provider}:${usage.unit}` : undefined;
  const rate = key ? rates[key] : undefined;
  const costCents =
    rate != null && usage.units != null
      ? Math.round(rate * usage.units * 1000) / 1000
      : undefined;
  logInfo("provider-call", {
    ...(rid ? { rid } : {}),
    op,
    ...usage,
    ...(costCents == null ? {} : { costCents }),
  });
}

/**
 * An error as fields rather than as a string.
 *
 * A stack is the useful part and it is multi-line, which is exactly what breaks
 * a line-oriented pipeline — so it goes in a field where the JSON encoding
 * escapes it, instead of being concatenated into a message that then spans
 * fifteen lines and loses its `rid` on fourteen of them.
 */
export function errFields(err: unknown): LogFields {
  if (err instanceof Error)
    return { err: err.message, ...(err.stack ? { stack: err.stack } : {}) };
  return { err: String(err) };
}
