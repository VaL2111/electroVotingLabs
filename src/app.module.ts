import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { CryptoModule } from './crypto/crypto.module';
import { RegistrationBureauModule } from './registration-bureau/registration-bureau.module';
import {
  Lc1Module,
  Lc2Module,
  Lc3Module,
  Lc4Module,
} from './low-commission/low-commission.module';
import { Mc1Module, Mc2Module } from './mid-commission/mid-commission.module';
import { CecModule } from './cec/cec.module';

@Module({
  imports: [
    CryptoModule,
    RegistrationBureauModule,
    Lc1Module,
    Lc2Module,
    Lc3Module,
    Lc4Module,
    Mc1Module,
    Mc2Module,
    CecModule,
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
