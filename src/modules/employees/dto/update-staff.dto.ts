import { UpdateEmployeeDto } from './update-employee.dto';

/**
 * Alias DTO to support `/staff` updates while preserving existing shape.
 */
export class UpdateStaffDto extends UpdateEmployeeDto {}
