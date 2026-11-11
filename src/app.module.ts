import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { CryptoModule } from './crypto/crypto.module';

@Module({
  imports: [CryptoModule],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
