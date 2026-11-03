import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { CryptoModule } from './crypto/crypto.module';
import { VotingModule } from './voting/voting.module';
import { RegistrationModule } from './registration/registration.module';

@Module({
  imports: [CryptoModule, VotingModule, RegistrationModule],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
