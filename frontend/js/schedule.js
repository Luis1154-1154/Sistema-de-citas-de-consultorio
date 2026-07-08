import { api } from './api-client.js';

const DAY_NAMES_SHORT = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function formatTime(timeStr) {
  if (!timeStr) return null;
  return timeStr.slice(0, 5);
}

function buildScheduleText(workingHours) {
  if (!workingHours || workingHours.length === 0) return null;

  // Normalize day_of_week to ensure 0 is treated as valid (Sunday), not falsy
  const normalized = workingHours.map(wh => ({
    ...wh,
    day_of_week: wh.day_of_week !== null && wh.day_of_week !== undefined ? Number(wh.day_of_week) : null
  }));

  // Filter: if there are specific day rules, only show the specific ones (avoid duplicates with "all days" rules)
  const hasSpecificDays = normalized.some(wh => wh.day_of_week !== null);
  const filtered = hasSpecificDays
    ? normalized.filter(wh => wh.day_of_week !== null)
    : normalized;

  // Sort by day_of_week
  const sorted = [...filtered].sort((a, b) => {
    const aDay = a.day_of_week !== null ? Number(a.day_of_week) : 0;
    const bDay = b.day_of_week !== null ? Number(b.day_of_week) : 0;
    return aDay - bDay;
  });

  // Show each rule individually
  return sorted.map((wh) => {
    const start = formatTime(wh.start_time);
    const end = formatTime(wh.end_time);

    let daysStr;
    if (wh.day_of_week === null || wh.day_of_week === undefined) {
      daysStr = 'todos los días';
    } else {
      const dayIndex = Number(wh.day_of_week);
      daysStr = DAY_NAMES_SHORT[dayIndex] || `día ${dayIndex}`;
    }

    daysStr = daysStr.charAt(0).toUpperCase() + daysStr.slice(1);

    let text = `${daysStr}: ${start} a ${end}`;

    if (wh.break_start && wh.break_end) {
      const breakStart = formatTime(wh.break_start);
      const breakEnd = formatTime(wh.break_end);
      text += ` (descanso ${breakStart} a ${breakEnd})`;
    }

    return text + '.';
  }).join(' ');
}

function buildExceptionsText(exceptions) {
  if (!exceptions || exceptions.length === 0) return null;

  const lines = exceptions
    .sort((a, b) => a.exception_date.localeCompare(b.exception_date))
    .map((ex) => {
      const date = new Date(ex.exception_date + 'T00:00:00');
      const dateStr = date.toLocaleDateString('es-MX', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const start = ex.start_time ? formatTime(ex.start_time) : null;
      const end = ex.end_time ? formatTime(ex.end_time) : null;

      const breakStart = ex.break_start ? formatTime(ex.break_start) : null;
      const breakEnd = ex.break_end ? formatTime(ex.break_end) : null;

      if (start && end) {
        let text = `atenderemos de ${start} a ${end}`;
        if (breakStart && breakEnd) {
          text += ` (descanso ${breakStart} a ${breakEnd})`;
        }
        return `${dateStr}: ${text}.`;
      }
      return `${dateStr}: no habrá atención.`;
    });

  return 'Excepciones: ' + lines.join(' ');
}

async function loadSchedule() {
  const feedbackEl = document.querySelector('[data-schedule-feedback]');
  const scheduleDisplay = document.getElementById('schedule-display');
  const scheduleText = document.getElementById('schedule-text');
  const exceptionsText = document.getElementById('exceptions-text');
  const noSchedule = document.getElementById('no-schedule');

  try {
    const [workingHours, exceptions, settings] = await Promise.all([
      api.listWorkingHours(),
      api.listScheduleExceptions(),
      api.getScheduleSettings().catch(() => null),
    ]);

    const text = buildScheduleText(workingHours);
    const excText = buildExceptionsText(exceptions);

    if (text) {
      const interval = settings && settings.appointment_interval_minutes ? Number(settings.appointment_interval_minutes) : 30;
      const intervalText = `Las citas se agendan cada ${interval} minutos.`;
      scheduleDisplay.style.display = '';
      noSchedule.style.display = 'none';
      scheduleText.innerHTML = text + '<br /><span class="text-muted" style="font-size: 0.9rem;">' + intervalText + '</span>';
      exceptionsText.textContent = excText || '';
    } else {
      scheduleDisplay.style.display = 'none';
      noSchedule.style.display = '';
      document.querySelector('[data-schedule-feedback]').innerHTML = '<div class="text-center text-muted py-3">Cargando horario...</div>';
    }
  } catch (err) {
    console.error('Error al cargar horario:', err);
    scheduleDisplay.style.display = 'none';
    noSchedule.style.display = 'none';
    feedbackEl.innerHTML = `<div class="alert alert-danger mb-0">Error al cargar el horario: ${err.message}</div>`;
  }
}

// Load the schedule directly — GET endpoints are public
loadSchedule();
