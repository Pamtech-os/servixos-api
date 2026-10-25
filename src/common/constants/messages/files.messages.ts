export const FILES_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'File ID must be a valid Mongo ID',
    CLIENT_ID_INVALID: 'Client ID must be a valid Mongo ID',
    MIME_TYPE_INVALID: 'mimeType must be a valid string',
  },
  SUCCESS: {
    UPLOADED: 'File uploaded successfully',
    RETRIEVED: 'Files retrieved successfully',
    FOUND: 'File retrieved successfully',
    DELETED: 'File deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'File not found',
    UPLOAD_FAILED: 'Unable to upload file at this time',
    INVALID_TYPE:
      'Invalid file type. Only PDF, DOC, DOCX, PNG, and JPG are allowed',
    SIZE_EXCEEDED: 'FILE_TOO_LARGE',
  },
} as const;
