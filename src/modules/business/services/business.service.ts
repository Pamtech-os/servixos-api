import { Injectable } from '@nestjs/common';
import { BusinessRepository } from '../repositories/business.repository';

@Injectable()
export class BusinessService {
  constructor(private readonly businessRepository: BusinessRepository) {}
}
