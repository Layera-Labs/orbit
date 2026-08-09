import {
  DEFAULT_COSTS,
  InsufficientCreditsError,
  Ledger,
  meter,
  type AccountId,
  type CostTable,
} from '@layera-labs/billing';
import type { GenImageRequest, GenResult, GenVideoRequest, MediaProvider, TTSRequest } from './types';

export interface GenerationServiceOptions {
  /** Override the per-operation credit costs. */
  costs?: CostTable;
}

/**
 * Wraps a `MediaProvider` with credit metering. Each call checks the account
 * can afford the operation *before* calling the provider (so it never runs for
 * free), and debits the ledger *after* a successful generation (so a failed
 * provider call isn't charged).
 */
export class GenerationService {
  private costs: CostTable;

  constructor(
    private provider: MediaProvider,
    private ledger: Ledger,
    opts: GenerationServiceOptions = {},
  ) {
    this.costs = opts.costs ?? DEFAULT_COSTS;
  }

  private async ensureAffordable(account: AccountId, op: string): Promise<void> {
    const cost = this.costs[op];
    if (cost == null) throw new Error(`No cost configured for operation: ${op}`);
    if (!(await this.ledger.canAfford(account, cost))) {
      throw new InsufficientCreditsError(account, cost, await this.ledger.balance(account));
    }
  }

  async generateImage(account: AccountId, req: GenImageRequest): Promise<GenResult> {
    if (!this.provider.generateImage) throw new Error('provider does not support generateImage');
    await this.ensureAffordable(account, 'generate_image');
    const result = await this.provider.generateImage(req);
    await meter(this.ledger, account, 'generate_image', this.costs, { prompt: req.prompt });
    return result;
  }

  async generateVideo(account: AccountId, req: GenVideoRequest): Promise<GenResult> {
    if (!this.provider.generateVideo) throw new Error('provider does not support generateVideo');
    // Video with a generated sound effect costs more than a silent clip.
    const op = req.audio ? 'generate_video' : 'generate_video_muted';
    await this.ensureAffordable(account, op);
    const result = await this.provider.generateVideo(req);
    await meter(this.ledger, account, op, this.costs, { prompt: req.prompt, audio: !!req.audio });
    return result;
  }

  async tts(account: AccountId, req: TTSRequest): Promise<GenResult> {
    if (!this.provider.tts) throw new Error('provider does not support tts');
    await this.ensureAffordable(account, 'tts');
    const result = await this.provider.tts(req);
    await meter(this.ledger, account, 'tts', this.costs, { chars: req.text.length });
    return result;
  }
}
