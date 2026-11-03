import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { CryptoModule } from './crypto/crypto.module';
import { VotingModule } from './voting/voting.module';

@Module({
  imports: [CryptoModule, VotingModule],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
