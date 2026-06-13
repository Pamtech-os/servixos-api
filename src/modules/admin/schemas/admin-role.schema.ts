import { prop, index, modelOptions, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import type { AdminPermission } from 'src/common/constants/admin-permissions.constants';

@index({ name: 1 }, { unique: true })
@modelOptions({
  schemaOptions: { collection: 'admin_roles', timestamps: true },
})
export class AdminRole {
  _id: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ trim: true })
  description?: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  permissions: AdminPermission[];

  /** Prevents this role from being deleted — only the built-in Admin role uses this. */
  @prop({ default: false })
  isSystem: boolean;

  createdAt: Date;
  updatedAt: Date;
}
