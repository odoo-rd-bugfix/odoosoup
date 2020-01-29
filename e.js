// ==UserScript== //
// @name odoosoup
// @match https://www.odoo.com/web
// @match https://www.odoo.com/web?*
// ==/UserScript==

var inject = function () {
    odoo.define('odoosoup.web', function (require) {
        var FormRenderer = require('web.FormRenderer');
        var KanbanRenderer = require('web.KanbanRenderer');
        FormRenderer.include({
            _show_odoosoup: function () {
                var self = this;
                if (self.state.model !== 'project.task') {
                    return;
                }
                var opened = JSON.parse(localStorage['odoosoup.task.opened'] || '[]');
                var id = self.state.res_id || null;
                var currentIndex = opened.indexOf(id);
                if (currentIndex !== -1) {
                    opened.splice(currentIndex, 1);
                    $('h1 .o_task_name', self.$el).addClass('fa fa-eye');
                } else if (opened.length > 2000) {
                    delete localStorage['odoosoup.task.'+opened.splice(0, 1)[0]];
                }
                opened.push(id);
                localStorage['odoosoup.task.opened'] = JSON.stringify(opened);
                var note = localStorage['odoosoup.task.'+id] || '';
                $('textarea.odoosoup_task_note').remove();
                $('<textarea class="odoosoup_task_note"/>').val(note).insertBefore($('h1', self.$el)).on('input', function () {
                    if (this.value !== note) {
                        if (this.value.trim()) {
                            localStorage['odoosoup.task.'+id] = note = this.value;
                        } else {
                            note = '';
                            delete localStorage['odoosoup.task.'+id];
                        }
                    }
                    this.style.height = "23px";
                    this.style.height = (this.scrollHeight)+"px";
                }).trigger('input');
            },
            on_attach_callback: function () {
                var res = this._super.apply(this, arguments);
                this._show_odoosoup();
                return res;
            },
            updateState: function () {
                var res = this._super.apply(this, arguments);
                return res.then(function () {
                    this._show_odoosoup();
                    return res;
                }.bind(this));
            },
        });
        KanbanRenderer.include({
            _show_odoosoup: function (target) {
                var self = this;
                if (self.state.model !== 'project.task') {
                    return;
                }
                var opened = JSON.parse(localStorage['odoosoup.task.opened'] || '[]');
                $('.o_kanban_record', target).each(function () {
                    if (!$(this).data('record')) {
                        return;
                    }
                    var id = $(this).data('record').id;
                    if (opened.includes(id)) {
                        $('.o_kanban_record_title', this).addClass('fa fa-eye');
                        var note = localStorage['odoosoup.task.'+id] || '';
                        if (note) {
                            $('.odoosoup_task_note', this).remove();
                            $('<div class="odoosoup_task_note text-truncate"/>').attr('title', $('<div class="odoosoup_task_note_tooltip" />').text(note).prop('outerHTML')).tooltip({'html': true}).text(note.replace(/^\s+|\s+$/g, '').replace(/\s*\n\s*/g, '⏎')).appendTo(this);
                        }
                    }
                });
            },
            on_attach_callback: function () {
                var res = this._super.apply(this, arguments);
                this._show_odoosoup();
                return res;
            },
            updateState: function () {
                var res = this._super.apply(this, arguments);
                return res.then(function () {
                    this._show_odoosoup();
                    return res;
                }.bind(this));
            },
            updateColumn: function (localID) {
                var self = this;
                var res = this._super.apply(this, arguments);
                return res.then(function () {
                    var index = _.findIndex(this.widgets, {db_id: localID});
                    var column = this.widgets[index];
                    self._show_odoosoup(column.$el);
                    return res;
                }.bind(this));
            }
        });
    });
};
var s = document.createElement('script');
s.innerText = '('+inject.toString() + ')()';
document.getElementsByTagName('head')[0].appendChild(s);
var l = document.createElement('style');
l.innerText = `
/* style over existing odoo.com features */

nav.o_main_navbar {
    background-color: #673A5B;
}

/* feature added by odoosoup */

.odoosoup_task_note {
    border: 1px solid #60ba8a;
    color: #207a4a;
    background: #f1ffe8;
}
textarea.odoosoup_task_note {
    overflow: hidden;
    min-height: 23px;
    resize: none;
}
.odoosoup_task_note_tooltip {
    white-space: pre-wrap;
}
`;
document.getElementsByTagName('head')[0].appendChild(l);
