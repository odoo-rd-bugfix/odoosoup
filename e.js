var inject = function () {
    odoo.define('odoosoup.web', function (require) {
        var FormRenderer = require('web.FormRenderer');
        var KanbanModel = require('web.KanbanModel');
        FormRenderer.include({
            _show_odoosoup: function () {
                var self = this;
                if (self.state.model !== 'project.task') {
                    return;
                }
                var opened = JSON.parse(localStorage['odoosoup.task.opened'] || '[]');
                var currentIndex = opened.indexOf(self.state.res_id);
                if (currentIndex !== -1) {
                    opened.splice(currentIndex, 1);
                    $('h1 .o_task_name', self.$el).addClass('fa fa-eye');
                } else if (opened.length > 2000) {
                    delete localStorage['odoosoup.task.'+opened.splice(0, 1)[0]];
                }
                opened.push(self.state.res_id);
                localStorage['odoosoup.task.opened'] = JSON.stringify(opened);
                var note = localStorage['odoosoup.task.'+self.state.res_id] || '';
                $('textarea.odoosoup_task_note').remove();
                $('<textarea class="odoosoup_task_note"/>').val(note).insertBefore($('h1', self.$el)).on('input', function () {
                    if (this.value !== note) {
                        if (this.value.trim()) {
                            localStorage['odoosoup.task.'+self.state.res_id] = note = this.value;
                        } else {
                            note = '';
                            delete localStorage['odoosoup.task.'+self.state.res_id];
                        }
                        this.style.height = "23px";
                        this.style.height = (this.scrollHeight)+"px";
                    }
                }).each(function () {
                    this.style.height = "23px";
                    this.style.height = (this.scrollHeight)+"px";
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
        });
        KanbanModel.include({
            _load: function (dataPoint) {
                var res = this._super.apply(this, arguments);
                if (dataPoint.model !== "project.task")  {
                    return res
                }
                return res.then(function () {
                    setTimeout(function () {
                        var opened = JSON.parse(localStorage['odoosoup.task.opened'] || '[]');
                        $('.o_kanban_record').each(function () {
                            var id = $(this).data('record').id;
                            if (opened.includes(id)) {
                                $('.o_kanban_record_title', this).addClass('fa fa-eye');
                                var note = localStorage['odoosoup.task.'+id] || '';
                                if (note) {
                                    $('.odoosoup_task_note', this).remove();
                                    $('<div class="odoosoup_task_note text-truncate"/>').attr('title', $('<div />').css('white-space', 'pre-wrap').text(note).prop('outerHTML')).tooltip({'html': true}).text(note.replace(/^\s+|\s+$/g, '').replace(/\s*\n\s*/g, '⏎')).appendTo(this);
                                }
                            }
                        });
                    });
                    return res;
                });
            },
        });
    });
};
var s = document.createElement('script');
s.innerText = '('+inject.toString() + ')()';
document.getElementsByTagName('head')[0].appendChild(s);
var l = document.createElement('style');
l.innerText = `.odoosoup_task_note {
    border: 1px solid #60ba8a;
    color: #207a4a;
    background: #f1ffe8;
}
textarea.odoosoup_task_note {
    overflow: hidden;
    min-height: 23px;
    resize: none;
}`;
document.getElementsByTagName('head')[0].appendChild(l);
