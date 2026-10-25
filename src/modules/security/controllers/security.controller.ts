import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from 'src/common/decorators/public.decorator';
import { decrypt, encrypt } from 'src/common/utils/crypto.util';
import { AppEnvironment } from 'src/common/constants/app.constants';
import { DecryptDto } from '../dto/decrypt.dto';

@Public()
@Controller('security')
export class SecurityController {
  private readonly secret: string;

  constructor(config: ConfigService) {
    if (config.get<string>('NODE_ENV') === AppEnvironment.PRODUCTION) {
      // throw new NotFoundException();
      return;
    }
    this.secret = config.get<string>('ENCRYPTION_SECRET') || '';
  }

  @Post('encrypt')
  @HttpCode(HttpStatus.OK)
  encrypt(@Body() body: Record<string, unknown>): { encrypted: string } {
    const payload = { success: true, statusCode: HttpStatus.OK, data: body };
    return { encrypted: encrypt(JSON.stringify(payload), this.secret) };
  }

  @Post('decrypt')
  @HttpCode(HttpStatus.OK)
  decrypt(@Body() dto: DecryptDto): unknown {
    return JSON.parse(decrypt(dto.data, this.secret)) as unknown;
  }
}
