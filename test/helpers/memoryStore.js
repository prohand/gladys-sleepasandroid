// The state store without the disk.
import { initialState } from '../../src/tracker.js';

export function createMemoryStore(states = {}) {
  return {
    states,
    get(id) {
      return { ...initialState(), ...this.states[id] };
    },
    set(id, state) {
      this.states[id] = state;
    },
    async flush() {},
  };
}
