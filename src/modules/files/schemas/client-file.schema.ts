import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum FileFormat {
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  PNG = 'png',
  JPG = 'jpg',
}

@index({ businessId: 1, clientId: 1 })
@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'client_files', timestamps: true },
})
export class ClientFile {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ required: true })
  filename: string;

  @prop({ required: true })
  cloudinaryPublicId: string;

  @prop({ required: true })
  url: string;

  @prop({ enum: FileFormat })
  format: FileFormat;

  @prop({ default: 0 })
  filesizeBytes: number;

  @prop({ ref: 'User', type: Types.ObjectId })
  uploadedBy?: Types.ObjectId;

  @prop()
  deletedAt?: Date;
}
