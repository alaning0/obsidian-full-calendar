import { createPlugin, PluginDef } from "@fullcalendar/core";
import moment from "moment";

const MONTH_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
] as const;

type SeasonMonth = { monthIndex: number; year: number };

type SeasonRow = { name: string; months: SeasonMonth[] };

type OpenWeeklyNote = (date: Date) => Promise<void>;

type SeasonsPluginOptions = {
    openWeeklyNote?: OpenWeeklyNote;
};

/** Southern Hemisphere seasons spanning calendar year Y (Dec→Jan crosses into Y+1). */
function seasonRowsForYear(year: number): SeasonRow[] {
    return [
        {
            name: "Summer",
            months: [
                { monthIndex: 0, year },
                { monthIndex: 1, year },
            ],
        },
        {
            name: "Autumn",
            months: [
                { monthIndex: 2, year },
                { monthIndex: 3, year },
                { monthIndex: 4, year },
            ],
        },
        {
            name: "Winter",
            months: [
                { monthIndex: 5, year },
                { monthIndex: 6, year },
                { monthIndex: 7, year },
            ],
        },
        {
            name: "Spring",
            months: [
                { monthIndex: 8, year },
                { monthIndex: 9, year },
                { monthIndex: 10, year },
            ],
        },
        {
            name: "Summer",
            months: [
                { monthIndex: 11, year },
                { monthIndex: 0, year: year + 1 },
            ],
        },
    ];
}

/** FullCalendar all-day markers are UTC midnight. */
function yearFromRangeStart(start: Date): number {
    return start.getUTCFullYear();
}

function isCurrentMonth(month: SeasonMonth, now = new Date()): boolean {
    return (
        month.year === now.getFullYear() && month.monthIndex === now.getMonth()
    );
}

/** ISO weeks in week-year Y (52 or 53). Dec 28 is always in the last ISO week. */
export function isoWeeksInYear(year: number): number {
    return moment(`${year}-12-28`).isoWeek();
}

export function currentIsoWeek(now = new Date()): {
    year: number;
    week: number;
} {
    const m = moment(now);
    return { year: m.isoWeekYear(), week: m.isoWeek() };
}

/** Monday of ISO week `week` in ISO week-year `year`. */
export function dateForIsoWeek(year: number, week: number): Date {
    return moment().isoWeekYear(year).isoWeek(week).startOf("isoWeek").toDate();
}

function appendMonthCell(
    root: HTMLElement,
    month: SeasonMonth | null,
    displayYear: number
) {
    const chip = document.createElement("div");
    if (!month) {
        chip.className = "ofc-seasons-month is-empty";
        chip.setAttribute("aria-hidden", "true");
        root.appendChild(chip);
        return;
    }

    const current = isCurrentMonth(month);
    chip.className = current
        ? "ofc-seasons-month is-current"
        : "ofc-seasons-month";
    chip.setAttribute(
        "aria-label",
        `${MONTH_SHORT[month.monthIndex]} ${month.year}${
            current ? " (current)" : ""
        }`
    );

    if (current) {
        const star = document.createElement("span");
        star.className = "ofc-seasons-star";
        star.setAttribute("aria-hidden", "true");
        star.textContent = "⭐️";
        chip.appendChild(star);
    }

    const name = document.createElement("span");
    name.className = "ofc-seasons-month-name";
    name.textContent = MONTH_SHORT[month.monthIndex];
    chip.appendChild(name);

    if (month.year !== displayYear) {
        const yr = document.createElement("span");
        yr.className = "ofc-seasons-month-year";
        yr.textContent = String(month.year).slice(-2);
        chip.appendChild(yr);
    }

    root.appendChild(chip);
}

/**
 * One CSS grid: label | month | month | month
 * so columns line up across seasons (empty cells pad shorter rows).
 */
function buildMonthGrid(year: number): HTMLElement {
    const root = document.createElement("div");
    root.className = "ofc-seasons";

    for (const row of seasonRowsForYear(year)) {
        const label = document.createElement("div");
        label.className = "ofc-seasons-label";
        label.textContent = row.name;
        root.appendChild(label);

        for (let i = 0; i < 3; i++) {
            appendMonthCell(root, row.months[i] ?? null, year);
        }
    }

    return root;
}

function buildWeekSummary(year: number, totalWeeks: number): HTMLElement {
    const summary = document.createElement("div");
    summary.className = "ofc-seasons-week-summary";

    const now = currentIsoWeek();
    if (now.year === year) {
        const left = Math.max(0, totalWeeks - now.week);
        const pct = Math.round((left / totalWeeks) * 100);
        summary.textContent = `Week ${now.week} of ${totalWeeks} · ${left} weeks left (${pct}%)`;
    } else {
        summary.textContent = `${totalWeeks} weeks in ${year}`;
    }

    return summary;
}

function buildWeekChipGrid(
    year: number,
    openWeeklyNote?: OpenWeeklyNote
): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "ofc-seasons-weeks";

    const totalWeeks = isoWeeksInYear(year);
    const now = currentIsoWeek();
    const isThisYear = now.year === year;

    for (let week = 1; week <= totalWeeks; week++) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ofc-seasons-week";

        if (isThisYear) {
            if (week < now.week) {
                chip.classList.add("is-past");
            } else if (week === now.week) {
                chip.classList.add("is-current");
            } else {
                chip.classList.add("is-future");
            }
        }

        const label = `W${week}`;
        chip.textContent = label;
        chip.setAttribute(
            "aria-label",
            week === now.week && isThisYear
                ? `${label} (current week)`
                : `ISO week ${week}, ${year}`
        );

        if (openWeeklyNote) {
            chip.classList.add("is-clickable");
            const date = dateForIsoWeek(year, week);
            chip.addEventListener("mousedown", (e) => {
                e.stopPropagation();
            });
            chip.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                void openWeeklyNote(date);
            });
        } else {
            chip.disabled = true;
        }

        grid.appendChild(chip);
    }

    return grid;
}

/** Calendar quarters for year Y: Q1 Jan–Mar … Q4 Oct–Dec. */
const CALENDAR_QUARTERS: {
    quarter: number;
    months: number[];
}[] = [
    { quarter: 1, months: [0, 1, 2] },
    { quarter: 2, months: [3, 4, 5] },
    { quarter: 3, months: [6, 7, 8] },
    { quarter: 4, months: [9, 10, 11] },
];

function currentCalendarQuarter(now = new Date()): {
    year: number;
    quarter: number;
} {
    return {
        year: now.getFullYear(),
        quarter: Math.floor(now.getMonth() / 3) + 1,
    };
}

function buildQuarterSummary(year: number): HTMLElement {
    const summary = document.createElement("div");
    summary.className = "ofc-seasons-quarter-summary";

    const now = currentCalendarQuarter();
    if (now.year === year) {
        const left = Math.max(0, 4 - now.quarter);
        const pct = Math.round((left / 4) * 100);
        summary.textContent = `Q${now.quarter} of 4 · ${left} quarter${
            left === 1 ? "" : "s"
        } left (${pct}%)`;
    } else {
        summary.textContent = `4 quarters in ${year}`;
    }

    return summary;
}

function buildQuarterGrid(year: number): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "ofc-seasons-quarters";

    const now = currentCalendarQuarter();
    const isThisYear = now.year === year;

    for (const q of CALENDAR_QUARTERS) {
        const card = document.createElement("div");
        card.className = "ofc-seasons-quarter";

        if (isThisYear) {
            if (q.quarter < now.quarter) {
                card.classList.add("is-past");
            } else if (q.quarter === now.quarter) {
                card.classList.add("is-current");
            } else {
                card.classList.add("is-future");
            }
        }

        const title = document.createElement("div");
        title.className = "ofc-seasons-quarter-title";
        if (q.quarter === now.quarter && isThisYear) {
            const star = document.createElement("span");
            star.className = "ofc-seasons-star";
            star.setAttribute("aria-hidden", "true");
            star.textContent = "⭐️";
            title.appendChild(star);
        }
        const titleText = document.createElement("span");
        titleText.textContent = `Q${q.quarter}`;
        title.appendChild(titleText);
        card.appendChild(title);

        const months = document.createElement("div");
        months.className = "ofc-seasons-quarter-months";
        months.textContent = q.months.map((m) => MONTH_SHORT[m]).join(" · ");
        card.appendChild(months);

        card.setAttribute(
            "aria-label",
            q.quarter === now.quarter && isThisYear
                ? `Q${q.quarter} (current): ${months.textContent}`
                : `Q${q.quarter}: ${months.textContent}`
        );

        grid.appendChild(card);
    }

    return grid;
}

function buildSeasonsDom(
    year: number,
    openWeeklyNote?: OpenWeeklyNote
): HTMLElement {
    const page = document.createElement("div");
    page.className = "ofc-seasons-page";

    page.appendChild(buildMonthGrid(year));

    const tracker = document.createElement("div");
    tracker.className = "ofc-seasons-week-tracker";
    const totalWeeks = isoWeeksInYear(year);
    tracker.appendChild(buildWeekSummary(year, totalWeeks));
    tracker.appendChild(buildWeekChipGrid(year, openWeeklyNote));
    page.appendChild(tracker);

    const quarters = document.createElement("div");
    quarters.className = "ofc-seasons-quarter-tracker";
    quarters.appendChild(buildQuarterSummary(year));
    quarters.appendChild(buildQuarterGrid(year));
    page.appendChild(quarters);

    return page;
}

/**
 * Custom FullCalendar seasons view plugin.
 * Closes over openWeeklyNote so week chips can open Periodic Notes weekly notes.
 */
export function createSeasonsViewPlugin(
    options: SeasonsPluginOptions = {}
): PluginDef {
    const { openWeeklyNote } = options;

    return createPlugin({
        views: {
            ofcSeasons: {
                classNames: ["ofc-seasons-view"],
                content: (props: {
                    dateProfile: { currentRange: { start: Date } };
                }) => {
                    const year = yearFromRangeStart(
                        props.dateProfile.currentRange.start
                    );
                    return {
                        domNodes: [buildSeasonsDom(year, openWeeklyNote)],
                    };
                },
                duration: { years: 1 },
                dateAlignment: "year",
                // Must also set calendar `buttonText.ofcSeasons` — locale "year" wins otherwise.
                buttonText: "seasons",
                titleFormat: { year: "numeric" as const },
            },
        },
    });
}
