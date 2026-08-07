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
