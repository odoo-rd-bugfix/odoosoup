// ==UserScript== //
// @name odoosoup
// @match https://www.odoo.com/web
// @match https://www.odoo.com/web?*
// @match https://www.odoo.com/odoo
// @match https://www.odoo.com/odoo/*
// @match https://www.odoo.com/odoo?*
// ==/UserScript==

(function () {
    async function inject(name, dependencies) {
        const { promise, resolve } = Promise.withResolvers();
        odoo.define(
            name,
            dependencies.map((e) => e[0]),
            (require) => {
                const resolvedDependencies = {};
                dependencies.forEach(([name, ...required]) => {
                    const module = require(name);
                    required.forEach((name) => (resolvedDependencies[name] = module[name]));
                });
                resolve(resolvedDependencies);
            }
        );
        return promise;
    }

    /* Owl 2 (odoo <= saas-19.3): delete this block once odoo.com runs 20.0 */
    if (owl.__info__.version.startsWith("2.")) {
        function patchViews({
            applyInheritance,
            KanbanArchParser,
            FormArchParser,
            ListArchParser,
            patch,
            registry,
        }) {
            const parser = new DOMParser();

            const xpathPatch = () => ({
                parse(xmlDoc, models, modelName) {
                    const views = registry.category("odoosoup.views").getAll();
                    const matches = views
                        .filter((edit) => edit.accept(xmlDoc, models, modelName))
                        .map((edit) => edit.arch);
                    matches.forEach((match) => {
                        applyInheritance(
                            xmlDoc,
                            parser.parseFromString(match, "text/xml").documentElement,
                            "/odoosoup/static/src/e.js"
                        );
                    });
                    return super.parse(xmlDoc, models, modelName);
                },
            });

            patch(KanbanArchParser.prototype, xpathPatch());
            patch(FormArchParser.prototype, xpathPatch());
            patch(ListArchParser.prototype, xpathPatch());
        }

        function insertOpenedIcon({
            registry,
            Component,
            xml,
            patch,
            useService,
            FormRenderer,
            useEffect,
            standardWidgetProps,
        }) {
            const taskOpenedService = {
                start(env) {
                    const localStorageKey = "odoosoup.task.opened";
                    let openedTickets = JSON.parse(localStorage[localStorageKey] || "[]");

                    /* track changes from other tabs */
                    window.onstorage = (event) => {
                        if (event.key !== localStorageKey) {
                            return;
                        }
                        openedTickets = JSON.parse(event.newValue || "[]");
                    };

                    function contains(id) {
                        return openedTickets.includes(id);
                    }

                    function add(id) {
                        if (id && !contains(id)) {
                            openedTickets.push(id);
                            localStorage[localStorageKey] = JSON.stringify(openedTickets);
                        }
                    }

                    return { contains, add };
                },
            };

            registry.category("services").add("odoosoup.task_opened", taskOpenedService);

            patch(FormRenderer.prototype, {
                setup() {
                    super.setup();
                    if (this.props.record.resModel !== "project.task") {
                        return;
                    }
                    this.taskOpened = useService("odoosoup.task_opened");
                    useEffect(
                        (id) => {
                            this.taskOpened.add(id);
                        },
                        () => [this.props.record.resId]
                    );
                },
            });

            class OpenedIcon extends Component {
                static template = xml`<i t-if="this.taskOpened.contains(this.props.record.resId)" class="fa fa-eye"/>`;
                static props = { ...standardWidgetProps };

                setup() {
                    this.taskOpened = useService("odoosoup.task_opened");
                }
            }

            registry.category("view_widgets").add("odoosoup.opened_icon", {
                component: OpenedIcon,
            });

            registry.category("odoosoup.views").add("project.task.kanban.opened", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_kanban",
                arch: `<t>
                    <xpath expr="//footer/div" position="inside">
                        <widget name="odoosoup.opened_icon"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.list.opened", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_list",
                arch: `<t>
                    <xpath expr="//field[@name='name']" position="after">
                        <widget name="odoosoup.opened_icon"/>
                    </xpath>
                </t>`,
            });
        }

        function insertCopyButton({ Component, xml, registry, CopyButton, standardWidgetProps }) {
            class CopyIdButton extends Component {
                static template = xml`<CopyButton
                    t-if="this.props.record.resId"
                    className="isForm ? 'btn btn-secondary' : ''"
                    content="this.props.record.resId.toString()"
                    successText="'Copied ID'"
                    copyText="isForm ? 'Copy ID' : ''"
                />`;
                static components = { CopyButton };
                static props = { ...standardWidgetProps };

                get isForm() {
                    return this.env.config.viewType === "form";
                }
            }

            registry.category("view_widgets").add("odoosoup.copy_button", {
                component: CopyIdButton,
            });

            registry.category("odoosoup.views").add("project.task.form.copy_id", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_task_form",
                arch: `<t>
                    <xpath expr="//field[@name='stage_id']" position="before">
                        <widget name="odoosoup.copy_button"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.kanban.copy_id", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_kanban",
                arch: `<t>
                    <xpath expr="//footer/div" position="inside">
                        <widget name="odoosoup.copy_button"/>
                    </xpath>
                </t>`,
            });
        }

        function insertNotes({
            Component,
            xml,
            standardWidgetProps,
            registry,
            useRef,
            debounce,
            useEffect,
            onWillUpdateProps,
        }) {
            class Notes extends Component {
                static props = { ...standardWidgetProps };
                static template = xml`<t>
                    <textarea
                        t-if="!props.readonly"
                        t-ref="input"
                        id="notes_textarea"
                        class="border-success border bg-success-light text-900 overflow-hidden"
                        t-attf-style="resize: none;{{ isCompact ? 'max-width: 200px': '' }}"
                        t-on-input="this.onInput"
                        t-on-blur="this.save"
                        t-att-value="this.value"
                    />
                    <div
                        t-else=""
                        t-if="value"
                        t-out="preview"
                        t-attf-style="{{ isCompact ? 'max-width: 200px': '' }}"
                        class="text-truncate border-success border bg-success-light text-900"
                    />
                </t>`;

                setup() {
                    this.input = useRef("input");
                    this.value = localStorage[this.storageKey(this.props.record.resId)] || "";
                    this.debouncedSave = debounce(this.save.bind(this), 125);
                    useEffect(() => {
                        if (!this.props.readonly) {
                            this.resize();
                        }
                    });
                    onWillUpdateProps((nextProps) => {
                        if (nextProps.record.resId !== this.props.record.resId) {
                            this.value = localStorage[this.storageKey(nextProps.record.resId)] || "";
                        }
                    });
                }

                get isCompact() {
                    return this.env.config?.viewType === "list";
                }

                storageKey(resId) {
                    return `odoosoup.task.${resId}`;
                }

                resize() {
                    this.input.el.style.height = "0";
                    this.input.el.style.height = `${Math.max(this.input.el.scrollHeight, 50)}px`;
                }

                onInput() {
                    this.resize();
                    this.debouncedSave();
                }

                save() {
                    this.value = this.input.el.value.trim();
                    if (this.value) {
                        localStorage[this.storageKey(this.props.record.resId)] = this.value;
                    } else {
                        localStorage.removeItem(this.storageKey(this.props.record.resId));
                    }
                }

                get preview() {
                    if (!this.value) {
                        return;
                    }
                    return this.value.replace(/^\s+|\s+$/g, "").replace(/\s*\n\s*/g, "⏎");
                }
            }

            registry.category("view_widgets").add("odoosoup.notes", {
                component: Notes,
            });

            registry.category("odoosoup.views").add("project.task.form.notes", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_task_form",
                arch: `<t>
                    <xpath expr="//field[@name='name']/parent::h1/parent::div" position="after">
                        <widget name="odoosoup.notes"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.list.notes", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_list",
                arch: `<t>
                    <xpath expr="//field[@name='name']" position="after">
                        <widget name="odoosoup.notes"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.kanban.notes", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_kanban",
                arch: `<t>
                    <xpath expr="//field[@name='displayed_image_id']" position="after">
                        <widget name="odoosoup.notes"/>
                    </xpath>
                </t>`,
            });
        }

        const patches = [insertOpenedIcon, insertCopyButton, patchViews, insertNotes];

        inject("odoosoup", [
            ["@odoo/owl", "xml", "Component", "useEffect", "useRef", "onWillUpdateProps"],
            ["@web/core/registry", "registry"],
            ["@web/core/utils/hooks", "useService"],
            ["@web/core/utils/patch", "patch"],
            ["@web/views/kanban/kanban_arch_parser", "KanbanArchParser"],
            ["@web/views/form/form_arch_parser", "FormArchParser"],
            ["@web/views/list/list_arch_parser", "ListArchParser"],
            ["@web/views/form/form_renderer", "FormRenderer"],
            ["@web/core/copy_button/copy_button", "CopyButton"],
            ["@web/views/widgets/standard_widget_props", "standardWidgetProps"],
            ["@web/core/template_inheritance", "applyInheritance"],
            ["@web/core/utils/timing", "debounce"],
        ]).then((dependencies) => {
            patches.forEach((patch) => patch.call(this, dependencies));
        });
    } else {
        function patchViews({
            applyInheritance,
            KanbanArchParser,
            FormArchParser,
            ListArchParser,
            patch,
            registry,
        }) {
            const parser = new DOMParser();

            const xpathPatch = () => ({
                parse(xmlDoc, models, modelName) {
                    const views = registry.category("odoosoup.views").getEntries();
                    views
                        .filter(([, edit]) => edit.accept(xmlDoc, models, modelName))
                        .forEach(([name, edit]) => {
                            try {
                                applyInheritance(
                                    xmlDoc,
                                    parser.parseFromString(edit.arch, "text/xml").documentElement,
                                    "/odoosoup/static/src/e.js"
                                );
                            } catch (error) {
                                console.warn(`[odoosoup] skipped ${name}:`, error.message);
                            }
                        });
                    return super.parse(xmlDoc, models, modelName);
                },
            });

            patch(KanbanArchParser.prototype, xpathPatch());
            patch(FormArchParser.prototype, xpathPatch());
            patch(ListArchParser.prototype, xpathPatch());
        }

        function insertOpenedIcon({
            registry,
            services,
            Component,
            Plugin,
            xml,
            patch,
            signal,
            untrack,
            useEffect,
            useListener,
            usePlugin,
            useProps,
            FormRenderer,
            standardWidgetProps,
        }) {
            const localStorageKey = "odoosoup.task.opened";
            const maxOpened = 1000;
            const load = (raw) => JSON.parse(raw || "[]");

            class TaskOpenedPlugin extends Plugin {
                static id = "odoosoup.task_opened";
                opened = signal(load(localStorage[localStorageKey]));

                setup() {
                    /* track changes from other tabs */
                    useListener(window, "storage", (event) => {
                        if (event.key === localStorageKey) {
                            this.opened.set(load(event.newValue));
                        }
                    });
                }

                contains(id) {
                    return this.opened().includes(id);
                }

                add(id) {
                    if (id && !this.contains(id)) {
                        let opened = [...this.opened(), id];
                        if (opened.length > maxOpened) {
                            opened = opened.sort((a, b) => a - b).slice(-maxOpened);
                        }
                        this.opened.set(opened);
                        localStorage[localStorageKey] = JSON.stringify(opened);
                    }
                }
            }

            services.add(TaskOpenedPlugin);

            patch(FormRenderer.prototype, {
                setup() {
                    super.setup();
                    if (this.props.record.resModel !== "project.task") {
                        return;
                    }
                    const taskOpened = usePlugin(TaskOpenedPlugin);
                    useEffect(() => {
                        const resId = this.props.record.resId;
                        untrack(() => taskOpened.add(resId));
                    });
                },
            });

            class OpenedIcon extends Component {
                static template = xml`<i t-if="this.taskOpened.contains(this.props.record.resId)" class="oi" data-icon="visibility"/>`;
                props = useProps(standardWidgetProps);
                taskOpened = usePlugin(TaskOpenedPlugin);
            }

            registry.category("view_widgets").add("odoosoup.opened_icon", {
                component: OpenedIcon,
            });

            registry.category("odoosoup.views").add("project.task.kanban.opened", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_kanban",
                arch: `<t>
                    <xpath expr="//footer/field[@name='is_rotting']" position="before">
                        <widget name="odoosoup.opened_icon"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.list.opened", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_list",
                arch: `<t>
                    <xpath expr="//field[@name='name']" position="after">
                        <widget name="odoosoup.opened_icon"/>
                    </xpath>
                </t>`,
            });
        }

        function insertCopyButton({ Component, xml, t, useProps, registry, CopyButton, standardWidgetProps }) {
            class CopyIdButton extends Component {
                static template = xml`<CopyButton
                    t-if="this.props.record.resId"
                    className="this.props.isForm ? 'btn btn-secondary' : ''"
                    content="this.props.record.resId.toString()"
                    successText="'Copied ID'"
                    copyText="this.props.isForm ? 'Copy ID' : ''"
                />`;
                static components = { CopyButton };
                props = useProps({ ...standardWidgetProps, isForm: t.boolean().optional(false) });
            }

            registry.category("view_widgets").add("odoosoup.copy_button", {
                component: CopyIdButton,
                extractProps: ({ attrs }) => ({ isForm: Boolean(attrs.form) }),
            });

            registry.category("odoosoup.views").add("project.task.form.copy_id", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_task_form",
                arch: `<t>
                    <xpath expr="//field[@name='stage_id']" position="before">
                        <widget name="odoosoup.copy_button" form="1"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.kanban.copy_id", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_kanban",
                arch: `<t>
                    <xpath expr="//footer/field[@name='is_rotting']" position="before">
                        <widget name="odoosoup.copy_button"/>
                    </xpath>
                </t>`,
            });
        }

        function insertNotes({
            Component,
            xml,
            t,
            signal,
            useEffect,
            useProps,
            onMounted,
            onPatched,
            standardWidgetProps,
            registry,
            debounce,
        }) {
            const storageKey = (resId) => `odoosoup.task.${resId}`;

            function persist(resId, text) {
                const value = text.trim();
                if (value) {
                    localStorage[storageKey(resId)] = value;
                } else {
                    localStorage.removeItem(storageKey(resId));
                }
                return value;
            }

            class Notes extends Component {
                static template = xml`<t>
                    <textarea
                        t-if="!this.props.readonly"
                        t-ref="this.inputRef"
                        id="notes_textarea"
                        class="border-success border bg-success-light text-900 overflow-hidden"
                        t-attf-style="resize: none;{{ this.props.compact ? 'max-width: 200px': '' }}"
                        t-on-input="this.onInput"
                        t-on-blur="this.onBlur"
                        t-att-value="this.value()"
                    />
                    <div
                        t-elif="this.value()"
                        t-out="this.preview"
                        t-attf-style="{{ this.props.compact ? 'max-width: 200px': '' }}"
                        class="text-truncate border-success border bg-success-light text-900"
                    />
                </t>`;
                props = useProps({ ...standardWidgetProps, compact: t.boolean().optional(false) });
                inputRef = signal.ref();
                value = signal("");
                debouncedPersist = debounce(persist, 125);

                setup() {
                    /* reload when the record changes (form pager, list row reuse) */
                    useEffect(() => {
                        this.value.set(localStorage[storageKey(this.props.record.resId)] || "");
                    });
                    onMounted(() => this.resize());
                    onPatched(() => this.resize());
                }

                resize() {
                    const el = this.inputRef();
                    if (el) {
                        el.style.height = "0";
                        el.style.height = `${Math.max(el.scrollHeight, 50)}px`;
                    }
                }

                onInput(ev) {
                    this.resize();
                    /* don't touch the signal while typing: re-rendering would reset the textarea */
                    this.debouncedPersist(this.props.record.resId, ev.target.value);
                }

                onBlur(ev) {
                    this.value.set(persist(this.props.record.resId, ev.target.value));
                }

                get preview() {
                    return this.value().replace(/\s*\n\s*/g, "⏎");
                }
            }

            registry.category("view_widgets").add("odoosoup.notes", {
                component: Notes,
                extractProps: ({ attrs }) => ({ compact: Boolean(attrs.compact) }),
            });

            registry.category("odoosoup.views").add("project.task.form.notes", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_task_form",
                arch: `<t>
                    <xpath expr="//field[@name='name']/parent::h1/parent::div" position="after">
                        <widget name="odoosoup.notes"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.list.notes", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_list",
                arch: `<t>
                    <xpath expr="//field[@name='name']" position="after">
                        <widget name="odoosoup.notes" compact="1"/>
                    </xpath>
                </t>`,
            });

            registry.category("odoosoup.views").add("project.task.kanban.notes", {
                accept: (xmlDoc, models, modelName) =>
                    modelName === "project.task" &&
                    xmlDoc.getAttribute("js_class") === "project_enterprise_task_kanban",
                arch: `<t>
                    <xpath expr="//field[@name='displayed_image_id']" position="after">
                        <widget name="odoosoup.notes"/>
                    </xpath>
                </t>`,
            });
        }

        const patches = [insertOpenedIcon, insertCopyButton, patchViews, insertNotes];

        inject("odoosoup", [
            [
                "@odoo/owl",
                "xml",
                "t",
                "Component",
                "Plugin",
                "signal",
                "untrack",
                "useEffect",
                "useListener",
                "usePlugin",
                "useProps",
                "onMounted",
                "onPatched",
            ],
            ["@web/core/registry", "registry"],
            ["@web/core/services", "services"],
            ["@web/core/utils/patch", "patch"],
            ["@web/views/kanban/kanban_arch_parser", "KanbanArchParser"],
            ["@web/views/form/form_arch_parser", "FormArchParser"],
            ["@web/views/list/list_arch_parser", "ListArchParser"],
            ["@web/views/form/form_renderer", "FormRenderer"],
            ["@web/core/copy_button/copy_button", "CopyButton"],
            ["@web/views/widgets/standard_widget_props", "standardWidgetProps"],
            ["@web/core/template_inheritance", "applyInheritance"],
            ["@web/core/utils/timing", "debounce"],
        ]).then((dependencies) => {
            patches.forEach((patch) => patch.call(this, dependencies));
        });
    }
})();
