import {
    MarkdownView,
    Notice,
    TFile,
    Vault,
    Workspace,
    WorkspaceLeaf,
} from "obsidian";
import moment from "moment";
import {
    appHasDailyNotesPluginLoaded,
    createDailyNote,
    getAllDailyNotes,
    getDailyNote,
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

    let existingLeaf: WorkspaceLeaf | null = null;
    workspace.iterateAllLeaves((leaf) => {
        if (existingLeaf) {
            return;
        }
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file?.path === file!.path) {
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
