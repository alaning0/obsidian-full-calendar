import { TFile } from "obsidian";
import DailyNoteCalendar, { getInlineAttributes } from "./DailyNoteCalendar";
import { MockApp, MockAppBuilder } from "../../test_helpers/AppBuilder";
import { FileBuilder, ListBuilder } from "../../test_helpers/FileBuilder";
import { ObsidianInterface } from "../ObsidianAdapter";

jest.mock("obsidian-daily-notes-interface", () => ({
    appHasDailyNotesPluginLoaded: jest.fn(),
    getAllDailyNotes: jest.fn(() => ({})),
    getDailyNote: jest.fn(),
    createDailyNote: jest.fn(),
    getDailyNoteSettings: jest.fn(() => ({ folder: "daily" })),
    getDateFromFile: jest.fn((file: TFile) => {
        const match = file.name.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) {
            return {
                format: () => match[1],
            };
        }
        return null;
    }),
}));

describe("getInlineAttributes", () => {
    it.each([
        ["one variable [hello:: world]", { hello: "world" }],
        ["[first:: a] message [second:: b]", { first: "a", second: "b" }],
        [
            "this is a long string with [some brackets] but no actual:: inline fields",
            {},
        ],
    ])("%p", (line: string, obj: any) => {
        expect(getInlineAttributes(line)).toEqual(obj);
    });
});

const makeApp = (app: MockApp): ObsidianInterface => ({
    getAbstractFileByPath: (path) => app.vault.getAbstractFileByPath(path),
    getFileByPath(path: string): TFile | null {
        const f = app.vault.getAbstractFileByPath(path);
        if (!f) {
            return null;
        }
        if (!(f instanceof TFile)) {
            return null;
        }
        return f;
    },
    getMetadata: (file) => app.metadataCache.getFileCache(file),
    waitForMetadata: (file) =>
        new Promise((resolve) =>
            resolve(app.metadataCache.getFileCache(file)!)
        ),
    read: (file) => app.vault.read(file),
    create: jest.fn(),
    rewrite: jest.fn(),
    rename: jest.fn(),
    delete: jest.fn(),
    process: jest.fn((file, callback) =>
        app.vault.read(file).then((text) => callback(text))
    ),
});

describe("DailyNoteCalendar heading fallback", () => {
    const heading = "Events";
    const color = "#FF0000";

    it("reads events under heading when heading exists", async () => {
        const obsidian = makeApp(
            MockAppBuilder.make()
                .folder(
                    new MockAppBuilder("daily").file(
                        "2024-01-15.md",
                        new FileBuilder()
                            .heading(2, "Events")
                            .list(
                                new ListBuilder()
                                    .item(
                                        "Meeting [startTime:: 09:00] [endTime:: 10:00]"
                                    )
                                    .item(
                                        "Lunch [startTime:: 12:00] [endTime:: 13:00]"
                                    )
                            )
                            .heading(2, "Notes")
                            .list(
                                new ListBuilder().item(
                                    "Random note without event fields"
                                )
                            )
                    )
                )
                .done()
        );

        const calendar = new DailyNoteCalendar(obsidian, color, heading);
        const file = obsidian.getFileByPath("daily/2024-01-15.md")!;
        const events = await calendar.getEventsInFile(file);

        expect(events.length).toBe(2);
        expect(events[0][0].title).toBe("Meeting");
        expect(events[1][0].title).toBe("Lunch");
    });

    it("falls back to whole file when heading does NOT exist", async () => {
        const obsidian = makeApp(
            MockAppBuilder.make()
                .folder(
                    new MockAppBuilder("daily").file(
                        "2024-01-15.md",
                        new FileBuilder()
                            .heading(2, "Tasks")
                            .list(
                                new ListBuilder()
                                    .item(
                                        "Meeting [startTime:: 09:00] [endTime:: 10:00]"
                                    )
                                    .item("Random task without event fields")
                                    .item(
                                        "Lunch [startTime:: 12:00] [endTime:: 13:00]"
                                    )
                            )
                    )
                )
                .done()
        );

        const calendar = new DailyNoteCalendar(obsidian, color, heading);
        const file = obsidian.getFileByPath("daily/2024-01-15.md")!;
        const events = await calendar.getEventsInFile(file);

        expect(events.length).toBe(2);
        expect(events[0][0].title).toBe("Meeting");
        expect(events[1][0].title).toBe("Lunch");
    });

    it("ignores list items without valid event inline fields in fallback mode", async () => {
        const obsidian = makeApp(
            MockAppBuilder.make()
                .folder(
                    new MockAppBuilder("daily").file(
                        "2024-01-15.md",
                        new FileBuilder().list(
                            new ListBuilder()
                                .item("Just a random bullet")
                                .item(
                                    "Another random bullet with [tag:: value]"
                                )
                                .item(
                                    "Valid event [startTime:: 10:00] [endTime:: 11:00]"
                                )
                        )
                    )
                )
                .done()
        );

        const calendar = new DailyNoteCalendar(obsidian, color, heading);
        const file = obsidian.getFileByPath("daily/2024-01-15.md")!;
        const events = await calendar.getEventsInFile(file);

        expect(events.length).toBe(1);
        expect(events[0][0].title).toBe("Valid event");
    });

    it("reads all-day events in fallback mode", async () => {
        const obsidian = makeApp(
            MockAppBuilder.make()
                .folder(
                    new MockAppBuilder("daily").file(
                        "2024-01-15.md",
                        new FileBuilder().list(
                            new ListBuilder().item(
                                "All day event [allDay:: true]"
                            )
                        )
                    )
                )
                .done()
        );

        const calendar = new DailyNoteCalendar(obsidian, color, heading);
        const file = obsidian.getFileByPath("daily/2024-01-15.md")!;
        const events = await calendar.getEventsInFile(file);

        expect(events.length).toBe(1);
        expect(events[0][0].title).toBe("All day event");
        expect(events[0][0].allDay).toBe(true);
    });

    it("returns empty list under heading when heading exists but has no items", async () => {
        const obsidian = makeApp(
            MockAppBuilder.make()
                .folder(
                    new MockAppBuilder("daily").file(
                        "2024-01-15.md",
                        new FileBuilder()
                            .heading(2, "Events")
                            .text("No events today")
                            .heading(2, "Notes")
                            .list(
                                new ListBuilder().item(
                                    "This should NOT be found [startTime:: 09:00] [endTime:: 10:00]"
                                )
                            )
                    )
                )
                .done()
        );

        const calendar = new DailyNoteCalendar(obsidian, color, heading);
        const file = obsidian.getFileByPath("daily/2024-01-15.md")!;
        const events = await calendar.getEventsInFile(file);

        expect(events.length).toBe(0);
    });
});
