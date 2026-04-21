const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');

let multer;
try {
  multer = require('multer');
} catch (e) {
  console.warn('multer not installed, file uploads will be disabled');
}

const UPLOAD_DIR = path.join(__dirname, '../../data/resources');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let upload;
if (multer) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `res_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    }
  });
  upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });
} else {
  upload = { single: () => (req, res, next) => next() };
}

// GET /api/resources?course_id=:id&lesson_id=:id&category=:cat
router.get('/', (req, res) => {
  try {
    const { course_id, lesson_id, category } = req.query;
    let query = `
      SELECT r.*,
        u.first_name || ' ' || u.last_name AS uploader_name,
        c.title AS course_title
      FROM resources r
      LEFT JOIN users u ON r.uploaded_by = u.id
      LEFT JOIN courses c ON r.course_id = c.id
      WHERE (r.is_public = 1 OR r.uploaded_by = ?
    `;
    const params = [req.user.id];

    // Students can access resources for their enrolled courses
    if (req.user.role === 'student') {
      query += ` OR r.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ?)`;
      params.push(req.user.id);
    }

    query += ')';

    if (course_id) { query += ' AND r.course_id = ?'; params.push(course_id); }
    if (lesson_id) { query += ' AND r.lesson_id = ?'; params.push(lesson_id); }
    if (category) { query += ' AND r.category = ?'; params.push(category); }

    query += ' ORDER BY r.created_at DESC';
    const resources = db.prepare(query).all(...params);
    res.json({ resources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resources/:id/download
router.get('/:id/download', (req, res) => {
  try {
    const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    // Check access
    const hasAccess = resource.is_public ||
      resource.uploaded_by === req.user.id ||
      ['instructor', 'admin'].includes(req.user.role) ||
      (resource.course_id && db.prepare('SELECT 1 FROM enrollments WHERE student_id = ? AND course_id = ?').get(req.user.id, resource.course_id));

    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    if (!fs.existsSync(resource.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Increment download count
    db.prepare('UPDATE resources SET download_count = download_count + 1 WHERE id = ?').run(req.params.id);

    const filename = path.basename(resource.file_path);
    res.setHeader('Content-Disposition', `attachment; filename="${resource.title || filename}"`);
    res.sendFile(resource.file_path);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resources  (instructor upload)
router.post('/', upload.single('file'), (req, res) => {
  try {
    if (!['instructor', 'admin', 'teaching_assistant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Instructor access required' });
    }

    const { title, description, course_id, lesson_id, category, is_public } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileType = path.extname(req.file.originalname).replace('.', '').toLowerCase();
    const fileSizeBytes = req.file.size;
    const filePath = req.file.path;

    const result = db.prepare(`
      INSERT INTO resources (uploaded_by, title, description, course_id, lesson_id, file_path, file_type, file_size_bytes, category, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, title, description || null, course_id || null, lesson_id || null,
      filePath, fileType, fileSizeBytes, category || 'general', is_public === 'true' || is_public === '1' ? 1 : 0
    );

    const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ resource });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/resources/:id
router.put('/:id', (req, res) => {
  try {
    const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (resource.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your resource' });
    }

    const { title, description, course_id, lesson_id, category, is_public } = req.body;
    db.prepare(`
      UPDATE resources SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        course_id = COALESCE(?, course_id),
        lesson_id = COALESCE(?, lesson_id),
        category = COALESCE(?, category),
        is_public = COALESCE(?, is_public)
      WHERE id = ?
    `).run(title, description, course_id, lesson_id, category,
      is_public !== undefined ? (is_public ? 1 : 0) : null,
      req.params.id);

    const updated = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
    res.json({ resource: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/resources/:id
router.delete('/:id', (req, res) => {
  try {
    const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (resource.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your resource' });
    }

    // Delete file from disk
    if (resource.file_path && fs.existsSync(resource.file_path)) {
      try { fs.unlinkSync(resource.file_path); } catch (e) { /* ignore */ }
    }

    db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
    res.json({ message: 'Resource deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
