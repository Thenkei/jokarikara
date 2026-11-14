import { dbToGain, REVERB_HIGHPASS_HZ, REVERB_RETURN_DB, REVERB_SEND_FLOOR_DB } from "./mix";
import {
  DEFAULT_IMPULSE_RESPONSE,
  generateImpulseResponse,
  unitEnergyGain,
} from "./reverb";

/**
 * Shared reverb send/return, built once per AudioContext:
 *
 *   send(s) -> high-pass -> convolver (procedural IR) -> return gain -> output
 *
 * The high-pass keeps sub/bass (heartbeat thump, fail growl) out of the tail
 * so it never turns to mud. The return is calibrated to unit IR energy, so a
 * send of X dB means "tail energy ~X dB under the dry".
 */
export interface ReverbBus {
  /**
   * Send node into the bus at `db` (one long-lived node per distinct amount,
   * so playing a sound allocates nothing extra), or `null` when the amount is
   * at or below the floor (fully dry) or the node cannot be built.
   */
  send(db: number): GainNode | null;
}

/** Runs non-urgent setup work later, off the current (user-gesture) task. */
export type DeferTask = (task: () => void) => void;

/**
 * Upper bound before an idle callback is forced: the IR is ~7 ms of CPU, so
 * a busy main thread still gets the room within a fraction of a second.
 */
export const REVERB_BUILD_TIMEOUT_MS = 200;

/**
 * Default `DeferTask`: an idle callback (with a timeout so it always runs),
 * falling back to a macrotask where `requestIdleCallback` is missing (Safari).
 */
export const deferToIdle: DeferTask = (task) => {
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(() => task(), { timeout: REVERB_BUILD_TIMEOUT_MS });
    return;
  }
  setTimeout(task, 0);
};

const safeDisconnect = (...nodes: (AudioNode | null)[]): void => {
  for (const node of nodes) {
    try {
      node?.disconnect();
    } catch {
      // Never connected / already released.
    }
  }
};

/**
 * Build the reverb into `output`. Returns `null` (dry mix) when the browser
 * lacks convolution or anything fails: audio failures never reach gameplay.
 */
export const createReverbBus = (
  ctx: BaseAudioContext,
  output: AudioNode,
): ReverbBus | null => {
  if (
    typeof ctx.createConvolver !== "function" ||
    typeof ctx.createBuffer !== "function" ||
    typeof ctx.createBiquadFilter !== "function"
  ) {
    return null;
  }

  let highpass: BiquadFilterNode | null = null;
  let convolver: ConvolverNode | null = null;
  let returnGain: GainNode | null = null;
  try {
    const channels = generateImpulseResponse({
      ...DEFAULT_IMPULSE_RESPONSE,
      sampleRate: ctx.sampleRate,
    });
    const buffer = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
    channels.forEach((data, ch) => buffer.getChannelData(ch).set(data));

    highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = REVERB_HIGHPASS_HZ;

    convolver = ctx.createConvolver();
    // Level is calibrated here, not by the browser's own (implementation
    // specific) normalisation. Must be set before assigning the buffer.
    convolver.normalize = false;
    convolver.buffer = buffer;

    returnGain = ctx.createGain();
    returnGain.gain.value = unitEnergyGain(channels) * dbToGain(REVERB_RETURN_DB);

    highpass.connect(convolver);
    convolver.connect(returnGain);
    returnGain.connect(output);
  } catch (error) {
    console.warn("Reverb unavailable, mixing dry", error);
    safeDisconnect(highpass, convolver, returnGain);
    return null;
  }

  const input = highpass;
  const sends = new Map<number, GainNode | null>();
  return {
    send(db: number): GainNode | null {
      if (!Number.isFinite(db) || db <= REVERB_SEND_FLOOR_DB) return null;
      const cached = sends.get(db);
      if (cached !== undefined) return cached;
      let node: GainNode | null = null;
      try {
        node = ctx.createGain();
        node.gain.value = dbToGain(db);
        node.connect(input);
      } catch (error) {
        console.warn("Reverb send unavailable", error);
        safeDisconnect(node);
        node = null;
      }
      // Failures are cached too: no retry storm from the per-sound path.
      sends.set(db, node);
      return node;
    },
  };
};
