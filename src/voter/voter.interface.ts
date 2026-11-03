import { PrivateKey } from '../crypto/crypto.interfaces';

export interface Ballot {
  id: string;
  rn: string | null;
  candidate: string;
}

export interface SignedVotePayload {
  ballot: string;
  signature: string;
}

export interface PublishedBallot {
  id: string;
  candidate: string;
  signature: string;
}

export interface VoteOptions {
  customRn?: string;
  customId?: string;
  customPrivateKey?: PrivateKey;
}
