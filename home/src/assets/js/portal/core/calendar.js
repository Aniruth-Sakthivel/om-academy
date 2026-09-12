/*
Author       : OM Academy
Description  : FullCalendar wrapper (month + list views; timeGridWeek for the student class timetable).
               Loaded lazily — only pages with a calendar pay the cost. Colours are set per event from EVENT_TONES.
*/

const EVENT_TONES = {
  holiday: { bg: "#fde7e7", border: "#c23a3a", text: "#7a2323" },
  event: { bg: "#e8edfa", border: "#23459d", text: "#1a3475" },
  exam: { bg: "#fbeedd", border: "#b3781b", text: "#7a501a" },
  deadline: { bg: "#f1e8fb", border: "#7a4fc9", text: "#4e2f8c" },
  class: { bg: "#e6f6ed", border: "#1f9d55", text: "#155c33" },
  cancellation: { bg: "#eceef1", border: "#64748b", text: "#3a4250" },
};

export const toneForType = (type) => EVENT_TONES[type] || EVENT_TONES.event;

export function toFcEvent(e) {
  const tone = toneForType(e.type);
  return {
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: !!e.allDay,
    backgroundColor: tone.bg,
    borderColor: tone.border,
    textColor: tone.text,
    extendedProps: { type: e.type, description: e.description, raw: e },
  };
}

let Calendar, dayGridPlugin, listPlugin, interactionPlugin, timeGridPlugin;

async function loadCore() {
  if (!Calendar) {
    const [core, daygrid, list, interaction] = await Promise.all([
      import("@fullcalendar/core"),
      import("@fullcalendar/daygrid"),
      import("@fullcalendar/list"),
      import("@fullcalendar/interaction"),
    ]);
    Calendar = core.Calendar;
    dayGridPlugin = daygrid.default;
    listPlugin = list.default;
    interactionPlugin = interaction.default;
  }
  return { Calendar, dayGridPlugin, listPlugin, interactionPlugin };
}

/**
 * Month calendar with an agenda (list) view for narrow screens.
 * onEventClick(fcEvent) is called with the FullCalendar event; use .extendedProps.raw for the source record.
 */
export async function monthCalendar(el, { events, initialDate, onEventClick, onDateClick, mobile = false } = {}) {
  const { Calendar: C, dayGridPlugin: dg, listPlugin: lp, interactionPlugin: ip } = await loadCore();
  const calendar = new C(el, {
    plugins: [dg, lp, ip],
    initialView: mobile ? "listMonth" : "dayGridMonth",
    initialDate,
    height: "auto",
    firstDay: 1,
    headerToolbar: { start: "prev,next today", center: "title", end: mobile ? "" : "dayGridMonth,listMonth" },
    events: events.map(toFcEvent),
    eventClick: onEventClick ? (info) => onEventClick(info.event) : undefined,
    dateClick: onDateClick,
    dayMaxEventRows: 3,
    noEventsContent: "No events in this range.",
  });
  calendar.render();
  return calendar;
}

/** Weekly timetable grid (Mon–Sun, class-hour rows) for the student class schedule. */
export async function weekTimetable(el, { events, businessHours, slotMin = "08:00:00", slotMax = "20:00:00", onEventClick } = {}) {
  const core = await import("@fullcalendar/core");
  const timegrid = await import("@fullcalendar/timegrid");
  const interaction = await import("@fullcalendar/interaction");
  const calendar = new core.Calendar(el, {
    plugins: [timegrid.default, interaction.default],
    initialView: "timeGridWeek",
    height: "auto",
    firstDay: 1,
    headerToolbar: false,
    dayHeaderFormat: { weekday: "short" },
    allDaySlot: false,
    slotMinTime: slotMin,
    slotMaxTime: slotMax,
    slotDuration: "01:00:00",
    nowIndicator: false,
    businessHours,
    events: events.map(toFcEvent),
    eventClick: onEventClick ? (info) => onEventClick(info.event) : undefined,
  });
  calendar.render();
  return calendar;
}
