import { api } from './api-client.js';
import { clearMessage, initMobileNavToggle, setLoading, showMessage } from './ui-utils.js';
import { normalizePhone, isValidPhone } from './app-config.js';

let isAdminSession = false;

async function configurePageForSession() {
  try {
    const payload = await api.me();
    const historyLink = document.getElementById('history-link');
    const adminFields = document.getElementById('admin-user-fields');
    const adminHelp = document.getElementById('admin-appointment-help');
    if (historyLink && payload?.role === 'admin') {
      historyLink.style.display = 'block';
    }

    if (payload?.role === 'admin') {
      isAdminSession = true;
      if (adminFields) adminFields.classList.remove('d-none');
      if (adminHelp) adminHelp.classList.remove('d-none');
    }
  } catch {
    // No session or invalid token, ignore.
  }
}

configurePageForSession();

// Load and display schedule info
async function loadScheduleInfo() {
  const scheduleEl = document.getElementById('schedule-info');
  if (!scheduleEl) return;
  try {
    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const whResp = await api.listWorkingHours().catch(() => []);
    const exceptions = await api.listScheduleExceptions().catch(() => []);
    const baseRules = Array.isArray(whResp) ? whResp : (whResp && whResp.data) || [];
    // Normalize day_of_week to ensure 0 (Sunday) is treated as valid, not falsy
    const rules = baseRules.map(r => ({
      ...r,
      day_of_week: r.day_of_week !== null && r.day_of_week !== undefined ? Number(r.day_of_week) : null
    }));
    const exList = Array.isArray(exceptions) ? exceptions : (exceptions && exceptions.data) || [];

    if (!rules.length) { scheduleEl.classList.add('d-none'); return; }

    const formatTime = (v) => {
      if (!v) return '';
      const [hh, mm] = v.split(':').map(Number);
      if (isNaN(hh) || isNaN(mm)) return v;
      const dt = new Date(1970,0,1,hh,mm);
      return new Intl.DateTimeFormat('es-MX', { hour:'2-digit', minute:'2-digit', hour12:true }).format(dt);
    };

    let html = '<div class="fw-semibold mb-1">Horario de atención:</div>';
    html += rules.map(r => {
      const day = r.day_of_week !== null && r.day_of_week !== undefined ? dayNames[Number(r.day_of_week)] : 'Todos los días';
      const breakStr = r.break_start ? ` (descanso ${formatTime(r.break_start)}-${formatTime(r.break_end || '')})` : '';
      return `<div class="mb-1">${day}: ${formatTime(r.start_time)} - ${formatTime(r.end_time)}${breakStr}</div>`;
    }).join('');

    if (exList.length) {
      html += '<div class="fw-semibold mt-2 mb-1">Excepciones próximas:</div>';
      html += exList.map(e => `<div class="mb-1">${String(e.exception_date).slice(0,10)}${e.start_time ? ' ' + formatTime(e.start_time) + '-' + formatTime(e.end_time) : ' (cerrado)'}</div>`).join('');
    }

    scheduleEl.innerHTML = html;
    scheduleEl.classList.remove('d-none');
  } catch { scheduleEl.classList.add('d-none'); }
}
loadScheduleInfo();

const form = document.querySelector('[data-appointment-create-form]');
if (form) {
  const feedback = document.querySelector('[data-create-feedback]');
  const submitButton = form.querySelector('button[type="submit"]');
  const dateInput = form.querySelector('[name="date"]');
  const timeInput = form.querySelector('[name="time"]');
  const timeSelect = timeInput && timeInput.tagName === 'SELECT' ? timeInput : null;

  const userNameInput = document.getElementById('user-name');
  const userPhoneInput = document.getElementById('user-phone');

  function formatTimeDisplay(value) {
    if (!value) return '';
    const [hh, mm] = value.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return value;
    const date = new Date(1970, 0, 1, hh, mm);
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
  }

  if (dateInput) {
    dateInput.min = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener('change', populateTimeOptions);
  }

  function setTimePlaceholder() {
    if (!timeSelect) return;
    timeSelect.innerHTML = '<option value="" disabled selected>Selecciona fecha</option>';
  }

  // Populate time select using appointment interval setting
  async function populateTimeOptions() {
    if (!timeSelect || !dateInput) return;
    const date = String(dateInput.value || '').trim();
    if (!date) {
      setTimePlaceholder();
      return;
    }

    try {
      const settings = await api.getScheduleSettings();
      const minutes = settings && settings.appointment_interval_minutes ? Number(settings.appointment_interval_minutes) : 30;
      const whResp = await api.listWorkingHours().catch(() => []);
      const exceptions = await api.listScheduleExceptions().catch(() => []);
      const apps = await api.getAppointmentsByDate(date).catch(() => []);
      const baseRules = Array.isArray(whResp) ? whResp : (whResp && whResp.data) || [];
      // Normalize day_of_week to ensure 0 (Sunday) is treated as valid
      const rules = baseRules.map(r => ({
        ...r,
        day_of_week: r.day_of_week !== null && r.day_of_week !== undefined ? Number(r.day_of_week) : null
      }));
      const exList = Array.isArray(exceptions) ? exceptions : (exceptions && exceptions.data) || [];
      const taken = Array.isArray(apps) ? apps.map(a => String(a.time).slice(0,5)) : [];

      timeSelect.innerHTML = '';
      // determine weekday
      const targetDay = date ? new Date(date).getDay() : null;
      for (const r of rules.filter(rr => rr.active == 1 && (rr.day_of_week === null || rr.day_of_week === undefined || Number(rr.day_of_week) === targetDay))) {
        const start = r.start_time;
        const end = r.end_time;
        const breakStart = r.break_start;
        const breakEnd = r.break_end;
        if (!start || !end) continue;
        // iterate in minutes
        let [sh, sm] = start.split(':').map(Number);
        let [eh, em] = end.split(':').map(Number);
        let current = new Date(1970,0,1, sh, sm, 0);
        const endDt = new Date(1970,0,1, eh, em, 0);
        while (current < endDt) {
          const hh = String(current.getHours()).padStart(2,'0');
          const mm = String(current.getMinutes()).padStart(2,'0');
          const value = `${hh}:${mm}`;
          // skip break
          if (breakStart && breakEnd) {
            const bStart = new Date(1970,0,1, ...breakStart.split(':').map(Number));
            const bEnd = new Date(1970,0,1, ...breakEnd.split(':').map(Number));
            if (current >= bStart && current < bEnd) {
              current = new Date(current.getTime() + minutes * 60000);
              continue;
            }
          }
          // check exceptions that block this slot
          const blocked = exList.find(ex => String(ex.exception_date).slice(0,10) === String(date).slice(0,10) && (!ex.start_time && !ex.end_time || (ex.start_time && ex.end_time && value >= ex.start_time && value < ex.end_time)));
          if (!blocked && !taken.includes(value)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = formatTimeDisplay(value);
            timeSelect.appendChild(option);
          }
          current = new Date(current.getTime() + minutes * 60000);
        }
      }
    } catch (e) {
      // fallback: basic options
      const settings = await api.getScheduleSettings().catch(() => null);
      const minutes = settings && settings.appointment_interval_minutes ? Number(settings.appointment_interval_minutes) : 30;
      const start = 8; const end = 18;
      timeSelect.innerHTML = '';
      for (let h = start; h < end; h++) for (let m = 0; m < 60; m += minutes) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const option = document.createElement('option'); option.value = `${hh}:${mm}`; option.textContent = `${hh}:${mm}`; timeSelect.appendChild(option);
      }
    }
  }

  populateTimeOptions();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage(feedback);

    const date = String(dateInput?.value || '').trim();
    const time = String(timeInput?.value || '').trim();
    const description = String(form.querySelector('[name="description"]')?.value || '').trim();

    if (!date || !time) {
      showMessage(feedback, 'La fecha y la hora son obligatorias.');
      return;
    }

    const body = { date, time, description };
    let redirectTarget = './appointments.html';

    if (isAdminSession) {
      const name = String(userNameInput?.value || '').trim();
      const phone = normalizePhone(String(userPhoneInput?.value || '').trim());
      if (!name || !phone) {
        showMessage(feedback, 'Nombre y teléfono del paciente son obligatorios para crear la cita.');
        return;
      }
      if (!isValidPhone(phone)) {
        showMessage(feedback, 'El teléfono debe tener 10 dígitos. Ejemplo: 3123456789');
        return;
      }
      body.name = name;
      body.phone = phone;
      redirectTarget = './admin-appointments.html';
    }

    const restore = setLoading(submitButton, 'Agendando...');
    try {
      if (isAdminSession) {
        await api.adminCreateAppointment(body);
      } else {
        await api.createAppointment(body);
      }
      window.location.assign(redirectTarget);
    } catch (error) {
      showMessage(feedback, error.message);
    } finally {
      restore();
    }
  });
}

// logout button handler (if present)
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await api.logout(); } catch (e) { }
    api.clearAuthToken();
    window.location.assign('./index.html');
  });
}

initMobileNavToggle();
