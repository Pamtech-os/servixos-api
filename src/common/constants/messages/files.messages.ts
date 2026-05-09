export const FILES_MESSAGES = {
  SUCCESS: {
    UPLOADED: 'File uploaded successfully',
    RETRIEVED: 'Files retrieved successfully',
    FOUND: 'File retrieved successfully',
    DELETED: 'File deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'File not found',
    UPLOAD_FAILED: 'Unable to upload file at this time',
    INVALID_TYPE: 'Invalid file type. Only PDF and DOC files are allowed',
    SIZE_EXCEEDED: 'File size exceeds the 10 MB limit',
  },
} as const;
