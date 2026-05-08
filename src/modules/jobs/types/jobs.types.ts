export interface AcceptedRequestJobCreationData {
  businessId: string;
  sourceRequestId: string;
  clientId: string;
  title: string;
  description?: string;
  scheduledDate: string;
  price?: number;
  notes?: string;
  timezone: string;
}

export interface ContractSendJobData {
  businessId: string;
  jobId: string;
  contractId: string;
}
