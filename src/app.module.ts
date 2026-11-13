import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { CryptoModule } from './crypto/crypto.module';
import { RegistrationBureauModule } from './registration-bureau/registration-bureau.module';

@Module({
  imports: [CryptoModule, RegistrationBureauModule],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
