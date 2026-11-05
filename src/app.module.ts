import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { CryptoModule } from './crypto/crypto.module';
import { CecModule } from './cec/cec.module';
import { Ec1Module } from './election-commission/ec1.module';
import { Ec2Module } from './election-commission/ec2.module';

@Module({
  imports: [CryptoModule, CecModule, Ec1Module, Ec2Module],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
