const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/lessons?course_id=X
router.get('/', (req, res) => {
  try {
    const { course_id } = req.query;
    let query = 'SELECT * FROM lessons WHERE 1=1';
    const params = [];
    if (course_id) { query += ' AND course_id = ?'; params.push(course_id); }
    query += ' ORDER BY course_id, order_index';
    const lessons = db.prepare(query).all(...params);
    res.json({ lessons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lessons/:id
router.get('/:id', (req, res) => {
  try {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ lesson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lessons — create new lesson
router.post('/', (req, res) => {
  try {
    const { chapter_id, course_id, title, type, duration_minutes, order_index, content_url } = req.body;
    if (!chapter_id || !course_id || !title) {
      return res.status(400).json({ error: 'chapter_id, course_id and title are required' });
    }
    const result = db.prepare(
      'INSERT INTO lessons (chapter_id, course_id, title, order_index, type, content_url, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(chapter_id, course_id, title, order_index || 0, type || 'video', content_url || null, duration_minutes || null);
    // Update lesson_count on course
    db.prepare('UPDATE courses SET lesson_count = (SELECT COUNT(*) FROM lessons WHERE course_id = ?) WHERE id = ?').run(course_id, course_id);
    res.json({ id: result.lastInsertRowid, chapter_id, course_id, title, order_index, type, content_url, duration_minutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/lessons/:id — update lesson
router.put('/:id', (req, res) => {
  try {
    const { title, type, duration_minutes, order_index, content_url } = req.body;
    db.prepare('UPDATE lessons SET title = ?, type = ?, duration_minutes = ?, order_index = ?, content_url = ? WHERE id = ?')
      .run(title, type || 'video', duration_minutes || null, order_index || 0, content_url || null, req.params.id);
    res.json({ message: 'Lesson updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lessons/:id
router.delete('/:id', (req, res) => {
  try {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    db.prepare('DELETE FROM lessons WHERE id = ?').run(req.params.id);
    db.prepare('UPDATE courses SET lesson_count = (SELECT COUNT(*) FROM lessons WHERE course_id = ?) WHERE id = ?').run(lesson.course_id, lesson.course_id);
    res.json({ message: 'Lesson deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lessons/:id/complete
router.post('/:id/complete', (req, res) => {
  try {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Upsert lesson progress
    db.prepare(`
      INSERT INTO lesson_progress (student_id, lesson_id, completed, completed_at)
      VALUES (?, ?, 1, datetime('now'))
      ON CONFLICT(student_id, lesson_id) DO UPDATE SET completed = 1, completed_at = datetime('now')
    `).run(req.user.id, lesson.id);

    // Recalculate enrollment progress
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?').get(req.user.id, lesson.course_id);
    if (enrollment) {
      const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons WHERE course_id = ?').get(lesson.course_id);
      const completedLessons = db.prepare(`
        SELECT COUNT(*) as count FROM lesson_progress lp
        JOIN lessons l ON lp.lesson_id = l.id
        WHERE lp.student_id = ? AND l.course_id = ? AND lp.completed = 1
      `).get(req.user.id, lesson.course_id);

      const progress_pct = totalLessons.count > 0
        ? Math.round((completedLessons.count / totalLessons.count) * 100)
        : 0;

      db.prepare(`UPDATE enrollments SET progress_pct = ?, last_accessed_at = datetime('now') WHERE student_id = ? AND course_id = ?`)
        .run(progress_pct, req.user.id, lesson.course_id);

      res.json({ message: 'Lesson marked as complete', progress_pct });
    } else {
      res.json({ message: 'Lesson marked as complete' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
