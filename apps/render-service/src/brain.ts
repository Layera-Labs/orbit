import type { Brain } from "@orbit/pipeline";

/**
 * A `Brain` over the OpenAI chat-completions wire format.
 *
 * ## Why the format and not a vendor
 *
 * `chat/completions` is the shape almost every provider now speaks — OpenAI
 * itself, and the long tail of cheaper endpoints that exist precisely by being
 * drop-in compatible with it. So this names no vendor and hardcodes no model:
 * base url, model id and key are all configuration, and switching provider is
 * three environment variables rather than a new file.
 *
 * Hand-rolled over `fetch` rather than pulling in an SDK, for the same reason
 * `storage.ts` signs its own SigV4: this uses one endpoint and one field of the
 * response, and a megabyte of vendor client to reach it would be the larger
 * cost.
 *
 * ## What it deliberately does not do
 *
 * No retries. The planner above it retries a plan the model got WRONG, with
 * the violation quoted back; the step runner above that decides whether a job
 * is worth attempting again and can see whether it has already been paid for.
 * A third retry loop here would multiply against both and is the one that can
 * see the least.
 */

export interface OpenAiCompatibleOptions {
  /** Everything up to but not including `/chat/completions`. */
  baseUrl: string;
  model: string;
  apiKey: string;
  /**
   * Ask the endpoint to guarantee JSON.
   *
   * OFF by default, which is deliberate. `response_format` is an OpenAI
   * extension that compatible endpoints support unevenly, and one that does not
   * recognise it answers 400 — so defaulting it on would turn "the model said
   * something odd", which the planner already repairs, into "the whole
   * generation failed", which it cannot. `extractJson` handles fences and
   * surrounding prose anyway, so this is an optimisation and not a requirement.
   */
  jsonMode?: boolean;
  /**
   * How long to wait. A hung request otherwise holds a generation job for as
   * long as the far end feels like keeping the socket open, and the stale-claim
   * sweep is measured in half-hours.
   */
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

export function openAiCompatibleBrain(opts: OpenAiCompatibleOptions): Brain {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    async complete(prompt: string, o?: { system?: string }): Promise<string> {
      const messages = [
        ...(o?.system ? [{ role: "system", content: o.system }] : []),
        { role: "user", content: prompt },
      ];

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: opts.model,
            messages,
            ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
            ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
            ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        /*
         * The body, truncated, because this is the one place a provider says
         * something useful — an unknown model id, an exhausted quota, an
         * unsupported field. A bare status turns every one of those into "the
         * planner failed" and a debugging session.
         */
        const detail = await res.text().catch(() => "");
        throw new Error(
          `llm ${res.status}: ${detail.slice(0, 400) || res.statusText}`,
        );
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const text = body.choices?.[0]?.message?.content;
      /*
       * An empty completion is refused rather than returned. Handing "" up
       * makes `extractJson` report "the reply contained no JSON", which sends
       * the planner into a retry against a prompt that was never the problem —
       * a filter, a length cap or a refusal, none of which more prompting
       * fixes.
       */
      if (!text || !text.trim())
        throw new Error("llm returned an empty completion");
      return text;
    },
  };
}

/**
 * Build one from the environment, or say plainly that there is none.
 *
 * Returns null rather than throwing, because a render service with no planner
 * configured is a perfectly valid deployment — everything except generation
 * works — and the route that needs one can answer 503 by name.
 */
export function brainFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Brain | null {
  const baseUrl = env.ORBIT_LLM_BASE_URL?.trim();
  const model = env.ORBIT_LLM_MODEL?.trim();
  const apiKey = env.ORBIT_LLM_API_KEY?.trim();
  // Truthiness, not `??`. An empty string is what docker compose passes for an
  // unset variable, and `??` does not fire on it — the same trap that made the
  // password-reset mailer look configured on a box where it was not.
  if (!baseUrl || !model || !apiKey) return null;
  return openAiCompatibleBrain({
    baseUrl,
    model,
    apiKey,
    jsonMode: env.ORBIT_LLM_JSON_MODE === "1",
    ...(env.ORBIT_LLM_TIMEOUT_MS ? { timeoutMs: Number(env.ORBIT_LLM_TIMEOUT_MS) } : {}),
  });
}
