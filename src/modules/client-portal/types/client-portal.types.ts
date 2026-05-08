export interface ClientInvoiceListItem {
  id: string;
  invoiceNumber: string;
  issuedDate: string;
  dueDate?: string;
  amount: number;
  status: 'paid' | 'partial' | 'unpaid';
  currency: string;
}

export interface ClientInvoiceDetail extends ClientInvoiceListItem {
  notes?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  serviceProvider: {
    businessName: string;
    supportEmail?: string;
  };
}

export interface ClientContractListItem {
  id: string;
  name: string;
  dateSent?: string;
  amount: number;
  status: 'awaiting_signature' | 'signed' | 'expired' | 'cancelled';
  currency: string;
}

export interface ClientContractDetail extends ClientContractListItem {
  expiresAt?: string;
  content: string;
  signedAt?: string | null;
}

export interface ClientFileListItem {
  id: string;
  filename: string;
  format: 'pdf' | 'doc' | 'docx' | 'xlsx' | 'png' | 'jpg';
  filesizeBytes: number;
  generatedDate: string;
}

export interface ClientActivityItem {
  id: string;
  description: string;
  type: 'invoice' | 'payment' | 'contract' | 'file' | 'message';
  referenceId?: string;
  date: string;
}

export interface ClientDashboardData {
  outstandingBalance: number;
  totalPaid: number;
  pendingContractsCount: number;
  recentActivities: ClientActivityItem[];
}
