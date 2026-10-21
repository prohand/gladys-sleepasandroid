// -----------------------------------------------------------------------------
// The sleepers' states, kept in /data across restarts.
//
// An update of the integration, or a reboot of Gladys, in the middle of the
// night must not lose the start of the session: the sleep duration is
// computed from it when the tracking stops in the morning. /data is the one
// writable path of the container (read-only rootfs).
//
// Writes are coalesced (one per second at most) and atomic (temp file +
// rename): a power cut mid-write leaves the previous file, never half a JSON.
// A file that cannot be read is logged and replaced, never fatal.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { initialState } from './tracker.js';

const logger = createLogger({ name: 'store' });

const FILE_NAME = 'sleepers.json';
const WRITE_DELAY_MS = 1_000;

export class StateStore {
  /**
   * @param {string} [directory] defaults to $DATA_DIR, then /data
   */
  constructor(directory = process.env.DATA_DIR || '/data') {
    this.file = path.join(directory, FILE_NAME);
    this.states = {};
    this.timer = null;
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.states = parsed;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Could not read ${this.file} (${err.message}): starting afresh`);
      }
    }
    return this;
  }

  /** The state of a sleeper, a fresh one when none is known. */
  get(sleeperId) {
    return { ...initialState(), ...this.states[sleeperId] };
  }

  set(sleeperId, state) {
    this.states[sleeperId] = state;
    this.scheduleWrite();
  }

  scheduleWrite() {
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.writing = this.writing.then(() => this.write());
    }, WRITE_DELAY_MS);
  }

  async write() {
    const temporary = `${this.file}.tmp`;
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(temporary, JSON.stringify(this.states));
      await rename(temporary, this.file);
    } catch (err) {
      logger.warn(`Could not save the sleepers' states (${err.message})`);
    }
  }

  /** Write now what is pending (shutdown, tests). */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.writing = this.writing.then(() => this.write());
    }
    await this.writing;
  }
}
