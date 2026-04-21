const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const requireRole = require('../middleware/role');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './data/uploads');
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'sub-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// GET /api/submissions/me
router.get('/me', (req, res) => {
  try {
    const submissions = db.prepare(`
      SELECT s.*, l.title AS lesson_title, c.title AS course_title,
        u.first_name || ' ' || u.last_name AS grader_name
      FROM submissions s
      LEFT JOIN lessons l ON s.lesson_id = l.id
      LEFT JOIN courses c ON s.course_id = c.id
      LEFT JOIN users u ON s.graded_by = u.id
      WHERE s.student_id = ?
      ORDER BY s.submitted_at DESC
    `).all(req.user.id);
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/instructor
router.get('/instructor', requireRole('instructor'), (req, res) => {
  try {
    const submissions = db.prepare(`
      SELECT s.*, l.title AS lesson_title, c.title AS course_title,
        u.first_name AS student_first, u.last_name AS student_last,
        u.avatar_initials, u.email AS student_email
      FROM submissions s
      LEFT JOIN lessons l ON s.lesson_id = l.id
      LEFT JOIN courses c ON s.course_id = c.id
      LEFT JOIN users u ON s.student_id = u.id
      WHERE c.instructor_id = ? AND s.status = 'pending'
      ORDER BY s.submitted_at DESC
    `).all(req.user.id);
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions
router.post('/', upload.single('file'), (req, res) => {
  try {
    const { lesson_id, course_id, recording_id, notes } = req.body;
    const file_path = req.file ? `/uploads/${req.file.filename}` : null;

    const result = db.prepare(`
      INSERT INTO submissions (student_id, lesson_id, course_id, recording_id, file_path, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      req.user.id, lesson_id || null, course_id || null,
      recording_id || null, file_path, notes || null
    );

    const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ submission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/submissions/:id/grade — instructor only
router.put('/:id/grade', requireRole('instructor'), (req, res) => {
  try {
    const { grade, feedback } = req.body;
    if (!grade) return res.status(400).json({ error: 'Grade is required' });

    const submission = db.prepare(`
      SELECT s.* FROM submissions s
      JOIN courses c ON s.course_id = c.id
      WHERE s.id = ? AND c.instructor_id = ?
    `).get(req.params.id, req.user.id);

    if (!submission) return res.status(404).json({ error: 'Submission not found or not authorized' });

    db.prepare(`
      UPDATE submissions SET grade = ?, feedback = ?, graded_by = ?, graded_at = datetime('now'), status = 'graded'
      WHERE id = ?
    `).run(grade, feedback || null, req.user.id, req.params.id);

    const updated = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
    res.json({ submission: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
