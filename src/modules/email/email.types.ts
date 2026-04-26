export interface IAttachmentObjectType {
  ContentType: string;
  Filename: string;
  Base64Content: string;
}

export interface IEmailBody {
  from?: string;
  to: string;
  name: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: IAttachmentObjectType[];
  cc?: string[];
}
