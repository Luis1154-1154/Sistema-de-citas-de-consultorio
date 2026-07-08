import { api } from './api-client.js';
import { requireSession } from './auth-guard.js';
import { clearMessage, escapeHtml, initMobileNavToggle, setLoading, showMessage, showFloatingConfirm } from './ui-utils.js';
import { normalizePhone, isValidPhone } from './app-config.js';

const adminPageMode = String(document.body?.dataset?.adminPage || 'active').toLowerCase();

function normalizeDateValue(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toISOString().slice(0, 10);
}

function normalizeTimeValue(value) {
  if (!value) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toISOString().slice(11, 16);
}

function parseAppointmentDateTime(dateStr, timeStr) {
  if (dateStr && timeStr) {
    const candidate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T${normalizeTimeValue(timeStr)}` : dateStr;
    const dt = new Date(candidate);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  if (dateStr) {
    const dt = new Date(dateStr);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  if (timeStr) {
    const dt = new Date(`1970-01-01T${normalizeTimeValue(timeStr)}`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return new Date();
}

function formatDateTime(dateStr, timeStr) {
  try {
    const dt = parseAppointmentDateTime(dateStr, timeStr);
    return {
      date: new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(dt),
      time: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(dt)
    };
  } catch (e) {
    return { date: dateStr || '', time: timeStr || '' };
  }
}

function renderAppointmentItem(appointment, { mode = adminPageMode } = {}) {
  const formatted = formatDateTime(appointment.date, appointment.time);
  const id = escapeHtml(appointment.id || '');
  const normalizedStatus = String(appointment.status || 'pending').trim().toLowerCase();
  const isPending = normalizedStatus === 'pending';
  const isAttended = normalizedStatus === 'attended';
  const showActions = mode === 'active';
  const showDelete = mode !== 'records';
  const statusLabel = isAttended ? 'Atendida'
    : normalizedStatus === 'canceled' ? 'Cancelada'
    : 'Pendiente';
  const cancelReason = String(appointment.cancel_reason || '').trim();
  const adminObs = String(appointment.admin_observations || '').trim();

  return `
    <div class="col-12">
      <div class="list-group-item d-flex justify-content-between align-items-start">
        <div>
          <div class="d-flex align-items-center gap-3 flex-wrap">
            <div class="fw-bold">${escapeHtml(formatted.date)}</div>
            <div class="badge bg-secondary text-white">${escapeHtml(formatted.time)}</div>
            <div class="ms-2"><span class="small text-muted">${escapeHtml(appointment.name || '')} • ${escapeHtml(appointment.phone || '')}</span></div>
          </div>
          <div class="mt-2">${escapeHtml(appointment.description || '')}</div>
          <div class="mt-2 small">Status: <strong>${escapeHtml(statusLabel)}</strong></div>
          ${normalizedStatus === 'canceled' && cancelReason ? `<div class="mt-2 small text-danger">Motivo: ${escapeHtml(cancelReason)}</div>` : ''}
        </div>
        <div class="text-end action-buttons">
          ${showDelete ? `<button class="btn btn-sm btn-outline-danger mb-2" data-delete-appointment="${id}">Eliminar</button>` : ''}
          ${showActions ? `
            <div class="d-flex flex-column align-items-end gap-2">
              ${isPending ? `<button class="btn btn-sm btn-outline-success" data-activate-appointment="${id}">Marcar atendida</button>` : ''}
              ${isPending ? `<button class="btn btn-sm btn-outline-primary" data-edit-appointment="${id}">Editar</button>` : ''}
              ${isPending ? `<button class="btn btn-sm btn-outline-secondary" data-toggle-cancel="${id}">Cancelar</button>` : ''}
            </div>

            <form class="cancel-panel d-none mt-3" data-cancel-form="${id}">
              <div class="alert alert-warning py-2 small mb-3">Procura cancelar con anticipación para no afectar la agenda.</div>
              <div data-cancel-feedback class="mb-2"></div>
              <label class="form-label" for="cancel-reason-${id}">Motivo de cancelación</label>
              <textarea class="form-control" id="cancel-reason-${id}" name="reason" rows="3" placeholder="Escribe por qué cancelas la cita" required></textarea>
              <div class="d-flex justify-content-end gap-2 mt-3">
                <button class="btn btn-outline-secondary btn-sm" type="button" data-cancel-hide="${id}">Cerrar</button>
                <button class="btn btn-danger btn-sm" type="submit">Confirmar cancelación</button>
              </div>
            </form>

            <form class="edit-panel d-none mt-3" data-edit-form="${id}">
              <input type="hidden" name="name" value="${escapeHtml(appointment.name || '')}" />
              <input type="hidden" name="phone" value="${escapeHtml(appointment.phone || '')}" />
              <input type="hidden" name="description" value="${escapeHtml(appointment.description || '')}" />
              <input type="hidden" name="status" value="${escapeHtml(appointment.status || 'pending')}" />
              <input type="hidden" name="cancel_reason" value="${escapeHtml(appointment.cancel_reason || '')}" />
              <div class="row g-2 align-items-end">
                <div class="col-6">
                  <label class="form-label small">Fecha</label>
                  <input class="form-control form-control-sm" name="date" type="date" placeholder="Fecha de la cita" title="Fecha de la cita" aria-label="Fecha de la cita" value="${escapeHtml(normalizeDateValue(appointment.date || ''))}" required />
                </div>
                <div class="col-6">
                  <label class="form-label small">Hora</label>
                  <input class="form-control form-control-sm" name="time" type="time" step="60" placeholder="Hora de la cita" title="Hora de la cita" aria-label="Hora de la cita" value="${escapeHtml(normalizeTimeValue(appointment.time || ''))}" required />
                </div>
                <div class="col-12 text-end mt-2">
                  <button class="btn btn-sm btn-primary" type="submit">Guardar</button>
                </div>
              </div>
            </form>
          ` : ''}
          ${mode === 'records' && isAttended ? `
            <form class="mt-2 border rounded p-2 bg-light" data-record-observations-form="${id}">
              <div class="small fw-semibold mb-1">Observación de la cita</div>
              <textarea class="form-control form-control-sm" name="admin_observations" rows="2" placeholder="Notas sobre esta atención...">${escapeHtml(adminObs)}</textarea>
              <button class="btn btn-sm btn-primary mt-1" type="submit">Guardar</button>
            </form>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

async function wireAppointmentInteractions(container, feedback, refresh) {
  if (container.dataset.adminWired === 'true') return;
  container.dataset.adminWired = 'true';

  container.addEventListener('click', async (ev) => {
    const deleteBtn = ev.target.closest('[data-delete-appointment]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-delete-appointment');
      if (!id) return;
      const restore = setLoading(deleteBtn, 'Eliminando...');
      try {
        if (!(await showFloatingConfirm('Eliminar esta cita?'))) return;
        await api.deleteAppointment(id);
        showMessage(feedback, 'Cita eliminada.', 'success');
        if (refresh) await refresh();
      } catch (err) {
        showMessage(feedback, err.message);
      } finally {
        restore();
      }
      return;
    }

    const toggle = ev.target.closest('[data-toggle-cancel]');
    if (toggle) {
      const id = toggle.getAttribute('data-toggle-cancel');
      const panel = container.querySelector(`[data-cancel-form="${CSS.escape(id)}"]`);
      if (panel) panel.classList.toggle('d-none');
      return;
    }

    const activateBtn = ev.target.closest('[data-activate-appointment]');
    if (activateBtn) {
      const id = activateBtn.getAttribute('data-activate-appointment');
      if (!id) return;
      const restore = setLoading(activateBtn, 'Guardando...');
      try {
        if (!(await showFloatingConfirm('Marcar esta cita como atendida?'))) return;
        await api.updateAppointmentStatus(id, { status: 'attended' });
        showMessage(feedback, 'Cita marcada como atendida', 'success');
        if (refresh) await refresh();
      } catch (err) {
        showMessage(feedback, err.message);
      } finally {
        restore();
      }
      return;
    }

    const editBtn = ev.target.closest('[data-edit-appointment]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-edit-appointment');
      const panel = container.querySelector(`[data-edit-form="${CSS.escape(id)}"]`);
      if (panel) panel.classList.toggle('d-none');
      return;
    }
  });

  container.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('[data-cancel-form], [data-edit-form]');
    if (!form) return;
    ev.preventDefault();

    if (form.hasAttribute('data-cancel-form')) {
      const id = form.getAttribute('data-cancel-form');
      const reason = String(form.querySelector('[name="reason"]')?.value || '').trim();
      const submit = form.querySelector('button[type="submit"]');
      const restore = setLoading(submit, 'Cancelando...');
      try {
        await api.cancelAppointment(id, { reason });
        showMessage(feedback, 'Cita cancelada.', 'success');
        if (refresh) await refresh();
      } catch (err) {
        showMessage(form.querySelector('[data-cancel-feedback]'), err.message);
      } finally {
        restore();
      }
      return;
    }

    if (form.hasAttribute('data-edit-form')) {
      const id = form.getAttribute('data-edit-form');
      const date = String(form.querySelector('[name="date"]')?.value || '').trim();
      const time = String(form.querySelector('[name="time"]')?.value || '').trim();
      const name = String(form.querySelector('[name="name"]')?.value || '').trim();
      const phone = String(form.querySelector('[name="phone"]')?.value || '').trim();
      const description = String(form.querySelector('[name="description"]')?.value || '').trim();
      const status = String(form.querySelector('[name="status"]')?.value || '').trim();
      const cancelReason = String(form.querySelector('[name="cancel_reason"]')?.value || '').trim();
      const submit = form.querySelector('button[type="submit"]');
      const restore = setLoading(submit, 'Guardando...');
      try {
        if (!date || !time) throw new Error('Fecha y hora son obligatorias');
        await api.updateAppointment(id, { date, time, name, phone, description, status, cancel_reason: cancelReason });
        showMessage(feedback, 'Cita actualizada', 'success');
        if (refresh) await refresh();
      } catch (err) {
        showMessage(form, err.message);
      } finally {
        restore();
      }
      return;
    }
  });
}

async function loadScheduleAdmin() {
  const feedback = document.querySelector('[data-admin-feedback]');
  if (!feedback) return;

  function formatDayLabel(day) {
    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    if (day === null || day === undefined || day === '') return 'Todos los días';
    const n = Number(day);
    return Number.isNaN(n) ? `Día ${day}` : dayNames[n] || `Día ${day}`;
  }

  function formatTimeDisplay(value) {
    if (!value) return '';
    const [hh, mm] = value.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return value;
    const date = new Date(1970, 0, 1, hh, mm);
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
  }

  // Load schedule settings (appointment interval)
  try {
    const settings = await api.getScheduleSettings();
    const minutes = settings && settings.appointment_interval_minutes ? Number(settings.appointment_interval_minutes) : null;
    const intervalInput = document.getElementById('appointment-interval');
    const saveBtn = document.getElementById('save-appointment-interval');
    if (intervalInput && minutes) intervalInput.value = minutes;
    if (saveBtn && !saveBtn.dataset.wired) {
      saveBtn.dataset.wired = 'true';
      saveBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const v = Number((document.getElementById('appointment-interval') || {}).value || 0);
        if (!v || v < 5) return showMessage(feedback, 'Ingresa un valor válido (>=5)');
        try {
          await api.updateScheduleSettings({ appointment_interval_minutes: v });
          showMessage(feedback, 'Intervalo guardado.', 'success');
        } catch (err) {
          showMessage(feedback, err.message);
        }
      });
    }
  } catch (err) {
    // ignore schedule settings load errors for now
  }

  // Load working hours and exceptions
  try {
    const wh = await api.listWorkingHours();
    const list = Array.isArray(wh) ? wh : (wh && wh.data) || [];
    const container = document.getElementById('working-hours-list');
    // Build schedule summary string
    const summaryEl = document.getElementById('schedule-summary');
    if (summaryEl) {
      if (list.length) {
        // Ensure day_of_week is treated as number, not string
        const normalizedList = list.map(w => ({ ...w, day_of_week: w.day_of_week !== null && w.day_of_week !== undefined ? Number(w.day_of_week) : null }));
        const lines = normalizedList.map(w => `${formatDayLabel(w.day_of_week)}: ${formatTimeDisplay(w.start_time)} - ${formatTimeDisplay(w.end_time)}${w.break_start ? ' (descanso ' + formatTimeDisplay(w.break_start) + ' - ' + formatTimeDisplay(w.break_end || '') + ')' : ''}`);
        const exceptions = await api.listScheduleExceptions().catch(() => []);
        const exList2 = Array.isArray(exceptions) ? exceptions : (exceptions && exceptions.data) || [];
        const exLines = exList2.map(e => {
          const dateStr = String(e.exception_date).slice(0, 10);
          const timeRange = e.start_time ? ` ${e.start_time.slice(0,5)}-${(e.end_time||'').slice(0,5)}` : ' (cerrado)';
          return `${dateStr}${timeRange}`;
        });
        const allLines = [...lines, ...(exLines.length ? ['', 'Excepciones:', ...exLines] : [])];
        summaryEl.innerHTML = allLines.map(l => `<div class="mb-1">${l}</div>`).join('');
      } else {
        summaryEl.innerHTML = '<div class="text-muted">No hay horario configurado.</div>';
      }
    }

    // Update the working hours list
    if (container) {
      const normalizedListForDisplay = list.map(w => ({ ...w, day_of_week: w.day_of_week !== null && w.day_of_week !== undefined ? Number(w.day_of_week) : null }));
      container.innerHTML = normalizedListForDisplay.length ? normalizedListForDisplay.map(w => {
        return `<div class="d-flex align-items-center gap-2 mb-2"><div class="flex-grow-1 small">${formatDayLabel(w.day_of_week)} ${formatTimeDisplay(w.start_time)} - ${formatTimeDisplay(w.end_time)}${w.break_start ? ' (descanso ' + formatTimeDisplay(w.break_start) + ' - ' + formatTimeDisplay(w.break_end || '') + ')' : ''}</div><button class="btn btn-sm btn-outline-danger" data-delete-wh="${w.id}">Eliminar</button></div>`;
      }).join('') : '<div class="text-muted small">No hay reglas de horario.</div>';
    }

    // Update the exceptions list
    const exceptions = await api.listScheduleExceptions();
    const exList = Array.isArray(exceptions) ? exceptions : (exceptions && exceptions.data) || [];
    const exContainer = document.getElementById('exceptions-list');
    if (exContainer) {
      exContainer.innerHTML = exList.length ? exList.map(e => {
        const dateStr = String(e.exception_date).slice(0, 10);
        const timeRange = e.start_time && e.end_time ? ` ${e.start_time.slice(0,5)}-${e.end_time.slice(0,5)}` : (e.start_time || e.end_time) ? ` ${(e.start_time||e.end_time).slice(0,5)}` : ' (cerrado)';
        return `<div class="d-flex align-items-center gap-2 mb-2"><div class="flex-grow-1 small">${dateStr}${timeRange}${e.reason ? ' (' + e.reason + ')' : ''}</div><button class="btn btn-sm btn-outline-danger" data-delete-ex="${e.id}">Eliminar</button></div>`;
      }).join('') : '<div class="text-muted small">No hay excepciones.</div>';
    }
  } catch (err) {
    // ignore
  }
}

async function wireScheduleForms() {
  const feedback = document.querySelector('[data-admin-feedback]');
  if (!feedback) return;

  // Wire delete working hours
  const container = document.getElementById('working-hours-list');
  if (container) {
    container.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-delete-wh]');
      if (!btn) return;
      const id = btn.getAttribute('data-delete-wh');
      try {
        await api.deleteWorkingHour(id);
        showMessage(feedback, 'Regla eliminada', 'success');
        loadScheduleAdmin();
      } catch (err) {
        showMessage(feedback, err.message);
      }
    });
  }

  // Wire delete exceptions
  const exContainer = document.getElementById('exceptions-list');
  if (exContainer) {
    exContainer.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-delete-ex]');
      if (!btn) return;
      const id = btn.getAttribute('data-delete-ex');
      try {
        await api.deleteScheduleException(id);
        showMessage(feedback, 'Excepción eliminada', 'success');
        loadScheduleAdmin();
      } catch (err) {
        showMessage(feedback, err.message);
      }
    });
  }

  // "Todos" checkbox toggle
  const allCheck = document.getElementById('wh-day-all');
  if (allCheck) {
    allCheck.addEventListener('change', () => {
      document.querySelectorAll('.wh-day-cb').forEach(cb => cb.checked = allCheck.checked);
    });
    document.querySelectorAll('.wh-day-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (!cb.checked) allCheck.checked = false;
      });
    });
  }

  // Wire working hour form submit
  const whForm = document.getElementById('working-hour-form');
  if (whForm) {
    whForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const checkedDays = Array.from(document.querySelectorAll('.wh-day-cb:checked')).map(cb => cb.value);
      const start = String(document.getElementById('wh-start')?.value || '').trim();
      const end = String(document.getElementById('wh-end')?.value || '').trim();
      const breakStart = String(document.getElementById('wh-break-start')?.value || '').trim();
      const breakEnd = String(document.getElementById('wh-break-end')?.value || '').trim();
      if (!start || !end) return showMessage(feedback, 'Inicio y fin son obligatorios');
      
      const allChecked = allCheck && allCheck.checked || checkedDays.length >= 7;
      const days = allChecked ? [null] : checkedDays.map(Number);
      
      if (!allChecked && checkedDays.length === 0) return showMessage(feedback, 'Selecciona al menos un día');
      
      try {
        // Save appointment interval
        const intervalVal = Number(document.getElementById('appointment-interval')?.value || 0);
        if (intervalVal >= 5) {
          await api.updateScheduleSettings({ appointment_interval_minutes: intervalVal });
        }
        // Delete all "all days" rules before creating specific ones
        if (!allChecked) {
          const existingWh = await api.listWorkingHours();
          if (Array.isArray(existingWh)) {
            for (const rule of existingWh) {
              if (rule.day_of_week === null || rule.day_of_week === undefined) {
                await api.deleteWorkingHour(rule.id);
              }
            }
          }
        }
        // Create the new rules
        for (const day of days) {
          await api.createWorkingHour({ day_of_week: day, start_time: start, end_time: end, break_start: breakStart || null, break_end: breakEnd || null, applies_forever: true, active: true });
        }
        showMessage(feedback, 'Regla(s) guardada(s)', 'success');
        loadScheduleAdmin();
      } catch (err) {
        showMessage(feedback, err.message);
      }
    });
  }

  // Wire exception form submit
  const exForm = document.getElementById('exception-form');
  if (exForm) {
    exForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const date = String(document.getElementById('ex-date')?.value || '').trim();
      const s = String(document.getElementById('ex-start')?.value || '').trim();
      const e = String(document.getElementById('ex-end')?.value || '').trim();
      const breakStart = String(document.getElementById('ex-break-start')?.value || '').trim();
      const breakEnd = String(document.getElementById('ex-break-end')?.value || '').trim();
      if (!date) return showMessage(feedback, 'Fecha requerida');
      try {
        await api.createScheduleException({ exception_date: date, start_time: s || null, end_time: e || null, break_start: breakStart || null, break_end: breakEnd || null, reason: null });
        showMessage(feedback, 'Excepción guardada', 'success');
        loadScheduleAdmin();
      } catch (err) {
        showMessage(feedback, err.message);
      }
    });
  }
}

async function loadAdminAppointments(mode = adminPageMode) {
  const feedback = document.querySelector('[data-admin-feedback]');
  const container = document.querySelector('[data-admin-appointments-list]');
  if (!container) return;
  clearMessage(feedback);
  await loadScheduleAdmin();

  try {
    const me = await api.me();
    let payload;
    if (String(me?.role || '').toLowerCase() === 'admin') {
      payload = await api.listAppointmentsByDay();
      const appointments = Array.isArray(payload?.data) ? payload.data : payload;
      const list = Array.isArray(appointments) ? appointments : [];
      const filtered = mode === 'history' ? list.filter(a => String(a.status || '').toLowerCase() !== 'pending') : list.filter(a => String(a.status || '').toLowerCase() === 'pending');
      container.innerHTML = (filtered.length ? filtered.map(renderAppointmentItem).join('') : '<div class="text-center text-muted py-4">No hay citas.</div>');
      await wireAppointmentInteractions(container, feedback, () => loadAdminAppointments(mode));
      return;
    }

    payload = await api.listMyAppointments();
    const appointments = Array.isArray(payload?.data) ? payload.data : payload;
    container.innerHTML = (appointments.length ? appointments.map(renderAppointmentItem).join('') : '<div class="text-center text-muted py-4">No tienes citas pendientes.</div>');
    await wireAppointmentInteractions(container, feedback, () => loadAdminAppointments(mode));
  } catch (err) {
    showMessage(feedback, err.message);
  }
}

initMobileNavToggle();

function formatDateDisplay(dateStr) {
  if (!dateStr) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  try {
    const dt = new Date(dateStr + 'T12:00:00');
    if (isNaN(dt.getTime())) return dateStr;
    return dt.toISOString().slice(0, 10);
  } catch { return dateStr; }
}

async function loadClinicalRecords() {
  const feedback = document.querySelector('[data-records-feedback]');
  const usersContainer = document.querySelector('[data-records-users]');
  const detailContainer = document.querySelector('[data-records-detail]');
  if (!usersContainer || !detailContainer) return;
  clearMessage(feedback);
  usersContainer.innerHTML = '<div class="text-muted p-3">Cargando usuari@s...</div>';
  detailContainer.innerHTML = '<div class="text-center text-muted py-5">Selecciona un@ usuari@ para ver su expediente.</div>';
  try {
    const currentAdmin = await api.me().catch(() => null);
    const usersPayload = await api.listUsers();
    const users = Array.isArray(usersPayload?.data) ? usersPayload.data : usersPayload;
    if (!Array.isArray(users) || !users.length) {
      usersContainer.innerHTML = '<div class="text-muted p-3">No hay usuari@s.</div>';
      detailContainer.innerHTML = '<div class="text-muted p-3">Selecciona un@ usuari@ para ver su expediente.</div>';
      return;
    }
    const usersById = new Map();
    usersContainer.innerHTML = users.map(u => {
      usersById.set(String(u.id), u);
      return `<button class="list-group-item list-group-item-action py-2" data-select-user="${escapeHtml(u.id)}">
        <div class="fw-semibold">${escapeHtml(u.name)}</div>
        <div class="small text-muted">${escapeHtml(u.phone)}</div>
      </button>`;
    }).join('');

    const showUserDetail = async (id) => {
      const user = usersById.get(String(id));
      if (!user) return;
      detailContainer.innerHTML = '<div class="text-center text-muted py-5">Cargando expediente...</div>';
      try {
        const userAppointments = (await api.listAppointmentsByDay()) || [];
        const appointments = Array.isArray(userAppointments?.data) ? userAppointments.data : userAppointments;
        const filtered = (Array.isArray(appointments) ? appointments : []).filter(a => String(a.user_id) === String(id));

        const allergies = String(user.allergies || '').trim();
        const bloodType = String(user.blood_type || '').trim();
        const chronicConditions = String(user.chronic_conditions || '').trim();
        const clinicalObs = String(user.clinical_observations || '').trim();
        const identification = String(user.identification || '').trim();
        const occupation = String(user.occupation || '').trim();
        const sex = String(user.sex || '').trim();
        const weight = String(user.weight || '').trim();
        const birthdate = formatDateDisplay(user.birthdate);

        detailContainer.innerHTML = `
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <div class="h5 mb-1">${escapeHtml(user.name)}</div>
              <div class="text-muted">${escapeHtml(user.phone)}</div>
              ${currentAdmin && String(currentAdmin.id) === String(user.id) ? '<span class="badge bg-info mt-1">Admin (Actual)</span>' : ''}
            </div>
            ${!currentAdmin || String(currentAdmin.id) !== String(user.id) ? `<button class="btn btn-outline-danger btn-sm" type="button" data-delete-user="${escapeHtml(user.id)}">Eliminar</button>` : ''}
          </div>

          <div class="row g-2 mb-3 border-bottom pb-3">
            ${birthdate ? `<div class="col-6 col-md-4"><div class="small text-muted">Fecha de nacimiento</div><div class="fw-semibold">${escapeHtml(birthdate)}</div></div>` : ''}
            ${sex ? `<div class="col-6 col-md-4"><div class="small text-muted">Sexo</div><div class="fw-semibold">${escapeHtml(sex)}</div></div>` : ''}
            ${weight ? `<div class="col-6 col-md-4"><div class="small text-muted">Peso</div><div class="fw-semibold">${escapeHtml(weight)} kg</div></div>` : ''}
            ${occupation ? `<div class="col-6 col-md-4"><div class="small text-muted">Ocupación</div><div class="fw-semibold">${escapeHtml(occupation)}</div></div>` : ''}
            ${identification ? `<div class="col-6 col-md-4"><div class="small text-muted">Identificación</div><div class="fw-semibold">${escapeHtml(identification)}</div></div>` : ''}
            ${allergies ? `<div class="col-6 col-md-4"><div class="small text-muted">Alergias</div><div class="fw-semibold">${escapeHtml(allergies)}</div></div>` : ''}
            ${bloodType ? `<div class="col-6 col-md-4"><div class="small text-muted">Tipo de sangre</div><div class="fw-semibold">${escapeHtml(bloodType)}</div></div>` : ''}
            ${chronicConditions ? `<div class="col-12"><div class="small text-muted">Condiciones crónicas</div><div class="fw-semibold">${escapeHtml(chronicConditions)}</div></div>` : ''}
            ${clinicalObs ? `<div class="col-12"><div class="small text-muted">Observaciones clínicas</div><div class="fw-semibold">${escapeHtml(clinicalObs)}</div></div>` : ''}
          </div>

          <div class="fw-semibold fs-6 mb-2">Historial de citas (${filtered.length})</div>
          <div class="record-appointments-list">
            ${filtered.length
              ? filtered.map(a => renderAppointmentItem(a, { mode: 'records' })).join('')
              : '<div class="text-muted">Sin citas registradas.</div>'
            }
          </div>
        `;

        detailContainer.querySelectorAll('[data-record-observations-form]').forEach(form => {
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const appointmentId = form.getAttribute('data-record-observations-form');
            const obs = String(form.querySelector('[name="admin_observations"]')?.value || '').trim();
            const btn = form.querySelector('button[type="submit"]');
            const restore = setLoading(btn, 'Guardando...');
            try {
              await api.updateAppointment(appointmentId, { admin_observations: obs });
              showMessage(feedback, 'Observación guardada.', 'success');
            } catch (err) {
              showMessage(feedback, err.message, 'danger');
            } finally { restore(); }
          });
        });

        const delBtnEl = detailContainer.querySelector('[data-delete-user]');
        if (delBtnEl) {
          delBtnEl.addEventListener('click', async (ev) => {
            const deleteBtn = ev.currentTarget;
            const restore = setLoading(deleteBtn, 'Eliminando...');
            if (!(await showFloatingConfirm('¿Eliminar este usuari@ y todos sus datos?'))) {
              restore();
              return;
            }
            detailContainer.innerHTML = '<div class="text-muted p-3">Eliminando usuari@...</div>';
            usersContainer.innerHTML = '<div class="text-muted p-3">Actualizando lista...</div>';
            try {
              await api.deleteUser(user.id);
              showMessage(feedback, 'Usuari@ eliminado.', 'success');
              await loadClinicalRecords();
            } catch (err) {
              showMessage(feedback, err.message);
            } finally { restore(); }
          });
        }
      } catch (err) {
        showMessage(feedback, err.message);
      }
    };

    usersContainer.querySelectorAll('[data-select-user]').forEach(btn => {
      btn.addEventListener('click', () => showUserDetail(btn.getAttribute('data-select-user')));
    });
  } catch (err) {
    showMessage(feedback, err.message);
  }
}

// Initialize
const appointmentsContainer = document.querySelector('[data-admin-appointments-list]');
if (appointmentsContainer) {
  loadAdminAppointments(adminPageMode);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadAdminAppointments(adminPageMode);
    }
  });
  window.addEventListener('focus', () => loadAdminAppointments(adminPageMode));
}
// On admin-schedule.html: load schedule admin and wire forms
loadScheduleAdmin();
wireScheduleForms();

const recordsContainer = document.querySelector('[data-records-users]');
if (recordsContainer) loadClinicalRecords();

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await api.logout(); } catch {};
    api.clearAuthToken?.();
    window.location.assign('./index.html');
  });
}