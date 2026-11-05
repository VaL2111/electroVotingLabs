import { PublicKey } from '../crypto/crypto.interfaces';

export interface Candidate {
  id: number;
  fullName: string;
}

export interface VoterRecord {
  fullName: string;
  publicKey: PublicKey;
}
