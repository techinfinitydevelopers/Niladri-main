const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/role');

// GET /api/courses
router.get('/', (req, res) => {
  try {
    const { level, category, instrument, search, status } = req.query;
    let query = `
      SELECT c.*, u.first_name || ' ' || u.last_name AS instructor_name
      FROM courses c
      LEFT JOIN users u ON c.instructor_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') { query += ' AND c.status = ?'; params.push(status); }
    else if (!status) { query += " AND c.status = 'active'"; }
    if (level) { query += ' AND c.level = ?'; params.push(level); }
    if (category) { query += ' AND c.category = ?'; params.push(category); }
    if (instrument) { query += ' AND c.instrument = ?'; params.push(instrument); }
    if (search) { query += ' AND c.title LIKE ?'; params.push(`%${search}%`); }

    query += ' ORDER BY c.created_at DESC';
    const courses = db.prepare(query).all(...params);
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/courses/:id
router.get('/:id', (req, res) => {
  try {
    const course = db.prepare(`
      SELECT c.*, u.first_name || ' ' || u.last_name AS instructor_name, u.bio AS instructor_bio, u.avatar_initials AS instructor_initials
      FROM courses c
      LEFT JOIN users u ON c.instructor_id = u.id
      WHERE c.id = ?
    `).get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/courses/:id/chapters
router.get('/:id/chapters', (req, res) => {
  try {
    const chapters = db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY order_index').all(req.params.id);
    const lessonsAll = db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index').all(req.params.id);

    // If student, also get their progress
    const progressMap = {};
    if (req.user.role === 'student') {
      const progress = db.prepare('SELECT lesson_id, completed FROM lesson_progress WHERE student_id = ?').all(req.user.id);
      progress.forEach(p => { progressMap[p.lesson_id] = p.completed; });
    }

    const result = chapters.map(ch => ({
      ...ch,
      lessons: lessonsAll
        .filter(l => l.chapter_id === ch.id)
        .map(l => ({ ...l, completed: progressMap[l.id] ? true : false }))
    }));

    res.json({ chapters: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/courses — instructor only
router.post('/', requireRole('instructor'), (req, res) => {
  try {
    const { title, subtitle, description, instrument, level, category, cover_color, cover_accent, duration_weeks } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = db.prepare(`
      INSERT INTO courses (title, subtitle, description, instructor_id, instrument, level, category, cover_color, cover_accent, duration_weeks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, subtitle || null, description || null, req.user.id, instrument || null, level || null, category || null, cover_color || '#2D4F1E', cover_accent || '#D1A14E', duration_weeks || null);

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/courses/:id — instructor only
router.put('/:id', requireRole('instructor'), (req, res) => {
  try {
    const { title, subtitle, description, instrument, level, category, cover_color, cover_accent, duration_weeks, status } = req.body;
    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND instructor_id = ?').get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: 'Course not found or not authorized' });

    db.prepare(`
      UPDATE courses SET title = ?, subtitle = ?, description = ?, instrument = ?, level = ?, category = ?, cover_color = ?, cover_accent = ?, duration_weeks = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title || course.title, subtitle || course.subtitle, description || course.description,
      instrument || course.instrument, level || course.level, category || course.category,
      cover_color || course.cover_color, cover_accent || course.cover_accent,
      duration_weeks || course.duration_weeks, status || course.status, req.params.id
    );

    const updated = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    res.json({ course: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/courses/:id — instructor only
router.delete('/:id', requireRole('instructor'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND instructor_id = ?').get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: 'Course not found or not authorized' });

    db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
    res.json({ message: 'Course deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
