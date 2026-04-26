import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from 'src/common/decorators/public.decorator';
import { ApiKeyGuard } from 'src/common/guards/api-key.guard';
import { decrypt, encrypt } from 'src/common/utils/crypto.util';
import { AppEnvironment } from 'src/common/constants/app.constants';
import { EncryptDto } from './dto/encrypt.dto';
import { DecryptDto } from './dto/decrypt.dto';

@Public()
@UseGuards(ApiKeyGuard)
@Controller('security')
export class SecurityController {
  private readonly secret: string;

  constructor(config: ConfigService) {
    if (config.get<string>('NODE_ENV') === AppEnvironment.PRODUCTION) {
      throw new NotFoundException();
    }
    this.secret = config.get<string>('ENCRYPTION_SECRET') || '';
  }

  @Post('encrypt')
  @HttpCode(HttpStatus.OK)
  encrypt(@Body() dto: EncryptDto): { encrypted: string } {
    return { encrypted: encrypt(JSON.stringify(dto.data), this.secret) };
  }

  @Post('decrypt')
  @HttpCode(HttpStatus.OK)
  decrypt(@Body() dto: DecryptDto): { data: unknown } {
    return { data: JSON.parse(decrypt(dto.data, this.secret)) as unknown };
  }
}
