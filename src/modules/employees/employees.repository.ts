import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import { Employee } from './schemas/employee.schema';

@Injectable()
export class EmployeesRepository {
  private readonly employeesModel: ReturnModelType<typeof Employee>;

  constructor(@InjectConnection() connection: Connection) {
    this.employeesModel = getModelForClass(Employee, {
      existingConnection: connection,
    });
  }
}
