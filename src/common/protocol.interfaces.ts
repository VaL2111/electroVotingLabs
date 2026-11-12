import { PublicKey } from '../crypto/crypto.interfaces';

export interface Candidate {
  id: number;
  fullName: string;
}

export interface AnonymousVoterRecord {
  registrationNumber: string;
  publicKey: PublicKey;
}

export interface SignedVoterRegistry {
  records: AnonymousVoterRecord[];
  totalRegistered: number;
  signature: bigint;
}

export interface BallotPartPayload {
  voterId: string;
  registrationNumber: string;
  encryptedPart: string;
}

export interface SignedVoterPacket extends BallotPartPayload {
  signature: string;
}

export interface PublishedBallotPart {
  voterId: string;
  encryptedPart: bigint;
}

export interface SignedCommissionBatch {
  commissionName: string;
  parts: PublishedBallotPart[];
  signature: bigint;
}

export interface PublishedFinalBallot {
  voterId: string;
  candidateId: number;
}

export interface ElectionResults {
  tally: Record<number, number>;
  ballots: PublishedFinalBallot[];
  invalidVoterIds: string[];
  signature: bigint;
}
