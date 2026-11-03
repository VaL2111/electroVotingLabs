import { PublicKey } from '../crypto/crypto.interfaces';

export interface AnonymousVoterRecord {
  rn: string;
  publicKey: PublicKey;
}
