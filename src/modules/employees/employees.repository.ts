import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { Employee, EmployeeModel } from './schemas/employee.schema';

@Injectable()
export class EmployeesRepository {
  private readonly employeesModel: ReturnModelType<typeof Employee> =
    EmployeeModel;
}
