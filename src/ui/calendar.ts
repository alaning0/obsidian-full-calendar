/**
 * Handles rendering the calendar given a container element, eventSources, and interaction callbacks.
 */
import {
    Calendar,
    EventApi,
    EventClickArg,
    EventHoveringArg,
    EventSourceInput,
} from "@fullcalendar/core";
import { NowTimer } from "@fullcalendar/common";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import rrulePlugin from "@fullcalendar/rrule";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import googleCalendarPlugin from "@fullcalendar/google-calendar";
import iCalendarPlugin from "@fullcalendar/icalendar";

// There is an issue with FullCalendar RRule support around DST boundaries which is fixed by this monkeypatch:
// https://github.com/fullcalendar/fullcalendar/issues/5273#issuecomment-1360459342
rrulePlugin.recurringTypes[0].expand = function (errd, fr, de) {
    const hours = errd.rruleSet._dtstart.getHours();
    return errd.rruleSet
        .between(de.toDate(fr.start), de.toDate(fr.end), true)
        .map((d: Date) => {
            return new Date(
                Date.UTC(
                    d.getFullYear(),
                    d.getMonth(),
                    d.getDate(),
                    hours,
                    d.getMinutes()
                )
            );
        });
};

// FullCalendar's NowTimer precomputes the next "today" before sleeping; after wake
// it can apply a stale day. Always recompute, and refresh when the tab becomes visible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NowTimerProto = NowTimer.prototype as any;

NowTimerProto.componentDidMount = function () {
    this.setTimeout();
    this.handleVisibility = () => {
        if (!document.hidden) {
            this.refreshNow();
        }
    };
    document.addEventListener("visibilitychange", this.handleVisibility);
};

NowTimerProto.componentWillUnmount = function () {
    this.clearTimeout();
    if (this.handleVisibility) {
        document.removeEventListener("visibilitychange", this.handleVisibility);
    }
};

NowTimerProto.refreshNow = function () {
    this.clearTimeout();
    const timing = this.computeTiming();
    this.setState(timing.currentState, () => {
        this.setTimeout();
    });
};

NowTimerProto.setTimeout = function () {
    const waitMs = this.computeTiming().waitMs;
    this.timeoutId = setTimeout(() => {
        this.refreshNow();
    }, waitMs);
};

/** Find the nearest ancestor that can scroll vertically. */
function getScrollableParent(el: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = el.parentElement;
    let fallback: HTMLElement | null = null;
    while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if (
            overflowY === "auto" ||
            overflowY === "scroll" ||
            overflowY === "overlay"
        ) {
            if (node.scrollHeight > node.clientHeight + 1) {
                return node;
            }
            if (!fallback) {
                fallback = node;
            }
        }
        node = node.parentElement;
    }
    return fallback;
}

function localDateISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Resolve the year-view root. FC names the class from viewSpec.type
 * (`fc-dayGridYear-view`). Also accept ofc tag / legacy selectors.
 */
function getYearViewEl(
    calEl: HTMLElement,
    fallback?: HTMLElement | null
): HTMLElement | null {
    return (
        (calEl.querySelector(".fc-dayGridYear-view") as HTMLElement | null) ||
        (calEl.querySelector(".ofc-year-overview") as HTMLElement | null) ||
        (calEl.querySelector(".fc-dayGrid-view") as HTMLElement | null) ||
        fallback ||
        null
    );
}

function setYearMode(calEl: HTMLElement, enabled: boolean) {
    calEl.classList.toggle("ofc-year-mode", enabled);
}

/** Scroll the year overview so today is in view. Retries while layout settles. */
function scrollYearViewToToday(rootEl: HTMLElement) {
    const run = (): boolean => {
        const todayStr = localDateISO(new Date());
        const scope = (rootEl.closest(".fc") as HTMLElement | null) || rootEl;
        const todayEl =
            (rootEl.querySelector(
                `.fc-daygrid-day[data-date="${todayStr}"]`
            ) as HTMLElement | null) ||
            (rootEl.querySelector(".fc-day-today") as HTMLElement | null) ||
            (scope.querySelector(
                `.fc-daygrid-day[data-date="${todayStr}"]`
            ) as HTMLElement | null) ||
            (scope.querySelector(".fc-day-today") as HTMLElement | null);
        if (!todayEl) {
            return false;
        }

        todayEl.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "auto",
        });

        const scroller = getScrollableParent(todayEl);
        if (scroller) {
            const offset =
                todayEl.getBoundingClientRect().top -
                scroller.getBoundingClientRect().top +
                scroller.scrollTop -
                scroller.clientHeight / 3;
            scroller.scrollTop = Math.max(0, offset);
        }
        return true;
    };

    // Headers + contentHeight:auto layout take a few frames to settle.
    [0, 50, 150, 300, 600, 1000, 2000].forEach((ms) => {
        window.setTimeout(() => {
            run();
        }, ms);
    });
}

/** Insert a sticky month banner above the week that contains the 1st. */
function ensureMonthHeaderForDay(
    dayEl: HTMLElement,
    formatDate: (date: Date, options: { month: string; year: string }) => string
) {
    const dateStr = dayEl.getAttribute("data-date");
    if (!dateStr || !dateStr.endsWith("-01")) {
        return;
    }
    const row = dayEl.closest("tr");
    const parent = row?.parentElement;
    if (
        !row ||
        !parent ||
        row.previousElementSibling?.classList.contains("ofc-year-month-row")
    ) {
        return;
    }
    const [y, m] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    const monthRow = document.createElement("tr");
    monthRow.className = "ofc-year-month-row";
    const cell = document.createElement("td");
    // dayGrid week numbers sit inside the first day cell (not an extra <td>).
    cell.colSpan = row.children.length || 7;
    cell.className = "ofc-year-month-header";
    cell.textContent = formatDate(date, {
        month: "long",
        year: "numeric",
    });
    monthRow.appendChild(cell);
    parent.insertBefore(monthRow, row);
}

/** Insert sticky month banners into the year overview only. */
function injectYearMonthHeaders(
    rootEl: HTMLElement,
    formatDate: (date: Date, options: { month: string; year: string }) => string
) {
    rootEl.classList.add("ofc-year-overview");
    rootEl.querySelectorAll(".ofc-year-month-row").forEach((el) => el.remove());

    rootEl
        .querySelectorAll('.fc-daygrid-day[data-date$="-01"]')
        .forEach((dayEl) => {
            ensureMonthHeaderForDay(dayEl as HTMLElement, formatDate);
        });
}

function clearYearMonthHeaders(rootEl: HTMLElement) {
    setYearMode(rootEl, false);
    rootEl.classList.remove("ofc-year-overview");
    rootEl
        .querySelectorAll(".ofc-year-overview")
        .forEach((el) => el.classList.remove("ofc-year-overview"));
    rootEl.querySelectorAll(".ofc-year-month-row").forEach((el) => el.remove());
}

/** Paint year chrome (headers + scroll) with retries after FC redraws. */
function paintYearOverview(
    calEl: HTMLElement,
    formatDate: (
        date: Date,
        options: { month: string; year: string }
    ) => string,
    fallbackViewEl?: HTMLElement | null
) {
    setYearMode(calEl, true);
    const inject = () => {
        const viewEl = getYearViewEl(calEl, fallbackViewEl);
        if (!viewEl) {
            return null;
        }
        injectYearMonthHeaders(viewEl, formatDate);
        return viewEl;
    };
    const first = inject();
    if (first) {
        scrollYearViewToToday(first);
    }
    window.requestAnimationFrame(() => {
        inject();
        [0, 50, 150, 300, 600, 1000].forEach((ms) => {
            window.setTimeout(() => {
                const viewEl = inject();
                if (viewEl && (ms === 300 || ms === 1000)) {
                    scrollYearViewToToday(viewEl);
                }
            }, ms);
        });
    });
}

interface ExtraRenderProps {
    eventClick?: (info: EventClickArg) => void;
    select?: (
        startDate: Date,
        endDate: Date,
        allDay: boolean,
        viewType: string
    ) => Promise<void>;
    modifyEvent?: (event: EventApi, oldEvent: EventApi) => Promise<boolean>;
    eventMouseEnter?: (info: EventHoveringArg) => void;
    firstDay?: number;
    initialView?: { desktop: string; mobile: string; sidebar?: string };
    timeFormat24h?: boolean;
    openContextMenuForEvent?: (
        event: EventApi,
        mouseEvent: MouseEvent
    ) => Promise<void>;
    toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
    forceNarrow?: boolean;
    /** Open the daily/periodic note for this calendar day (day-number clicks). */
    openDailyNote?: (date: Date) => Promise<void>;
    /** Open the weekly periodic note for this week (week-number clicks). */
    openWeeklyNote?: (date: Date) => Promise<void>;
}

export function renderCalendar(
    containerEl: HTMLElement,
    eventSources: EventSourceInput[],
    settings?: ExtraRenderProps
): Calendar {
    const isMobile = window.innerWidth < 500;
    // Sidebar uses forceNarrow on desktop; real phones use width.
    const isSidebar = !!settings?.forceNarrow && !isMobile;
    const isNarrow = settings?.forceNarrow || isMobile;
    const {
        eventClick,
        select,
        modifyEvent,
        eventMouseEnter,
        openContextMenuForEvent,
        toggleTask,
        openDailyNote,
        openWeeklyNote,
    } = settings || {};
    const modifyEventCallback =
        modifyEvent &&
        (async ({
            event,
            oldEvent,
            revert,
        }: {
            event: EventApi;
            oldEvent: EventApi;
            revert: () => void;
        }) => {
            const success = await modifyEvent(event, oldEvent);
            if (!success) {
                revert();
            }
        });

    const initialView = isSidebar
        ? settings?.initialView?.sidebar || "timeGridWeek"
        : settings?.initialView?.[isNarrow ? "mobile" : "desktop"] ||
          (isNarrow ? "timeGrid3Days" : "timeGridWeek");

    // FullCalendar disables the built-in "today" button whenever the visible
    // range already includes today (week/month). Use a custom button so it
    // stays clickable and can still jump/scroll to now.
    let cal: Calendar;
    cal = new Calendar(containerEl, {
        plugins: [
            // View plugins
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            // Drag + drop and editing
            interactionPlugin,
            // Remote sources
            googleCalendarPlugin,
            iCalendarPlugin,
            rrulePlugin,
        ],
        googleCalendarApiKey: "AIzaSyDIiklFwJXaLWuT_4y6I9ZRVVsPuf4xGrk",
        initialView,
        nowIndicator: true,
        scrollTimeReset: false,
        dayMaxEvents: true,
        customButtons: {
            goToday: {
                text: "today",
                hint: "Go to today",
                click: () => {
                    cal.today();
                },
            },
        },

        headerToolbar: !isNarrow
            ? {
                  left: "prev,next goToday",
                  center: "title",
                  right: "dayGridYear,dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }
            : !isMobile
            ? {
                  right: "goToday,prev,next",
                  left: "timeGridWeek,timeGrid3Days,timeGridDay,listWeek",
              }
            : false,
        footerToolbar: isMobile
            ? {
                  right: "goToday,prev,next",
                  left: "timeGridWeek,timeGrid3Days,timeGridDay,listWeek",
              }
            : false,

        views: {
            dayGridYear: {
                type: "dayGrid",
                duration: { years: 1 },
                dateAlignment: "year",
                buttonText: "year",
                titleFormat: { year: "numeric" },
                // Let the year grow naturally so the Obsidian pane scrolls
                // (default expandRows squashes ~52 weeks into the viewport).
                contentHeight: "auto",
                // Dense “big picture” year: dots/short titles, limited per day.
                dayMaxEvents: 3,
                eventDisplay: "list-item",
            },
            timeGridDay: {
                type: "timeGrid",
                duration: { days: 1 },
                buttonText: isNarrow ? "1" : "day",
            },
            timeGridWeek: {
                type: "timeGrid",
                duration: { weeks: 1 },
                buttonText: isNarrow ? "7" : "week",
            },
            timeGrid3Days: {
                type: "timeGrid",
                duration: { days: 3 },
                buttonText: "3",
            },
        },
        firstDay: settings?.firstDay,
        // Left week-number rail (dayGrid: badge on first day of each week).
        weekNumbers: true,
        weekNumberCalculation: "ISO",
        weekText: "W",
        ...(settings?.timeFormat24h && {
            eventTimeFormat: {
                hour: "numeric",
                minute: "2-digit",
                hour12: false,
            },
            slotLabelFormat: {
                hour: "numeric",
                minute: "2-digit",
                hour12: false,
            },
        }),
        eventSources,
        eventClick,

        selectable: select && true,
        selectMirror: select && true,
        select:
            select &&
            (async (info) => {
                await select(info.start, info.end, info.allDay, info.view.type);
                info.view.calendar.unselect();
            }),

        editable: modifyEvent && true,
        eventDrop: modifyEventCallback,
        eventResize: modifyEventCallback,

        eventMouseEnter,

        dayCellDidMount: (info) => {
            // Re-inject on each cell mount so FC event redraws don't wipe banners.
            if (info.view.type === "dayGridYear") {
                const viewRoot =
                    (info.el.closest(".fc-view") as HTMLElement | null) ||
                    getYearViewEl(cal.el);
                viewRoot?.classList.add("ofc-year-overview");
                setYearMode(cal.el, true);
                ensureMonthHeaderForDay(info.el, (date, options) =>
                    info.view.calendar.formatDate(date, options)
                );
            }

            // Week number sits on the first day cell of each row.
            if (openWeeklyNote) {
                const weekNumberEl = info.el.querySelector(
                    ".fc-daygrid-week-number"
                ) as HTMLElement | null;
                if (weekNumberEl) {
                    weekNumberEl.addEventListener("mousedown", (e) => {
                        e.stopPropagation();
                    });
                    weekNumberEl.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void openWeeklyNote(info.date);
                    });
                }
            }

            if (!openDailyNote) {
                return;
            }
            const dayNumberEl = info.el.querySelector(
                ".fc-daygrid-day-number"
            ) as HTMLElement | null;
            if (!dayNumberEl) {
                return;
            }
            // Stop selection/create-event when interacting with the day number.
            dayNumberEl.addEventListener("mousedown", (e) => {
                e.stopPropagation();
            });
            dayNumberEl.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                void openDailyNote(info.date);
            });
        },

        viewDidMount: (info) => {
            // Always clear from the whole calendar; month view must never keep these.
            clearYearMonthHeaders(cal.el);

            if (info.view.type !== "dayGridYear") {
                return;
            }

            const fallback =
                (info.el.closest(".fc-view") as HTMLElement | null) || info.el;
            paintYearOverview(
                cal.el,
                (date, options) => info.view.calendar.formatDate(date, options),
                fallback
            );
        },

        datesSet: (info) => {
            if (info.view.type !== "dayGridYear") {
                clearYearMonthHeaders(cal.el);
                return;
            }
            paintYearOverview(cal.el, (date, options) =>
                info.view.calendar.formatDate(date, options)
            );
        },

        eventDidMount: ({ event, el, textColor }) => {
            el.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                openContextMenuForEvent && openContextMenuForEvent(event, e);
            });
            if (toggleTask) {
                if (event.extendedProps.isTask) {
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.checked =
                        event.extendedProps.taskCompleted !== false;
                    checkbox.onclick = async (e) => {
                        e.stopPropagation();
                        if (e.target) {
                            let ret = await toggleTask(
                                event,
                                (e.target as HTMLInputElement).checked
                            );
                            if (!ret) {
                                (e.target as HTMLInputElement).checked = !(
                                    e.target as HTMLInputElement
                                ).checked;
                            }
                        }
                    };
                    // Make the checkbox more visible against different color events.
                    if (textColor == "black") {
                        checkbox.addClass("ofc-checkbox-black");
                    } else {
                        checkbox.addClass("ofc-checkbox-white");
                    }

                    if (checkbox.checked) {
                        el.addClass("ofc-task-completed");
                    }

                    // Depending on the view, we should put the checkbox in a different spot.
                    const container =
                        el.querySelector(".fc-event-time") ||
                        el.querySelector(".fc-event-title") ||
                        el.querySelector(".fc-list-event-title");

                    container?.addClass("ofc-has-checkbox");
                    container?.prepend(checkbox);
                }
            }
        },

        longPressDelay: 250,
    });
    cal.render();
    return cal;
}
