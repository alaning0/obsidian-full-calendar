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
    initialView?: { desktop: string; mobile: string };
    timeFormat24h?: boolean;
    openContextMenuForEvent?: (
        event: EventApi,
        mouseEvent: MouseEvent
    ) => Promise<void>;
    toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
    forceNarrow?: boolean;
    /** Open the daily/periodic note for this calendar day (day-number clicks). */
    openDailyNote?: (date: Date) => Promise<void>;
}

export function renderCalendar(
    containerEl: HTMLElement,
    eventSources: EventSourceInput[],
    settings?: ExtraRenderProps
): Calendar {
    const isMobile = window.innerWidth < 500;
    const isNarrow = settings?.forceNarrow || isMobile;
    const {
        eventClick,
        select,
        modifyEvent,
        eventMouseEnter,
        openContextMenuForEvent,
        toggleTask,
        openDailyNote,
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
        initialView:
            settings?.initialView?.[isNarrow ? "mobile" : "desktop"] ||
            (isNarrow ? "timeGrid3Days" : "timeGridWeek"),
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
                  right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }
            : !isMobile
            ? {
                  right: "goToday,prev,next",
                  left: "timeGrid3Days,timeGridDay,listWeek",
              }
            : false,
        footerToolbar: isMobile
            ? {
                  right: "goToday,prev,next",
                  left: "timeGrid3Days,timeGridDay,listWeek",
              }
            : false,

        views: {
            timeGridDay: {
                type: "timeGrid",
                duration: { days: 1 },
                buttonText: isNarrow ? "1" : "day",
            },
            timeGrid3Days: {
                type: "timeGrid",
                duration: { days: 3 },
                buttonText: "3",
            },
        },
        firstDay: settings?.firstDay,
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
