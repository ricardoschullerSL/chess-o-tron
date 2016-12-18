var m = require('mithril');

module.exports = function(controller) {
  return [
    m('input.copyable.autoselect', {
      spellcheck: false,
      value: controller.fen(),
      oninput: m.withAttr('value', controller.updateFen),
      onclick: function() {
        this.select();
      }
    })
  ];
};
