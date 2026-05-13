import { index, modelOptions, prop, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import {
  ALL_PERMISSIONS,
  EMPLOYEE_DEFAULT_PERMISSIONS,
  MANAGER_DEFAULT_PERMISSIONS,
} from 'src/common/constants/permissions.constants';
import type { Permission } from 'src/common/constants/permissions.constants';

export enum DefaultRole {
  OWNER = 'Owner',
  MANAGER = 'Manager',
  EMPLOYEE = 'Employee',
}
export { ALL_PERMISSIONS };
export type { Permission };

export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRole, Permission[]> = {
  [DefaultRole.OWNER]: [...ALL_PERMISSIONS],
  [DefaultRole.MANAGER]: [...MANAGER_DEFAULT_PERMISSIONS],
  [DefaultRole.EMPLOYEE]: [...EMPLOYEE_DEFAULT_PERMISSIONS],
};

@index({ businessId: 1, name: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'roles', timestamps: true } })
export class Role {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  permissions: Permission[];

  /** System roles cannot be deleted and are seeded on business creation */
  @prop({ default: false })
  isSystem: boolean;

  /**
   * Immutable marker for the seeded Owner role.
   * Used to enforce: owner-role permissions are not editable.
   */
  @prop({ default: false })
  isOwnerRole?: boolean;
}
