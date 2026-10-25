import { IsMongoId } from 'class-validator';
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';

export class EmployeeIdParamDto {
  @IsMongoId({ message: EMPLOYEES_MESSAGES.VALIDATION.ID_INVALID })
  id: string;
}
