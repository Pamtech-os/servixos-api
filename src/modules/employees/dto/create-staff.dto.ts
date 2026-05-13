import { CreateEmployeeDto } from './create-employee.dto';

/**
 * Alias DTO to support `/staff` naming while preserving employee invite shape.
 * Existing `/employees` payloads remain valid and unchanged.
 */
export class CreateStaffDto extends CreateEmployeeDto {}
