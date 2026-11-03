import { Module } from '@nestjs/common';
import { VotingService } from './voting.service';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [CryptoModule],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
