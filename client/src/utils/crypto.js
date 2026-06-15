// SHA-256 hashing helpers built on the Web Crypto API.
// Both ends hash the file so the receiver can verify integrity before download.

// Convert a digest ArrayBuffer into a lowercase hex string.
function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hash a raw ArrayBuffer (used by the sender on the original file buffer).
export async function hashFile(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return toHex(digest);
}

// Hash a Blob (used by the receiver on the reassembled file).
export async function hashBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return toHex(digest);
}

// ---------------------------------------------------------------------------
// Incremental SHA-256 (FIPS 180-4)
// ---------------------------------------------------------------------------
// The Web Crypto API only offers a one-shot `digest()` that needs the entire
// input in memory at once — unusable for multi-GB files. This streaming
// implementation lets both peers hash a file chunk-by-chunk as it flows
// through, so we never hold more than one chunk in memory for hashing.
//
// Usage:
//   const h = createSha256();
//   h.update(uint8ArrayChunk);   // call repeatedly, in order
//   const hex = h.hexDigest();   // lowercase hex, call once when done

// Round constants (first 32 bits of the fractional parts of the cube roots of
// the first 64 primes).
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

class Sha256 {
  constructor() {
    // Initial hash values (fractional parts of the square roots of the first
    // 8 primes).
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ]);
    this.block = new Uint8Array(64); // partial 512-bit block buffer
    this.blockLen = 0; // bytes currently in `block`
    this.totalBytes = 0; // total message length (Number is exact to 2^53)
    this.w = new Uint32Array(64); // message schedule scratch
    this.done = false;
  }

  // Feed more bytes. Accepts a Uint8Array; processes every full 64-byte block
  // and buffers the remainder for the next call.
  update(data) {
    if (this.done) throw new Error("Sha256: update after digest");
    this.totalBytes += data.length;
    let i = 0;
    while (i < data.length) {
      const take = Math.min(64 - this.blockLen, data.length - i);
      this.block.set(data.subarray(i, i + take), this.blockLen);
      this.blockLen += take;
      i += take;
      if (this.blockLen === 64) {
        this._process(this.block);
        this.blockLen = 0;
      }
    }
    return this;
  }

  // Process one 64-byte block, mutating this.h.
  _process(p) {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = i * 4;
      w[i] = (p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = this.h[0],
      b = this.h[1],
      c = this.h[2],
      d = this.h[3],
      e = this.h[4],
      f = this.h[5],
      g = this.h[6],
      h = this.h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + h) | 0;
  }

  // Finalize: append padding + the 64-bit big-endian bit length, then emit the
  // digest as a lowercase hex string. Can only be called once.
  hexDigest() {
    if (this.done) throw new Error("Sha256: digest called twice");
    this.done = true;

    const block = this.block;
    let len = this.blockLen;

    // Append the mandatory 0x80 byte.
    block[len++] = 0x80;
    // If there's no room for the 8-byte length, pad+flush this block first.
    if (len > 56) {
      while (len < 64) block[len++] = 0;
      this._process(block);
      len = 0;
    }
    while (len < 56) block[len++] = 0;

    // 64-bit big-endian message length in bits.
    const bits = this.totalBytes * 8;
    const hi = Math.floor(bits / 0x100000000);
    const lo = bits % 0x100000000;
    block[56] = (hi >>> 24) & 0xff;
    block[57] = (hi >>> 16) & 0xff;
    block[58] = (hi >>> 8) & 0xff;
    block[59] = hi & 0xff;
    block[60] = (lo >>> 24) & 0xff;
    block[61] = (lo >>> 16) & 0xff;
    block[62] = (lo >>> 8) & 0xff;
    block[63] = lo & 0xff;
    this._process(block);

    let out = "";
    for (let i = 0; i < 8; i++) {
      out += (this.h[i] >>> 0).toString(16).padStart(8, "0");
    }
    return out;
  }
}

// Factory for an incremental SHA-256 hasher.
export function createSha256() {
  return new Sha256();
}
