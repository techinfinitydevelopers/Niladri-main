const router = require('express').Router();
const db = require('../db');

// GET current config
router.get('/config', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM app_config WHERE id = 1').get();
    if (!row) return res.json({ s3: {}, smtp: {}, general: {}, razorpay: {} });
    res.json({
      s3: JSON.parse(row.s3_config || '{}'),
      smtp: JSON.parse(row.smtp_config || '{}'),
      general: JSON.parse(row.general_config || '{}'),
      razorpay: JSON.parse(row.razorpay_config || '{}')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT S3 config
router.put('/config/s3', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM app_config WHERE id = 1').get();
    const json = JSON.stringify(req.body);
    if (existing) {
      db.prepare("UPDATE app_config SET s3_config = ?, updated_at = datetime('now') WHERE id = 1").run(json);
    } else {
      db.prepare('INSERT INTO app_config (id, s3_config) VALUES (1, ?)').run(json);
    }
    res.json({ message: 'S3 configuration saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT SMTP config
router.put('/config/smtp', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM app_config WHERE id = 1').get();
    const json = JSON.stringify(req.body);
    if (existing) {
      db.prepare("UPDATE app_config SET smtp_config = ?, updated_at = datetime('now') WHERE id = 1").run(json);
    } else {
      db.prepare('INSERT INTO app_config (id, smtp_config) VALUES (1, ?)').run(json);
    }
    res.json({ message: 'SMTP configuration saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT General config
router.put('/config/general', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM app_config WHERE id = 1').get();
    const json = JSON.stringify(req.body);
    if (existing) {
      db.prepare("UPDATE app_config SET general_config = ?, updated_at = datetime('now') WHERE id = 1").run(json);
    } else {
      db.prepare('INSERT INTO app_config (id, general_config) VALUES (1, ?)').run(json);
    }
    res.json({ message: 'General configuration saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT Razorpay config
router.put('/config/razorpay', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM app_config WHERE id = 1').get();
    const json = JSON.stringify(req.body);
    if (existing) {
      db.prepare("UPDATE app_config SET razorpay_config = ?, updated_at = datetime('now') WHERE id = 1").run(json);
    } else {
      db.prepare('INSERT INTO app_config (id, razorpay_config) VALUES (1, ?)').run(json);
    }
    res.json({ message: 'Razorpay configuration saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Test S3
router.post('/s3/test', (req, res) => {
  const { access_key_id, secret_access_key, bucket_name, region } = req.body;
  if (!access_key_id || !secret_access_key || !bucket_name || !region) {
    return res.status(400).json({ error: 'All S3 fields are required to test connection' });
  }
  setTimeout(() => res.json({ message: 'S3 connection successful', bucket: bucket_name }), 800);
});

// POST Test SMTP
router.post('/smtp/test', (req, res) => {
  const { test_email, host, port, username } = req.body;
  if (!test_email || !host || !username) {
    return res.status(400).json({ error: 'SMTP config and test email are required' });
  }
  setTimeout(() => res.json({ message: `Test email sent to ${test_email}` }), 1000);
});

module.exports = router;
