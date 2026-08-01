import { toEventInput, dateEndpointsToFrontmatter } from "./interop";
import { OFCEvent } from "../types";

describe("all-day endDate inclusive↔exclusive", () => {
    it("toEventInput adds one day for FullCalendar exclusive end", () => {
        const event: OFCEvent = {
            title: "1",
            type: "single",
            allDay: true,
            date: "2026-07-28",
            endDate: "2026-07-31",
        };
        expect(toEventInput("id", event)).toMatchObject({
            start: "2026-07-28",
            end: "2026-08-01",
            allDay: true,
        });
    });

    it("toEventInput leaves single-day all-day events without end", () => {
        const event: OFCEvent = {
            title: "solo",
            type: "single",
            allDay: true,
            date: "2026-07-28",
            endDate: null,
        };
        expect(toEventInput("id", event)).toMatchObject({
            start: "2026-07-28",
            end: undefined,
            allDay: true,
        });
    });

    it("dateEndpointsToFrontmatter stores inclusive last day from FC selection", () => {
        // Month/week all-day select: Jul 28 through Jul 31 → exclusive end Aug 1.
        const start = new Date(2026, 6, 28);
        const end = new Date(2026, 7, 1);
        expect(dateEndpointsToFrontmatter(start, end, true)).toMatchObject({
            date: "2026-07-28",
            endDate: "2026-07-31",
            allDay: true,
        });
    });

    it("dateEndpointsToFrontmatter omits endDate for a single all-day", () => {
        const start = new Date(2026, 6, 28);
        const end = new Date(2026, 6, 29); // exclusive next day
        expect(dateEndpointsToFrontmatter(start, end, true)).toMatchObject({
            date: "2026-07-28",
            endDate: undefined,
            allDay: true,
        });
    });
});
