import { PublicKey } from '../crypto/crypto.interfaces';

export interface VoterPublicInfo {
  name: string;
  publicKey: PublicKey;
}

export interface SignedBallotBatch {
  senderName: string;
  ballots: string[];
  signature: bigint;
}
