const multer = require('multer');
const path = require('path');
const { dirFor, ensureUploadDirs } = require('../config/uploads');

// Destinations resolve from the configured persistent upload root (UPLOAD_DIR),
// not from a path inside the git working tree — a deploy that rewrites the tree
// can then never redirect uploads into storage that is about to be replaced.
ensureUploadDirs();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, dirFor(req.body.attachment_type || 'temp'));
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp_originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const sanitizedBasename = basename.replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${sanitizedBasename}_${uniqueSuffix}${ext}`);
  }
});

// File filter - allow only specific file types
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'text/csv'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: PDF, Images (JPEG, PNG), Word, Excel, CSV`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB max file size
  }
});

// Middleware for single file upload
exports.uploadSingle = upload.single('file');

// Middleware for multiple files upload (max 5)
// 10 rather than 5: a purchase request settled in several payment batches can
// legitimately carry that many proof-of-payment documents.
exports.uploadMultiple = upload.array('files', 10);

// Error handling middleware
exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 8MB limit' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum 5 files allowed' });
    }
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};
