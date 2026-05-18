export const CLIENT_CACHE_KEYS = {
  dashboard: (clientId: string) => `client:dashboard:${clientId}`,
  invoices: (clientId: string, query: string) =>
    `client:invoices:${clientId}:${query}`,
  invoice: (clientId: string, id: string) => `client:invoice:${clientId}:${id}`,
  contracts: (clientId: string, query: string) =>
    `client:contracts:${clientId}:${query}`,
  contract: (clientId: string, id: string) =>
    `client:contract:${clientId}:${id}`,
  files: (clientId: string, query: string) =>
    `client:files:${clientId}:${query}`,
  fileDownload: (clientId: string, id: string) =>
    `client:file-dl:${clientId}:${id}`,
  conversations: (clientId: string) => `client:conversations:${clientId}`,
  messages: (clientId: string, providerId: string, page: number) =>
    `client:messages:${clientId}:${providerId}:${page}`,
  profile: (clientId: string) => `client:profile:${clientId}`,
  contacts: (clientId: string) => `client:contacts:${clientId}`,
  activities: (clientId: string, query: string) =>
    `client:activities:${clientId}:${query}`,
  review: (clientId: string, jobId: string) =>
    `client:review:${clientId}:${jobId}`,
};
