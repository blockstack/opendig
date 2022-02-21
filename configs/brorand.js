// converted from brorand

let globalRand;

export function rand(len) {
  if (!globalRand) globalRand = new Rand(null);

  return globalRand.generate(len);
}

export class Rand {
  constructor(rand) {
    this.rand = rand;
  }
  generate(len) {
    return this._rand(len);
  }
  // Emulate crypto API using randy
  _rand(n) {
    if (this.rand.getBytes) return this.rand.getBytes(n);

    const res = new Uint8Array(n);
    for (let i = 0; i < res.length; i++) res[i] = this.rand.getByte();
    return res;
  }
}

if (typeof self === 'object') {
  if (self.crypto && self.crypto.getRandomValues) {
    // Modern browsers
    Rand.prototype._rand = function _rand(n) {
      const arr = new Uint8Array(n);
      self.crypto.getRandomValues(arr);
      return arr;
    };
  } else if (self.msCrypto && self.msCrypto.getRandomValues) {
    // IE
    Rand.prototype._rand = function _rand(n) {
      const arr = new Uint8Array(n);
      self.msCrypto.getRandomValues(arr);
      return arr;
    };

    // Safari's WebWorkers do not have `crypto`
  } else if (typeof window === 'object') {
    // Old junk
    Rand.prototype._rand = function () {
      throw new Error('Not implemented yet');
    };
  }
} else {
  // Node.js or Web worker with no crypto support
  try {
    const crypto = require('crypto');
    if (typeof crypto.randomBytes !== 'function') throw new Error('Not supported');

    Rand.prototype._rand = function _rand(n) {
      return crypto.randomBytes(n);
    };
  } catch (e) {}
}
