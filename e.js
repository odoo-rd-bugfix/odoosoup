// ==UserScript== //
// @name odoosoup
// @match https://www.odoo.com/web
// @match https://www.odoo.com/web?*
// ==/UserScript==

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
                const card = this.rootRef.el;
                card.querySelectorAll(".odoosoup-eye").forEach((e) => e.remove());
                const target = card.querySelector('div[name="priority"]');
                const parent = document.createElement("div");
                parent.classList.add("odoosoup-eye");
                const eye = document.createElement("i");
                parent.appendChild(eye);
                eye.classList.add("fa", "fa-lg", "fa-eye");
                target.parentNode.insertBefore(parent, target.nextSibling);
            }
        },
    });
}

function addCopyIdToTasks({
    KanbanRecord,
    FormControlPanel,
    FormRenderer,
    onMounted,
    onPatched,
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
    patch(FormControlPanel.prototype, "odoosoup.copy-id", {
        renderCopyIdButton() {
            const target = document.querySelector(".o_cp_bottom_right");
            target.querySelectorAll(".odoosoup-copy-btn").forEach((e) => e.remove());
            const button = document.createElement("button");
            button.classList.add("btn", "btn-outline-primary", "odoosoup-copy-btn");
            button.textContent = "Copy ID";
            bindCopyId(button, recordId, ["btn-outline-primary"], ["btn-outline-success"]);
            target.appendChild(button);
        },

        setup() {
            this._super();
            onMounted(() => this.renderCopyIdButton());
            onPatched(() => this.renderCopyIdButton());
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
            onMounted(() => this.renderCopyIdButton());
            onPatched(() => this.renderCopyIdButton());
        },

        renderCopyIdButton() {
            const id = this.props.record.resId;
            const card = this.rootRef.el;
            const target = card.querySelector('div[name="priority"]');
            card.querySelector(".odoosoup-copy-btn")?.remove();
            const copyIcon = document.createElement("i");
            copyIcon.classList.add("fa", "fa-clipboard");
            bindCopyId(copyIcon, id, [], ["text-success"]);
            const wrapper = document.createElement("div");
            wrapper.classList.add("odoosoup-copy-btn");
            wrapper.appendChild(copyIcon);
            target.parentNode.insertBefore(wrapper, target.nextSibling);
        },
    });
}

function openTaskInNewTab({ KanbanRecord, patch, onMounted, onPatched }) {
    patch(KanbanRecord.prototype, "odoosoup.open-new-tab", {
        setup() {
            this._super();
            if (this.props.record.resModel !== "project.task") {
                return;
            }
            onMounted(() => this.renderOpenButton());
            onPatched(() => this.renderOpenButton());
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
            const target = document.querySelector(".oe_title");
            document.querySelectorAll(".odoosoup-notes").forEach((e) => e.remove());
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
            target.parentNode.insertBefore(this.textArea, target.nextSibling);
            this.textArea.style.height = `${Math.max(this.textArea.scrollHeight, 50)}px`;
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
            const card = document.querySelector(
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
}

const odoosoupPatches = {
    addCopyIdToTasks,
    trackOpenedTickets,
    addTaskNotes,
    openTaskInNewTab,
};

const odoosoup = function () {

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

        odoosoupPatches.forEach((patchFn) => patchFn(dependencies));
    });

};

const script = document.createElement("script");
let scriptContent = "";

for (let patch of Object.values(odoosoupPatches)) {
    scriptContent += patch.toString();
    scriptContent += "\n";
}

scriptContent += "const odoosoupPatches = ["
scriptContent += Object.keys(odoosoupPatches).join(", ");
scriptContent += "];\n";
scriptContent += "(" + odoosoup.toString() + ")()";
script.innerText = scriptContent;
document.querySelector("head").appendChild(script);
