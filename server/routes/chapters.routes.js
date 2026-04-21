const router = require('express').Router();
const db = require('../db');

// GET /api/chapters?course_id=X
router.get('/', (req, res) => {
  try {
    const { course_id } = req.query;
    if (!course_id) return res.status(400).json({ error: 'course_id is required' });
    const chapters = db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY order_index').all(course_id);
    const lessons = db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index').all(course_id);
    const result = chapters.map(ch => ({
      ...ch,
      lessons: lessons.filter(l => l.chapter_id === ch.id)
    }));
    res.json({ chapters: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chapters
router.post('/', (req, res) => {
  try {
    const { course_id, title, order_index, description } = req.body;
    if (!course_id || !title) return res.status(400).json({ error: 'course_id and title are required' });
    const result = db.prepare(
      'INSERT INTO chapters (course_id, title, order_index, description) VALUES (?, ?, ?, ?)'
    ).run(course_id, title, order_index || 0, description || '');
    res.json({ id: result.lastInsertRowid, course_id, title, order_index, description, lessons: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/chapters/:id
router.put('/:id', (req, res) => {
  try {
    const { title, order_index, description } = req.body;
    db.prepare('UPDATE chapters SET title = ?, order_index = ?, description = ? WHERE id = ?')
      .run(title, order_index, description, req.params.id);
    res.json({ message: 'Chapter updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chapters/:id
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM lessons WHERE chapter_id = ?').run(req.params.id);
    db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
    res.json({ message: 'Chapter deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
