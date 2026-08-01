import {
    MarkdownView,
    Notice,
    TFile,
    Vault,
    Workspace,
    WorkspaceLeaf,
    normalizePath,
} from "obsidian";
import type { Moment } from "moment";
import moment from "moment";
import {
    appHasDailyNotesPluginLoaded,
    appHasWeeklyNotesPluginLoaded,
    createDailyNote,
    createWeeklyNote,
    getAllDailyNotes,
    getAllWeeklyNotes,
    getDailyNote,
    getWeeklyNote,
    getWeeklyNoteSettings,
} from "obsidian-daily-notes-interface";
import EventCache from "src/core/EventCache";

/**
 * Open a file in the editor to a given event.
 * @param cache
 * @param param1 App
 * @param id event ID
 * @returns
 */
export async function openFileForEvent(
    cache: EventCache,
    { workspace, vault }: { workspace: Workspace; vault: Vault },
    id: string
) {
    const details = cache.getInfoForEditableEvent(id);
    if (!details) {
        throw new Error("Event does not have local representation.");
    }
    const {
        location: { path, lineNumber },
    } = details;
    let leaf = workspace.getMostRecentLeaf();
    const file = vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        return;
    }
    if (!leaf) {
        return;
    }
    if (leaf.getViewState().pinned) {
        leaf = workspace.getLeaf("tab");
    }
    await leaf.openFile(file);
    if (lineNumber && leaf.view instanceof MarkdownView) {
        leaf.view.editor.setCursor({ line: lineNumber, ch: 0 });
    }
}

async function revealOrOpenFile(
    { workspace }: { workspace: Workspace },
    file: TFile
) {
    let existingLeaf: WorkspaceLeaf | null = null;
    workspace.iterateAllLeaves((leaf) => {
        if (existingLeaf) {
            return;
        }
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file?.path === file.path) {
            existingLeaf = leaf;
        }
    });
    if (existingLeaf) {
        workspace.revealLeaf(existingLeaf);
        workspace.setActiveLeaf(existingLeaf, { focus: true });
        return;
    }

    let leaf = workspace.getMostRecentLeaf();
    if (!leaf) {
        return;
    }
    if (leaf.getViewState().pinned) {
        leaf = workspace.getLeaf("tab");
    }
    await leaf.openFile(file, { active: true });
}

/**
 * Open (or create) the Daily Notes / Periodic Notes note for a calendar day.
 * If the note is already open in a leaf, reveal and focus that leaf.
 */
export async function openDailyNoteForDate(
    { workspace }: { workspace: Workspace },
    date: Date
) {
    if (!appHasDailyNotesPluginLoaded()) {
        new Notice(
            "Enable Daily Notes or Periodic Notes (daily) to open day notes."
        );
        return;
    }

    const day = moment(date);
    let file = getDailyNote(day, getAllDailyNotes()) as TFile | null;
    if (!file) {
        file = (await createDailyNote(day)) as TFile;
    }
    await revealOrOpenFile({ workspace }, file);
}

/** Vault path for a weekly note from Periodic Notes folder/format settings. */
function weeklyNotePathForDate(date: Moment): string {
    const { folder, format } = getWeeklyNoteSettings();
    let filename = date.format(format || "gggg-[W]ww");
    if (!filename.endsWith(".md")) {
        filename += ".md";
    }
    const base = (folder || "").replace(/^\/+|\/+$/g, "");
    return normalizePath(base ? `${base}/${filename}` : filename);
}

function findWeeklyNoteFile(vault: Vault, date: Moment): TFile | null {
    const candidates = [
        date.clone(),
        date.clone().startOf("week"),
        date.clone().startOf("isoWeek"),
    ];

    for (const d of candidates) {
        const existing = vault.getAbstractFileByPath(weeklyNotePathForDate(d));
        if (existing instanceof TFile) {
            return existing;
        }
    }

    try {
        const notes = getAllWeeklyNotes();
        for (const d of candidates) {
            const found = getWeeklyNote(d, notes) as TFile | null;
            if (found) {
                return found;
            }
        }
    } catch {
        // Folder missing or index failed — path lookup above is enough.
    }
    return null;
}

/**
 * Open (or create) the Periodic Notes weekly note for the week containing date.
 * Uses weekly settings (e.g. Year/2026-W31.md with format gggg-[W]ww).
 *
 * Resolves by vault path first: getWeeklyNote UID lookup often misses existing
 * notes when FullCalendar's week cell date doesn't match Periodic Notes' week
 * start, which previously caused "Unable to create new file" on duplicates.
 */
export async function openWeeklyNoteForDate(
    { workspace, vault }: { workspace: Workspace; vault: Vault },
    date: Date
) {
    if (!appHasWeeklyNotesPluginLoaded()) {
        new Notice(
            "Enable Periodic Notes (weekly) to open week notes from week numbers."
        );
        return;
    }

    const day = moment(date);
    let file = findWeeklyNoteFile(vault, day);

    if (!file) {
        file = (await createWeeklyNote(day)) as TFile | null;
        // createWeeklyNote shows a notice and returns undefined if the file
        // already exists or creation fails — try path resolution again.
        if (!file) {
            file = findWeeklyNoteFile(vault, day);
        }
    }

    if (!file) {
        new Notice(
            `Could not open weekly note for ${weeklyNotePathForDate(day)}`
        );
        return;
    }

    await revealOrOpenFile({ workspace }, file);
}
