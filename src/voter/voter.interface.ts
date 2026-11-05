export interface SignedBallotPayload {
  voterId: string;
  encryptedPart: string;
}

export interface SignedBallotPartMessage {
  fullName: string;
  voterId: string;
  encryptedPart: bigint;
  signature: bigint;
}

export interface PublishedBallotPart {
  voterId: string;
  encryptedPart: bigint;
}

export interface PublishedFinalBallot {
  voterId: string;
  candidateId: number;
}
