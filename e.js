// ==UserScript== //
// @name odoosoup
// @match https://www.odoo.com/web
// @match https://www.odoo.com/web?*
// ==/UserScript==

const odoosoup = function () {

function trackOpenedTickets({
    FormRenderer,
    KanbanRecord,
    onMounted,
    onPatched,
    patch,
    useEffect,
}) {
    const localStorageKey = "odoosoup.task.opened";
    let openedTickets = JSON.parse(localStorage[localStorageKey] || "[]");

    /* track changes from other tabs */
    window.onstorage = (event) => {
        if (event.key !== localStorageKey) {
            return;
        }
        openedTickets = JSON.parse(event.newValue || "[]");
    };

    patch(FormRenderer.prototype, "odoosoup.track-opened-tickets", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            useEffect(
                (id) => {
                    if (!openedTickets.includes(id)) {
                        openedTickets.push(id);
                        localStorage[localStorageKey] = JSON.stringify(openedTickets);
                    }
                },
                () => [this.props.record.data.id]
            );
        },
    });

    patch(KanbanRecord.prototype, "odoosoup.track-opened-tickets", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            onMounted(() => this.renderSeenIcon());
            onPatched(() => this.renderSeenIcon());
        },

        renderSeenIcon() {
            if (openedTickets.includes(this.props.record.resId)) {
                const dataPointId = this.props.record.id;
                const card = document.querySelector(`div[data-id="${dataPointId}"] .oe_kanban_card`);
                card.querySelectorAll(".odoosoup-eye").forEach((e) => e.remove());
                const target = card.querySelector('div[name="priority"]');
                const eye = document.createElement("i");
                eye.classList.add("fa", "fa-lg", "fa-eye", "odoosoup-eye");
                target.parentNode.insertBefore(eye, target.nextSibling);
            }
        },
    });
}

function addCopyIdToForm({
    FormControlPanel,
    FormRenderer,
    onMounted,
    onPatched,
    patch,
    useEffect,
}) {
    let recordId = null;
    patch(FormControlPanel.prototype, "odoosoup.copy-id", {
        renderButton() {
            const target = document.querySelector(".o_cp_bottom_right");
            target.querySelectorAll(".odoosoup-copy-btn").forEach((e) => e.remove());
            const button = document.createElement("button");
            button.classList.add("btn", "btn-outline-primary", "odoosoup-copy-btn");
            button.textContent = "Copy ID";
            button.onclick = () => {
                navigator.clipboard.writeText(recordId.toString());
            };
            target.appendChild(button);
        },

        setup() {
            this._super();
            onMounted(() => this.renderButton());
            onPatched(() => this.renderButton());
        },
    });
    patch(FormRenderer.prototype, "odoosoup.copy-id", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }

            useEffect(
                (id) => {
                    recordId = id;
                },
                () => [this.props.record.data.id]
            );
        },
    });
}

function addTaskNotes({ KanbanRecord, FormRenderer, debounce, onMounted, onPatched, patch }) {
    patch(FormRenderer.prototype, "odoosoup.task-notes", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            onMounted(() => this.renderTextArea());
            onPatched(() => this.renderTextArea());
        },

        storageKey() {
            return `odoosoup.task.${this.props.record.data.id}`;
        },


        onInput() {
            const text = this.textArea.value.trim();
            if (text) {
                localStorage[this.storageKey()] = text;
            } else {
                localStorage.removeItem(this.storageKey);
            }
        },

        renderTextArea() {
            const note = localStorage[this.storageKey()] || "";
            const target = document.querySelector(".oe_title");
            document.querySelectorAll(".odoosoup-notes").forEach((e) => e.remove());
            this.textArea = document.createElement("textarea");
            this.textArea.value = note;
            this.textArea.classList.add("odoosoup-notes");
            this.textArea.style.background = "#f1ffe8";
            this.textArea.style.color = "#207a4a";
            this.textArea.style.border = "1px solid #60ba8a";
            this.textArea.addEventListener("input", debounce(this.onInput.bind(this), 125));
            target.parentNode.insertBefore(this.textArea, target.nextSibling);
        },
    });
    patch(KanbanRecord.prototype, "odoosoup.task-notes", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            onMounted(() => this.renderNote());
            onPatched(() => this.renderNote());
        },

        renderNote() {
            const id = this.props.record.resId;
            const dataPointId = this.props.record.id;
            const card = document.querySelector(`div[data-id="${dataPointId}"] .oe_kanban_card`);
            const currentNote = card.querySelector(".odoosoup-note")?.remove();
            const note = localStorage[`odoosoup.task.${id}`];
            if (!note) {
                return;
            }
            const div = document.createElement("div");
            div.classList.add("odoosoup-note", "text-truncate");
            div.style.background = "#f1ffe8";
            div.style.color = "#207a4a";
            div.style.border = "1px solid #60ba8a";
            div.textContent = note.replace(/^\s+|\s+$/g, "").replace(/\s*\n\s*/g, "⏎");
            card.appendChild(div);
        },
    });
}

odoo.define("odoosoup", (require) => {
    const { patch } = require("@web/core/utils/patch");
    const { debounce } = require("@web/core/utils/timing");
    const { FormRenderer } = require("@web/views/form/form_renderer");
    const { FormControlPanel } = require("@web/views/form/control_panel/form_control_panel");
    const { KanbanRecord } = require("@web/views/kanban/kanban_record");
    const { onRendered, onMounted, onPatched, useEffect } = require("@odoo/owl");

    const dependencies = {
        FormControlPanel,
        FormRenderer,
        KanbanRecord,
        debounce,
        onMounted,
        onPatched,
        onRendered,
        patch,
        useEffect,
    };

    const patches = [addCopyIdToForm, trackOpenedTickets, addTaskNotes];

    patches.forEach((patchFn) => patchFn(dependencies));
});

}

const script = document.createElement('script');
const scriptContent = odoosoup.toString();
script.innerText = '(' + scriptContent + ')()';
document.querySelector('head').appendChild(script);
