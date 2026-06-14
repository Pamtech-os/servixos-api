export const STORAGE_FOLDERS = {
  uploads: (businessId: string) => `servixos/uploads/${businessId}`,
  clientFiles: (businessId: string, clientId: string) =>
    `servixos/client-files/${businessId}/${clientId}`,
  taskAttachments: (businessId: string, taskId: string) =>
    `servixos/task-attachments/${businessId}/${taskId}`,
  messagingAttachments: (businessId: string) =>
    `servixos/attachments/${businessId}`,
  invoices: 'servixos/invoices',
  contracts: 'servixos/contracts',
  clientExports: 'servixos/client-exports',
  adminReports: 'servixos/admin-reports',
} as const;
