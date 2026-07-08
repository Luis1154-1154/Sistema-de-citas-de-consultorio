const db = require('../config/db');

exports.getSetting = (key, callback) => {
  db.query('SELECT value FROM clinic_settings WHERE key = ?', [key], (err, rows) => {
    if (err) return callback(err);
    if (!rows || rows.length === 0) return callback(null, null);
    return callback(null, rows[0].value);
  });
};

exports.setSetting = (key, value, callback) => {
  const DB_CLIENT = (process.env.DB_CLIENT || 'mysql').toLowerCase();
  if (DB_CLIENT === 'postgres' || DB_CLIENT === 'pg') {
    db.query(
      'INSERT INTO clinic_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, value],
      callback
    );
  } else {
    db.query(
      'INSERT INTO clinic_settings (key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [key, value],
      callback
    );
  }
};

// Working hours CRUD
exports.listWorkingHours = (callback) => {
  db.query('SELECT * FROM working_hours ORDER BY day_of_week IS NULL, day_of_week, start_time', callback);
};

exports.getWorkingHourById = (id, callback) => {
  db.query('SELECT * FROM working_hours WHERE id = ?', [id], callback);
};

exports.createWorkingHour = (rule, callback) => {
  db.query('INSERT INTO working_hours (day_of_week, start_time, end_time, break_start, break_end, applies_forever, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [rule.day_of_week ?? null, rule.start_time, rule.end_time, rule.break_start || null, rule.break_end || null, rule.applies_forever ? 1 : 0, rule.active ? 1 : 0], callback);
};

exports.updateWorkingHour = (id, rule, callback) => {
  db.query('UPDATE working_hours SET day_of_week = ?, start_time = ?, end_time = ?, break_start = ?, break_end = ?, applies_forever = ?, active = ? WHERE id = ?',
    [rule.day_of_week ?? null, rule.start_time, rule.end_time, rule.break_start || null, rule.break_end || null, rule.applies_forever ? 1 : 0, rule.active ? 1 : 0, id], callback);
};

exports.deleteWorkingHour = (id, callback) => {
  db.query('DELETE FROM working_hours WHERE id = ?', [id], callback);
};

// Exceptions CRUD
exports.listExceptions = (callback) => {
  db.query('SELECT * FROM working_exceptions ORDER BY exception_date, start_time', callback);
};

exports.createException = (ex, callback) => {
  db.query('INSERT INTO working_exceptions (exception_date, start_time, end_time, break_start, break_end, reason) VALUES (?, ?, ?, ?, ?, ?)',
    [ex.exception_date, ex.start_time || null, ex.end_time || null, ex.break_start || null, ex.break_end || null, ex.reason || null], callback);
};

exports.deleteException = (id, callback) => {
  db.query('DELETE FROM working_exceptions WHERE id = ?', [id], callback);
};

exports.getAppointmentInterval = (callback) => {
  this.getSetting('appointment_interval_minutes', (err, value) => {
    if (err) return callback(err);
    const minutes = value ? parseInt(value, 10) : 30;
    callback(null, isNaN(minutes) ? 30 : minutes);
  });
};

module.exports = exports;
