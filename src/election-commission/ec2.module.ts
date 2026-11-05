import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import {
  EC2_TOKEN,
  ElectionCommissionService,
} from './election-commission.service';

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: EC2_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new ElectionCommissionService('ВК-2', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [EC2_TOKEN],
})
export class Ec2Module {}
