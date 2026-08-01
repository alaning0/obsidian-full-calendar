import * as React from "react";
import * as ReactDOM from "react-dom";
import { App, Modal } from "obsidian";

type RenderCallback = (
    close: () => void
) => Promise<ReturnType<typeof React.createElement>>;

type ReactModalOptions = {
    /** Pin the dialog near the top of the viewport (useful on mobile/edit). */
    pinTop?: boolean;
};

export default class ReactModal<Props, Component> extends Modal {
    onOpenCallback: RenderCallback;
    pinTop: boolean;

    constructor(
        app: App,
        onOpenCallback: RenderCallback,
        options?: ReactModalOptions
    ) {
        super(app);
        this.onOpenCallback = onOpenCallback;
        this.pinTop = !!options?.pinTop;
    }

    async onOpen() {
        const { contentEl } = this;
        if (this.pinTop) {
            this.containerEl.addClass("ofc-modal-top-container");
            this.modalEl.addClass("ofc-modal-top");
        }
        ReactDOM.render(
            await this.onOpenCallback(() => this.close()),
            contentEl
        );
    }

    onClose() {
        const { contentEl } = this;
        this.containerEl.removeClass("ofc-modal-top-container");
        this.modalEl.removeClass("ofc-modal-top");
        ReactDOM.unmountComponentAtNode(contentEl);
    }
}
