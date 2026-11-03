export interface PublicKey {
  e: bigint;
  n: bigint;
}

export interface PrivateKey {
  d: bigint;
  n: bigint;
}

export interface KeyPair {
  publicKey: PublicKey;
  privateKey: PrivateKey;
}
