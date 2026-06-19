import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class UpdateDesignDto {
  @IsOptional()
  @IsString({ message: 'Primary color must be a valid string' })
  @Matches(HEX_COLOR_RE, {
    message: 'Primary color must be a valid hex color (e.g. #2563eb)',
  })
  colorPrimary?: string;

  @IsOptional()
  @IsString({ message: 'Secondary color must be a valid string' })
  @Matches(HEX_COLOR_RE, {
    message: 'Secondary color must be a valid hex color (e.g. #64748b)',
  })
  colorSecondary?: string;

  @IsOptional()
  @IsString({ message: 'Font must be a valid string' })
  @Transform(({ value }: { value: string }) => value?.trim())
  font?: string;
}
