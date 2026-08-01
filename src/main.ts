import { MarkdownView, Notice, Plugin, TFile } from "obsidian";
import {
    CalendarView,
    FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
    FULL_CALENDAR_VIEW_TYPE,
    applyTodayBackground,
} from "./ui/view";
import { renderCalendar } from "./ui/calendar";
import { toEventInput } from "./ui/interop";
import {
    DEFAULT_SETTINGS,
    FullCalendarSettings,
    FullCalendarSettingTab,
} from "./ui/settings";
import { PLUGIN_SLUG } from "./types";
import EventCache from "./core/EventCache";
import { ObsidianIO } from "./ObsidianAdapter";
import { launchCreateModal } from "./ui/event_modal";
import FullNoteCalendar from "./calendars/FullNoteCalendar";
import DailyNoteCalendar from "./calendars/DailyNoteCalendar";
import ICSCalendar from "./calendars/ICSCalendar";
import CalDAVCalendar from "./calendars/CalDAVCalendar";

export default class FullCalendarPlugin extends Plugin {
    settings: FullCalendarSettings = DEFAULT_SETTINGS;
    cache: EventCache = new EventCache({
        local: (info) =>
            info.type === "local"
                ? new FullNoteCalendar(
                      new ObsidianIO(this.app),
                      info.color,
                      info.directory
                  )
                : null,
        dailynote: (info) =>
            info.type === "dailynote"
                ? new DailyNoteCalendar(
                      new ObsidianIO(this.app),
                      info.color,
                      info.heading
                  )
                : null,
        ical: (info) =>
            info.type === "ical" ? new ICSCalendar(info.color, info.url) : null,
        caldav: (info) =>
            info.type === "caldav"
                ? new CalDAVCalendar(
                      info.color,
                      info.name,
                      {
                          type: "basic",
                          username: info.username,
                          password: info.password,
                      },
                      info.url,
                      info.homeUrl
                  )
                : null,
        FOR_TEST_ONLY: () => null,
    });

    renderCalendar = renderCalendar;
    processFrontmatter = toEventInput;

    async activateView() {
        const leaves = this.app.workspace
            .getLeavesOfType(FULL_CALENDAR_VIEW_TYPE)
            .filter((l) => (l.view as CalendarView).inSidebar === false);
        if (leaves.length === 0) {
            const leaf = this.app.workspace.getLeaf("tab");
            await leaf.setViewState({
                type: FULL_CALENDAR_VIEW_TYPE,
                active: true,
            });
        } else {
            const leaf = leaves[0];
            this.app.workspace.revealLeaf(leaf);
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
            await (leaf.view as CalendarView).onOpen();
        }
    }
    async onload() {
        await this.loadSettings();

        this.cache.reset(this.settings.calendarSources);

        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                this.cache.fileUpdated(file);
            })
        );

        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (file instanceof TFile) {
                    console.debug("FILE RENAMED", file.path);
                    this.cache.deleteEventsAtPath(oldPath);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                if (file instanceof TFile) {
                    console.debug("FILE DELETED", file.path);
                    this.cache.deleteEventsAtPath(file.path);
                }
            })
        );

        // @ts-ignore
        window.cache = this.cache;

        this.registerView(
            FULL_CALENDAR_VIEW_TYPE,
            (leaf) => new CalendarView(leaf, this, false)
        );

        this.registerView(
            FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
            (leaf) => new CalendarView(leaf, this, true)
        );

        this.addRibbonIcon(
            "calendar-glyph",
            "Open Full Calendar",
            async (_: MouseEvent) => {
                await this.activateView();
            }
        );

        this.addSettingTab(new FullCalendarSettingTab(this.app, this));

        this.addCommand({
            id: "full-calendar-new-event",
            name: "New Event",
            callback: () => {
                launchCreateModal(this, {});
            },
        });

        this.addCommand({
            id: "full-calendar-reset",
            name: "Reset Event Cache",
            callback: () => {
                this.cache.reset(this.settings.calendarSources);
                this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
                this.app.workspace.detachLeavesOfType(
                    FULL_CALENDAR_SIDEBAR_VIEW_TYPE
                );
                new Notice("Full Calendar has been reset.");
            },
        });

        this.addCommand({
            id: "full-calendar-revalidate",
            name: "Revalidate remote calendars",
            callback: () => {
                this.cache.revalidateRemoteCalendars(true);
            },
        });

        this.addCommand({
            id: "full-calendar-toggle-mobile-layout",
            name: "Toggle mobile layout",
            callback: async () => {
                await this.setForceMobileLayout(
                    !this.settings.forceMobileLayout
                );
            },
        });

        this.addCommand({
            id: "full-calendar-open",
            name: "Open Calendar",
            callback: () => {
                this.activateView();
            },
        });

        this.addCommand({
            id: "full-calendar-open-sidebar",
            name: "Open in left sidebar",
            callback: async () => {
                const existing = this.app.workspace.getLeavesOfType(
                    FULL_CALENDAR_SIDEBAR_VIEW_TYPE
                );
                if (existing.length) {
                    const leaf = existing[0];
                    this.app.workspace.revealLeaf(leaf);
                    this.app.workspace.setActiveLeaf(leaf, { focus: true });
                    return;
                }
                const leaf = this.app.workspace.getLeftLeaf(false);
                if (!leaf) {
                    return;
                }
                await leaf.setViewState({
                    type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
                    active: true,
                });
            },
        });

        (this.app.workspace as any).registerHoverLinkSource(PLUGIN_SLUG, {
            display: "Full Calendar",
            defaultMod: true,
        });
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
        // Migrate older settings that lacked sidebar initial view.
        if (!this.settings.initialView.sidebar) {
            this.settings.initialView.sidebar =
                DEFAULT_SETTINGS.initialView.sidebar;
        }
        if (this.settings.forceMobileLayout === undefined) {
            this.settings.forceMobileLayout = false;
        }
    }

    async saveSettings() {
        new Notice("Resetting the event cache with new settings...");
        await this.saveData(this.settings);
        this.cache.reset(this.settings.calendarSources);
        await this.cache.populate();
        this.cache.resync();
        this.applyTodayBackgroundToOpenViews();
    }

    /** Persist and remount calendars with phone/desktop chrome (no cache reset). */
    async setForceMobileLayout(enabled: boolean) {
        this.settings.forceMobileLayout = enabled;
        await this.saveData(this.settings);
        new Notice(
            enabled ? "Forced mobile layout on." : "Desktop layout restored."
        );
        await this.remountCalendarViews();
    }

    async remountCalendarViews() {
        for (const type of [
            FULL_CALENDAR_VIEW_TYPE,
            FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
        ]) {
            for (const leaf of this.app.workspace.getLeavesOfType(type)) {
                await (leaf.view as CalendarView).onOpen();
            }
        }
    }

    applyTodayBackgroundToOpenViews() {
        const color = this.settings.todayBackgroundColor;
        for (const type of [
            FULL_CALENDAR_VIEW_TYPE,
            FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
        ]) {
            for (const leaf of this.app.workspace.getLeavesOfType(type)) {
                const container = (leaf.view as CalendarView).containerEl
                    .children[1] as HTMLElement | undefined;
                const calendarRoot = container?.querySelector(
                    ":scope > div"
                ) as HTMLElement | null;
                if (calendarRoot) {
                    applyTodayBackground(calendarRoot, color);
                }
            }
        }
    }
}
