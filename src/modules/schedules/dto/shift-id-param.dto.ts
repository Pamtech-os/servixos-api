import { IsMongoId } from 'class-validator';
import { SCHEDULES_MESSAGES } from 'src/common/constants/messages/schedules.messages';

export class ShiftIdParamDto {
  @IsMongoId({ message: SCHEDULES_MESSAGES.VALIDATION.ID_INVALID })
  id: string;
}
