import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationsDto {
  @IsOptional()
  @IsBoolean({ message: 'Email notification must be a boolean' })
  email?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'New client notification must be a boolean' })
  newClient?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Payment notification must be a boolean' })
  payment?: boolean;
}
