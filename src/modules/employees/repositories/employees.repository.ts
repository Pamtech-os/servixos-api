import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { Employee } from '../schemas/employee.schema';

export interface ListEmployeesFilters {
  search?: string;
  roleId?: string;
}

@Injectable()
export class EmployeesRepository {
  private readonly employeesModel: ReturnModelType<typeof Employee>;

  constructor(@InjectConnection() connection: Connection) {
    this.employeesModel = getModelForClass(Employee, {
      existingConnection: connection,
    });
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListEmployeesFilters,
    pagination: PaginationParams,
  ): Promise<{ data: Employee[]; total: number }> {
    const query: Record<string, unknown> = { businessId, deletedAt: null };

    if (filters.search) {
      query['$or'] = [
        { fullName: { $regex: new RegExp(filters.search, 'i') } },
        { email: { $regex: new RegExp(filters.search, 'i') } },
      ];
    }

    if (filters.roleId) {
      query['roleId'] = new Types.ObjectId(filters.roleId);
    }

    const [data, total] = await Promise.all([
      this.employeesModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<Employee[]>()
        .exec(),
      this.employeesModel.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<Employee | null> {
    return this.employeesModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<Employee>()
      .exec();
  }

  async findByEmail(
    email: string,
    businessId: Types.ObjectId,
  ): Promise<Employee | null> {
    return this.employeesModel
      .findOne({ email, businessId, deletedAt: null })
      .lean<Employee>()
      .exec();
  }

  async findByUserId(
    userId: string,
    businessId?: Types.ObjectId,
  ): Promise<Employee | null> {
    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      deletedAt: null,
    };

    if (businessId) query['businessId'] = businessId;

    return this.employeesModel.findOne(query).lean<Employee>().exec();
  }

  async create(
    data: Partial<Employee>,
    session?: ClientSession,
  ): Promise<Employee> {
    const [employee] = await this.employeesModel.create([data], { session });
    return employee.toObject() as Employee;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Employee>,
    session?: ClientSession,
  ): Promise<Employee | null> {
    const $set: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        $set[key] = value;
      }
    }

    if (Object.keys($set).length === 0) {
      return this.findById(id, businessId);
    }

    return this.employeesModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set },
        { returnDocument: 'after', session },
      )
      .lean<Employee>()
      .exec();
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Employee | null> {
    return this.employeesModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after', session },
      )
      .lean<Employee>()
      .exec();
  }
}
