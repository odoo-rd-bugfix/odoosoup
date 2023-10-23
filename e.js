// ==UserScript== //
// @name odoosoup
// @match https://www.odoo.com/web
// @match https://www.odoo.com/web?*
// ==/UserScript==

(function () {

function trackOpenedTickets({
    FormRenderer,
    KanbanRecord,
    ListRenderer,
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
            useEffect(() => this.renderSeenIcon());
        },

        renderSeenIcon() {
            if (openedTickets.includes(this.props.record.resId)) {
                const card = this.rootRef.el;
                card.querySelectorAll(".odoosoup-eye").forEach((e) => e.remove());
                const parent = document.createElement("div");
                parent.classList.add("odoosoup-eye");
                const eye = document.createElement("i");
                parent.appendChild(eye);
                eye.classList.add("fa", "fa-lg", "fa-eye");
                const target = card.querySelector('.oe_kanban_bottom_left');
                target.insertBefore(parent, target.firstChild);
            }
        },
    });

    patch(ListRenderer.prototype, "odoosoup.track-opened-tickets", {
        setup() {
            this._super();
            if (this.props.list.resModel !== "project.task") {
                return;
            }
            useEffect(() => this.renderSeenIcon());
        },

        renderSeenIcon() {
            this.props.list.records.forEach((record) => {
                if (openedTickets.includes(record.resId)) {
                    const target = this.rootRef.el.querySelector(`tr[data-id="${record.id}"] td[name="priority"]`);
                    target.querySelectorAll(".odoosoup-eye").forEach((e) => e.remove());
                    const parent = document.createElement("div");
                    parent.classList.add("odoosoup-eye");
                    const eye = document.createElement("i");
                    parent.appendChild(eye);
                    eye.classList.add("fa", "fa-lg", "fa-eye");
                    target.appendChild(parent);
                }
            });
        },
    });
}

function addCopyIdToTasks({
    KanbanRecord,
    ControlPanel,
    FormRenderer,
    patch,
    useEffect,
}) {
    function bindCopyId(element, recordId, classes, onClickedClasses) {
        element.onclick = (event) => {
            event.stopPropagation();
            event.preventDefault();
            classes.forEach((c) => element.classList.toggle(c, false));
            onClickedClasses.forEach((c) => element.classList.toggle(c, true));
            navigator.clipboard.writeText(recordId.toString()).finally(() => {
                window.setTimeout(() => {
                    classes.forEach((c) => element.classList.toggle(c, true));
                    onClickedClasses.forEach((c) => element.classList.toggle(c, false));
                }, 500);
            });
        };
    }

    let recordId = null;
    patch(ControlPanel.prototype, "odoosoup.copy-id", {
        renderCopyIdButton() {
            if (!this.root.el) return;
            const target = this.root.el.querySelector(".o_control_panel_navigation");
            if (this.env.config.viewType !== "form" || !target) return;
            target.querySelectorAll(".odoosoup-copy-btn").forEach((e) => e.remove());
            const button = document.createElement("button");
            button.classList.add("btn", "btn-outline-primary", "odoosoup-copy-btn");
            button.textContent = "Copy ID";
            bindCopyId(button, recordId, ["btn-outline-primary"], ["btn-outline-success"]);
            target.appendChild(button);
        },

        setup() {
            this._super();
            if (this.env?.searchModel?.resModel !== "project.task") {
                return;
            }
            useEffect(() => this.renderCopyIdButton());
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
    patch(KanbanRecord.prototype, "odoosoup.copy-id", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            useEffect(() => this.renderCopyIdButton());
        },

        renderCopyIdButton() {
            const id = this.props.record.resId;
            const card = this.rootRef.el;
            card.querySelector(".odoosoup-copy-btn")?.remove();
            const copyIcon = document.createElement("i");
            copyIcon.classList.add("fa", "fa-clipboard");
            bindCopyId(copyIcon, id, [], ["text-success"]);
            const wrapper = document.createElement("div");
            wrapper.classList.add("odoosoup-copy-btn");
            wrapper.appendChild(copyIcon);
            const target = card.querySelector('.oe_kanban_bottom_left');
            target.insertBefore(wrapper, target.firstChild);
        },
    });
}

function openTaskInNewTab({ KanbanRecord, patch, useEffect }) {
    patch(KanbanRecord.prototype, "odoosoup.open-new-tab", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            useEffect(() => this.renderOpenButton());
        },

        renderOpenButton() {
            const card = this.rootRef.el;
            card.querySelector(".odoosoup-open-btn")?.remove();
            const params = new Map(
                window.location.hash
                    .slice(1)
                    .split("&")
                    .map((e) => e.split("="))
            );
            params.set("model", "project.task");
            params.set("view_type", "form");
            params.set("id", this.props.record.resId);
            let url = `${window.location.origin}/web#`;
            let first = true;
            for (key of [
                "cids",
                "menu_id",
                "action",
                "active_id",
                "model",
                "view_type",
                "id",
            ]) {
                if (!first) {
                    url += "&";
                } else {
                    first = false;
                }
                url += `${key}=${params.get(key)}`;
            }
            const link = document.createElement("div");
            link.innerHTML = `<a target="_blank" class="odoosoup-open-btn" href="${url}">Open task</a>`;
            card.querySelector(".oe_kanban_content").appendChild(link);
        },
    });
}

function addTaskNotes({ KanbanRecord, FormRenderer, ListRenderer, debounce, patch, useEffect }) {
    patch(FormRenderer.prototype, "odoosoup.task-notes", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            this.odooSoupViewRoot = owl.useRef("compiled_view_root");
            useEffect(() => this.renderTextArea());
        },

        storageKey() {
            return `odoosoup.task.${this.props.record.data.id}`;
        },

        onSave() {
            const text = this.textArea.value.trim();
            if (text) {
                localStorage[this.storageKey()] = text;
            } else {
                localStorage.removeItem(this.storageKey());
            }
        },

        onInput() {
            this.style.height = "0";
            this.style.height = `${Math.max(this.scrollHeight, 50)}px`;
        },

        renderTextArea() {
            const note = localStorage[this.storageKey()] || "";
            this.odooSoupViewRoot.el.querySelectorAll(".odoosoup-notes").forEach((e) => e.remove());
            this.textArea = document.createElement("textarea");
            this.textArea.value = note;
            this.textArea.classList.add(
                "odoosoup-notes",
                "border-success",
                "border",
                "bg-success-light",
                "text-900",
                "overflow-hidden",
            );
            this.textArea.style.resize = "none";
            this.textArea.addEventListener("input", debounce(this.onSave.bind(this), 125));
            this.textArea.addEventListener("blur", this.onSave.bind(this));
            this.textArea.addEventListener("input", this.onInput);
            let target = this.odooSoupViewRoot.el.querySelector(".oe_title");
            if (target) {
                target.parentNode.insertBefore(this.textArea, target.nextSibling);
            } else {
                target = this.odooSoupViewRoot.el.querySelector(".o_form_sheet");
                target.insertBefore(this.textArea, target.firstChild);
            }
            this.textArea.style.height = `${Math.max(this.textArea.scrollHeight, 50)}px`;
        },
    });
    patch(KanbanRecord.prototype, "odoosoup.task-notes", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            useEffect(() => this.renderNote());
        },

        renderNote() {
            const id = this.props.record.resId;
            const dataPointId = this.props.record.id;
            const card = this.rootRef.el.querySelector(
                `div[data-id="${dataPointId}"] .oe_kanban_card`
            );
            card.querySelector(".odoosoup-note")?.remove();
            const note = localStorage[`odoosoup.task.${id}`];
            if (!note) {
                return;
            }
            const div = document.createElement("div");
            div.classList.add(
                "odoosoup-note",
                "text-truncate",
                "border-success",
                "border",
                "bg-success-light",
                "text-900"
            );
            div.textContent = note.replace(/^\s+|\s+$/g, "").replace(/\s*\n\s*/g, "⏎");
            card.appendChild(div);
        },
    });

    patch(ListRenderer.prototype, "odoosoup.task-notes", {
        setup() {
            this._super();
            if (this.props.list.resModel !== "project.task") {
                return;
            }
            useEffect(() => this.renderNotes());
        },

        renderNotes() {
            this.props.list.records.forEach((record) => {
                const id = record.resId;
                const note = localStorage[`odoosoup.task.${id}`];
                if (!note) {
                    return;
                }
                const $div = document.createElement("div");
                $div.classList.add(
                    "odoosoup-note",
                    "text-truncate",
                    "border-success",
                    "border",
                    "bg-success-light",
                    "text-900"
                );
                $div.textContent = note.replace(/^\s+|\s+$/g, "").replace(/\s*\n\s*/g, "⏎");
                const $row = this.rootRef.el.querySelector(`tr[data-id="${record.id}"]`);
                $row.querySelector(".odoosoup-note")?.remove();
                $row.querySelector('td[name="name"]').appendChild($div);
            });
        },
    });
}

const odoosoupPatches = [
    addCopyIdToTasks,
    trackOpenedTickets,
    addTaskNotes,
    openTaskInNewTab,
];

odoo.define("odoosoup", [
    "@web/core/utils/patch",
    "@web/core/utils/timing",
    "@web/views/form/form_renderer",
    "@web/search/control_panel/control_panel",
    "@web/views/kanban/kanban_record",
    "@web/views/list/list_renderer",
    "@odoo/owl",
], (require) => {
    const { patch } = require("@web/core/utils/patch");
    const { debounce } = require("@web/core/utils/timing");
    const { FormRenderer } = require("@web/views/form/form_renderer");
    const { ControlPanel } = require("@web/search/control_panel/control_panel");
    const { KanbanRecord } = require("@web/views/kanban/kanban_record");
    const { ListRenderer } = require("@web/views/list/list_renderer");
    const { onRendered, useEffect } = require("@odoo/owl");

    const dependencies = {
        ControlPanel,
        FormRenderer,
        KanbanRecord,
        ListRenderer,
        debounce,
        onRendered,
        patch,
        useEffect,
    };

    odoosoupPatches.forEach((patchFn) => patchFn(dependencies));
});

})()
