(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Trainer = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var util = require('./util');

// https://gist.github.com/gre/1650294
var easing = {
  easeInOutCubic: function(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },
};

function makePiece(k, piece, invert) {
  var key = invert ? util.invertKey(k) : k;
  return {
    key: key,
    pos: util.key2pos(key),
    role: piece.role,
    color: piece.color
  };
}

function samePiece(p1, p2) {
  return p1.role === p2.role && p1.color === p2.color;
}

function closer(piece, pieces) {
  return pieces.sort(function(p1, p2) {
    return util.distance(piece.pos, p1.pos) - util.distance(piece.pos, p2.pos);
  })[0];
}

function computePlan(prev, current) {
  var bounds = current.bounds(),
    width = bounds.width / 8,
    height = bounds.height / 8,
    anims = {},
    animedOrigs = [],
    fadings = [],
    missings = [],
    news = [],
    invert = prev.orientation !== current.orientation,
    prePieces = {},
    white = current.orientation === 'white';
  for (var pk in prev.pieces) {
    var piece = makePiece(pk, prev.pieces[pk], invert);
    prePieces[piece.key] = piece;
  }
  for (var i = 0; i < util.allKeys.length; i++) {
    var key = util.allKeys[i];
    if (key !== current.movable.dropped[1]) {
      var curP = current.pieces[key];
      var preP = prePieces[key];
      if (curP) {
        if (preP) {
          if (!samePiece(curP, preP)) {
            missings.push(preP);
            news.push(makePiece(key, curP, false));
          }
        } else
          news.push(makePiece(key, curP, false));
      } else if (preP)
        missings.push(preP);
    }
  }
  news.forEach(function(newP) {
    var preP = closer(newP, missings.filter(util.partial(samePiece, newP)));
    if (preP) {
      var orig = white ? preP.pos : newP.pos;
      var dest = white ? newP.pos : preP.pos;
      var vector = [(orig[0] - dest[0]) * width, (dest[1] - orig[1]) * height];
      anims[newP.key] = [vector, vector];
      animedOrigs.push(preP.key);
    }
  });
  missings.forEach(function(p) {
    if (
      p.key !== current.movable.dropped[0] &&
      !util.containsX(animedOrigs, p.key) &&
      !(current.items ? current.items.render(p.pos, p.key) : false)
    )
      fadings.push({
        piece: p,
        opacity: 1
      });
  });

  return {
    anims: anims,
    fadings: fadings
  };
}

function roundBy(n, by) {
  return Math.round(n * by) / by;
}

function go(data) {
  if (!data.animation.current.start) return; // animation was canceled
  var rest = 1 - (new Date().getTime() - data.animation.current.start) / data.animation.current.duration;
  if (rest <= 0) {
    data.animation.current = {};
    data.render();
  } else {
    var ease = easing.easeInOutCubic(rest);
    for (var key in data.animation.current.anims) {
      var cfg = data.animation.current.anims[key];
      cfg[1] = [roundBy(cfg[0][0] * ease, 10), roundBy(cfg[0][1] * ease, 10)];
    }
    for (var i in data.animation.current.fadings) {
      data.animation.current.fadings[i].opacity = roundBy(ease, 100);
    }
    data.render();
    util.requestAnimationFrame(function() {
      go(data);
    });
  }
}

function animate(transformation, data) {
  // clone data
  var prev = {
    orientation: data.orientation,
    pieces: {}
  };
  // clone pieces
  for (var key in data.pieces) {
    prev.pieces[key] = {
      role: data.pieces[key].role,
      color: data.pieces[key].color
    };
  }
  var result = transformation();
  if (data.animation.enabled) {
    var plan = computePlan(prev, data);
    if (Object.keys(plan.anims).length > 0 || plan.fadings.length > 0) {
      var alreadyRunning = data.animation.current.start;
      data.animation.current = {
        start: new Date().getTime(),
        duration: data.animation.duration,
        anims: plan.anims,
        fadings: plan.fadings
      };
      if (!alreadyRunning) go(data);
    } else {
      // don't animate, just render right away
      data.renderRAF();
    }
  } else {
    // animations are now disabled
    data.renderRAF();
  }
  return result;
}

// transformation is a function
// accepts board data and any number of arguments,
// and mutates the board.
module.exports = function(transformation, data, skip) {
  return function() {
    var transformationArgs = [data].concat(Array.prototype.slice.call(arguments, 0));
    if (!data.render) return transformation.apply(null, transformationArgs);
    else if (data.animation.enabled && !skip)
      return animate(util.partialApply(transformation, transformationArgs), data);
    else {
      var result = transformation.apply(null, transformationArgs);
      data.renderRAF();
      return result;
    }
  };
};

},{"./util":15}],2:[function(require,module,exports){
var board = require('./board');

module.exports = function(controller) {

  return {
    set: controller.set,
    toggleOrientation: controller.toggleOrientation,
    getOrientation: controller.getOrientation,
    getPieces: function() {
      return controller.data.pieces;
    },
    getMaterialDiff: function() {
      return board.getMaterialDiff(controller.data);
    },
    getFen: controller.getFen,
    move: controller.apiMove,
    newPiece: controller.apiNewPiece,
    setPieces: controller.setPieces,
    setCheck: controller.setCheck,
    playPremove: controller.playPremove,
    playPredrop: controller.playPredrop,
    cancelPremove: controller.cancelPremove,
    cancelPredrop: controller.cancelPredrop,
    cancelMove: controller.cancelMove,
    stop: controller.stop,
    explode: controller.explode,
    setAutoShapes: controller.setAutoShapes,
    setShapes: controller.setShapes,
    data: controller.data // directly exposes chessground state for more messing around
  };
};

},{"./board":3}],3:[function(require,module,exports){
var util = require('./util');
var premove = require('./premove');
var anim = require('./anim');
var hold = require('./hold');

function callUserFunction(f) {
  setTimeout(f, 1);
}

function toggleOrientation(data) {
  data.orientation = util.opposite(data.orientation);
}

function reset(data) {
  data.lastMove = null;
  setSelected(data, null);
  unsetPremove(data);
  unsetPredrop(data);
}

function setPieces(data, pieces) {
  Object.keys(pieces).forEach(function(key) {
    if (pieces[key]) data.pieces[key] = pieces[key];
    else delete data.pieces[key];
  });
  data.movable.dropped = [];
}

function setCheck(data, color) {
  var checkColor = color || data.turnColor;
  Object.keys(data.pieces).forEach(function(key) {
    if (data.pieces[key].color === checkColor && data.pieces[key].role === 'king') data.check = key;
  });
}

function setPremove(data, orig, dest) {
  unsetPredrop(data);
  data.premovable.current = [orig, dest];
  callUserFunction(util.partial(data.premovable.events.set, orig, dest));
}

function unsetPremove(data) {
  if (data.premovable.current) {
    data.premovable.current = null;
    callUserFunction(data.premovable.events.unset);
  }
}

function setPredrop(data, role, key) {
  unsetPremove(data);
  data.predroppable.current = {
    role: role,
    key: key
  };
  callUserFunction(util.partial(data.predroppable.events.set, role, key));
}

function unsetPredrop(data) {
  if (data.predroppable.current.key) {
    data.predroppable.current = {};
    callUserFunction(data.predroppable.events.unset);
  }
}

function tryAutoCastle(data, orig, dest) {
  if (!data.autoCastle) return;
  var king = data.pieces[dest];
  if (king.role !== 'king') return;
  var origPos = util.key2pos(orig);
  if (origPos[0] !== 5) return;
  if (origPos[1] !== 1 && origPos[1] !== 8) return;
  var destPos = util.key2pos(dest),
    oldRookPos, newRookPos, newKingPos;
  if (destPos[0] === 7 || destPos[0] === 8) {
    oldRookPos = util.pos2key([8, origPos[1]]);
    newRookPos = util.pos2key([6, origPos[1]]);
    newKingPos = util.pos2key([7, origPos[1]]);
  } else if (destPos[0] === 3 || destPos[0] === 1) {
    oldRookPos = util.pos2key([1, origPos[1]]);
    newRookPos = util.pos2key([4, origPos[1]]);
    newKingPos = util.pos2key([3, origPos[1]]);
  } else return;
  delete data.pieces[orig];
  delete data.pieces[dest];
  delete data.pieces[oldRookPos];
  data.pieces[newKingPos] = {
    role: 'king',
    color: king.color
  };
  data.pieces[newRookPos] = {
    role: 'rook',
    color: king.color
  };
}

function baseMove(data, orig, dest) {
  var success = anim(function() {
    if (orig === dest || !data.pieces[orig]) return false;
    var captured = (
      data.pieces[dest] &&
      data.pieces[dest].color !== data.pieces[orig].color
    ) ? data.pieces[dest] : null;
    callUserFunction(util.partial(data.events.move, orig, dest, captured));
    data.pieces[dest] = data.pieces[orig];
    delete data.pieces[orig];
    data.lastMove = [orig, dest];
    data.check = null;
    tryAutoCastle(data, orig, dest);
    callUserFunction(data.events.change);
    return true;
  }, data)();
  if (success) data.movable.dropped = [];
  return success;
}

function baseNewPiece(data, piece, key) {
  if (data.pieces[key]) return false;
  callUserFunction(util.partial(data.events.dropNewPiece, piece, key));
  data.pieces[key] = piece;
  data.lastMove = [key, key];
  data.check = null;
  callUserFunction(data.events.change);
  data.movable.dropped = [];
  data.movable.dests = {};
  data.turnColor = util.opposite(data.turnColor);
  data.renderRAF();
  return true;
}

function baseUserMove(data, orig, dest) {
  var result = baseMove(data, orig, dest);
  if (result) {
    data.movable.dests = {};
    data.turnColor = util.opposite(data.turnColor);
  }
  return result;
}

function apiMove(data, orig, dest) {
  return baseMove(data, orig, dest);
}

function apiNewPiece(data, piece, key) {
  return baseNewPiece(data, piece, key);
}

function userMove(data, orig, dest) {
  if (!dest) {
    hold.cancel();
    setSelected(data, null);
    if (data.movable.dropOff === 'trash') {
      delete data.pieces[orig];
      callUserFunction(data.events.change);
    }
  } else if (canMove(data, orig, dest)) {
    if (baseUserMove(data, orig, dest)) {
      var holdTime = hold.stop();
      setSelected(data, null);
      callUserFunction(util.partial(data.movable.events.after, orig, dest, {
        premove: false,
        holdTime: holdTime
      }));
      return true;
    }
  } else if (canPremove(data, orig, dest)) {
    setPremove(data, orig, dest);
    setSelected(data, null);
  } else if (isMovable(data, dest) || isPremovable(data, dest)) {
    setSelected(data, dest);
    hold.start();
  } else setSelected(data, null);
}

function dropNewPiece(data, orig, dest) {
  if (canDrop(data, orig, dest)) {
    var piece = data.pieces[orig];
    delete data.pieces[orig];
    baseNewPiece(data, piece, dest);
    data.movable.dropped = [];
    callUserFunction(util.partial(data.movable.events.afterNewPiece, piece.role, dest, {
      predrop: false
    }));
  } else if (canPredrop(data, orig, dest)) {
    setPredrop(data, data.pieces[orig].role, dest);
  } else {
    unsetPremove(data);
    unsetPredrop(data);
  }
  delete data.pieces[orig];
  setSelected(data, null);
}

function selectSquare(data, key) {
  if (data.selected) {
    if (key) {
      if (data.selected === key && !data.draggable.enabled) {
        setSelected(data, null);
        hold.cancel();
      } else if (data.selectable.enabled && data.selected !== key) {
        if (userMove(data, data.selected, key)) data.stats.dragged = false;
      } else hold.start();
    } else {
      setSelected(data, null);
      hold.cancel();
    }
  } else if (isMovable(data, key) || isPremovable(data, key)) {
    setSelected(data, key);
    hold.start();
  }
  if (key) callUserFunction(util.partial(data.events.select, key));
}

function setSelected(data, key) {
  data.selected = key;
  if (key && isPremovable(data, key))
    data.premovable.dests = premove(data.pieces, key, data.premovable.castle);
  else
    data.premovable.dests = null;
}

function isMovable(data, orig) {
  var piece = data.pieces[orig];
  return piece && (
    data.movable.color === 'both' || (
      data.movable.color === piece.color &&
      data.turnColor === piece.color
    ));
}

function canMove(data, orig, dest) {
  return orig !== dest && isMovable(data, orig) && (
    data.movable.free || util.containsX(data.movable.dests[orig], dest)
  );
}

function canDrop(data, orig, dest) {
  var piece = data.pieces[orig];
  return piece && dest && (orig === dest || !data.pieces[dest]) && (
    data.movable.color === 'both' || (
      data.movable.color === piece.color &&
      data.turnColor === piece.color
    ));
}


function isPremovable(data, orig) {
  var piece = data.pieces[orig];
  return piece && data.premovable.enabled &&
    data.movable.color === piece.color &&
    data.turnColor !== piece.color;
}

function canPremove(data, orig, dest) {
  return orig !== dest &&
    isPremovable(data, orig) &&
    util.containsX(premove(data.pieces, orig, data.premovable.castle), dest);
}

function canPredrop(data, orig, dest) {
  var piece = data.pieces[orig];
  return piece && dest &&
    (!data.pieces[dest] || data.pieces[dest].color !== data.movable.color) &&
    data.predroppable.enabled &&
    (piece.role !== 'pawn' || (dest[1] !== '1' && dest[1] !== '8')) &&
    data.movable.color === piece.color &&
    data.turnColor !== piece.color;
}

function isDraggable(data, orig) {
  var piece = data.pieces[orig];
  return piece && data.draggable.enabled && (
    data.movable.color === 'both' || (
      data.movable.color === piece.color && (
        data.turnColor === piece.color || data.premovable.enabled
      )
    )
  );
}

function playPremove(data) {
  var move = data.premovable.current;
  if (!move) return;
  var orig = move[0],
    dest = move[1],
    success = false;
  if (canMove(data, orig, dest)) {
    if (baseUserMove(data, orig, dest)) {
      callUserFunction(util.partial(data.movable.events.after, orig, dest, {
        premove: true
      }));
      success = true;
    }
  }
  unsetPremove(data);
  return success;
}

function playPredrop(data, validate) {
  var drop = data.predroppable.current,
    success = false;
  if (!drop.key) return;
  if (validate(drop)) {
    var piece = {
      role: drop.role,
      color: data.movable.color
    };
    if (baseNewPiece(data, piece, drop.key)) {
      callUserFunction(util.partial(data.movable.events.afterNewPiece, drop.role, drop.key, {
        predrop: true
      }));
      success = true;
    }
  }
  unsetPredrop(data);
  return success;
}

function cancelMove(data) {
  unsetPremove(data);
  unsetPredrop(data);
  selectSquare(data, null);
}

function stop(data) {
  data.movable.color = null;
  data.movable.dests = {};
  cancelMove(data);
}

function getKeyAtDomPos(data, pos, bounds) {
  if (!bounds && !data.bounds) return;
  bounds = bounds || data.bounds(); // use provided value, or compute it
  var file = Math.ceil(8 * ((pos[0] - bounds.left) / bounds.width));
  file = data.orientation === 'white' ? file : 9 - file;
  var rank = Math.ceil(8 - (8 * ((pos[1] - bounds.top) / bounds.height)));
  rank = data.orientation === 'white' ? rank : 9 - rank;
  if (file > 0 && file < 9 && rank > 0 && rank < 9) return util.pos2key([file, rank]);
}

// {white: {pawn: 3 queen: 1}, black: {bishop: 2}}
function getMaterialDiff(data) {
  var counts = {
    king: 0,
    queen: 0,
    rook: 0,
    bishop: 0,
    knight: 0,
    pawn: 0
  };
  for (var k in data.pieces) {
    var p = data.pieces[k];
    counts[p.role] += ((p.color === 'white') ? 1 : -1);
  }
  var diff = {
    white: {},
    black: {}
  };
  for (var role in counts) {
    var c = counts[role];
    if (c > 0) diff.white[role] = c;
    else if (c < 0) diff.black[role] = -c;
  }
  return diff;
}

var pieceScores = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0
};

function getScore(data) {
  var score = 0;
  for (var k in data.pieces) {
    score += pieceScores[data.pieces[k].role] * (data.pieces[k].color === 'white' ? 1 : -1);
  }
  return score;
}

module.exports = {
  reset: reset,
  toggleOrientation: toggleOrientation,
  setPieces: setPieces,
  setCheck: setCheck,
  selectSquare: selectSquare,
  setSelected: setSelected,
  isDraggable: isDraggable,
  canMove: canMove,
  userMove: userMove,
  dropNewPiece: dropNewPiece,
  apiMove: apiMove,
  apiNewPiece: apiNewPiece,
  playPremove: playPremove,
  playPredrop: playPredrop,
  unsetPremove: unsetPremove,
  unsetPredrop: unsetPredrop,
  cancelMove: cancelMove,
  stop: stop,
  getKeyAtDomPos: getKeyAtDomPos,
  getMaterialDiff: getMaterialDiff,
  getScore: getScore
};

},{"./anim":1,"./hold":11,"./premove":13,"./util":15}],4:[function(require,module,exports){
var merge = require('merge');
var board = require('./board');
var fen = require('./fen');

module.exports = function(data, config) {

  if (!config) return;

  // don't merge destinations. Just override.
  if (config.movable && config.movable.dests) delete data.movable.dests;

  merge.recursive(data, config);

  // if a fen was provided, replace the pieces
  if (data.fen) {
    data.pieces = fen.read(data.fen);
    data.check = config.check;
    data.drawable.shapes = [];
    delete data.fen;
  }

  if (data.check === true) board.setCheck(data);

  // forget about the last dropped piece
  data.movable.dropped = [];

  // fix move/premove dests
  if (data.selected) board.setSelected(data, data.selected);

  // no need for such short animations
  if (!data.animation.duration || data.animation.duration < 40)
    data.animation.enabled = false;

  if (!data.movable.rookCastle) {
    var rank = data.movable.color === 'white' ? 1 : 8;
    var kingStartPos = 'e' + rank;
    if (data.movable.dests) {
      var dests = data.movable.dests[kingStartPos];
      if (!dests || data.pieces[kingStartPos].role !== 'king') return;
      data.movable.dests[kingStartPos] = dests.filter(function(d) {
        return d !== 'a' + rank && d !== 'h' + rank
      });
    }
  }
};

},{"./board":3,"./fen":10,"merge":17}],5:[function(require,module,exports){
var m = require('mithril');
var util = require('./util');

function renderCoords(elems, klass, orient) {
  var el = document.createElement('coords');
  el.className = klass;
  elems.forEach(function(content) {
    var f = document.createElement('coord');
    f.textContent = content;
    el.appendChild(f);
  });
  return el;
}

module.exports = function(orientation, el) {

  util.requestAnimationFrame(function() {
    var coords = document.createDocumentFragment();
    var orientClass = orientation === 'black' ? ' black' : '';
    coords.appendChild(renderCoords(util.ranks, 'ranks' + orientClass));
    coords.appendChild(renderCoords(util.files, 'files' + orientClass));
    el.appendChild(coords);
  });

  var orientation;

  return function(o) {
    if (o === orientation) return;
    orientation = o;
    var coords = el.querySelectorAll('coords');
    for (i = 0; i < coords.length; ++i)
      coords[i].classList.toggle('black', o === 'black');
  };
}

},{"./util":15,"mithril":18}],6:[function(require,module,exports){
var board = require('./board');
var data = require('./data');
var fen = require('./fen');
var configure = require('./configure');
var anim = require('./anim');
var drag = require('./drag');

module.exports = function(cfg) {

  this.data = data(cfg);

  this.vm = {
    exploding: false
  };

  this.getFen = function() {
    return fen.write(this.data.pieces);
  }.bind(this);

  this.getOrientation = function() {
    return this.data.orientation;
  }.bind(this);

  this.set = anim(configure, this.data);

  this.toggleOrientation = function() {
    anim(board.toggleOrientation, this.data)();
    if (this.data.redrawCoords) this.data.redrawCoords(this.data.orientation);
  }.bind(this);

  this.setPieces = anim(board.setPieces, this.data);

  this.selectSquare = anim(board.selectSquare, this.data, true);

  this.apiMove = anim(board.apiMove, this.data);

  this.apiNewPiece = anim(board.apiNewPiece, this.data);

  this.playPremove = anim(board.playPremove, this.data);

  this.playPredrop = anim(board.playPredrop, this.data);

  this.cancelPremove = anim(board.unsetPremove, this.data, true);

  this.cancelPredrop = anim(board.unsetPredrop, this.data, true);

  this.setCheck = anim(board.setCheck, this.data, true);

  this.cancelMove = anim(function(data) {
    board.cancelMove(data);
    drag.cancel(data);
  }.bind(this), this.data, true);

  this.stop = anim(function(data) {
    board.stop(data);
    drag.cancel(data);
  }.bind(this), this.data, true);

  this.explode = function(keys) {
    if (!this.data.render) return;
    this.vm.exploding = {
      stage: 1,
      keys: keys
    };
    this.data.renderRAF();
    setTimeout(function() {
      this.vm.exploding.stage = 2;
      this.data.renderRAF();
      setTimeout(function() {
        this.vm.exploding = false;
        this.data.renderRAF();
      }.bind(this), 120);
    }.bind(this), 120);
  }.bind(this);

  this.setAutoShapes = function(shapes) {
    anim(function(data) {
      data.drawable.autoShapes = shapes;
    }, this.data, false)();
  }.bind(this);

  this.setShapes = function(shapes) {
    anim(function(data) {
      data.drawable.shapes = shapes;
    }, this.data, false)();
  }.bind(this);
};

},{"./anim":1,"./board":3,"./configure":4,"./data":7,"./drag":8,"./fen":10}],7:[function(require,module,exports){
var fen = require('./fen');
var configure = require('./configure');

module.exports = function(cfg) {
  var defaults = {
    pieces: fen.read(fen.initial),
    orientation: 'white', // board orientation. white | black
    turnColor: 'white', // turn to play. white | black
    check: null, // square currently in check "a2" | null
    lastMove: null, // squares part of the last move ["c3", "c4"] | null
    selected: null, // square currently selected "a1" | null
    coordinates: true, // include coords attributes
    render: null, // function that rerenders the board
    renderRAF: null, // function that rerenders the board using requestAnimationFrame
    element: null, // DOM element of the board, required for drag piece centering
    bounds: null, // function that calculates the board bounds
    autoCastle: false, // immediately complete the castle by moving the rook after king move
    viewOnly: false, // don't bind events: the user will never be able to move pieces around
    disableContextMenu: false, // because who needs a context menu on a chessboard
    resizable: true, // listens to chessground.resize on document.body to clear bounds cache
    pieceKey: false, // add a data-key attribute to piece elements
    highlight: {
      lastMove: true, // add last-move class to squares
      check: true, // add check class to squares
      dragOver: true // add drag-over class to square when dragging over it
    },
    animation: {
      enabled: true,
      duration: 200,
      /*{ // current
       *  start: timestamp,
       *  duration: ms,
       *  anims: {
       *    a2: [
       *      [-30, 50], // animation goal
       *      [-20, 37]  // animation current status
       *    ], ...
       *  },
       *  fading: [
       *    {
       *      pos: [80, 120], // position relative to the board
       *      opacity: 0.34,
       *      role: 'rook',
       *      color: 'black'
       *    }
       *  }
       *}*/
      current: {}
    },
    movable: {
      free: true, // all moves are valid - board editor
      color: 'both', // color that can move. white | black | both | null
      dests: {}, // valid moves. {"a2" ["a3" "a4"] "b1" ["a3" "c3"]} | null
      dropOff: 'revert', // when a piece is dropped outside the board. "revert" | "trash"
      dropped: [], // last dropped [orig, dest], not to be animated
      showDests: true, // whether to add the move-dest class on squares
      events: {
        after: function(orig, dest, metadata) {}, // called after the move has been played
        afterNewPiece: function(role, pos) {} // called after a new piece is dropped on the board
      },
      rookCastle: true // castle by moving the king to the rook
    },
    premovable: {
      enabled: true, // allow premoves for color that can not move
      showDests: true, // whether to add the premove-dest class on squares
      castle: true, // whether to allow king castle premoves
      dests: [], // premove destinations for the current selection
      current: null, // keys of the current saved premove ["e2" "e4"] | null
      events: {
        set: function(orig, dest) {}, // called after the premove has been set
        unset: function() {} // called after the premove has been unset
      }
    },
    predroppable: {
      enabled: false, // allow predrops for color that can not move
      current: {}, // current saved predrop {role: 'knight', key: 'e4'} | {}
      events: {
        set: function(role, key) {}, // called after the predrop has been set
        unset: function() {} // called after the predrop has been unset
      }
    },
    draggable: {
      enabled: true, // allow moves & premoves to use drag'n drop
      distance: 3, // minimum distance to initiate a drag, in pixels
      autoDistance: true, // lets chessground set distance to zero when user drags pieces
      centerPiece: true, // center the piece on cursor at drag start
      showGhost: true, // show ghost of piece being dragged
      /*{ // current
       *  orig: "a2", // orig key of dragging piece
       *  rel: [100, 170] // x, y of the piece at original position
       *  pos: [20, -12] // relative current position
       *  dec: [4, -8] // piece center decay
       *  over: "b3" // square being moused over
       *  bounds: current cached board bounds
       *  started: whether the drag has started, as per the distance setting
       *}*/
      current: {}
    },
    selectable: {
      // disable to enforce dragging over click-click move
      enabled: true
    },
    stats: {
      // was last piece dragged or clicked?
      // needs default to false for touch
      dragged: !('ontouchstart' in window)
    },
    events: {
      change: function() {}, // called after the situation changes on the board
      // called after a piece has been moved.
      // capturedPiece is null or like {color: 'white', 'role': 'queen'}
      move: function(orig, dest, capturedPiece) {},
      dropNewPiece: function(role, pos) {},
      capture: function(key, piece) {}, // DEPRECATED called when a piece has been captured
      select: function(key) {} // called when a square is selected
    },
    items: null, // items on the board { render: key -> vdom }
    drawable: {
      enabled: false, // allows SVG drawings
      eraseOnClick: true,
      onChange: function(shapes) {},
      // user shapes
      shapes: [
        // {brush: 'green', orig: 'e8'},
        // {brush: 'yellow', orig: 'c4', dest: 'f7'}
      ],
      // computer shapes
      autoShapes: [
        // {brush: 'paleBlue', orig: 'e8'},
        // {brush: 'paleRed', orig: 'c4', dest: 'f7'}
      ],
      /*{ // current
       *  orig: "a2", // orig key of drawing
       *  pos: [20, -12] // relative current position
       *  dest: "b3" // square being moused over
       *  bounds: // current cached board bounds
       *  brush: 'green' // brush name for shape
       *}*/
      current: {},
      brushes: {
        green: {
          key: 'g',
          color: '#15781B',
          opacity: 1,
          lineWidth: 10
        },
        red: {
          key: 'r',
          color: '#882020',
          opacity: 1,
          lineWidth: 10
        },
        blue: {
          key: 'b',
          color: '#003088',
          opacity: 1,
          lineWidth: 10
        },
        yellow: {
          key: 'y',
          color: '#e68f00',
          opacity: 1,
          lineWidth: 10
        },
        paleBlue: {
          key: 'pb',
          color: '#003088',
          opacity: 0.4,
          lineWidth: 15
        },
        paleGreen: {
          key: 'pg',
          color: '#15781B',
          opacity: 0.4,
          lineWidth: 15
        },
        paleRed: {
          key: 'pr',
          color: '#882020',
          opacity: 0.4,
          lineWidth: 15
        },
        paleGrey: {
          key: 'pgr',
          color: '#4a4a4a',
          opacity: 0.35,
          lineWidth: 15
        }
      },
      // drawable SVG pieces, used for crazyhouse drop
      pieces: {
        baseUrl: 'https://lichess1.org/assets/piece/cburnett/'
      }
    }
  };

  configure(defaults, cfg || {});

  return defaults;
};

},{"./configure":4,"./fen":10}],8:[function(require,module,exports){
var board = require('./board');
var util = require('./util');
var draw = require('./draw');

var originTarget;

function hashPiece(piece) {
  return piece ? piece.color + piece.role : '';
}

function computeSquareBounds(data, bounds, key) {
  var pos = util.key2pos(key);
  if (data.orientation !== 'white') {
    pos[0] = 9 - pos[0];
    pos[1] = 9 - pos[1];
  }
  return {
    left: bounds.left + bounds.width * (pos[0] - 1) / 8,
    top: bounds.top + bounds.height * (8 - pos[1]) / 8,
    width: bounds.width / 8,
    height: bounds.height / 8
  };
}

function start(data, e) {
  if (e.button !== undefined && e.button !== 0) return; // only touch or left click
  if (e.touches && e.touches.length > 1) return; // support one finger touch only
  e.stopPropagation();
  e.preventDefault();
  originTarget = e.target;
  var previouslySelected = data.selected;
  var position = util.eventPosition(e);
  var bounds = data.bounds();
  var orig = board.getKeyAtDomPos(data, position, bounds);
  var piece = data.pieces[orig];
  if (!previouslySelected && (
    data.drawable.eraseOnClick ||
    (!piece || piece.color !== data.turnColor)
  )) draw.clear(data);
  if (data.viewOnly) return;
  var hadPremove = !!data.premovable.current;
  var hadPredrop = !!data.predroppable.current.key;
  board.selectSquare(data, orig);
  var stillSelected = data.selected === orig;
  if (piece && stillSelected && board.isDraggable(data, orig)) {
    var squareBounds = computeSquareBounds(data, bounds, orig);
    data.draggable.current = {
      previouslySelected: previouslySelected,
      orig: orig,
      piece: hashPiece(piece),
      rel: position,
      epos: position,
      pos: [0, 0],
      dec: data.draggable.centerPiece ? [
        position[0] - (squareBounds.left + squareBounds.width / 2),
        position[1] - (squareBounds.top + squareBounds.height / 2)
      ] : [0, 0],
      bounds: bounds,
      started: data.draggable.autoDistance && data.stats.dragged
    };
  } else {
    if (hadPremove) board.unsetPremove(data);
    if (hadPredrop) board.unsetPredrop(data);
  }
  processDrag(data);
}

function processDrag(data) {
  util.requestAnimationFrame(function() {
    var cur = data.draggable.current;
    if (cur.orig) {
      // cancel animations while dragging
      if (data.animation.current.start && data.animation.current.anims[cur.orig])
        data.animation.current = {};
      // if moving piece is gone, cancel
      if (hashPiece(data.pieces[cur.orig]) !== cur.piece) cancel(data);
      else {
        if (!cur.started && util.distance(cur.epos, cur.rel) >= data.draggable.distance)
          cur.started = true;
        if (cur.started) {
          cur.pos = [
            cur.epos[0] - cur.rel[0],
            cur.epos[1] - cur.rel[1]
          ];
          cur.over = board.getKeyAtDomPos(data, cur.epos, cur.bounds);
        }
      }
    }
    data.render();
    if (cur.orig) processDrag(data);
  });
}

function move(data, e) {
  if (e.touches && e.touches.length > 1) return; // support one finger touch only
  if (data.draggable.current.orig)
    data.draggable.current.epos = util.eventPosition(e);
}

function end(data, e) {
  var cur = data.draggable.current;
  var orig = cur ? cur.orig : null;
  if (!orig) return;
  // comparing with the origin target is an easy way to test that the end event
  // has the same touch origin
  if (e.type === "touchend" && originTarget !== e.target && !cur.newPiece) {
    data.draggable.current = {};
    return;
  }
  board.unsetPremove(data);
  board.unsetPredrop(data);
  var eventPos = util.eventPosition(e)
  var dest = eventPos ? board.getKeyAtDomPos(data, eventPos, cur.bounds) : cur.over;
  if (cur.started) {
    if (cur.newPiece) board.dropNewPiece(data, orig, dest);
    else {
      if (orig !== dest) data.movable.dropped = [orig, dest];
      if (board.userMove(data, orig, dest)) data.stats.dragged = true;
    }
  }
  if (orig === cur.previouslySelected && (orig === dest || !dest))
    board.setSelected(data, null);
  else if (!data.selectable.enabled) board.setSelected(data, null);
  data.draggable.current = {};
}

function cancel(data) {
  if (data.draggable.current.orig) {
    data.draggable.current = {};
    board.selectSquare(data, null);
  }
}

module.exports = {
  start: start,
  move: move,
  end: end,
  cancel: cancel,
  processDrag: processDrag // must be exposed for board editors
};

},{"./board":3,"./draw":9,"./util":15}],9:[function(require,module,exports){
var board = require('./board');
var util = require('./util');

var brushes = ['green', 'red', 'blue', 'yellow'];

function hashPiece(piece) {
  return piece ? piece.color + ' ' + piece.role : '';
}

function start(data, e) {
  if (e.touches && e.touches.length > 1) return; // support one finger touch only
  e.stopPropagation();
  e.preventDefault();
  board.cancelMove(data);
  var position = util.eventPosition(e);
  var bounds = data.bounds();
  var orig = board.getKeyAtDomPos(data, position, bounds);
  data.drawable.current = {
    orig: orig,
    epos: position,
    bounds: bounds,
    brush: brushes[(e.shiftKey & util.isRightButton(e)) + (e.altKey ? 2 : 0)]
  };
  processDraw(data);
}

function processDraw(data) {
  util.requestAnimationFrame(function() {
    var cur = data.drawable.current;
    if (cur.orig) {
      var dest = board.getKeyAtDomPos(data, cur.epos, cur.bounds);
      if (cur.orig === dest) cur.dest = undefined;
      else cur.dest = dest;
    }
    data.render();
    if (cur.orig) processDraw(data);
  });
}

function move(data, e) {
  if (data.drawable.current.orig)
    data.drawable.current.epos = util.eventPosition(e);
}

function end(data, e) {
  var drawable = data.drawable;
  var orig = drawable.current.orig;
  var dest = drawable.current.dest;
  if (orig && dest) addLine(drawable, orig, dest);
  else if (orig) addCircle(drawable, orig);
  drawable.current = {};
  data.render();
}

function cancel(data) {
  if (data.drawable.current.orig) data.drawable.current = {};
}

function clear(data) {
  if (data.drawable.shapes.length) {
    data.drawable.shapes = [];
    data.render();
    onChange(data.drawable);
  }
}

function not(f) {
  return function(x) {
    return !f(x);
  };
}

function addCircle(drawable, key) {
  var brush = drawable.current.brush;
  var sameCircle = function(s) {
    return s.orig === key && !s.dest;
  };
  var similar = drawable.shapes.filter(sameCircle)[0];
  if (similar) drawable.shapes = drawable.shapes.filter(not(sameCircle));
  if (!similar || similar.brush !== brush) drawable.shapes.push({
    brush: brush,
    orig: key
  });
  onChange(drawable);
}

function addLine(drawable, orig, dest) {
  var brush = drawable.current.brush;
  var sameLine = function(s) {
    return s.orig && s.dest && (
      (s.orig === orig && s.dest === dest) ||
      (s.dest === orig && s.orig === dest)
    );
  };
  var exists = drawable.shapes.filter(sameLine).length > 0;
  if (exists) drawable.shapes = drawable.shapes.filter(not(sameLine));
  else drawable.shapes.push({
    brush: brush,
    orig: orig,
    dest: dest
  });
  onChange(drawable);
}

function onChange(drawable) {
  drawable.onChange(drawable.shapes);
}

module.exports = {
  start: start,
  move: move,
  end: end,
  cancel: cancel,
  clear: clear,
  processDraw: processDraw
};

},{"./board":3,"./util":15}],10:[function(require,module,exports){
var util = require('./util');

var initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

var roles = {
  p: "pawn",
  r: "rook",
  n: "knight",
  b: "bishop",
  q: "queen",
  k: "king"
};

var letters = {
  pawn: "p",
  rook: "r",
  knight: "n",
  bishop: "b",
  queen: "q",
  king: "k"
};

function read(fen) {
  if (fen === 'start') fen = initial;
  var pieces = {};
  fen.replace(/ .+$/, '').replace(/~/g, '').split('/').forEach(function(row, y) {
    var x = 0;
    row.split('').forEach(function(v) {
      var nb = parseInt(v);
      if (nb) x += nb;
      else {
        x++;
        pieces[util.pos2key([x, 8 - y])] = {
          role: roles[v.toLowerCase()],
          color: v === v.toLowerCase() ? 'black' : 'white'
        };
      }
    });
  });

  return pieces;
}

function write(pieces) {
  return [8, 7, 6, 5, 4, 3, 2].reduce(
    function(str, nb) {
      return str.replace(new RegExp(Array(nb + 1).join('1'), 'g'), nb);
    },
    util.invRanks.map(function(y) {
      return util.ranks.map(function(x) {
        var piece = pieces[util.pos2key([x, y])];
        if (piece) {
          var letter = letters[piece.role];
          return piece.color === 'white' ? letter.toUpperCase() : letter;
        } else return '1';
      }).join('');
    }).join('/'));
}

module.exports = {
  initial: initial,
  read: read,
  write: write
};

},{"./util":15}],11:[function(require,module,exports){
var startAt;

var start = function() {
  startAt = new Date();
};

var cancel = function() {
  startAt = null;
};

var stop = function() {
  if (!startAt) return 0;
  var time = new Date() - startAt;
  startAt = null;
  return time;
};

module.exports = {
  start: start,
  cancel: cancel,
  stop: stop
};

},{}],12:[function(require,module,exports){
var m = require('mithril');
var ctrl = require('./ctrl');
var view = require('./view');
var api = require('./api');

// for usage outside of mithril
function init(element, config) {

  var controller = new ctrl(config);

  m.render(element, view(controller));

  return api(controller);
}

module.exports = init;
module.exports.controller = ctrl;
module.exports.view = view;
module.exports.fen = require('./fen');
module.exports.util = require('./util');
module.exports.configure = require('./configure');
module.exports.anim = require('./anim');
module.exports.board = require('./board');
module.exports.drag = require('./drag');

},{"./anim":1,"./api":2,"./board":3,"./configure":4,"./ctrl":6,"./drag":8,"./fen":10,"./util":15,"./view":16,"mithril":18}],13:[function(require,module,exports){
var util = require('./util');

function diff(a, b) {
  return Math.abs(a - b);
}

function pawn(color, x1, y1, x2, y2) {
  return diff(x1, x2) < 2 && (
    color === 'white' ? (
      // allow 2 squares from 1 and 8, for horde
      y2 === y1 + 1 || (y1 <= 2 && y2 === (y1 + 2) && x1 === x2)
    ) : (
      y2 === y1 - 1 || (y1 >= 7 && y2 === (y1 - 2) && x1 === x2)
    )
  );
}

function knight(x1, y1, x2, y2) {
  var xd = diff(x1, x2);
  var yd = diff(y1, y2);
  return (xd === 1 && yd === 2) || (xd === 2 && yd === 1);
}

function bishop(x1, y1, x2, y2) {
  return diff(x1, x2) === diff(y1, y2);
}

function rook(x1, y1, x2, y2) {
  return x1 === x2 || y1 === y2;
}

function queen(x1, y1, x2, y2) {
  return bishop(x1, y1, x2, y2) || rook(x1, y1, x2, y2);
}

function king(color, rookFiles, canCastle, x1, y1, x2, y2) {
  return (
    diff(x1, x2) < 2 && diff(y1, y2) < 2
  ) || (
    canCastle && y1 === y2 && y1 === (color === 'white' ? 1 : 8) && (
      (x1 === 5 && (x2 === 3 || x2 === 7)) || util.containsX(rookFiles, x2)
    )
  );
}

function rookFilesOf(pieces, color) {
  return Object.keys(pieces).filter(function(key) {
    var piece = pieces[key];
    return piece && piece.color === color && piece.role === 'rook';
  }).map(function(key) {
    return util.key2pos(key)[0];
  });
}

function compute(pieces, key, canCastle) {
  var piece = pieces[key];
  var pos = util.key2pos(key);
  var mobility;
  switch (piece.role) {
    case 'pawn':
      mobility = pawn.bind(null, piece.color);
      break;
    case 'knight':
      mobility = knight;
      break;
    case 'bishop':
      mobility = bishop;
      break;
    case 'rook':
      mobility = rook;
      break;
    case 'queen':
      mobility = queen;
      break;
    case 'king':
      mobility = king.bind(null, piece.color, rookFilesOf(pieces, piece.color), canCastle);
      break;
  }
  return util.allPos.filter(function(pos2) {
    return (pos[0] !== pos2[0] || pos[1] !== pos2[1]) && mobility(pos[0], pos[1], pos2[0], pos2[1]);
  }).map(util.pos2key);
}

module.exports = compute;

},{"./util":15}],14:[function(require,module,exports){
var m = require('mithril');
var key2pos = require('./util').key2pos;
var isTrident = require('./util').isTrident;

function circleWidth(current, bounds) {
  return (current ? 3 : 4) / 512 * bounds.width;
}

function lineWidth(brush, current, bounds) {
  return (brush.lineWidth || 10) * (current ? 0.85 : 1) / 512 * bounds.width;
}

function opacity(brush, current) {
  return (brush.opacity || 1) * (current ? 0.9 : 1);
}

function arrowMargin(current, bounds) {
  return isTrident() ? 0 : ((current ? 10 : 20) / 512 * bounds.width);
}

function pos2px(pos, bounds) {
  var squareSize = bounds.width / 8;
  return [(pos[0] - 0.5) * squareSize, (8.5 - pos[1]) * squareSize];
}

function circle(brush, pos, current, bounds) {
  var o = pos2px(pos, bounds);
  var width = circleWidth(current, bounds);
  var radius = bounds.width / 16;
  return {
    tag: 'circle',
    attrs: {
      key: current ? 'current' : pos + brush.key,
      stroke: brush.color,
      'stroke-width': width,
      fill: 'none',
      opacity: opacity(brush, current),
      cx: o[0],
      cy: o[1],
      r: radius - width / 2
    }
  };
}

function arrow(brush, orig, dest, current, bounds) {
  var m = arrowMargin(current, bounds);
  var a = pos2px(orig, bounds);
  var b = pos2px(dest, bounds);
  var dx = b[0] - a[0],
    dy = b[1] - a[1],
    angle = Math.atan2(dy, dx);
  var xo = Math.cos(angle) * m,
    yo = Math.sin(angle) * m;
  return {
    tag: 'line',
    attrs: {
      key: current ? 'current' : orig + dest + brush.key,
      stroke: brush.color,
      'stroke-width': lineWidth(brush, current, bounds),
      'stroke-linecap': 'round',
      'marker-end': isTrident() ? null : 'url(#arrowhead-' + brush.key + ')',
      opacity: opacity(brush, current),
      x1: a[0],
      y1: a[1],
      x2: b[0] - xo,
      y2: b[1] - yo
    }
  };
}

function piece(cfg, pos, piece, bounds) {
  var o = pos2px(pos, bounds);
  var size = bounds.width / 8 * (piece.scale || 1);
  var name = piece.color === 'white' ? 'w' : 'b';
  name += (piece.role === 'knight' ? 'n' : piece.role[0]).toUpperCase();
  var href = cfg.baseUrl + name + '.svg';
  return {
    tag: 'image',
    attrs: {
      class: piece.color + ' ' + piece.role,
      x: o[0] - size / 2,
      y: o[1] - size / 2,
      width: size,
      height: size,
      href: href
    }
  };
}

function defs(brushes) {
  return {
    tag: 'defs',
    children: [
      brushes.map(function(brush) {
        return {
          key: brush.key,
          tag: 'marker',
          attrs: {
            id: 'arrowhead-' + brush.key,
            orient: 'auto',
            markerWidth: 4,
            markerHeight: 8,
            refX: 2.05,
            refY: 2.01
          },
          children: [{
            tag: 'path',
            attrs: {
              d: 'M0,0 V4 L3,2 Z',
              fill: brush.color
            }
          }]
        }
      })
    ]
  };
}

function orient(pos, color) {
  return color === 'white' ? pos : [9 - pos[0], 9 - pos[1]];
}

function renderShape(data, current, bounds) {
  return function(shape, i) {
    if (shape.piece) return piece(
      data.drawable.pieces,
      orient(key2pos(shape.orig), data.orientation),
      shape.piece,
      bounds);
    else if (shape.brush) {
      var brush = shape.brushModifiers ?
        makeCustomBrush(data.drawable.brushes[shape.brush], shape.brushModifiers, i) :
        data.drawable.brushes[shape.brush];
      var orig = orient(key2pos(shape.orig), data.orientation);
      if (shape.orig && shape.dest) return arrow(
        brush,
        orig,
        orient(key2pos(shape.dest), data.orientation),
        current, bounds);
      else if (shape.orig) return circle(
        brush,
        orig,
        current, bounds);
    }
  };
}

function makeCustomBrush(base, modifiers, i) {
  return {
    key: 'bm' + i,
    color: modifiers.color || base.color,
    opacity: modifiers.opacity || base.opacity,
    lineWidth: modifiers.lineWidth || base.lineWidth
  };
}

function computeUsedBrushes(d, drawn, current) {
  var brushes = [];
  var keys = [];
  var shapes = (current && current.dest) ? drawn.concat(current) : drawn;
  for (var i in shapes) {
    var shape = shapes[i];
    if (!shape.dest) continue;
    var brushKey = shape.brush;
    if (shape.brushModifiers)
      brushes.push(makeCustomBrush(d.brushes[brushKey], shape.brushModifiers, i));
    else {
      if (keys.indexOf(brushKey) === -1) {
        brushes.push(d.brushes[brushKey]);
        keys.push(brushKey);
      }
    }
  }
  return brushes;
}

module.exports = function(ctrl) {
  if (!ctrl.data.bounds) return;
  var d = ctrl.data.drawable;
  var allShapes = d.shapes.concat(d.autoShapes);
  if (!allShapes.length && !d.current.orig) return;
  var bounds = ctrl.data.bounds();
  if (bounds.width !== bounds.height) return;
  var usedBrushes = computeUsedBrushes(d, allShapes, d.current);
  return {
    tag: 'svg',
    attrs: {
      key: 'svg'
    },
    children: [
      defs(usedBrushes),
      allShapes.map(renderShape(ctrl.data, false, bounds)),
      renderShape(ctrl.data, true, bounds)(d.current, 9999)
    ]
  };
}

},{"./util":15,"mithril":18}],15:[function(require,module,exports){
var files = "abcdefgh".split('');
var ranks = [1, 2, 3, 4, 5, 6, 7, 8];
var invRanks = [8, 7, 6, 5, 4, 3, 2, 1];
var fileNumbers = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8
};

function pos2key(pos) {
  return files[pos[0] - 1] + pos[1];
}

function key2pos(pos) {
  return [fileNumbers[pos[0]], parseInt(pos[1])];
}

function invertKey(key) {
  return files[8 - fileNumbers[key[0]]] + (9 - parseInt(key[1]));
}

var allPos = (function() {
  var ps = [];
  invRanks.forEach(function(y) {
    ranks.forEach(function(x) {
      ps.push([x, y]);
    });
  });
  return ps;
})();
var allKeys = allPos.map(pos2key);
var invKeys = allKeys.slice(0).reverse();

function classSet(classes) {
  var arr = [];
  for (var i in classes) {
    if (classes[i]) arr.push(i);
  }
  return arr.join(' ');
}

function opposite(color) {
  return color === 'white' ? 'black' : 'white';
}

function containsX(xs, x) {
  return xs && xs.indexOf(x) !== -1;
}

function distance(pos1, pos2) {
  return Math.sqrt(Math.pow(pos1[0] - pos2[0], 2) + Math.pow(pos1[1] - pos2[1], 2));
}

// this must be cached because of the access to document.body.style
var cachedTransformProp;

function computeTransformProp() {
  return 'transform' in document.body.style ?
    'transform' : 'webkitTransform' in document.body.style ?
    'webkitTransform' : 'mozTransform' in document.body.style ?
    'mozTransform' : 'oTransform' in document.body.style ?
    'oTransform' : 'msTransform';
}

function transformProp() {
  if (!cachedTransformProp) cachedTransformProp = computeTransformProp();
  return cachedTransformProp;
}

var cachedIsTrident = null;

function isTrident() {
  if (cachedIsTrident === null)
    cachedIsTrident = window.navigator.userAgent.indexOf('Trident/') > -1;
  return cachedIsTrident;
}

function translate(pos) {
  return 'translate(' + pos[0] + 'px,' + pos[1] + 'px)';
}

function eventPosition(e) {
  if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY];
  if (e.touches && e.targetTouches[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
}

function partialApply(fn, args) {
  return fn.bind.apply(fn, [null].concat(args));
}

function partial() {
  return partialApply(arguments[0], Array.prototype.slice.call(arguments, 1));
}

function isRightButton(e) {
  return e.buttons === 2 || e.button === 2;
}

function memo(f) {
  var v, ret = function() {
    if (v === undefined) v = f();
    return v;
  };
  ret.clear = function() {
    v = undefined;
  }
  return ret;
}

module.exports = {
  files: files,
  ranks: ranks,
  invRanks: invRanks,
  allPos: allPos,
  allKeys: allKeys,
  invKeys: invKeys,
  pos2key: pos2key,
  key2pos: key2pos,
  invertKey: invertKey,
  classSet: classSet,
  opposite: opposite,
  translate: translate,
  containsX: containsX,
  distance: distance,
  eventPosition: eventPosition,
  partialApply: partialApply,
  partial: partial,
  transformProp: transformProp,
  isTrident: isTrident,
  requestAnimationFrame: (window.requestAnimationFrame || window.setTimeout).bind(window),
  isRightButton: isRightButton,
  memo: memo
};

},{}],16:[function(require,module,exports){
var drag = require('./drag');
var draw = require('./draw');
var util = require('./util');
var svg = require('./svg');
var makeCoords = require('./coords');
var m = require('mithril');

var pieceTag = 'piece';
var squareTag = 'square';

function pieceClass(p) {
  return p.role + ' ' + p.color;
}

function renderPiece(d, key, ctx) {
  var attrs = {
    key: 'p' + key,
    style: {},
    class: pieceClass(d.pieces[key])
  };
  var translate = posToTranslate(util.key2pos(key), ctx);
  var draggable = d.draggable.current;
  if (draggable.orig === key && draggable.started) {
    translate[0] += draggable.pos[0] + draggable.dec[0];
    translate[1] += draggable.pos[1] + draggable.dec[1];
    attrs.class += ' dragging';
  } else if (d.animation.current.anims) {
    var animation = d.animation.current.anims[key];
    if (animation) {
      translate[0] += animation[1][0];
      translate[1] += animation[1][1];
    }
  }
  attrs.style[ctx.transformProp] = util.translate(translate);
  if (d.pieceKey) attrs['data-key'] = key;
  return {
    tag: pieceTag,
    attrs: attrs
  };
}

function renderSquare(key, classes, ctx) {
  var attrs = {
    key: 's' + key,
    class: classes,
    style: {}
  };
  attrs.style[ctx.transformProp] = util.translate(posToTranslate(util.key2pos(key), ctx));
  return {
    tag: squareTag,
    attrs: attrs
  };
}

function posToTranslate(pos, ctx) {
  return [
    (ctx.asWhite ? pos[0] - 1 : 8 - pos[0]) * ctx.bounds.width / 8, (ctx.asWhite ? 8 - pos[1] : pos[1] - 1) * ctx.bounds.height / 8
  ];
}

function renderGhost(key, piece, ctx) {
  if (!piece) return;
  var attrs = {
    key: 'g' + key,
    style: {},
    class: pieceClass(piece) + ' ghost'
  };
  attrs.style[ctx.transformProp] = util.translate(posToTranslate(util.key2pos(key), ctx));
  return {
    tag: pieceTag,
    attrs: attrs
  };
}

function renderFading(cfg, ctx) {
  var attrs = {
    key: 'f' + cfg.piece.key,
    class: 'fading ' + pieceClass(cfg.piece),
    style: {
      opacity: cfg.opacity
    }
  };
  attrs.style[ctx.transformProp] = util.translate(posToTranslate(cfg.piece.pos, ctx));
  return {
    tag: pieceTag,
    attrs: attrs
  };
}

function addSquare(squares, key, klass) {
  if (squares[key]) squares[key].push(klass);
  else squares[key] = [klass];
}

function renderSquares(ctrl, ctx) {
  var d = ctrl.data;
  var squares = {};
  if (d.lastMove && d.highlight.lastMove) d.lastMove.forEach(function(k) {
    addSquare(squares, k, 'last-move');
  });
  if (d.check && d.highlight.check) addSquare(squares, d.check, 'check');
  if (d.selected) {
    addSquare(squares, d.selected, 'selected');
    var over = d.draggable.current.over;
    var dests = d.movable.dests[d.selected];
    if (dests) dests.forEach(function(k) {
      if (k === over) addSquare(squares, k, 'move-dest drag-over');
      else if (d.movable.showDests) addSquare(squares, k, 'move-dest' + (d.pieces[k] ? ' oc' : ''));
    });
    var pDests = d.premovable.dests;
    if (pDests) pDests.forEach(function(k) {
      if (k === over) addSquare(squares, k, 'premove-dest drag-over');
      else if (d.movable.showDests) addSquare(squares, k, 'premove-dest' + (d.pieces[k] ? ' oc' : ''));
    });
  }
  var premove = d.premovable.current;
  if (premove) premove.forEach(function(k) {
    addSquare(squares, k, 'current-premove');
  });
  else if (d.predroppable.current.key)
    addSquare(squares, d.predroppable.current.key, 'current-premove');

  if (ctrl.vm.exploding) ctrl.vm.exploding.keys.forEach(function(k) {
    addSquare(squares, k, 'exploding' + ctrl.vm.exploding.stage);
  });

  var dom = [];
  if (d.items) {
    for (var i = 0; i < 64; i++) {
      var key = util.allKeys[i];
      var square = squares[key];
      var item = d.items.render(util.key2pos(key), key);
      if (square || item) {
        var sq = renderSquare(key, square ? square.join(' ') + (item ? ' has-item' : '') : 'has-item', ctx);
        if (item) sq.children = [item];
        dom.push(sq);
      }
    }
  } else {
    for (var key in squares)
      dom.push(renderSquare(key, squares[key].join(' '), ctx));
  }
  return dom;
}

function renderContent(ctrl) {
  var d = ctrl.data;
  if (!d.bounds) return;
  var ctx = {
    asWhite: d.orientation === 'white',
    bounds: d.bounds(),
    transformProp: util.transformProp()
  };
  var children = renderSquares(ctrl, ctx);
  if (d.animation.current.fadings)
    d.animation.current.fadings.forEach(function(p) {
      children.push(renderFading(p, ctx));
    });

  // must insert pieces in the right order
  // for 3D to display correctly
  var keys = ctx.asWhite ? util.allKeys : util.invKeys;
  if (d.items)
    for (var i = 0; i < 64; i++) {
      if (d.pieces[keys[i]] && !d.items.render(util.key2pos(keys[i]), keys[i]))
        children.push(renderPiece(d, keys[i], ctx));
    } else
      for (var i = 0; i < 64; i++) {
        if (d.pieces[keys[i]]) children.push(renderPiece(d, keys[i], ctx));
      }

  if (d.draggable.showGhost) {
    var dragOrig = d.draggable.current.orig;
    if (dragOrig && !d.draggable.current.newPiece)
      children.push(renderGhost(dragOrig, d.pieces[dragOrig], ctx));
  }
  if (d.drawable.enabled) children.push(svg(ctrl));
  return children;
}

function startDragOrDraw(d) {
  return function(e) {
    if (util.isRightButton(e) && d.draggable.current.orig) {
      if (d.draggable.current.newPiece) delete d.pieces[d.draggable.current.orig];
      d.draggable.current = {}
      d.selected = null;
    } else if ((e.shiftKey || util.isRightButton(e)) && d.drawable.enabled) draw.start(d, e);
    else drag.start(d, e);
  };
}

function dragOrDraw(d, withDrag, withDraw) {
  return function(e) {
    if ((e.shiftKey || util.isRightButton(e)) && d.drawable.enabled) withDraw(d, e);
    else if (!d.viewOnly) withDrag(d, e);
  };
}

function bindEvents(ctrl, el, context) {
  var d = ctrl.data;
  var onstart = startDragOrDraw(d);
  var onmove = dragOrDraw(d, drag.move, draw.move);
  var onend = dragOrDraw(d, drag.end, draw.end);
  var startEvents = ['touchstart', 'mousedown'];
  var moveEvents = ['touchmove', 'mousemove'];
  var endEvents = ['touchend', 'mouseup'];
  startEvents.forEach(function(ev) {
    el.addEventListener(ev, onstart);
  });
  moveEvents.forEach(function(ev) {
    document.addEventListener(ev, onmove);
  });
  endEvents.forEach(function(ev) {
    document.addEventListener(ev, onend);
  });
  context.onunload = function() {
    startEvents.forEach(function(ev) {
      el.removeEventListener(ev, onstart);
    });
    moveEvents.forEach(function(ev) {
      document.removeEventListener(ev, onmove);
    });
    endEvents.forEach(function(ev) {
      document.removeEventListener(ev, onend);
    });
  };
}

function renderBoard(ctrl) {
  var d = ctrl.data;
  return {
    tag: 'div',
    attrs: {
      class: 'cg-board orientation-' + d.orientation,
      config: function(el, isUpdate, context) {
        if (isUpdate) return;
        if (!d.viewOnly || d.drawable.enabled)
          bindEvents(ctrl, el, context);
        // this function only repaints the board itself.
        // it's called when dragging or animating pieces,
        // to prevent the full application embedding chessground
        // rendering on every animation frame
        d.render = function() {
          m.render(el, renderContent(ctrl));
        };
        d.renderRAF = function() {
          util.requestAnimationFrame(d.render);
        };
        d.bounds = util.memo(el.getBoundingClientRect.bind(el));
        d.element = el;
        d.render();
      }
    },
    children: []
  };
}

module.exports = function(ctrl) {
  var d = ctrl.data;
  return {
    tag: 'div',
    attrs: {
      config: function(el, isUpdate) {
        if (isUpdate) {
          if (d.redrawCoords) d.redrawCoords(d.orientation);
          return;
        }
        if (d.coordinates) d.redrawCoords = makeCoords(d.orientation, el);
        el.addEventListener('contextmenu', function(e) {
          if (d.disableContextMenu || d.drawable.enabled) {
            e.preventDefault();
            return false;
          }
        });
        if (d.resizable)
          document.body.addEventListener('chessground.resize', function(e) {
            d.bounds.clear();
            d.render();
          }, false);
        ['onscroll', 'onresize'].forEach(function(n) {
          var prev = window[n];
          window[n] = function() {
            prev && prev();
            d.bounds.clear();
          };
        });
      },
      class: [
        'cg-board-wrap',
        d.viewOnly ? 'view-only' : 'manipulable'
      ].join(' ')
    },
    children: [renderBoard(ctrl)]
  };
};

},{"./coords":5,"./drag":8,"./draw":9,"./svg":14,"./util":15,"mithril":18}],17:[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.2.0
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	/**
	 * Merge one or more objects 
	 * @param bool? clone
	 * @param mixed,... arguments
	 * @return object
	 */

	var Public = function(clone) {

		return merge(clone === true, false, arguments);

	}, publicName = 'merge';

	/**
	 * Merge two or more objects recursively 
	 * @param bool? clone
	 * @param mixed,... arguments
	 * @return object
	 */

	Public.recursive = function(clone) {

		return merge(clone === true, true, arguments);

	};

	/**
	 * Clone the input removing any reference
	 * @param mixed input
	 * @return mixed
	 */

	Public.clone = function(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = Public.clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = Public.clone(input[index]);

		}

		return output;

	};

	/**
	 * Merge two objects recursively
	 * @param mixed input
	 * @param mixed extend
	 * @return mixed
	 */

	function merge_recursive(base, extend) {

		if (typeOf(base) !== 'object')

			return extend;

		for (var key in extend) {

			if (typeOf(base[key]) === 'object' && typeOf(extend[key]) === 'object') {

				base[key] = merge_recursive(base[key], extend[key]);

			} else {

				base[key] = extend[key];

			}

		}

		return base;

	}

	/**
	 * Merge two or more objects
	 * @param bool clone
	 * @param bool recursive
	 * @param array argv
	 * @return object
	 */

	function merge(clone, recursive, argv) {

		var result = argv[0],
			size = argv.length;

		if (clone || typeOf(result) !== 'object')

			result = {};

		for (var index=0;index<size;++index) {

			var item = argv[index],

				type = typeOf(item);

			if (type !== 'object') continue;

			for (var key in item) {

				var sitem = clone ? Public.clone(item[key]) : item[key];

				if (recursive) {

					result[key] = merge_recursive(result[key], sitem);

				} else {

					result[key] = sitem;

				}

			}

		}

		return result;

	}

	/**
	 * Get type of variable
	 * @param mixed input
	 * @return string
	 *
	 * @see http://jsperf.com/typeofvar
	 */

	function typeOf(input) {

		return ({}).toString.call(input).slice(8, -1).toLowerCase();

	}

	if (isNode) {

		module.exports = Public;

	} else {

		window[publicName] = Public;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}],18:[function(require,module,exports){
var m = (function app(window, undefined) {
	"use strict";
  	var VERSION = "v0.2.1";
	function isFunction(object) {
		return typeof object === "function";
	}
	function isObject(object) {
		return type.call(object) === "[object Object]";
	}
	function isString(object) {
		return type.call(object) === "[object String]";
	}
	var isArray = Array.isArray || function (object) {
		return type.call(object) === "[object Array]";
	};
	var type = {}.toString;
	var parser = /(?:(^|#|\.)([^#\.\[\]]+))|(\[.+?\])/g, attrParser = /\[(.+?)(?:=("|'|)(.*?)\2)?\]/;
	var voidElements = /^(AREA|BASE|BR|COL|COMMAND|EMBED|HR|IMG|INPUT|KEYGEN|LINK|META|PARAM|SOURCE|TRACK|WBR)$/;
	var noop = function () {};

	// caching commonly used variables
	var $document, $location, $requestAnimationFrame, $cancelAnimationFrame;

	// self invoking function needed because of the way mocks work
	function initialize(window) {
		$document = window.document;
		$location = window.location;
		$cancelAnimationFrame = window.cancelAnimationFrame || window.clearTimeout;
		$requestAnimationFrame = window.requestAnimationFrame || window.setTimeout;
	}

	initialize(window);

	m.version = function() {
		return VERSION;
	};

	/**
	 * @typedef {String} Tag
	 * A string that looks like -> div.classname#id[param=one][param2=two]
	 * Which describes a DOM node
	 */

	/**
	 *
	 * @param {Tag} The DOM node tag
	 * @param {Object=[]} optional key-value pairs to be mapped to DOM attrs
	 * @param {...mNode=[]} Zero or more Mithril child nodes. Can be an array, or splat (optional)
	 *
	 */
	function m(tag, pairs) {
		for (var args = [], i = 1; i < arguments.length; i++) {
			args[i - 1] = arguments[i];
		}
		if (isObject(tag)) return parameterize(tag, args);
		var hasAttrs = pairs != null && isObject(pairs) && !("tag" in pairs || "view" in pairs || "subtree" in pairs);
		var attrs = hasAttrs ? pairs : {};
		var classAttrName = "class" in attrs ? "class" : "className";
		var cell = {tag: "div", attrs: {}};
		var match, classes = [];
		if (!isString(tag)) throw new Error("selector in m(selector, attrs, children) should be a string");
		while ((match = parser.exec(tag)) != null) {
			if (match[1] === "" && match[2]) cell.tag = match[2];
			else if (match[1] === "#") cell.attrs.id = match[2];
			else if (match[1] === ".") classes.push(match[2]);
			else if (match[3][0] === "[") {
				var pair = attrParser.exec(match[3]);
				cell.attrs[pair[1]] = pair[3] || (pair[2] ? "" :true);
			}
		}

		var children = hasAttrs ? args.slice(1) : args;
		if (children.length === 1 && isArray(children[0])) {
			cell.children = children[0];
		}
		else {
			cell.children = children;
		}

		for (var attrName in attrs) {
			if (attrs.hasOwnProperty(attrName)) {
				if (attrName === classAttrName && attrs[attrName] != null && attrs[attrName] !== "") {
					classes.push(attrs[attrName]);
					cell.attrs[attrName] = ""; //create key in correct iteration order
				}
				else cell.attrs[attrName] = attrs[attrName];
			}
		}
		if (classes.length) cell.attrs[classAttrName] = classes.join(" ");

		return cell;
	}
	function forEach(list, f) {
		for (var i = 0; i < list.length && !f(list[i], i++);) {}
	}
	function forKeys(list, f) {
		forEach(list, function (attrs, i) {
			return (attrs = attrs && attrs.attrs) && attrs.key != null && f(attrs, i);
		});
	}
	// This function was causing deopts in Chrome.
	// Well no longer
	function dataToString(data) {
    if (data == null) return '';
    if (typeof data === 'object') return data;
    if (data.toString() == null) return ""; // prevent recursion error on FF
    return data;
	}
	// This function was causing deopts in Chrome.
	function injectTextNode(parentElement, first, index, data) {
		try {
			insertNode(parentElement, first, index);
			first.nodeValue = data;
		} catch (e) {} //IE erroneously throws error when appending an empty text node after a null
	}

	function flatten(list) {
		//recursively flatten array
		for (var i = 0; i < list.length; i++) {
			if (isArray(list[i])) {
				list = list.concat.apply([], list);
				//check current index again and flatten until there are no more nested arrays at that index
				i--;
			}
		}
		return list;
	}

	function insertNode(parentElement, node, index) {
		parentElement.insertBefore(node, parentElement.childNodes[index] || null);
	}

	var DELETION = 1, INSERTION = 2, MOVE = 3;

	function handleKeysDiffer(data, existing, cached, parentElement) {
		forKeys(data, function (key, i) {
			existing[key = key.key] = existing[key] ? {
				action: MOVE,
				index: i,
				from: existing[key].index,
				element: cached.nodes[existing[key].index] || $document.createElement("div")
			} : {action: INSERTION, index: i};
		});
		var actions = [];
		for (var prop in existing) actions.push(existing[prop]);
		var changes = actions.sort(sortChanges), newCached = new Array(cached.length);
		newCached.nodes = cached.nodes.slice();

		forEach(changes, function (change) {
			var index = change.index;
			if (change.action === DELETION) {
				clear(cached[index].nodes, cached[index]);
				newCached.splice(index, 1);
			}
			if (change.action === INSERTION) {
				var dummy = $document.createElement("div");
				dummy.key = data[index].attrs.key;
				insertNode(parentElement, dummy, index);
				newCached.splice(index, 0, {
					attrs: {key: data[index].attrs.key},
					nodes: [dummy]
				});
				newCached.nodes[index] = dummy;
			}

			if (change.action === MOVE) {
				var changeElement = change.element;
				var maybeChanged = parentElement.childNodes[index];
				if (maybeChanged !== changeElement && changeElement !== null) {
					parentElement.insertBefore(changeElement, maybeChanged || null);
				}
				newCached[index] = cached[change.from];
				newCached.nodes[index] = changeElement;
			}
		});

		return newCached;
	}

	function diffKeys(data, cached, existing, parentElement) {
		var keysDiffer = data.length !== cached.length;
		if (!keysDiffer) {
			forKeys(data, function (attrs, i) {
				var cachedCell = cached[i];
				return keysDiffer = cachedCell && cachedCell.attrs && cachedCell.attrs.key !== attrs.key;
			});
		}

		return keysDiffer ? handleKeysDiffer(data, existing, cached, parentElement) : cached;
	}

	function diffArray(data, cached, nodes) {
		//diff the array itself

		//update the list of DOM nodes by collecting the nodes from each item
		forEach(data, function (_, i) {
			if (cached[i] != null) nodes.push.apply(nodes, cached[i].nodes);
		})
		//remove items from the end of the array if the new array is shorter than the old one. if errors ever happen here, the issue is most likely
		//a bug in the construction of the `cached` data structure somewhere earlier in the program
		forEach(cached.nodes, function (node, i) {
			if (node.parentNode != null && nodes.indexOf(node) < 0) clear([node], [cached[i]]);
		})
		if (data.length < cached.length) cached.length = data.length;
		cached.nodes = nodes;
	}

	function buildArrayKeys(data) {
		var guid = 0;
		forKeys(data, function () {
			forEach(data, function (attrs) {
				if ((attrs = attrs && attrs.attrs) && attrs.key == null) attrs.key = "__mithril__" + guid++;
			})
			return 1;
		});
	}

	function maybeRecreateObject(data, cached, dataAttrKeys) {
		//if an element is different enough from the one in cache, recreate it
		if (data.tag !== cached.tag ||
				dataAttrKeys.sort().join() !== Object.keys(cached.attrs).sort().join() ||
				data.attrs.id !== cached.attrs.id ||
				data.attrs.key !== cached.attrs.key ||
				(m.redraw.strategy() === "all" && (!cached.configContext || cached.configContext.retain !== true)) ||
				(m.redraw.strategy() === "diff" && cached.configContext && cached.configContext.retain === false)) {
			if (cached.nodes.length) clear(cached.nodes);
			if (cached.configContext && isFunction(cached.configContext.onunload)) cached.configContext.onunload();
			if (cached.controllers) {
				forEach(cached.controllers, function (controller) {
					if (controller.unload) controller.onunload({preventDefault: noop});
				});
			}
		}
	}

	function getObjectNamespace(data, namespace) {
		return data.attrs.xmlns ? data.attrs.xmlns :
			data.tag === "svg" ? "http://www.w3.org/2000/svg" :
			data.tag === "math" ? "http://www.w3.org/1998/Math/MathML" :
			namespace;
	}

	function unloadCachedControllers(cached, views, controllers) {
		if (controllers.length) {
			cached.views = views;
			cached.controllers = controllers;
			forEach(controllers, function (controller) {
				if (controller.onunload && controller.onunload.$old) controller.onunload = controller.onunload.$old;
				if (pendingRequests && controller.onunload) {
					var onunload = controller.onunload;
					controller.onunload = noop;
					controller.onunload.$old = onunload;
				}
			});
		}
	}

	function scheduleConfigsToBeCalled(configs, data, node, isNew, cached) {
		//schedule configs to be called. They are called after `build`
		//finishes running
		if (isFunction(data.attrs.config)) {
			var context = cached.configContext = cached.configContext || {};

			//bind
			configs.push(function() {
				return data.attrs.config.call(data, node, !isNew, context, cached);
			});
		}
	}

	function buildUpdatedNode(cached, data, editable, hasKeys, namespace, views, configs, controllers) {
		var node = cached.nodes[0];
		if (hasKeys) setAttributes(node, data.tag, data.attrs, cached.attrs, namespace);
		cached.children = build(node, data.tag, undefined, undefined, data.children, cached.children, false, 0, data.attrs.contenteditable ? node : editable, namespace, configs);
		cached.nodes.intact = true;

		if (controllers.length) {
			cached.views = views;
			cached.controllers = controllers;
		}

		return node;
	}

	function handleNonexistentNodes(data, parentElement, index) {
		var nodes;
		if (data.$trusted) {
			nodes = injectHTML(parentElement, index, data);
		}
		else {
			nodes = [$document.createTextNode(data)];
			if (!parentElement.nodeName.match(voidElements)) insertNode(parentElement, nodes[0], index);
		}

		var cached = typeof data === "string" || typeof data === "number" || typeof data === "boolean" ? new data.constructor(data) : data;
		cached.nodes = nodes;
		return cached;
	}

	function reattachNodes(data, cached, parentElement, editable, index, parentTag) {
		var nodes = cached.nodes;
		if (!editable || editable !== $document.activeElement) {
			if (data.$trusted) {
				clear(nodes, cached);
				nodes = injectHTML(parentElement, index, data);
			}
			//corner case: replacing the nodeValue of a text node that is a child of a textarea/contenteditable doesn't work
			//we need to update the value property of the parent textarea or the innerHTML of the contenteditable element instead
			else if (parentTag === "textarea") {
				parentElement.value = data;
			}
			else if (editable) {
				editable.innerHTML = data;
			}
			else {
				//was a trusted string
				if (nodes[0].nodeType === 1 || nodes.length > 1) {
					clear(cached.nodes, cached);
					nodes = [$document.createTextNode(data)];
				}
				injectTextNode(parentElement, nodes[0], index, data);
			}
		}
		cached = new data.constructor(data);
		cached.nodes = nodes;
		return cached;
	}

	function handleText(cached, data, index, parentElement, shouldReattach, editable, parentTag) {
		//handle text nodes
		return cached.nodes.length === 0 ? handleNonexistentNodes(data, parentElement, index) :
			cached.valueOf() !== data.valueOf() || shouldReattach === true ?
				reattachNodes(data, cached, parentElement, editable, index, parentTag) :
			(cached.nodes.intact = true, cached);
	}

	function getSubArrayCount(item) {
		if (item.$trusted) {
			//fix offset of next element if item was a trusted string w/ more than one html element
			//the first clause in the regexp matches elements
			//the second clause (after the pipe) matches text nodes
			var match = item.match(/<[^\/]|\>\s*[^<]/g);
			if (match != null) return match.length;
		}
		else if (isArray(item)) {
			return item.length;
		}
		return 1;
	}

	function buildArray(data, cached, parentElement, index, parentTag, shouldReattach, editable, namespace, configs) {
		data = flatten(data);
		var nodes = [], intact = cached.length === data.length, subArrayCount = 0;

		//keys algorithm: sort elements without recreating them if keys are present
		//1) create a map of all existing keys, and mark all for deletion
		//2) add new keys to map and mark them for addition
		//3) if key exists in new list, change action from deletion to a move
		//4) for each key, handle its corresponding action as marked in previous steps
		var existing = {}, shouldMaintainIdentities = false;
		forKeys(cached, function (attrs, i) {
			shouldMaintainIdentities = true;
			existing[cached[i].attrs.key] = {action: DELETION, index: i};
		});

		buildArrayKeys(data);
		if (shouldMaintainIdentities) cached = diffKeys(data, cached, existing, parentElement);
		//end key algorithm

		var cacheCount = 0;
		//faster explicitly written
		for (var i = 0, len = data.length; i < len; i++) {
			//diff each item in the array
			var item = build(parentElement, parentTag, cached, index, data[i], cached[cacheCount], shouldReattach, index + subArrayCount || subArrayCount, editable, namespace, configs);

			if (item !== undefined) {
				intact = intact && item.nodes.intact;
				subArrayCount += getSubArrayCount(item);
				cached[cacheCount++] = item;
			}
		}

		if (!intact) diffArray(data, cached, nodes);
		return cached
	}

	function makeCache(data, cached, index, parentIndex, parentCache) {
		if (cached != null) {
			if (type.call(cached) === type.call(data)) return cached;

			if (parentCache && parentCache.nodes) {
				var offset = index - parentIndex, end = offset + (isArray(data) ? data : cached.nodes).length;
				clear(parentCache.nodes.slice(offset, end), parentCache.slice(offset, end));
			} else if (cached.nodes) {
				clear(cached.nodes, cached);
			}
		}

		cached = new data.constructor();
		//if constructor creates a virtual dom element, use a blank object
		//as the base cached node instead of copying the virtual el (#277)
		if (cached.tag) cached = {};
		cached.nodes = [];
		return cached;
	}

	function constructNode(data, namespace) {
		return namespace === undefined ?
			data.attrs.is ? $document.createElement(data.tag, data.attrs.is) : $document.createElement(data.tag) :
			data.attrs.is ? $document.createElementNS(namespace, data.tag, data.attrs.is) : $document.createElementNS(namespace, data.tag);
	}

	function constructAttrs(data, node, namespace, hasKeys) {
		return hasKeys ? setAttributes(node, data.tag, data.attrs, {}, namespace) : data.attrs;
	}

	function constructChildren(data, node, cached, editable, namespace, configs) {
		return data.children != null && data.children.length > 0 ?
			build(node, data.tag, undefined, undefined, data.children, cached.children, true, 0, data.attrs.contenteditable ? node : editable, namespace, configs) :
			data.children;
	}

	function reconstructCached(data, attrs, children, node, namespace, views, controllers) {
		var cached = {tag: data.tag, attrs: attrs, children: children, nodes: [node]};
		unloadCachedControllers(cached, views, controllers);
		if (cached.children && !cached.children.nodes) cached.children.nodes = [];
		//edge case: setting value on <select> doesn't work before children exist, so set it again after children have been created
		if (data.tag === "select" && "value" in data.attrs) setAttributes(node, data.tag, {value: data.attrs.value}, {}, namespace);
		return cached
	}

	function getController(views, view, cachedControllers, controller) {
		var controllerIndex = m.redraw.strategy() === "diff" && views ? views.indexOf(view) : -1;
		return controllerIndex > -1 ? cachedControllers[controllerIndex] :
			typeof controller === "function" ? new controller() : {};
	}

	function updateLists(views, controllers, view, controller) {
		if (controller.onunload != null) unloaders.push({controller: controller, handler: controller.onunload});
		views.push(view);
		controllers.push(controller);
	}

	function checkView(data, view, cached, cachedControllers, controllers, views) {
		var controller = getController(cached.views, view, cachedControllers, data.controller);
		//Faster to coerce to number and check for NaN
		var key = +(data && data.attrs && data.attrs.key);
		data = pendingRequests === 0 || forcing || cachedControllers && cachedControllers.indexOf(controller) > -1 ? data.view(controller) : {tag: "placeholder"};
		if (data.subtree === "retain") return cached;
		if (key === key) (data.attrs = data.attrs || {}).key = key;
		updateLists(views, controllers, view, controller);
		return data;
	}

	function markViews(data, cached, views, controllers) {
		var cachedControllers = cached && cached.controllers;
		while (data.view != null) data = checkView(data, data.view.$original || data.view, cached, cachedControllers, controllers, views);
		return data;
	}

	function buildObject(data, cached, editable, parentElement, index, shouldReattach, namespace, configs) {
		var views = [], controllers = [];
		data = markViews(data, cached, views, controllers);
		if (!data.tag && controllers.length) throw new Error("Component template must return a virtual element, not an array, string, etc.");
		data.attrs = data.attrs || {};
		cached.attrs = cached.attrs || {};
		var dataAttrKeys = Object.keys(data.attrs);
		var hasKeys = dataAttrKeys.length > ("key" in data.attrs ? 1 : 0);
		maybeRecreateObject(data, cached, dataAttrKeys);
		if (!isString(data.tag)) return;
		var isNew = cached.nodes.length === 0;
		namespace = getObjectNamespace(data, namespace);
		var node;
		if (isNew) {
			node = constructNode(data, namespace);
			//set attributes first, then create children
			var attrs = constructAttrs(data, node, namespace, hasKeys)
			var children = constructChildren(data, node, cached, editable, namespace, configs);
			cached = reconstructCached(data, attrs, children, node, namespace, views, controllers);
		}
		else {
			node = buildUpdatedNode(cached, data, editable, hasKeys, namespace, views, configs, controllers);
		}
		if (isNew || shouldReattach === true && node != null) insertNode(parentElement, node, index);
		//schedule configs to be called. They are called after `build`
		//finishes running
		scheduleConfigsToBeCalled(configs, data, node, isNew, cached);
		return cached
	}

	function build(parentElement, parentTag, parentCache, parentIndex, data, cached, shouldReattach, index, editable, namespace, configs) {
		//`build` is a recursive function that manages creation/diffing/removal
		//of DOM elements based on comparison between `data` and `cached`
		//the diff algorithm can be summarized as this:
		//1 - compare `data` and `cached`
		//2 - if they are different, copy `data` to `cached` and update the DOM
		//    based on what the difference is
		//3 - recursively apply this algorithm for every array and for the
		//    children of every virtual element

		//the `cached` data structure is essentially the same as the previous
		//redraw's `data` data structure, with a few additions:
		//- `cached` always has a property called `nodes`, which is a list of
		//   DOM elements that correspond to the data represented by the
		//   respective virtual element
		//- in order to support attaching `nodes` as a property of `cached`,
		//   `cached` is *always* a non-primitive object, i.e. if the data was
		//   a string, then cached is a String instance. If data was `null` or
		//   `undefined`, cached is `new String("")`
		//- `cached also has a `configContext` property, which is the state
		//   storage object exposed by config(element, isInitialized, context)
		//- when `cached` is an Object, it represents a virtual element; when
		//   it's an Array, it represents a list of elements; when it's a
		//   String, Number or Boolean, it represents a text node

		//`parentElement` is a DOM element used for W3C DOM API calls
		//`parentTag` is only used for handling a corner case for textarea
		//values
		//`parentCache` is used to remove nodes in some multi-node cases
		//`parentIndex` and `index` are used to figure out the offset of nodes.
		//They're artifacts from before arrays started being flattened and are
		//likely refactorable
		//`data` and `cached` are, respectively, the new and old nodes being
		//diffed
		//`shouldReattach` is a flag indicating whether a parent node was
		//recreated (if so, and if this node is reused, then this node must
		//reattach itself to the new parent)
		//`editable` is a flag that indicates whether an ancestor is
		//contenteditable
		//`namespace` indicates the closest HTML namespace as it cascades down
		//from an ancestor
		//`configs` is a list of config functions to run after the topmost
		//`build` call finishes running

		//there's logic that relies on the assumption that null and undefined
		//data are equivalent to empty strings
		//- this prevents lifecycle surprises from procedural helpers that mix
		//  implicit and explicit return statements (e.g.
		//  function foo() {if (cond) return m("div")}
		//- it simplifies diffing code
		data = dataToString(data);
		if (data.subtree === "retain") return cached;
		cached = makeCache(data, cached, index, parentIndex, parentCache);
		return isArray(data) ? buildArray(data, cached, parentElement, index, parentTag, shouldReattach, editable, namespace, configs) :
			data != null && isObject(data) ? buildObject(data, cached, editable, parentElement, index, shouldReattach, namespace, configs) :
			!isFunction(data) ? handleText(cached, data, index, parentElement, shouldReattach, editable, parentTag) :
			cached;
	}
	function sortChanges(a, b) { return a.action - b.action || a.index - b.index; }
	function setAttributes(node, tag, dataAttrs, cachedAttrs, namespace) {
		for (var attrName in dataAttrs) {
			var dataAttr = dataAttrs[attrName];
			var cachedAttr = cachedAttrs[attrName];
			if (!(attrName in cachedAttrs) || (cachedAttr !== dataAttr)) {
				cachedAttrs[attrName] = dataAttr;
				//`config` isn't a real attributes, so ignore it
				if (attrName === "config" || attrName === "key") continue;
				//hook event handlers to the auto-redrawing system
				else if (isFunction(dataAttr) && attrName.slice(0, 2) === "on") {
				node[attrName] = autoredraw(dataAttr, node);
				}
				//handle `style: {...}`
				else if (attrName === "style" && dataAttr != null && isObject(dataAttr)) {
				for (var rule in dataAttr) {
						if (cachedAttr == null || cachedAttr[rule] !== dataAttr[rule]) node.style[rule] = dataAttr[rule];
				}
				for (var rule in cachedAttr) {
						if (!(rule in dataAttr)) node.style[rule] = "";
				}
				}
				//handle SVG
				else if (namespace != null) {
				if (attrName === "href") node.setAttributeNS("http://www.w3.org/1999/xlink", "href", dataAttr);
				else node.setAttribute(attrName === "className" ? "class" : attrName, dataAttr);
				}
				//handle cases that are properties (but ignore cases where we should use setAttribute instead)
				//- list and form are typically used as strings, but are DOM element references in js
				//- when using CSS selectors (e.g. `m("[style='']")`), style is used as a string, but it's an object in js
				else if (attrName in node && attrName !== "list" && attrName !== "style" && attrName !== "form" && attrName !== "type" && attrName !== "width" && attrName !== "height") {
				//#348 don't set the value if not needed otherwise cursor placement breaks in Chrome
				if (tag !== "input" || node[attrName] !== dataAttr) node[attrName] = dataAttr;
				}
				else node.setAttribute(attrName, dataAttr);
			}
			//#348 dataAttr may not be a string, so use loose comparison (double equal) instead of strict (triple equal)
			else if (attrName === "value" && tag === "input" && node.value != dataAttr) {
				node.value = dataAttr;
			}
		}
		return cachedAttrs;
	}
	function clear(nodes, cached) {
		for (var i = nodes.length - 1; i > -1; i--) {
			if (nodes[i] && nodes[i].parentNode) {
				try { nodes[i].parentNode.removeChild(nodes[i]); }
				catch (e) {} //ignore if this fails due to order of events (see http://stackoverflow.com/questions/21926083/failed-to-execute-removechild-on-node)
				cached = [].concat(cached);
				if (cached[i]) unload(cached[i]);
			}
		}
		//release memory if nodes is an array. This check should fail if nodes is a NodeList (see loop above)
		if (nodes.length) nodes.length = 0;
	}
	function unload(cached) {
		if (cached.configContext && isFunction(cached.configContext.onunload)) {
			cached.configContext.onunload();
			cached.configContext.onunload = null;
		}
		if (cached.controllers) {
			forEach(cached.controllers, function (controller) {
				if (isFunction(controller.onunload)) controller.onunload({preventDefault: noop});
			});
		}
		if (cached.children) {
			if (isArray(cached.children)) forEach(cached.children, unload);
			else if (cached.children.tag) unload(cached.children);
		}
	}

	var insertAdjacentBeforeEnd = (function () {
		var rangeStrategy = function (parentElement, data) {
			parentElement.appendChild($document.createRange().createContextualFragment(data));
		};
		var insertAdjacentStrategy = function (parentElement, data) {
			parentElement.insertAdjacentHTML("beforeend", data);
		};

		try {
			$document.createRange().createContextualFragment('x');
			return rangeStrategy;
		} catch (e) {
			return insertAdjacentStrategy;
		}
	})();

	function injectHTML(parentElement, index, data) {
		var nextSibling = parentElement.childNodes[index];
		if (nextSibling) {
			var isElement = nextSibling.nodeType !== 1;
			var placeholder = $document.createElement("span");
			if (isElement) {
				parentElement.insertBefore(placeholder, nextSibling || null);
				placeholder.insertAdjacentHTML("beforebegin", data);
				parentElement.removeChild(placeholder);
			}
			else nextSibling.insertAdjacentHTML("beforebegin", data);
		}
		else insertAdjacentBeforeEnd(parentElement, data);

		var nodes = [];
		while (parentElement.childNodes[index] !== nextSibling) {
			nodes.push(parentElement.childNodes[index]);
			index++;
		}
		return nodes;
	}
	function autoredraw(callback, object) {
		return function(e) {
			e = e || event;
			m.redraw.strategy("diff");
			m.startComputation();
			try { return callback.call(object, e); }
			finally {
				endFirstComputation();
			}
		};
	}

	var html;
	var documentNode = {
		appendChild: function(node) {
			if (html === undefined) html = $document.createElement("html");
			if ($document.documentElement && $document.documentElement !== node) {
				$document.replaceChild(node, $document.documentElement);
			}
			else $document.appendChild(node);
			this.childNodes = $document.childNodes;
		},
		insertBefore: function(node) {
			this.appendChild(node);
		},
		childNodes: []
	};
	var nodeCache = [], cellCache = {};
	m.render = function(root, cell, forceRecreation) {
		var configs = [];
		if (!root) throw new Error("Ensure the DOM element being passed to m.route/m.mount/m.render is not undefined.");
		var id = getCellCacheKey(root);
		var isDocumentRoot = root === $document;
		var node = isDocumentRoot || root === $document.documentElement ? documentNode : root;
		if (isDocumentRoot && cell.tag !== "html") cell = {tag: "html", attrs: {}, children: cell};
		if (cellCache[id] === undefined) clear(node.childNodes);
		if (forceRecreation === true) reset(root);
		cellCache[id] = build(node, null, undefined, undefined, cell, cellCache[id], false, 0, null, undefined, configs);
		forEach(configs, function (config) { config(); });
	};
	function getCellCacheKey(element) {
		var index = nodeCache.indexOf(element);
		return index < 0 ? nodeCache.push(element) - 1 : index;
	}

	m.trust = function(value) {
		value = new String(value);
		value.$trusted = true;
		return value;
	};

	function gettersetter(store) {
		var prop = function() {
			if (arguments.length) store = arguments[0];
			return store;
		};

		prop.toJSON = function() {
			return store;
		};

		return prop;
	}

	m.prop = function (store) {
		//note: using non-strict equality check here because we're checking if store is null OR undefined
		if ((store != null && isObject(store) || isFunction(store)) && isFunction(store.then)) {
			return propify(store);
		}

		return gettersetter(store);
	};

	var roots = [], components = [], controllers = [], lastRedrawId = null, lastRedrawCallTime = 0, computePreRedrawHook = null, computePostRedrawHook = null, topComponent, unloaders = [];
	var FRAME_BUDGET = 16; //60 frames per second = 1 call per 16 ms
	function parameterize(component, args) {
		var controller = function() {
			return (component.controller || noop).apply(this, args) || this;
		};
		if (component.controller) controller.prototype = component.controller.prototype;
		var view = function(ctrl) {
			var currentArgs = arguments.length > 1 ? args.concat([].slice.call(arguments, 1)) : args;
			return component.view.apply(component, currentArgs ? [ctrl].concat(currentArgs) : [ctrl]);
		};
		view.$original = component.view;
		var output = {controller: controller, view: view};
		if (args[0] && args[0].key != null) output.attrs = {key: args[0].key};
		return output;
	}
	m.component = function(component) {
		for (var args = [], i = 1; i < arguments.length; i++) args.push(arguments[i]);
		return parameterize(component, args);
	};
	m.mount = m.module = function(root, component) {
		if (!root) throw new Error("Please ensure the DOM element exists before rendering a template into it.");
		var index = roots.indexOf(root);
		if (index < 0) index = roots.length;

		var isPrevented = false;
		var event = {preventDefault: function() {
			isPrevented = true;
			computePreRedrawHook = computePostRedrawHook = null;
		}};

		forEach(unloaders, function (unloader) {
			unloader.handler.call(unloader.controller, event);
			unloader.controller.onunload = null;
		});

		if (isPrevented) {
			forEach(unloaders, function (unloader) {
				unloader.controller.onunload = unloader.handler;
			});
		}
		else unloaders = [];

		if (controllers[index] && isFunction(controllers[index].onunload)) {
			controllers[index].onunload(event);
		}

		var isNullComponent = component === null;

		if (!isPrevented) {
			m.redraw.strategy("all");
			m.startComputation();
			roots[index] = root;
			var currentComponent = component ? (topComponent = component) : (topComponent = component = {controller: noop});
			var controller = new (component.controller || noop)();
			//controllers may call m.mount recursively (via m.route redirects, for example)
			//this conditional ensures only the last recursive m.mount call is applied
			if (currentComponent === topComponent) {
				controllers[index] = controller;
				components[index] = component;
			}
			endFirstComputation();
			if (isNullComponent) {
				removeRootElement(root, index);
			}
			return controllers[index];
		}
		if (isNullComponent) {
			removeRootElement(root, index);
		}
	};

	function removeRootElement(root, index) {
		roots.splice(index, 1);
		controllers.splice(index, 1);
		components.splice(index, 1);
		reset(root);
		nodeCache.splice(getCellCacheKey(root), 1);
	}

	var redrawing = false, forcing = false;
	m.redraw = function(force) {
		if (redrawing) return;
		redrawing = true;
		if (force) forcing = true;
		try {
			//lastRedrawId is a positive number if a second redraw is requested before the next animation frame
			//lastRedrawID is null if it's the first redraw and not an event handler
			if (lastRedrawId && !force) {
				//when setTimeout: only reschedule redraw if time between now and previous redraw is bigger than a frame, otherwise keep currently scheduled timeout
				//when rAF: always reschedule redraw
				if ($requestAnimationFrame === window.requestAnimationFrame || new Date - lastRedrawCallTime > FRAME_BUDGET) {
					if (lastRedrawId > 0) $cancelAnimationFrame(lastRedrawId);
					lastRedrawId = $requestAnimationFrame(redraw, FRAME_BUDGET);
				}
			}
			else {
				redraw();
				lastRedrawId = $requestAnimationFrame(function() { lastRedrawId = null; }, FRAME_BUDGET);
			}
		}
		finally {
			redrawing = forcing = false;
		}
	};
	m.redraw.strategy = m.prop();
	function redraw() {
		if (computePreRedrawHook) {
			computePreRedrawHook();
			computePreRedrawHook = null;
		}
		forEach(roots, function (root, i) {
			var component = components[i];
			if (controllers[i]) {
				var args = [controllers[i]];
				m.render(root, component.view ? component.view(controllers[i], args) : "");
			}
		});
		//after rendering within a routed context, we need to scroll back to the top, and fetch the document title for history.pushState
		if (computePostRedrawHook) {
			computePostRedrawHook();
			computePostRedrawHook = null;
		}
		lastRedrawId = null;
		lastRedrawCallTime = new Date;
		m.redraw.strategy("diff");
	}

	var pendingRequests = 0;
	m.startComputation = function() { pendingRequests++; };
	m.endComputation = function() {
		if (pendingRequests > 1) pendingRequests--;
		else {
			pendingRequests = 0;
			m.redraw();
		}
	}

	function endFirstComputation() {
		if (m.redraw.strategy() === "none") {
			pendingRequests--;
			m.redraw.strategy("diff");
		}
		else m.endComputation();
	}

	m.withAttr = function(prop, withAttrCallback, callbackThis) {
		return function(e) {
			e = e || event;
			var currentTarget = e.currentTarget || this;
			var _this = callbackThis || this;
			withAttrCallback.call(_this, prop in currentTarget ? currentTarget[prop] : currentTarget.getAttribute(prop));
		};
	};

	//routing
	var modes = {pathname: "", hash: "#", search: "?"};
	var redirect = noop, routeParams, currentRoute, isDefaultRoute = false;
	m.route = function(root, arg1, arg2, vdom) {
		//m.route()
		if (arguments.length === 0) return currentRoute;
		//m.route(el, defaultRoute, routes)
		else if (arguments.length === 3 && isString(arg1)) {
			redirect = function(source) {
				var path = currentRoute = normalizeRoute(source);
				if (!routeByValue(root, arg2, path)) {
					if (isDefaultRoute) throw new Error("Ensure the default route matches one of the routes defined in m.route");
					isDefaultRoute = true;
					m.route(arg1, true);
					isDefaultRoute = false;
				}
			};
			var listener = m.route.mode === "hash" ? "onhashchange" : "onpopstate";
			window[listener] = function() {
				var path = $location[m.route.mode];
				if (m.route.mode === "pathname") path += $location.search;
				if (currentRoute !== normalizeRoute(path)) redirect(path);
			};

			computePreRedrawHook = setScroll;
			window[listener]();
		}
		//config: m.route
		else if (root.addEventListener || root.attachEvent) {
			root.href = (m.route.mode !== 'pathname' ? $location.pathname : '') + modes[m.route.mode] + vdom.attrs.href;
			if (root.addEventListener) {
				root.removeEventListener("click", routeUnobtrusive);
				root.addEventListener("click", routeUnobtrusive);
			}
			else {
				root.detachEvent("onclick", routeUnobtrusive);
				root.attachEvent("onclick", routeUnobtrusive);
			}
		}
		//m.route(route, params, shouldReplaceHistoryEntry)
		else if (isString(root)) {
			var oldRoute = currentRoute;
			currentRoute = root;
			var args = arg1 || {};
			var queryIndex = currentRoute.indexOf("?");
			var params = queryIndex > -1 ? parseQueryString(currentRoute.slice(queryIndex + 1)) : {};
			for (var i in args) params[i] = args[i];
			var querystring = buildQueryString(params);
			var currentPath = queryIndex > -1 ? currentRoute.slice(0, queryIndex) : currentRoute;
			if (querystring) currentRoute = currentPath + (currentPath.indexOf("?") === -1 ? "?" : "&") + querystring;

			var shouldReplaceHistoryEntry = (arguments.length === 3 ? arg2 : arg1) === true || oldRoute === root;

			if (window.history.pushState) {
				computePreRedrawHook = setScroll;
				computePostRedrawHook = function() {
					window.history[shouldReplaceHistoryEntry ? "replaceState" : "pushState"](null, $document.title, modes[m.route.mode] + currentRoute);
				};
				redirect(modes[m.route.mode] + currentRoute);
			}
			else {
				$location[m.route.mode] = currentRoute;
				redirect(modes[m.route.mode] + currentRoute);
			}
		}
	};
	m.route.param = function(key) {
		if (!routeParams) throw new Error("You must call m.route(element, defaultRoute, routes) before calling m.route.param()");
		if( !key ){
			return routeParams;
		}
		return routeParams[key];
	};
	m.route.mode = "search";
	function normalizeRoute(route) {
		return route.slice(modes[m.route.mode].length);
	}
	function routeByValue(root, router, path) {
		routeParams = {};

		var queryStart = path.indexOf("?");
		if (queryStart !== -1) {
			routeParams = parseQueryString(path.substr(queryStart + 1, path.length));
			path = path.substr(0, queryStart);
		}

		// Get all routes and check if there's
		// an exact match for the current path
		var keys = Object.keys(router);
		var index = keys.indexOf(path);
		if(index !== -1){
			m.mount(root, router[keys [index]]);
			return true;
		}

		for (var route in router) {
			if (route === path) {
				m.mount(root, router[route]);
				return true;
			}

			var matcher = new RegExp("^" + route.replace(/:[^\/]+?\.{3}/g, "(.*?)").replace(/:[^\/]+/g, "([^\\/]+)") + "\/?$");

			if (matcher.test(path)) {
				path.replace(matcher, function() {
					var keys = route.match(/:[^\/]+/g) || [];
					var values = [].slice.call(arguments, 1, -2);
					forEach(keys, function (key, i) {
						routeParams[key.replace(/:|\./g, "")] = decodeURIComponent(values[i]);
					})
					m.mount(root, router[route]);
				});
				return true;
			}
		}
	}
	function routeUnobtrusive(e) {
		e = e || event;

		if (e.ctrlKey || e.metaKey || e.which === 2) return;

		if (e.preventDefault) e.preventDefault();
		else e.returnValue = false;

		var currentTarget = e.currentTarget || e.srcElement;
		var args = m.route.mode === "pathname" && currentTarget.search ? parseQueryString(currentTarget.search.slice(1)) : {};
		while (currentTarget && currentTarget.nodeName.toUpperCase() !== "A") currentTarget = currentTarget.parentNode;
		m.route(currentTarget[m.route.mode].slice(modes[m.route.mode].length), args);
	}
	function setScroll() {
		if (m.route.mode !== "hash" && $location.hash) $location.hash = $location.hash;
		else window.scrollTo(0, 0);
	}
	function buildQueryString(object, prefix) {
		var duplicates = {};
		var str = [];
		for (var prop in object) {
			var key = prefix ? prefix + "[" + prop + "]" : prop;
			var value = object[prop];

			if (value === null) {
				str.push(encodeURIComponent(key));
			} else if (isObject(value)) {
				str.push(buildQueryString(value, key));
			} else if (isArray(value)) {
				var keys = [];
				duplicates[key] = duplicates[key] || {};
				forEach(value, function (item) {
					if (!duplicates[key][item]) {
						duplicates[key][item] = true;
						keys.push(encodeURIComponent(key) + "=" + encodeURIComponent(item));
					}
				});
				str.push(keys.join("&"));
			} else if (value !== undefined) {
				str.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
			}
		}
		return str.join("&");
	}
	function parseQueryString(str) {
		if (str === "" || str == null) return {};
		if (str.charAt(0) === "?") str = str.slice(1);

		var pairs = str.split("&"), params = {};
		forEach(pairs, function (string) {
			var pair = string.split("=");
			var key = decodeURIComponent(pair[0]);
			var value = pair.length === 2 ? decodeURIComponent(pair[1]) : null;
			if (params[key] != null) {
				if (!isArray(params[key])) params[key] = [params[key]];
				params[key].push(value);
			}
			else params[key] = value;
		});

		return params;
	}
	m.route.buildQueryString = buildQueryString;
	m.route.parseQueryString = parseQueryString;

	function reset(root) {
		var cacheKey = getCellCacheKey(root);
		clear(root.childNodes, cellCache[cacheKey]);
		cellCache[cacheKey] = undefined;
	}

	m.deferred = function () {
		var deferred = new Deferred();
		deferred.promise = propify(deferred.promise);
		return deferred;
	};
	function propify(promise, initialValue) {
		var prop = m.prop(initialValue);
		promise.then(prop);
		prop.then = function(resolve, reject) {
			return propify(promise.then(resolve, reject), initialValue);
		};
		prop["catch"] = prop.then.bind(null, null);
		prop["finally"] = function(callback) {
			var _callback = function() {return m.deferred().resolve(callback()).promise;};
			return prop.then(function(value) {
				return propify(_callback().then(function() {return value;}), initialValue);
			}, function(reason) {
				return propify(_callback().then(function() {throw new Error(reason);}), initialValue);
			});
		};
		return prop;
	}
	//Promiz.mithril.js | Zolmeister | MIT
	//a modified version of Promiz.js, which does not conform to Promises/A+ for two reasons:
	//1) `then` callbacks are called synchronously (because setTimeout is too slow, and the setImmediate polyfill is too big
	//2) throwing subclasses of Error cause the error to be bubbled up instead of triggering rejection (because the spec does not account for the important use case of default browser error handling, i.e. message w/ line number)
	function Deferred(successCallback, failureCallback) {
		var RESOLVING = 1, REJECTING = 2, RESOLVED = 3, REJECTED = 4;
		var self = this, state = 0, promiseValue = 0, next = [];

		self.promise = {};

		self.resolve = function(value) {
			if (!state) {
				promiseValue = value;
				state = RESOLVING;

				fire();
			}
			return this;
		};

		self.reject = function(value) {
			if (!state) {
				promiseValue = value;
				state = REJECTING;

				fire();
			}
			return this;
		};

		self.promise.then = function(successCallback, failureCallback) {
			var deferred = new Deferred(successCallback, failureCallback)
			if (state === RESOLVED) {
				deferred.resolve(promiseValue);
			}
			else if (state === REJECTED) {
				deferred.reject(promiseValue);
			}
			else {
				next.push(deferred);
			}
			return deferred.promise
		};

		function finish(type) {
			state = type || REJECTED;
			next.map(function(deferred) {
				state === RESOLVED ? deferred.resolve(promiseValue) : deferred.reject(promiseValue);
			});
		}

		function thennable(then, successCallback, failureCallback, notThennableCallback) {
			if (((promiseValue != null && isObject(promiseValue)) || isFunction(promiseValue)) && isFunction(then)) {
				try {
					// count protects against abuse calls from spec checker
					var count = 0;
					then.call(promiseValue, function(value) {
						if (count++) return;
						promiseValue = value;
						successCallback();
					}, function (value) {
						if (count++) return;
						promiseValue = value;
						failureCallback();
					});
				}
				catch (e) {
					m.deferred.onerror(e);
					promiseValue = e;
					failureCallback();
				}
			} else {
				notThennableCallback();
			}
		}

		function fire() {
			// check if it's a thenable
			var then;
			try {
				then = promiseValue && promiseValue.then;
			}
			catch (e) {
				m.deferred.onerror(e);
				promiseValue = e;
				state = REJECTING;
				return fire();
			}

			thennable(then, function() {
				state = RESOLVING;
				fire();
			}, function() {
				state = REJECTING;
				fire();
			}, function() {
				try {
					if (state === RESOLVING && isFunction(successCallback)) {
						promiseValue = successCallback(promiseValue);
					}
					else if (state === REJECTING && isFunction(failureCallback)) {
						promiseValue = failureCallback(promiseValue);
						state = RESOLVING;
					}
				}
				catch (e) {
					m.deferred.onerror(e);
					promiseValue = e;
					return finish();
				}

				if (promiseValue === self) {
					promiseValue = TypeError();
					finish();
				} else {
					thennable(then, function () {
						finish(RESOLVED);
					}, finish, function () {
						finish(state === RESOLVING && RESOLVED);
					});
				}
			});
		}
	}
	m.deferred.onerror = function(e) {
		if (type.call(e) === "[object Error]" && !e.constructor.toString().match(/ Error/)) {
			pendingRequests = 0;
			throw e;
		}
	};

	m.sync = function(args) {
		var method = "resolve";

		function synchronizer(pos, resolved) {
			return function(value) {
				results[pos] = value;
				if (!resolved) method = "reject";
				if (--outstanding === 0) {
					deferred.promise(results);
					deferred[method](results);
				}
				return value;
			};
		}

		var deferred = m.deferred();
		var outstanding = args.length;
		var results = new Array(outstanding);
		if (args.length > 0) {
			forEach(args, function (arg, i) {
				arg.then(synchronizer(i, true), synchronizer(i, false));
			});
		}
		else deferred.resolve([]);

		return deferred.promise;
	};
	function identity(value) { return value; }

	function ajax(options) {
		if (options.dataType && options.dataType.toLowerCase() === "jsonp") {
			var callbackKey = "mithril_callback_" + new Date().getTime() + "_" + (Math.round(Math.random() * 1e16)).toString(36)
			var script = $document.createElement("script");

			window[callbackKey] = function(resp) {
				script.parentNode.removeChild(script);
				options.onload({
					type: "load",
					target: {
						responseText: resp
					}
				});
				window[callbackKey] = undefined;
			};

			script.onerror = function() {
				script.parentNode.removeChild(script);

				options.onerror({
					type: "error",
					target: {
						status: 500,
						responseText: JSON.stringify({
							error: "Error making jsonp request"
						})
					}
				});
				window[callbackKey] = undefined;

				return false;
			}

			script.onload = function() {
				return false;
			};

			script.src = options.url
				+ (options.url.indexOf("?") > 0 ? "&" : "?")
				+ (options.callbackKey ? options.callbackKey : "callback")
				+ "=" + callbackKey
				+ "&" + buildQueryString(options.data || {});
			$document.body.appendChild(script);
		}
		else {
			var xhr = new window.XMLHttpRequest();
			xhr.open(options.method, options.url, true, options.user, options.password);
			xhr.onreadystatechange = function() {
				if (xhr.readyState === 4) {
					if (xhr.status >= 200 && xhr.status < 300) options.onload({type: "load", target: xhr});
					else options.onerror({type: "error", target: xhr});
				}
			};
			if (options.serialize === JSON.stringify && options.data && options.method !== "GET") {
				xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
			}
			if (options.deserialize === JSON.parse) {
				xhr.setRequestHeader("Accept", "application/json, text/*");
			}
			if (isFunction(options.config)) {
				var maybeXhr = options.config(xhr, options);
				if (maybeXhr != null) xhr = maybeXhr;
			}

			var data = options.method === "GET" || !options.data ? "" : options.data;
			if (data && (!isString(data) && data.constructor !== window.FormData)) {
				throw new Error("Request data should be either be a string or FormData. Check the `serialize` option in `m.request`");
			}
			xhr.send(data);
			return xhr;
		}
	}

	function bindData(xhrOptions, data, serialize) {
		if (xhrOptions.method === "GET" && xhrOptions.dataType !== "jsonp") {
			var prefix = xhrOptions.url.indexOf("?") < 0 ? "?" : "&";
			var querystring = buildQueryString(data);
			xhrOptions.url = xhrOptions.url + (querystring ? prefix + querystring : "");
		}
		else xhrOptions.data = serialize(data);
		return xhrOptions;
	}

	function parameterizeUrl(url, data) {
		var tokens = url.match(/:[a-z]\w+/gi);
		if (tokens && data) {
			forEach(tokens, function (token) {
				var key = token.slice(1);
				url = url.replace(token, data[key]);
				delete data[key];
			});
		}
		return url;
	}

	m.request = function(xhrOptions) {
		if (xhrOptions.background !== true) m.startComputation();
		var deferred = new Deferred();
		var isJSONP = xhrOptions.dataType && xhrOptions.dataType.toLowerCase() === "jsonp"
		var serialize = xhrOptions.serialize = isJSONP ? identity : xhrOptions.serialize || JSON.stringify;
		var deserialize = xhrOptions.deserialize = isJSONP ? identity : xhrOptions.deserialize || JSON.parse;
		var extract = isJSONP ? function(jsonp) { return jsonp.responseText } : xhrOptions.extract || function(xhr) {
			if (xhr.responseText.length === 0 && deserialize === JSON.parse) {
				return null
			} else {
				return xhr.responseText
			}
		};
		xhrOptions.method = (xhrOptions.method || "GET").toUpperCase();
		xhrOptions.url = parameterizeUrl(xhrOptions.url, xhrOptions.data);
		xhrOptions = bindData(xhrOptions, xhrOptions.data, serialize);
		xhrOptions.onload = xhrOptions.onerror = function(e) {
			try {
				e = e || event;
				var unwrap = (e.type === "load" ? xhrOptions.unwrapSuccess : xhrOptions.unwrapError) || identity;
				var response = unwrap(deserialize(extract(e.target, xhrOptions)), e.target);
				if (e.type === "load") {
					if (isArray(response) && xhrOptions.type) {
						forEach(response, function (res, i) {
							response[i] = new xhrOptions.type(res);
						});
					} else if (xhrOptions.type) {
						response = new xhrOptions.type(response);
					}
				}

				deferred[e.type === "load" ? "resolve" : "reject"](response);
			} catch (e) {
				m.deferred.onerror(e);
				deferred.reject(e);
			}

			if (xhrOptions.background !== true) m.endComputation()
		}

		ajax(xhrOptions);
		deferred.promise = propify(deferred.promise, xhrOptions.initialValue);
		return deferred.promise;
	};

	//testing API
	m.deps = function(mock) {
		initialize(window = mock || window);
		return window;
	};
	//for internal testing only, do not use `m.deps.factory`
	m.deps.factory = app;

	return m;
})(typeof window !== "undefined" ? window : {});

if (typeof module === "object" && module != null && module.exports) module.exports = m;
else if (typeof define === "function" && define.amd) define(function() { return m });

},{}],19:[function(require,module,exports){
var m = require('mithril');
var groundBuild = require('./ground');
var generate = require('../../generate/src/generate');
var diagram = require('../../generate/src/diagram');
var fendata = require('../../generate/src/fendata');
var queryparam = require('./util/queryparam');

module.exports = function(opts, i18n) {

  var fen = m.prop(opts.fen);
  var features = m.prop(generate.extractFeatures(fen()));
  var ground;

  function showGround() {
    if (!ground) ground = groundBuild(fen(), onSquareSelect);
  }

  function onSquareSelect(target) {
    onFilterSelect(null, null, target);
    m.redraw();
  }

  function onFilterSelect(side, description, target) {
    diagram.clearDiagrams(features());
    ground.setShapes([]);
    ground.set({
      fen: fen(),
    });
    ground.setShapes(diagram.diagramForTarget(side, description, target, features()));
    queryparam.updateUrlWithState(fen(), side, description, target);
  }

  function showAll() {
    ground.setShapes(diagram.allDiagrams(features()));
    queryparam.updateUrlWithState(fen(), null, null, "all");
  }

  function updateFen(value) {
    fen(value);
    ground.set({
      fen: fen(),
    });
    ground.setShapes([]);
    features(generate.extractFeatures(fen()));
    queryparam.updateUrlWithState(fen(), null, null, null);
  }

  function nextFen(dest) {
    updateFen(fendata[Math.floor(Math.random() * fendata.length)]);
  }

  showGround();
  m.redraw();
  onFilterSelect(opts.side, opts.description, opts.target);
  if (opts.target === 'all') {
    showAll();    
  }

  return {
    fen: fen,
    ground: ground,
    features: features,
    updateFen: updateFen,
    onFilterSelect: onFilterSelect,
    onSquareSelect: onSquareSelect,
    nextFen: nextFen,
    showAll: showAll
  };
};

},{"../../generate/src/diagram":31,"../../generate/src/fendata":32,"../../generate/src/generate":40,"./ground":20,"./util/queryparam":22,"mithril":18}],20:[function(require,module,exports){
var chessground = require('chessground');

module.exports = function(fen, onSelect) {
  return new chessground.controller({
    fen: fen,
    viewOnly: false,
    turnColor: 'white',
    animation: {
      duration: 200
    },
    highlight: {
      lastMove: false
    },
    movable: {
      free: false,
      color: 'white',
      premove: true,
      dests: [],
      showDests: false,
      events: {
        after: function() {}
      }
    },
    drawable: {
      enabled: true
    },
    events: {
      move: function(orig, dest, capturedPiece) {
        onSelect(dest);
      },
      select: function(key) {
        onSelect(key);
      }
    }
  });
};

},{"chessground":12}],21:[function(require,module,exports){
var m = require('mithril');
var ctrl = require('./ctrl');
var view = require('./view/main');
var queryparam = require('./util/queryparam');

function main(opts) {
    var controller = new ctrl(opts);
    m.mount(opts.element, {
        controller: function() {
            return controller;
        },
        view: view
    });
}

var fen = queryparam.getParameterByName('fen');
var side = queryparam.getParameterByName('side');
var description = queryparam.getParameterByName('description');
var target = queryparam.getParameterByName('target');

if (!side && !description && !target) {
    target = 'none';
}
main({
    element: document.getElementById("wrapper"),
    fen: fen ? fen : "b3k2r/1p3pp1/5p2/5n2/8/5N2/6PP/5K1R w - - 0 1",
    side: side,
    description: description,
    target: target
});

},{"./ctrl":19,"./util/queryparam":22,"./view/main":27,"mithril":18}],22:[function(require,module,exports){
/* global history */

'use strict';

module.exports = {

    getParameterByName: function(name, url) {
        if (!url) {
            url = window.location.href;
        }
        name = name.replace(/[\[\]]/g, "\\$&");
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    },

    updateUrlWithState: function(fen, side, description, target) {
        if (history.pushState) {
            var newurl = window.location.protocol + "//" +
                window.location.host +
                window.location.pathname +
                '?fen=' + encodeURIComponent(fen) +
                (side ? "&side=" + encodeURIComponent(side) : "") +
                (description ? "&description=" + encodeURIComponent(description) : "") +
                (target ? "&target=" + encodeURIComponent(target) : "");
            window.history.pushState({
                path: newurl
            }, '', newurl);
        }
    }
};

},{}],23:[function(require,module,exports){
module.exports = function(event) {
    if (event) {
        if (event.stopPropagation) {
            event.stopPropagation();
        }
    }
    if (!e) var e = window.event;
    e.cancelBubble = true;
    if (e.stopPropagation) e.stopPropagation();
    return false;
};

},{}],24:[function(require,module,exports){
var m = require('mithril');
var stopevent = require('../util/stopevent');

function makeStars(controller, feature) {
    return feature.targets.map(t => m('span.star', {
        title: t.target,
        onclick: function(event) {
            controller.onFilterSelect(feature.side, feature.description, t.target);
            return stopevent(event);
        }
    }, t.selected ? m('span.star.selected', '★') : m('span.star', '☆')));
}

module.exports = function(controller, feature) {
    if (feature.targets.length === 0) {
        return [];
    }
    return m('li.feature.button', {
        onclick: function(event) {
            controller.onFilterSelect(feature.side, feature.description);
            return stopevent(event);
        }
    }, [
        m('div.name', feature.description),
        m('div.stars', makeStars(controller, feature))
    ]);
};

},{"../util/stopevent":23,"mithril":18}],25:[function(require,module,exports){
var m = require('mithril');
var feature = require('./feature');
var stopevent = require('../util/stopevent');

module.exports = function(controller) {
  return m('div.featuresall', [
    m('div.features.both.button', {
      onclick: function() {
        controller.showAll();
      }
    }, [
      m('p', 'All'),
      m('div.features.black.button', {
        onclick: function(event) {
          controller.onFilterSelect('b', null, null);
          return stopevent(event);
        }
      }, [
        m('p', 'Black'),
        m('ul.features.black', controller.features().filter(f => f.side === 'b').map(f => feature(controller, f)))
      ]),
      m('div.features.white.button', {
        onclick: function(event) {
          controller.onFilterSelect('w', null, null);
          return stopevent(event);
        }
      }, [
        m('p', 'White'),
        m('ul.features.white', controller.features().filter(f => f.side === 'w').map(f => feature(controller, f)))
      ])
    ])
  ]);
};

},{"../util/stopevent":23,"./feature":24,"mithril":18}],26:[function(require,module,exports){
var m = require('mithril');

module.exports = function(controller) {
  return [
    m('input.copyable.autoselect.feninput', {
      spellcheck: false,
      value: controller.fen(),
      oninput: m.withAttr('value', controller.updateFen),
      onclick: function() {
        this.select();
      }
    })
  ];
};

},{"mithril":18}],27:[function(require,module,exports){
var m = require('mithril');
var chessground = require('chessground');
var fenbar = require('./fenbar');
var features = require('./features');

function visualBoard(ctrl) {
  return m('div.lichess_board', m('div.lichess_board_wrap', m('div.lichess_board', [
    chessground.view(ctrl.ground)
  ])));
}

function info(ctrl) {
  return [m('div.explanation', [
    m('p', 'To improve at tactics you first need to improve your vision of the tactical features present in the position.'),
    m('p.author', '- lichess.org streamer'),
    m('br'),
    m('br'),
    m('ul.instructions', [
      m('li.instructions', 'Paste your FEN position below.'),
      m('li.instructions', 'Click on the identified features.'),
      m('li.instructions', 'Copy the URL and share.')
    ]),
    m('br'),
    m('br'),
    m('div.button.newgame', {
      onclick: function() {
        window.open('./quiz.html');
      }
    }, 'Trainer'),
    m('br'),
    m('br'),
    m('div.button.newgame', {
      onclick: function() {
        ctrl.nextFen();
      }
    }, 'Random Position')
  ])];
}
module.exports = function(ctrl) {
  return [
    m("div.#site_header",
      m('div.board_left', [
        m('h2',
          m('a#site_title', 'feature',
            m('span.extension', 'tron'))),
        features(ctrl)
      ])
    ),
    m('div.#lichess',
      m('div.analyse.cg-512', [
        m('div',
          m('div.lichess_game', [
            visualBoard(ctrl),
            m('div.lichess_ground', info(ctrl))
          ])
        ),
        m('div.underboard', [
          m('div.center', [
            fenbar(ctrl),
            m('br'),
            m('small', 'Data autogenerated from games on ', m("a.external[href='http://lichess.org']", 'lichess.org.')),
            m('small', [
              'Uses libraries ', m("a.external[href='https://github.com/ornicar/chessground']", 'chessground'),
              ' and ', m("a.external[href='https://github.com/jhlywa/chess.js']", 'chessjs.'),
              ' Source code on ', m("a.external[href='https://github.com/tailuge/chess-o-tron']", 'GitHub.')
            ])
          ])
        ])
      ])
    )
  ];
};

},{"./features":25,"./fenbar":26,"chessground":12,"mithril":18}],28:[function(require,module,exports){
/*
 * Copyright (c) 2016, Jeff Hlywa (jhlywa@gmail.com)
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 *----------------------------------------------------------------------------*/

/* minified license below  */

/* @license
 * Copyright (c) 2016, Jeff Hlywa (jhlywa@gmail.com)
 * Released under the BSD license
 * https://github.com/jhlywa/chess.js/blob/master/LICENSE
 */

var Chess = function(fen) {

  /* jshint indent: false */

  var BLACK = 'b';
  var WHITE = 'w';

  var EMPTY = -1;

  var PAWN = 'p';
  var KNIGHT = 'n';
  var BISHOP = 'b';
  var ROOK = 'r';
  var QUEEN = 'q';
  var KING = 'k';

  var SYMBOLS = 'pnbrqkPNBRQK';

  var DEFAULT_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  var POSSIBLE_RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];

  var PAWN_OFFSETS = {
    b: [16, 32, 17, 15],
    w: [-16, -32, -17, -15]
  };

  var PIECE_OFFSETS = {
    n: [-18, -33, -31, -14,  18, 33, 31,  14],
    b: [-17, -15,  17,  15],
    r: [-16,   1,  16,  -1],
    q: [-17, -16, -15,   1,  17, 16, 15,  -1],
    k: [-17, -16, -15,   1,  17, 16, 15,  -1]
  };

  var ATTACKS = [
    20, 0, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0, 0,20, 0,
     0,20, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0,20, 0, 0,
     0, 0,20, 0, 0, 0, 0, 24,  0, 0, 0, 0,20, 0, 0, 0,
     0, 0, 0,20, 0, 0, 0, 24,  0, 0, 0,20, 0, 0, 0, 0,
     0, 0, 0, 0,20, 0, 0, 24,  0, 0,20, 0, 0, 0, 0, 0,
     0, 0, 0, 0, 0,20, 2, 24,  2,20, 0, 0, 0, 0, 0, 0,
     0, 0, 0, 0, 0, 2,53, 56, 53, 2, 0, 0, 0, 0, 0, 0,
    24,24,24,24,24,24,56,  0, 56,24,24,24,24,24,24, 0,
     0, 0, 0, 0, 0, 2,53, 56, 53, 2, 0, 0, 0, 0, 0, 0,
     0, 0, 0, 0, 0,20, 2, 24,  2,20, 0, 0, 0, 0, 0, 0,
     0, 0, 0, 0,20, 0, 0, 24,  0, 0,20, 0, 0, 0, 0, 0,
     0, 0, 0,20, 0, 0, 0, 24,  0, 0, 0,20, 0, 0, 0, 0,
     0, 0,20, 0, 0, 0, 0, 24,  0, 0, 0, 0,20, 0, 0, 0,
     0,20, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0,20, 0, 0,
    20, 0, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0, 0,20
  ];

  var RAYS = [
     17,  0,  0,  0,  0,  0,  0, 16,  0,  0,  0,  0,  0,  0, 15, 0,
      0, 17,  0,  0,  0,  0,  0, 16,  0,  0,  0,  0,  0, 15,  0, 0,
      0,  0, 17,  0,  0,  0,  0, 16,  0,  0,  0,  0, 15,  0,  0, 0,
      0,  0,  0, 17,  0,  0,  0, 16,  0,  0,  0, 15,  0,  0,  0, 0,
      0,  0,  0,  0, 17,  0,  0, 16,  0,  0, 15,  0,  0,  0,  0, 0,
      0,  0,  0,  0,  0, 17,  0, 16,  0, 15,  0,  0,  0,  0,  0, 0,
      0,  0,  0,  0,  0,  0, 17, 16, 15,  0,  0,  0,  0,  0,  0, 0,
      1,  1,  1,  1,  1,  1,  1,  0, -1, -1,  -1,-1, -1, -1, -1, 0,
      0,  0,  0,  0,  0,  0,-15,-16,-17,  0,  0,  0,  0,  0,  0, 0,
      0,  0,  0,  0,  0,-15,  0,-16,  0,-17,  0,  0,  0,  0,  0, 0,
      0,  0,  0,  0,-15,  0,  0,-16,  0,  0,-17,  0,  0,  0,  0, 0,
      0,  0,  0,-15,  0,  0,  0,-16,  0,  0,  0,-17,  0,  0,  0, 0,
      0,  0,-15,  0,  0,  0,  0,-16,  0,  0,  0,  0,-17,  0,  0, 0,
      0,-15,  0,  0,  0,  0,  0,-16,  0,  0,  0,  0,  0,-17,  0, 0,
    -15,  0,  0,  0,  0,  0,  0,-16,  0,  0,  0,  0,  0,  0,-17
  ];

  var SHIFTS = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

  var FLAGS = {
    NORMAL: 'n',
    CAPTURE: 'c',
    BIG_PAWN: 'b',
    EP_CAPTURE: 'e',
    PROMOTION: 'p',
    KSIDE_CASTLE: 'k',
    QSIDE_CASTLE: 'q'
  };

  var BITS = {
    NORMAL: 1,
    CAPTURE: 2,
    BIG_PAWN: 4,
    EP_CAPTURE: 8,
    PROMOTION: 16,
    KSIDE_CASTLE: 32,
    QSIDE_CASTLE: 64
  };

  var RANK_1 = 7;
  var RANK_2 = 6;
  var RANK_3 = 5;
  var RANK_4 = 4;
  var RANK_5 = 3;
  var RANK_6 = 2;
  var RANK_7 = 1;
  var RANK_8 = 0;

  var SQUARES = {
    a8:   0, b8:   1, c8:   2, d8:   3, e8:   4, f8:   5, g8:   6, h8:   7,
    a7:  16, b7:  17, c7:  18, d7:  19, e7:  20, f7:  21, g7:  22, h7:  23,
    a6:  32, b6:  33, c6:  34, d6:  35, e6:  36, f6:  37, g6:  38, h6:  39,
    a5:  48, b5:  49, c5:  50, d5:  51, e5:  52, f5:  53, g5:  54, h5:  55,
    a4:  64, b4:  65, c4:  66, d4:  67, e4:  68, f4:  69, g4:  70, h4:  71,
    a3:  80, b3:  81, c3:  82, d3:  83, e3:  84, f3:  85, g3:  86, h3:  87,
    a2:  96, b2:  97, c2:  98, d2:  99, e2: 100, f2: 101, g2: 102, h2: 103,
    a1: 112, b1: 113, c1: 114, d1: 115, e1: 116, f1: 117, g1: 118, h1: 119
  };

  var ROOKS = {
    w: [{square: SQUARES.a1, flag: BITS.QSIDE_CASTLE},
        {square: SQUARES.h1, flag: BITS.KSIDE_CASTLE}],
    b: [{square: SQUARES.a8, flag: BITS.QSIDE_CASTLE},
        {square: SQUARES.h8, flag: BITS.KSIDE_CASTLE}]
  };

  var board = new Array(128);
  var kings = {w: EMPTY, b: EMPTY};
  var turn = WHITE;
  var castling = {w: 0, b: 0};
  var ep_square = EMPTY;
  var half_moves = 0;
  var move_number = 1;
  var history = [];
  var header = {};

  /* if the user passes in a fen string, load it, else default to
   * starting position
   */
  if (typeof fen === 'undefined') {
    load(DEFAULT_POSITION);
  } else {
    load(fen);
  }

  function clear() {
    board = new Array(128);
    kings = {w: EMPTY, b: EMPTY};
    turn = WHITE;
    castling = {w: 0, b: 0};
    ep_square = EMPTY;
    half_moves = 0;
    move_number = 1;
    history = [];
    header = {};
    update_setup(generate_fen());
  }

  function reset() {
    load(DEFAULT_POSITION);
  }

  function load(fen) {
    var tokens = fen.split(/\s+/);
    var position = tokens[0];
    var square = 0;

    if (!validate_fen(fen).valid) {
      return false;
    }

    clear();

    for (var i = 0; i < position.length; i++) {
      var piece = position.charAt(i);

      if (piece === '/') {
        square += 8;
      } else if (is_digit(piece)) {
        square += parseInt(piece, 10);
      } else {
        var color = (piece < 'a') ? WHITE : BLACK;
        put({type: piece.toLowerCase(), color: color}, algebraic(square));
        square++;
      }
    }

    turn = tokens[1];

    if (tokens[2].indexOf('K') > -1) {
      castling.w |= BITS.KSIDE_CASTLE;
    }
    if (tokens[2].indexOf('Q') > -1) {
      castling.w |= BITS.QSIDE_CASTLE;
    }
    if (tokens[2].indexOf('k') > -1) {
      castling.b |= BITS.KSIDE_CASTLE;
    }
    if (tokens[2].indexOf('q') > -1) {
      castling.b |= BITS.QSIDE_CASTLE;
    }

    ep_square = (tokens[3] === '-') ? EMPTY : SQUARES[tokens[3]];
    half_moves = parseInt(tokens[4], 10);
    move_number = parseInt(tokens[5], 10);

    update_setup(generate_fen());

    return true;
  }

  /* TODO: this function is pretty much crap - it validates structure but
   * completely ignores content (e.g. doesn't verify that each side has a king)
   * ... we should rewrite this, and ditch the silly error_number field while
   * we're at it
   */
  function validate_fen(fen) {
    var errors = {
       0: 'No errors.',
       1: 'FEN string must contain six space-delimited fields.',
       2: '6th field (move number) must be a positive integer.',
       3: '5th field (half move counter) must be a non-negative integer.',
       4: '4th field (en-passant square) is invalid.',
       5: '3rd field (castling availability) is invalid.',
       6: '2nd field (side to move) is invalid.',
       7: '1st field (piece positions) does not contain 8 \'/\'-delimited rows.',
       8: '1st field (piece positions) is invalid [consecutive numbers].',
       9: '1st field (piece positions) is invalid [invalid piece].',
      10: '1st field (piece positions) is invalid [row too large].',
      11: 'Illegal en-passant square',
    };

    /* 1st criterion: 6 space-seperated fields? */
    var tokens = fen.split(/\s+/);
    if (tokens.length !== 6) {
      return {valid: false, error_number: 1, error: errors[1]};
    }

    /* 2nd criterion: move number field is a integer value > 0? */
    if (isNaN(tokens[5]) || (parseInt(tokens[5], 10) <= 0)) {
      return {valid: false, error_number: 2, error: errors[2]};
    }

    /* 3rd criterion: half move counter is an integer >= 0? */
    if (isNaN(tokens[4]) || (parseInt(tokens[4], 10) < 0)) {
      return {valid: false, error_number: 3, error: errors[3]};
    }

    /* 4th criterion: 4th field is a valid e.p.-string? */
    if (!/^(-|[abcdefgh][36])$/.test(tokens[3])) {
      return {valid: false, error_number: 4, error: errors[4]};
    }

    /* 5th criterion: 3th field is a valid castle-string? */
    if( !/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(tokens[2])) {
      return {valid: false, error_number: 5, error: errors[5]};
    }

    /* 6th criterion: 2nd field is "w" (white) or "b" (black)? */
    if (!/^(w|b)$/.test(tokens[1])) {
      return {valid: false, error_number: 6, error: errors[6]};
    }

    /* 7th criterion: 1st field contains 8 rows? */
    var rows = tokens[0].split('/');
    if (rows.length !== 8) {
      return {valid: false, error_number: 7, error: errors[7]};
    }

    /* 8th criterion: every row is valid? */
    for (var i = 0; i < rows.length; i++) {
      /* check for right sum of fields AND not two numbers in succession */
      var sum_fields = 0;
      var previous_was_number = false;

      for (var k = 0; k < rows[i].length; k++) {
        if (!isNaN(rows[i][k])) {
          if (previous_was_number) {
            return {valid: false, error_number: 8, error: errors[8]};
          }
          sum_fields += parseInt(rows[i][k], 10);
          previous_was_number = true;
        } else {
          if (!/^[prnbqkPRNBQK]$/.test(rows[i][k])) {
            return {valid: false, error_number: 9, error: errors[9]};
          }
          sum_fields += 1;
          previous_was_number = false;
        }
      }
      if (sum_fields !== 8) {
        return {valid: false, error_number: 10, error: errors[10]};
      }
    }

    if ((tokens[3][1] == '3' && tokens[1] == 'w') ||
        (tokens[3][1] == '6' && tokens[1] == 'b')) {
          return {valid: false, error_number: 11, error: errors[11]};
    }

    /* everything's okay! */
    return {valid: true, error_number: 0, error: errors[0]};
  }

  function generate_fen() {
    var empty = 0;
    var fen = '';

    for (var i = SQUARES.a8; i <= SQUARES.h1; i++) {
      if (board[i] == null) {
        empty++;
      } else {
        if (empty > 0) {
          fen += empty;
          empty = 0;
        }
        var color = board[i].color;
        var piece = board[i].type;

        fen += (color === WHITE) ?
                 piece.toUpperCase() : piece.toLowerCase();
      }

      if ((i + 1) & 0x88) {
        if (empty > 0) {
          fen += empty;
        }

        if (i !== SQUARES.h1) {
          fen += '/';
        }

        empty = 0;
        i += 8;
      }
    }

    var cflags = '';
    if (castling[WHITE] & BITS.KSIDE_CASTLE) { cflags += 'K'; }
    if (castling[WHITE] & BITS.QSIDE_CASTLE) { cflags += 'Q'; }
    if (castling[BLACK] & BITS.KSIDE_CASTLE) { cflags += 'k'; }
    if (castling[BLACK] & BITS.QSIDE_CASTLE) { cflags += 'q'; }

    /* do we have an empty castling flag? */
    cflags = cflags || '-';
    var epflags = (ep_square === EMPTY) ? '-' : algebraic(ep_square);

    return [fen, turn, cflags, epflags, half_moves, move_number].join(' ');
  }

  function set_header(args) {
    for (var i = 0; i < args.length; i += 2) {
      if (typeof args[i] === 'string' &&
          typeof args[i + 1] === 'string') {
        header[args[i]] = args[i + 1];
      }
    }
    return header;
  }

  /* called when the initial board setup is changed with put() or remove().
   * modifies the SetUp and FEN properties of the header object.  if the FEN is
   * equal to the default position, the SetUp and FEN are deleted
   * the setup is only updated if history.length is zero, ie moves haven't been
   * made.
   */
  function update_setup(fen) {
    if (history.length > 0) return;

    if (fen !== DEFAULT_POSITION) {
      header['SetUp'] = '1';
      header['FEN'] = fen;
    } else {
      delete header['SetUp'];
      delete header['FEN'];
    }
  }

  function get(square) {
    var piece = board[SQUARES[square]];
    return (piece) ? {type: piece.type, color: piece.color} : null;
  }

  function put(piece, square) {
    /* check for valid piece object */
    if (!('type' in piece && 'color' in piece)) {
      return false;
    }

    /* check for piece */
    if (SYMBOLS.indexOf(piece.type.toLowerCase()) === -1) {
      return false;
    }

    /* check for valid square */
    if (!(square in SQUARES)) {
      return false;
    }

    var sq = SQUARES[square];

    /* don't let the user place more than one king */
    if (piece.type == KING &&
        !(kings[piece.color] == EMPTY || kings[piece.color] == sq)) {
      return false;
    }

    board[sq] = {type: piece.type, color: piece.color};
    if (piece.type === KING) {
      kings[piece.color] = sq;
    }

    update_setup(generate_fen());

    return true;
  }

  function remove(square) {
    var piece = get(square);
    board[SQUARES[square]] = null;
    if (piece && piece.type === KING) {
      kings[piece.color] = EMPTY;
    }

    update_setup(generate_fen());

    return piece;
  }

  function build_move(board, from, to, flags, promotion) {
    var move = {
      color: turn,
      from: from,
      to: to,
      flags: flags,
      piece: board[from].type
    };

    if (promotion) {
      move.flags |= BITS.PROMOTION;
      move.promotion = promotion;
    }

    if (board[to]) {
      move.captured = board[to].type;
    } else if (flags & BITS.EP_CAPTURE) {
        move.captured = PAWN;
    }
    return move;
  }

  function generate_moves(options) {
    function add_move(board, moves, from, to, flags) {
      /* if pawn promotion */
      if (board[from].type === PAWN &&
         (rank(to) === RANK_8 || rank(to) === RANK_1)) {
          var pieces = [QUEEN, ROOK, BISHOP, KNIGHT];
          for (var i = 0, len = pieces.length; i < len; i++) {
            moves.push(build_move(board, from, to, flags, pieces[i]));
          }
      } else {
       moves.push(build_move(board, from, to, flags));
      }
    }

    var moves = [];
    var us = turn;
    var them = swap_color(us);
    var second_rank = {b: RANK_7, w: RANK_2};

    var first_sq = SQUARES.a8;
    var last_sq = SQUARES.h1;
    var single_square = false;

    /* do we want legal moves? */
    var legal = (typeof options !== 'undefined' && 'legal' in options) ?
                options.legal : true;

    /* are we generating moves for a single square? */
    if (typeof options !== 'undefined' && 'square' in options) {
      if (options.square in SQUARES) {
        first_sq = last_sq = SQUARES[options.square];
        single_square = true;
      } else {
        /* invalid square */
        return [];
      }
    }

    for (var i = first_sq; i <= last_sq; i++) {
      /* did we run off the end of the board */
      if (i & 0x88) { i += 7; continue; }

      var piece = board[i];
      if (piece == null || piece.color !== us) {
        continue;
      }

      if (piece.type === PAWN) {
        /* single square, non-capturing */
        var square = i + PAWN_OFFSETS[us][0];
        if (board[square] == null) {
            add_move(board, moves, i, square, BITS.NORMAL);

          /* double square */
          var square = i + PAWN_OFFSETS[us][1];
          if (second_rank[us] === rank(i) && board[square] == null) {
            add_move(board, moves, i, square, BITS.BIG_PAWN);
          }
        }

        /* pawn captures */
        for (j = 2; j < 4; j++) {
          var square = i + PAWN_OFFSETS[us][j];
          if (square & 0x88) continue;

          if (board[square] != null &&
              board[square].color === them) {
              add_move(board, moves, i, square, BITS.CAPTURE);
          } else if (square === ep_square) {
              add_move(board, moves, i, ep_square, BITS.EP_CAPTURE);
          }
        }
      } else {
        for (var j = 0, len = PIECE_OFFSETS[piece.type].length; j < len; j++) {
          var offset = PIECE_OFFSETS[piece.type][j];
          var square = i;

          while (true) {
            square += offset;
            if (square & 0x88) break;

            if (board[square] == null) {
              add_move(board, moves, i, square, BITS.NORMAL);
            } else {
              if (board[square].color === us) break;
              add_move(board, moves, i, square, BITS.CAPTURE);
              break;
            }

            /* break, if knight or king */
            if (piece.type === 'n' || piece.type === 'k') break;
          }
        }
      }
    }

    /* check for castling if: a) we're generating all moves, or b) we're doing
     * single square move generation on the king's square
     */
    if ((!single_square) || last_sq === kings[us]) {
      /* king-side castling */
      if (castling[us] & BITS.KSIDE_CASTLE) {
        var castling_from = kings[us];
        var castling_to = castling_from + 2;

        if (board[castling_from + 1] == null &&
            board[castling_to]       == null &&
            !attacked(them, kings[us]) &&
            !attacked(them, castling_from + 1) &&
            !attacked(them, castling_to)) {
          add_move(board, moves, kings[us] , castling_to,
                   BITS.KSIDE_CASTLE);
        }
      }

      /* queen-side castling */
      if (castling[us] & BITS.QSIDE_CASTLE) {
        var castling_from = kings[us];
        var castling_to = castling_from - 2;

        if (board[castling_from - 1] == null &&
            board[castling_from - 2] == null &&
            board[castling_from - 3] == null &&
            !attacked(them, kings[us]) &&
            !attacked(them, castling_from - 1) &&
            !attacked(them, castling_to)) {
          add_move(board, moves, kings[us], castling_to,
                   BITS.QSIDE_CASTLE);
        }
      }
    }

    /* return all pseudo-legal moves (this includes moves that allow the king
     * to be captured)
     */
    if (!legal) {
      return moves;
    }

    /* filter out illegal moves */
    var legal_moves = [];
    for (var i = 0, len = moves.length; i < len; i++) {
      make_move(moves[i]);
      if (!king_attacked(us)) {
        legal_moves.push(moves[i]);
      }
      undo_move();
    }

    return legal_moves;
  }

  /* convert a move from 0x88 coordinates to Standard Algebraic Notation
   * (SAN)
   *
   * @param {boolean} sloppy Use the sloppy SAN generator to work around over
   * disambiguation bugs in Fritz and Chessbase.  See below:
   *
   * r1bqkbnr/ppp2ppp/2n5/1B1pP3/4P3/8/PPPP2PP/RNBQK1NR b KQkq - 2 4
   * 4. ... Nge7 is overly disambiguated because the knight on c6 is pinned
   * 4. ... Ne7 is technically the valid SAN
   */
  function move_to_san(move, sloppy) {

    var output = '';

    if (move.flags & BITS.KSIDE_CASTLE) {
      output = 'O-O';
    } else if (move.flags & BITS.QSIDE_CASTLE) {
      output = 'O-O-O';
    } else {
      var disambiguator = get_disambiguator(move, sloppy);

      if (move.piece !== PAWN) {
        output += move.piece.toUpperCase() + disambiguator;
      }

      if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
        if (move.piece === PAWN) {
          output += algebraic(move.from)[0];
        }
        output += 'x';
      }

      output += algebraic(move.to);

      if (move.flags & BITS.PROMOTION) {
        output += '=' + move.promotion.toUpperCase();
      }
    }

    make_move(move);
    if (in_check()) {
      if (in_checkmate()) {
        output += '#';
      } else {
        output += '+';
      }
    }
    undo_move();

    return output;
  }

  // parses all of the decorators out of a SAN string
  function stripped_san(move) {
    return move.replace(/=/,'').replace(/[+#]?[?!]*$/,'');
  }

  function attacked(color, square) {
    if (square < 0) return false;
    for (var i = SQUARES.a8; i <= SQUARES.h1; i++) {
      /* did we run off the end of the board */
      if (i & 0x88) { i += 7; continue; }

      /* if empty square or wrong color */
      if (board[i] == null || board[i].color !== color) continue;

      var piece = board[i];
      var difference = i - square;
      var index = difference + 119;

      if (ATTACKS[index] & (1 << SHIFTS[piece.type])) {
        if (piece.type === PAWN) {
          if (difference > 0) {
            if (piece.color === WHITE) return true;
          } else {
            if (piece.color === BLACK) return true;
          }
          continue;
        }

        /* if the piece is a knight or a king */
        if (piece.type === 'n' || piece.type === 'k') return true;

        var offset = RAYS[index];
        var j = i + offset;

        var blocked = false;
        while (j !== square) {
          if (board[j] != null) { blocked = true; break; }
          j += offset;
        }

        if (!blocked) return true;
      }
    }

    return false;
  }

  function king_attacked(color) {
    return attacked(swap_color(color), kings[color]);
  }

  function in_check() {
    return king_attacked(turn);
  }

  function in_checkmate() {
    return in_check() && generate_moves().length === 0;
  }

  function in_stalemate() {
    return !in_check() && generate_moves().length === 0;
  }

  function insufficient_material() {
    var pieces = {};
    var bishops = [];
    var num_pieces = 0;
    var sq_color = 0;

    for (var i = SQUARES.a8; i<= SQUARES.h1; i++) {
      sq_color = (sq_color + 1) % 2;
      if (i & 0x88) { i += 7; continue; }

      var piece = board[i];
      if (piece) {
        pieces[piece.type] = (piece.type in pieces) ?
                              pieces[piece.type] + 1 : 1;
        if (piece.type === BISHOP) {
          bishops.push(sq_color);
        }
        num_pieces++;
      }
    }

    /* k vs. k */
    if (num_pieces === 2) { return true; }

    /* k vs. kn .... or .... k vs. kb */
    else if (num_pieces === 3 && (pieces[BISHOP] === 1 ||
                                 pieces[KNIGHT] === 1)) { return true; }

    /* kb vs. kb where any number of bishops are all on the same color */
    else if (num_pieces === pieces[BISHOP] + 2) {
      var sum = 0;
      var len = bishops.length;
      for (var i = 0; i < len; i++) {
        sum += bishops[i];
      }
      if (sum === 0 || sum === len) { return true; }
    }

    return false;
  }

  function in_threefold_repetition() {
    /* TODO: while this function is fine for casual use, a better
     * implementation would use a Zobrist key (instead of FEN). the
     * Zobrist key would be maintained in the make_move/undo_move functions,
     * avoiding the costly that we do below.
     */
    var moves = [];
    var positions = {};
    var repetition = false;

    while (true) {
      var move = undo_move();
      if (!move) break;
      moves.push(move);
    }

    while (true) {
      /* remove the last two fields in the FEN string, they're not needed
       * when checking for draw by rep */
      var fen = generate_fen().split(' ').slice(0,4).join(' ');

      /* has the position occurred three or move times */
      positions[fen] = (fen in positions) ? positions[fen] + 1 : 1;
      if (positions[fen] >= 3) {
        repetition = true;
      }

      if (!moves.length) {
        break;
      }
      make_move(moves.pop());
    }

    return repetition;
  }

  function push(move) {
    history.push({
      move: move,
      kings: {b: kings.b, w: kings.w},
      turn: turn,
      castling: {b: castling.b, w: castling.w},
      ep_square: ep_square,
      half_moves: half_moves,
      move_number: move_number
    });
  }

  function make_move(move) {
    var us = turn;
    var them = swap_color(us);
    push(move);

    board[move.to] = board[move.from];
    board[move.from] = null;

    /* if ep capture, remove the captured pawn */
    if (move.flags & BITS.EP_CAPTURE) {
      if (turn === BLACK) {
        board[move.to - 16] = null;
      } else {
        board[move.to + 16] = null;
      }
    }

    /* if pawn promotion, replace with new piece */
    if (move.flags & BITS.PROMOTION) {
      board[move.to] = {type: move.promotion, color: us};
    }

    /* if we moved the king */
    if (board[move.to].type === KING) {
      kings[board[move.to].color] = move.to;

      /* if we castled, move the rook next to the king */
      if (move.flags & BITS.KSIDE_CASTLE) {
        var castling_to = move.to - 1;
        var castling_from = move.to + 1;
        board[castling_to] = board[castling_from];
        board[castling_from] = null;
      } else if (move.flags & BITS.QSIDE_CASTLE) {
        var castling_to = move.to + 1;
        var castling_from = move.to - 2;
        board[castling_to] = board[castling_from];
        board[castling_from] = null;
      }

      /* turn off castling */
      castling[us] = '';
    }

    /* turn off castling if we move a rook */
    if (castling[us]) {
      for (var i = 0, len = ROOKS[us].length; i < len; i++) {
        if (move.from === ROOKS[us][i].square &&
            castling[us] & ROOKS[us][i].flag) {
          castling[us] ^= ROOKS[us][i].flag;
          break;
        }
      }
    }

    /* turn off castling if we capture a rook */
    if (castling[them]) {
      for (var i = 0, len = ROOKS[them].length; i < len; i++) {
        if (move.to === ROOKS[them][i].square &&
            castling[them] & ROOKS[them][i].flag) {
          castling[them] ^= ROOKS[them][i].flag;
          break;
        }
      }
    }

    /* if big pawn move, update the en passant square */
    if (move.flags & BITS.BIG_PAWN) {
      if (turn === 'b') {
        ep_square = move.to - 16;
      } else {
        ep_square = move.to + 16;
      }
    } else {
      ep_square = EMPTY;
    }

    /* reset the 50 move counter if a pawn is moved or a piece is captured */
    if (move.piece === PAWN) {
      half_moves = 0;
    } else if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
      half_moves = 0;
    } else {
      half_moves++;
    }

    if (turn === BLACK) {
      move_number++;
    }
    turn = swap_color(turn);
  }

  function undo_move() {
    var old = history.pop();
    if (old == null) { return null; }

    var move = old.move;
    kings = old.kings;
    turn = old.turn;
    castling = old.castling;
    ep_square = old.ep_square;
    half_moves = old.half_moves;
    move_number = old.move_number;

    var us = turn;
    var them = swap_color(turn);

    board[move.from] = board[move.to];
    board[move.from].type = move.piece;  // to undo any promotions
    board[move.to] = null;

    if (move.flags & BITS.CAPTURE) {
      board[move.to] = {type: move.captured, color: them};
    } else if (move.flags & BITS.EP_CAPTURE) {
      var index;
      if (us === BLACK) {
        index = move.to - 16;
      } else {
        index = move.to + 16;
      }
      board[index] = {type: PAWN, color: them};
    }


    if (move.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
      var castling_to, castling_from;
      if (move.flags & BITS.KSIDE_CASTLE) {
        castling_to = move.to + 1;
        castling_from = move.to - 1;
      } else if (move.flags & BITS.QSIDE_CASTLE) {
        castling_to = move.to - 2;
        castling_from = move.to + 1;
      }

      board[castling_to] = board[castling_from];
      board[castling_from] = null;
    }

    return move;
  }

  /* this function is used to uniquely identify ambiguous moves */
  function get_disambiguator(move, sloppy) {
    var moves = generate_moves({legal: !sloppy});

    var from = move.from;
    var to = move.to;
    var piece = move.piece;

    var ambiguities = 0;
    var same_rank = 0;
    var same_file = 0;

    for (var i = 0, len = moves.length; i < len; i++) {
      var ambig_from = moves[i].from;
      var ambig_to = moves[i].to;
      var ambig_piece = moves[i].piece;

      /* if a move of the same piece type ends on the same to square, we'll
       * need to add a disambiguator to the algebraic notation
       */
      if (piece === ambig_piece && from !== ambig_from && to === ambig_to) {
        ambiguities++;

        if (rank(from) === rank(ambig_from)) {
          same_rank++;
        }

        if (file(from) === file(ambig_from)) {
          same_file++;
        }
      }
    }

    if (ambiguities > 0) {
      /* if there exists a similar moving piece on the same rank and file as
       * the move in question, use the square as the disambiguator
       */
      if (same_rank > 0 && same_file > 0) {
        return algebraic(from);
      }
      /* if the moving piece rests on the same file, use the rank symbol as the
       * disambiguator
       */
      else if (same_file > 0) {
        return algebraic(from).charAt(1);
      }
      /* else use the file symbol */
      else {
        return algebraic(from).charAt(0);
      }
    }

    return '';
  }

  function ascii() {
    var s = '   +------------------------+\n';
    for (var i = SQUARES.a8; i <= SQUARES.h1; i++) {
      /* display the rank */
      if (file(i) === 0) {
        s += ' ' + '87654321'[rank(i)] + ' |';
      }

      /* empty piece */
      if (board[i] == null) {
        s += ' . ';
      } else {
        var piece = board[i].type;
        var color = board[i].color;
        var symbol = (color === WHITE) ?
                     piece.toUpperCase() : piece.toLowerCase();
        s += ' ' + symbol + ' ';
      }

      if ((i + 1) & 0x88) {
        s += '|\n';
        i += 8;
      }
    }
    s += '   +------------------------+\n';
    s += '     a  b  c  d  e  f  g  h\n';

    return s;
  }

  // convert a move from Standard Algebraic Notation (SAN) to 0x88 coordinates
  function move_from_san(move, sloppy) {
    // strip off any move decorations: e.g Nf3+?!
    var clean_move = stripped_san(move);

    // if we're using the sloppy parser run a regex to grab piece, to, and from
    // this should parse invalid SAN like: Pe2-e4, Rc1c4, Qf3xf7
    if (sloppy) {
      var matches = clean_move.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/);
      if (matches) {
        var piece = matches[1];
        var from = matches[2];
        var to = matches[3];
        var promotion = matches[4];
      }
    }

    var moves = generate_moves();
    for (var i = 0, len = moves.length; i < len; i++) {
      // try the strict parser first, then the sloppy parser if requested
      // by the user
      if ((clean_move === stripped_san(move_to_san(moves[i]))) ||
          (sloppy && clean_move === stripped_san(move_to_san(moves[i], true)))) {
        return moves[i];
      } else {
        if (matches &&
            (!piece || piece.toLowerCase() == moves[i].piece) &&
            SQUARES[from] == moves[i].from &&
            SQUARES[to] == moves[i].to &&
            (!promotion || promotion.toLowerCase() == moves[i].promotion)) {
          return moves[i];
        }
      }
    }

    return null;
  }


  /*****************************************************************************
   * UTILITY FUNCTIONS
   ****************************************************************************/
  function rank(i) {
    return i >> 4;
  }

  function file(i) {
    return i & 15;
  }

  function algebraic(i){
    var f = file(i), r = rank(i);
    return 'abcdefgh'.substring(f,f+1) + '87654321'.substring(r,r+1);
  }

  function swap_color(c) {
    return c === WHITE ? BLACK : WHITE;
  }

  function is_digit(c) {
    return '0123456789'.indexOf(c) !== -1;
  }

  /* pretty = external move object */
  function make_pretty(ugly_move) {
    var move = clone(ugly_move);
    move.san = move_to_san(move, false);
    move.to = algebraic(move.to);
    move.from = algebraic(move.from);

    var flags = '';

    for (var flag in BITS) {
      if (BITS[flag] & move.flags) {
        flags += FLAGS[flag];
      }
    }
    move.flags = flags;

    return move;
  }

  function clone(obj) {
    var dupe = (obj instanceof Array) ? [] : {};

    for (var property in obj) {
      if (typeof property === 'object') {
        dupe[property] = clone(obj[property]);
      } else {
        dupe[property] = obj[property];
      }
    }

    return dupe;
  }

  function trim(str) {
    return str.replace(/^\s+|\s+$/g, '');
  }

  /*****************************************************************************
   * DEBUGGING UTILITIES
   ****************************************************************************/
  function perft(depth) {
    var moves = generate_moves({legal: false});
    var nodes = 0;
    var color = turn;

    for (var i = 0, len = moves.length; i < len; i++) {
      make_move(moves[i]);
      if (!king_attacked(color)) {
        if (depth - 1 > 0) {
          var child_nodes = perft(depth - 1);
          nodes += child_nodes;
        } else {
          nodes++;
        }
      }
      undo_move();
    }

    return nodes;
  }

  return {
    /***************************************************************************
     * PUBLIC CONSTANTS (is there a better way to do this?)
     **************************************************************************/
    WHITE: WHITE,
    BLACK: BLACK,
    PAWN: PAWN,
    KNIGHT: KNIGHT,
    BISHOP: BISHOP,
    ROOK: ROOK,
    QUEEN: QUEEN,
    KING: KING,
    SQUARES: (function() {
                /* from the ECMA-262 spec (section 12.6.4):
                 * "The mechanics of enumerating the properties ... is
                 * implementation dependent"
                 * so: for (var sq in SQUARES) { keys.push(sq); } might not be
                 * ordered correctly
                 */
                var keys = [];
                for (var i = SQUARES.a8; i <= SQUARES.h1; i++) {
                  if (i & 0x88) { i += 7; continue; }
                  keys.push(algebraic(i));
                }
                return keys;
              })(),
    FLAGS: FLAGS,

    /***************************************************************************
     * PUBLIC API
     **************************************************************************/
    load: function(fen) {
      return load(fen);
    },

    reset: function() {
      return reset();
    },

    moves: function(options) {
      /* The internal representation of a chess move is in 0x88 format, and
       * not meant to be human-readable.  The code below converts the 0x88
       * square coordinates to algebraic coordinates.  It also prunes an
       * unnecessary move keys resulting from a verbose call.
       */

      var ugly_moves = generate_moves(options);
      var moves = [];

      for (var i = 0, len = ugly_moves.length; i < len; i++) {

        /* does the user want a full move object (most likely not), or just
         * SAN
         */
        if (typeof options !== 'undefined' && 'verbose' in options &&
            options.verbose) {
          moves.push(make_pretty(ugly_moves[i]));
        } else {
          moves.push(move_to_san(ugly_moves[i], false));
        }
      }

      return moves;
    },

    in_check: function() {
      return in_check();
    },

    in_checkmate: function() {
      return in_checkmate();
    },

    in_stalemate: function() {
      return in_stalemate();
    },

    in_draw: function() {
      return half_moves >= 100 ||
             in_stalemate() ||
             insufficient_material() ||
             in_threefold_repetition();
    },

    insufficient_material: function() {
      return insufficient_material();
    },

    in_threefold_repetition: function() {
      return in_threefold_repetition();
    },

    game_over: function() {
      return half_moves >= 100 ||
             in_checkmate() ||
             in_stalemate() ||
             insufficient_material() ||
             in_threefold_repetition();
    },

    validate_fen: function(fen) {
      return validate_fen(fen);
    },

    fen: function() {
      return generate_fen();
    },

    pgn: function(options) {
      /* using the specification from http://www.chessclub.com/help/PGN-spec
       * example for html usage: .pgn({ max_width: 72, newline_char: "<br />" })
       */
      var newline = (typeof options === 'object' &&
                     typeof options.newline_char === 'string') ?
                     options.newline_char : '\n';
      var max_width = (typeof options === 'object' &&
                       typeof options.max_width === 'number') ?
                       options.max_width : 0;
      var result = [];
      var header_exists = false;

      /* add the PGN header headerrmation */
      for (var i in header) {
        /* TODO: order of enumerated properties in header object is not
         * guaranteed, see ECMA-262 spec (section 12.6.4)
         */
        result.push('[' + i + ' \"' + header[i] + '\"]' + newline);
        header_exists = true;
      }

      if (header_exists && history.length) {
        result.push(newline);
      }

      /* pop all of history onto reversed_history */
      var reversed_history = [];
      while (history.length > 0) {
        reversed_history.push(undo_move());
      }

      var moves = [];
      var move_string = '';

      /* build the list of moves.  a move_string looks like: "3. e3 e6" */
      while (reversed_history.length > 0) {
        var move = reversed_history.pop();

        /* if the position started with black to move, start PGN with 1. ... */
        if (!history.length && move.color === 'b') {
          move_string = move_number + '. ...';
        } else if (move.color === 'w') {
          /* store the previous generated move_string if we have one */
          if (move_string.length) {
            moves.push(move_string);
          }
          move_string = move_number + '.';
        }

        move_string = move_string + ' ' + move_to_san(move, false);
        make_move(move);
      }

      /* are there any other leftover moves? */
      if (move_string.length) {
        moves.push(move_string);
      }

      /* is there a result? */
      if (typeof header.Result !== 'undefined') {
        moves.push(header.Result);
      }

      /* history should be back to what is was before we started generating PGN,
       * so join together moves
       */
      if (max_width === 0) {
        return result.join('') + moves.join(' ');
      }

      /* wrap the PGN output at max_width */
      var current_width = 0;
      for (var i = 0; i < moves.length; i++) {
        /* if the current move will push past max_width */
        if (current_width + moves[i].length > max_width && i !== 0) {

          /* don't end the line with whitespace */
          if (result[result.length - 1] === ' ') {
            result.pop();
          }

          result.push(newline);
          current_width = 0;
        } else if (i !== 0) {
          result.push(' ');
          current_width++;
        }
        result.push(moves[i]);
        current_width += moves[i].length;
      }

      return result.join('');
    },

    load_pgn: function(pgn, options) {
      // allow the user to specify the sloppy move parser to work around over
      // disambiguation bugs in Fritz and Chessbase
      var sloppy = (typeof options !== 'undefined' && 'sloppy' in options) ?
                    options.sloppy : false;

      function mask(str) {
        return str.replace(/\\/g, '\\');
      }

      function has_keys(object) {
        for (var key in object) {
          return true;
        }
        return false;
      }

      function parse_pgn_header(header, options) {
        var newline_char = (typeof options === 'object' &&
                            typeof options.newline_char === 'string') ?
                            options.newline_char : '\r?\n';
        var header_obj = {};
        var headers = header.split(new RegExp(mask(newline_char)));
        var key = '';
        var value = '';

        for (var i = 0; i < headers.length; i++) {
          key = headers[i].replace(/^\[([A-Z][A-Za-z]*)\s.*\]$/, '$1');
          value = headers[i].replace(/^\[[A-Za-z]+\s"(.*)"\]$/, '$1');
          if (trim(key).length > 0) {
            header_obj[key] = value;
          }
        }

        return header_obj;
      }

      var newline_char = (typeof options === 'object' &&
                          typeof options.newline_char === 'string') ?
                          options.newline_char : '\r?\n';
      var regex = new RegExp('^(\\[(.|' + mask(newline_char) + ')*\\])' +
                             '(' + mask(newline_char) + ')*' +
                             '1.(' + mask(newline_char) + '|.)*$', 'g');

      /* get header part of the PGN file */
      var header_string = pgn.replace(regex, '$1');

      /* no info part given, begins with moves */
      if (header_string[0] !== '[') {
        header_string = '';
      }

      reset();

      /* parse PGN header */
      var headers = parse_pgn_header(header_string, options);
      for (var key in headers) {
        set_header([key, headers[key]]);
      }

      /* load the starting position indicated by [Setup '1'] and
      * [FEN position] */
      if (headers['SetUp'] === '1') {
          if (!(('FEN' in headers) && load(headers['FEN']))) {
            return false;
          }
      }

      /* delete header to get the moves */
      var ms = pgn.replace(header_string, '').replace(new RegExp(mask(newline_char), 'g'), ' ');

      /* delete comments */
      ms = ms.replace(/(\{[^}]+\})+?/g, '');

      /* delete recursive annotation variations */
      var rav_regex = /(\([^\(\)]+\))+?/g
      while (rav_regex.test(ms)) {
        ms = ms.replace(rav_regex, '');
      }

      /* delete move numbers */
      ms = ms.replace(/\d+\.(\.\.)?/g, '');

      /* delete ... indicating black to move */
      ms = ms.replace(/\.\.\./g, '');

      /* delete numeric annotation glyphs */
      ms = ms.replace(/\$\d+/g, '');

      /* trim and get array of moves */
      var moves = trim(ms).split(new RegExp(/\s+/));

      /* delete empty entries */
      moves = moves.join(',').replace(/,,+/g, ',').split(',');
      var move = '';

      for (var half_move = 0; half_move < moves.length - 1; half_move++) {
        move = move_from_san(moves[half_move], sloppy);

        /* move not possible! (don't clear the board to examine to show the
         * latest valid position)
         */
        if (move == null) {
          return false;
        } else {
          make_move(move);
        }
      }

      /* examine last move */
      move = moves[moves.length - 1];
      if (POSSIBLE_RESULTS.indexOf(move) > -1) {
        if (has_keys(header) && typeof header.Result === 'undefined') {
          set_header(['Result', move]);
        }
      }
      else {
        move = move_from_san(move, sloppy);
        if (move == null) {
          return false;
        } else {
          make_move(move);
        }
      }
      return true;
    },

    header: function() {
      return set_header(arguments);
    },

    ascii: function() {
      return ascii();
    },

    turn: function() {
      return turn;
    },

    move: function(move, options) {
      /* The move function can be called with in the following parameters:
       *
       * .move('Nxb7')      <- where 'move' is a case-sensitive SAN string
       *
       * .move({ from: 'h7', <- where the 'move' is a move object (additional
       *         to :'h8',      fields are ignored)
       *         promotion: 'q',
       *      })
       */

      // allow the user to specify the sloppy move parser to work around over
      // disambiguation bugs in Fritz and Chessbase
      var sloppy = (typeof options !== 'undefined' && 'sloppy' in options) ?
                    options.sloppy : false;

      var move_obj = null;

      if (typeof move === 'string') {
        move_obj = move_from_san(move, sloppy);
      } else if (typeof move === 'object') {
        var moves = generate_moves();

        /* convert the pretty move object to an ugly move object */
        for (var i = 0, len = moves.length; i < len; i++) {
          if (move.from === algebraic(moves[i].from) &&
              move.to === algebraic(moves[i].to) &&
              (!('promotion' in moves[i]) ||
              move.promotion === moves[i].promotion)) {
            move_obj = moves[i];
            break;
          }
        }
      }

      /* failed to find move */
      if (!move_obj) {
        return null;
      }

      /* need to make a copy of move because we can't generate SAN after the
       * move is made
       */
      var pretty_move = make_pretty(move_obj);

      make_move(move_obj);

      return pretty_move;
    },

    undo: function() {
      var move = undo_move();
      return (move) ? make_pretty(move) : null;
    },

    clear: function() {
      return clear();
    },

    put: function(piece, square) {
      return put(piece, square);
    },

    get: function(square) {
      return get(square);
    },

    remove: function(square) {
      return remove(square);
    },

    perft: function(depth) {
      return perft(depth);
    },

    square_color: function(square) {
      if (square in SQUARES) {
        var sq_0x88 = SQUARES[square];
        return ((rank(sq_0x88) + file(sq_0x88)) % 2 === 0) ? 'light' : 'dark';
      }

      return null;
    },

    history: function(options) {
      var reversed_history = [];
      var move_history = [];
      var verbose = (typeof options !== 'undefined' && 'verbose' in options &&
                     options.verbose);

      while (history.length > 0) {
        reversed_history.push(undo_move());
      }

      while (reversed_history.length > 0) {
        var move = reversed_history.pop();
        if (verbose) {
          move_history.push(make_pretty(move));
        } else {
          move_history.push(move_to_san(move));
        }
        make_move(move);
      }

      return move_history;
    }

  };
};

/* export Chess object if using node or any other CommonJS compatible
 * environment */
if (typeof exports !== 'undefined') exports.Chess = Chess;
/* export Chess object for any RequireJS compatible environment */
if (typeof define !== 'undefined') define( function () { return Chess;  });

},{}],29:[function(require,module,exports){
var Chess = require('chess.js').Chess;
var c = require('./chessutils');

module.exports = function(puzzle) {
    var chess = new Chess();
    chess.load(puzzle.fen);
    addCheckingSquares(puzzle.fen, puzzle.features);
    addCheckingSquares(c.fenForOtherSide(puzzle.fen), puzzle.features);
    return puzzle;
};

function addCheckingSquares(fen, features) {
    var chess = new Chess();
    chess.load(fen);
    var moves = chess.moves({
        verbose: true
    });

    var mates = moves.filter(move => /\#/.test(move.san));
    var checks = moves.filter(move => /\+/.test(move.san));
    features.push({
        description: "Checking squares",
        side: chess.turn(),
        targets: checks.map(m => targetAndDiagram(m.from, m.to, checkingMoves(fen, m), '♔+'))
    });

    features.push({
        description: "Mating squares",
        side: chess.turn(),
        targets: mates.map(m => targetAndDiagram(m.from, m.to, checkingMoves(fen, m), '♔#'))
    });

    if (mates.length > 0) {
        features.forEach(f => {
            if (f.description === "Mate-in-1 threats") {
                f.targets = [];
            }
        });
    }
}

function checkingMoves(fen, move) {
    var chess = new Chess();
    chess.load(fen);
    chess.move(move);
    chess.load(c.fenForOtherSide(chess.fen()));
    var moves = chess.moves({
        verbose: true
    });
    return moves.filter(m => m.captured && m.captured.toLowerCase() === 'k');
}


function targetAndDiagram(from, to, checks, marker) {
    return {
        target: to,
        marker: marker,
        diagram: [{
            orig: from,
            dest: to,
            brush: 'paleBlue'
        }].concat(checks.map(m => {
            return {
                orig: m.from,
                dest: m.to,
                brush: 'red'
            };
        }))
    };
}

},{"./chessutils":30,"chess.js":28}],30:[function(require,module,exports){
/**
 * Chess extensions
 */

var Chess = require('chess.js').Chess;

var allSquares = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'];

/**
 * Place king at square and find out if it is in check.
 */
function isCheckAfterPlacingKingAtSquare(fen, king, square) {
    var chess = new Chess(fen);
    chess.remove(square);
    chess.remove(king);
    chess.put({
        type: 'k',
        color: chess.turn()
    }, square);
    return chess.in_check();
}


function movesThatResultInCaptureThreat(fen, from, to, sameSide) {
    var chess = new Chess(fen);

    if (!sameSide) {
        //null move for player to allow opponent a move
        chess.load(fenForOtherSide(chess.fen()));
        fen = chess.fen();

    }
    var moves = chess.moves({
        verbose: true
    });
    var squaresBetween = between(from, to);

    // do any of the moves reveal the desired capture 
    return moves.filter(move => squaresBetween.indexOf(move.from) !== -1)
        .filter(m => doesMoveResultInCaptureThreat(m, fen, from, to, sameSide));
}

function doesMoveResultInCaptureThreat(move, fen, from, to, sameSide) {
    var chess = new Chess(fen);

    //apply move of intermediary piece (state becomes other sides turn)
    chess.move(move);

    //console.log(chess.ascii());
    //console.log(chess.turn());

    if (sameSide) {
        //null move for opponent to regain the move for original side
        chess.load(fenForOtherSide(chess.fen()));
    }

    //get legal moves
    var moves = chess.moves({
        verbose: true
    });

    // do any of the moves match from,to 
    return moves.filter(m => m.from === from && m.to === to).length > 0;
}

/**
 * Switch side to play (and remove en-passent information)
 */
function fenForOtherSide(fen) {
    if (fen.search(" w ") > 0) {
        return fen.replace(/ w .*/, " b - - 0 1");
    }
    else {
        return fen.replace(/ b .*/, " w - - 0 2");
    }
}

/**
 * Where is the king.
 */
function kingsSquare(fen, colour) {
    return squaresOfPiece(fen, colour, 'k');
}

function squaresOfPiece(fen, colour, pieceType) {
    var chess = new Chess(fen);
    return allSquares.find(square => {
        var r = chess.get(square);
        return r === null ? false : (r.color == colour && r.type.toLowerCase() === pieceType);
    });
}

function movesOfPieceOn(fen, square) {
    var chess = new Chess(fen);
    return chess.moves({
        verbose: true,
        square: square
    });
}

/**
 * Find position of all of one colours pieces excluding the king.
 */
function piecesForColour(fen, colour) {
    var chess = new Chess(fen);
    return allSquares.filter(square => {
        var r = chess.get(square);
        if ((r === null) || (r.type === 'k')) {
            return false;
        }
        return r.color == colour;
    });
}

function allPiecesForColour(fen, colour) {
    var chess = new Chess(fen);
    return allSquares.filter(square => {
        var r = chess.get(square);
        return r && r.color == colour;
    });
}

function majorPiecesForColour(fen, colour) {
    var chess = new Chess(fen);
    return allSquares.filter(square => {
        var r = chess.get(square);
        if ((r === null) || (r.type === 'p')) {
            return false;
        }
        return r.color == colour;
    });
}

function canCapture(from, fromPiece, to, toPiece) {
    var chess = new Chess();
    chess.clear();
    chess.put({
        type: fromPiece.type,
        color: 'w'
    }, from);
    chess.put({
        type: toPiece.type,
        color: 'b'
    }, to);
    var moves = chess.moves({
        square: from,
        verbose: true
    }).filter(m => (/.*x.*/.test(m.san)));
    return moves.length > 0;
}

function between(from, to) {
    var result = [];
    var n = from;
    while (n !== to) {
        n = String.fromCharCode(n.charCodeAt() + Math.sign(to.charCodeAt() - n.charCodeAt())) +
            String.fromCharCode(n.charCodeAt(1) + Math.sign(to.charCodeAt(1) - n.charCodeAt(1)));
        result.push(n);
    }
    result.pop();
    return result;
}

function repairFen(fen) {
    if (/^[^ ]*$/.test(fen)) {
        return fen + " w - - 0 1";
    }
    return fen.replace(/ w .*/, ' w - - 0 1').replace(/ b .*/, ' b - - 0 1');
}

module.exports.allSquares = allSquares;
module.exports.kingsSquare = kingsSquare;
module.exports.piecesForColour = piecesForColour;
module.exports.allPiecesForColour = allPiecesForColour;
module.exports.isCheckAfterPlacingKingAtSquare = isCheckAfterPlacingKingAtSquare;
module.exports.fenForOtherSide = fenForOtherSide;

module.exports.movesThatResultInCaptureThreat = movesThatResultInCaptureThreat;
module.exports.movesOfPieceOn = movesOfPieceOn;
module.exports.majorPiecesForColour = majorPiecesForColour;
module.exports.canCapture = canCapture;
module.exports.between = between;
module.exports.repairFen = repairFen;

},{"chess.js":28}],31:[function(require,module,exports){
var uniq = require('./util/uniq');

/**
 * Find all diagrams associated with target square in the list of features.
 */
function diagramForTarget(side, description, target, features) {
  var diagram = [];
  features
    .filter(f => side ? side === f.side : true)
    .filter(f => description ? description === f.description : true)
    .forEach(f => f.targets.forEach(t => {
      if (!target || t.target === target) {
        diagram = diagram.concat(t.diagram);
        t.selected = true;
      }
    }));
  return uniq(diagram);
}

function allDiagrams(features) {
  var diagram = [];
  features.forEach(f => f.targets.forEach(t => {
    diagram = diagram.concat(t.diagram);
    t.selected = true;
  }));
  return uniq(diagram);
}

function clearDiagrams(features) {
  features.forEach(f => f.targets.forEach(t => {
    t.selected = false;
  }));
}

function clickedSquares(features, correct, incorrect, target) {
  var diagram = diagramForTarget(null, null, target, features);
  correct.forEach(target => {
    diagram.push({
      orig: target,
      brush: 'green'
    });
  });
  incorrect.forEach(target => {
    diagram.push({
      orig: target,
      brush: 'red'
    });
  });
  return diagram;
}

module.exports = {
  diagramForTarget: diagramForTarget,
  allDiagrams: allDiagrams,
  clearDiagrams: clearDiagrams,
  clickedSquares: clickedSquares
};

},{"./util/uniq":46}],32:[function(require,module,exports){
module.exports = [
    '2br3k/pp3Pp1/1n2p3/1P2N1pr/2P2qP1/8/1BQ2P1P/4R1K1 w - - 1 0',
    '6R1/5r1k/p6b/1pB1p2q/1P6/5rQP/5P1K/6R1 w - - 1 0',
    '6rk/p1pb1p1p/2pp1P2/2b1n2Q/4PR2/3B4/PPP1K2P/RNB3q1 w - - 1 0',
    'rn3rk1/2qp2pp/p3P3/1p1b4/3b4/3B4/PPP1Q1PP/R1B2R1K w - - 1 0',
    'r2B1bk1/1p5p/2p2p2/p1n5/4P1BP/P1Nb4/KPn3PN/3R3R b - - 0 1',
    '2R3nk/3r2b1/p2pr1Q1/4pN2/1P6/P6P/q7/B4RK1 w - - 1 0',
    '8/8/2N1P3/1P6/4Q3/4b2K/4k3/4q3 w - - 1 0',
    'r1b1k1nr/p5bp/p1pBq1p1/3pP1P1/N4Q2/8/PPP1N2P/R4RK1 w - - 1 0',
    '5rk1/pp2p2p/3p2pb/2pPn2P/2P2q2/2N4P/PP3BR1/R2BK1N1 b - - 0 1',
    '1r2qrk1/p4p1p/bp1p1Qp1/n1ppP3/P1P5/2PB1PN1/6PP/R4RK1 w - - 1 0',
    'r3q1r1/1p2bNkp/p3n3/2PN1B1Q/PP1P1p2/7P/5PP1/6K1 w - - 1 0',
    '3k4/R7/5N2/1p2n3/6p1/P1N2bP1/1r6/5K2 b - - 0 1',
    '7k/1ppq4/1n1p2Q1/1P4Np/1P3p1B/3B4/7P/rn5K w - - 1 0',
    '6r1/Q4p2/4pq1k/3p2Nb/P4P1K/4P3/7P/2R5 b - - 0 1',
    'r3k2r/1Bp2ppp/8/4q1b1/pP1n4/P1KP3P/1BP5/R2Q3R b - - 0 1',
    '7r/pp4Q1/1qp2p1r/5k2/2P4P/1PB5/P4PP1/4R1K1 w - - 1 0',
    '3r2k1/1p3p1p/p1n2qp1/2B5/1P2Q2P/6P1/B2bRP2/6K1 w - - 1 0',
    'r5rk/ppq2p2/2pb1P1B/3n4/3P4/2PB3P/PP1QNP2/1K6 w - - 1 0',
    '6k1/2b3r1/8/6pR/2p3N1/2PbP1PP/1PB2R1K/2r5 w - - 1 0',
    'r2q1k1r/ppp1bB1p/2np4/6N1/3PP1bP/8/PPP5/RNB2RK1 w - - 1 0',
    '2r3k1/p4p2/3Rp2p/1p2P1pK/8/1P4P1/P3Q2P/1q6 b - - 0 1',
    '8/pp2k3/7r/2P1p1p1/4P3/5pq1/2R3N1/1R3BK1 b - - 0 1',
    '4r2r/5k2/2p2P1p/p2pP1p1/3P2Q1/6PB/1n5P/6K1 w - - 1 0',
    '2b1rqk1/r1p2pp1/pp4n1/3Np1Q1/4P2P/1BP5/PP3P2/2KR2R1 w - - 1 0',
    '4r1k1/pQ3pp1/7p/4q3/4r3/P7/1P2nPPP/2BR1R1K b - - 0 1',
    'r5k1/p1p3bp/1p1p4/2PP2qp/1P6/1Q1bP3/PB3rPP/R2N2RK b - - 0 1',
    '4k3/r2bnn1r/1q2pR1p/p2pPp1B/2pP1N1P/PpP1B3/1P4Q1/5KR1 w - - 1 0',
    'r1b2k2/1p4pp/p4N1r/4Pp2/P3pP1q/4P2P/1P2Q2K/3R2R1 w - - 1 0',
    '2q4r/R7/5p1k/2BpPn2/6Qp/6PN/5P1K/8 w - - 1 0',
    '3r1q1r/1p4k1/1pp2pp1/4p3/4P2R/1nP3PQ/PP3PK1/7R w - - 1 0',
    '3r4/pR2N3/2pkb3/5p2/8/2B5/qP3PPP/4R1K1 w - - 1 0',
    'r1b4r/1k2bppp/p1p1p3/8/Np2nB2/3R4/PPP1BPPP/2KR4 w - - 1 0',
    '6kr/p1Q3pp/3Bbbq1/8/5R2/5P2/PP3P1P/4KB1R w - - 1 0',
    '2q2r1k/5Qp1/4p1P1/3p4/r6b/7R/5BPP/5RK1 w - - 1 0',
    '5r1k/4R3/6pP/r1pQPp2/5P2/2p1PN2/2q5/5K1R w - - 1 0',
    '2r2r2/7k/5pRp/5q2/3p1P2/6QP/P2B1P1K/6R1 w - - 1 0',
    'Q7/2r2rpk/2p4p/7N/3PpN2/1p2P3/1K4R1/5q2 w - - 1 0',
    'r4k2/PR6/1b6/4p1Np/2B2p2/2p5/2K5/8 w - - 1 0',
    'rn3rk1/p5pp/2p5/3Ppb2/2q5/1Q6/PPPB2PP/R3K1NR b - - 0 1',
    'r2qr1k1/1p1n2pp/2b1p3/p2pP1b1/P2P1Np1/3BPR2/1PQB3P/5RK1 w - - 1 0',
    '5r1k/1q4bp/3pB1p1/2pPn1B1/1r6/1p5R/1P2PPQP/R5K1 w - - 1 0',
    'r1n1kbr1/ppq1pN2/2p1Pn1p/2Pp3Q/3P3P/8/PP3P2/R1B1K2R w - - 1 0',
    'r3b3/1p3N1k/n4p2/p2PpP2/n7/6P1/1P1QB1P1/4K3 w - - 1 0',
    '1rb2k2/pp3ppQ/7q/2p1n1N1/2p5/2N5/P3BP1P/K2R4 w - - 1 0',
    'r7/5pk1/2p4p/1p1p4/1qnP4/5QPP/2B1RP1K/8 w - - 1 0',
    '6r1/p6k/Bp3n1r/2pP1P2/P4q1P/2P2Q2/5K2/2R2R2 b - - 0 1',
    '6k1/4pp2/2q3pp/R1p1Pn2/2N2P2/1P4rP/1P3Q1K/8 b - - 0 1',
    '4Q3/1b5r/1p1kp3/5p1r/3p1nq1/P4NP1/1P3PB1/2R3K1 w - - 1 0',
    '2rb3r/3N1pk1/p2pp2p/qp2PB1Q/n2N1P2/6P1/P1P4P/1K1RR3 w - - 1 0',
    'r1b2k1r/2q1b3/p3ppBp/2n3B1/1p6/2N4Q/PPP3PP/2KRR3 w - - 1 0',
    'r1b1rk2/pp1nbNpB/2p1p2p/q2nB3/3P3P/2N1P3/PPQ2PP1/2KR3R w - - 1 0',
    '5r1k/7p/8/4NP2/8/3p2R1/2r3PP/2n1RK2 w - - 1 0',
    '3r4/6kp/1p1r1pN1/5Qq1/6p1/PB4P1/1P3P2/6KR w - - 1 0',
    '6r1/r5PR/2p3R1/2Pk1n2/3p4/1P1NP3/4K3/8 w - - 1 0',
    '3q1r2/p2nr3/1k1NB1pp/1Pp5/5B2/1Q6/P5PP/5RK1 w - - 1 0',
    'Q7/1R5p/2kqr2n/7p/5Pb1/8/P1P2BP1/6K1 w - - 1 0',
    '3r2k1/5p2/2b2Bp1/7p/4p3/5PP1/P3Bq1P/Q3R2K b - - 0 1',
    'r4qk1/2p4p/p1p1N3/2bpQ3/4nP2/8/PPP3PP/5R1K b - - 0 1',
    'r1r3k1/3NQppp/q3p3/8/8/P1B1P1P1/1P1R1PbP/3K4 b - - 0 1',
    '3r4/7p/2RN2k1/4n2q/P2p4/3P2P1/4p1P1/5QK1 w - - 1 0',
    'r1bq1r1k/pp4pp/2pp4/2b2p2/4PN2/1BPP1Q2/PP3PPP/R4RK1 w - - 1 0',
    'r2q4/p2nR1bk/1p1Pb2p/4p2p/3nN3/B2B3P/PP1Q2P1/6K1 w - - 1 0',
    'r2n1rk1/1ppb2pp/1p1p4/3Ppq1n/2B3P1/2P4P/PP1N1P1K/R2Q1RN1 b - - 0 1',
    '1r2r3/1n3Nkp/p2P2p1/3B4/1p5Q/1P5P/6P1/2b4K w - - 1 0',
    'r1b2rk1/pp1p1p1p/2n3pQ/5qB1/8/2P5/P4PPP/4RRK1 w - - 1 0',
    '5rk1/pR4bp/6p1/6B1/5Q2/4P3/q2r1PPP/5RK1 w - - 1 0',
    '6Q1/1q2N1n1/3p3k/3P3p/2P5/3bp1P1/1P4BP/6K1 w - - 1 0',
    'rnbq1rk1/pp2bp1p/4p1p1/2pp2Nn/5P1P/1P1BP3/PBPP2P1/RN1QK2R w - - 1 0',
    '2q2rk1/4r1bp/bpQp2p1/p2Pp3/P3P2P/1NP1B1K1/1P6/R2R4 b - - 0 1',
    '5r1k/pp1n1p1p/5n1Q/3p1pN1/3P4/1P4RP/P1r1qPP1/R5K1 w - - 1 0',
    '4nrk1/rR5p/4pnpQ/4p1N1/2p1N3/6P1/q4P1P/4R1K1 w - - 1 0',
    'r3q2k/p2n1r2/2bP1ppB/b3p2Q/N1Pp4/P5R1/5PPP/R5K1 w - - 1 0',
    '1R1n3k/6pp/2Nr4/P4p2/r7/8/4PPBP/6K1 b - - 0 1',
    'r1b2r1k/p1n3b1/7p/5q2/2BpN1p1/P5P1/1P1Q1NP1/2K1R2R w - - 1 0',
    '3kr3/p1r1bR2/4P2p/1Qp5/3p3p/8/PP4PP/6K1 w - - 1 0',
    '6r1/3p2qk/4P3/1R5p/3b1prP/3P2B1/2P1QP2/6RK b - - 0 1',
    'r5q1/pp1b1kr1/2p2p2/2Q5/2PpB3/1P4NP/P4P2/4RK2 w - - 1 0',
    '7R/r1p1q1pp/3k4/1p1n1Q2/3N4/8/1PP2PPP/2B3K1 w - - 1 0',
    '2q1rb1k/prp3pp/1pn1p3/5p1N/2PP3Q/6R1/PP3PPP/R5K1 w - - 1 0',
    'r1qbr2k/1p2n1pp/3B1n2/2P1Np2/p4N2/PQ4P1/1P3P1P/3RR1K1 w - - 1 0',
    '3rk3/1q4pp/3B1p2/3R4/1pQ5/1Pb5/P4PPP/6K1 w - - 1 0',
    'r4k2/6pp/p1n1p2N/2p5/1q6/6QP/PbP2PP1/1K1R1B2 w - - 1 0',
    '3rr2k/pp1b2b1/4q1pp/2Pp1p2/3B4/1P2QNP1/P6P/R4RK1 w - - 1 0',
    '5Q1R/3qn1p1/p3p1k1/1pp1PpB1/3r3P/5P2/PPP3K1/8 w - - 1 0',
    '2r1r3/p3P1k1/1p1pR1Pp/n2q1P2/8/2p4P/P4Q2/1B3RK1 w - - 1 0',
    'r1b2rk1/2p2ppp/p7/1p6/3P3q/1BP3bP/PP3QP1/RNB1R1K1 w - - 1 0',
    '1R6/4r1pk/pp2N2p/4nP2/2p5/2P3P1/P2P1K2/8 w - - 1 0',
    '1rb2RR1/p1p3p1/2p3k1/5p1p/8/3N1PP1/PP5r/2K5 w - - 1 0',
    'r2r2k1/pp2bppp/2p1p3/4qb1P/8/1BP1BQ2/PP3PP1/2KR3R b - - 0 1',
    '1r4k1/5bp1/pr1P2p1/1np1p3/2B1P2R/2P2PN1/6K1/R7 w - - 1 0',
    '3k4/1R6/3N2n1/p2Pp3/2P1N3/3n2Pp/q6P/5RK1 w - - 1 0',
    '1r1rb3/p1q2pkp/Pnp2np1/4p3/4P3/Q1N1B1PP/2PRBP2/3R2K1 w - - 1 0',
    'r3k3/pbpqb1r1/1p2Q1p1/3pP1B1/3P4/3B4/PPP4P/5RK1 w - - 1 0',
    'r2k1r2/3b2pp/p5p1/2Q1R3/1pB1Pq2/1P6/PKP4P/7R w - - 1 0',
    '3q2r1/4n2k/p1p1rBpp/PpPpPp2/1P3P1Q/2P3R1/7P/1R5K w - - 1 0',
    '5r1k/2p1b1pp/pq1pB3/8/2Q1P3/5pP1/RP3n1P/1R4K1 b - - 0 1',
    '2bqr2k/1r1n2bp/pp1pBp2/2pP1PQ1/P3PN2/1P4P1/1B5P/R3R1K1 w - - 1 0',
    'r1b2rk1/5pb1/p1n1p3/4B3/4N2R/8/1PP1p1PP/5RK1 w - - 1 0',
    '2r2k2/pb4bQ/1p1qr1pR/3p1pB1/3Pp3/2P5/PPB2PP1/1K5R w - - 1 0',
    '4r3/2B4B/2p1b3/ppk5/5R2/P2P3p/1PP5/1K5R w - - 1 0',
    'r5k1/q4ppp/rnR1pb2/1Q1p4/1P1P4/P4N1P/1B3PP1/2R3K1 w - - 1 0',
    'r1brn3/p1q4p/p1p2P1k/2PpPPp1/P7/1Q2B2P/1P6/1K1R1R2 w - - 1 0',
    '5r1k/7p/p2b4/1pNp1p1q/3Pr3/2P2bP1/PP1B3Q/R3R1K1 b - - 0 1',
    '7k/2p3pp/p7/1p1p4/PP2pr2/B1P3qP/4N1B1/R1Qn2K1 b - - 0 1',
    '2r3k1/pp4rp/1q1p2pQ/1N2p1PR/2nNP3/5P2/PPP5/2K4R w - - 1 0',
    '4q1kr/p4p2/1p1QbPp1/2p1P1Np/2P5/7P/PP4P1/3R3K w - - 1 0',
    'R7/3nbpkp/4p1p1/3rP1P1/P2B1Q1P/3q1NK1/8/8 w - - 1 0',
    '5rk1/4Rp1p/1q1pBQp1/5r2/1p6/1P4P1/2n2P2/3R2K1 w - - 1 0',
    '2Q5/pp2rk1p/3p2pq/2bP1r2/5RR1/1P2P3/PB3P1P/7K w - - 1 0',
    '3Q4/4r1pp/b6k/6R1/8/1qBn1N2/1P4PP/6KR w - - 1 0',
    '3r2qk/p2Q3p/1p3R2/2pPp3/1nb5/6N1/PB4PP/1B4K1 w - - 1 0',
    '5b2/1p3rpk/p1b3Rp/4B1RQ/3P1p1P/7q/5P2/6K1 w - - 1 0',
    '4r3/2q1rpk1/p3bN1p/2p3p1/4QP2/2N4P/PP4P1/5RK1 w - - 1 0',
    '3Rr2k/pp4pb/2p4p/2P1n3/1P1Q3P/4r1q1/PB4B1/5RK1 b - - 0 1',
    'r1b3kr/3pR1p1/ppq4p/5P2/4Q3/B7/P5PP/5RK1 w - - 1 0',
    '1r6/1p3K1k/p3N3/P6n/6RP/2P5/8/8 w - - 1 0',
    '4k3/2q2p2/4p3/3bP1Q1/p6R/r6P/6PK/5B2 w - - 1 0',
    '1Q6/1P2pk1p/5ppB/3q4/P5PK/7P/5P2/6r1 b - - 0 1',
    'q2br1k1/1b4pp/3Bp3/p6n/1p3R2/3B1N2/PP2QPPP/6K1 w - - 1 0',
    'rq3rk1/1p1bpp1p/3p2pQ/p2N3n/2BnP1P1/5P2/PPP5/2KR3R w - - 1 0',
    'R7/5pkp/3N2p1/2r3Pn/5r2/1P6/P1P5/2KR4 w - - 1 0',
    '4kq1Q/p2b3p/1pR5/3B2p1/5Pr1/8/PP5P/7K w - - 1 0',
    '4Q3/r4ppk/3p3p/4pPbB/2P1P3/1q5P/6P1/3R3K w - - 1 0',
    '4r1k1/Q4bpp/p7/5N2/1P3qn1/2P5/P1B3PP/R5K1 b - - 0 1',
    '6k1/5p1p/2Q1p1p1/5n1r/N7/1B3P1P/1PP3PK/4q3 b - - 0 1',
    '1r3k2/5p1p/1qbRp3/2r1Pp2/ppB4Q/1P6/P1P4P/1K1R4 w - - 1 0',
    '8/2Q1R1bk/3r3p/p2N1p1P/P2P4/1p3Pq1/1P4P1/1K6 w - - 1 0',
    '8/k1p1q3/Pp5Q/4p3/2P1P2p/3P4/4K3/8 w - - 1 0',
    '5r1k/r2b1p1p/p4Pp1/1p2R3/3qBQ2/P7/6PP/2R4K w - - 1 0',
    '8/8/2N5/8/8/p7/2K5/k7 w - - 1 0',
    '3r3k/1p3Rpp/p2nn3/3N4/8/1PB1PQ1P/q4PP1/6K1 w - - 1 0',
    '3q2rn/pp3rBk/1npp1p2/5P2/2PPP1RP/2P2B2/P5Q1/6RK w - - 1 0',
    '8/3n2pp/2qBkp2/ppPpp1P1/1P2P3/1Q6/P4PP1/6K1 w - - 1 0',
    '4r3/2p5/2p1q1kp/p1r1p1pN/P5P1/1P3P2/4Q3/3RB1K1 w - - 1 0',
    '3r1kr1/8/p2q2p1/1p2R3/1Q6/8/PPP5/1K4R1 w - - 1 0',
    '4r2k/2pb1R2/2p4P/3pr1N1/1p6/7P/P1P5/2K4R w - - 1 0',
    'r4k1r/2pQ1pp1/p4q1p/2N3N1/1p3P2/8/PP3PPP/4R1K1 w - - 1 0',
    '6rk/1r2pR1p/3pP1pB/2p1p3/P6Q/P1q3P1/7P/5BK1 w - - 1 0',
    '3r3k/1b2b1pp/3pp3/p3n1P1/1pPqP2P/1P2N2R/P1QB1r2/2KR3B b - - 0 1',
    '8/2p3N1/6p1/5PB1/pp2Rn2/7k/P1p2K1P/3r4 w - - 1 0',
    '8/p3Q2p/6pk/1N6/4nP2/7P/P5PK/3rr3 w - - 1 0',
    '5rkr/1p2Qpbp/pq1P4/2nB4/5p2/2N5/PPP4P/1K1RR3 w - - 1 0',
    '8/1p6/8/2P3pk/3R2n1/7p/2r5/4R2K b - - 0 1',
    '2r5/1p5p/3p4/pP1P1R2/1n2B1k1/8/1P3KPP/8 w - - 1 0'
];

},{}],33:[function(require,module,exports){
module.exports = [
"r1bk3r/pppq1ppp/5n2/4N1N1/2Bp4/Bn6/P4PPP/4R1K1 w - - 0 1",
"3r1rk1/ppqn3p/1npb1P2/5B2/2P5/2N3B1/PP2Q1PP/R5K1 w - - 0 1",
"r3rk2/6b1/q2pQBp1/1NpP4/1n2PP2/nP6/P3N1K1/R6R w - - 0 1",
"r4n1k/ppBnN1p1/2p1p3/6Np/q2bP1b1/3B4/PPP3PP/R4Q1K w - - 0 1",
"r3QnR1/1bk5/pp5q/2b5/2p1P3/P7/1BB4P/3R3K w - - 0 1",
"q1r2b1k/rb4np/1p2p2N/pB1n4/6Q1/1P2P3/PB3PPP/2RR2K1 w - - 0 1",
"k2n1q1r/p1pB2p1/P4pP1/1Qp1p3/8/2P1BbN1/P7/2KR4 w - - 0 1",
"r2qk2r/pb4pp/1n2Pb2/2B2Q2/p1p5/2P5/2B2PPP/RN2R1K1 w - - 0 1",
"1Q1R4/5k2/6pp/2N1bp2/1Bn5/2P2P1P/1r3PK1/8 b - - 0 1",
"rnR5/p3p1kp/4p1pn/bpP5/5BP1/5N1P/2P2P2/2K5 w - - 0 1",
"r6r/1p2pp1k/p1b2q1p/4pP2/6QR/3B2P1/P1P2K2/7R w - - 0 1",
"2k4r/ppp2p2/2b2B2/7p/6pP/2P1q1bP/PP3N2/R4QK1 b - - 0 1",
"1r2k1r1/pbppnp1p/1b3P2/8/Q7/B1PB1q2/P4PPP/3R2K1 w - - 0 1",
"r4r1k/1bpq1p1n/p1np4/1p1Bb1BQ/P7/6R1/1P3PPP/1N2R1K1 w - - 0 1",
"r4rk1/p4ppp/Pp4n1/4BN2/1bq5/7Q/2P2PPP/3RR1K1 w - - 0 1",
"r3rknQ/1p1R1pb1/p3pqBB/2p5/8/6P1/PPP2P1P/4R1K1 w - - 0 1",
"3k1r1r/pb3p2/1p4p1/1B2B3/3qn3/6QP/P4RP1/2R3K1 w - - 0 1",
"1b4rk/4R1pp/p1b4r/2PB4/Pp1Q4/6Pq/1P3P1P/4RNK1 w - - 0 1",
"r1b1r1k1/ppp1np1p/2np2pQ/5qN1/1bP5/6P1/PP2PPBP/R1B2RK1 w - - 0 1",
"5qrk/p3b1rp/4P2Q/5P2/1pp5/5PR1/P6P/B6K w - - 0 1",
"r2q2nr/5p1p/p1Bp3b/1p1NkP2/3pP1p1/2PP2P1/PP5P/R1Bb1RK1 w - - 0 1",
"2r3k1/1p1r1p1p/pnb1pB2/5p2/1bP5/1P2QP2/P1B3PP/4RK2 w - - 0 1",
"2r5/2p2k1p/pqp1RB2/2r5/PbQ2N2/1P3PP1/2P3P1/4R2K w - - 0 1",
"7r/pRpk4/2np2p1/5b2/2P4q/2b1BBN1/P4PP1/3Q1K2 b - - 0 1",
"R4rk1/4r1p1/1q2p1Qp/1pb5/1n5R/5NB1/1P3PPP/6K1 w - - 0 1",
"2r4k/ppqbpQ1p/3p1bpB/8/8/1Nr2P2/PPP3P1/2KR3R w - - 0 1",
"2r1k2r/1p2pp1p/1p2b1pQ/4B3/3n4/2qB4/P1P2PPP/2KRR3 b - - 0 1",
"r1b2rk1/p3Rp1p/3q2pQ/2pp2B1/3b4/3B4/PPP2PPP/4R1K1 w - - 0 1",
"7k/1b1n1q1p/1p1p4/pP2pP1N/P6b/3pB2P/8/1R1Q2K1 b - - 0 1",
"1r1kr3/Nbppn1pp/1b6/8/6Q1/3B1P2/Pq3P1P/3RR1K1 w - - 0 1",
"r1bqr3/ppp1B1kp/1b4p1/n2B4/3PQ1P1/2P5/P4P2/RN4K1 w - - 0 1",
"r1nk3r/2b2ppp/p3bq2/3pN3/Q2P4/B1NB4/P4PPP/4R1K1 w - - 0 1",
"2r1r1k1/p2n1p1p/5pp1/qQ1P1b2/N7/5N2/PP3RPP/3K1B1R b - - 0 1",
"r1nk3r/2b2ppp/p3b3/3NN3/Q2P3q/B2B4/P4PPP/4R1K1 w - - 0 1",
"r1b1nn1k/p3p1b1/1qp1B1p1/1p1p4/3P3N/2N1B3/PPP3PP/R2Q1K2 w - - 0 1",
"r1bnk2r/pppp1ppp/1b4q1/4P3/2B1N3/Q1Pp1N2/P4PPP/R3R1K1 w - - 0 1",
"6k1/B2N1pp1/p6p/P3N1r1/4nb2/8/2R3B1/6K1 w - - 0 1",
"r1b3nr/ppp1kB1p/3p4/8/3PPBnb/1Q3p2/PPP2q2/RN4RK b - - 0 1",
"r2b2Q1/1bq5/pp1k2p1/2p1n1B1/P3P3/2N5/1PP3PP/5R1K w - - 0 1",
"1R4Q1/3nr1pp/3p1k2/5Bb1/4P3/2q1B1P1/5P1P/6K1 w - - 0 1",
"1r4kr/Q1bRBppp/2b5/8/2B1q3/6P1/P4P1P/5RK1 w - - 0 1",
"6k1/1p5p/3P3r/4p3/2N1PBpb/PPr5/3R1P1K/5b1R b - - 0 1",
"5rk1/1p1r2pp/p2p3q/3P2b1/PP1pP3/5Pp1/4B1P1/2RRQNK1 b - - 0 1",
"2k4r/ppp5/4bqp1/3p2Q1/6n1/2NB3P/PPP2bP1/R1B2R1K b - - 0 1",
"5r1k/3q3p/p2B1npb/P2np3/4N3/2N2b2/5PPP/R3QRK1 b - - 0 1",
"4r3/p4pkp/q7/3Bbb2/P2P1ppP/2N3n1/1PP2KPR/R1BQ4 b - - 0 1",
"3r1q1k/6bp/p1p5/1p2B1Q1/P1B5/3P4/5PPP/4R1K1 w - - 0 1",
"r4kr1/pbNn1q1p/1p6/2p2BPQ/5B2/8/P6P/b4RK1 w - - 0 1",
"r3r2k/4b2B/pn3p2/q1p4R/6b1/4P3/PPQ1NPPP/5RK1 w - - 0 1",
"rnbk1b1r/ppqpnQ1p/4p1p1/2p1N1B1/4N3/8/PPP2PPP/R3KB1R w - - 0 1",
"6rk/p1pb1p1p/2pp1P2/2b1n2Q/4PR2/3B4/PPP1K2P/RNB3q1 w - - 0 1",
"rn3rk1/2qp2pp/p3P3/1p1b4/3b4/3B4/PPP1Q1PP/R1B2R1K w - - 0 1",
"r2B1bk1/1p5p/2p2p2/p1n5/4P1BP/P1Nb4/KPn3PN/3R3R b - - 0 1",
"6k1/2b3r1/8/6pR/2p3N1/2PbP1PP/1PB2R1K/2r5 w - - 0 1",
"r5k1/p1p3bp/1p1p4/2PP2qp/1P6/1Q1bP3/PB3rPP/R2N2RK b - - 0 1",
"3rr2k/pp1b2b1/4q1pp/2Pp1p2/3B4/1P2QNP1/P6P/R4RK1 w - - 0 1",
"2bqr2k/1r1n2bp/pp1pBp2/2pP1PQ1/P3PN2/1P4P1/1B5P/R3R1K1 w - - 0 1",
"q2br1k1/1b4pp/3Bp3/p6n/1p3R2/3B1N2/PP2QPPP/6K1 w - - 0 1",
];

},{}],34:[function(require,module,exports){
module.exports = [
"r1bk3r/pppq1ppp/5n2/4N1N1/2Bp4/Bn6/P4PPP/4R1K1 w - - 0 1",
"2r2bk1/pb3ppp/1p6/n7/q2P4/P1P1R2Q/B2B1PPP/R5K1 w - - 0 1",
"k1n3rr/Pp3p2/3q4/3N4/3Pp2p/1Q2P1p1/3B1PP1/R4RK1 w - - 0 1",
"3r1rk1/ppqn3p/1npb1P2/5B2/2P5/2N3B1/PP2Q1PP/R5K1 w - - 0 1",
"N1bk4/pp1p1Qpp/8/2b5/3n3q/8/PPP2RPP/RNB1rBK1 b - - 0 1",
"r3br1k/pp5p/4B1p1/4NpP1/P2Pn3/q1PQ3R/7P/3R2K1 w - - 0 1",
"8/4R1pk/p5p1/8/1pB1n1b1/1P2b1P1/P4r1P/5R1K b - - 0 1",
"r1bk1r2/pp1n2pp/3NQ3/1P6/8/2n2PB1/q1B3PP/3R1RK1 w - - 0 1",
"rn3rk1/pp3p2/2b1pnp1/4N3/3q4/P1NB3R/1P1Q1PPP/R5K1 w - - 0 1",
"3qrk2/p1r2pp1/1p2pb2/nP1bN2Q/3PN3/P6R/5PPP/R5K1 w - - 0 1",
"r4n1k/ppBnN1p1/2p1p3/6Np/q2bP1b1/3B4/PPP3PP/R4Q1K w - - 0 1",
"5k1r/4npp1/p3p2p/3nP2P/3P3Q/3N4/qB2KPP1/2R5 w - - 0 1",
"r3r1k1/1b6/p1np1ppQ/4n3/4P3/PNB4R/2P1BK1P/1q6 w - - 0 1",
"r3q1k1/5p2/3P2pQ/Ppp5/1pnbN2R/8/1P4PP/5R1K w - - 0 1",
"2r2b1k/p2Q3p/b1n2PpP/2p5/3r1BN1/3q2P1/P4PB1/R3R1K1 w - - 0 1",
"q1r2b1k/rb4np/1p2p2N/pB1n4/6Q1/1P2P3/PB3PPP/2RR2K1 w - - 0 1",
"2r1k2r/pR2p1bp/2n1P1p1/8/2QP4/q2b1N2/P2B1PPP/4K2R w - - 0 1",
"3br3/pp2r3/2p4k/4N1pp/3PP3/P1N5/1P2K3/6RR w - - 0 1",
"2rr1k2/pb4p1/1p1qpp2/4R2Q/3n4/P1N5/1P3PPP/1B2R1K1 w - - 0 1",
"4q1rk/pb2bpnp/2r4Q/1p1p1pP1/4NP2/1P3R2/PBn4P/RB4K1 w - - 0 1",
"rnb2b1r/p3kBp1/3pNn1p/2pQN3/1p2PP2/4B3/Pq5P/4K3 w - - 0 1",
"r5nr/6Rp/p1NNkp2/1p3b2/2p5/5K2/PP2P3/3R4 w - - 0 1",
"r1b1kb1r/pp1n1pp1/1qp1p2p/6B1/2PPQ3/3B1N2/P4PPP/R4RK1 w - - 0 1",
"rn3k1r/pbpp1Bbp/1p4pN/4P1B1/3n4/2q3Q1/PPP2PPP/2KR3R w - - 0 1",
"r1bqkb2/6p1/p1p4p/1p1N4/8/1B3Q2/PP3PPP/3R2K1 w - - 0 1",
"rnbq1bnr/pp1p1p1p/3pk3/3NP1p1/5p2/5N2/PPP1Q1PP/R1B1KB1R w - - 0 1",
"r3rk2/5pn1/pb1nq1pR/1p2p1P1/2p1P3/2P2QN1/PPBB1P2/2K4R w - - 0 1",
"r1bq3r/ppp1nQ2/2kp1N2/6N1/3bP3/8/P2n1PPP/1R3RK1 w - - 0 1",
"4r3/pbpn2n1/1p1prp1k/8/2PP2PB/P5N1/2B2R1P/R5K1 w - - 0 1",
"rq3rk1/3n1pp1/pb4n1/3N2P1/1pB1QP2/4B3/PP6/2KR3R w - - 0 1",
"4b3/k1r1q2p/p3p3/3pQ3/2pN4/1R6/P4PPP/1R4K1 w - - 0 1",
"2b2r1k/1p2R3/2n2r1p/p1P1N1p1/2B3P1/P6P/1P3R2/6K1 w - - 0 1",
"1qr2bk1/pb3pp1/1pn3np/3N2NQ/8/P7/BP3PPP/2B1R1K1 w - - 0 1",
"1k5r/pP3ppp/3p2b1/1BN1n3/1Q2P3/P1B5/KP3P1P/7q w - - 0 1",
"5kqQ/1b1r2p1/ppn1p1Bp/2b5/2P2rP1/P4N2/1B5P/4RR1K w - - 0 1",
"3rnr1k/p1q1b1pB/1pb1p2p/2p1P3/2P2N2/PP4P1/1BQ4P/4RRK1 w - - 0 1",
"r2qr2k/pp1b3p/2nQ4/2pB1p1P/3n1PpR/2NP2P1/PPP5/2K1R1N1 w - - 0 1",
"r2q1r1k/pppb2pp/2np4/5p2/5N2/1B1Q4/PPP1RPPP/R5K1 w - - 0 1",
"r1b1qr2/pp2n1k1/3pp1pR/2p2pQ1/4PN2/2NP2P1/PP1K1PB1/n7 w - - 0 1",
"3r1r1k/1p3p1p/p2p4/4n1NN/6bQ/1BPq4/P3p1PP/1R5K w - - 0 1",
"1r3r1k/6p1/p6p/2bpNBP1/1p2n3/1P5Q/PBP1q2P/1K5R w - - 0 1",
"r4rk1/4bp2/1Bppq1p1/4p1n1/2P1Pn2/3P2N1/P2Q1PBK/1R5R b - - 0 1",
"r2q3r/ppp5/2n4p/4Pbk1/2BP1Npb/P2QB3/1PP3P1/R5K1 w - - 0 1",
"2r2bk1/2qn1ppp/pn1p4/5N2/N3r3/1Q6/5PPP/BR3BK1 w - - 0 1",
"r5kr/pppN1pp1/1bn1R3/1q1N2Bp/3p2Q1/8/PPP2PPP/R5K1 w - - 0 1",
"r3n1k1/pb5p/4N1p1/2pr4/q7/3B3P/1P1Q1PP1/2B1R1K1 w - - 0 1",
"1k1r2r1/ppq4p/4Q3/1B2np2/2P1p3/P7/2P1RPPR/2B1K3 b - - 0 1",
"rn4nr/pppq2bk/7p/5b1P/4NBQ1/3B4/PPP3P1/R3K2R w - - 0 1",
"r1br4/1p2bpk1/p1nppn1p/5P2/4P2B/qNNB3R/P1PQ2PP/7K w - - 0 1",
"2r5/2p2k1p/pqp1RB2/2r5/PbQ2N2/1P3PP1/2P3P1/4R2K w - - 0 1",
"6k1/5p2/R5p1/P6n/8/5PPp/2r3rP/R4N1K b - - 0 1",
"r3kr2/6Qp/1Pb2p2/pB3R2/3pq2B/4n3/1P4PP/4R1K1 w - - 0 1",
"r1r3k1/1bq2pbR/p5p1/1pnpp1B1/3NP3/3B1P2/PPPQ4/1K5R w - - 0 1",
"5Q2/1p3p1N/2p3p1/5b1k/2P3n1/P4RP1/3q2rP/5R1K w - - 0 1",
"rnb1k2r/ppppbN1p/5n2/7Q/4P3/2N5/PPPP3P/R1B1KB1q w - - 0 1",
"r1b2rk1/1p4qp/p5pQ/2nN1p2/2B2P2/8/PPP3PP/2K1R3 w - - 0 1",
"4r1k1/pb4pp/1p2p3/4Pp2/1P3N2/P2Qn2P/3n1qPK/RBB1R3 b - - 0 1",
"3q1r2/2rbnp2/p3pp1k/1p1p2N1/3P2Q1/P3P3/1P3PPP/5RK1 w - - 0 1",
"q5k1/5rb1/r6p/1Np1n1p1/3p1Pn1/1N4P1/PP5P/R1BQRK2 b - - 0 1",
"rn1q3r/pp2kppp/3Np3/2b1n3/3N2Q1/3B4/PP4PP/R1B2RK1 w - - 0 1",
"rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w - - 0 1",
"4r1k1/3r1p1p/bqp1n3/p2p1NP1/Pn1Q1b2/7P/1PP3B1/R2NR2K w - - 0 1",
"7r/6kr/p5p1/1pNb1pq1/PPpPp3/4P1b1/R3R1Q1/2B2BK1 b - - 0 1",
"rnbkn2r/pppp1Qpp/5b2/3NN3/3Pp3/8/PPP1KP1P/R1B4q w - - 0 1",
"r7/6R1/ppkqrn1B/2pp3p/P6n/2N5/8/1Q1R1K2 w - - 0 1",
"r1b2rk1/1p3ppp/p2p4/3NnQ2/2B1R3/8/PqP3PP/5RK1 w - - 0 1",
"r4r1k/2qb3p/p2p1p2/1pnPN3/2p1Pn2/2P1N3/PPB1QPR1/6RK w - - 0 1",
"rnbq1b1r/pp4kp/5np1/4p2Q/2BN1R2/4B3/PPPN2PP/R5K1 w - - 0 1",
"1nbk1b1r/1r6/p2P2pp/1B2PpN1/2p2P2/2P1B3/7P/R3K2R w - - 0 1",
"1r1kr3/Nbppn1pp/1b6/8/6Q1/3B1P2/Pq3P1P/3RR1K1 w - - 0 1",
"4k1r1/5p2/p1q5/1p2p2p/6n1/P4bQ1/1P4RP/3NR1BK b - - 0 1",
"5nk1/2N2p2/2b2Qp1/p3PpNp/2qP3P/6P1/5P1K/8 w - - 0 1",
"1k5r/pp1Q1pp1/2p4r/b4Pn1/3NPp2/2P2P2/1q4B1/1R2R1K1 b - - 0 1",
"6rk/5p2/2p1p2p/2PpP1q1/3PnQn1/8/4P2P/1N2BR1K b - - 0 1",
"4rk1r/p2b1pp1/1q5p/3pR1n1/3N1p2/1P1Q1P2/PBP3PK/4R3 w - - 0 1",
"r1bq1rk1/pp1nb1pp/5p2/6B1/3pQ3/3BPN2/PP3PPP/R4RK1 w - - 0 1",
"rn1r4/pp2p1b1/5kpp/q1PQ1b2/6n1/2N2N2/PPP3PP/R1B2RK1 w - - 0 1",
"k7/p1Qnr2p/b1pB1p2/3p3q/N1p5/3P3P/PPP3P1/6K1 w - - 0 1",
"3r4/4RRpk/5n1N/8/p1p2qPP/P1Qp1P2/1P4K1/3b4 w - - 0 1",
"qr6/1b1p1krQ/p2Pp1p1/4PP2/1p1B1n2/3B4/PP3K1P/2R2R2 w - - 0 1",
"r1nk3r/2b2ppp/p3bq2/3pN3/Q2P4/B1NB4/P4PPP/4R1K1 w - - 0 1",
"4r2k/4Q1bp/4B1p1/1q2n3/4pN2/P1B3P1/4pP1P/4R1K1 w - - 0 1",
"4r1k1/5ppp/p2p4/4r3/1pNn4/1P6/1PPK2PP/R3R3 b - - 0 1",
"r1nk3r/2b2ppp/p3b3/3NN3/Q2P3q/B2B4/P4PPP/4R1K1 w - - 0 1",
"r1b1k1nr/p2p1ppp/n2B4/1p1NPN1P/6P1/3P1Q2/P1P1K3/q5b1 w - - 0 1",
"2r1rk2/1b2b1p1/p1q2nP1/1p2Q3/4P3/P1N1B3/1PP1B2R/2K4R w - - 0 1",
"4r1k1/pR3pp1/7p/3n1b1N/2pP4/2P2PQ1/3B1KPP/q7 b - - 0 1",
"2R1R1nk/1p4rp/p1n5/3N2p1/1P6/2P5/P6P/2K5 w - - 0 1",
"r1b1r1kq/pppnpp1p/1n4pB/8/4N2P/1BP5/PP2QPP1/R3K2R w - - 0 1",
"rnb2rk1/ppp2qb1/6pQ/2pN1p2/8/1P3BP1/PB2PP1P/R4RK1 w - - 0 1",
"r2qkb1r/2p1nppp/p2p4/np1NN3/4P3/1BP5/PP1P1PPP/R1B1K2R w - - 0 1",
"r6r/1q1nbkp1/pn2p2p/1p1pP1P1/3P1N1P/1P1Q1P2/P2B1K2/R6R w - - 0 1",
"3k4/1pp3b1/4b2p/1p3qp1/3Pn3/2P1RN2/r5P1/1Q2R1K1 b - - 0 1",
"rn3k2/pR2b3/4p1Q1/2q1N2P/3R2P1/3K4/P3Br2/8 w - - 0 1",
"2r1r3/pp1nbN2/4p3/q7/P1pP2nk/2P2P2/1PQ5/R3R1K1 w - - 0 1",
"6k1/5p2/p5n1/8/1p1p2P1/1Pb2B1r/P3KPN1/2RQ3q b - - 0 1",
"r1bqr1k1/ppp2pp1/3p4/4n1NQ/2B1PN2/8/P4PPP/b4RK1 w - - 0 1",
"1r2q2k/4N2p/3p1Pp1/2p1n1P1/2P5/p2P2KQ/P3R3/8 w - - 0 1",
"r5rk/pp2qb1p/2p2pn1/2bp4/3pP1Q1/1B1P1N1R/PPP3PP/R1B3K1 w - - 0 1",
"rnbq1bkr/pp3p1p/2p3pQ/3N2N1/2B2p2/8/PPPP2PP/R1B1R1K1 w - - 0 1",
"2r2n1k/2q3pp/p2p1b2/2nB1P2/1p1N4/8/PPP4Q/2K3RR w - - 0 1",
"r1q5/2p2k2/p4Bp1/2Nb1N2/p6Q/7P/nn3PP1/R5K1 w - - 0 1",
"rn2kb1r/1pQbpppp/1p6/qp1N4/6n1/8/PPP3PP/2KR2NR w - - 0 1",
"2r1k3/3n1p2/6p1/1p1Qb3/1B2N1q1/2P1p3/P4PP1/2KR4 w - - 0 1",
"r1b1r3/qp1n1pk1/2pp2p1/p3n3/N1PNP1P1/1P3P2/P6Q/1K1R1B1R w - - 0 1",
"5rk1/2pb1ppp/p2r4/1p1Pp3/4Pn1q/1B1PNP2/PP1Q1P1P/R5RK b - - 0 1",
"3nbr2/4q2p/r3pRpk/p2pQRN1/1ppP2p1/2P5/PPB4P/6K1 w - - 0 1",
"r1bnrn2/ppp1k2p/4p3/3PNp1P/5Q2/3B2R1/PPP2PP1/2K1R3 w - - 0 1",
"7k/p5b1/1p4Bp/2q1p1p1/1P1n1r2/P2Q2N1/6P1/3R2K1 b - - 0 1",
"r1bq1k1r/pp2R1pp/2pp1p2/1n1N4/8/3P1Q2/PPP2PPP/R1B3K1 w - - 0 1",
"r1bn1b2/ppk1n2r/2p3pp/5p2/N1PNpPP1/2B1P3/PP2B2P/2KR2R1 w - - 0 1",
"2rq2k1/3bb2p/n2p2pQ/p2Pp3/2P1N1P1/1P5P/6B1/2B2R1K w - - 0 1",
"r6k/pp4pp/1b1P4/8/1n4Q1/2N1RP2/PPq3p1/1RB1K3 b - - 0 1",
"rnb2b1r/ppp1n1kp/3p1q2/7Q/4PB2/2N5/PPP3PP/R4RK1 w - - 0 1",
"r2k2nr/pp1b1Q1p/2n4b/3N4/3q4/3P4/PPP3PP/4RR1K w - - 0 1",
"5r1k/3q3p/p2B1npb/P2np3/4N3/2N2b2/5PPP/R3QRK1 b - - 0 1",
"4r3/p4pkp/q7/3Bbb2/P2P1ppP/2N3n1/1PP2KPR/R1BQ4 b - - 0 1",
"6k1/6p1/3r1n1p/p4p1n/P1N4P/2N5/Q2RK3/7q b - - 0 1",
"8/8/2K2b2/2N2k2/1p4R1/1B3n1P/3r1P2/8 w - - 0 1",
"2q2r2/5rk1/4pNpp/p2pPn2/P1pP2QP/2P2R2/2B3P1/6K1 w - - 0 1",
"5kr1/pp4p1/3b1rb1/2Bp2NQ/1q6/8/PP3PPP/R3R1K1 w - - 0 1",
"r1b2r2/pp3Npk/6np/8/2q1N3/4Q3/PPP2RPP/6K1 w - - 0 1",
"r2q1rk1/p4p1p/3p1Q2/2n3B1/B2R4/8/PP3PPP/5bK1 w - - 0 1",
"3q2r1/p2b1k2/1pnBp1N1/3p1pQP/6P1/5R2/2r2P2/4RK2 w - - 0 1",
"3rnn2/p1r2pkp/1p2pN2/2p1P3/5Q1N/2P3P1/PP2qPK1/R6R w - - 0 1",
"r1b2rk1/pp2b1pp/q3pn2/3nN1N1/3p4/P2Q4/1P3PPP/RBB1R1K1 w - - 0 1",
"qr3b1r/Q5pp/3p4/1kp5/2Nn1B2/Pp6/1P3PPP/2R1R1K1 w - - 0 1",
"r2qr1k1/1p3pP1/p2p1np1/2pPp1B1/2PnP1b1/2N2p2/PP1Q4/2KR1BNR w - - 0 1",
"6rk/p3p2p/1p2Pp2/2p2P2/2P1nBr1/1P6/P6P/3R1R1K b - - 0 1",
"rk3q1r/pbp4p/1p3P2/2p1N3/3p2Q1/3P4/PPP3PP/R3R1K1 w - - 0 1",
"3q1r2/pb3pp1/1p6/3pP1Nk/2r2Q2/8/Pn3PP1/3RR1K1 w - - 0 1",
"r7/3bb1kp/q4p1N/1pnPp1np/2p4Q/2P5/1PB3P1/2B2RK1 w - - 0 1",
"1r1qrbk1/3b3p/p2p1pp1/3NnP2/3N4/1Q4BP/PP4P1/1R2R2K w - - 0 1",
"r2r2k1/1q4p1/ppb3p1/2bNp3/P1Q5/1N5R/1P4BP/n6K w - - 0 1",
"1b2r1k1/3n2p1/p3p2p/1p3r2/3PNp1q/3BnP1P/PP1BQP1K/R6R b - - 0 1",
"6rk/1pqbbp1p/p3p2Q/6R1/4N1nP/3B4/PPP5/2KR4 w - - 0 1",
"r3r1n1/pp3pk1/2q2p1p/P2NP3/2p1QP2/8/1P5P/1B1R3K w - - 0 1",
"rnbk1b1r/ppqpnQ1p/4p1p1/2p1N1B1/4N3/8/PPP2PPP/R3KB1R w - - 0 1",
"2br3k/pp3Pp1/1n2p3/1P2N1pr/2P2qP1/8/1BQ2P1P/4R1K1 w - - 0 1",
"5rk1/pp2p2p/3p2pb/2pPn2P/2P2q2/2N4P/PP3BR1/R2BK1N1 b - - 0 1",
"r3q1r1/1p2bNkp/p3n3/2PN1B1Q/PP1P1p2/7P/5PP1/6K1 w - - 0 1",
"r5rk/ppq2p2/2pb1P1B/3n4/3P4/2PB3P/PP1QNP2/1K6 w - - 0 1",
"2b1rqk1/r1p2pp1/pp4n1/3Np1Q1/4P2P/1BP5/PP3P2/2KR2R1 w - - 0 1",
"r1b4r/1k2bppp/p1p1p3/8/Np2nB2/3R4/PPP1BPPP/2KR4 w - - 0 1",
"r2qr1k1/1p1n2pp/2b1p3/p2pP1b1/P2P1Np1/3BPR2/1PQB3P/5RK1 w - - 0 1",
"2rb3r/3N1pk1/p2pp2p/qp2PB1Q/n2N1P2/6P1/P1P4P/1K1RR3 w - - 0 1",
"r1b2k1r/2q1b3/p3ppBp/2n3B1/1p6/2N4Q/PPP3PP/2KRR3 w - - 0 1",
"r1b1rk2/pp1nbNpB/2p1p2p/q2nB3/3P3P/2N1P3/PPQ2PP1/2KR3R w - - 0 1",
"r1bq1r1k/pp4pp/2pp4/2b2p2/4PN2/1BPP1Q2/PP3PPP/R4RK1 w - - 0 1",
"r2q4/p2nR1bk/1p1Pb2p/4p2p/3nN3/B2B3P/PP1Q2P1/6K1 w - - 0 1",
"5r1k/pp1n1p1p/5n1Q/3p1pN1/3P4/1P4RP/P1r1qPP1/R5K1 w - - 0 1",
"4nrk1/rR5p/4pnpQ/4p1N1/2p1N3/6P1/q4P1P/4R1K1 w - - 0 1",
"7R/r1p1q1pp/3k4/1p1n1Q2/3N4/8/1PP2PPP/2B3K1 w - - 0 1",
"r1qbr2k/1p2n1pp/3B1n2/2P1Np2/p4N2/PQ4P1/1P3P1P/3RR1K1 w - - 0 1",
"1r1rb3/p1q2pkp/Pnp2np1/4p3/4P3/Q1N1B1PP/2PRBP2/3R2K1 w - - 0 1",
"4r3/2q1rpk1/p3bN1p/2p3p1/4QP2/2N4P/PP4P1/5RK1 w - - 0 1",
"rq3rk1/1p1bpp1p/3p2pQ/p2N3n/2BnP1P1/5P2/PPP5/2KR3R w - - 0 1",
"4r1k1/Q4bpp/p7/5N2/1P3qn1/2P5/P1B3PP/R5K1 b - - 0 1",
"4r3/2p5/2p1q1kp/p1r1p1pN/P5P1/1P3P2/4Q3/3RB1K1 w - - 0 1",
"3r3k/1b2b1pp/3pp3/p3n1P1/1pPqP2P/1P2N2R/P1QB1r2/2KR3B b - - 0 1",
];

},{}],35:[function(require,module,exports){
module.exports = [
"r2q1rk1/ppp1n1p1/1b1p1p2/1B1N2BQ/3pP3/2P3P1/PP3P2/R5K1 w - - 0 1",
"3r1rk1/ppqn3p/1npb1P2/5B2/2P5/2N3B1/PP2Q1PP/R5K1 w - - 0 1",
"2bq1k1r/r5pp/p2b1Pn1/1p1Q4/3P4/1B6/PP3PPP/2R1R1K1 w - - 0 1",
"2r1k3/2P3R1/3P2K1/6N1/8/8/8/3r4 w - - 0 1",
"1r1b1n2/1pk3p1/4P2p/3pP3/3N4/1p2B3/6PP/R5K1 w - - 0 1",
"r1b2k1r/ppp1bppp/8/1B1Q4/5q2/2P5/PPP2PPP/R3R1K1 w - - 0 1",
"5qrk/p3b1rp/4P2Q/5P2/1pp5/5PR1/P6P/B6K w - - 0 1",
"2rnk3/pq3p2/3P1Q1R/1p6/3P4/5P2/P1b1N1P1/5K2 w - - 0 1",
"2rrk3/QR3pp1/2n1b2p/1BB1q3/3P4/8/P4PPP/6K1 w - - 0 1",
"r1b2k1r/1p1p1pp1/p2P4/4N1Bp/3p4/8/PPB2P2/2K1R3 w - - 0 1",
"7R/5rp1/2p1r1k1/2q5/4pP1Q/4P3/5PK1/7R w - - 0 1",
"r1b2k1r/pppp4/1bP2qp1/5pp1/4pP2/1BP5/PBP3PP/R2Q1R1K b - - 0 1",
"r1bnk2r/pppp1ppp/1b4q1/4P3/2B1N3/Q1Pp1N2/P4PPP/R3R1K1 w - - 0 1",
"2kr3r/1p3ppp/p3pn2/2b1B2q/Q1N5/2P5/PP3PPP/R2R2K1 w - - 0 1",
"6k1/1p3pp1/p1b1p2p/q3r1b1/P7/1P5P/1NQ1RPP1/1B4K1 b - - 0 1",
"5r2/1qp2pp1/bnpk3p/4NQ2/2P5/1P5P/5PP1/4R1K1 w - - 0 1",
"1r2r2k/1q1n1p1p/p1b1pp2/3pP3/1b5R/2N1BBQ1/1PP3PP/3R3K w - - 0 1",
"4R3/p2r1q1k/5B1P/6P1/2p4K/3b4/4Q3/8 w - - 0 1",
"4k3/p5p1/2p4r/2NPb3/4p1pr/1P4q1/P1QR1R1P/7K b - - 0 1",
"6r1/r5PR/2p3R1/2Pk1n2/3p4/1P1NP3/4K3/8 w - - 0 1",
"6k1/5p1p/2Q1p1p1/5n1r/N7/1B3P1P/1PP3PK/4q3 b - - 0 1",
"8/3n2pp/2qBkp2/ppPpp1P1/1P2P3/1Q6/P4PP1/6K1 w - - 0 1",
"r2qkb1r/1pp1pppp/p1nn4/3N1b2/Q1BP1B2/4P3/PP3PPP/R3K1NR w - - 0 1",
"3br1k1/3N1ppp/1p1QP3/3P4/6P1/5q2/5P1P/5RK1 b - - 0 1",
"8/5p2/4b1kp/3pPp1N/3Pn1P1/B6P/7K/8 b - - 0 1",
"r2qkb1r/n2bnpp1/2p1p2p/RP6/Q1BPP2B/2N2N2/1P3PPP/4K2R b - - 0 1",
"r1bq1rk1/pp1p1pp1/1b3n1p/n2p4/1P2P3/3B1N2/P4PPP/RNBQ1RK1 w - - 0 1",
"r1bq1rk1/ppp2pp1/2np1n1p/2b1p3/N1B1P3/3P1N1P/PPP2PP1/R1BQ1RK1 b - - 0 1",
"5k1r/p1p1q1pp/1pB2p1n/3p1b2/1P6/P3p2P/2PN1PP1/R1BQ1RK1 w - - 0 1",
"rnbq1rk1/ppp2ppp/3b1n2/8/4P3/3PBN2/PPP3PP/RN1QKB1R b - - 0 1",
"r1bq1rk1/ppp1bppn/3P3p/8/2BQ4/2N1B3/PPP2PPP/R4RK1 b - - 0 1",
"r2q1r1k/1p3ppp/p2pbb1n/2p5/P1BpPPPP/NP1P4/2P3Q1/2K1R2R b - - 0 1",
"rnbqkb1r/p5pp/2pp3n/1p2pp2/4P3/1PNB1N1P/P1PPQPP1/R1B2RK1 w - - 0 1",
"rnbq1rk1/ppp1b1pp/3p1n2/4p3/5p2/1P2P1P1/PBPPNPBP/RN1Q1RK1 w - - 0 1",
"r1bq1rk1/pp2bppp/2n2n2/2p1p3/4p3/2PP1N2/PPB1QPPP/RNB2RK1 w - - 0 1",
"r1b2r1k/1pp3p1/p1q1pPBp/5p1Q/3P4/P5N1/1P3PPP/3R1RK1 b - - 0 1",
"rnbqkb1r/ppp3pp/3p1P2/6B1/8/3B1N2/PPP2PPP/RN1QK2R b - - 0 1",
"rn3rk1/pp2n1pp/1q1p4/2pP1p1b/2P1PP2/3BBN2/P1Q3PP/R4RK1 w - - 0 1",
"rnq2rk1/pp1b1ppp/2pb1n2/3p4/3NP3/1BN1P2P/PPP2PP1/R1BQ1RK1 b - - 0 1",
"2kr4/ppp4Q/6p1/2b2pq1/8/2P1p1P1/PP1PN2P/R1B1K2R w - - 0 1",
"r1bqkbnr/pp1p1ppp/8/2p5/3nP3/1PNQ2p1/P1PPN2P/R1B1KB1R w - - 0 1",
"rnbqk2r/pppp1pp1/7p/2b1N3/2B1N3/8/PPPP1PPP/R1BQK2R b - - 0 1",
"r1b1k2r/ppppq1p1/7p/2b1P3/2B1Q3/8/PPP2PPP/R1B2RK1 b - - 0 1",
"rnbq1rk1/pp3pp1/2pbpn1p/3p4/4P3/1QN4N/PPPP1PPP/R1B1KB1R b - - 0 1",
"rn2k2r/ppp2pp1/3p1n1p/2P1p3/2B1N3/8/P1PP1P1P/R1B1K1R1 b - - 0 1",
"6k1/6p1/8/8/3P1q1r/7P/PP4P1/3R3K b - - 0 1",
"r2q2k1/1pp3p1/p1npbb1p/8/3PP3/7P/PP3PP1/R1BQ1RK1 w - - 0 1",
"r1b2rk1/pppp1ppp/n4n2/4q3/1b5Q/2P1PpP1/PB1P2BP/RN2K1NR w - - 0 1",
"3r1rk1/b1p3pp/p1p1Pp2/2P2P2/1P2N1n1/2B5/P3K2P/R6R b - - 0 1",
"r4nk1/4q1pp/1r1p1p2/2pPp3/2P2B2/1p6/P4PPP/R1Q1R1K1 w - - 0 1",
"r1b3r1/pp1p2pp/k1Pb4/2p1p3/8/2QP4/PPP2PPP/RN2K2R b - - 0 1",
"1r4k1/p1p1q1pp/5p2/2pPpP2/br4PP/1P1RPB2/P1Q5/2K4R b - - 0 1",
"3q2k1/p1pn2pp/1rn1b1r1/1p1pp3/4PpNb/2PP1B1P/PPN1QPP1/R1B1R1K1 w - - 0 1",
"r1bq1r1k/ppppn1pp/1b1P4/n4p2/2B1P2B/2N2N2/PP3PPP/R2Q1RK1 b - - 0 1",
"r4rk1/pp3ppp/1qnb1n2/1B1pp3/2P5/3P1N1P/PP3P1P/R1BQ1RK1 b - - 0 1",
"r1bqk1nr/pppp3p/5pp1/4p3/1bBnP3/5Q1N/PPPP1PPP/RNB2RK1 w - - 0 1",
"r3k2r/ppb1q2p/n1p1Bpp1/2PP4/3P4/P4N1P/1P3PP1/1R1Q1RK1 b - - 0 1",
"r1bq1rk1/pp1pbpp1/5n1p/2p5/2BpPN1B/3P4/PPP2PPP/R2Q1RK1 b - - 0 1",
"r4rk1/1pp1bpp1/2pq1n1p/p3pQ2/4PP2/3PB2P/PPP1N1P1/R4RK1 b - - 0 1",
"r1b1k2b/p1pn3p/1p2P1p1/5n2/5B2/2NB4/PPP2PPP/2KRR3 b - - 0 1",
"r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2N1B3/PPP2PPP/R2QKBNR b - - 0 1",
"r1b2rk1/1p4pp/1pn2p2/1N2qp2/8/P2Bp2P/1PP2PP1/1R1Q1RK1 w - - 0 1",
"r7/7k/1Bp3pp/4pq1n/P3Q3/1PP4P/2P3P1/3R2K1 w - - 0 1",
"r2qr1k1/2p1nppp/p7/1p1pN1N1/3P4/1B5P/PP3PP1/R3Q1K1 b - - 0 1",
"rnb1kr2/ppp1n1pp/3P2q1/8/8/4PN2/PPPP2PP/RNB2RK1 b - - 0 1",
"r2q4/pbpp1kp1/1p1b1n1p/8/3pP3/3P4/PPP2PPP/RN1QK2R w - - 0 1",
"rnbqk1nr/pp1p2pp/1b2pP2/2p3B1/3P4/2P2N2/PP3PPP/RN1QKB1R b - - 0 1",
"r1bq1rk1/ppp1n1p1/1bn1pP2/3p2N1/3P1PP1/2P2Q2/PP5P/RNB2RK1 b - - 0 1",
"rn2k2r/ppp2p1p/4p1p1/4b1qn/3PB3/4P2P/PPP2P2/R1BQK2R w - - 0 1",
"2r3k1/5ppp/4p3/2bnNnN1/5P2/8/1P4PP/2B2R1K w - - 0 1",
"r3kbnr/pp4p1/2n1p2p/q1ppPb2/3P3P/P1N1BN2/1PP2PB1/R2QK2R b - - 0 1",
"rnbqk2r/p3bppp/1p2p3/2p5/2pPP3/P1N1BP2/1PPQN1PP/2KR3R w - - 0 1",
"8/6QP/pk6/8/5b1r/5K2/PP4P1/8 b - - 0 1",
"rn1qk1nr/pp2bppp/2p1p3/3p4/3PP3/2NQ1N2/PPP2PPP/R1B1K2R b - - 0 1",
"r1bq1rk1/ppp2ppp/3b1n2/3Pn3/2B1pP2/8/PPPPQ1PP/RNB2RK1 w - - 0 1",
"5rk1/p4ppp/1rp1p3/3pB1Q1/3Pn3/1P4PP/P1P2P2/R3R1K1 b - - 0 1",
"rn1qkb1r/ppp1pppp/5n2/5bN1/8/2Np4/PPP2PPP/R1BQKB1R w - - 0 1",
"5rk1/rb3p1p/5p2/3p4/4P3/PP1BnNB1/1P3RPP/R5K1 w - - 0 1",
"r2q1rk1/ppbn1pp1/3p3p/3p4/1PB1PNb1/P2Q1N2/2P3PP/R4R1K w - - 0 1",
"r5nr/3k1ppp/p2Pp3/n7/3N1B2/8/PP3PPP/R3K2R b - - 0 1",
"rn1qkbnr/1p6/p1pp1p2/6pp/Q1BPPpb1/2P2N2/PP1N2PP/R1B2RK1 w - - 0 1",
"r3k2r/pp1n1pp1/1qpbpn1p/3p4/3PP3/P1NQ1N1P/1PP2PP1/R1B1R1K1 b - - 0 1",
"7r/2qn1rk1/2p2bpp/p1p1pp2/P1P2P2/1P1PBRQN/6PP/4R1K1 w - - 0 1",
"r2qk1nr/ppp3pp/2n2p2/2bp4/3pPPb1/3B1N2/PPP3PP/RNBQ1R1K w - - 0 1",
"r1b2qk1/ppQ4p/2P1pprp/3p4/3n4/P5P1/1P1NPPBP/R4RK1 b - - 0 1",
"r2qkb1r/pp3p1p/2b1p1p1/2ppP2n/3P1P2/2N1BN2/PPP3PP/R2Q1RK1 b - - 0 1",
"rnbqk2r/ppp2ppp/5n2/2bP4/5P2/3p2N1/PPP3PP/RNBQKB1R w - - 0 1",
"r1b4r/1pk3pp/p1np4/3Bn1b1/PP2K3/5P2/3P3P/2R5 w - - 0 1",
"r1bqkbnr/p5pp/1pnp1P2/2p5/2BP1B2/5N2/PPP3PP/RN1QK2R b - - 0 1",
];

},{}],36:[function(require,module,exports){
module.exports = [
"1rb2k2/1pq3pQ/pRpNp3/P1P2n2/3P1P2/4P3/6PP/6K1 w - - 0 1",
"2r2bk1/pb3ppp/1p6/n7/q2P4/P1P1R2Q/B2B1PPP/R5K1 w - - 0 1",
"3r2k1/p1p2p2/bp2p1nQ/4PB1P/2pr3q/6R1/PP3PP1/3R2K1 w - - 0 1",
"r1br1b2/4pPk1/1p1q3p/p2PR3/P1P2N2/1P1Q2P1/5PBK/4R3 w - - 0 1",
"7r/3kbp1p/1Q3R2/3p3q/p2P3B/1P5K/P6P/8 w - - 0 1",
"4Rnk1/pr3ppp/1p3q2/5NQ1/2p5/8/P4PPP/6K1 w - - 0 1",
"4qk2/6p1/p7/1p1Qp3/r1P2b2/1K5P/1P6/4RR2 w - - 0 1",
"3r1rk1/ppqn3p/1npb1P2/5B2/2P5/2N3B1/PP2Q1PP/R5K1 w - - 0 1",
"r3rk2/6b1/q2pQBp1/1NpP4/1n2PP2/nP6/P3N1K1/R6R w - - 0 1",
"r5k1/pp2ppb1/3p4/q3P1QR/6b1/r2B1p2/1PP5/1K4R1 w - - 0 1",
"6k1/5pp1/p3p2p/3bP2P/6QN/8/rq4P1/2R4K w - - 0 1",
"N1bk4/pp1p1Qpp/8/2b5/3n3q/8/PPP2RPP/RNB1rBK1 b - - 0 1",
"r3br1k/pp5p/4B1p1/4NpP1/P2Pn3/q1PQ3R/7P/3R2K1 w - - 0 1",
"6kr/pp2r2p/n1p1PB1Q/2q5/2B4P/2N3p1/PPP3P1/7K w - - 0 1",
"1R6/5qpk/4p2p/1Pp1Bp1P/r1n2QP1/5PK1/4P3/8 w - - 0 1",
"8/4R1pk/p5p1/8/1pB1n1b1/1P2b1P1/P4r1P/5R1K b - - 0 1",
"r1bk1r2/pp1n2pp/3NQ3/1P6/8/2n2PB1/q1B3PP/3R1RK1 w - - 0 1",
"rn3rk1/pp3p2/2b1pnp1/4N3/3q4/P1NB3R/1P1Q1PPP/R5K1 w - - 0 1",
"2kr1b1r/pp3ppp/2p1b2q/4B3/4Q3/2PB2R1/PPP2PPP/3R2K1 w - - 0 1",
"5qr1/kp2R3/5p2/1b1N1p2/5Q2/P5P1/6BP/6K1 w - - 0 1",
"r2qrk2/p5b1/2b1p1Q1/1p1pP3/2p1nB2/2P1P3/PP3P2/2KR3R w - - 0 1",
"r5rk/pp1np1bn/2pp2q1/3P1bN1/2P1N2Q/1P6/PB2PPBP/3R1RK1 w - - 0 1",
"r4n1k/ppBnN1p1/2p1p3/6Np/q2bP1b1/3B4/PPP3PP/R4Q1K w - - 0 1",
"r3QnR1/1bk5/pp5q/2b5/2p1P3/P7/1BB4P/3R3K w - - 0 1",
"1r4k1/3b2pp/1b1pP2r/pp1P4/4q3/8/PP4RP/2Q2R1K b - - 0 1",
"r2Nqb1r/pQ1bp1pp/1pn1p3/1k1p4/2p2B2/2P5/PPP2PPP/R3KB1R w - - 0 1",
"r6k/pb4bp/5Q2/2p1Np2/1qB5/8/P4PPP/4RK2 w - - 0 1",
"2r2b1k/p2Q3p/b1n2PpP/2p5/3r1BN1/3q2P1/P4PB1/R3R1K1 w - - 0 1",
"r3r2k/pb1n3p/1p1q1pp1/4p1B1/2BP3Q/2P1R3/P4PPP/4R1K1 w - - 0 1",
"q1r2b1k/rb4np/1p2p2N/pB1n4/6Q1/1P2P3/PB3PPP/2RR2K1 w - - 0 1",
"2r1k2r/pR2p1bp/2n1P1p1/8/2QP4/q2b1N2/P2B1PPP/4K2R w - - 0 1",
"5rk1/pp2Rppp/nqp5/8/5Q2/6PB/PPP2P1P/6K1 w - - 0 1",
"1Q1R4/5k2/6pp/2N1bp2/1Bn5/2P2P1P/1r3PK1/8 b - - 0 1",
"1q5r/1b1r1p1k/2p1pPpb/p1Pp4/3B1P1Q/1P4P1/P4KB1/2RR4 w - - 0 1",
"r1bqn1rk/1p1np1bp/p1pp2p1/6P1/2PPP3/2N1BPN1/PP1Q4/2KR1B1R w - - 0 1",
"r2q4/pp1rpQbk/3p2p1/2pPP2p/5P2/2N5/PPP2P2/2KR3R w - - 0 1",
"4q1rk/pb2bpnp/2r4Q/1p1p1pP1/4NP2/1P3R2/PBn4P/RB4K1 w - - 0 1",
"5rk1/pbppq1bN/1pn1p1Q1/6N1/3P4/8/PPP2PP1/2K4R w - - 0 1",
"r2r4/1p1bn2p/pn2ppkB/5p2/4PQN1/6P1/PPq2PBP/R2R2K1 w - - 0 1",
"5rk1/ppp3pp/8/3pQ3/3P2b1/5rPq/PP1P1P2/R1BB1RK1 b - - 0 1",
"r6r/1p2pp1k/p1b2q1p/4pP2/6QR/3B2P1/P1P2K2/7R w - - 0 1",
"r2Q1q1k/pp5r/4B1p1/5p2/P7/4P2R/7P/1R4K1 w - - 0 1",
"5k2/p2Q1pp1/1b5p/1p2PB1P/2p2P2/8/PP3qPK/8 w - - 0 1",
"r3kb1r/pb6/2p2p1p/1p2pq2/2pQ3p/2N2B2/PP3PPP/3RR1K1 w - - 0 1",
"rn3k1r/pbpp1Bbp/1p4pN/4P1B1/3n4/2q3Q1/PPP2PPP/2KR3R w - - 0 1",
"r1b3kr/ppp1Bp1p/1b6/n2P4/2p3q1/2Q2N2/P4PPP/RN2R1K1 w - - 0 1",
"1R1br1k1/pR5p/2p3pB/2p2P2/P1qp2Q1/2n4P/P5P1/6K1 w - - 0 1",
"6rk/2p2p1p/p2q1p1Q/2p1pP2/1nP1R3/1P5P/P5P1/2B3K1 w - - 0 1",
"r3rk2/5pn1/pb1nq1pR/1p2p1P1/2p1P3/2P2QN1/PPBB1P2/2K4R w - - 0 1",
"3rkq1r/1pQ2p1p/p3bPp1/3pR3/8/8/PPP2PP1/1K1R4 w - - 0 1",
"n2q1r1k/4bp1p/4p3/4P1p1/2pPNQ2/2p4R/5PPP/2B3K1 w - - 0 1",
"2Rr1qk1/5ppp/p2N4/P7/5Q2/8/1r4PP/5BK1 w - - 0 1",
"r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1",
"5qr1/pr3p1k/1n1p2p1/2pPpP1p/P3P2Q/2P1BP1R/7P/6RK w - - 0 1",
"7k/pb4rp/2qp1Q2/1p3pP1/np3P2/3PrN1R/P1P4P/R3N1K1 w - - 0 1",
"8/p4pk1/6p1/3R4/3nqN1P/2Q3P1/5P2/3r1BK1 b - - 0 1",
"r1b2rk1/p1qnbp1p/2p3p1/2pp3Q/4pP2/1P1BP1R1/PBPP2PP/RN4K1 w - - 0 1",
"rqr3k1/3bppBp/3p2P1/p7/1n2P3/1p3P2/1PPQ2P1/2KR3R w - - 0 1",
"r3q1rk/1pp3pb/pb5Q/3pB3/3P4/2P2N1P/PP1N2P1/7K w - - 0 1",
"3Q1rk1/8/7R/p1N1p1Bp/P1q5/7b/3Q1PPK/1r6 b - - 0 1",
"1r2k1r1/pbppnp1p/1b3P2/8/Q7/B1PB1q2/P4PPP/3R2K1 w - - 0 1",
"2r3k1/6pp/p2p4/1p6/1p2P3/1PNK1bQ1/1BP3qP/R7 b - - 0 1",
"1r3rk1/1nqb2n1/6R1/1p1Pp3/1Pp3p1/2P4P/2B2QP1/2B2RK1 w - - 0 1",
"3r1rk1/p1p4p/8/1PP1p1bq/2P5/3N1Pp1/PB2Q3/1R3RK1 b - - 0 1",
"2b3k1/6p1/p2bp2r/1p1p4/3Np1B1/1PP1PRq1/P1R3P1/3Q2K1 b - - 0 1",
"5q2/1ppr1br1/1p1p1knR/1N4R1/P1P1PP2/1P6/2P4Q/2K5 w - - 0 1",
"r2q1b1r/1pN1n1pp/p1n3k1/4Pb2/2BP4/8/PPP3PP/R1BQ1RK1 w - - 0 1",
"4n3/pbq2rk1/1p3pN1/8/2p2Q2/Pn4N1/B4PP1/4R1K1 w - - 0 1",
"8/1p2p1kp/2rRB3/pq2n1Pp/4P3/8/PPP2Q2/2K5 w - - 0 1",
"3r1rk1/1q2b1n1/p1b1pRpQ/1p2P3/3BN3/P1PB4/1P4PP/4R2K w - - 0 1",
"r4r1k/1bpq1p1n/p1np4/1p1Bb1BQ/P7/6R1/1P3PPP/1N2R1K1 w - - 0 1",
"k1b4r/1p6/pR3p2/P1Qp2p1/2pp4/6PP/2P2qBK/8 w - - 0 1",
"r3rknQ/1p1R1pb1/p3pqBB/2p5/8/6P1/PPP2P1P/4R1K1 w - - 0 1",
"k2r4/pp3p2/2p5/Q3p2p/4Kp1P/5R2/PP4q1/7R b - - 0 1",
"5rk1/1bR2pbp/4p1p1/8/1p1P1PPq/1B2P2r/P2NQ2P/5RK1 b - - 0 1",
"6rk/3b3p/p2b1p2/2pPpP2/2P1B3/1P4q1/P2BQ1PR/6K1 w - - 0 1",
"3k1r1r/pb3p2/1p4p1/1B2B3/3qn3/6QP/P4RP1/2R3K1 w - - 0 1",
"5kqQ/1b1r2p1/ppn1p1Bp/2b5/2P2rP1/P4N2/1B5P/4RR1K w - - 0 1",
"3rnr1k/p1q1b1pB/1pb1p2p/2p1P3/2P2N2/PP4P1/1BQ4P/4RRK1 w - - 0 1",
"6rk/5p1p/5p2/1p2bP2/1P2R2Q/2q1BBPP/5PK1/r7 w - - 0 1",
"5r1k/2q1r1p1/1npbBpQB/1p1p3P/p2P2R1/P4PP1/1PR2PK1/8 w - - 0 1",
"r1b2rk1/1p3pb1/2p3p1/p1B5/P3N3/1B1Q1Pn1/1PP3q1/2KR3R w - - 0 1",
"8/QrkbR3/3p3p/2pP4/1P3N2/6P1/6pK/2q5 w - - 0 1",
"8/pp3pk1/2b2b2/8/2Q2P1r/2P1q2B/PP4PK/5R2 b - - 0 1",
"1r3r1k/2R4p/q4ppP/3PpQ2/2RbP3/pP6/P2B2P1/1K6 w - - 0 1",
"r1q2b2/p4p1k/1p1r3p/3B1P2/3B2Q1/4P3/P5PP/5RK1 w - - 0 1",
"6k1/6pp/1q6/4pp2/P5n1/1P6/1P3BPr/R4QK1 b - - 0 1",
"5r2/6k1/p2p4/6n1/P3p3/8/5P2/2q2QKR b - - 0 1",
"1k1r4/1b1p2pp/PQ2p3/nN6/P3P3/8/6PP/2q2BK1 w - - 0 1",
"2b3k1/1p5p/2p1n1pQ/3qB3/3P4/3B3P/r5P1/5RK1 w - - 0 1",
"2r1rk2/6b1/1q2ppP1/pp1PpQB1/8/PPP2BP1/6K1/7R w - - 0 1",
"rr3k2/pppq1pN1/1b1p1BnQ/1b2p1N1/4P3/2PP3P/PP3PP1/R4RK1 w - - 0 1",
"7R/1bpkp3/p2pp3/3P4/4B1q1/2Q5/4NrP1/3K4 w - - 0 1",
"2b1r2r/2q1p1kn/pN1pPp2/P2P1RpQ/3p4/3B4/1P4PP/R6K w - - 0 1",
"3r1kbR/1p1r2p1/2qp1n2/p3pPQ1/P1P1P3/BP6/2B5/6RK w - - 0 1",
"5qrk/p3b1rp/4P2Q/5P2/1pp5/5PR1/P6P/B6K w - - 0 1",
"1r3r1k/6p1/p6p/2bpNBP1/1p2n3/1P5Q/PBP1q2P/1K5R w - - 0 1",
"8/1r5p/kpQ3p1/p3rp2/P6P/8/4bPPK/1R6 w - - 0 1",
"3r1k2/1pr2pR1/p1bq1n1Q/P3pP2/3pP3/3P4/1P2N2P/6RK w - - 0 1",
"3Rrk2/1p1R1pr1/2p1p2Q/2q1P1p1/5P2/8/1PP5/1K6 w - - 0 1",
"1R3nk1/5pp1/3N2b1/4p1n1/2BqP1Q1/8/8/7K w - - 0 1",
"2r2rk1/1b3pp1/4p3/p3P1Q1/1pqP1R2/2P5/PP1B1K1P/R7 w - - 0 1",
"6k1/pp3r2/2p4q/3p2p1/3Pp1b1/4P1P1/PP4RP/2Q1RrNK b - - 0 1",
"8/8/p3p3/3b1pR1/1B3P1k/8/4r1PK/8 w - - 0 1",
"r1b2nrk/1p3p1p/p2p1P2/5P2/2q1P2Q/8/PpP5/1K1R3R w - - 0 1",
"r5kr/pppN1pp1/1bn1R3/1q1N2Bp/3p2Q1/8/PPP2PPP/R5K1 w - - 0 1",
"b3r1k1/5ppp/p2p4/p4qN1/Q2b4/6R1/5PPP/5RK1 b - - 0 1",
"r2Rnk1r/1p2q1b1/7p/6pQ/4Ppb1/1BP5/PP3BPP/2K4R w - - 0 1",
"r3nr1k/1b2Nppp/pn6/q3p1P1/P1p4Q/R7/1P2PP1P/2B2RK1 w - - 0 1",
"r5rR/3Nkp2/4p3/1Q4q1/np1N4/8/bPPR2P1/2K5 w - - 0 1",
"5rk1/pp3ppp/7r/6n1/NB1P3q/PQ3P2/1P4P1/R4RK1 b - - 0 1",
"4R3/2p2kpQ/3p3p/p2r2q1/8/1Pr2P2/P1P3PP/4R1K1 w - - 0 1",
"2q1r3/4pR2/3rQ1pk/p1pnN2p/Pn5B/8/1P4PP/3R3K w - - 0 1",
"rn4nr/pppq2bk/7p/5b1P/4NBQ1/3B4/PPP3P1/R3K2R w - - 0 1",
"3rn2r/3kb2p/p4ppB/1q1Pp3/8/3P1N2/1P2Q1PP/R1R4K w - - 0 1",
"4kr2/3rn2p/1P4p1/2p5/Q1B2P2/8/P2q2PP/4R1K1 w - - 0 1",
"r1br4/1p2bpk1/p1nppn1p/5P2/4P2B/qNNB3R/P1PQ2PP/7K w - - 0 1",
"3q3r/r4pk1/pp2pNp1/3bP1Q1/7R/8/PP3PPP/3R2K1 w - - 0 1",
"r1kq1b1r/5ppp/p4n2/2pPR1B1/Q7/2P5/P4PPP/1R4K1 w - - 0 1",
"r3kr2/6Qp/1Pb2p2/pB3R2/3pq2B/4n3/1P4PP/4R1K1 w - - 0 1",
"2rrk3/QR3pp1/2n1b2p/1BB1q3/3P4/8/P4PPP/6K1 w - - 0 1",
"1qbk2nr/1pNp2Bp/2n1pp2/8/2P1P3/8/Pr3PPP/R2QKB1R w - - 0 1",
"2Q5/6pk/5b1p/5P2/3p4/1Rr2qNK/7P/8 b - - 0 1",
"4Br1k/p5pp/1n6/8/3PQbq1/6P1/PP5P/RNB3K1 b - - 0 1",
"rnb1k2r/ppppbN1p/5n2/7Q/4P3/2N5/PPPP3P/R1B1KB1q w - - 0 1",
"6k1/2R1Qpb1/3Bp1p1/1p2n2p/3q4/1P5P/2N2PPK/r7 b - - 0 1",
"r1b2rk1/pp3ppp/3p4/3Q1nq1/2B1R3/8/PP3PPP/R5K1 w - - 0 1",
"1r3b2/1bp2pkp/p1q4N/1p1n1pBn/8/2P3QP/PPB2PP1/4R1K1 w - - 0 1",
"7r/pRpk4/2np2p1/5b2/2P4q/2b1BBN1/P4PP1/3Q1K2 b - - 0 1",
"R4rk1/4r1p1/1q2p1Qp/1pb5/1n5R/5NB1/1P3PPP/6K1 w - - 0 1",
"r1b2rk1/1p2nppp/p2R1b2/4qP1Q/4P3/1B2B3/PPP2P1P/2K3R1 w - - 0 1",
"7k/p1p2bp1/3q1N1p/4rP2/4pQ2/2P4R/P2r2PP/4R2K w - - 0 1",
"4r1k1/pb4pp/1p2p3/4Pp2/1P3N2/P2Qn2P/3n1qPK/RBB1R3 b - - 0 1",
"r1bq1r1k/pp2n1pp/8/3N1p2/2B4R/8/PPP2QPP/7K w - - 0 1",
"5rk1/3p1p1p/p4Qq1/1p1P2R1/7N/n6P/2r3PK/8 w - - 0 1",
"r2r2k1/p3bppp/3p4/q2p3n/3QP3/1P4R1/PB3PPP/R5K1 w - - 0 1",
"r4r2/2qnbpkp/b3p3/2ppP1N1/p2P1Q2/P1P5/5PPP/nBBR2K1 w - - 0 1",
"5r1k/1p1b1p1p/p2ppb2/5P1B/1q6/1Pr3R1/2PQ2PP/5R1K w - - 0 1",
"5r2/pp2R3/1q1p3Q/2pP1b2/2Pkrp2/3B4/PPK2PP1/R7 w - - 0 1",
"q5k1/5rb1/r6p/1Np1n1p1/3p1Pn1/1N4P1/PP5P/R1BQRK2 b - - 0 1",
"7r/1p3bk1/1Pp2p2/3p2p1/3P1nq1/1QPNR1P1/5P2/5BK1 b - - 0 1",
"rn1q3r/pp2kppp/3Np3/2b1n3/3N2Q1/3B4/PP4PP/R1B2RK1 w - - 0 1",
"2rkr3/3b1p1R/3R1P2/1p2Q1P1/pPq5/P1N5/1KP5/8 w - - 0 1",
"r1bq1rk1/4np1p/1p3RpB/p1Q5/2Bp4/3P4/PPP3PP/R5K1 w - - 0 1",
"1rbk1r2/pp4R1/3Np3/3p2p1/6q1/BP2P3/P2P2B1/2R3K1 w - - 0 1",
"2k4r/1r1q2pp/QBp2p2/1p6/8/8/P4PPP/2R3K1 w - - 0 1",
"r1qr3k/3R2p1/p3Q3/1p2p1p1/3bN3/8/PP3PPP/5RK1 w - - 0 1",
"2rr3k/1p1b1pq1/4pNp1/Pp2Q2p/3P4/7R/5PPP/4R1K1 w - - 0 1",
"5rk1/pb2npp1/1pq4p/5p2/5B2/1B6/P2RQ1PP/2r1R2K b - - 0 1",
"r3Rnkr/1b5p/p3NpB1/3p4/1p6/8/PPP3P1/2K2R2 w - - 0 1",
"4r1k1/3r1p1p/bqp1n3/p2p1NP1/Pn1Q1b2/7P/1PP3B1/R2NR2K w - - 0 1",
"7r/6kr/p5p1/1pNb1pq1/PPpPp3/4P1b1/R3R1Q1/2B2BK1 b - - 0 1",
"2r4k/ppqbpQ1p/3p1bpB/8/8/1Nr2P2/PPP3P1/2KR3R w - - 0 1",
"2r1k2r/1p2pp1p/1p2b1pQ/4B3/3n4/2qB4/P1P2PPP/2KRR3 b - - 0 1",
"1r1r4/Rp2np2/3k4/3P3p/2Q2p2/2P4q/1P1N1P1P/6RK w - - 0 1",
"r1b2rk1/p3Rp1p/3q2pQ/2pp2B1/3b4/3B4/PPP2PPP/4R1K1 w - - 0 1",
"6rk/6pp/2p2p2/2B2P1q/1P2Pb2/1Q5P/2P2P2/3R3K w - - 0 1",
"rnbq1b1r/pp4kp/5np1/4p2Q/2BN1R2/4B3/PPPN2PP/R5K1 w - - 0 1",
"1r1kr3/Nbppn1pp/1b6/8/6Q1/3B1P2/Pq3P1P/3RR1K1 w - - 0 1",
"3r2k1/1b2Qp2/pqnp3b/1pn5/3B3p/1PR4P/P4PP1/1B4K1 w - - 0 1",
"4k1r1/5p2/p1q5/1p2p2p/6n1/P4bQ1/1P4RP/3NR1BK b - - 0 1",
"1k5r/pp1Q1pp1/2p4r/b4Pn1/3NPp2/2P2P2/1q4B1/1R2R1K1 b - - 0 1",
"k2r3r/p3Rppp/1p4q1/1P1b4/3Q1B2/6N1/PP3PPP/6K1 w - - 0 1",
"4rk1r/p2b1pp1/1q5p/3pR1n1/3N1p2/1P1Q1P2/PBP3PK/4R3 w - - 0 1",
"r1bq1rk1/pp1nb1pp/5p2/6B1/3pQ3/3BPN2/PP3PPP/R4RK1 w - - 0 1",
"kb3R2/1p5r/5p2/1P1Q4/p5P1/q7/5P2/4RK2 w - - 0 1",
"rn1r4/pp2p1b1/5kpp/q1PQ1b2/6n1/2N2N2/PPP3PP/R1B2RK1 w - - 0 1",
"rr2k3/5p2/p1bppPpQ/2p1n1P1/1q2PB2/2N4R/PP4BP/6K1 w - - 0 1",
"r5k1/2Rb3r/p2p3b/P2Pp3/4P1pq/5p2/1PQ2B1P/2R2BKN b - - 0 1",
"r1bqr3/ppp1B1kp/1b4p1/n2B4/3PQ1P1/2P5/P4P2/RN4K1 w - - 0 1",
"3r4/4RRpk/5n1N/8/p1p2qPP/P1Qp1P2/1P4K1/3b4 w - - 0 1",
"2rr2k1/1b1q2p1/p2Pp1Qp/1pn1P2P/2p5/8/PP3PP1/1BR2RK1 w - - 0 1",
"1r3r1k/6R1/1p2Qp1p/p1p4N/3pP3/3P1P2/PP2q2P/5R1K w - - 0 1",
"4r3/p1r2p1k/1p2pPpp/2qpP3/3R2P1/1PPQ3R/1P5P/7K w - - 0 1",
"1R4nr/p1k1ppb1/2p4p/4Pp2/3N1P1B/8/q1P3PP/3Q2K1 w - - 0 1",
"2R2bk1/5rr1/p3Q2R/3Ppq2/1p3p2/8/PP1B2PP/7K w - - 0 1",
"4r2k/4Q1bp/4B1p1/1q2n3/4pN2/P1B3P1/4pP1P/4R1K1 w - - 0 1",
"2rq1r1k/1b2bp1p/p1nppp1Q/1p3P2/4P1PP/2N2N2/PPP5/1K1R1B1R w - - 0 1",
"3r2k1/pp5p/6p1/2Ppq3/4Nr2/4B2b/PP2P2K/R1Q1R2B b - - 0 1",
"r2Bk2r/pb1n1pQ1/3np3/1p2P3/2p3K1/3p4/PP1b1PPP/R4B1R b - - 0 1",
"4r1k1/3n1ppp/4r3/3n3q/Q2P4/5P2/PP2BP1P/R1B1R1K1 b - - 0 1",
"r1nk3r/2b2ppp/p3b3/3NN3/Q2P3q/B2B4/P4PPP/4R1K1 w - - 0 1",
"4N1nk/p5R1/4b2p/3pPp1Q/2pB1P1K/2P3PP/7r/2q5 w - - 0 1",
"7k/pbp3bp/3p4/1p5q/3n2p1/5rB1/PP1NrN1P/1Q1BRRK1 b - - 0 1",
"3n2b1/1pr1r2k/p1p1pQpp/P1P5/2BP1PP1/5K2/1P5R/8 w - - 0 1",
"4rk2/1bq2p1Q/3p1bp1/1p1n2N1/4PB2/2Pp3P/1P1N4/5RK1 w - - 0 1",
"b4rk1/p4p2/1p4Pq/4p3/8/P1N2PQ1/BP3PK1/8 w - - 0 1",
"3r1r2/ppb1qBpk/2pp1R1p/7Q/4P3/2PP2P1/PP4KP/5R2 w - - 0 1",
"4r3/5p1k/2p1nBpp/q2p4/P1bP4/2P1R2Q/2B2PPP/6K1 w - - 0 1",
"6r1/pp3N1k/1q2bQpp/3pP3/8/6RP/PP3PP1/6K1 w - - 0 1",
"2r1rk2/1b2b1p1/p1q2nP1/1p2Q3/4P3/P1N1B3/1PP1B2R/2K4R w - - 0 1",
"br1qr1k1/b1pnnp2/p2p2p1/P4PB1/3NP2Q/2P3N1/B5PP/R3R1K1 w - - 0 1",
"r2r4/pp2ppkp/2P3p1/q1p5/4PQ2/2P2b2/P4PPP/2R1KB1R b - - 0 1",
"6k1/5pp1/1pq4p/p3P3/P4P2/2P1Q1PK/7P/R1Br3r b - - 0 1",
"r1b2k1r/pppp4/1bP2qp1/5pp1/4pP2/1BP5/PBP3PP/R2Q1R1K b - - 0 1",
"r1b1nn1k/p3p1b1/1qp1B1p1/1p1p4/3P3N/2N1B3/PPP3PP/R2Q1K2 w - - 0 1",
"rnb2rk1/ppp2qb1/6pQ/2pN1p2/8/1P3BP1/PB2PP1P/R4RK1 w - - 0 1",
"5rkr/pp2Rp2/1b1p1Pb1/3P2Q1/2n3P1/2p5/P4P2/4R1K1 w - - 0 1",
"rn1k3r/1b1q1ppp/p2P4/2B2p2/8/1QNBR3/PP3PPP/2R3K1 w - - 0 1",
"rnb2r1k/pp2q2p/2p2R2/8/2Bp3Q/8/PPP3PP/RN4K1 w - - 0 1",
"3k4/1pp3b1/4b2p/1p3qp1/3Pn3/2P1RN2/r5P1/1Q2R1K1 b - - 0 1",
"r1bnk2r/pppp1ppp/1b4q1/4P3/2B1N3/Q1Pp1N2/P4PPP/R3R1K1 w - - 0 1",
"2q5/p3p2k/3pP1p1/2rN2Pn/1p1Q4/7R/PPr5/1K5R w - - 0 1",
"2r1r3/pp1nbN2/4p3/q7/P1pP2nk/2P2P2/1PQ5/R3R1K1 w - - 0 1",
"6k1/p1p3pp/6q1/3pr3/3Nn3/1QP1B1Pb/PP3r1P/R3R1K1 b - - 0 1",
"6k1/5p2/p5n1/8/1p1p2P1/1Pb2B1r/P3KPN1/2RQ3q b - - 0 1",
"4r1r1/pb1Q2bp/1p1Rnkp1/5p2/2P1P3/4BP2/qP2B1PP/2R3K1 w - - 0 1",
"r1bqr1k1/ppp2pp1/3p4/4n1NQ/2B1PN2/8/P4PPP/b4RK1 w - - 0 1",
"6k1/p2rR1p1/1p1r1p1R/3P4/4QPq1/1P6/P5PK/8 w - - 0 1",
"r5rk/pp2qb1p/2p2pn1/2bp4/3pP1Q1/1B1P1N1R/PPP3PP/R1B3K1 w - - 0 1",
"r2q1bk1/5n1p/2p3pP/p7/3Br3/1P3PQR/P5P1/2KR4 w - - 0 1",
"2r2n1k/2q3pp/p2p1b2/2nB1P2/1p1N4/8/PPP4Q/2K3RR w - - 0 1",
"1R4Q1/3nr1pp/3p1k2/5Bb1/4P3/2q1B1P1/5P1P/6K1 w - - 0 1",
"5k1r/3b4/3p1p2/p4Pqp/1pB5/1P4r1/P1P5/1K1RR2Q w - - 0 1",
"Q7/p1p1q1pk/3p2rp/4n3/3bP3/7b/PP3PPK/R1B2R2 b - - 0 1",
"7r/p3ppk1/3p4/2p1P1Kp/2Pb4/3P1QPq/PP5P/R6R b - - 0 1",
"6k1/6pp/pp1p3q/3P4/P1Q2b2/1NN1r2b/1PP4P/6RK b - - 0 1",
"8/2Q2pk1/3Pp1p1/1b5p/1p3P1P/1P2PK2/6RP/7q b - - 0 1",
"1r2k3/2pn1p2/p1Qb3p/7q/3PP3/2P1BN1b/PP1N1Pr1/RR5K b - - 0 1",
"8/5p1k/3p2q1/3Pp3/4Pn1r/R4Qb1/1P5B/5B1K b - - 0 1",
"2r3k1/ppq3p1/2n2p1p/2pr4/5P1N/6QP/PP2R1P1/4R2K w - - 0 1",
"5k2/r3pp1p/6p1/q1pP3R/5B2/2b3PP/PQ3PK1/R7 w - - 0 1",
"r1b2k2/1p1p1r1B/n4p2/p1qPp3/2P4N/4P1R1/PPQ3PP/R5K1 w - - 0 1",
"2r1k3/3n1p2/6p1/1p1Qb3/1B2N1q1/2P1p3/P4PP1/2KR4 w - - 0 1",
"5rk1/2pb1ppp/p2r4/1p1Pp3/4Pn1q/1B1PNP2/PP1Q1P1P/R5RK b - - 0 1",
"3nbr2/4q2p/r3pRpk/p2pQRN1/1ppP2p1/2P5/PPB4P/6K1 w - - 0 1",
"5rk1/pp1qpR2/6Pp/3ppNbQ/2nP4/B1P5/P5PP/6K1 w - - 0 1",
"5k2/ppqrRB2/3r1p2/2p2p2/7P/P1PP2P1/1P2QP2/6K1 w - - 0 1",
"8/kp1R4/2q2p1p/3Qb2P/p7/P5P1/KP6/N1r5 b - - 0 1",
"4rk2/pp2N1bQ/5p2/8/2q5/P7/3r2PP/4RR1K w - - 0 1",
"r4r1k/1p3p1p/pp1p1p2/4qN1R/PP2P1n1/6Q1/5PPP/R5K1 w - - 0 1",
"r4b1r/pp1n2k1/1qp1p2p/3pP1pQ/1P6/2BP2N1/P4PPP/R4RK1 w - - 0 1",
"6rk/Q2n2rp/5p2/3P4/4P3/2q4P/P5P1/5RRK b - - 0 1",
"2k4r/ppp5/4bqp1/3p2Q1/6n1/2NB3P/PPP2bP1/R1B2R1K b - - 0 1",
"rnb2b1r/ppp1n1kp/3p1q2/7Q/4PB2/2N5/PPP3PP/R4RK1 w - - 0 1",
"1r2r2k/1q1n1p1p/p1b1pp2/3pP3/1b5R/2N1BBQ1/1PP3PP/3R3K w - - 0 1",
"3r1r1k/p4p1p/1pp2p2/2b2P1Q/3q1PR1/1PN2R1P/1P4P1/7K w - - 0 1",
"r1b1r1k1/p1q3p1/1pp1pn1p/8/3PQ3/B1PB4/P5PP/R4RK1 w - - 0 1",
"k7/4rp1p/p1q3p1/Q1r2p2/1R6/8/P5PP/1R5K w - - 0 1",
"r1b2r2/p1q1npkB/1pn1p1p1/2ppP1N1/3P4/P1P2Q2/2P2PPP/R1B2RK1 w - - 0 1",
"rnb3kr/ppp2ppp/1b6/3q4/3pN3/Q4N2/PPP2KPP/R1B1R3 w - - 0 1",
"3q1r1k/2p4p/1p1pBrp1/p2Pp3/2PnP3/5PP1/PP1Q2K1/5R1R w - - 0 1",
"5rk1/1R4b1/3p4/1P1P4/4Pp2/3B1Pnb/PqRK1Q2/8 b - - 0 1",
"r4rk1/1q2bp1p/5Rp1/pp1Pp3/4B2Q/P2R4/1PP3PP/7K w - - 0 1",
"4Nr1k/1bp2p1p/1r4p1/3P4/1p1q1P1Q/4R3/P5PP/4R2K w - - 0 1",
"4kb1Q/5p2/1p6/1K1N4/2P2P2/8/q7/8 w - - 0 1",
"4r3/p4pkp/q7/3Bbb2/P2P1ppP/2N3n1/1PP2KPR/R1BQ4 b - - 0 1",
"r4rk1/3R3p/1q2pQp1/p7/P7/8/1P5P/4RK2 w - - 0 1",
"r6k/1p5p/2p1b1pB/7B/p1P1q2r/8/P5QP/3R2RK b - - 0 1",
"2kr3r/1pp2ppp/pbp4n/5q2/1PP5/2Q5/PB3PPP/RN3RK1 b - - 0 1",
"8/4n2k/b1Pp2p1/3Ppp1p/p2qP3/3B1P2/Q2NK1PP/3R4 b - - 0 1",
"2q1rnk1/p4r2/1p3pp1/3P3Q/2bPp2B/2P4R/P1B3PP/4R1K1 w - - 0 1",
"r5k1/2p2ppp/p1P2n2/8/1pP2bbQ/1B3PP1/PP1Pq2P/RNB3K1 b - - 0 1",
"r1b5/5p2/5Npk/p1pP2q1/4P2p/1PQ2R1P/6P1/6K1 w - - 0 1",
"r2q1rk1/p4p1p/3p1Q2/2n3B1/B2R4/8/PP3PPP/5bK1 w - - 0 1",
"r4r1k/pp5p/n5p1/1q2Np1n/1Pb5/6P1/PQ2PPBP/1RB3K1 w - - 0 1",
"1n1N2rk/2Q2pb1/p3p2p/Pq2P3/3R4/6B1/1P3P1P/6K1 w - - 0 1",
"bn5k/7p/p2p2r1/1p2p3/5p2/2P4q/PP1B1QPP/4N1RK b - - 0 1",
"rnb3kb/pp5p/4p1pB/q1p2pN1/2r1PQ2/2P5/P4PPP/2R2RK1 w - - 0 1",
"3rkb1r/ppn2pp1/1qp1p2p/4P3/2P4P/3Q2N1/PP1B1PP1/1K1R3R w - - 0 1",
"8/5prk/p5rb/P3N2R/1p1PQ2p/7P/1P3RPq/5K2 w - - 0 1",
"3q2r1/p2b1k2/1pnBp1N1/3p1pQP/6P1/5R2/2r2P2/4RK2 w - - 0 1",
"r1b2rk1/pp2b1pp/q3pn2/3nN1N1/3p4/P2Q4/1P3PPP/RBB1R1K1 w - - 0 1",
"k7/1p1rr1pp/pR1p1p2/Q1pq4/P7/8/2P3PP/1R4K1 w - - 0 1",
"r1b2rk1/ppppbpp1/7p/4R3/6Qq/2BB4/PPP2PPP/R5K1 w - - 0 1",
"4kb1r/1R6/p2rp3/2Q1p1q1/4p3/3B4/P6P/4KR2 w - - 0 1",
"qr3b1r/Q5pp/3p4/1kp5/2Nn1B2/Pp6/1P3PPP/2R1R1K1 w - - 0 1",
"r1bq1rk1/p3b1np/1pp2ppQ/3nB3/3P4/2NB1N1P/PP3PP1/3R1RK1 w - - 0 1",
"r4kr1/pbNn1q1p/1p6/2p2BPQ/5B2/8/P6P/b4RK1 w - - 0 1",
"3r1k2/r1q2p1Q/pp2B3/4P3/1P1p4/2N5/P1P3PP/5R1K w - - 0 1",
"1Q6/5pp1/1B2p1k1/3pPn1p/1b1P4/2r3PN/2q2PKP/R7 b - - 0 1",
"3q4/1p3p1k/1P1prPp1/P1rNn1Qp/8/7R/6PP/3R2K1 w - - 0 1",
"r1b2r2/4nn1k/1q2PQ1p/5p2/pp5R/5N2/5PPP/5RK1 w - - 0 1",
"6rk/1b6/p5pB/1q2P2Q/4p2P/6R1/PP4PK/3r4 w - - 0 1",
"8/2r5/1k5p/1pp4P/8/K2P4/PR2QB2/2q5 b - - 0 1",
"3r4/pk3pq1/Nb2p2p/3n4/2QP4/6P1/1P3PBP/5RK1 w - - 0 1",
"3q1r2/pb3pp1/1p6/3pP1Nk/2r2Q2/8/Pn3PP1/3RR1K1 w - - 0 1",
"5qrk/5p1n/pp3p1Q/2pPp3/2P1P1rN/2P4R/P5P1/2B3K1 w - - 0 1",
"8/6pk/pb5p/8/1P2qP2/P3p3/2r2PNP/1QR3K1 b - - 0 1",
"rn3rk1/1p3pB1/p4b2/q4P1p/6Q1/1B6/PPp2P1P/R1K3R1 w - - 0 1",
"b3n1k1/5pP1/2N5/pp1P4/4Bb2/qP4QP/5P1K/8 w - - 0 1",
"4b1k1/2r2p2/1q1pnPpQ/7p/p3P2P/pN5B/P1P5/1K1R2R1 w - - 0 1",
"4r2k/pp2q2b/2p2p1Q/4rP2/P7/1B5P/1P2R1R1/7K w - - 0 1",
"r2r2k1/1q4p1/ppb3p1/2bNp3/P1Q5/1N5R/1P4BP/n6K w - - 0 1",
"6rk/1pqbbp1p/p3p2Q/6R1/4N1nP/3B4/PPP5/2KR4 w - - 0 1",
"r5k1/1b2q1p1/p2bp1Qp/1pp5/P5P1/3B4/1PP2P1P/R4RK1 b - - 0 1",
"r3r1n1/pp3pk1/2q2p1p/P2NP3/2p1QP2/8/1P5P/1B1R3K w - - 0 1",
"3r1r1k/q2n3p/b1p2ppQ/p1n1p3/Pp2P3/1B1PBR2/1PPN2PP/R5K1 w - - 0 1",
"r3r1k1/7p/2pRR1p1/p7/2P5/qnQ1P1P1/6BP/6K1 w - - 0 1",
"rk6/N4ppp/Qp2q3/3p4/8/8/5PPP/2R3K1 w - - 0 1",
"r4b1r/pppq2pp/2n1b1k1/3n4/2Bp4/5Q2/PPP2PPP/RNB1R1K1 w - - 0 1",
"r6r/pp3pk1/2p2Rp1/2p1P2B/3bQ3/6PK/7P/6q1 w - - 0 1",
"6rk/p1pb1p1p/2pp1P2/2b1n2Q/4PR2/3B4/PPP1K2P/RNB3q1 w - - 0 1",
"rn3rk1/2qp2pp/p3P3/1p1b4/3b4/3B4/PPP1Q1PP/R1B2R1K w - - 0 1",
"2R3nk/3r2b1/p2pr1Q1/4pN2/1P6/P6P/q7/B4RK1 w - - 0 1",
"1r2qrk1/p4p1p/bp1p1Qp1/n1ppP3/P1P5/2PB1PN1/6PP/R4RK1 w - - 0 1",
"r5k1/p1p3bp/1p1p4/2PP2qp/1P6/1Q1bP3/PB3rPP/R2N2RK b - - 0 1",
"4k3/r2bnn1r/1q2pR1p/p2pPp1B/2pP1N1P/PpP1B3/1P4Q1/5KR1 w - - 0 1",
"2q2r1k/5Qp1/4p1P1/3p4/r6b/7R/5BPP/5RK1 w - - 0 1",
"5r1k/1q4bp/3pB1p1/2pPn1B1/1r6/1p5R/1P2PPQP/R5K1 w - - 0 1",
"4Q3/1b5r/1p1kp3/5p1r/3p1nq1/P4NP1/1P3PB1/2R3K1 w - - 0 1",
"r1b2k1r/2q1b3/p3ppBp/2n3B1/1p6/2N4Q/PPP3PP/2KRR3 w - - 0 1",
"6r1/r5PR/2p3R1/2Pk1n2/3p4/1P1NP3/4K3/8 w - - 0 1",
"r4qk1/2p4p/p1p1N3/2bpQ3/4nP2/8/PPP3PP/5R1K b - - 0 1",
"r2n1rk1/1ppb2pp/1p1p4/3Ppq1n/2B3P1/2P4P/PP1N1P1K/R2Q1RN1 b - - 0 1",
"r1b2rk1/pp1p1p1p/2n3pQ/5qB1/8/2P5/P4PPP/4RRK1 w - - 0 1",
"r3q2k/p2n1r2/2bP1ppB/b3p2Q/N1Pp4/P5R1/5PPP/R5K1 w - - 0 1",
"6r1/3p2qk/4P3/1R5p/3b1prP/3P2B1/2P1QP2/6RK b - - 0 1",
"3rr2k/pp1b2b1/4q1pp/2Pp1p2/3B4/1P2QNP1/P6P/R4RK1 w - - 0 1",
"r1b2rk1/2p2ppp/p7/1p6/3P3q/1BP3bP/PP3QP1/RNB1R1K1 w - - 0 1",
"1rb2RR1/p1p3p1/2p3k1/5p1p/8/3N1PP1/PP5r/2K5 w - - 0 1",
"3q2r1/4n2k/p1p1rBpp/PpPpPp2/1P3P1Q/2P3R1/7P/1R5K w - - 0 1",
"2bqr2k/1r1n2bp/pp1pBp2/2pP1PQ1/P3PN2/1P4P1/1B5P/R3R1K1 w - - 0 1",
"2r2k2/pb4bQ/1p1qr1pR/3p1pB1/3Pp3/2P5/PPB2PP1/1K5R w - - 0 1",
"r5k1/q4ppp/rnR1pb2/1Q1p4/1P1P4/P4N1P/1B3PP1/2R3K1 w - - 0 1",
"r1brn3/p1q4p/p1p2P1k/2PpPPp1/P7/1Q2B2P/1P6/1K1R1R2 w - - 0 1",
"7k/2p3pp/p7/1p1p4/PP2pr2/B1P3qP/4N1B1/R1Qn2K1 b - - 0 1",
"5rk1/4Rp1p/1q1pBQp1/5r2/1p6/1P4P1/2n2P2/3R2K1 w - - 0 1",
"2Q5/pp2rk1p/3p2pq/2bP1r2/5RR1/1P2P3/PB3P1P/7K w - - 0 1",
"5b2/1p3rpk/p1b3Rp/4B1RQ/3P1p1P/7q/5P2/6K1 w - - 0 1",
"3Rr2k/pp4pb/2p4p/2P1n3/1P1Q3P/4r1q1/PB4B1/5RK1 b - - 0 1",
"8/2Q1R1bk/3r3p/p2N1p1P/P2P4/1p3Pq1/1P4P1/1K6 w - - 0 1",
"3r3k/1p3Rpp/p2nn3/3N4/8/1PB1PQ1P/q4PP1/6K1 w - - 0 1",
"3r1kr1/8/p2q2p1/1p2R3/1Q6/8/PPP5/1K4R1 w - - 0 1",
"3r3k/1b2b1pp/3pp3/p3n1P1/1pPqP2P/1P2N2R/P1QB1r2/2KR3B b - - 0 1",
"5rkr/1p2Qpbp/pq1P4/2nB4/5p2/2N5/PPP4P/1K1RR3 w - - 0 1",
];

},{}],37:[function(require,module,exports){
module.exports = [
"2R5/4bppk/1p1p4/5R1P/4PQ2/5P2/r4q1P/7K w - - 0 1",
"7r/1qr1nNp1/p1k4p/1pB5/4P1Q1/8/PP3PPP/6K1 w - - 0 1",
"r1b2k1r/ppppq3/5N1p/4P2Q/4PP2/1B6/PP5P/n2K2R1 w - - 0 1",
"2kr1b1r/ppq5/1np1pp2/P3Pn2/1P3P2/2P2Qp1/6P1/RNB1RBK1 b - - 0 1",
"r2qrb2/p1pn1Qp1/1p4Nk/4PR2/3n4/7N/P5PP/R6K w - - 0 1",
"r1bk3r/pppq1ppp/5n2/4N1N1/2Bp4/Bn6/P4PPP/4R1K1 w - - 0 1",
"1rb2k2/1pq3pQ/pRpNp3/P1P2n2/3P1P2/4P3/6PP/6K1 w - - 0 1",
"1rr4k/7p/p3Qpp1/3p1P2/8/1P1q3P/PK4P1/3B3R b - - 0 1",
"2r2bk1/pb3ppp/1p6/n7/q2P4/P1P1R2Q/B2B1PPP/R5K1 w - - 0 1",
"r4rk1/pp4b1/6pp/2pP4/5pKn/P2B2N1/1PQP1Pq1/1RB2R2 b - - 0 1",
"r4r1k/p2p3p/bp1Np3/4P3/2P2nR1/3B1q2/P1PQ4/2K3R1 w - - 0 1",
"3r2k1/p1p2p2/bp2p1nQ/4PB1P/2pr3q/6R1/PP3PP1/3R2K1 w - - 0 1",
"r2q1rk1/ppp1n1p1/1b1p1p2/1B1N2BQ/3pP3/2P3P1/PP3P2/R5K1 w - - 0 1",
"5rk1/pR4pp/4p2r/2p1n2q/2P1p3/P1Q1P1P1/1P3P1P/R1B2NK1 b - - 0 1",
"8/p2pQ2p/2p1p2k/4Bqp1/2P2P2/P6P/6PK/3r4 w - - 0 1",
"4r1k1/5p1p/p4PpQ/4q3/P6P/6P1/3p3K/8 b - - 0 1",
"r1br1b2/4pPk1/1p1q3p/p2PR3/P1P2N2/1P1Q2P1/5PBK/4R3 w - - 0 1",
"7r/3kbp1p/1Q3R2/3p3q/p2P3B/1P5K/P6P/8 w - - 0 1",
"2r4b/pp1kprNp/3pNp1P/q2P2p1/2n5/4B2Q/PPP3R1/1K1R4 w - - 0 1",
"r6r/pp1Q2pp/2p4k/4R3/5P2/2q5/P1P3PP/R5K1 w - - 0 1",
"2rqrb2/p2nk3/bp2pnQp/4B1p1/3P4/P1N5/1P3PPP/1B1RR1K1 w - - 0 1",
"8/pp2Q1p1/2p3kp/6q1/5n2/1B2R2P/PP1r1PP1/6K1 w - - 0 1",
"k1n3rr/Pp3p2/3q4/3N4/3Pp2p/1Q2P1p1/3B1PP1/R4RK1 w - - 0 1",
"3r4/pp5Q/B7/k7/3q4/2b5/P4PPP/1R4K1 w - - 0 1",
"4Rnk1/pr3ppp/1p3q2/5NQ1/2p5/8/P4PPP/6K1 w - - 0 1",
"4qk2/6p1/p7/1p1Qp3/r1P2b2/1K5P/1P6/4RR2 w - - 0 1",
"3r1rk1/ppqn3p/1npb1P2/5B2/2P5/2N3B1/PP2Q1PP/R5K1 w - - 0 1",
"r3rk2/6b1/q2pQBp1/1NpP4/1n2PP2/nP6/P3N1K1/R6R w - - 0 1",
"r5k1/pp2ppb1/3p4/q3P1QR/6b1/r2B1p2/1PP5/1K4R1 w - - 0 1",
"2b5/3qr2k/5Q1p/P3B3/1PB1PPp1/4K1P1/8/8 w - - 0 1",
"6k1/5pp1/p3p2p/3bP2P/6QN/8/rq4P1/2R4K w - - 0 1",
"N1bk4/pp1p1Qpp/8/2b5/3n3q/8/PPP2RPP/RNB1rBK1 b - - 0 1",
"r3br1k/pp5p/4B1p1/4NpP1/P2Pn3/q1PQ3R/7P/3R2K1 w - - 0 1",
"6kr/pp2r2p/n1p1PB1Q/2q5/2B4P/2N3p1/PPP3P1/7K w - - 0 1",
"2r3r1/7p/b3P2k/p1bp1p1B/P2N1P2/1P4Q1/2P4P/7K w - - 0 1",
"1Q6/1R3pk1/4p2p/p3n3/P3P2P/6PK/r5B1/3q4 b - - 0 1",
"5rk1/1p1n2bp/p7/P2P2p1/4R3/4N1Pb/2QB1q1P/4R2K b - - 0 1",
"1R6/5qpk/4p2p/1Pp1Bp1P/r1n2QP1/5PK1/4P3/8 w - - 0 1",
"4k1r1/pp2bp2/2p5/3PPP2/1q6/7r/1P2Q2P/2RR3K b - - 0 1",
"r1bk1r2/pp1n2pp/3NQ3/1P6/8/2n2PB1/q1B3PP/3R1RK1 w - - 0 1",
"rn3rk1/pp3p2/2b1pnp1/4N3/3q4/P1NB3R/1P1Q1PPP/R5K1 w - - 0 1",
"2kr1b1r/pp3ppp/2p1b2q/4B3/4Q3/2PB2R1/PPP2PPP/3R2K1 w - - 0 1",
"3qrk2/p1r2pp1/1p2pb2/nP1bN2Q/3PN3/P6R/5PPP/R5K1 w - - 0 1",
"5r1k/1p4pp/p2N4/3Qp3/P2n1bP1/5P1q/1PP2R1P/4R2K w - - 0 1",
"6r1/p5bk/4N1pp/2B1p3/4Q2N/8/2P2KPP/q7 w - - 0 1",
"4r1k1/5bpp/2p5/3pr3/8/1B3pPq/PPR2P2/2R2QK1 b - - 0 1",
"5r2/pq4k1/1pp1Qn2/2bp1PB1/3R1R2/2P3P1/P6P/6K1 w - - 0 1",
"r3k3/3b3R/1n1p1b1Q/1p1PpP1N/1P2P1P1/6K1/2B1q3/8 w - - 0 1",
"5qr1/kp2R3/5p2/1b1N1p2/5Q2/P5P1/6BP/6K1 w - - 0 1",
"7k/1p1P1Qpq/p6p/5p1N/6N1/7P/PP1r1PPK/8 w - - 0 1",
"2b3rk/1q3p1p/p1p1pPpQ/4N3/2pP4/2P1p1P1/1P4PK/5R2 w - - 0 1",
"r2qrk2/p5b1/2b1p1Q1/1p1pP3/2p1nB2/2P1P3/PP3P2/2KR3R w - - 0 1",
"r4k2/1pp3q1/3p1NnQ/p3P3/2P3p1/8/PP6/2K4R w - - 0 1",
"r5rk/pp1np1bn/2pp2q1/3P1bN1/2P1N2Q/1P6/PB2PPBP/3R1RK1 w - - 0 1",
"r4n1k/ppBnN1p1/2p1p3/6Np/q2bP1b1/3B4/PPP3PP/R4Q1K w - - 0 1",
"r3nrkq/pp3p1p/2p3nQ/5NN1/8/3BP3/PPP3PP/2KR4 w - - 0 1",
"r3QnR1/1bk5/pp5q/2b5/2p1P3/P7/1BB4P/3R3K w - - 0 1",
"1r4k1/3b2pp/1b1pP2r/pp1P4/4q3/8/PP4RP/2Q2R1K b - - 0 1",
"r2Nqb1r/pQ1bp1pp/1pn1p3/1k1p4/2p2B2/2P5/PPP2PPP/R3KB1R w - - 0 1",
"rq2r1k1/1b3pp1/p3p1n1/1p4BQ/8/7R/PP3PPP/4R1K1 w - - 0 1",
"3q1r2/6k1/p2pQb2/4pR1p/4B3/2P3P1/P4PK1/8 w - - 0 1",
"3R1rk1/1pp2pp1/1p6/8/8/P7/1q4BP/3Q2K1 w - - 0 1",
"rqb2bk1/3n2pr/p1pp2Qp/1p6/3BP2N/2N4P/PPP3P1/2KR3R w - - 0 1",
"5k1r/4npp1/p3p2p/3nP2P/3P3Q/3N4/qB2KPP1/2R5 w - - 0 1",
"r3r1k1/1b6/p1np1ppQ/4n3/4P3/PNB4R/2P1BK1P/1q6 w - - 0 1",
"2Q5/4ppbk/3p4/3P1NPp/4P3/5NB1/5PPK/rq6 w - - 0 1",
"r6k/pb4bp/5Q2/2p1Np2/1qB5/8/P4PPP/4RK2 w - - 0 1",
"3Q4/6kp/4q1p1/2pnN2P/1p3P2/1Pn3P1/6BK/8 w - - 0 1",
"r3q1k1/5p2/3P2pQ/Ppp5/1pnbN2R/8/1P4PP/5R1K w - - 0 1",
"2r2b1k/p2Q3p/b1n2PpP/2p5/3r1BN1/3q2P1/P4PB1/R3R1K1 w - - 0 1",
"r2r2k1/1q2bpB1/pp1p1PBp/8/P7/7Q/1PP3PP/R6K w - - 0 1",
"r3r2k/pb1n3p/1p1q1pp1/4p1B1/2BP3Q/2P1R3/P4PPP/4R1K1 w - - 0 1",
"2rr2k1/1b3p1p/1p1b2p1/p1qP3Q/3R4/1P6/PB3PPP/1B2R1K1 w - - 0 1",
"2r5/3nbkp1/2q1p1p1/1p1n2P1/3P4/2p1P1NQ/1P1B1P2/1B4KR w - - 0 1",
"rnbqr1k1/ppp3p1/4pR1p/4p2Q/3P4/B1PB4/P1P3PP/R5K1 w - - 0 1",
"b3r1k1/p4RbN/P3P1p1/1p6/1qp4P/4Q1P1/5P2/5BK1 w - - 0 1",
"q1r2b1k/rb4np/1p2p2N/pB1n4/6Q1/1P2P3/PB3PPP/2RR2K1 w - - 0 1",
"5rbk/2pq3p/5PQR/p7/3p3R/1P4N1/P5PP/6K1 w - - 0 1",
"2r1k2r/pR2p1bp/2n1P1p1/8/2QP4/q2b1N2/P2B1PPP/4K2R w - - 0 1",
"k2n1q1r/p1pB2p1/P4pP1/1Qp1p3/8/2P1BbN1/P7/2KR4 w - - 0 1",
"4r3/p2r1p1k/3q1Bpp/4P3/1PppR3/P5P1/5P1P/2Q3K1 w - - 0 1",
"2rr1k2/pb4p1/1p1qpp2/4R2Q/3n4/P1N5/1P3PPP/1B2R1K1 w - - 0 1",
"1r2q3/1R6/3p1kp1/1ppBp1b1/p3Pp2/2PP4/PP3P2/5K1Q w - - 0 1",
"5rk1/pp2Rppp/nqp5/8/5Q2/6PB/PPP2P1P/6K1 w - - 0 1",
"r2qk2r/pb4pp/1n2Pb2/2B2Q2/p1p5/2P5/2B2PPP/RN2R1K1 w - - 0 1",
"r1bq3r/ppp1b1kp/2n3p1/3B3Q/3p4/8/PPP2PPP/RNB2RK1 w - - 0 1",
"2q4k/5pNP/p2p1BpP/4p3/1p2b3/1P6/P1r2R2/1K4Q1 w - - 0 1",
"6k1/2rB1p2/RB1p2pb/3Pp2p/4P3/3K2NQ/5Pq1/8 b - - 0 1",
"2bk4/6b1/2pNp3/r1PpP1P1/P1pP1Q2/2rq4/7R/6RK w - - 0 1",
"5bk1/1Q3p2/1Np4p/6p1/8/1P2P1PK/4q2P/8 b - - 0 1",
"5rk1/1p1q2bp/p2pN1p1/2pP2Bn/2P3P1/1P6/P4QKP/5R2 w - - 0 1",
"3r3r/p1pqppbp/1kN3p1/2pnP3/Q5b1/1NP5/PP3PPP/R1B2RK1 w - - 0 1",
"1Q1R4/5k2/6pp/2N1bp2/1Bn5/2P2P1P/1r3PK1/8 b - - 0 1",
"2r1rk2/p1q3pQ/4p3/1pppP1N1/7p/4P2P/PP3P2/1K4R1 w - - 0 1",
"4q3/pb5p/1p2p2k/4N3/PP1QP3/2P2PP1/6K1/8 w - - 0 1",
"2bq1k1r/r5pp/p2b1Pn1/1p1Q4/3P4/1B6/PP3PPP/2R1R1K1 w - - 0 1",
"3r3k/6pp/p3Qn2/P3N3/4q3/2P4P/5PP1/6K1 w - - 0 1",
"6k1/6p1/p5p1/3pB3/1p1b4/2r1q1PP/P4R1K/5Q2 w - - 0 1",
"3r1b2/3P1p2/p3rpkp/2q2N2/5Q1R/2P3BP/P5PK/8 w - - 0 1",
"1q5r/1b1r1p1k/2p1pPpb/p1Pp4/3B1P1Q/1P4P1/P4KB1/2RR4 w - - 0 1",
"4r1rk/pQ2P2p/P7/2pqb3/3p1p2/8/3B2PP/4RRK1 b - - 0 1",
"1r2Rr2/3P1p1k/5Rpp/qp6/2pQ4/7P/5PPK/8 w - - 0 1",
"r1bk2nr/ppp2ppp/3p4/bQ3q2/3p4/B1P5/P3BPPP/RN1KR3 w - - 0 1",
"r4kr1/1b2R1n1/pq4p1/4Q3/1p4P1/5P2/PPP4P/1K2R3 w - - 0 1",
"6k1/5p2/4nQ1P/p4N2/1p1b4/7K/PP3r2/8 w - - 0 1",
"2r2rk1/pp3nbp/2p1bq2/2Pp4/1P1P1PP1/P1NB4/1BQK4/7R w - - 0 1",
"5k2/6r1/p7/2p1P3/1p2Q3/8/1q4PP/3R2K1 w - - 0 1",
"r2q4/pp1rpQbk/3p2p1/2pPP2p/5P2/2N5/PPP2P2/2KR3R w - - 0 1",
"4R3/1p4rk/6p1/2pQBpP1/p1P1pP2/Pq6/1P6/K7 w - - 0 1",
"2b2k2/2p2r1p/p2pR3/1p3PQ1/3q3N/1P6/2P3PP/5K2 w - - 0 1",
"r1b1r3/ppq2pk1/2n1p2p/b7/3PB3/2P2Q2/P2B1PPP/1R3RK1 w - - 0 1",
"2r5/2k4p/1p2pp2/1P2qp2/8/Q5P1/4PP1P/R5K1 w - - 0 1",
"4q1rk/pb2bpnp/2r4Q/1p1p1pP1/4NP2/1P3R2/PBn4P/RB4K1 w - - 0 1",
"2r4k/p4rRp/1p1R3B/5p1q/2Pn4/5p2/PP4QP/1B5K w - - 0 1",
"r1b1kb1r/pp2nppp/2pQ4/8/2q1P3/8/P1PB1PPP/3RK2R w - - 0 1",
"2r1b3/1pp1qrk1/p1n1P1p1/7R/2B1p3/4Q1P1/PP3PP1/3R2K1 w - - 0 1",
"5rk1/pbppq1bN/1pn1p1Q1/6N1/3P4/8/PPP2PP1/2K4R w - - 0 1",
"qn1r1k2/2r1b1np/pp1pQ1p1/3P2P1/1PP2P2/7R/PB4BP/4R1K1 w - - 0 1",
"r2r4/1p1bn2p/pn2ppkB/5p2/4PQN1/6P1/PPq2PBP/R2R2K1 w - - 0 1",
"3k1r2/2pb4/2p3P1/2Np1p2/1P6/4nN1R/2P1q3/Q5K1 w - - 0 1",
"5rk1/ppp3pp/8/3pQ3/3P2b1/5rPq/PP1P1P2/R1BB1RK1 b - - 0 1",
"r6r/1p2pp1k/p1b2q1p/4pP2/6QR/3B2P1/P1P2K2/7R w - - 0 1",
"2k4r/ppp2p2/2b2B2/7p/6pP/2P1q1bP/PP3N2/R4QK1 b - - 0 1",
"2QR4/6b1/1p4pk/7p/5n1P/4rq2/5P2/5BK1 w - - 0 1",
"rnb2b1r/p3kBp1/3pNn1p/2pQN3/1p2PP2/4B3/Pq5P/4K3 w - - 0 1",
"2rq1n1Q/p1r2k2/2p1p1p1/1p1pP3/3P2p1/2N4R/PPP2P2/2K4R w - - 0 1",
"r2Q1q1k/pp5r/4B1p1/5p2/P7/4P2R/7P/1R4K1 w - - 0 1",
"3k4/2p1q1p1/8/1QPPp2p/4Pp2/7P/6P1/7K w - - 0 1",
"8/1p3Qb1/p5pk/P1p1p1p1/1P2P1P1/2P1N2n/5P1P/4qB1K w - - 0 1",
"1r3k2/3Rnp2/6p1/6q1/p1BQ1p2/P1P5/1P3PP1/6K1 w - - 0 1",
"2rn2k1/1q1N1pbp/4pB1P/pp1pPn2/3P4/1Pr2N2/P2Q1P1K/6R1 w - - 0 1",
"5k2/p2Q1pp1/1b5p/1p2PB1P/2p2P2/8/PP3qPK/8 w - - 0 1",
"r3kb1r/pb6/2p2p1p/1p2pq2/2pQ3p/2N2B2/PP3PPP/3RR1K1 w - - 0 1",
"r1b1kb1r/pp1n1pp1/1qp1p2p/6B1/2PPQ3/3B1N2/P4PPP/R4RK1 w - - 0 1",
"rn3k1r/pbpp1Bbp/1p4pN/4P1B1/3n4/2q3Q1/PPP2PPP/2KR3R w - - 0 1",
"3R4/p1r3rk/1q2P1p1/5p1p/1n6/1B5P/P2Q2P1/3R3K w - - 0 1",
"8/6bk/1p6/5pBp/1P2b3/6QP/P5PK/5q2 b - - 0 1",
"r1bqkb2/6p1/p1p4p/1p1N4/8/1B3Q2/PP3PPP/3R2K1 w - - 0 1",
"5rrk/5pb1/p1pN3p/7Q/1p2PP1R/1q5P/6P1/6RK w - - 0 1",
"rnbq1bnr/pp1p1p1p/3pk3/3NP1p1/5p2/5N2/PPP1Q1PP/R1B1KB1R w - - 0 1",
"1r3rk1/1pnnq1bR/p1pp2B1/P2P1p2/1PP1pP2/2B3P1/5PK1/2Q4R w - - 0 1",
"2Q5/1p3p2/3b1k1p/3Pp3/4B1R1/4q1P1/r4PK1/8 w - - 0 1",
"r1b3kr/ppp1Bp1p/1b6/n2P4/2p3q1/2Q2N2/P4PPP/RN2R1K1 w - - 0 1",
"1R1br1k1/pR5p/2p3pB/2p2P2/P1qp2Q1/2n4P/P5P1/6K1 w - - 0 1",
"r1b2n2/2q3rk/p3p2n/1p3p1P/4N3/PN1B1P2/1PPQ4/2K3R1 w - - 0 1",
"r3q3/ppp3k1/3p3R/5b2/2PR3Q/2P1PrP1/P7/4K3 w - - 0 1",
"2r3k1/3b2b1/5pp1/3P4/pB2P3/2NnqN2/1P2B2Q/5K1R b - - 0 1",
"6rk/2p2p1p/p2q1p1Q/2p1pP2/1nP1R3/1P5P/P5P1/2B3K1 w - - 0 1",
"1r2bk2/1p3ppp/p1n2q2/2N5/1P6/P3R1P1/5PBP/4Q1K1 w - - 0 1",
"r3rk2/5pn1/pb1nq1pR/1p2p1P1/2p1P3/2P2QN1/PPBB1P2/2K4R w - - 0 1",
"3rkq1r/1pQ2p1p/p3bPp1/3pR3/8/8/PPP2PP1/1K1R4 w - - 0 1",
"r1bq3r/ppp1nQ2/2kp1N2/6N1/3bP3/8/P2n1PPP/1R3RK1 w - - 0 1",
"n2q1r1k/4bp1p/4p3/4P1p1/2pPNQ2/2p4R/5PPP/2B3K1 w - - 0 1",
"2Rr1qk1/5ppp/p2N4/P7/5Q2/8/1r4PP/5BK1 w - - 0 1",
"8/6k1/3p1rp1/3Bp1p1/1pP1P1K1/4bPR1/P5Q1/4q3 b - - 0 1",
"r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1",
"5qr1/pr3p1k/1n1p2p1/2pPpP1p/P3P2Q/2P1BP1R/7P/6RK w - - 0 1",
"rn2kb1r/pp2pp1p/2p2p2/8/8/3Q1N2/qPPB1PPP/2KR3R w - - 0 1",
"7k/pb4rp/2qp1Q2/1p3pP1/np3P2/3PrN1R/P1P4P/R3N1K1 w - - 0 1",
"8/p4pk1/6p1/3R4/3nqN1P/2Q3P1/5P2/3r1BK1 b - - 0 1",
"r3rk2/p3bp2/2p1qB2/1p1nP1RP/3P4/2PQ4/P5P1/5RK1 w - - 0 1",
"6k1/pp3ppp/4p3/2P3b1/bPP3P1/3K4/P3Q1q1/1R5R b - - 0 1",
"r1b2rk1/p1qnbp1p/2p3p1/2pp3Q/4pP2/1P1BP1R1/PBPP2PP/RN4K1 w - - 0 1",
"3r4/p4Q1p/1p2P2k/2p3pq/2P2B2/1P2p2P/P5P1/6K1 w - - 0 1",
"6k1/8/3q1p2/p5p1/P1b1P2p/R1Q4P/5KN1/3r4 b - - 0 1",
];

},{}],38:[function(require,module,exports){
module.exports = [
"r4r1k/p2p3p/bp1Np3/4P3/2P2nR1/3B1q2/P1PQ4/2K3R1 w - - 0 1",
"3r2k1/p1p2p2/bp2p1nQ/4PB1P/2pr3q/6R1/PP3PP1/3R2K1 w - - 0 1",
"2r3k1/p6R/1p2p1p1/nK4N1/P4P2/3n4/4r1P1/7R b - - 0 1",
"N1bk4/pp1p1Qpp/8/2b5/3n3q/8/PPP2RPP/RNB1rBK1 b - - 0 1",
"5rk1/1p1n2bp/p7/P2P2p1/4R3/4N1Pb/2QB1q1P/4R2K b - - 0 1",
"4k1r1/pp2bp2/2p5/3PPP2/1q6/7r/1P2Q2P/2RR3K b - - 0 1",
"8/4R1pk/p5p1/8/1pB1n1b1/1P2b1P1/P4r1P/5R1K b - - 0 1",
"2kr1b1r/pp3ppp/2p1b2q/4B3/4Q3/2PB2R1/PPP2PPP/3R2K1 w - - 0 1",
"r3k3/3b3R/1n1p1b1Q/1p1PpP1N/1P2P1P1/6K1/2B1q3/8 w - - 0 1",
"r3QnR1/1bk5/pp5q/2b5/2p1P3/P7/1BB4P/3R3K w - - 0 1",
"1r4k1/3b2pp/1b1pP2r/pp1P4/4q3/8/PP4RP/2Q2R1K b - - 0 1",
"2r2b1k/p2Q3p/b1n2PpP/2p5/3r1BN1/3q2P1/P4PB1/R3R1K1 w - - 0 1",
"r4R2/1b2n1pp/p2Np1k1/1pn5/4pP1P/8/PPP1B1P1/2K4R w - - 0 1",
"b3r1k1/p4RbN/P3P1p1/1p6/1qp4P/4Q1P1/5P2/5BK1 w - - 0 1",
"q1r2b1k/rb4np/1p2p2N/pB1n4/6Q1/1P2P3/PB3PPP/2RR2K1 w - - 0 1",
"2r1k2r/pR2p1bp/2n1P1p1/8/2QP4/q2b1N2/P2B1PPP/4K2R w - - 0 1",
"1k5r/3R1pbp/1B2p3/2NpPn2/5p2/8/1PP3PP/6K1 w - - 0 1",
"2rr1k2/pb4p1/1p1qpp2/4R2Q/3n4/P1N5/1P3PPP/1B2R1K1 w - - 0 1",
"2q4k/5pNP/p2p1BpP/4p3/1p2b3/1P6/P1r2R2/1K4Q1 w - - 0 1",
"6k1/2rB1p2/RB1p2pb/3Pp2p/4P3/3K2NQ/5Pq1/8 b - - 0 1",
"5rk1/1p1q2bp/p2pN1p1/2pP2Bn/2P3P1/1P6/P4QKP/5R2 w - - 0 1",
"3rk2b/5R1P/6B1/8/1P3pN1/7P/P2pbP2/6K1 w - - 0 1",
"2bq1k1r/r5pp/p2b1Pn1/1p1Q4/3P4/1B6/PP3PPP/2R1R1K1 w - - 0 1",
"4B3/6R1/1p5k/p2r3N/Pn1p2P1/7P/1P3P2/6K1 w - - 0 1",
"1r2Rr2/3P1p1k/5Rpp/qp6/2pQ4/7P/5PPK/8 w - - 0 1",
"r4kr1/1b2R1n1/pq4p1/4Q3/1p4P1/5P2/PPP4P/1K2R3 w - - 0 1",
"2b2k2/2p2r1p/p2pR3/1p3PQ1/3q3N/1P6/2P3PP/5K2 w - - 0 1",
"4q1rk/pb2bpnp/2r4Q/1p1p1pP1/4NP2/1P3R2/PBn4P/RB4K1 w - - 0 1",
"2r4k/p4rRp/1p1R3B/5p1q/2Pn4/5p2/PP4QP/1B5K w - - 0 1",
"r2r4/1p1bn2p/pn2ppkB/5p2/4PQN1/6P1/PPq2PBP/R2R2K1 w - - 0 1",
"5r1k/7b/4B3/6K1/3R1N2/8/8/8 w - - 0 1",
"r5nr/6Rp/p1NNkp2/1p3b2/2p5/5K2/PP2P3/3R4 w - - 0 1",
"1r3k2/3Rnp2/6p1/6q1/p1BQ1p2/P1P5/1P3PP1/6K1 w - - 0 1",
"2rn2k1/1q1N1pbp/4pB1P/pp1pPn2/3P4/1Pr2N2/P2Q1P1K/6R1 w - - 0 1",
"3R4/p1r3rk/1q2P1p1/5p1p/1n6/1B5P/P2Q2P1/3R3K w - - 0 1",
"r1b2n2/2q3rk/p3p2n/1p3p1P/4N3/PN1B1P2/1PPQ4/2K3R1 w - - 0 1",
"r3q3/ppp3k1/3p3R/5b2/2PR3Q/2P1PrP1/P7/4K3 w - - 0 1",
"1r2bk2/1p3ppp/p1n2q2/2N5/1P6/P3R1P1/5PBP/4Q1K1 w - - 0 1",
"2Rr1qk1/5ppp/p2N4/P7/5Q2/8/1r4PP/5BK1 w - - 0 1",
"7k/pb4rp/2qp1Q2/1p3pP1/np3P2/3PrN1R/P1P4P/R3N1K1 w - - 0 1",
"8/p4pk1/6p1/3R4/3nqN1P/2Q3P1/5P2/3r1BK1 b - - 0 1",
"4r3/pbpn2n1/1p1prp1k/8/2PP2PB/P5N1/2B2R1P/R5K1 w - - 0 1",
"r4r1k/pp1b2pn/8/3pR3/5N2/3Q4/Pq3PPP/5RK1 w - - 0 1",
"1r2r1k1/5p2/5Rp1/4Q2p/P2B2qP/1NP5/1KP5/8 w - - 0 1",
"1r3rk1/1nqb2n1/6R1/1p1Pp3/1Pp3p1/2P4P/2B2QP1/2B2RK1 w - - 0 1",
"r7/1p3Q2/2kpr2p/p1p2Rp1/P3Pp2/1P3P2/1B2q1PP/3R3K w - - 0 1",
"1r3r2/1p5R/p1n2pp1/1n1B1Pk1/8/8/P1P2BPP/2K1R3 w - - 0 1",
"4k2r/1R3R2/p3p1pp/4b3/1BnNr3/8/P1P5/5K2 w - - 0 1",
"5q2/1ppr1br1/1p1p1knR/1N4R1/P1P1PP2/1P6/2P4Q/2K5 w - - 0 1",
"7k/3qbR1n/r5p1/3Bp1P1/1p1pP1r1/3P2Q1/1P5K/2R5 w - - 0 1",
"4n3/pbq2rk1/1p3pN1/8/2p2Q2/Pn4N1/B4PP1/4R1K1 w - - 0 1",
"8/1p2p1kp/2rRB3/pq2n1Pp/4P3/8/PPP2Q2/2K5 w - - 0 1",
"3r1rk1/1q2b1n1/p1b1pRpQ/1p2P3/3BN3/P1PB4/1P4PP/4R2K w - - 0 1",
"2b2r1k/1p2R3/2n2r1p/p1P1N1p1/2B3P1/P6P/1P3R2/6K1 w - - 0 1",
"1qr2bk1/pb3pp1/1pn3np/3N2NQ/8/P7/BP3PPP/2B1R1K1 w - - 0 1",
"2rk4/5R2/3pp1Q1/pb2q2N/1p2P3/8/PPr5/1K1R4 w - - 0 1",
"r4r1k/pp4R1/3pN1p1/3P2Qp/1q2Ppn1/8/6PP/5RK1 w - - 0 1",
"r2r1b1k/pR6/6pp/5Q2/3qB3/6P1/P3PP1P/6K1 w - - 0 1",
"r3rknQ/1p1R1pb1/p3pqBB/2p5/8/6P1/PPP2P1P/4R1K1 w - - 0 1",
"3rb1k1/ppq3p1/2p1p1p1/6P1/2Pr3R/1P1Q4/P1B4P/5RK1 w - - 0 1",
"5rk1/1bR2pbp/4p1p1/8/1p1P1PPq/1B2P2r/P2NQ2P/5RK1 b - - 0 1",
"3q1rk1/4bp1p/1n2P2Q/1p1p1p2/6r1/Pp2R2N/1B1P2PP/7K w - - 0 1",
"3nk1r1/1pq4p/p3PQpB/5p2/2r5/8/P4PPP/3RR1K1 w - - 0 1",
"6rk/5p1p/5p2/1p2bP2/1P2R2Q/2q1BBPP/5PK1/r7 w - - 0 1",
"1b4rk/4R1pp/p1b4r/2PB4/Pp1Q4/6Pq/1P3P1P/4RNK1 w - - 0 1",
"Q4R2/3kr3/1q3n1p/2p1p1p1/1p1bP1P1/1B1P3P/2PBK3/8 w - - 0 1",
"2rk2r1/3b3R/n3pRB1/p2pP1P1/3N4/1Pp5/P1K4P/8 w - - 0 1",
"2r5/2R5/3npkpp/3bN3/p4PP1/4K3/P1B4P/8 w - - 0 1",
"r2qr2k/pp1b3p/2nQ4/2pB1p1P/3n1PpR/2NP2P1/PPP5/2K1R1N1 w - - 0 1",
"1r3r1k/2R4p/q4ppP/3PpQ2/2RbP3/pP6/P2B2P1/1K6 w - - 0 1",
"2r3k1/pp3ppp/1qr2n2/3p1Q2/1P6/P2BP2P/5PP1/2R2RK1 w - - 0 1",
"5k2/p3Rr2/1p4pp/q4p2/1nbQ1P2/6P1/5N1P/3R2K1 w - - 0 1",
"r3r3/3R1Qp1/pqb1p2k/1p4N1/8/4P3/Pb3PPP/2R3K1 w - - 0 1",
"8/4k3/1p2p1p1/pP1pPnP1/P1rPq2p/1KP2R1N/8/5Q2 b - - 0 1",
"2q3k1/1p4pp/3R1r2/p2bQ3/P7/1N2B3/1PP3rP/R3K3 b - - 0 1",
"4rk2/5p1b/1p3R1K/p6p/2P2P2/1P6/2q4P/Q5R1 w - - 0 1",
"2r2bk1/2qn1ppp/pn1p4/5N2/N3r3/1Q6/5PPP/BR3BK1 w - - 0 1",
"6k1/pp3r2/2p4q/3p2p1/3Pp1b1/4P1P1/PP4RP/2Q1RrNK b - - 0 1",
"r5kr/pppN1pp1/1bn1R3/1q1N2Bp/3p2Q1/8/PPP2PPP/R5K1 w - - 0 1",
"1q1r1k2/1b2Rpp1/p1pQ3p/PpPp4/3P1NP1/1P3P1P/6K1/8 w - - 0 1",
"4r3/2RN4/p1r5/1k1p4/5Bp1/p2P4/1P4PK/8 w - - 0 1",
"r2Rnk1r/1p2q1b1/7p/6pQ/4Ppb1/1BP5/PP3BPP/2K4R w - - 0 1",
"r3n1k1/pb5p/4N1p1/2pr4/q7/3B3P/1P1Q1PP1/2B1R1K1 w - - 0 1",
"6k1/5p2/3P1Bpp/2b1P3/b1p2p2/p1P5/R5rP/2N1K3 b - - 0 1",
"r5rR/3Nkp2/4p3/1Q4q1/np1N4/8/bPPR2P1/2K5 w - - 0 1",
"6k1/1p2q2p/p3P1pB/8/1P2p3/2Qr2P1/P4P1P/2R3K1 w - - 0 1",
"4R3/2p2kpQ/3p3p/p2r2q1/8/1Pr2P2/P1P3PP/4R1K1 w - - 0 1",
"8/2k2r2/pp6/2p1R1Np/6pn/8/Pr4B1/3R3K w - - 0 1",
"5R2/4r1r1/1p4k1/p1pB2Bp/P1P4K/2P1p3/1P6/8 w - - 0 1",
"6k1/ppp2ppp/8/2n2K1P/2P2P1P/2Bpr3/PP4r1/4RR2 b - - 0 1",
"2qr2k1/4rppN/ppnp4/2pR3Q/2P2P2/1P4P1/PB5P/6K1 w - - 0 1",
"3R4/3Q1p2/q1rn2kp/4p3/4P3/2N3P1/5P1P/6K1 w - - 0 1",
"4kr2/3rn2p/1P4p1/2p5/Q1B2P2/8/P2q2PP/4R1K1 w - - 0 1",
"3q3r/r4pk1/pp2pNp1/3bP1Q1/7R/8/PP3PPP/3R2K1 w - - 0 1",
"rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/4KRp1/PPP3q1/RN1Q4 w - - 0 1",
"r1kq1b1r/5ppp/p4n2/2pPR1B1/Q7/2P5/P4PPP/1R4K1 w - - 0 1",
"2r5/2p2k1p/pqp1RB2/2r5/PbQ2N2/1P3PP1/2P3P1/4R2K w - - 0 1",
"6k1/5p2/R5p1/P6n/8/5PPp/2r3rP/R4N1K b - - 0 1",
"r3kr2/6Qp/1Pb2p2/pB3R2/3pq2B/4n3/1P4PP/4R1K1 w - - 0 1",
"5rk1/n1p1R1bp/p2p4/1qpP1QB1/7P/2P3P1/PP3P2/6K1 w - - 0 1",
"2rrk3/QR3pp1/2n1b2p/1BB1q3/3P4/8/P4PPP/6K1 w - - 0 1",
"2q1b1k1/p5pp/n2R4/1p2P3/2p5/B1P5/5QPP/6K1 w - - 0 1",
"b4rk1/6p1/4p1N1/q3P1Q1/1p1R4/1P5r/P4P2/3R2K1 w - - 0 1",
"6k1/1p5p/p2p1q2/3Pb3/1Q2P3/3b1BpP/PPr3P1/KRN5 b - - 0 1",
"5Q2/1p3p1N/2p3p1/5b1k/2P3n1/P4RP1/3q2rP/5R1K w - - 0 1",
"6k1/1r4np/pp1p1R1B/2pP2p1/P1P5/1n5P/6P1/4R2K w - - 0 1",
"R4rk1/4r1p1/1q2p1Qp/1pb5/1n5R/5NB1/1P3PPP/6K1 w - - 0 1",
"8/p1p5/2p3k1/2b1rpB1/7K/2P3PP/P1P2r2/3R3R b - - 0 1",
"r1b2rk1/1p2nppp/p2R1b2/4qP1Q/4P3/1B2B3/PPP2P1P/2K3R1 w - - 0 1",
"7k/p1p2bp1/3q1N1p/4rP2/4pQ2/2P4R/P2r2PP/4R2K w - - 0 1",
"6k1/4R3/p5q1/2pP1Q2/3bn1r1/P7/6PP/5R1K b - - 0 1",
"r5k1/3npp1p/2b3p1/1pn5/2pRP3/2P1BPP1/r1P4P/1NKR1B2 b - - 0 1",
"5rk1/3p1p1p/p4Qq1/1p1P2R1/7N/n6P/2r3PK/8 w - - 0 1",
"5r1k/1p1b1p1p/p2ppb2/5P1B/1q6/1Pr3R1/2PQ2PP/5R1K w - - 0 1",
"5r2/pp2R3/1q1p3Q/2pP1b2/2Pkrp2/3B4/PPK2PP1/R7 w - - 0 1",
"5b2/pp2r1pk/2pp1R1p/4rP1N/2P1P3/1P4Q1/P3q1PP/5R1K w - - 0 1",
"5n1k/rq4rp/p1bp1b2/2p1pP1Q/P1B1P2R/2N3R1/1P4PP/6K1 w - - 0 1",
"2rkr3/3b1p1R/3R1P2/1p2Q1P1/pPq5/P1N5/1KP5/8 w - - 0 1",
"1rbk1r2/pp4R1/3Np3/3p2p1/6q1/BP2P3/P2P2B1/2R3K1 w - - 0 1",
"6k1/5p2/p3bRpQ/4q3/2r3P1/6NP/P1p2R1K/1r6 w - - 0 1",
"r1qr3k/3R2p1/p3Q3/1p2p1p1/3bN3/8/PP3PPP/5RK1 w - - 0 1",
"5rk1/pb2npp1/1pq4p/5p2/5B2/1B6/P2RQ1PP/2r1R2K b - - 0 1",
"r4br1/3b1kpp/1q1P4/1pp1RP1N/p7/6Q1/PPB3PP/2KR4 w - - 0 1",
"r3Rnkr/1b5p/p3NpB1/3p4/1p6/8/PPP3P1/2K2R2 w - - 0 1",
"2r3k1/p4p2/1p2P1pQ/3bR2p/1q6/1B6/PP2RPr1/5K2 w - - 0 1",
"2r5/1Nr1kpRp/p3b3/N3p3/1P3n2/P7/5PPP/K6R b - - 0 1",
"2r4k/ppqbpQ1p/3p1bpB/8/8/1Nr2P2/PPP3P1/2KR3R w - - 0 1",
"r1br2k1/4p1b1/pq2pn2/1p4N1/7Q/3B4/PPP3PP/R4R1K w - - 0 1",
"1r1kr3/Nbppn1pp/1b6/8/6Q1/3B1P2/Pq3P1P/3RR1K1 w - - 0 1",
"n7/pk3pp1/1rR3p1/QP1pq3/4n3/6PB/4PP1P/2R3K1 w - - 0 1",
"6k1/pp4p1/2p5/2bp4/8/P5Pb/1P3rrP/2BRRN1K b - - 0 1",
"3b2r1/5Rn1/2qP2pk/p1p1B3/2P1N3/1P3Q2/6K1/8 w - - 0 1",
"2r1rk2/1p2qp1R/4p1p1/1b1pP1N1/p2P4/nBP1Q3/P4PPP/R5K1 w - - 0 1",
"2r3k1/1p3ppp/p3p3/7P/P4P2/1R2QbP1/6q1/1B2K3 b - - 0 1",
"k2r3r/p3Rppp/1p4q1/1P1b4/3Q1B2/6N1/PP3PPP/6K1 w - - 0 1",
"4rk1r/p2b1pp1/1q5p/3pR1n1/3N1p2/1P1Q1P2/PBP3PK/4R3 w - - 0 1",
"R6R/2kr4/1p3pb1/3prN2/6P1/2P2K2/1P6/8 w - - 0 1",
"r5k1/2Rb3r/p2p3b/P2Pp3/4P1pq/5p2/1PQ2B1P/2R2BKN b - - 0 1",
"1k6/5Q2/2Rr2pp/pqP5/1p6/7P/2P3PK/4r3 w - - 0 1",
"1q2r3/k4p2/prQ2b1p/R7/1PP1B1p1/6P1/P5K1/8 w - - 0 1",
"2k4r/pp3pQ1/2q5/2n5/8/N3pPP1/P3r3/R1R3K1 b - - 0 1",
"4r1k1/1p3q1p/p1pQ4/2P1R1p1/5n2/2B5/PP5P/6K1 b - - 0 1",
"4r1k1/pR3pp1/1n3P1p/q2p4/5N1P/P1rQpP2/8/2B2RK1 w - - 0 1",
"1R4nr/p1k1ppb1/2p4p/4Pp2/3N1P1B/8/q1P3PP/3Q2K1 w - - 0 1",
"2R2bk1/5rr1/p3Q2R/3Ppq2/1p3p2/8/PP1B2PP/7K w - - 0 1",
"3r3k/pp4p1/3qQp1p/P1p5/7R/3rN1PP/1B3P2/6K1 w - - 0 1",
"kr6/pR5R/1q1pp3/8/1Q6/2P5/PKP5/5r2 w - - 0 1",
"4r1k1/5ppp/p2p4/4r3/1pNn4/1P6/1PPK2PP/R3R3 b - - 0 1",
"7k/pbp3bp/3p4/1p5q/3n2p1/5rB1/PP1NrN1P/1Q1BRRK1 b - - 0 1",
"r3r3/ppp4p/2bq2Nk/8/1PP5/P1B3Q1/6PP/4R1K1 w - - 0 1",
"4r1k1/3N1ppp/3r4/8/1n3p1P/5P2/PP3K1P/RN5R b - - 0 1",
"4rk2/2pQ1p2/2p2B2/2P1P2q/1b4R1/1P6/r5PP/2R3K1 w - - 0 1",
"3r2k1/6pp/1nQ1R3/3r4/3N2q1/6N1/n4PPP/4R1K1 w - - 0 1",
"b1r3k1/pq2b1r1/1p3R1p/5Q2/2P5/P4N1P/5PP1/1B2R1K1 w - - 0 1",
"2R1R1nk/1p4rp/p1n5/3N2p1/1P6/2P5/P6P/2K5 w - - 0 1",
"n3r1k1/Q4R1p/p5pb/1p2p1N1/1q2P3/1P4PB/2P3KP/8 w - - 0 1",
"4r1k1/5q2/p5pQ/3b1pB1/2pP4/2P3P1/1P2R1PK/8 w - - 0 1",
"6k1/pp3p2/2p2np1/2P1pbqp/P3P3/2N2nP1/2Pr1P2/1RQ1RB1K b - - 0 1",
"2r3k1/pb3ppp/8/qP2b3/8/1P6/1P1RQPPP/1K3B1R b - - 0 1",
"r3rn1k/4b1Rp/pp1p2pB/3Pp3/P2qB1Q1/8/2P3PP/5R1K w - - 0 1",
"rnb2r1k/pp2q2p/2p2R2/8/2Bp3Q/8/PPP3PP/RN4K1 w - - 0 1",
"3k4/1pp3b1/4b2p/1p3qp1/3Pn3/2P1RN2/r5P1/1Q2R1K1 b - - 0 1",
"2kr3r/1p3ppp/p3pn2/2b1B2q/Q1N5/2P5/PP3PPP/R2R2K1 w - - 0 1",
"5q1k/p3R1rp/2pr2p1/1pN2bP1/3Q1P2/1B6/PP5P/2K5 w - - 0 1",
"8/7p/5pk1/3n2pq/3N1nR1/1P3P2/P6P/4QK2 w - - 0 1",
"4r2R/3q1kbR/1p4p1/p1pP1pP1/P1P2P2/K5Q1/1P2p3/8 w - - 0 1",
"rn3k2/pR2b3/4p1Q1/2q1N2P/3R2P1/3K4/P3Br2/8 w - - 0 1",
"2q5/p3p2k/3pP1p1/2rN2Pn/1p1Q4/7R/PPr5/1K5R w - - 0 1",
"b5r1/2r5/2pk4/2N1R1p1/1P4P1/4K2p/4P2P/R7 w - - 0 1",
"6k1/p1p3pp/6q1/3pr3/3Nn3/1QP1B1Pb/PP3r1P/R3R1K1 b - - 0 1",
"4r1r1/pb1Q2bp/1p1Rnkp1/5p2/2P1P3/4BP2/qP2B1PP/2R3K1 w - - 0 1",
"1k3r2/4R1Q1/p2q1r2/8/2p1Bb2/5R2/pP5P/K7 w - - 0 1",
"3r4/1p6/2p4p/5k2/p1P1n2P/3NK1nN/P1r5/1R2R3 b - - 0 1",
"r1b3nr/ppp1kB1p/3p4/8/3PPBnb/1Q3p2/PPP2q2/RN4RK b - - 0 1",
"6k1/p2rR1p1/1p1r1p1R/3P4/4QPq1/1P6/P5PK/8 w - - 0 1",
"3r1b1k/1p3R2/7p/2p4N/p4P2/2K3R1/PP6/3r4 w - - 0 1",
"8/6R1/p2kp2r/qb5P/3p1N1Q/1p1Pr3/PP6/1K5R w - - 0 1",
"8/4k3/P4RR1/2b1r3/3n2Pp/8/5KP1/8 b - - 0 1",
"r2q1bk1/5n1p/2p3pP/p7/3Br3/1P3PQR/P5P1/2KR4 w - - 0 1",
"1Q6/r3R2p/k2p2pP/p1q5/Pp4P1/5P2/1PP3K1/8 w - - 0 1",
"6k1/6pp/pp1p3q/3P4/P1Q2b2/1NN1r2b/1PP4P/6RK b - - 0 1",
"3r2k1/6p1/3Np2p/2P1P3/1p2Q1Pb/1P3R1P/1qr5/5RK1 w - - 0 1",
"1r2k3/2pn1p2/p1Qb3p/7q/3PP3/2P1BN1b/PP1N1Pr1/RR5K b - - 0 1",
"3r1k1r/p1q2p2/1pp2N1p/n3RQ2/3P4/2p1PR2/PP4PP/6K1 w - - 0 1",
"r3n2R/pp2n3/3p1kp1/1q1Pp1N1/6P1/2P1BP2/PP6/2KR4 w - - 0 1",
"2R2bk1/r4ppp/3pp3/1B2n1P1/3QP2P/5P2/1PK5/7q w - - 0 1",
"3nbr2/4q2p/r3pRpk/p2pQRN1/1ppP2p1/2P5/PPB4P/6K1 w - - 0 1",
"7k/p5b1/1p4Bp/2q1p1p1/1P1n1r2/P2Q2N1/6P1/3R2K1 b - - 0 1",
"5k2/ppqrRB2/3r1p2/2p2p2/7P/P1PP2P1/1P2QP2/6K1 w - - 0 1",
"4r3/5kp1/1N1p4/2pR1q1p/8/pP3PP1/6K1/3Qr3 b - - 0 1",
"1k2r3/pp6/3b4/3P2Q1/8/6P1/PP3q1P/2R4K b - - 0 1",
"2kr3r/R4Q2/1pq1n3/7p/3R1B1P/2p3P1/2P2P2/6K1 w - - 0 1",
"2rq2k1/3bb2p/n2p2pQ/p2Pp3/2P1N1P1/1P5P/6B1/2B2R1K w - - 0 1",
"r2q3k/ppb3pp/2p1B3/2P1RQ2/8/6P1/PP1r3P/5RK1 w - - 0 1",
"3k4/1p3Bp1/p5r1/2b5/P3P1N1/5Pp1/1P1r4/2R4K b - - 0 1",
"k7/4rp1p/p1q3p1/Q1r2p2/1R6/8/P5PP/1R5K w - - 0 1",
"5rk1/1R4b1/3p4/1P1P4/4Pp2/3B1Pnb/PqRK1Q2/8 b - - 0 1",
"7k/1p4p1/p4b1p/3N3P/2p5/2rb4/PP2r3/K2R2R1 b - - 0 1",
"r1qb1rk1/3R1pp1/p1nR2p1/1p2p2N/6Q1/2P1B3/PP3PPP/6K1 w - - 0 1",
"3r1rk1/2qP1p2/p2R2pp/6b1/6P1/2pQR2P/P1B2P2/6K1 w - - 0 1",
"1R2R3/p1r2pk1/3b1pp1/8/2Pr4/4N1P1/P4PK1/8 w - - 0 1",
"r2k2nr/pp1b1Q1p/2n4b/3N4/3q4/3P4/PPP3PP/4RR1K w - - 0 1",
"r4rk1/3R3p/1q2pQp1/p7/P7/8/1P5P/4RK2 w - - 0 1",
"r6k/1p5p/2p1b1pB/7B/p1P1q2r/8/P5QP/3R2RK b - - 0 1",
"4r1k1/1R4bp/pB2p1p1/P4p2/2r1pP1Q/2P4P/1q4P1/3R3K w - - 0 1",
"6k1/6p1/3r1n1p/p4p1n/P1N4P/2N5/Q2RK3/7q b - - 0 1",
"8/1R4pp/k2rQp2/2p2P2/p2q1P2/1n1r2P1/6BP/4R2K w - - 0 1",
"4R3/p2r1q1k/5B1P/6P1/2p4K/3b4/4Q3/8 w - - 0 1",
"4n3/p3N1rk/5Q2/2q4p/2p5/1P3P1P/P1P2P2/6RK w - - 0 1",
"rr4Rb/2pnqb1k/np1p1p1B/3PpP2/p1P1P2P/2N3R1/PP2BP2/1KQ5 w - - 0 1",
"r1bq2rk/pp1n1p1p/5P1Q/1B3p2/3B3b/P5R1/2P3PP/3K3R w - - 0 1",
"q5k1/1b2R1pp/1p3n2/4BQ2/8/7P/5PPK/4r3 w - - 0 1",
"3r4/1nb1kp2/p1p2N2/1p2pPr1/8/1BP2P2/PP1R4/2KR4 w - - 0 1",
"7R/3Q2p1/2p2nk1/pp4P1/3P2r1/2P5/4q3/5R1K w - - 0 1",
"3q2r1/p2b1k2/1pnBp1N1/3p1pQP/6P1/5R2/2r2P2/4RK2 w - - 0 1",
"k7/1p1rr1pp/pR1p1p2/Q1pq4/P7/8/2P3PP/1R4K1 w - - 0 1",
"4kb1r/1R6/p2rp3/2Q1p1q1/4p3/3B4/P6P/4KR2 w - - 0 1",
"1r3r1k/qp5p/3N4/3p2Q1/p6P/P7/1b6/1KR3R1 w - - 0 1",
"r4kr1/pbNn1q1p/1p6/2p2BPQ/5B2/8/P6P/b4RK1 w - - 0 1",
"3r3k/7p/pp2B1p1/3N2P1/P2qPQ2/8/1Pr4P/5R1K w - - 0 1",
"3q1r2/pb3pp1/1p6/3pP1Nk/2r2Q2/8/Pn3PP1/3RR1K1 w - - 0 1",
"1k1r4/pp5R/2p5/P5p1/7b/4Pq2/1PQ2P2/3NK3 b - - 0 1",
"6R1/2k2P2/1n5r/3p1p2/3P3b/1QP2p1q/3R4/6K1 b - - 0 1",
"1k1r4/1p5p/1P3pp1/b7/P3K3/1B3rP1/2N1bP1P/RR6 b - - 0 1",
"3r2k1/3q2p1/1b3p1p/4p3/p1R1P2N/Pr5P/1PQ3P1/5R1K b - - 0 1",
"2b3k1/r3q2p/4p1pB/p4r2/4N3/P1Q5/1P4PP/2R2R1K w - - 0 1",
"r5r1/p1q2p1k/1p1R2pB/3pP3/6bQ/2p5/P1P1NPPP/6K1 w - - 0 1",
"1r1qrbk1/3b3p/p2p1pp1/3NnP2/3N4/1Q4BP/PP4P1/1R2R2K w - - 0 1",
"4b1k1/2r2p2/1q1pnPpQ/7p/p3P2P/pN5B/P1P5/1K1R2R1 w - - 0 1",
"4r2k/pp2q2b/2p2p1Q/4rP2/P7/1B5P/1P2R1R1/7K w - - 0 1",
"2k5/1b1r1Rbp/p3p3/Bp4P1/3p1Q1P/P7/1PP1q3/1K6 w - - 0 1",
"6rk/1pqbbp1p/p3p2Q/6R1/4N1nP/3B4/PPP5/2KR4 w - - 0 1",
"r4rk1/5Rbp/p1qN2p1/P1n1P3/8/1Q3N1P/5PP1/5RK1 w - - 0 1",
"r3r1k1/7p/2pRR1p1/p7/2P5/qnQ1P1P1/6BP/6K1 w - - 0 1",
"r4b1r/pppq2pp/2n1b1k1/3n4/2Bp4/5Q2/PPP2PPP/RNB1R1K1 w - - 0 1",
"6R1/5r1k/p6b/1pB1p2q/1P6/5rQP/5P1K/6R1 w - - 0 1",
"rn3rk1/2qp2pp/p3P3/1p1b4/3b4/3B4/PPP1Q1PP/R1B2R1K w - - 0 1",
"2R3nk/3r2b1/p2pr1Q1/4pN2/1P6/P6P/q7/B4RK1 w - - 0 1",
"r5k1/p1p3bp/1p1p4/2PP2qp/1P6/1Q1bP3/PB3rPP/R2N2RK b - - 0 1",
"4k3/r2bnn1r/1q2pR1p/p2pPp1B/2pP1N1P/PpP1B3/1P4Q1/5KR1 w - - 0 1",
"r1b2k2/1p4pp/p4N1r/4Pp2/P3pP1q/4P2P/1P2Q2K/3R2R1 w - - 0 1",
"3r4/pR2N3/2pkb3/5p2/8/2B5/qP3PPP/4R1K1 w - - 0 1",
"r1b4r/1k2bppp/p1p1p3/8/Np2nB2/3R4/PPP1BPPP/2KR4 w - - 0 1",
"2q2r1k/5Qp1/4p1P1/3p4/r6b/7R/5BPP/5RK1 w - - 0 1",
"Q7/2r2rpk/2p4p/7N/3PpN2/1p2P3/1K4R1/5q2 w - - 0 1",
"5r1k/1q4bp/3pB1p1/2pPn1B1/1r6/1p5R/1P2PPQP/R5K1 w - - 0 1",
"r1b2k1r/2q1b3/p3ppBp/2n3B1/1p6/2N4Q/PPP3PP/2KRR3 w - - 0 1",
"5r1k/7p/8/4NP2/8/3p2R1/2r3PP/2n1RK2 w - - 0 1",
"6r1/r5PR/2p3R1/2Pk1n2/3p4/1P1NP3/4K3/8 w - - 0 1",
"r2q4/p2nR1bk/1p1Pb2p/4p2p/3nN3/B2B3P/PP1Q2P1/6K1 w - - 0 1",
"5rk1/pR4bp/6p1/6B1/5Q2/4P3/q2r1PPP/5RK1 w - - 0 1",
"4nrk1/rR5p/4pnpQ/4p1N1/2p1N3/6P1/q4P1P/4R1K1 w - - 0 1",
"1R1n3k/6pp/2Nr4/P4p2/r7/8/4PPBP/6K1 b - - 0 1",
"6r1/3p2qk/4P3/1R5p/3b1prP/3P2B1/2P1QP2/6RK b - - 0 1",
"r5q1/pp1b1kr1/2p2p2/2Q5/2PpB3/1P4NP/P4P2/4RK2 w - - 0 1",
"r2r2k1/pp2bppp/2p1p3/4qb1P/8/1BP1BQ2/PP3PP1/2KR3R b - - 0 1",
"1r1rb3/p1q2pkp/Pnp2np1/4p3/4P3/Q1N1B1PP/2PRBP2/3R2K1 w - - 0 1",
"r2k1r2/3b2pp/p5p1/2Q1R3/1pB1Pq2/1P6/PKP4P/7R w - - 0 1",
"r5k1/q4ppp/rnR1pb2/1Q1p4/1P1P4/P4N1P/1B3PP1/2R3K1 w - - 0 1",
"5r1k/7p/p2b4/1pNp1p1q/3Pr3/2P2bP1/PP1B3Q/R3R1K1 b - - 0 1",
"5b2/1p3rpk/p1b3Rp/4B1RQ/3P1p1P/7q/5P2/6K1 w - - 0 1",
"3Rr2k/pp4pb/2p4p/2P1n3/1P1Q3P/4r1q1/PB4B1/5RK1 b - - 0 1",
"R7/5pkp/3N2p1/2r3Pn/5r2/1P6/P1P5/2KR4 w - - 0 1",
"1r3k2/5p1p/1qbRp3/2r1Pp2/ppB4Q/1P6/P1P4P/1K1R4 w - - 0 1",
"8/2Q1R1bk/3r3p/p2N1p1P/P2P4/1p3Pq1/1P4P1/1K6 w - - 0 1",
"5r1k/r2b1p1p/p4Pp1/1p2R3/3qBQ2/P7/6PP/2R4K w - - 0 1",
"3r3k/1p3Rpp/p2nn3/3N4/8/1PB1PQ1P/q4PP1/6K1 w - - 0 1",
"3r1kr1/8/p2q2p1/1p2R3/1Q6/8/PPP5/1K4R1 w - - 0 1",
"4r2k/2pb1R2/2p4P/3pr1N1/1p6/7P/P1P5/2K4R w - - 0 1",
"3r3k/1b2b1pp/3pp3/p3n1P1/1pPqP2P/1P2N2R/P1QB1r2/2KR3B b - - 0 1",
];

},{}],39:[function(require,module,exports){
var Chess = require('chess.js').Chess;
var c = require('./chessutils');

var forkMap = [];
forkMap['n'] = {
    pieceEnglish: 'Knight',
    marker: '♘♆'
};
forkMap['q'] = {
    pieceEnglish: 'Queen',
    marker: '♕♆'
};
forkMap['p'] = {
    pieceEnglish: 'Pawn',
    marker: '♙♆'
};
forkMap['b'] = {
    pieceEnglish: 'Bishop',
    marker: '♗♆'
};
forkMap['r'] = {
    pieceEnglish: 'Rook',
    marker: '♖♆'
};


module.exports = function(puzzle, forkType) {
    var chess = new Chess();
    chess.load(puzzle.fen);
    addForks(puzzle.fen, puzzle.features, forkType);
    addForks(c.fenForOtherSide(puzzle.fen), puzzle.features, forkType);
    return puzzle;
};

function addForks(fen, features, forkType) {

    var chess = new Chess();
    chess.load(fen);

    var moves = chess.moves({
        verbose: true
    });

    moves = moves.map(m => enrichMoveWithForkCaptures(fen, m));
    moves = moves.filter(m => m.captures.length >= 2);

    if (!forkType || forkType == 'q') {
        addForksBy(moves, 'q', chess.turn(), features);
    }
    if (!forkType || forkType == 'p') {
        addForksBy(moves, 'p', chess.turn(), features);
    }
    if (!forkType || forkType == 'r') {
        addForksBy(moves, 'r', chess.turn(), features);
    }
    if (!forkType || forkType == 'b') {
        addForksBy(moves, 'b', chess.turn(), features);
    }
    if (!forkType || forkType == 'n') {
        addForksBy(moves, 'n', chess.turn(), features);
    }
}

function enrichMoveWithForkCaptures(fen, move) {
    var chess = new Chess();
    chess.load(fen);

    var kingsSide = chess.turn();
    var king = c.kingsSquare(fen, kingsSide);

    chess.move(move);

    // replace moving sides king with a pawn to avoid pinned state reducing branches on fork

    chess.remove(king);
    chess.put({
        type: 'p',
        color: kingsSide
    }, king);

    var sameSidesTurnFen = c.fenForOtherSide(chess.fen());

    var pieceMoves = c.movesOfPieceOn(sameSidesTurnFen, move.to);
    var captures = pieceMoves.filter(capturesMajorPiece);

    move.captures = uniqTo(captures);
    return move;
}

function uniqTo(moves) {
    var dests = [];
    return moves.filter(m => {
        if (dests.indexOf(m.to) != -1) {
            return false;
        }
        dests.push(m.to);
        return true;
    });
}

function capturesMajorPiece(move) {
    return move.captured && move.captured !== 'p';
}

function diagram(move) {
    var main = [{
        orig: move.from,
        dest: move.to,
        brush: 'paleBlue'
    }];
    var forks = move.captures.map(m => {
        return {
            orig: move.to,
            dest: m.to,
            brush: m.captured === 'k' ? 'red' : 'blue'
        };
    });
    return main.concat(forks);
}

function addForksBy(moves, piece, side, features) {
    var bypiece = moves.filter(m => m.piece === piece);
    if (piece === 'p') {
        bypiece = bypiece.filter(m => !m.promotion);
    }
    features.push({
        description: forkMap[piece].pieceEnglish + " forks",
        side: side,
        targets: bypiece.map(m => {
            return {
                target: m.to,
                diagram: diagram(m),
                marker: forkMap[piece].marker
            };
        })
    });
}

},{"./chessutils":30,"chess.js":28}],40:[function(require,module,exports){
var c = require('./chessutils');
var forks = require('./forks');
var knightforkfens = require('./fens/knightforks');
var queenforkfens = require('./fens/queenforks');
var pawnforkfens = require('./fens/pawnforks');
var rookforkfens = require('./fens/rookforks');
var bishopforkfens = require('./fens/bishopforks');
var pinfens = require('./fens/pins');
var pin = require('./pins');
var hidden = require('./hidden');
var loose = require('./loose');
var immobile = require('./immobile');
var matethreat = require('./matethreat');
var checks = require('./checks');

/**
 * Feature map 
 */
var featureMap = [{
    description: "Knight forks",
    fullDescription: "Squares from where a knight can move and fork two pieces (not pawns).",
    data: knightforkfens,
    extract: function(puzzle) {
      return forks(puzzle, 'n');
    }
  }, {
    description: "Queen forks",
    fullDescription: "Squares from where a queen can move and fork two pieces (not pawns).",
    data: queenforkfens,
    extract: function(puzzle) {
      return forks(puzzle, 'q');
    }
  }, {
    description: "Pawn forks",
    fullDescription: "Squares from where a pawn can move and fork two pieces (not pawns).",
    data: pawnforkfens,
    extract: function(puzzle) {
      return forks(puzzle, 'p');
    }
  }, {
    description: "Rook forks",
    fullDescription: "Squares from where a rook can move and fork two pieces (not pawns).",
    data: rookforkfens,
    extract: function(puzzle) {
      return forks(puzzle, 'r');
    }
  }, {
    description: "Bishop forks",
    fullDescription: "Squares from where a bishop can move and fork two pieces (not pawns).",
    data: bishopforkfens,
    extract: function(puzzle) {
      return forks(puzzle, 'b');
    }
  }, {
    description: "Loose pieces",
    fullDescription: "Pieces that are not protected by any piece of the same colour.",
    data: knightforkfens,
    extract: function(puzzle) {
      return loose(puzzle);
    }
  }, {
    description: "Checking squares",
    fullDescription: "Squares from where check can be delivered.",
    data: knightforkfens,
    extract: function(puzzle) {
      return checks(puzzle);
    }
  }, {
    description: "Hidden attackers",
    fullDescription: "Pieces that will attack an opponents piece (but not pawn) if an interviening piece of the same colour moves.",
    data: knightforkfens,
    extract: function(puzzle) {
      return hidden(puzzle);
    }
  }, {
    description: "Pins and Skewers",
    fullDescription: "Pieces that are pinned or skewered to a piece (but not pawn) of the same colour.",
    data: pinfens,
    extract: function(puzzle) {
      return pin(puzzle);
    }
  }, {
    description: "Low mobility pieces",
    fullDescription: "Pieces that have reduced mobility. i.e. Pawns that are immobile, knights with only 1 legal move, bishops with no more than 3 legal moves, rooks with no more than 6 legal moves, queens with no more than 10 legal moves and the king with no more than 2 legal moves.",
    data: knightforkfens,
    extract: function(puzzle) {
      return immobile(puzzle);
    }
  }, {
    description: "Mixed",
    fullDescription: "Use the icons to determine which feature to find.",
    data: null,
    extract: null
  }


];

module.exports = {

  /**
   * Calculate all features in the position.
   */
  extractFeatures: function(fen) {
    var puzzle = {
      fen: c.repairFen(fen),
      features: []
    };

    puzzle = forks(puzzle);
    puzzle = hidden(puzzle);
    puzzle = loose(puzzle);
    puzzle = pin(puzzle);
    puzzle = matethreat(puzzle);
    puzzle = checks(puzzle);
    puzzle = immobile(puzzle);

    return puzzle.features;
  },


  featureMap: featureMap,

  /**
   * Calculate single features in the position.
   */
  extractSingleFeature: function(featureDescription, fen) {
    var puzzle = {
      fen: c.repairFen(fen),
      features: []
    };

    featureMap.forEach(f => {
      if (featureDescription === f.description) {
        puzzle = f.extract(puzzle);
      }
    });

    return puzzle.features;
  },

  featureFound: function(features, target) {
    var found = 0;
    features
      .forEach(f => {
        f.targets.forEach(t => {
          if (t.target === target) {
            found++;
          }
        });
      });
    return found;
  },

  allFeaturesFound: function(features) {
    var found = true;
    features
      .forEach(f => {
        f.targets.forEach(t => {
          if (!t.selected) {
            found = false;
          }
        });
      });
    return found;
  },

  randomFeature: function() {
    return featureMap[Math.floor(Math.random() * (featureMap.length - 1))].description;
  },

  randomFenForFeature: function(featureDescription) {
    var fens = featureMap.find(f => f.description === featureDescription).data;
    return fens[Math.floor(Math.random() * fens.length)];
  },

};

},{"./checks":29,"./chessutils":30,"./fens/bishopforks":33,"./fens/knightforks":34,"./fens/pawnforks":35,"./fens/pins":36,"./fens/queenforks":37,"./fens/rookforks":38,"./forks":39,"./hidden":41,"./immobile":42,"./loose":43,"./matethreat":44,"./pins":45}],41:[function(require,module,exports){
var Chess = require('chess.js').Chess;
var c = require('./chessutils');

module.exports = function(puzzle) {
    inspectAligned(puzzle.fen, puzzle.features);
    inspectAligned(c.fenForOtherSide(puzzle.fen), puzzle.features);
    return puzzle;
};

function inspectAligned(fen, features) {
    var chess = new Chess(fen);

    var moves = chess.moves({
        verbose: true
    });

    var pieces = c.majorPiecesForColour(fen, chess.turn());
    var opponentsPieces = c.majorPiecesForColour(fen, chess.turn() == 'w' ? 'b' : 'w');

    var potentialCaptures = [];
    pieces.forEach(from => {
        var type = chess.get(from).type;
        if ((type !== 'k') && (type !== 'n')) {
            opponentsPieces.forEach(to => {
                if (c.canCapture(from, chess.get(from), to, chess.get(to))) {
                    var availableOnBoard = moves.filter(m => m.from === from && m.to === to);
                    if (availableOnBoard.length === 0) {
                        potentialCaptures.push({
                            attacker: from,
                            attacked: to
                        });
                    }
                }
            });
        }
    });

    addHiddenAttackers(fen, features, potentialCaptures);
}

function addHiddenAttackers(fen, features, potentialCaptures) {
    var chess = new Chess(fen);
    var targets = [];
    potentialCaptures.forEach(pair => {
        var revealingMoves = c.movesThatResultInCaptureThreat(fen, pair.attacker, pair.attacked, true);
        if (revealingMoves.length > 0) {
            targets.push({
                target: pair.attacker,
                marker: '⥇',
                diagram: diagram(pair.attacker, pair.attacked, revealingMoves)
            });
        }
    });

    features.push({
        description: "Hidden attacker",
        side: chess.turn(),
        targets: targets
    });

}


function diagram(from, to, revealingMoves) {
    var main = [{
        orig: from,
        dest: to,
        brush: 'red'
    }];
    var reveals = revealingMoves.map(m => {
        return {
            orig: m.from,
            dest: m.to,
            brush: 'paleBlue'
        };
    });
    return main.concat(reveals);
}

},{"./chessutils":30,"chess.js":28}],42:[function(require,module,exports){
var Chess = require('chess.js').Chess;
var c = require('./chessutils');

module.exports = function(puzzle) {
    addLowMobility(puzzle.fen, puzzle.features);
    addLowMobility(c.fenForOtherSide(puzzle.fen), puzzle.features);
    return puzzle;
};

var mobilityMap = {};
mobilityMap['p'] = 1;
mobilityMap['n'] = 2;
mobilityMap['b'] = 4;
mobilityMap['r'] = 7;
mobilityMap['q'] = 11;
mobilityMap['k'] = 2;

function addLowMobility(fen, features) {
    var chess = new Chess(fen);
    var pieces = c.allPiecesForColour(fen, chess.turn());

    pieces = pieces.map(square => {
        return {
            square: square,
            type: chess.get(square).type,
            moves: chess.moves({
                verbose: true,
                square: square
            })
        };
    });

    pieces = pieces.filter(m => m.moves.length < mobilityMap[m.type]);

    features.push({
        description: "Low mobility",
        side: chess.turn(),
        targets: pieces.map(t => {
            return {
                target: t.square,
                marker: '⧀',
                diagram: [{
                    orig: t.square,
                    brush: 'yellow'
                }]
            };
        })
    });
}

},{"./chessutils":30,"chess.js":28}],43:[function(require,module,exports){
var Chess = require('chess.js').Chess;
var c = require('./chessutils');



module.exports = function(puzzle) {
    var chess = new Chess();
    addLoosePieces(puzzle.fen, puzzle.features);
    addLoosePieces(c.fenForOtherSide(puzzle.fen), puzzle.features);
    return puzzle;
};

function addLoosePieces(fen, features) {
    var chess = new Chess();
    chess.load(fen);
    var king = c.kingsSquare(fen, chess.turn());
    var opponent = chess.turn() === 'w' ? 'b' : 'w';
    var pieces = c.piecesForColour(fen, opponent);
    pieces = pieces.filter(square => !c.isCheckAfterPlacingKingAtSquare(fen, king, square));
    features.push({
        description: "Loose pieces",
        side: opponent,
        targets: pieces.map(t => {
            return {
                target: t,
                marker: '⚮',
                diagram: [{
                    orig: t,
                    brush: 'yellow'
                }]
            };
        })
    });
}

},{"./chessutils":30,"chess.js":28}],44:[function(require,module,exports){
var Chess = require('chess.js').Chess;
var c = require('./chessutils');



module.exports = function(puzzle) {
    var chess = new Chess();
    chess.load(puzzle.fen);
    addMateInOneThreats(puzzle.fen, puzzle.features);
    addMateInOneThreats(c.fenForOtherSide(puzzle.fen), puzzle.features);
    return puzzle;
};

function addMateInOneThreats(fen, features) {
    var chess = new Chess();
    chess.load(fen);
    var moves = chess.moves({
        verbose: true
    });

    moves = moves.filter(m => canMateOnNextTurn(fen, m));

    features.push({
        description: "Mate-in-1 threats",
        side: chess.turn(),
        targets: moves.map(m => targetAndDiagram(m))
    });

}

function canMateOnNextTurn(fen, move) {
    var chess = new Chess(fen);
    chess.move(move);
    if (chess.in_check()) {
        return false;
    }

    chess.load(c.fenForOtherSide(chess.fen()));
    var moves = chess.moves({
        verbose: true
    });

    // stuff mating moves into move object for diagram
    move.matingMoves = moves.filter(m => /#/.test(m.san));
    return move.matingMoves.length > 0;
}

function targetAndDiagram(move) {
    return {
        target: move.to,
        diagram: [{
            orig: move.from,
            dest: move.to,
            brush: "paleGreen"
        }].concat(move.matingMoves.map(m => {
            return {
                orig: m.from,
                dest: m.to,
                brush: "paleGreen"
            };
        })).concat(move.matingMoves.map(m => {
            return {
                orig: m.from,
                brush: "paleGreen"
            };
        }))
    };
}

},{"./chessutils":30,"chess.js":28}],45:[function(require,module,exports){
var Chess = require('chess.js').Chess;
var c = require('./chessutils');

module.exports = function(puzzle) {
    inspectAligned(puzzle.fen, puzzle.features);
    inspectAligned(c.fenForOtherSide(puzzle.fen), puzzle.features);
    return puzzle;
};

function inspectAligned(fen, features) {
    var chess = new Chess(fen);

    var moves = chess.moves({
        verbose: true
    });

    var pieces = c.majorPiecesForColour(fen, chess.turn());
    var opponentsPieces = c.majorPiecesForColour(fen, chess.turn() == 'w' ? 'b' : 'w');

    var potentialCaptures = [];
    pieces.forEach(from => {
        var type = chess.get(from).type;
        if ((type !== 'k') && (type !== 'n')) {
            opponentsPieces.forEach(to => {
                if (c.canCapture(from, chess.get(from), to, chess.get(to))) {
                    var availableOnBoard = moves.filter(m => m.from === from && m.to === to);
                    if (availableOnBoard.length === 0) {
                        potentialCaptures.push({
                            attacker: from,
                            attacked: to
                        });
                    }
                }
            });
        }
    });

    addGeometricPins(fen, features, potentialCaptures);
}

// pins are found if there is 1 piece in between a capture of the opponents colour.

function addGeometricPins(fen, features, potentialCaptures) {
    var chess = new Chess(fen);
    var targets = [];
    potentialCaptures.forEach(pair => {
        pair.piecesBetween = c.between(pair.attacker, pair.attacked).map(square => {
            return {
                square: square,
                piece: chess.get(square)
            };
        }).filter(item => item.piece);
    });

    var otherSide = chess.turn() === 'w' ? 'b' : 'w';

    potentialCaptures = potentialCaptures.filter(pair => pair.piecesBetween.length === 1);
    potentialCaptures = potentialCaptures.filter(pair => pair.piecesBetween[0].piece.color === otherSide);
    potentialCaptures.forEach(pair => {
        targets.push({
            target: pair.piecesBetween[0].square,
            marker: marker(fen, pair.piecesBetween[0].square, pair.attacked),
            diagram: diagram(pair.attacker, pair.attacked, pair.piecesBetween[0].square)
        });

    });

    features.push({
        description: "Pins and Skewers",
        side: chess.turn() === 'w' ? 'b' : 'w',
        targets: targets
    });

}

function marker(fen, pinned, attacked) {
    var chess = new Chess(fen);
    var p = chess.get(pinned).type;
    var a = chess.get(attacked).type;
    var checkModifier = a === 'k' ? '+' : '';
    if ((p === 'q') || (p === 'r' && (a === 'b' || a === 'n'))) {
        return '🍢' + checkModifier;
    }
    return '📌' + checkModifier;
}

function diagram(from, to, middle) {
    return [{
        orig: from,
        dest: to,
        brush: 'red'
    }, {
        orig: middle,
        brush: 'red'
    }];
}

},{"./chessutils":30,"chess.js":28}],46:[function(require,module,exports){
module.exports = function(list) {

    var occured = [];
    var result = [];

    list.forEach(x => {
        var json = JSON.stringify(x);
        if (!occured.includes(json)) {
            occured.push(json);
            result.push(x);
        }
    });
    return result;
};

},{}]},{},[21])(21)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvc3JjL2FuaW0uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvc3JjL2FwaS5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC9zcmMvYm9hcmQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvc3JjL2NvbmZpZ3VyZS5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC9zcmMvY29vcmRzLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3NyYy9jdHJsLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3NyYy9kYXRhLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3NyYy9kcmFnLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3NyYy9kcmF3LmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3NyYy9mZW4uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvc3JjL2hvbGQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvc3JjL21haW4uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvc3JjL3ByZW1vdmUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvc3JjL3N2Zy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC9zcmMvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC9zcmMvdmlldy5qcyIsIm5vZGVfbW9kdWxlcy9tZXJnZS9tZXJnZS5qcyIsIm5vZGVfbW9kdWxlcy9taXRocmlsL21pdGhyaWwuanMiLCJzcmMvY3RybC5qcyIsInNyYy9ncm91bmQuanMiLCJzcmMvbWFpbi5qcyIsInNyYy91dGlsL3F1ZXJ5cGFyYW0uanMiLCJzcmMvdXRpbC9zdG9wZXZlbnQuanMiLCJzcmMvdmlldy9mZWF0dXJlLmpzIiwic3JjL3ZpZXcvZmVhdHVyZXMuanMiLCJzcmMvdmlldy9mZW5iYXIuanMiLCJzcmMvdmlldy9tYWluLmpzIiwiLi4vZ2VuZXJhdGUvbm9kZV9tb2R1bGVzL2NoZXNzLmpzL2NoZXNzLmpzIiwiLi4vZ2VuZXJhdGUvc3JjL2NoZWNrcy5qcyIsIi4uL2dlbmVyYXRlL3NyYy9jaGVzc3V0aWxzLmpzIiwiLi4vZ2VuZXJhdGUvc3JjL2RpYWdyYW0uanMiLCIuLi9nZW5lcmF0ZS9zcmMvZmVuZGF0YS5qcyIsIi4uL2dlbmVyYXRlL3NyYy9mZW5zL2Jpc2hvcGZvcmtzLmpzIiwiLi4vZ2VuZXJhdGUvc3JjL2ZlbnMva25pZ2h0Zm9ya3MuanMiLCIuLi9nZW5lcmF0ZS9zcmMvZmVucy9wYXduZm9ya3MuanMiLCIuLi9nZW5lcmF0ZS9zcmMvZmVucy9waW5zLmpzIiwiLi4vZ2VuZXJhdGUvc3JjL2ZlbnMvcXVlZW5mb3Jrcy5qcyIsIi4uL2dlbmVyYXRlL3NyYy9mZW5zL3Jvb2tmb3Jrcy5qcyIsIi4uL2dlbmVyYXRlL3NyYy9mb3Jrcy5qcyIsIi4uL2dlbmVyYXRlL3NyYy9nZW5lcmF0ZS5qcyIsIi4uL2dlbmVyYXRlL3NyYy9oaWRkZW4uanMiLCIuLi9nZW5lcmF0ZS9zcmMvaW1tb2JpbGUuanMiLCIuLi9nZW5lcmF0ZS9zcmMvbG9vc2UuanMiLCIuLi9nZW5lcmF0ZS9zcmMvbWF0ZXRocmVhdC5qcyIsIi4uL2dlbmVyYXRlL3NyYy9waW5zLmpzIiwiLi4vZ2VuZXJhdGUvc3JjL3V0aWwvdW5pcS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzkzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxbURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XHJcblxyXG4vLyBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9ncmUvMTY1MDI5NFxyXG52YXIgZWFzaW5nID0ge1xyXG4gIGVhc2VJbk91dEN1YmljOiBmdW5jdGlvbih0KSB7XHJcbiAgICByZXR1cm4gdCA8IDAuNSA/IDQgKiB0ICogdCAqIHQgOiAodCAtIDEpICogKDIgKiB0IC0gMikgKiAoMiAqIHQgLSAyKSArIDE7XHJcbiAgfSxcclxufTtcclxuXHJcbmZ1bmN0aW9uIG1ha2VQaWVjZShrLCBwaWVjZSwgaW52ZXJ0KSB7XHJcbiAgdmFyIGtleSA9IGludmVydCA/IHV0aWwuaW52ZXJ0S2V5KGspIDogaztcclxuICByZXR1cm4ge1xyXG4gICAga2V5OiBrZXksXHJcbiAgICBwb3M6IHV0aWwua2V5MnBvcyhrZXkpLFxyXG4gICAgcm9sZTogcGllY2Uucm9sZSxcclxuICAgIGNvbG9yOiBwaWVjZS5jb2xvclxyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhbWVQaWVjZShwMSwgcDIpIHtcclxuICByZXR1cm4gcDEucm9sZSA9PT0gcDIucm9sZSAmJiBwMS5jb2xvciA9PT0gcDIuY29sb3I7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsb3NlcihwaWVjZSwgcGllY2VzKSB7XHJcbiAgcmV0dXJuIHBpZWNlcy5zb3J0KGZ1bmN0aW9uKHAxLCBwMikge1xyXG4gICAgcmV0dXJuIHV0aWwuZGlzdGFuY2UocGllY2UucG9zLCBwMS5wb3MpIC0gdXRpbC5kaXN0YW5jZShwaWVjZS5wb3MsIHAyLnBvcyk7XHJcbiAgfSlbMF07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbXB1dGVQbGFuKHByZXYsIGN1cnJlbnQpIHtcclxuICB2YXIgYm91bmRzID0gY3VycmVudC5ib3VuZHMoKSxcclxuICAgIHdpZHRoID0gYm91bmRzLndpZHRoIC8gOCxcclxuICAgIGhlaWdodCA9IGJvdW5kcy5oZWlnaHQgLyA4LFxyXG4gICAgYW5pbXMgPSB7fSxcclxuICAgIGFuaW1lZE9yaWdzID0gW10sXHJcbiAgICBmYWRpbmdzID0gW10sXHJcbiAgICBtaXNzaW5ncyA9IFtdLFxyXG4gICAgbmV3cyA9IFtdLFxyXG4gICAgaW52ZXJ0ID0gcHJldi5vcmllbnRhdGlvbiAhPT0gY3VycmVudC5vcmllbnRhdGlvbixcclxuICAgIHByZVBpZWNlcyA9IHt9LFxyXG4gICAgd2hpdGUgPSBjdXJyZW50Lm9yaWVudGF0aW9uID09PSAnd2hpdGUnO1xyXG4gIGZvciAodmFyIHBrIGluIHByZXYucGllY2VzKSB7XHJcbiAgICB2YXIgcGllY2UgPSBtYWtlUGllY2UocGssIHByZXYucGllY2VzW3BrXSwgaW52ZXJ0KTtcclxuICAgIHByZVBpZWNlc1twaWVjZS5rZXldID0gcGllY2U7XHJcbiAgfVxyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdXRpbC5hbGxLZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICB2YXIga2V5ID0gdXRpbC5hbGxLZXlzW2ldO1xyXG4gICAgaWYgKGtleSAhPT0gY3VycmVudC5tb3ZhYmxlLmRyb3BwZWRbMV0pIHtcclxuICAgICAgdmFyIGN1clAgPSBjdXJyZW50LnBpZWNlc1trZXldO1xyXG4gICAgICB2YXIgcHJlUCA9IHByZVBpZWNlc1trZXldO1xyXG4gICAgICBpZiAoY3VyUCkge1xyXG4gICAgICAgIGlmIChwcmVQKSB7XHJcbiAgICAgICAgICBpZiAoIXNhbWVQaWVjZShjdXJQLCBwcmVQKSkge1xyXG4gICAgICAgICAgICBtaXNzaW5ncy5wdXNoKHByZVApO1xyXG4gICAgICAgICAgICBuZXdzLnB1c2gobWFrZVBpZWNlKGtleSwgY3VyUCwgZmFsc2UpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2VcclxuICAgICAgICAgIG5ld3MucHVzaChtYWtlUGllY2Uoa2V5LCBjdXJQLCBmYWxzZSkpO1xyXG4gICAgICB9IGVsc2UgaWYgKHByZVApXHJcbiAgICAgICAgbWlzc2luZ3MucHVzaChwcmVQKTtcclxuICAgIH1cclxuICB9XHJcbiAgbmV3cy5mb3JFYWNoKGZ1bmN0aW9uKG5ld1ApIHtcclxuICAgIHZhciBwcmVQID0gY2xvc2VyKG5ld1AsIG1pc3NpbmdzLmZpbHRlcih1dGlsLnBhcnRpYWwoc2FtZVBpZWNlLCBuZXdQKSkpO1xyXG4gICAgaWYgKHByZVApIHtcclxuICAgICAgdmFyIG9yaWcgPSB3aGl0ZSA/IHByZVAucG9zIDogbmV3UC5wb3M7XHJcbiAgICAgIHZhciBkZXN0ID0gd2hpdGUgPyBuZXdQLnBvcyA6IHByZVAucG9zO1xyXG4gICAgICB2YXIgdmVjdG9yID0gWyhvcmlnWzBdIC0gZGVzdFswXSkgKiB3aWR0aCwgKGRlc3RbMV0gLSBvcmlnWzFdKSAqIGhlaWdodF07XHJcbiAgICAgIGFuaW1zW25ld1Aua2V5XSA9IFt2ZWN0b3IsIHZlY3Rvcl07XHJcbiAgICAgIGFuaW1lZE9yaWdzLnB1c2gocHJlUC5rZXkpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG4gIG1pc3NpbmdzLmZvckVhY2goZnVuY3Rpb24ocCkge1xyXG4gICAgaWYgKFxyXG4gICAgICBwLmtleSAhPT0gY3VycmVudC5tb3ZhYmxlLmRyb3BwZWRbMF0gJiZcclxuICAgICAgIXV0aWwuY29udGFpbnNYKGFuaW1lZE9yaWdzLCBwLmtleSkgJiZcclxuICAgICAgIShjdXJyZW50Lml0ZW1zID8gY3VycmVudC5pdGVtcy5yZW5kZXIocC5wb3MsIHAua2V5KSA6IGZhbHNlKVxyXG4gICAgKVxyXG4gICAgICBmYWRpbmdzLnB1c2goe1xyXG4gICAgICAgIHBpZWNlOiBwLFxyXG4gICAgICAgIG9wYWNpdHk6IDFcclxuICAgICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBhbmltczogYW5pbXMsXHJcbiAgICBmYWRpbmdzOiBmYWRpbmdzXHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcm91bmRCeShuLCBieSkge1xyXG4gIHJldHVybiBNYXRoLnJvdW5kKG4gKiBieSkgLyBieTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ28oZGF0YSkge1xyXG4gIGlmICghZGF0YS5hbmltYXRpb24uY3VycmVudC5zdGFydCkgcmV0dXJuOyAvLyBhbmltYXRpb24gd2FzIGNhbmNlbGVkXHJcbiAgdmFyIHJlc3QgPSAxIC0gKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gZGF0YS5hbmltYXRpb24uY3VycmVudC5zdGFydCkgLyBkYXRhLmFuaW1hdGlvbi5jdXJyZW50LmR1cmF0aW9uO1xyXG4gIGlmIChyZXN0IDw9IDApIHtcclxuICAgIGRhdGEuYW5pbWF0aW9uLmN1cnJlbnQgPSB7fTtcclxuICAgIGRhdGEucmVuZGVyKCk7XHJcbiAgfSBlbHNlIHtcclxuICAgIHZhciBlYXNlID0gZWFzaW5nLmVhc2VJbk91dEN1YmljKHJlc3QpO1xyXG4gICAgZm9yICh2YXIga2V5IGluIGRhdGEuYW5pbWF0aW9uLmN1cnJlbnQuYW5pbXMpIHtcclxuICAgICAgdmFyIGNmZyA9IGRhdGEuYW5pbWF0aW9uLmN1cnJlbnQuYW5pbXNba2V5XTtcclxuICAgICAgY2ZnWzFdID0gW3JvdW5kQnkoY2ZnWzBdWzBdICogZWFzZSwgMTApLCByb3VuZEJ5KGNmZ1swXVsxXSAqIGVhc2UsIDEwKV07XHJcbiAgICB9XHJcbiAgICBmb3IgKHZhciBpIGluIGRhdGEuYW5pbWF0aW9uLmN1cnJlbnQuZmFkaW5ncykge1xyXG4gICAgICBkYXRhLmFuaW1hdGlvbi5jdXJyZW50LmZhZGluZ3NbaV0ub3BhY2l0eSA9IHJvdW5kQnkoZWFzZSwgMTAwKTtcclxuICAgIH1cclxuICAgIGRhdGEucmVuZGVyKCk7XHJcbiAgICB1dGlsLnJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbigpIHtcclxuICAgICAgZ28oZGF0YSk7XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFuaW1hdGUodHJhbnNmb3JtYXRpb24sIGRhdGEpIHtcclxuICAvLyBjbG9uZSBkYXRhXHJcbiAgdmFyIHByZXYgPSB7XHJcbiAgICBvcmllbnRhdGlvbjogZGF0YS5vcmllbnRhdGlvbixcclxuICAgIHBpZWNlczoge31cclxuICB9O1xyXG4gIC8vIGNsb25lIHBpZWNlc1xyXG4gIGZvciAodmFyIGtleSBpbiBkYXRhLnBpZWNlcykge1xyXG4gICAgcHJldi5waWVjZXNba2V5XSA9IHtcclxuICAgICAgcm9sZTogZGF0YS5waWVjZXNba2V5XS5yb2xlLFxyXG4gICAgICBjb2xvcjogZGF0YS5waWVjZXNba2V5XS5jb2xvclxyXG4gICAgfTtcclxuICB9XHJcbiAgdmFyIHJlc3VsdCA9IHRyYW5zZm9ybWF0aW9uKCk7XHJcbiAgaWYgKGRhdGEuYW5pbWF0aW9uLmVuYWJsZWQpIHtcclxuICAgIHZhciBwbGFuID0gY29tcHV0ZVBsYW4ocHJldiwgZGF0YSk7XHJcbiAgICBpZiAoT2JqZWN0LmtleXMocGxhbi5hbmltcykubGVuZ3RoID4gMCB8fCBwbGFuLmZhZGluZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICB2YXIgYWxyZWFkeVJ1bm5pbmcgPSBkYXRhLmFuaW1hdGlvbi5jdXJyZW50LnN0YXJ0O1xyXG4gICAgICBkYXRhLmFuaW1hdGlvbi5jdXJyZW50ID0ge1xyXG4gICAgICAgIHN0YXJ0OiBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcclxuICAgICAgICBkdXJhdGlvbjogZGF0YS5hbmltYXRpb24uZHVyYXRpb24sXHJcbiAgICAgICAgYW5pbXM6IHBsYW4uYW5pbXMsXHJcbiAgICAgICAgZmFkaW5nczogcGxhbi5mYWRpbmdzXHJcbiAgICAgIH07XHJcbiAgICAgIGlmICghYWxyZWFkeVJ1bm5pbmcpIGdvKGRhdGEpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gZG9uJ3QgYW5pbWF0ZSwganVzdCByZW5kZXIgcmlnaHQgYXdheVxyXG4gICAgICBkYXRhLnJlbmRlclJBRigpO1xyXG4gICAgfVxyXG4gIH0gZWxzZSB7XHJcbiAgICAvLyBhbmltYXRpb25zIGFyZSBub3cgZGlzYWJsZWRcclxuICAgIGRhdGEucmVuZGVyUkFGKCk7XHJcbiAgfVxyXG4gIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbi8vIHRyYW5zZm9ybWF0aW9uIGlzIGEgZnVuY3Rpb25cclxuLy8gYWNjZXB0cyBib2FyZCBkYXRhIGFuZCBhbnkgbnVtYmVyIG9mIGFyZ3VtZW50cyxcclxuLy8gYW5kIG11dGF0ZXMgdGhlIGJvYXJkLlxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHRyYW5zZm9ybWF0aW9uLCBkYXRhLCBza2lwKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHRyYW5zZm9ybWF0aW9uQXJncyA9IFtkYXRhXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKSk7XHJcbiAgICBpZiAoIWRhdGEucmVuZGVyKSByZXR1cm4gdHJhbnNmb3JtYXRpb24uYXBwbHkobnVsbCwgdHJhbnNmb3JtYXRpb25BcmdzKTtcclxuICAgIGVsc2UgaWYgKGRhdGEuYW5pbWF0aW9uLmVuYWJsZWQgJiYgIXNraXApXHJcbiAgICAgIHJldHVybiBhbmltYXRlKHV0aWwucGFydGlhbEFwcGx5KHRyYW5zZm9ybWF0aW9uLCB0cmFuc2Zvcm1hdGlvbkFyZ3MpLCBkYXRhKTtcclxuICAgIGVsc2Uge1xyXG4gICAgICB2YXIgcmVzdWx0ID0gdHJhbnNmb3JtYXRpb24uYXBwbHkobnVsbCwgdHJhbnNmb3JtYXRpb25BcmdzKTtcclxuICAgICAgZGF0YS5yZW5kZXJSQUYoKTtcclxuICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICB9O1xyXG59O1xyXG4iLCJ2YXIgYm9hcmQgPSByZXF1aXJlKCcuL2JvYXJkJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbnRyb2xsZXIpIHtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHNldDogY29udHJvbGxlci5zZXQsXHJcbiAgICB0b2dnbGVPcmllbnRhdGlvbjogY29udHJvbGxlci50b2dnbGVPcmllbnRhdGlvbixcclxuICAgIGdldE9yaWVudGF0aW9uOiBjb250cm9sbGVyLmdldE9yaWVudGF0aW9uLFxyXG4gICAgZ2V0UGllY2VzOiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGNvbnRyb2xsZXIuZGF0YS5waWVjZXM7XHJcbiAgICB9LFxyXG4gICAgZ2V0TWF0ZXJpYWxEaWZmOiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGJvYXJkLmdldE1hdGVyaWFsRGlmZihjb250cm9sbGVyLmRhdGEpO1xyXG4gICAgfSxcclxuICAgIGdldEZlbjogY29udHJvbGxlci5nZXRGZW4sXHJcbiAgICBtb3ZlOiBjb250cm9sbGVyLmFwaU1vdmUsXHJcbiAgICBuZXdQaWVjZTogY29udHJvbGxlci5hcGlOZXdQaWVjZSxcclxuICAgIHNldFBpZWNlczogY29udHJvbGxlci5zZXRQaWVjZXMsXHJcbiAgICBzZXRDaGVjazogY29udHJvbGxlci5zZXRDaGVjayxcclxuICAgIHBsYXlQcmVtb3ZlOiBjb250cm9sbGVyLnBsYXlQcmVtb3ZlLFxyXG4gICAgcGxheVByZWRyb3A6IGNvbnRyb2xsZXIucGxheVByZWRyb3AsXHJcbiAgICBjYW5jZWxQcmVtb3ZlOiBjb250cm9sbGVyLmNhbmNlbFByZW1vdmUsXHJcbiAgICBjYW5jZWxQcmVkcm9wOiBjb250cm9sbGVyLmNhbmNlbFByZWRyb3AsXHJcbiAgICBjYW5jZWxNb3ZlOiBjb250cm9sbGVyLmNhbmNlbE1vdmUsXHJcbiAgICBzdG9wOiBjb250cm9sbGVyLnN0b3AsXHJcbiAgICBleHBsb2RlOiBjb250cm9sbGVyLmV4cGxvZGUsXHJcbiAgICBzZXRBdXRvU2hhcGVzOiBjb250cm9sbGVyLnNldEF1dG9TaGFwZXMsXHJcbiAgICBzZXRTaGFwZXM6IGNvbnRyb2xsZXIuc2V0U2hhcGVzLFxyXG4gICAgZGF0YTogY29udHJvbGxlci5kYXRhIC8vIGRpcmVjdGx5IGV4cG9zZXMgY2hlc3Nncm91bmQgc3RhdGUgZm9yIG1vcmUgbWVzc2luZyBhcm91bmRcclxuICB9O1xyXG59O1xyXG4iLCJ2YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xyXG52YXIgcHJlbW92ZSA9IHJlcXVpcmUoJy4vcHJlbW92ZScpO1xyXG52YXIgYW5pbSA9IHJlcXVpcmUoJy4vYW5pbScpO1xyXG52YXIgaG9sZCA9IHJlcXVpcmUoJy4vaG9sZCcpO1xyXG5cclxuZnVuY3Rpb24gY2FsbFVzZXJGdW5jdGlvbihmKSB7XHJcbiAgc2V0VGltZW91dChmLCAxKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdG9nZ2xlT3JpZW50YXRpb24oZGF0YSkge1xyXG4gIGRhdGEub3JpZW50YXRpb24gPSB1dGlsLm9wcG9zaXRlKGRhdGEub3JpZW50YXRpb24pO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZXNldChkYXRhKSB7XHJcbiAgZGF0YS5sYXN0TW92ZSA9IG51bGw7XHJcbiAgc2V0U2VsZWN0ZWQoZGF0YSwgbnVsbCk7XHJcbiAgdW5zZXRQcmVtb3ZlKGRhdGEpO1xyXG4gIHVuc2V0UHJlZHJvcChkYXRhKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0UGllY2VzKGRhdGEsIHBpZWNlcykge1xyXG4gIE9iamVjdC5rZXlzKHBpZWNlcykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcclxuICAgIGlmIChwaWVjZXNba2V5XSkgZGF0YS5waWVjZXNba2V5XSA9IHBpZWNlc1trZXldO1xyXG4gICAgZWxzZSBkZWxldGUgZGF0YS5waWVjZXNba2V5XTtcclxuICB9KTtcclxuICBkYXRhLm1vdmFibGUuZHJvcHBlZCA9IFtdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRDaGVjayhkYXRhLCBjb2xvcikge1xyXG4gIHZhciBjaGVja0NvbG9yID0gY29sb3IgfHwgZGF0YS50dXJuQ29sb3I7XHJcbiAgT2JqZWN0LmtleXMoZGF0YS5waWVjZXMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XHJcbiAgICBpZiAoZGF0YS5waWVjZXNba2V5XS5jb2xvciA9PT0gY2hlY2tDb2xvciAmJiBkYXRhLnBpZWNlc1trZXldLnJvbGUgPT09ICdraW5nJykgZGF0YS5jaGVjayA9IGtleTtcclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0UHJlbW92ZShkYXRhLCBvcmlnLCBkZXN0KSB7XHJcbiAgdW5zZXRQcmVkcm9wKGRhdGEpO1xyXG4gIGRhdGEucHJlbW92YWJsZS5jdXJyZW50ID0gW29yaWcsIGRlc3RdO1xyXG4gIGNhbGxVc2VyRnVuY3Rpb24odXRpbC5wYXJ0aWFsKGRhdGEucHJlbW92YWJsZS5ldmVudHMuc2V0LCBvcmlnLCBkZXN0KSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVuc2V0UHJlbW92ZShkYXRhKSB7XHJcbiAgaWYgKGRhdGEucHJlbW92YWJsZS5jdXJyZW50KSB7XHJcbiAgICBkYXRhLnByZW1vdmFibGUuY3VycmVudCA9IG51bGw7XHJcbiAgICBjYWxsVXNlckZ1bmN0aW9uKGRhdGEucHJlbW92YWJsZS5ldmVudHMudW5zZXQpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2V0UHJlZHJvcChkYXRhLCByb2xlLCBrZXkpIHtcclxuICB1bnNldFByZW1vdmUoZGF0YSk7XHJcbiAgZGF0YS5wcmVkcm9wcGFibGUuY3VycmVudCA9IHtcclxuICAgIHJvbGU6IHJvbGUsXHJcbiAgICBrZXk6IGtleVxyXG4gIH07XHJcbiAgY2FsbFVzZXJGdW5jdGlvbih1dGlsLnBhcnRpYWwoZGF0YS5wcmVkcm9wcGFibGUuZXZlbnRzLnNldCwgcm9sZSwga2V5KSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVuc2V0UHJlZHJvcChkYXRhKSB7XHJcbiAgaWYgKGRhdGEucHJlZHJvcHBhYmxlLmN1cnJlbnQua2V5KSB7XHJcbiAgICBkYXRhLnByZWRyb3BwYWJsZS5jdXJyZW50ID0ge307XHJcbiAgICBjYWxsVXNlckZ1bmN0aW9uKGRhdGEucHJlZHJvcHBhYmxlLmV2ZW50cy51bnNldCk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB0cnlBdXRvQ2FzdGxlKGRhdGEsIG9yaWcsIGRlc3QpIHtcclxuICBpZiAoIWRhdGEuYXV0b0Nhc3RsZSkgcmV0dXJuO1xyXG4gIHZhciBraW5nID0gZGF0YS5waWVjZXNbZGVzdF07XHJcbiAgaWYgKGtpbmcucm9sZSAhPT0gJ2tpbmcnKSByZXR1cm47XHJcbiAgdmFyIG9yaWdQb3MgPSB1dGlsLmtleTJwb3Mob3JpZyk7XHJcbiAgaWYgKG9yaWdQb3NbMF0gIT09IDUpIHJldHVybjtcclxuICBpZiAob3JpZ1Bvc1sxXSAhPT0gMSAmJiBvcmlnUG9zWzFdICE9PSA4KSByZXR1cm47XHJcbiAgdmFyIGRlc3RQb3MgPSB1dGlsLmtleTJwb3MoZGVzdCksXHJcbiAgICBvbGRSb29rUG9zLCBuZXdSb29rUG9zLCBuZXdLaW5nUG9zO1xyXG4gIGlmIChkZXN0UG9zWzBdID09PSA3IHx8IGRlc3RQb3NbMF0gPT09IDgpIHtcclxuICAgIG9sZFJvb2tQb3MgPSB1dGlsLnBvczJrZXkoWzgsIG9yaWdQb3NbMV1dKTtcclxuICAgIG5ld1Jvb2tQb3MgPSB1dGlsLnBvczJrZXkoWzYsIG9yaWdQb3NbMV1dKTtcclxuICAgIG5ld0tpbmdQb3MgPSB1dGlsLnBvczJrZXkoWzcsIG9yaWdQb3NbMV1dKTtcclxuICB9IGVsc2UgaWYgKGRlc3RQb3NbMF0gPT09IDMgfHwgZGVzdFBvc1swXSA9PT0gMSkge1xyXG4gICAgb2xkUm9va1BvcyA9IHV0aWwucG9zMmtleShbMSwgb3JpZ1Bvc1sxXV0pO1xyXG4gICAgbmV3Um9va1BvcyA9IHV0aWwucG9zMmtleShbNCwgb3JpZ1Bvc1sxXV0pO1xyXG4gICAgbmV3S2luZ1BvcyA9IHV0aWwucG9zMmtleShbMywgb3JpZ1Bvc1sxXV0pO1xyXG4gIH0gZWxzZSByZXR1cm47XHJcbiAgZGVsZXRlIGRhdGEucGllY2VzW29yaWddO1xyXG4gIGRlbGV0ZSBkYXRhLnBpZWNlc1tkZXN0XTtcclxuICBkZWxldGUgZGF0YS5waWVjZXNbb2xkUm9va1Bvc107XHJcbiAgZGF0YS5waWVjZXNbbmV3S2luZ1Bvc10gPSB7XHJcbiAgICByb2xlOiAna2luZycsXHJcbiAgICBjb2xvcjoga2luZy5jb2xvclxyXG4gIH07XHJcbiAgZGF0YS5waWVjZXNbbmV3Um9va1Bvc10gPSB7XHJcbiAgICByb2xlOiAncm9vaycsXHJcbiAgICBjb2xvcjoga2luZy5jb2xvclxyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJhc2VNb3ZlKGRhdGEsIG9yaWcsIGRlc3QpIHtcclxuICB2YXIgc3VjY2VzcyA9IGFuaW0oZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAob3JpZyA9PT0gZGVzdCB8fCAhZGF0YS5waWVjZXNbb3JpZ10pIHJldHVybiBmYWxzZTtcclxuICAgIHZhciBjYXB0dXJlZCA9IChcclxuICAgICAgZGF0YS5waWVjZXNbZGVzdF0gJiZcclxuICAgICAgZGF0YS5waWVjZXNbZGVzdF0uY29sb3IgIT09IGRhdGEucGllY2VzW29yaWddLmNvbG9yXHJcbiAgICApID8gZGF0YS5waWVjZXNbZGVzdF0gOiBudWxsO1xyXG4gICAgY2FsbFVzZXJGdW5jdGlvbih1dGlsLnBhcnRpYWwoZGF0YS5ldmVudHMubW92ZSwgb3JpZywgZGVzdCwgY2FwdHVyZWQpKTtcclxuICAgIGRhdGEucGllY2VzW2Rlc3RdID0gZGF0YS5waWVjZXNbb3JpZ107XHJcbiAgICBkZWxldGUgZGF0YS5waWVjZXNbb3JpZ107XHJcbiAgICBkYXRhLmxhc3RNb3ZlID0gW29yaWcsIGRlc3RdO1xyXG4gICAgZGF0YS5jaGVjayA9IG51bGw7XHJcbiAgICB0cnlBdXRvQ2FzdGxlKGRhdGEsIG9yaWcsIGRlc3QpO1xyXG4gICAgY2FsbFVzZXJGdW5jdGlvbihkYXRhLmV2ZW50cy5jaGFuZ2UpO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfSwgZGF0YSkoKTtcclxuICBpZiAoc3VjY2VzcykgZGF0YS5tb3ZhYmxlLmRyb3BwZWQgPSBbXTtcclxuICByZXR1cm4gc3VjY2VzcztcclxufVxyXG5cclxuZnVuY3Rpb24gYmFzZU5ld1BpZWNlKGRhdGEsIHBpZWNlLCBrZXkpIHtcclxuICBpZiAoZGF0YS5waWVjZXNba2V5XSkgcmV0dXJuIGZhbHNlO1xyXG4gIGNhbGxVc2VyRnVuY3Rpb24odXRpbC5wYXJ0aWFsKGRhdGEuZXZlbnRzLmRyb3BOZXdQaWVjZSwgcGllY2UsIGtleSkpO1xyXG4gIGRhdGEucGllY2VzW2tleV0gPSBwaWVjZTtcclxuICBkYXRhLmxhc3RNb3ZlID0gW2tleSwga2V5XTtcclxuICBkYXRhLmNoZWNrID0gbnVsbDtcclxuICBjYWxsVXNlckZ1bmN0aW9uKGRhdGEuZXZlbnRzLmNoYW5nZSk7XHJcbiAgZGF0YS5tb3ZhYmxlLmRyb3BwZWQgPSBbXTtcclxuICBkYXRhLm1vdmFibGUuZGVzdHMgPSB7fTtcclxuICBkYXRhLnR1cm5Db2xvciA9IHV0aWwub3Bwb3NpdGUoZGF0YS50dXJuQ29sb3IpO1xyXG4gIGRhdGEucmVuZGVyUkFGKCk7XHJcbiAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJhc2VVc2VyTW92ZShkYXRhLCBvcmlnLCBkZXN0KSB7XHJcbiAgdmFyIHJlc3VsdCA9IGJhc2VNb3ZlKGRhdGEsIG9yaWcsIGRlc3QpO1xyXG4gIGlmIChyZXN1bHQpIHtcclxuICAgIGRhdGEubW92YWJsZS5kZXN0cyA9IHt9O1xyXG4gICAgZGF0YS50dXJuQ29sb3IgPSB1dGlsLm9wcG9zaXRlKGRhdGEudHVybkNvbG9yKTtcclxuICB9XHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZnVuY3Rpb24gYXBpTW92ZShkYXRhLCBvcmlnLCBkZXN0KSB7XHJcbiAgcmV0dXJuIGJhc2VNb3ZlKGRhdGEsIG9yaWcsIGRlc3QpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhcGlOZXdQaWVjZShkYXRhLCBwaWVjZSwga2V5KSB7XHJcbiAgcmV0dXJuIGJhc2VOZXdQaWVjZShkYXRhLCBwaWVjZSwga2V5KTtcclxufVxyXG5cclxuZnVuY3Rpb24gdXNlck1vdmUoZGF0YSwgb3JpZywgZGVzdCkge1xyXG4gIGlmICghZGVzdCkge1xyXG4gICAgaG9sZC5jYW5jZWwoKTtcclxuICAgIHNldFNlbGVjdGVkKGRhdGEsIG51bGwpO1xyXG4gICAgaWYgKGRhdGEubW92YWJsZS5kcm9wT2ZmID09PSAndHJhc2gnKSB7XHJcbiAgICAgIGRlbGV0ZSBkYXRhLnBpZWNlc1tvcmlnXTtcclxuICAgICAgY2FsbFVzZXJGdW5jdGlvbihkYXRhLmV2ZW50cy5jaGFuZ2UpO1xyXG4gICAgfVxyXG4gIH0gZWxzZSBpZiAoY2FuTW92ZShkYXRhLCBvcmlnLCBkZXN0KSkge1xyXG4gICAgaWYgKGJhc2VVc2VyTW92ZShkYXRhLCBvcmlnLCBkZXN0KSkge1xyXG4gICAgICB2YXIgaG9sZFRpbWUgPSBob2xkLnN0b3AoKTtcclxuICAgICAgc2V0U2VsZWN0ZWQoZGF0YSwgbnVsbCk7XHJcbiAgICAgIGNhbGxVc2VyRnVuY3Rpb24odXRpbC5wYXJ0aWFsKGRhdGEubW92YWJsZS5ldmVudHMuYWZ0ZXIsIG9yaWcsIGRlc3QsIHtcclxuICAgICAgICBwcmVtb3ZlOiBmYWxzZSxcclxuICAgICAgICBob2xkVGltZTogaG9sZFRpbWVcclxuICAgICAgfSkpO1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICB9IGVsc2UgaWYgKGNhblByZW1vdmUoZGF0YSwgb3JpZywgZGVzdCkpIHtcclxuICAgIHNldFByZW1vdmUoZGF0YSwgb3JpZywgZGVzdCk7XHJcbiAgICBzZXRTZWxlY3RlZChkYXRhLCBudWxsKTtcclxuICB9IGVsc2UgaWYgKGlzTW92YWJsZShkYXRhLCBkZXN0KSB8fCBpc1ByZW1vdmFibGUoZGF0YSwgZGVzdCkpIHtcclxuICAgIHNldFNlbGVjdGVkKGRhdGEsIGRlc3QpO1xyXG4gICAgaG9sZC5zdGFydCgpO1xyXG4gIH0gZWxzZSBzZXRTZWxlY3RlZChkYXRhLCBudWxsKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJvcE5ld1BpZWNlKGRhdGEsIG9yaWcsIGRlc3QpIHtcclxuICBpZiAoY2FuRHJvcChkYXRhLCBvcmlnLCBkZXN0KSkge1xyXG4gICAgdmFyIHBpZWNlID0gZGF0YS5waWVjZXNbb3JpZ107XHJcbiAgICBkZWxldGUgZGF0YS5waWVjZXNbb3JpZ107XHJcbiAgICBiYXNlTmV3UGllY2UoZGF0YSwgcGllY2UsIGRlc3QpO1xyXG4gICAgZGF0YS5tb3ZhYmxlLmRyb3BwZWQgPSBbXTtcclxuICAgIGNhbGxVc2VyRnVuY3Rpb24odXRpbC5wYXJ0aWFsKGRhdGEubW92YWJsZS5ldmVudHMuYWZ0ZXJOZXdQaWVjZSwgcGllY2Uucm9sZSwgZGVzdCwge1xyXG4gICAgICBwcmVkcm9wOiBmYWxzZVxyXG4gICAgfSkpO1xyXG4gIH0gZWxzZSBpZiAoY2FuUHJlZHJvcChkYXRhLCBvcmlnLCBkZXN0KSkge1xyXG4gICAgc2V0UHJlZHJvcChkYXRhLCBkYXRhLnBpZWNlc1tvcmlnXS5yb2xlLCBkZXN0KTtcclxuICB9IGVsc2Uge1xyXG4gICAgdW5zZXRQcmVtb3ZlKGRhdGEpO1xyXG4gICAgdW5zZXRQcmVkcm9wKGRhdGEpO1xyXG4gIH1cclxuICBkZWxldGUgZGF0YS5waWVjZXNbb3JpZ107XHJcbiAgc2V0U2VsZWN0ZWQoZGF0YSwgbnVsbCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlbGVjdFNxdWFyZShkYXRhLCBrZXkpIHtcclxuICBpZiAoZGF0YS5zZWxlY3RlZCkge1xyXG4gICAgaWYgKGtleSkge1xyXG4gICAgICBpZiAoZGF0YS5zZWxlY3RlZCA9PT0ga2V5ICYmICFkYXRhLmRyYWdnYWJsZS5lbmFibGVkKSB7XHJcbiAgICAgICAgc2V0U2VsZWN0ZWQoZGF0YSwgbnVsbCk7XHJcbiAgICAgICAgaG9sZC5jYW5jZWwoKTtcclxuICAgICAgfSBlbHNlIGlmIChkYXRhLnNlbGVjdGFibGUuZW5hYmxlZCAmJiBkYXRhLnNlbGVjdGVkICE9PSBrZXkpIHtcclxuICAgICAgICBpZiAodXNlck1vdmUoZGF0YSwgZGF0YS5zZWxlY3RlZCwga2V5KSkgZGF0YS5zdGF0cy5kcmFnZ2VkID0gZmFsc2U7XHJcbiAgICAgIH0gZWxzZSBob2xkLnN0YXJ0KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzZXRTZWxlY3RlZChkYXRhLCBudWxsKTtcclxuICAgICAgaG9sZC5jYW5jZWwoKTtcclxuICAgIH1cclxuICB9IGVsc2UgaWYgKGlzTW92YWJsZShkYXRhLCBrZXkpIHx8IGlzUHJlbW92YWJsZShkYXRhLCBrZXkpKSB7XHJcbiAgICBzZXRTZWxlY3RlZChkYXRhLCBrZXkpO1xyXG4gICAgaG9sZC5zdGFydCgpO1xyXG4gIH1cclxuICBpZiAoa2V5KSBjYWxsVXNlckZ1bmN0aW9uKHV0aWwucGFydGlhbChkYXRhLmV2ZW50cy5zZWxlY3QsIGtleSkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRTZWxlY3RlZChkYXRhLCBrZXkpIHtcclxuICBkYXRhLnNlbGVjdGVkID0ga2V5O1xyXG4gIGlmIChrZXkgJiYgaXNQcmVtb3ZhYmxlKGRhdGEsIGtleSkpXHJcbiAgICBkYXRhLnByZW1vdmFibGUuZGVzdHMgPSBwcmVtb3ZlKGRhdGEucGllY2VzLCBrZXksIGRhdGEucHJlbW92YWJsZS5jYXN0bGUpO1xyXG4gIGVsc2VcclxuICAgIGRhdGEucHJlbW92YWJsZS5kZXN0cyA9IG51bGw7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzTW92YWJsZShkYXRhLCBvcmlnKSB7XHJcbiAgdmFyIHBpZWNlID0gZGF0YS5waWVjZXNbb3JpZ107XHJcbiAgcmV0dXJuIHBpZWNlICYmIChcclxuICAgIGRhdGEubW92YWJsZS5jb2xvciA9PT0gJ2JvdGgnIHx8IChcclxuICAgICAgZGF0YS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJlxyXG4gICAgICBkYXRhLnR1cm5Db2xvciA9PT0gcGllY2UuY29sb3JcclxuICAgICkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5Nb3ZlKGRhdGEsIG9yaWcsIGRlc3QpIHtcclxuICByZXR1cm4gb3JpZyAhPT0gZGVzdCAmJiBpc01vdmFibGUoZGF0YSwgb3JpZykgJiYgKFxyXG4gICAgZGF0YS5tb3ZhYmxlLmZyZWUgfHwgdXRpbC5jb250YWluc1goZGF0YS5tb3ZhYmxlLmRlc3RzW29yaWddLCBkZXN0KVxyXG4gICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbkRyb3AoZGF0YSwgb3JpZywgZGVzdCkge1xyXG4gIHZhciBwaWVjZSA9IGRhdGEucGllY2VzW29yaWddO1xyXG4gIHJldHVybiBwaWVjZSAmJiBkZXN0ICYmIChvcmlnID09PSBkZXN0IHx8ICFkYXRhLnBpZWNlc1tkZXN0XSkgJiYgKFxyXG4gICAgZGF0YS5tb3ZhYmxlLmNvbG9yID09PSAnYm90aCcgfHwgKFxyXG4gICAgICBkYXRhLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmXHJcbiAgICAgIGRhdGEudHVybkNvbG9yID09PSBwaWVjZS5jb2xvclxyXG4gICAgKSk7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBpc1ByZW1vdmFibGUoZGF0YSwgb3JpZykge1xyXG4gIHZhciBwaWVjZSA9IGRhdGEucGllY2VzW29yaWddO1xyXG4gIHJldHVybiBwaWVjZSAmJiBkYXRhLnByZW1vdmFibGUuZW5hYmxlZCAmJlxyXG4gICAgZGF0YS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJlxyXG4gICAgZGF0YS50dXJuQ29sb3IgIT09IHBpZWNlLmNvbG9yO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5QcmVtb3ZlKGRhdGEsIG9yaWcsIGRlc3QpIHtcclxuICByZXR1cm4gb3JpZyAhPT0gZGVzdCAmJlxyXG4gICAgaXNQcmVtb3ZhYmxlKGRhdGEsIG9yaWcpICYmXHJcbiAgICB1dGlsLmNvbnRhaW5zWChwcmVtb3ZlKGRhdGEucGllY2VzLCBvcmlnLCBkYXRhLnByZW1vdmFibGUuY2FzdGxlKSwgZGVzdCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhblByZWRyb3AoZGF0YSwgb3JpZywgZGVzdCkge1xyXG4gIHZhciBwaWVjZSA9IGRhdGEucGllY2VzW29yaWddO1xyXG4gIHJldHVybiBwaWVjZSAmJiBkZXN0ICYmXHJcbiAgICAoIWRhdGEucGllY2VzW2Rlc3RdIHx8IGRhdGEucGllY2VzW2Rlc3RdLmNvbG9yICE9PSBkYXRhLm1vdmFibGUuY29sb3IpICYmXHJcbiAgICBkYXRhLnByZWRyb3BwYWJsZS5lbmFibGVkICYmXHJcbiAgICAocGllY2Uucm9sZSAhPT0gJ3Bhd24nIHx8IChkZXN0WzFdICE9PSAnMScgJiYgZGVzdFsxXSAhPT0gJzgnKSkgJiZcclxuICAgIGRhdGEubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcclxuICAgIGRhdGEudHVybkNvbG9yICE9PSBwaWVjZS5jb2xvcjtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNEcmFnZ2FibGUoZGF0YSwgb3JpZykge1xyXG4gIHZhciBwaWVjZSA9IGRhdGEucGllY2VzW29yaWddO1xyXG4gIHJldHVybiBwaWVjZSAmJiBkYXRhLmRyYWdnYWJsZS5lbmFibGVkICYmIChcclxuICAgIGRhdGEubW92YWJsZS5jb2xvciA9PT0gJ2JvdGgnIHx8IChcclxuICAgICAgZGF0YS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJiAoXHJcbiAgICAgICAgZGF0YS50dXJuQ29sb3IgPT09IHBpZWNlLmNvbG9yIHx8IGRhdGEucHJlbW92YWJsZS5lbmFibGVkXHJcbiAgICAgIClcclxuICAgIClcclxuICApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwbGF5UHJlbW92ZShkYXRhKSB7XHJcbiAgdmFyIG1vdmUgPSBkYXRhLnByZW1vdmFibGUuY3VycmVudDtcclxuICBpZiAoIW1vdmUpIHJldHVybjtcclxuICB2YXIgb3JpZyA9IG1vdmVbMF0sXHJcbiAgICBkZXN0ID0gbW92ZVsxXSxcclxuICAgIHN1Y2Nlc3MgPSBmYWxzZTtcclxuICBpZiAoY2FuTW92ZShkYXRhLCBvcmlnLCBkZXN0KSkge1xyXG4gICAgaWYgKGJhc2VVc2VyTW92ZShkYXRhLCBvcmlnLCBkZXN0KSkge1xyXG4gICAgICBjYWxsVXNlckZ1bmN0aW9uKHV0aWwucGFydGlhbChkYXRhLm1vdmFibGUuZXZlbnRzLmFmdGVyLCBvcmlnLCBkZXN0LCB7XHJcbiAgICAgICAgcHJlbW92ZTogdHJ1ZVxyXG4gICAgICB9KSk7XHJcbiAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xyXG4gICAgfVxyXG4gIH1cclxuICB1bnNldFByZW1vdmUoZGF0YSk7XHJcbiAgcmV0dXJuIHN1Y2Nlc3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBsYXlQcmVkcm9wKGRhdGEsIHZhbGlkYXRlKSB7XHJcbiAgdmFyIGRyb3AgPSBkYXRhLnByZWRyb3BwYWJsZS5jdXJyZW50LFxyXG4gICAgc3VjY2VzcyA9IGZhbHNlO1xyXG4gIGlmICghZHJvcC5rZXkpIHJldHVybjtcclxuICBpZiAodmFsaWRhdGUoZHJvcCkpIHtcclxuICAgIHZhciBwaWVjZSA9IHtcclxuICAgICAgcm9sZTogZHJvcC5yb2xlLFxyXG4gICAgICBjb2xvcjogZGF0YS5tb3ZhYmxlLmNvbG9yXHJcbiAgICB9O1xyXG4gICAgaWYgKGJhc2VOZXdQaWVjZShkYXRhLCBwaWVjZSwgZHJvcC5rZXkpKSB7XHJcbiAgICAgIGNhbGxVc2VyRnVuY3Rpb24odXRpbC5wYXJ0aWFsKGRhdGEubW92YWJsZS5ldmVudHMuYWZ0ZXJOZXdQaWVjZSwgZHJvcC5yb2xlLCBkcm9wLmtleSwge1xyXG4gICAgICAgIHByZWRyb3A6IHRydWVcclxuICAgICAgfSkpO1xyXG4gICAgICBzdWNjZXNzID0gdHJ1ZTtcclxuICAgIH1cclxuICB9XHJcbiAgdW5zZXRQcmVkcm9wKGRhdGEpO1xyXG4gIHJldHVybiBzdWNjZXNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5jZWxNb3ZlKGRhdGEpIHtcclxuICB1bnNldFByZW1vdmUoZGF0YSk7XHJcbiAgdW5zZXRQcmVkcm9wKGRhdGEpO1xyXG4gIHNlbGVjdFNxdWFyZShkYXRhLCBudWxsKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcChkYXRhKSB7XHJcbiAgZGF0YS5tb3ZhYmxlLmNvbG9yID0gbnVsbDtcclxuICBkYXRhLm1vdmFibGUuZGVzdHMgPSB7fTtcclxuICBjYW5jZWxNb3ZlKGRhdGEpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRLZXlBdERvbVBvcyhkYXRhLCBwb3MsIGJvdW5kcykge1xyXG4gIGlmICghYm91bmRzICYmICFkYXRhLmJvdW5kcykgcmV0dXJuO1xyXG4gIGJvdW5kcyA9IGJvdW5kcyB8fCBkYXRhLmJvdW5kcygpOyAvLyB1c2UgcHJvdmlkZWQgdmFsdWUsIG9yIGNvbXB1dGUgaXRcclxuICB2YXIgZmlsZSA9IE1hdGguY2VpbCg4ICogKChwb3NbMF0gLSBib3VuZHMubGVmdCkgLyBib3VuZHMud2lkdGgpKTtcclxuICBmaWxlID0gZGF0YS5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJyA/IGZpbGUgOiA5IC0gZmlsZTtcclxuICB2YXIgcmFuayA9IE1hdGguY2VpbCg4IC0gKDggKiAoKHBvc1sxXSAtIGJvdW5kcy50b3ApIC8gYm91bmRzLmhlaWdodCkpKTtcclxuICByYW5rID0gZGF0YS5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJyA/IHJhbmsgOiA5IC0gcmFuaztcclxuICBpZiAoZmlsZSA+IDAgJiYgZmlsZSA8IDkgJiYgcmFuayA+IDAgJiYgcmFuayA8IDkpIHJldHVybiB1dGlsLnBvczJrZXkoW2ZpbGUsIHJhbmtdKTtcclxufVxyXG5cclxuLy8ge3doaXRlOiB7cGF3bjogMyBxdWVlbjogMX0sIGJsYWNrOiB7YmlzaG9wOiAyfX1cclxuZnVuY3Rpb24gZ2V0TWF0ZXJpYWxEaWZmKGRhdGEpIHtcclxuICB2YXIgY291bnRzID0ge1xyXG4gICAga2luZzogMCxcclxuICAgIHF1ZWVuOiAwLFxyXG4gICAgcm9vazogMCxcclxuICAgIGJpc2hvcDogMCxcclxuICAgIGtuaWdodDogMCxcclxuICAgIHBhd246IDBcclxuICB9O1xyXG4gIGZvciAodmFyIGsgaW4gZGF0YS5waWVjZXMpIHtcclxuICAgIHZhciBwID0gZGF0YS5waWVjZXNba107XHJcbiAgICBjb3VudHNbcC5yb2xlXSArPSAoKHAuY29sb3IgPT09ICd3aGl0ZScpID8gMSA6IC0xKTtcclxuICB9XHJcbiAgdmFyIGRpZmYgPSB7XHJcbiAgICB3aGl0ZToge30sXHJcbiAgICBibGFjazoge31cclxuICB9O1xyXG4gIGZvciAodmFyIHJvbGUgaW4gY291bnRzKSB7XHJcbiAgICB2YXIgYyA9IGNvdW50c1tyb2xlXTtcclxuICAgIGlmIChjID4gMCkgZGlmZi53aGl0ZVtyb2xlXSA9IGM7XHJcbiAgICBlbHNlIGlmIChjIDwgMCkgZGlmZi5ibGFja1tyb2xlXSA9IC1jO1xyXG4gIH1cclxuICByZXR1cm4gZGlmZjtcclxufVxyXG5cclxudmFyIHBpZWNlU2NvcmVzID0ge1xyXG4gIHBhd246IDEsXHJcbiAga25pZ2h0OiAzLFxyXG4gIGJpc2hvcDogMyxcclxuICByb29rOiA1LFxyXG4gIHF1ZWVuOiA5LFxyXG4gIGtpbmc6IDBcclxufTtcclxuXHJcbmZ1bmN0aW9uIGdldFNjb3JlKGRhdGEpIHtcclxuICB2YXIgc2NvcmUgPSAwO1xyXG4gIGZvciAodmFyIGsgaW4gZGF0YS5waWVjZXMpIHtcclxuICAgIHNjb3JlICs9IHBpZWNlU2NvcmVzW2RhdGEucGllY2VzW2tdLnJvbGVdICogKGRhdGEucGllY2VzW2tdLmNvbG9yID09PSAnd2hpdGUnID8gMSA6IC0xKTtcclxuICB9XHJcbiAgcmV0dXJuIHNjb3JlO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICByZXNldDogcmVzZXQsXHJcbiAgdG9nZ2xlT3JpZW50YXRpb246IHRvZ2dsZU9yaWVudGF0aW9uLFxyXG4gIHNldFBpZWNlczogc2V0UGllY2VzLFxyXG4gIHNldENoZWNrOiBzZXRDaGVjayxcclxuICBzZWxlY3RTcXVhcmU6IHNlbGVjdFNxdWFyZSxcclxuICBzZXRTZWxlY3RlZDogc2V0U2VsZWN0ZWQsXHJcbiAgaXNEcmFnZ2FibGU6IGlzRHJhZ2dhYmxlLFxyXG4gIGNhbk1vdmU6IGNhbk1vdmUsXHJcbiAgdXNlck1vdmU6IHVzZXJNb3ZlLFxyXG4gIGRyb3BOZXdQaWVjZTogZHJvcE5ld1BpZWNlLFxyXG4gIGFwaU1vdmU6IGFwaU1vdmUsXHJcbiAgYXBpTmV3UGllY2U6IGFwaU5ld1BpZWNlLFxyXG4gIHBsYXlQcmVtb3ZlOiBwbGF5UHJlbW92ZSxcclxuICBwbGF5UHJlZHJvcDogcGxheVByZWRyb3AsXHJcbiAgdW5zZXRQcmVtb3ZlOiB1bnNldFByZW1vdmUsXHJcbiAgdW5zZXRQcmVkcm9wOiB1bnNldFByZWRyb3AsXHJcbiAgY2FuY2VsTW92ZTogY2FuY2VsTW92ZSxcclxuICBzdG9wOiBzdG9wLFxyXG4gIGdldEtleUF0RG9tUG9zOiBnZXRLZXlBdERvbVBvcyxcclxuICBnZXRNYXRlcmlhbERpZmY6IGdldE1hdGVyaWFsRGlmZixcclxuICBnZXRTY29yZTogZ2V0U2NvcmVcclxufTtcclxuIiwidmFyIG1lcmdlID0gcmVxdWlyZSgnbWVyZ2UnKTtcclxudmFyIGJvYXJkID0gcmVxdWlyZSgnLi9ib2FyZCcpO1xyXG52YXIgZmVuID0gcmVxdWlyZSgnLi9mZW4nKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZGF0YSwgY29uZmlnKSB7XHJcblxyXG4gIGlmICghY29uZmlnKSByZXR1cm47XHJcblxyXG4gIC8vIGRvbid0IG1lcmdlIGRlc3RpbmF0aW9ucy4gSnVzdCBvdmVycmlkZS5cclxuICBpZiAoY29uZmlnLm1vdmFibGUgJiYgY29uZmlnLm1vdmFibGUuZGVzdHMpIGRlbGV0ZSBkYXRhLm1vdmFibGUuZGVzdHM7XHJcblxyXG4gIG1lcmdlLnJlY3Vyc2l2ZShkYXRhLCBjb25maWcpO1xyXG5cclxuICAvLyBpZiBhIGZlbiB3YXMgcHJvdmlkZWQsIHJlcGxhY2UgdGhlIHBpZWNlc1xyXG4gIGlmIChkYXRhLmZlbikge1xyXG4gICAgZGF0YS5waWVjZXMgPSBmZW4ucmVhZChkYXRhLmZlbik7XHJcbiAgICBkYXRhLmNoZWNrID0gY29uZmlnLmNoZWNrO1xyXG4gICAgZGF0YS5kcmF3YWJsZS5zaGFwZXMgPSBbXTtcclxuICAgIGRlbGV0ZSBkYXRhLmZlbjtcclxuICB9XHJcblxyXG4gIGlmIChkYXRhLmNoZWNrID09PSB0cnVlKSBib2FyZC5zZXRDaGVjayhkYXRhKTtcclxuXHJcbiAgLy8gZm9yZ2V0IGFib3V0IHRoZSBsYXN0IGRyb3BwZWQgcGllY2VcclxuICBkYXRhLm1vdmFibGUuZHJvcHBlZCA9IFtdO1xyXG5cclxuICAvLyBmaXggbW92ZS9wcmVtb3ZlIGRlc3RzXHJcbiAgaWYgKGRhdGEuc2VsZWN0ZWQpIGJvYXJkLnNldFNlbGVjdGVkKGRhdGEsIGRhdGEuc2VsZWN0ZWQpO1xyXG5cclxuICAvLyBubyBuZWVkIGZvciBzdWNoIHNob3J0IGFuaW1hdGlvbnNcclxuICBpZiAoIWRhdGEuYW5pbWF0aW9uLmR1cmF0aW9uIHx8IGRhdGEuYW5pbWF0aW9uLmR1cmF0aW9uIDwgNDApXHJcbiAgICBkYXRhLmFuaW1hdGlvbi5lbmFibGVkID0gZmFsc2U7XHJcblxyXG4gIGlmICghZGF0YS5tb3ZhYmxlLnJvb2tDYXN0bGUpIHtcclxuICAgIHZhciByYW5rID0gZGF0YS5tb3ZhYmxlLmNvbG9yID09PSAnd2hpdGUnID8gMSA6IDg7XHJcbiAgICB2YXIga2luZ1N0YXJ0UG9zID0gJ2UnICsgcmFuaztcclxuICAgIGlmIChkYXRhLm1vdmFibGUuZGVzdHMpIHtcclxuICAgICAgdmFyIGRlc3RzID0gZGF0YS5tb3ZhYmxlLmRlc3RzW2tpbmdTdGFydFBvc107XHJcbiAgICAgIGlmICghZGVzdHMgfHwgZGF0YS5waWVjZXNba2luZ1N0YXJ0UG9zXS5yb2xlICE9PSAna2luZycpIHJldHVybjtcclxuICAgICAgZGF0YS5tb3ZhYmxlLmRlc3RzW2tpbmdTdGFydFBvc10gPSBkZXN0cy5maWx0ZXIoZnVuY3Rpb24oZCkge1xyXG4gICAgICAgIHJldHVybiBkICE9PSAnYScgKyByYW5rICYmIGQgIT09ICdoJyArIHJhbmtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG59O1xyXG4iLCJ2YXIgbSA9IHJlcXVpcmUoJ21pdGhyaWwnKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcclxuXHJcbmZ1bmN0aW9uIHJlbmRlckNvb3JkcyhlbGVtcywga2xhc3MsIG9yaWVudCkge1xyXG4gIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Nvb3JkcycpO1xyXG4gIGVsLmNsYXNzTmFtZSA9IGtsYXNzO1xyXG4gIGVsZW1zLmZvckVhY2goZnVuY3Rpb24oY29udGVudCkge1xyXG4gICAgdmFyIGYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjb29yZCcpO1xyXG4gICAgZi50ZXh0Q29udGVudCA9IGNvbnRlbnQ7XHJcbiAgICBlbC5hcHBlbmRDaGlsZChmKTtcclxuICB9KTtcclxuICByZXR1cm4gZWw7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3JpZW50YXRpb24sIGVsKSB7XHJcblxyXG4gIHV0aWwucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGNvb3JkcyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcclxuICAgIHZhciBvcmllbnRDbGFzcyA9IG9yaWVudGF0aW9uID09PSAnYmxhY2snID8gJyBibGFjaycgOiAnJztcclxuICAgIGNvb3Jkcy5hcHBlbmRDaGlsZChyZW5kZXJDb29yZHModXRpbC5yYW5rcywgJ3JhbmtzJyArIG9yaWVudENsYXNzKSk7XHJcbiAgICBjb29yZHMuYXBwZW5kQ2hpbGQocmVuZGVyQ29vcmRzKHV0aWwuZmlsZXMsICdmaWxlcycgKyBvcmllbnRDbGFzcykpO1xyXG4gICAgZWwuYXBwZW5kQ2hpbGQoY29vcmRzKTtcclxuICB9KTtcclxuXHJcbiAgdmFyIG9yaWVudGF0aW9uO1xyXG5cclxuICByZXR1cm4gZnVuY3Rpb24obykge1xyXG4gICAgaWYgKG8gPT09IG9yaWVudGF0aW9uKSByZXR1cm47XHJcbiAgICBvcmllbnRhdGlvbiA9IG87XHJcbiAgICB2YXIgY29vcmRzID0gZWwucXVlcnlTZWxlY3RvckFsbCgnY29vcmRzJyk7XHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29vcmRzLmxlbmd0aDsgKytpKVxyXG4gICAgICBjb29yZHNbaV0uY2xhc3NMaXN0LnRvZ2dsZSgnYmxhY2snLCBvID09PSAnYmxhY2snKTtcclxuICB9O1xyXG59XHJcbiIsInZhciBib2FyZCA9IHJlcXVpcmUoJy4vYm9hcmQnKTtcclxudmFyIGRhdGEgPSByZXF1aXJlKCcuL2RhdGEnKTtcclxudmFyIGZlbiA9IHJlcXVpcmUoJy4vZmVuJyk7XHJcbnZhciBjb25maWd1cmUgPSByZXF1aXJlKCcuL2NvbmZpZ3VyZScpO1xyXG52YXIgYW5pbSA9IHJlcXVpcmUoJy4vYW5pbScpO1xyXG52YXIgZHJhZyA9IHJlcXVpcmUoJy4vZHJhZycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjZmcpIHtcclxuXHJcbiAgdGhpcy5kYXRhID0gZGF0YShjZmcpO1xyXG5cclxuICB0aGlzLnZtID0ge1xyXG4gICAgZXhwbG9kaW5nOiBmYWxzZVxyXG4gIH07XHJcblxyXG4gIHRoaXMuZ2V0RmVuID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gZmVuLndyaXRlKHRoaXMuZGF0YS5waWVjZXMpO1xyXG4gIH0uYmluZCh0aGlzKTtcclxuXHJcbiAgdGhpcy5nZXRPcmllbnRhdGlvbiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuZGF0YS5vcmllbnRhdGlvbjtcclxuICB9LmJpbmQodGhpcyk7XHJcblxyXG4gIHRoaXMuc2V0ID0gYW5pbShjb25maWd1cmUsIHRoaXMuZGF0YSk7XHJcblxyXG4gIHRoaXMudG9nZ2xlT3JpZW50YXRpb24gPSBmdW5jdGlvbigpIHtcclxuICAgIGFuaW0oYm9hcmQudG9nZ2xlT3JpZW50YXRpb24sIHRoaXMuZGF0YSkoKTtcclxuICAgIGlmICh0aGlzLmRhdGEucmVkcmF3Q29vcmRzKSB0aGlzLmRhdGEucmVkcmF3Q29vcmRzKHRoaXMuZGF0YS5vcmllbnRhdGlvbik7XHJcbiAgfS5iaW5kKHRoaXMpO1xyXG5cclxuICB0aGlzLnNldFBpZWNlcyA9IGFuaW0oYm9hcmQuc2V0UGllY2VzLCB0aGlzLmRhdGEpO1xyXG5cclxuICB0aGlzLnNlbGVjdFNxdWFyZSA9IGFuaW0oYm9hcmQuc2VsZWN0U3F1YXJlLCB0aGlzLmRhdGEsIHRydWUpO1xyXG5cclxuICB0aGlzLmFwaU1vdmUgPSBhbmltKGJvYXJkLmFwaU1vdmUsIHRoaXMuZGF0YSk7XHJcblxyXG4gIHRoaXMuYXBpTmV3UGllY2UgPSBhbmltKGJvYXJkLmFwaU5ld1BpZWNlLCB0aGlzLmRhdGEpO1xyXG5cclxuICB0aGlzLnBsYXlQcmVtb3ZlID0gYW5pbShib2FyZC5wbGF5UHJlbW92ZSwgdGhpcy5kYXRhKTtcclxuXHJcbiAgdGhpcy5wbGF5UHJlZHJvcCA9IGFuaW0oYm9hcmQucGxheVByZWRyb3AsIHRoaXMuZGF0YSk7XHJcblxyXG4gIHRoaXMuY2FuY2VsUHJlbW92ZSA9IGFuaW0oYm9hcmQudW5zZXRQcmVtb3ZlLCB0aGlzLmRhdGEsIHRydWUpO1xyXG5cclxuICB0aGlzLmNhbmNlbFByZWRyb3AgPSBhbmltKGJvYXJkLnVuc2V0UHJlZHJvcCwgdGhpcy5kYXRhLCB0cnVlKTtcclxuXHJcbiAgdGhpcy5zZXRDaGVjayA9IGFuaW0oYm9hcmQuc2V0Q2hlY2ssIHRoaXMuZGF0YSwgdHJ1ZSk7XHJcblxyXG4gIHRoaXMuY2FuY2VsTW92ZSA9IGFuaW0oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgYm9hcmQuY2FuY2VsTW92ZShkYXRhKTtcclxuICAgIGRyYWcuY2FuY2VsKGRhdGEpO1xyXG4gIH0uYmluZCh0aGlzKSwgdGhpcy5kYXRhLCB0cnVlKTtcclxuXHJcbiAgdGhpcy5zdG9wID0gYW5pbShmdW5jdGlvbihkYXRhKSB7XHJcbiAgICBib2FyZC5zdG9wKGRhdGEpO1xyXG4gICAgZHJhZy5jYW5jZWwoZGF0YSk7XHJcbiAgfS5iaW5kKHRoaXMpLCB0aGlzLmRhdGEsIHRydWUpO1xyXG5cclxuICB0aGlzLmV4cGxvZGUgPSBmdW5jdGlvbihrZXlzKSB7XHJcbiAgICBpZiAoIXRoaXMuZGF0YS5yZW5kZXIpIHJldHVybjtcclxuICAgIHRoaXMudm0uZXhwbG9kaW5nID0ge1xyXG4gICAgICBzdGFnZTogMSxcclxuICAgICAga2V5czoga2V5c1xyXG4gICAgfTtcclxuICAgIHRoaXMuZGF0YS5yZW5kZXJSQUYoKTtcclxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgIHRoaXMudm0uZXhwbG9kaW5nLnN0YWdlID0gMjtcclxuICAgICAgdGhpcy5kYXRhLnJlbmRlclJBRigpO1xyXG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHRoaXMudm0uZXhwbG9kaW5nID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5kYXRhLnJlbmRlclJBRigpO1xyXG4gICAgICB9LmJpbmQodGhpcyksIDEyMCk7XHJcbiAgICB9LmJpbmQodGhpcyksIDEyMCk7XHJcbiAgfS5iaW5kKHRoaXMpO1xyXG5cclxuICB0aGlzLnNldEF1dG9TaGFwZXMgPSBmdW5jdGlvbihzaGFwZXMpIHtcclxuICAgIGFuaW0oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICBkYXRhLmRyYXdhYmxlLmF1dG9TaGFwZXMgPSBzaGFwZXM7XHJcbiAgICB9LCB0aGlzLmRhdGEsIGZhbHNlKSgpO1xyXG4gIH0uYmluZCh0aGlzKTtcclxuXHJcbiAgdGhpcy5zZXRTaGFwZXMgPSBmdW5jdGlvbihzaGFwZXMpIHtcclxuICAgIGFuaW0oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICBkYXRhLmRyYXdhYmxlLnNoYXBlcyA9IHNoYXBlcztcclxuICAgIH0sIHRoaXMuZGF0YSwgZmFsc2UpKCk7XHJcbiAgfS5iaW5kKHRoaXMpO1xyXG59O1xyXG4iLCJ2YXIgZmVuID0gcmVxdWlyZSgnLi9mZW4nKTtcclxudmFyIGNvbmZpZ3VyZSA9IHJlcXVpcmUoJy4vY29uZmlndXJlJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNmZykge1xyXG4gIHZhciBkZWZhdWx0cyA9IHtcclxuICAgIHBpZWNlczogZmVuLnJlYWQoZmVuLmluaXRpYWwpLFxyXG4gICAgb3JpZW50YXRpb246ICd3aGl0ZScsIC8vIGJvYXJkIG9yaWVudGF0aW9uLiB3aGl0ZSB8IGJsYWNrXHJcbiAgICB0dXJuQ29sb3I6ICd3aGl0ZScsIC8vIHR1cm4gdG8gcGxheS4gd2hpdGUgfCBibGFja1xyXG4gICAgY2hlY2s6IG51bGwsIC8vIHNxdWFyZSBjdXJyZW50bHkgaW4gY2hlY2sgXCJhMlwiIHwgbnVsbFxyXG4gICAgbGFzdE1vdmU6IG51bGwsIC8vIHNxdWFyZXMgcGFydCBvZiB0aGUgbGFzdCBtb3ZlIFtcImMzXCIsIFwiYzRcIl0gfCBudWxsXHJcbiAgICBzZWxlY3RlZDogbnVsbCwgLy8gc3F1YXJlIGN1cnJlbnRseSBzZWxlY3RlZCBcImExXCIgfCBudWxsXHJcbiAgICBjb29yZGluYXRlczogdHJ1ZSwgLy8gaW5jbHVkZSBjb29yZHMgYXR0cmlidXRlc1xyXG4gICAgcmVuZGVyOiBudWxsLCAvLyBmdW5jdGlvbiB0aGF0IHJlcmVuZGVycyB0aGUgYm9hcmRcclxuICAgIHJlbmRlclJBRjogbnVsbCwgLy8gZnVuY3Rpb24gdGhhdCByZXJlbmRlcnMgdGhlIGJvYXJkIHVzaW5nIHJlcXVlc3RBbmltYXRpb25GcmFtZVxyXG4gICAgZWxlbWVudDogbnVsbCwgLy8gRE9NIGVsZW1lbnQgb2YgdGhlIGJvYXJkLCByZXF1aXJlZCBmb3IgZHJhZyBwaWVjZSBjZW50ZXJpbmdcclxuICAgIGJvdW5kczogbnVsbCwgLy8gZnVuY3Rpb24gdGhhdCBjYWxjdWxhdGVzIHRoZSBib2FyZCBib3VuZHNcclxuICAgIGF1dG9DYXN0bGU6IGZhbHNlLCAvLyBpbW1lZGlhdGVseSBjb21wbGV0ZSB0aGUgY2FzdGxlIGJ5IG1vdmluZyB0aGUgcm9vayBhZnRlciBraW5nIG1vdmVcclxuICAgIHZpZXdPbmx5OiBmYWxzZSwgLy8gZG9uJ3QgYmluZCBldmVudHM6IHRoZSB1c2VyIHdpbGwgbmV2ZXIgYmUgYWJsZSB0byBtb3ZlIHBpZWNlcyBhcm91bmRcclxuICAgIGRpc2FibGVDb250ZXh0TWVudTogZmFsc2UsIC8vIGJlY2F1c2Ugd2hvIG5lZWRzIGEgY29udGV4dCBtZW51IG9uIGEgY2hlc3Nib2FyZFxyXG4gICAgcmVzaXphYmxlOiB0cnVlLCAvLyBsaXN0ZW5zIHRvIGNoZXNzZ3JvdW5kLnJlc2l6ZSBvbiBkb2N1bWVudC5ib2R5IHRvIGNsZWFyIGJvdW5kcyBjYWNoZVxyXG4gICAgcGllY2VLZXk6IGZhbHNlLCAvLyBhZGQgYSBkYXRhLWtleSBhdHRyaWJ1dGUgdG8gcGllY2UgZWxlbWVudHNcclxuICAgIGhpZ2hsaWdodDoge1xyXG4gICAgICBsYXN0TW92ZTogdHJ1ZSwgLy8gYWRkIGxhc3QtbW92ZSBjbGFzcyB0byBzcXVhcmVzXHJcbiAgICAgIGNoZWNrOiB0cnVlLCAvLyBhZGQgY2hlY2sgY2xhc3MgdG8gc3F1YXJlc1xyXG4gICAgICBkcmFnT3ZlcjogdHJ1ZSAvLyBhZGQgZHJhZy1vdmVyIGNsYXNzIHRvIHNxdWFyZSB3aGVuIGRyYWdnaW5nIG92ZXIgaXRcclxuICAgIH0sXHJcbiAgICBhbmltYXRpb246IHtcclxuICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgZHVyYXRpb246IDIwMCxcclxuICAgICAgLyp7IC8vIGN1cnJlbnRcclxuICAgICAgICogIHN0YXJ0OiB0aW1lc3RhbXAsXHJcbiAgICAgICAqICBkdXJhdGlvbjogbXMsXHJcbiAgICAgICAqICBhbmltczoge1xyXG4gICAgICAgKiAgICBhMjogW1xyXG4gICAgICAgKiAgICAgIFstMzAsIDUwXSwgLy8gYW5pbWF0aW9uIGdvYWxcclxuICAgICAgICogICAgICBbLTIwLCAzN10gIC8vIGFuaW1hdGlvbiBjdXJyZW50IHN0YXR1c1xyXG4gICAgICAgKiAgICBdLCAuLi5cclxuICAgICAgICogIH0sXHJcbiAgICAgICAqICBmYWRpbmc6IFtcclxuICAgICAgICogICAge1xyXG4gICAgICAgKiAgICAgIHBvczogWzgwLCAxMjBdLCAvLyBwb3NpdGlvbiByZWxhdGl2ZSB0byB0aGUgYm9hcmRcclxuICAgICAgICogICAgICBvcGFjaXR5OiAwLjM0LFxyXG4gICAgICAgKiAgICAgIHJvbGU6ICdyb29rJyxcclxuICAgICAgICogICAgICBjb2xvcjogJ2JsYWNrJ1xyXG4gICAgICAgKiAgICB9XHJcbiAgICAgICAqICB9XHJcbiAgICAgICAqfSovXHJcbiAgICAgIGN1cnJlbnQ6IHt9XHJcbiAgICB9LFxyXG4gICAgbW92YWJsZToge1xyXG4gICAgICBmcmVlOiB0cnVlLCAvLyBhbGwgbW92ZXMgYXJlIHZhbGlkIC0gYm9hcmQgZWRpdG9yXHJcbiAgICAgIGNvbG9yOiAnYm90aCcsIC8vIGNvbG9yIHRoYXQgY2FuIG1vdmUuIHdoaXRlIHwgYmxhY2sgfCBib3RoIHwgbnVsbFxyXG4gICAgICBkZXN0czoge30sIC8vIHZhbGlkIG1vdmVzLiB7XCJhMlwiIFtcImEzXCIgXCJhNFwiXSBcImIxXCIgW1wiYTNcIiBcImMzXCJdfSB8IG51bGxcclxuICAgICAgZHJvcE9mZjogJ3JldmVydCcsIC8vIHdoZW4gYSBwaWVjZSBpcyBkcm9wcGVkIG91dHNpZGUgdGhlIGJvYXJkLiBcInJldmVydFwiIHwgXCJ0cmFzaFwiXHJcbiAgICAgIGRyb3BwZWQ6IFtdLCAvLyBsYXN0IGRyb3BwZWQgW29yaWcsIGRlc3RdLCBub3QgdG8gYmUgYW5pbWF0ZWRcclxuICAgICAgc2hvd0Rlc3RzOiB0cnVlLCAvLyB3aGV0aGVyIHRvIGFkZCB0aGUgbW92ZS1kZXN0IGNsYXNzIG9uIHNxdWFyZXNcclxuICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgYWZ0ZXI6IGZ1bmN0aW9uKG9yaWcsIGRlc3QsIG1ldGFkYXRhKSB7fSwgLy8gY2FsbGVkIGFmdGVyIHRoZSBtb3ZlIGhhcyBiZWVuIHBsYXllZFxyXG4gICAgICAgIGFmdGVyTmV3UGllY2U6IGZ1bmN0aW9uKHJvbGUsIHBvcykge30gLy8gY2FsbGVkIGFmdGVyIGEgbmV3IHBpZWNlIGlzIGRyb3BwZWQgb24gdGhlIGJvYXJkXHJcbiAgICAgIH0sXHJcbiAgICAgIHJvb2tDYXN0bGU6IHRydWUgLy8gY2FzdGxlIGJ5IG1vdmluZyB0aGUga2luZyB0byB0aGUgcm9va1xyXG4gICAgfSxcclxuICAgIHByZW1vdmFibGU6IHtcclxuICAgICAgZW5hYmxlZDogdHJ1ZSwgLy8gYWxsb3cgcHJlbW92ZXMgZm9yIGNvbG9yIHRoYXQgY2FuIG5vdCBtb3ZlXHJcbiAgICAgIHNob3dEZXN0czogdHJ1ZSwgLy8gd2hldGhlciB0byBhZGQgdGhlIHByZW1vdmUtZGVzdCBjbGFzcyBvbiBzcXVhcmVzXHJcbiAgICAgIGNhc3RsZTogdHJ1ZSwgLy8gd2hldGhlciB0byBhbGxvdyBraW5nIGNhc3RsZSBwcmVtb3Zlc1xyXG4gICAgICBkZXN0czogW10sIC8vIHByZW1vdmUgZGVzdGluYXRpb25zIGZvciB0aGUgY3VycmVudCBzZWxlY3Rpb25cclxuICAgICAgY3VycmVudDogbnVsbCwgLy8ga2V5cyBvZiB0aGUgY3VycmVudCBzYXZlZCBwcmVtb3ZlIFtcImUyXCIgXCJlNFwiXSB8IG51bGxcclxuICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgc2V0OiBmdW5jdGlvbihvcmlnLCBkZXN0KSB7fSwgLy8gY2FsbGVkIGFmdGVyIHRoZSBwcmVtb3ZlIGhhcyBiZWVuIHNldFxyXG4gICAgICAgIHVuc2V0OiBmdW5jdGlvbigpIHt9IC8vIGNhbGxlZCBhZnRlciB0aGUgcHJlbW92ZSBoYXMgYmVlbiB1bnNldFxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgcHJlZHJvcHBhYmxlOiB7XHJcbiAgICAgIGVuYWJsZWQ6IGZhbHNlLCAvLyBhbGxvdyBwcmVkcm9wcyBmb3IgY29sb3IgdGhhdCBjYW4gbm90IG1vdmVcclxuICAgICAgY3VycmVudDoge30sIC8vIGN1cnJlbnQgc2F2ZWQgcHJlZHJvcCB7cm9sZTogJ2tuaWdodCcsIGtleTogJ2U0J30gfCB7fVxyXG4gICAgICBldmVudHM6IHtcclxuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHJvbGUsIGtleSkge30sIC8vIGNhbGxlZCBhZnRlciB0aGUgcHJlZHJvcCBoYXMgYmVlbiBzZXRcclxuICAgICAgICB1bnNldDogZnVuY3Rpb24oKSB7fSAvLyBjYWxsZWQgYWZ0ZXIgdGhlIHByZWRyb3AgaGFzIGJlZW4gdW5zZXRcclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIGRyYWdnYWJsZToge1xyXG4gICAgICBlbmFibGVkOiB0cnVlLCAvLyBhbGxvdyBtb3ZlcyAmIHByZW1vdmVzIHRvIHVzZSBkcmFnJ24gZHJvcFxyXG4gICAgICBkaXN0YW5jZTogMywgLy8gbWluaW11bSBkaXN0YW5jZSB0byBpbml0aWF0ZSBhIGRyYWcsIGluIHBpeGVsc1xyXG4gICAgICBhdXRvRGlzdGFuY2U6IHRydWUsIC8vIGxldHMgY2hlc3Nncm91bmQgc2V0IGRpc3RhbmNlIHRvIHplcm8gd2hlbiB1c2VyIGRyYWdzIHBpZWNlc1xyXG4gICAgICBjZW50ZXJQaWVjZTogdHJ1ZSwgLy8gY2VudGVyIHRoZSBwaWVjZSBvbiBjdXJzb3IgYXQgZHJhZyBzdGFydFxyXG4gICAgICBzaG93R2hvc3Q6IHRydWUsIC8vIHNob3cgZ2hvc3Qgb2YgcGllY2UgYmVpbmcgZHJhZ2dlZFxyXG4gICAgICAvKnsgLy8gY3VycmVudFxyXG4gICAgICAgKiAgb3JpZzogXCJhMlwiLCAvLyBvcmlnIGtleSBvZiBkcmFnZ2luZyBwaWVjZVxyXG4gICAgICAgKiAgcmVsOiBbMTAwLCAxNzBdIC8vIHgsIHkgb2YgdGhlIHBpZWNlIGF0IG9yaWdpbmFsIHBvc2l0aW9uXHJcbiAgICAgICAqICBwb3M6IFsyMCwgLTEyXSAvLyByZWxhdGl2ZSBjdXJyZW50IHBvc2l0aW9uXHJcbiAgICAgICAqICBkZWM6IFs0LCAtOF0gLy8gcGllY2UgY2VudGVyIGRlY2F5XHJcbiAgICAgICAqICBvdmVyOiBcImIzXCIgLy8gc3F1YXJlIGJlaW5nIG1vdXNlZCBvdmVyXHJcbiAgICAgICAqICBib3VuZHM6IGN1cnJlbnQgY2FjaGVkIGJvYXJkIGJvdW5kc1xyXG4gICAgICAgKiAgc3RhcnRlZDogd2hldGhlciB0aGUgZHJhZyBoYXMgc3RhcnRlZCwgYXMgcGVyIHRoZSBkaXN0YW5jZSBzZXR0aW5nXHJcbiAgICAgICAqfSovXHJcbiAgICAgIGN1cnJlbnQ6IHt9XHJcbiAgICB9LFxyXG4gICAgc2VsZWN0YWJsZToge1xyXG4gICAgICAvLyBkaXNhYmxlIHRvIGVuZm9yY2UgZHJhZ2dpbmcgb3ZlciBjbGljay1jbGljayBtb3ZlXHJcbiAgICAgIGVuYWJsZWQ6IHRydWVcclxuICAgIH0sXHJcbiAgICBzdGF0czoge1xyXG4gICAgICAvLyB3YXMgbGFzdCBwaWVjZSBkcmFnZ2VkIG9yIGNsaWNrZWQ/XHJcbiAgICAgIC8vIG5lZWRzIGRlZmF1bHQgdG8gZmFsc2UgZm9yIHRvdWNoXHJcbiAgICAgIGRyYWdnZWQ6ICEoJ29udG91Y2hzdGFydCcgaW4gd2luZG93KVxyXG4gICAgfSxcclxuICAgIGV2ZW50czoge1xyXG4gICAgICBjaGFuZ2U6IGZ1bmN0aW9uKCkge30sIC8vIGNhbGxlZCBhZnRlciB0aGUgc2l0dWF0aW9uIGNoYW5nZXMgb24gdGhlIGJvYXJkXHJcbiAgICAgIC8vIGNhbGxlZCBhZnRlciBhIHBpZWNlIGhhcyBiZWVuIG1vdmVkLlxyXG4gICAgICAvLyBjYXB0dXJlZFBpZWNlIGlzIG51bGwgb3IgbGlrZSB7Y29sb3I6ICd3aGl0ZScsICdyb2xlJzogJ3F1ZWVuJ31cclxuICAgICAgbW92ZTogZnVuY3Rpb24ob3JpZywgZGVzdCwgY2FwdHVyZWRQaWVjZSkge30sXHJcbiAgICAgIGRyb3BOZXdQaWVjZTogZnVuY3Rpb24ocm9sZSwgcG9zKSB7fSxcclxuICAgICAgY2FwdHVyZTogZnVuY3Rpb24oa2V5LCBwaWVjZSkge30sIC8vIERFUFJFQ0FURUQgY2FsbGVkIHdoZW4gYSBwaWVjZSBoYXMgYmVlbiBjYXB0dXJlZFxyXG4gICAgICBzZWxlY3Q6IGZ1bmN0aW9uKGtleSkge30gLy8gY2FsbGVkIHdoZW4gYSBzcXVhcmUgaXMgc2VsZWN0ZWRcclxuICAgIH0sXHJcbiAgICBpdGVtczogbnVsbCwgLy8gaXRlbXMgb24gdGhlIGJvYXJkIHsgcmVuZGVyOiBrZXkgLT4gdmRvbSB9XHJcbiAgICBkcmF3YWJsZToge1xyXG4gICAgICBlbmFibGVkOiBmYWxzZSwgLy8gYWxsb3dzIFNWRyBkcmF3aW5nc1xyXG4gICAgICBlcmFzZU9uQ2xpY2s6IHRydWUsXHJcbiAgICAgIG9uQ2hhbmdlOiBmdW5jdGlvbihzaGFwZXMpIHt9LFxyXG4gICAgICAvLyB1c2VyIHNoYXBlc1xyXG4gICAgICBzaGFwZXM6IFtcclxuICAgICAgICAvLyB7YnJ1c2g6ICdncmVlbicsIG9yaWc6ICdlOCd9LFxyXG4gICAgICAgIC8vIHticnVzaDogJ3llbGxvdycsIG9yaWc6ICdjNCcsIGRlc3Q6ICdmNyd9XHJcbiAgICAgIF0sXHJcbiAgICAgIC8vIGNvbXB1dGVyIHNoYXBlc1xyXG4gICAgICBhdXRvU2hhcGVzOiBbXHJcbiAgICAgICAgLy8ge2JydXNoOiAncGFsZUJsdWUnLCBvcmlnOiAnZTgnfSxcclxuICAgICAgICAvLyB7YnJ1c2g6ICdwYWxlUmVkJywgb3JpZzogJ2M0JywgZGVzdDogJ2Y3J31cclxuICAgICAgXSxcclxuICAgICAgLyp7IC8vIGN1cnJlbnRcclxuICAgICAgICogIG9yaWc6IFwiYTJcIiwgLy8gb3JpZyBrZXkgb2YgZHJhd2luZ1xyXG4gICAgICAgKiAgcG9zOiBbMjAsIC0xMl0gLy8gcmVsYXRpdmUgY3VycmVudCBwb3NpdGlvblxyXG4gICAgICAgKiAgZGVzdDogXCJiM1wiIC8vIHNxdWFyZSBiZWluZyBtb3VzZWQgb3ZlclxyXG4gICAgICAgKiAgYm91bmRzOiAvLyBjdXJyZW50IGNhY2hlZCBib2FyZCBib3VuZHNcclxuICAgICAgICogIGJydXNoOiAnZ3JlZW4nIC8vIGJydXNoIG5hbWUgZm9yIHNoYXBlXHJcbiAgICAgICAqfSovXHJcbiAgICAgIGN1cnJlbnQ6IHt9LFxyXG4gICAgICBicnVzaGVzOiB7XHJcbiAgICAgICAgZ3JlZW46IHtcclxuICAgICAgICAgIGtleTogJ2cnLFxyXG4gICAgICAgICAgY29sb3I6ICcjMTU3ODFCJyxcclxuICAgICAgICAgIG9wYWNpdHk6IDEsXHJcbiAgICAgICAgICBsaW5lV2lkdGg6IDEwXHJcbiAgICAgICAgfSxcclxuICAgICAgICByZWQ6IHtcclxuICAgICAgICAgIGtleTogJ3InLFxyXG4gICAgICAgICAgY29sb3I6ICcjODgyMDIwJyxcclxuICAgICAgICAgIG9wYWNpdHk6IDEsXHJcbiAgICAgICAgICBsaW5lV2lkdGg6IDEwXHJcbiAgICAgICAgfSxcclxuICAgICAgICBibHVlOiB7XHJcbiAgICAgICAgICBrZXk6ICdiJyxcclxuICAgICAgICAgIGNvbG9yOiAnIzAwMzA4OCcsXHJcbiAgICAgICAgICBvcGFjaXR5OiAxLFxyXG4gICAgICAgICAgbGluZVdpZHRoOiAxMFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgeWVsbG93OiB7XHJcbiAgICAgICAgICBrZXk6ICd5JyxcclxuICAgICAgICAgIGNvbG9yOiAnI2U2OGYwMCcsXHJcbiAgICAgICAgICBvcGFjaXR5OiAxLFxyXG4gICAgICAgICAgbGluZVdpZHRoOiAxMFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcGFsZUJsdWU6IHtcclxuICAgICAgICAgIGtleTogJ3BiJyxcclxuICAgICAgICAgIGNvbG9yOiAnIzAwMzA4OCcsXHJcbiAgICAgICAgICBvcGFjaXR5OiAwLjQsXHJcbiAgICAgICAgICBsaW5lV2lkdGg6IDE1XHJcbiAgICAgICAgfSxcclxuICAgICAgICBwYWxlR3JlZW46IHtcclxuICAgICAgICAgIGtleTogJ3BnJyxcclxuICAgICAgICAgIGNvbG9yOiAnIzE1NzgxQicsXHJcbiAgICAgICAgICBvcGFjaXR5OiAwLjQsXHJcbiAgICAgICAgICBsaW5lV2lkdGg6IDE1XHJcbiAgICAgICAgfSxcclxuICAgICAgICBwYWxlUmVkOiB7XHJcbiAgICAgICAgICBrZXk6ICdwcicsXHJcbiAgICAgICAgICBjb2xvcjogJyM4ODIwMjAnLFxyXG4gICAgICAgICAgb3BhY2l0eTogMC40LFxyXG4gICAgICAgICAgbGluZVdpZHRoOiAxNVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcGFsZUdyZXk6IHtcclxuICAgICAgICAgIGtleTogJ3BncicsXHJcbiAgICAgICAgICBjb2xvcjogJyM0YTRhNGEnLFxyXG4gICAgICAgICAgb3BhY2l0eTogMC4zNSxcclxuICAgICAgICAgIGxpbmVXaWR0aDogMTVcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIC8vIGRyYXdhYmxlIFNWRyBwaWVjZXMsIHVzZWQgZm9yIGNyYXp5aG91c2UgZHJvcFxyXG4gICAgICBwaWVjZXM6IHtcclxuICAgICAgICBiYXNlVXJsOiAnaHR0cHM6Ly9saWNoZXNzMS5vcmcvYXNzZXRzL3BpZWNlL2NidXJuZXR0LydcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGNvbmZpZ3VyZShkZWZhdWx0cywgY2ZnIHx8IHt9KTtcclxuXHJcbiAgcmV0dXJuIGRlZmF1bHRzO1xyXG59O1xyXG4iLCJ2YXIgYm9hcmQgPSByZXF1aXJlKCcuL2JvYXJkJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XHJcbnZhciBkcmF3ID0gcmVxdWlyZSgnLi9kcmF3Jyk7XHJcblxyXG52YXIgb3JpZ2luVGFyZ2V0O1xyXG5cclxuZnVuY3Rpb24gaGFzaFBpZWNlKHBpZWNlKSB7XHJcbiAgcmV0dXJuIHBpZWNlID8gcGllY2UuY29sb3IgKyBwaWVjZS5yb2xlIDogJyc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbXB1dGVTcXVhcmVCb3VuZHMoZGF0YSwgYm91bmRzLCBrZXkpIHtcclxuICB2YXIgcG9zID0gdXRpbC5rZXkycG9zKGtleSk7XHJcbiAgaWYgKGRhdGEub3JpZW50YXRpb24gIT09ICd3aGl0ZScpIHtcclxuICAgIHBvc1swXSA9IDkgLSBwb3NbMF07XHJcbiAgICBwb3NbMV0gPSA5IC0gcG9zWzFdO1xyXG4gIH1cclxuICByZXR1cm4ge1xyXG4gICAgbGVmdDogYm91bmRzLmxlZnQgKyBib3VuZHMud2lkdGggKiAocG9zWzBdIC0gMSkgLyA4LFxyXG4gICAgdG9wOiBib3VuZHMudG9wICsgYm91bmRzLmhlaWdodCAqICg4IC0gcG9zWzFdKSAvIDgsXHJcbiAgICB3aWR0aDogYm91bmRzLndpZHRoIC8gOCxcclxuICAgIGhlaWdodDogYm91bmRzLmhlaWdodCAvIDhcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdGFydChkYXRhLCBlKSB7XHJcbiAgaWYgKGUuYnV0dG9uICE9PSB1bmRlZmluZWQgJiYgZS5idXR0b24gIT09IDApIHJldHVybjsgLy8gb25seSB0b3VjaCBvciBsZWZ0IGNsaWNrXHJcbiAgaWYgKGUudG91Y2hlcyAmJiBlLnRvdWNoZXMubGVuZ3RoID4gMSkgcmV0dXJuOyAvLyBzdXBwb3J0IG9uZSBmaW5nZXIgdG91Y2ggb25seVxyXG4gIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gIG9yaWdpblRhcmdldCA9IGUudGFyZ2V0O1xyXG4gIHZhciBwcmV2aW91c2x5U2VsZWN0ZWQgPSBkYXRhLnNlbGVjdGVkO1xyXG4gIHZhciBwb3NpdGlvbiA9IHV0aWwuZXZlbnRQb3NpdGlvbihlKTtcclxuICB2YXIgYm91bmRzID0gZGF0YS5ib3VuZHMoKTtcclxuICB2YXIgb3JpZyA9IGJvYXJkLmdldEtleUF0RG9tUG9zKGRhdGEsIHBvc2l0aW9uLCBib3VuZHMpO1xyXG4gIHZhciBwaWVjZSA9IGRhdGEucGllY2VzW29yaWddO1xyXG4gIGlmICghcHJldmlvdXNseVNlbGVjdGVkICYmIChcclxuICAgIGRhdGEuZHJhd2FibGUuZXJhc2VPbkNsaWNrIHx8XHJcbiAgICAoIXBpZWNlIHx8IHBpZWNlLmNvbG9yICE9PSBkYXRhLnR1cm5Db2xvcilcclxuICApKSBkcmF3LmNsZWFyKGRhdGEpO1xyXG4gIGlmIChkYXRhLnZpZXdPbmx5KSByZXR1cm47XHJcbiAgdmFyIGhhZFByZW1vdmUgPSAhIWRhdGEucHJlbW92YWJsZS5jdXJyZW50O1xyXG4gIHZhciBoYWRQcmVkcm9wID0gISFkYXRhLnByZWRyb3BwYWJsZS5jdXJyZW50LmtleTtcclxuICBib2FyZC5zZWxlY3RTcXVhcmUoZGF0YSwgb3JpZyk7XHJcbiAgdmFyIHN0aWxsU2VsZWN0ZWQgPSBkYXRhLnNlbGVjdGVkID09PSBvcmlnO1xyXG4gIGlmIChwaWVjZSAmJiBzdGlsbFNlbGVjdGVkICYmIGJvYXJkLmlzRHJhZ2dhYmxlKGRhdGEsIG9yaWcpKSB7XHJcbiAgICB2YXIgc3F1YXJlQm91bmRzID0gY29tcHV0ZVNxdWFyZUJvdW5kcyhkYXRhLCBib3VuZHMsIG9yaWcpO1xyXG4gICAgZGF0YS5kcmFnZ2FibGUuY3VycmVudCA9IHtcclxuICAgICAgcHJldmlvdXNseVNlbGVjdGVkOiBwcmV2aW91c2x5U2VsZWN0ZWQsXHJcbiAgICAgIG9yaWc6IG9yaWcsXHJcbiAgICAgIHBpZWNlOiBoYXNoUGllY2UocGllY2UpLFxyXG4gICAgICByZWw6IHBvc2l0aW9uLFxyXG4gICAgICBlcG9zOiBwb3NpdGlvbixcclxuICAgICAgcG9zOiBbMCwgMF0sXHJcbiAgICAgIGRlYzogZGF0YS5kcmFnZ2FibGUuY2VudGVyUGllY2UgPyBbXHJcbiAgICAgICAgcG9zaXRpb25bMF0gLSAoc3F1YXJlQm91bmRzLmxlZnQgKyBzcXVhcmVCb3VuZHMud2lkdGggLyAyKSxcclxuICAgICAgICBwb3NpdGlvblsxXSAtIChzcXVhcmVCb3VuZHMudG9wICsgc3F1YXJlQm91bmRzLmhlaWdodCAvIDIpXHJcbiAgICAgIF0gOiBbMCwgMF0sXHJcbiAgICAgIGJvdW5kczogYm91bmRzLFxyXG4gICAgICBzdGFydGVkOiBkYXRhLmRyYWdnYWJsZS5hdXRvRGlzdGFuY2UgJiYgZGF0YS5zdGF0cy5kcmFnZ2VkXHJcbiAgICB9O1xyXG4gIH0gZWxzZSB7XHJcbiAgICBpZiAoaGFkUHJlbW92ZSkgYm9hcmQudW5zZXRQcmVtb3ZlKGRhdGEpO1xyXG4gICAgaWYgKGhhZFByZWRyb3ApIGJvYXJkLnVuc2V0UHJlZHJvcChkYXRhKTtcclxuICB9XHJcbiAgcHJvY2Vzc0RyYWcoZGF0YSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByb2Nlc3NEcmFnKGRhdGEpIHtcclxuICB1dGlsLnJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbigpIHtcclxuICAgIHZhciBjdXIgPSBkYXRhLmRyYWdnYWJsZS5jdXJyZW50O1xyXG4gICAgaWYgKGN1ci5vcmlnKSB7XHJcbiAgICAgIC8vIGNhbmNlbCBhbmltYXRpb25zIHdoaWxlIGRyYWdnaW5nXHJcbiAgICAgIGlmIChkYXRhLmFuaW1hdGlvbi5jdXJyZW50LnN0YXJ0ICYmIGRhdGEuYW5pbWF0aW9uLmN1cnJlbnQuYW5pbXNbY3VyLm9yaWddKVxyXG4gICAgICAgIGRhdGEuYW5pbWF0aW9uLmN1cnJlbnQgPSB7fTtcclxuICAgICAgLy8gaWYgbW92aW5nIHBpZWNlIGlzIGdvbmUsIGNhbmNlbFxyXG4gICAgICBpZiAoaGFzaFBpZWNlKGRhdGEucGllY2VzW2N1ci5vcmlnXSkgIT09IGN1ci5waWVjZSkgY2FuY2VsKGRhdGEpO1xyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBpZiAoIWN1ci5zdGFydGVkICYmIHV0aWwuZGlzdGFuY2UoY3VyLmVwb3MsIGN1ci5yZWwpID49IGRhdGEuZHJhZ2dhYmxlLmRpc3RhbmNlKVxyXG4gICAgICAgICAgY3VyLnN0YXJ0ZWQgPSB0cnVlO1xyXG4gICAgICAgIGlmIChjdXIuc3RhcnRlZCkge1xyXG4gICAgICAgICAgY3VyLnBvcyA9IFtcclxuICAgICAgICAgICAgY3VyLmVwb3NbMF0gLSBjdXIucmVsWzBdLFxyXG4gICAgICAgICAgICBjdXIuZXBvc1sxXSAtIGN1ci5yZWxbMV1cclxuICAgICAgICAgIF07XHJcbiAgICAgICAgICBjdXIub3ZlciA9IGJvYXJkLmdldEtleUF0RG9tUG9zKGRhdGEsIGN1ci5lcG9zLCBjdXIuYm91bmRzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGRhdGEucmVuZGVyKCk7XHJcbiAgICBpZiAoY3VyLm9yaWcpIHByb2Nlc3NEcmFnKGRhdGEpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBtb3ZlKGRhdGEsIGUpIHtcclxuICBpZiAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPiAxKSByZXR1cm47IC8vIHN1cHBvcnQgb25lIGZpbmdlciB0b3VjaCBvbmx5XHJcbiAgaWYgKGRhdGEuZHJhZ2dhYmxlLmN1cnJlbnQub3JpZylcclxuICAgIGRhdGEuZHJhZ2dhYmxlLmN1cnJlbnQuZXBvcyA9IHV0aWwuZXZlbnRQb3NpdGlvbihlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZW5kKGRhdGEsIGUpIHtcclxuICB2YXIgY3VyID0gZGF0YS5kcmFnZ2FibGUuY3VycmVudDtcclxuICB2YXIgb3JpZyA9IGN1ciA/IGN1ci5vcmlnIDogbnVsbDtcclxuICBpZiAoIW9yaWcpIHJldHVybjtcclxuICAvLyBjb21wYXJpbmcgd2l0aCB0aGUgb3JpZ2luIHRhcmdldCBpcyBhbiBlYXN5IHdheSB0byB0ZXN0IHRoYXQgdGhlIGVuZCBldmVudFxyXG4gIC8vIGhhcyB0aGUgc2FtZSB0b3VjaCBvcmlnaW5cclxuICBpZiAoZS50eXBlID09PSBcInRvdWNoZW5kXCIgJiYgb3JpZ2luVGFyZ2V0ICE9PSBlLnRhcmdldCAmJiAhY3VyLm5ld1BpZWNlKSB7XHJcbiAgICBkYXRhLmRyYWdnYWJsZS5jdXJyZW50ID0ge307XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIGJvYXJkLnVuc2V0UHJlbW92ZShkYXRhKTtcclxuICBib2FyZC51bnNldFByZWRyb3AoZGF0YSk7XHJcbiAgdmFyIGV2ZW50UG9zID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpXHJcbiAgdmFyIGRlc3QgPSBldmVudFBvcyA/IGJvYXJkLmdldEtleUF0RG9tUG9zKGRhdGEsIGV2ZW50UG9zLCBjdXIuYm91bmRzKSA6IGN1ci5vdmVyO1xyXG4gIGlmIChjdXIuc3RhcnRlZCkge1xyXG4gICAgaWYgKGN1ci5uZXdQaWVjZSkgYm9hcmQuZHJvcE5ld1BpZWNlKGRhdGEsIG9yaWcsIGRlc3QpO1xyXG4gICAgZWxzZSB7XHJcbiAgICAgIGlmIChvcmlnICE9PSBkZXN0KSBkYXRhLm1vdmFibGUuZHJvcHBlZCA9IFtvcmlnLCBkZXN0XTtcclxuICAgICAgaWYgKGJvYXJkLnVzZXJNb3ZlKGRhdGEsIG9yaWcsIGRlc3QpKSBkYXRhLnN0YXRzLmRyYWdnZWQgPSB0cnVlO1xyXG4gICAgfVxyXG4gIH1cclxuICBpZiAob3JpZyA9PT0gY3VyLnByZXZpb3VzbHlTZWxlY3RlZCAmJiAob3JpZyA9PT0gZGVzdCB8fCAhZGVzdCkpXHJcbiAgICBib2FyZC5zZXRTZWxlY3RlZChkYXRhLCBudWxsKTtcclxuICBlbHNlIGlmICghZGF0YS5zZWxlY3RhYmxlLmVuYWJsZWQpIGJvYXJkLnNldFNlbGVjdGVkKGRhdGEsIG51bGwpO1xyXG4gIGRhdGEuZHJhZ2dhYmxlLmN1cnJlbnQgPSB7fTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FuY2VsKGRhdGEpIHtcclxuICBpZiAoZGF0YS5kcmFnZ2FibGUuY3VycmVudC5vcmlnKSB7XHJcbiAgICBkYXRhLmRyYWdnYWJsZS5jdXJyZW50ID0ge307XHJcbiAgICBib2FyZC5zZWxlY3RTcXVhcmUoZGF0YSwgbnVsbCk7XHJcbiAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICBzdGFydDogc3RhcnQsXHJcbiAgbW92ZTogbW92ZSxcclxuICBlbmQ6IGVuZCxcclxuICBjYW5jZWw6IGNhbmNlbCxcclxuICBwcm9jZXNzRHJhZzogcHJvY2Vzc0RyYWcgLy8gbXVzdCBiZSBleHBvc2VkIGZvciBib2FyZCBlZGl0b3JzXHJcbn07XHJcbiIsInZhciBib2FyZCA9IHJlcXVpcmUoJy4vYm9hcmQnKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcclxuXHJcbnZhciBicnVzaGVzID0gWydncmVlbicsICdyZWQnLCAnYmx1ZScsICd5ZWxsb3cnXTtcclxuXHJcbmZ1bmN0aW9uIGhhc2hQaWVjZShwaWVjZSkge1xyXG4gIHJldHVybiBwaWVjZSA/IHBpZWNlLmNvbG9yICsgJyAnICsgcGllY2Uucm9sZSA6ICcnO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdGFydChkYXRhLCBlKSB7XHJcbiAgaWYgKGUudG91Y2hlcyAmJiBlLnRvdWNoZXMubGVuZ3RoID4gMSkgcmV0dXJuOyAvLyBzdXBwb3J0IG9uZSBmaW5nZXIgdG91Y2ggb25seVxyXG4gIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gIGJvYXJkLmNhbmNlbE1vdmUoZGF0YSk7XHJcbiAgdmFyIHBvc2l0aW9uID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpO1xyXG4gIHZhciBib3VuZHMgPSBkYXRhLmJvdW5kcygpO1xyXG4gIHZhciBvcmlnID0gYm9hcmQuZ2V0S2V5QXREb21Qb3MoZGF0YSwgcG9zaXRpb24sIGJvdW5kcyk7XHJcbiAgZGF0YS5kcmF3YWJsZS5jdXJyZW50ID0ge1xyXG4gICAgb3JpZzogb3JpZyxcclxuICAgIGVwb3M6IHBvc2l0aW9uLFxyXG4gICAgYm91bmRzOiBib3VuZHMsXHJcbiAgICBicnVzaDogYnJ1c2hlc1soZS5zaGlmdEtleSAmIHV0aWwuaXNSaWdodEJ1dHRvbihlKSkgKyAoZS5hbHRLZXkgPyAyIDogMCldXHJcbiAgfTtcclxuICBwcm9jZXNzRHJhdyhkYXRhKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcHJvY2Vzc0RyYXcoZGF0YSkge1xyXG4gIHV0aWwucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGN1ciA9IGRhdGEuZHJhd2FibGUuY3VycmVudDtcclxuICAgIGlmIChjdXIub3JpZykge1xyXG4gICAgICB2YXIgZGVzdCA9IGJvYXJkLmdldEtleUF0RG9tUG9zKGRhdGEsIGN1ci5lcG9zLCBjdXIuYm91bmRzKTtcclxuICAgICAgaWYgKGN1ci5vcmlnID09PSBkZXN0KSBjdXIuZGVzdCA9IHVuZGVmaW5lZDtcclxuICAgICAgZWxzZSBjdXIuZGVzdCA9IGRlc3Q7XHJcbiAgICB9XHJcbiAgICBkYXRhLnJlbmRlcigpO1xyXG4gICAgaWYgKGN1ci5vcmlnKSBwcm9jZXNzRHJhdyhkYXRhKTtcclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gbW92ZShkYXRhLCBlKSB7XHJcbiAgaWYgKGRhdGEuZHJhd2FibGUuY3VycmVudC5vcmlnKVxyXG4gICAgZGF0YS5kcmF3YWJsZS5jdXJyZW50LmVwb3MgPSB1dGlsLmV2ZW50UG9zaXRpb24oZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGVuZChkYXRhLCBlKSB7XHJcbiAgdmFyIGRyYXdhYmxlID0gZGF0YS5kcmF3YWJsZTtcclxuICB2YXIgb3JpZyA9IGRyYXdhYmxlLmN1cnJlbnQub3JpZztcclxuICB2YXIgZGVzdCA9IGRyYXdhYmxlLmN1cnJlbnQuZGVzdDtcclxuICBpZiAob3JpZyAmJiBkZXN0KSBhZGRMaW5lKGRyYXdhYmxlLCBvcmlnLCBkZXN0KTtcclxuICBlbHNlIGlmIChvcmlnKSBhZGRDaXJjbGUoZHJhd2FibGUsIG9yaWcpO1xyXG4gIGRyYXdhYmxlLmN1cnJlbnQgPSB7fTtcclxuICBkYXRhLnJlbmRlcigpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5jZWwoZGF0YSkge1xyXG4gIGlmIChkYXRhLmRyYXdhYmxlLmN1cnJlbnQub3JpZykgZGF0YS5kcmF3YWJsZS5jdXJyZW50ID0ge307XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFyKGRhdGEpIHtcclxuICBpZiAoZGF0YS5kcmF3YWJsZS5zaGFwZXMubGVuZ3RoKSB7XHJcbiAgICBkYXRhLmRyYXdhYmxlLnNoYXBlcyA9IFtdO1xyXG4gICAgZGF0YS5yZW5kZXIoKTtcclxuICAgIG9uQ2hhbmdlKGRhdGEuZHJhd2FibGUpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbm90KGYpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oeCkge1xyXG4gICAgcmV0dXJuICFmKHgpO1xyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZENpcmNsZShkcmF3YWJsZSwga2V5KSB7XHJcbiAgdmFyIGJydXNoID0gZHJhd2FibGUuY3VycmVudC5icnVzaDtcclxuICB2YXIgc2FtZUNpcmNsZSA9IGZ1bmN0aW9uKHMpIHtcclxuICAgIHJldHVybiBzLm9yaWcgPT09IGtleSAmJiAhcy5kZXN0O1xyXG4gIH07XHJcbiAgdmFyIHNpbWlsYXIgPSBkcmF3YWJsZS5zaGFwZXMuZmlsdGVyKHNhbWVDaXJjbGUpWzBdO1xyXG4gIGlmIChzaW1pbGFyKSBkcmF3YWJsZS5zaGFwZXMgPSBkcmF3YWJsZS5zaGFwZXMuZmlsdGVyKG5vdChzYW1lQ2lyY2xlKSk7XHJcbiAgaWYgKCFzaW1pbGFyIHx8IHNpbWlsYXIuYnJ1c2ggIT09IGJydXNoKSBkcmF3YWJsZS5zaGFwZXMucHVzaCh7XHJcbiAgICBicnVzaDogYnJ1c2gsXHJcbiAgICBvcmlnOiBrZXlcclxuICB9KTtcclxuICBvbkNoYW5nZShkcmF3YWJsZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZExpbmUoZHJhd2FibGUsIG9yaWcsIGRlc3QpIHtcclxuICB2YXIgYnJ1c2ggPSBkcmF3YWJsZS5jdXJyZW50LmJydXNoO1xyXG4gIHZhciBzYW1lTGluZSA9IGZ1bmN0aW9uKHMpIHtcclxuICAgIHJldHVybiBzLm9yaWcgJiYgcy5kZXN0ICYmIChcclxuICAgICAgKHMub3JpZyA9PT0gb3JpZyAmJiBzLmRlc3QgPT09IGRlc3QpIHx8XHJcbiAgICAgIChzLmRlc3QgPT09IG9yaWcgJiYgcy5vcmlnID09PSBkZXN0KVxyXG4gICAgKTtcclxuICB9O1xyXG4gIHZhciBleGlzdHMgPSBkcmF3YWJsZS5zaGFwZXMuZmlsdGVyKHNhbWVMaW5lKS5sZW5ndGggPiAwO1xyXG4gIGlmIChleGlzdHMpIGRyYXdhYmxlLnNoYXBlcyA9IGRyYXdhYmxlLnNoYXBlcy5maWx0ZXIobm90KHNhbWVMaW5lKSk7XHJcbiAgZWxzZSBkcmF3YWJsZS5zaGFwZXMucHVzaCh7XHJcbiAgICBicnVzaDogYnJ1c2gsXHJcbiAgICBvcmlnOiBvcmlnLFxyXG4gICAgZGVzdDogZGVzdFxyXG4gIH0pO1xyXG4gIG9uQ2hhbmdlKGRyYXdhYmxlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gb25DaGFuZ2UoZHJhd2FibGUpIHtcclxuICBkcmF3YWJsZS5vbkNoYW5nZShkcmF3YWJsZS5zaGFwZXMpO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICBzdGFydDogc3RhcnQsXHJcbiAgbW92ZTogbW92ZSxcclxuICBlbmQ6IGVuZCxcclxuICBjYW5jZWw6IGNhbmNlbCxcclxuICBjbGVhcjogY2xlYXIsXHJcbiAgcHJvY2Vzc0RyYXc6IHByb2Nlc3NEcmF3XHJcbn07XHJcbiIsInZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XHJcblxyXG52YXIgaW5pdGlhbCA9ICdybmJxa2Juci9wcHBwcHBwcC84LzgvOC84L1BQUFBQUFBQL1JOQlFLQk5SJztcclxuXHJcbnZhciByb2xlcyA9IHtcclxuICBwOiBcInBhd25cIixcclxuICByOiBcInJvb2tcIixcclxuICBuOiBcImtuaWdodFwiLFxyXG4gIGI6IFwiYmlzaG9wXCIsXHJcbiAgcTogXCJxdWVlblwiLFxyXG4gIGs6IFwia2luZ1wiXHJcbn07XHJcblxyXG52YXIgbGV0dGVycyA9IHtcclxuICBwYXduOiBcInBcIixcclxuICByb29rOiBcInJcIixcclxuICBrbmlnaHQ6IFwiblwiLFxyXG4gIGJpc2hvcDogXCJiXCIsXHJcbiAgcXVlZW46IFwicVwiLFxyXG4gIGtpbmc6IFwia1wiXHJcbn07XHJcblxyXG5mdW5jdGlvbiByZWFkKGZlbikge1xyXG4gIGlmIChmZW4gPT09ICdzdGFydCcpIGZlbiA9IGluaXRpYWw7XHJcbiAgdmFyIHBpZWNlcyA9IHt9O1xyXG4gIGZlbi5yZXBsYWNlKC8gLiskLywgJycpLnJlcGxhY2UoL34vZywgJycpLnNwbGl0KCcvJykuZm9yRWFjaChmdW5jdGlvbihyb3csIHkpIHtcclxuICAgIHZhciB4ID0gMDtcclxuICAgIHJvdy5zcGxpdCgnJykuZm9yRWFjaChmdW5jdGlvbih2KSB7XHJcbiAgICAgIHZhciBuYiA9IHBhcnNlSW50KHYpO1xyXG4gICAgICBpZiAobmIpIHggKz0gbmI7XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHgrKztcclxuICAgICAgICBwaWVjZXNbdXRpbC5wb3Mya2V5KFt4LCA4IC0geV0pXSA9IHtcclxuICAgICAgICAgIHJvbGU6IHJvbGVzW3YudG9Mb3dlckNhc2UoKV0sXHJcbiAgICAgICAgICBjb2xvcjogdiA9PT0gdi50b0xvd2VyQ2FzZSgpID8gJ2JsYWNrJyA6ICd3aGl0ZSdcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIHBpZWNlcztcclxufVxyXG5cclxuZnVuY3Rpb24gd3JpdGUocGllY2VzKSB7XHJcbiAgcmV0dXJuIFs4LCA3LCA2LCA1LCA0LCAzLCAyXS5yZWR1Y2UoXHJcbiAgICBmdW5jdGlvbihzdHIsIG5iKSB7XHJcbiAgICAgIHJldHVybiBzdHIucmVwbGFjZShuZXcgUmVnRXhwKEFycmF5KG5iICsgMSkuam9pbignMScpLCAnZycpLCBuYik7XHJcbiAgICB9LFxyXG4gICAgdXRpbC5pbnZSYW5rcy5tYXAoZnVuY3Rpb24oeSkge1xyXG4gICAgICByZXR1cm4gdXRpbC5yYW5rcy5tYXAoZnVuY3Rpb24oeCkge1xyXG4gICAgICAgIHZhciBwaWVjZSA9IHBpZWNlc1t1dGlsLnBvczJrZXkoW3gsIHldKV07XHJcbiAgICAgICAgaWYgKHBpZWNlKSB7XHJcbiAgICAgICAgICB2YXIgbGV0dGVyID0gbGV0dGVyc1twaWVjZS5yb2xlXTtcclxuICAgICAgICAgIHJldHVybiBwaWVjZS5jb2xvciA9PT0gJ3doaXRlJyA/IGxldHRlci50b1VwcGVyQ2FzZSgpIDogbGV0dGVyO1xyXG4gICAgICAgIH0gZWxzZSByZXR1cm4gJzEnO1xyXG4gICAgICB9KS5qb2luKCcnKTtcclxuICAgIH0pLmpvaW4oJy8nKSk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIGluaXRpYWw6IGluaXRpYWwsXHJcbiAgcmVhZDogcmVhZCxcclxuICB3cml0ZTogd3JpdGVcclxufTtcclxuIiwidmFyIHN0YXJ0QXQ7XHJcblxyXG52YXIgc3RhcnQgPSBmdW5jdGlvbigpIHtcclxuICBzdGFydEF0ID0gbmV3IERhdGUoKTtcclxufTtcclxuXHJcbnZhciBjYW5jZWwgPSBmdW5jdGlvbigpIHtcclxuICBzdGFydEF0ID0gbnVsbDtcclxufTtcclxuXHJcbnZhciBzdG9wID0gZnVuY3Rpb24oKSB7XHJcbiAgaWYgKCFzdGFydEF0KSByZXR1cm4gMDtcclxuICB2YXIgdGltZSA9IG5ldyBEYXRlKCkgLSBzdGFydEF0O1xyXG4gIHN0YXJ0QXQgPSBudWxsO1xyXG4gIHJldHVybiB0aW1lO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgc3RhcnQ6IHN0YXJ0LFxyXG4gIGNhbmNlbDogY2FuY2VsLFxyXG4gIHN0b3A6IHN0b3BcclxufTtcclxuIiwidmFyIG0gPSByZXF1aXJlKCdtaXRocmlsJyk7XHJcbnZhciBjdHJsID0gcmVxdWlyZSgnLi9jdHJsJyk7XHJcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi92aWV3Jyk7XHJcbnZhciBhcGkgPSByZXF1aXJlKCcuL2FwaScpO1xyXG5cclxuLy8gZm9yIHVzYWdlIG91dHNpZGUgb2YgbWl0aHJpbFxyXG5mdW5jdGlvbiBpbml0KGVsZW1lbnQsIGNvbmZpZykge1xyXG5cclxuICB2YXIgY29udHJvbGxlciA9IG5ldyBjdHJsKGNvbmZpZyk7XHJcblxyXG4gIG0ucmVuZGVyKGVsZW1lbnQsIHZpZXcoY29udHJvbGxlcikpO1xyXG5cclxuICByZXR1cm4gYXBpKGNvbnRyb2xsZXIpO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGluaXQ7XHJcbm1vZHVsZS5leHBvcnRzLmNvbnRyb2xsZXIgPSBjdHJsO1xyXG5tb2R1bGUuZXhwb3J0cy52aWV3ID0gdmlldztcclxubW9kdWxlLmV4cG9ydHMuZmVuID0gcmVxdWlyZSgnLi9mZW4nKTtcclxubW9kdWxlLmV4cG9ydHMudXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xyXG5tb2R1bGUuZXhwb3J0cy5jb25maWd1cmUgPSByZXF1aXJlKCcuL2NvbmZpZ3VyZScpO1xyXG5tb2R1bGUuZXhwb3J0cy5hbmltID0gcmVxdWlyZSgnLi9hbmltJyk7XHJcbm1vZHVsZS5leHBvcnRzLmJvYXJkID0gcmVxdWlyZSgnLi9ib2FyZCcpO1xyXG5tb2R1bGUuZXhwb3J0cy5kcmFnID0gcmVxdWlyZSgnLi9kcmFnJyk7XHJcbiIsInZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XHJcblxyXG5mdW5jdGlvbiBkaWZmKGEsIGIpIHtcclxuICByZXR1cm4gTWF0aC5hYnMoYSAtIGIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXduKGNvbG9yLCB4MSwgeTEsIHgyLCB5Mikge1xyXG4gIHJldHVybiBkaWZmKHgxLCB4MikgPCAyICYmIChcclxuICAgIGNvbG9yID09PSAnd2hpdGUnID8gKFxyXG4gICAgICAvLyBhbGxvdyAyIHNxdWFyZXMgZnJvbSAxIGFuZCA4LCBmb3IgaG9yZGVcclxuICAgICAgeTIgPT09IHkxICsgMSB8fCAoeTEgPD0gMiAmJiB5MiA9PT0gKHkxICsgMikgJiYgeDEgPT09IHgyKVxyXG4gICAgKSA6IChcclxuICAgICAgeTIgPT09IHkxIC0gMSB8fCAoeTEgPj0gNyAmJiB5MiA9PT0gKHkxIC0gMikgJiYgeDEgPT09IHgyKVxyXG4gICAgKVxyXG4gICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGtuaWdodCh4MSwgeTEsIHgyLCB5Mikge1xyXG4gIHZhciB4ZCA9IGRpZmYoeDEsIHgyKTtcclxuICB2YXIgeWQgPSBkaWZmKHkxLCB5Mik7XHJcbiAgcmV0dXJuICh4ZCA9PT0gMSAmJiB5ZCA9PT0gMikgfHwgKHhkID09PSAyICYmIHlkID09PSAxKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYmlzaG9wKHgxLCB5MSwgeDIsIHkyKSB7XHJcbiAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByb29rKHgxLCB5MSwgeDIsIHkyKSB7XHJcbiAgcmV0dXJuIHgxID09PSB4MiB8fCB5MSA9PT0geTI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHF1ZWVuKHgxLCB5MSwgeDIsIHkyKSB7XHJcbiAgcmV0dXJuIGJpc2hvcCh4MSwgeTEsIHgyLCB5MikgfHwgcm9vayh4MSwgeTEsIHgyLCB5Mik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGtpbmcoY29sb3IsIHJvb2tGaWxlcywgY2FuQ2FzdGxlLCB4MSwgeTEsIHgyLCB5Mikge1xyXG4gIHJldHVybiAoXHJcbiAgICBkaWZmKHgxLCB4MikgPCAyICYmIGRpZmYoeTEsIHkyKSA8IDJcclxuICApIHx8IChcclxuICAgIGNhbkNhc3RsZSAmJiB5MSA9PT0geTIgJiYgeTEgPT09IChjb2xvciA9PT0gJ3doaXRlJyA/IDEgOiA4KSAmJiAoXHJcbiAgICAgICh4MSA9PT0gNSAmJiAoeDIgPT09IDMgfHwgeDIgPT09IDcpKSB8fCB1dGlsLmNvbnRhaW5zWChyb29rRmlsZXMsIHgyKVxyXG4gICAgKVxyXG4gICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJvb2tGaWxlc09mKHBpZWNlcywgY29sb3IpIHtcclxuICByZXR1cm4gT2JqZWN0LmtleXMocGllY2VzKS5maWx0ZXIoZnVuY3Rpb24oa2V5KSB7XHJcbiAgICB2YXIgcGllY2UgPSBwaWVjZXNba2V5XTtcclxuICAgIHJldHVybiBwaWVjZSAmJiBwaWVjZS5jb2xvciA9PT0gY29sb3IgJiYgcGllY2Uucm9sZSA9PT0gJ3Jvb2snO1xyXG4gIH0pLm1hcChmdW5jdGlvbihrZXkpIHtcclxuICAgIHJldHVybiB1dGlsLmtleTJwb3Moa2V5KVswXTtcclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gY29tcHV0ZShwaWVjZXMsIGtleSwgY2FuQ2FzdGxlKSB7XHJcbiAgdmFyIHBpZWNlID0gcGllY2VzW2tleV07XHJcbiAgdmFyIHBvcyA9IHV0aWwua2V5MnBvcyhrZXkpO1xyXG4gIHZhciBtb2JpbGl0eTtcclxuICBzd2l0Y2ggKHBpZWNlLnJvbGUpIHtcclxuICAgIGNhc2UgJ3Bhd24nOlxyXG4gICAgICBtb2JpbGl0eSA9IHBhd24uYmluZChudWxsLCBwaWVjZS5jb2xvcik7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSAna25pZ2h0JzpcclxuICAgICAgbW9iaWxpdHkgPSBrbmlnaHQ7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSAnYmlzaG9wJzpcclxuICAgICAgbW9iaWxpdHkgPSBiaXNob3A7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSAncm9vayc6XHJcbiAgICAgIG1vYmlsaXR5ID0gcm9vaztcclxuICAgICAgYnJlYWs7XHJcbiAgICBjYXNlICdxdWVlbic6XHJcbiAgICAgIG1vYmlsaXR5ID0gcXVlZW47XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSAna2luZyc6XHJcbiAgICAgIG1vYmlsaXR5ID0ga2luZy5iaW5kKG51bGwsIHBpZWNlLmNvbG9yLCByb29rRmlsZXNPZihwaWVjZXMsIHBpZWNlLmNvbG9yKSwgY2FuQ2FzdGxlKTtcclxuICAgICAgYnJlYWs7XHJcbiAgfVxyXG4gIHJldHVybiB1dGlsLmFsbFBvcy5maWx0ZXIoZnVuY3Rpb24ocG9zMikge1xyXG4gICAgcmV0dXJuIChwb3NbMF0gIT09IHBvczJbMF0gfHwgcG9zWzFdICE9PSBwb3MyWzFdKSAmJiBtb2JpbGl0eShwb3NbMF0sIHBvc1sxXSwgcG9zMlswXSwgcG9zMlsxXSk7XHJcbiAgfSkubWFwKHV0aWwucG9zMmtleSk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gY29tcHV0ZTtcclxuIiwidmFyIG0gPSByZXF1aXJlKCdtaXRocmlsJyk7XHJcbnZhciBrZXkycG9zID0gcmVxdWlyZSgnLi91dGlsJykua2V5MnBvcztcclxudmFyIGlzVHJpZGVudCA9IHJlcXVpcmUoJy4vdXRpbCcpLmlzVHJpZGVudDtcclxuXHJcbmZ1bmN0aW9uIGNpcmNsZVdpZHRoKGN1cnJlbnQsIGJvdW5kcykge1xyXG4gIHJldHVybiAoY3VycmVudCA/IDMgOiA0KSAvIDUxMiAqIGJvdW5kcy53aWR0aDtcclxufVxyXG5cclxuZnVuY3Rpb24gbGluZVdpZHRoKGJydXNoLCBjdXJyZW50LCBib3VuZHMpIHtcclxuICByZXR1cm4gKGJydXNoLmxpbmVXaWR0aCB8fCAxMCkgKiAoY3VycmVudCA/IDAuODUgOiAxKSAvIDUxMiAqIGJvdW5kcy53aWR0aDtcclxufVxyXG5cclxuZnVuY3Rpb24gb3BhY2l0eShicnVzaCwgY3VycmVudCkge1xyXG4gIHJldHVybiAoYnJ1c2gub3BhY2l0eSB8fCAxKSAqIChjdXJyZW50ID8gMC45IDogMSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFycm93TWFyZ2luKGN1cnJlbnQsIGJvdW5kcykge1xyXG4gIHJldHVybiBpc1RyaWRlbnQoKSA/IDAgOiAoKGN1cnJlbnQgPyAxMCA6IDIwKSAvIDUxMiAqIGJvdW5kcy53aWR0aCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBvczJweChwb3MsIGJvdW5kcykge1xyXG4gIHZhciBzcXVhcmVTaXplID0gYm91bmRzLndpZHRoIC8gODtcclxuICByZXR1cm4gWyhwb3NbMF0gLSAwLjUpICogc3F1YXJlU2l6ZSwgKDguNSAtIHBvc1sxXSkgKiBzcXVhcmVTaXplXTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2lyY2xlKGJydXNoLCBwb3MsIGN1cnJlbnQsIGJvdW5kcykge1xyXG4gIHZhciBvID0gcG9zMnB4KHBvcywgYm91bmRzKTtcclxuICB2YXIgd2lkdGggPSBjaXJjbGVXaWR0aChjdXJyZW50LCBib3VuZHMpO1xyXG4gIHZhciByYWRpdXMgPSBib3VuZHMud2lkdGggLyAxNjtcclxuICByZXR1cm4ge1xyXG4gICAgdGFnOiAnY2lyY2xlJyxcclxuICAgIGF0dHJzOiB7XHJcbiAgICAgIGtleTogY3VycmVudCA/ICdjdXJyZW50JyA6IHBvcyArIGJydXNoLmtleSxcclxuICAgICAgc3Ryb2tlOiBicnVzaC5jb2xvcixcclxuICAgICAgJ3N0cm9rZS13aWR0aCc6IHdpZHRoLFxyXG4gICAgICBmaWxsOiAnbm9uZScsXHJcbiAgICAgIG9wYWNpdHk6IG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpLFxyXG4gICAgICBjeDogb1swXSxcclxuICAgICAgY3k6IG9bMV0sXHJcbiAgICAgIHI6IHJhZGl1cyAtIHdpZHRoIC8gMlxyXG4gICAgfVxyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFycm93KGJydXNoLCBvcmlnLCBkZXN0LCBjdXJyZW50LCBib3VuZHMpIHtcclxuICB2YXIgbSA9IGFycm93TWFyZ2luKGN1cnJlbnQsIGJvdW5kcyk7XHJcbiAgdmFyIGEgPSBwb3MycHgob3JpZywgYm91bmRzKTtcclxuICB2YXIgYiA9IHBvczJweChkZXN0LCBib3VuZHMpO1xyXG4gIHZhciBkeCA9IGJbMF0gLSBhWzBdLFxyXG4gICAgZHkgPSBiWzFdIC0gYVsxXSxcclxuICAgIGFuZ2xlID0gTWF0aC5hdGFuMihkeSwgZHgpO1xyXG4gIHZhciB4byA9IE1hdGguY29zKGFuZ2xlKSAqIG0sXHJcbiAgICB5byA9IE1hdGguc2luKGFuZ2xlKSAqIG07XHJcbiAgcmV0dXJuIHtcclxuICAgIHRhZzogJ2xpbmUnLFxyXG4gICAgYXR0cnM6IHtcclxuICAgICAga2V5OiBjdXJyZW50ID8gJ2N1cnJlbnQnIDogb3JpZyArIGRlc3QgKyBicnVzaC5rZXksXHJcbiAgICAgIHN0cm9rZTogYnJ1c2guY29sb3IsXHJcbiAgICAgICdzdHJva2Utd2lkdGgnOiBsaW5lV2lkdGgoYnJ1c2gsIGN1cnJlbnQsIGJvdW5kcyksXHJcbiAgICAgICdzdHJva2UtbGluZWNhcCc6ICdyb3VuZCcsXHJcbiAgICAgICdtYXJrZXItZW5kJzogaXNUcmlkZW50KCkgPyBudWxsIDogJ3VybCgjYXJyb3doZWFkLScgKyBicnVzaC5rZXkgKyAnKScsXHJcbiAgICAgIG9wYWNpdHk6IG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpLFxyXG4gICAgICB4MTogYVswXSxcclxuICAgICAgeTE6IGFbMV0sXHJcbiAgICAgIHgyOiBiWzBdIC0geG8sXHJcbiAgICAgIHkyOiBiWzFdIC0geW9cclxuICAgIH1cclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBwaWVjZShjZmcsIHBvcywgcGllY2UsIGJvdW5kcykge1xyXG4gIHZhciBvID0gcG9zMnB4KHBvcywgYm91bmRzKTtcclxuICB2YXIgc2l6ZSA9IGJvdW5kcy53aWR0aCAvIDggKiAocGllY2Uuc2NhbGUgfHwgMSk7XHJcbiAgdmFyIG5hbWUgPSBwaWVjZS5jb2xvciA9PT0gJ3doaXRlJyA/ICd3JyA6ICdiJztcclxuICBuYW1lICs9IChwaWVjZS5yb2xlID09PSAna25pZ2h0JyA/ICduJyA6IHBpZWNlLnJvbGVbMF0pLnRvVXBwZXJDYXNlKCk7XHJcbiAgdmFyIGhyZWYgPSBjZmcuYmFzZVVybCArIG5hbWUgKyAnLnN2Zyc7XHJcbiAgcmV0dXJuIHtcclxuICAgIHRhZzogJ2ltYWdlJyxcclxuICAgIGF0dHJzOiB7XHJcbiAgICAgIGNsYXNzOiBwaWVjZS5jb2xvciArICcgJyArIHBpZWNlLnJvbGUsXHJcbiAgICAgIHg6IG9bMF0gLSBzaXplIC8gMixcclxuICAgICAgeTogb1sxXSAtIHNpemUgLyAyLFxyXG4gICAgICB3aWR0aDogc2l6ZSxcclxuICAgICAgaGVpZ2h0OiBzaXplLFxyXG4gICAgICBocmVmOiBocmVmXHJcbiAgICB9XHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGVmcyhicnVzaGVzKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIHRhZzogJ2RlZnMnLFxyXG4gICAgY2hpbGRyZW46IFtcclxuICAgICAgYnJ1c2hlcy5tYXAoZnVuY3Rpb24oYnJ1c2gpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAga2V5OiBicnVzaC5rZXksXHJcbiAgICAgICAgICB0YWc6ICdtYXJrZXInLFxyXG4gICAgICAgICAgYXR0cnM6IHtcclxuICAgICAgICAgICAgaWQ6ICdhcnJvd2hlYWQtJyArIGJydXNoLmtleSxcclxuICAgICAgICAgICAgb3JpZW50OiAnYXV0bycsXHJcbiAgICAgICAgICAgIG1hcmtlcldpZHRoOiA0LFxyXG4gICAgICAgICAgICBtYXJrZXJIZWlnaHQ6IDgsXHJcbiAgICAgICAgICAgIHJlZlg6IDIuMDUsXHJcbiAgICAgICAgICAgIHJlZlk6IDIuMDFcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBjaGlsZHJlbjogW3tcclxuICAgICAgICAgICAgdGFnOiAncGF0aCcsXHJcbiAgICAgICAgICAgIGF0dHJzOiB7XHJcbiAgICAgICAgICAgICAgZDogJ00wLDAgVjQgTDMsMiBaJyxcclxuICAgICAgICAgICAgICBmaWxsOiBicnVzaC5jb2xvclxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XVxyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIF1cclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBvcmllbnQocG9zLCBjb2xvcikge1xyXG4gIHJldHVybiBjb2xvciA9PT0gJ3doaXRlJyA/IHBvcyA6IFs5IC0gcG9zWzBdLCA5IC0gcG9zWzFdXTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyU2hhcGUoZGF0YSwgY3VycmVudCwgYm91bmRzKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKHNoYXBlLCBpKSB7XHJcbiAgICBpZiAoc2hhcGUucGllY2UpIHJldHVybiBwaWVjZShcclxuICAgICAgZGF0YS5kcmF3YWJsZS5waWVjZXMsXHJcbiAgICAgIG9yaWVudChrZXkycG9zKHNoYXBlLm9yaWcpLCBkYXRhLm9yaWVudGF0aW9uKSxcclxuICAgICAgc2hhcGUucGllY2UsXHJcbiAgICAgIGJvdW5kcyk7XHJcbiAgICBlbHNlIGlmIChzaGFwZS5icnVzaCkge1xyXG4gICAgICB2YXIgYnJ1c2ggPSBzaGFwZS5icnVzaE1vZGlmaWVycyA/XHJcbiAgICAgICAgbWFrZUN1c3RvbUJydXNoKGRhdGEuZHJhd2FibGUuYnJ1c2hlc1tzaGFwZS5icnVzaF0sIHNoYXBlLmJydXNoTW9kaWZpZXJzLCBpKSA6XHJcbiAgICAgICAgZGF0YS5kcmF3YWJsZS5icnVzaGVzW3NoYXBlLmJydXNoXTtcclxuICAgICAgdmFyIG9yaWcgPSBvcmllbnQoa2V5MnBvcyhzaGFwZS5vcmlnKSwgZGF0YS5vcmllbnRhdGlvbik7XHJcbiAgICAgIGlmIChzaGFwZS5vcmlnICYmIHNoYXBlLmRlc3QpIHJldHVybiBhcnJvdyhcclxuICAgICAgICBicnVzaCxcclxuICAgICAgICBvcmlnLFxyXG4gICAgICAgIG9yaWVudChrZXkycG9zKHNoYXBlLmRlc3QpLCBkYXRhLm9yaWVudGF0aW9uKSxcclxuICAgICAgICBjdXJyZW50LCBib3VuZHMpO1xyXG4gICAgICBlbHNlIGlmIChzaGFwZS5vcmlnKSByZXR1cm4gY2lyY2xlKFxyXG4gICAgICAgIGJydXNoLFxyXG4gICAgICAgIG9yaWcsXHJcbiAgICAgICAgY3VycmVudCwgYm91bmRzKTtcclxuICAgIH1cclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBtYWtlQ3VzdG9tQnJ1c2goYmFzZSwgbW9kaWZpZXJzLCBpKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGtleTogJ2JtJyArIGksXHJcbiAgICBjb2xvcjogbW9kaWZpZXJzLmNvbG9yIHx8IGJhc2UuY29sb3IsXHJcbiAgICBvcGFjaXR5OiBtb2RpZmllcnMub3BhY2l0eSB8fCBiYXNlLm9wYWNpdHksXHJcbiAgICBsaW5lV2lkdGg6IG1vZGlmaWVycy5saW5lV2lkdGggfHwgYmFzZS5saW5lV2lkdGhcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb21wdXRlVXNlZEJydXNoZXMoZCwgZHJhd24sIGN1cnJlbnQpIHtcclxuICB2YXIgYnJ1c2hlcyA9IFtdO1xyXG4gIHZhciBrZXlzID0gW107XHJcbiAgdmFyIHNoYXBlcyA9IChjdXJyZW50ICYmIGN1cnJlbnQuZGVzdCkgPyBkcmF3bi5jb25jYXQoY3VycmVudCkgOiBkcmF3bjtcclxuICBmb3IgKHZhciBpIGluIHNoYXBlcykge1xyXG4gICAgdmFyIHNoYXBlID0gc2hhcGVzW2ldO1xyXG4gICAgaWYgKCFzaGFwZS5kZXN0KSBjb250aW51ZTtcclxuICAgIHZhciBicnVzaEtleSA9IHNoYXBlLmJydXNoO1xyXG4gICAgaWYgKHNoYXBlLmJydXNoTW9kaWZpZXJzKVxyXG4gICAgICBicnVzaGVzLnB1c2gobWFrZUN1c3RvbUJydXNoKGQuYnJ1c2hlc1ticnVzaEtleV0sIHNoYXBlLmJydXNoTW9kaWZpZXJzLCBpKSk7XHJcbiAgICBlbHNlIHtcclxuICAgICAgaWYgKGtleXMuaW5kZXhPZihicnVzaEtleSkgPT09IC0xKSB7XHJcbiAgICAgICAgYnJ1c2hlcy5wdXNoKGQuYnJ1c2hlc1ticnVzaEtleV0pO1xyXG4gICAgICAgIGtleXMucHVzaChicnVzaEtleSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIGJydXNoZXM7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY3RybCkge1xyXG4gIGlmICghY3RybC5kYXRhLmJvdW5kcykgcmV0dXJuO1xyXG4gIHZhciBkID0gY3RybC5kYXRhLmRyYXdhYmxlO1xyXG4gIHZhciBhbGxTaGFwZXMgPSBkLnNoYXBlcy5jb25jYXQoZC5hdXRvU2hhcGVzKTtcclxuICBpZiAoIWFsbFNoYXBlcy5sZW5ndGggJiYgIWQuY3VycmVudC5vcmlnKSByZXR1cm47XHJcbiAgdmFyIGJvdW5kcyA9IGN0cmwuZGF0YS5ib3VuZHMoKTtcclxuICBpZiAoYm91bmRzLndpZHRoICE9PSBib3VuZHMuaGVpZ2h0KSByZXR1cm47XHJcbiAgdmFyIHVzZWRCcnVzaGVzID0gY29tcHV0ZVVzZWRCcnVzaGVzKGQsIGFsbFNoYXBlcywgZC5jdXJyZW50KTtcclxuICByZXR1cm4ge1xyXG4gICAgdGFnOiAnc3ZnJyxcclxuICAgIGF0dHJzOiB7XHJcbiAgICAgIGtleTogJ3N2ZydcclxuICAgIH0sXHJcbiAgICBjaGlsZHJlbjogW1xyXG4gICAgICBkZWZzKHVzZWRCcnVzaGVzKSxcclxuICAgICAgYWxsU2hhcGVzLm1hcChyZW5kZXJTaGFwZShjdHJsLmRhdGEsIGZhbHNlLCBib3VuZHMpKSxcclxuICAgICAgcmVuZGVyU2hhcGUoY3RybC5kYXRhLCB0cnVlLCBib3VuZHMpKGQuY3VycmVudCwgOTk5OSlcclxuICAgIF1cclxuICB9O1xyXG59XHJcbiIsInZhciBmaWxlcyA9IFwiYWJjZGVmZ2hcIi5zcGxpdCgnJyk7XHJcbnZhciByYW5rcyA9IFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4XTtcclxudmFyIGludlJhbmtzID0gWzgsIDcsIDYsIDUsIDQsIDMsIDIsIDFdO1xyXG52YXIgZmlsZU51bWJlcnMgPSB7XHJcbiAgYTogMSxcclxuICBiOiAyLFxyXG4gIGM6IDMsXHJcbiAgZDogNCxcclxuICBlOiA1LFxyXG4gIGY6IDYsXHJcbiAgZzogNyxcclxuICBoOiA4XHJcbn07XHJcblxyXG5mdW5jdGlvbiBwb3Mya2V5KHBvcykge1xyXG4gIHJldHVybiBmaWxlc1twb3NbMF0gLSAxXSArIHBvc1sxXTtcclxufVxyXG5cclxuZnVuY3Rpb24ga2V5MnBvcyhwb3MpIHtcclxuICByZXR1cm4gW2ZpbGVOdW1iZXJzW3Bvc1swXV0sIHBhcnNlSW50KHBvc1sxXSldO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbnZlcnRLZXkoa2V5KSB7XHJcbiAgcmV0dXJuIGZpbGVzWzggLSBmaWxlTnVtYmVyc1trZXlbMF1dXSArICg5IC0gcGFyc2VJbnQoa2V5WzFdKSk7XHJcbn1cclxuXHJcbnZhciBhbGxQb3MgPSAoZnVuY3Rpb24oKSB7XHJcbiAgdmFyIHBzID0gW107XHJcbiAgaW52UmFua3MuZm9yRWFjaChmdW5jdGlvbih5KSB7XHJcbiAgICByYW5rcy5mb3JFYWNoKGZ1bmN0aW9uKHgpIHtcclxuICAgICAgcHMucHVzaChbeCwgeV0pO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbiAgcmV0dXJuIHBzO1xyXG59KSgpO1xyXG52YXIgYWxsS2V5cyA9IGFsbFBvcy5tYXAocG9zMmtleSk7XHJcbnZhciBpbnZLZXlzID0gYWxsS2V5cy5zbGljZSgwKS5yZXZlcnNlKCk7XHJcblxyXG5mdW5jdGlvbiBjbGFzc1NldChjbGFzc2VzKSB7XHJcbiAgdmFyIGFyciA9IFtdO1xyXG4gIGZvciAodmFyIGkgaW4gY2xhc3Nlcykge1xyXG4gICAgaWYgKGNsYXNzZXNbaV0pIGFyci5wdXNoKGkpO1xyXG4gIH1cclxuICByZXR1cm4gYXJyLmpvaW4oJyAnKTtcclxufVxyXG5cclxuZnVuY3Rpb24gb3Bwb3NpdGUoY29sb3IpIHtcclxuICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyAnYmxhY2snIDogJ3doaXRlJztcclxufVxyXG5cclxuZnVuY3Rpb24gY29udGFpbnNYKHhzLCB4KSB7XHJcbiAgcmV0dXJuIHhzICYmIHhzLmluZGV4T2YoeCkgIT09IC0xO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkaXN0YW5jZShwb3MxLCBwb3MyKSB7XHJcbiAgcmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyhwb3MxWzBdIC0gcG9zMlswXSwgMikgKyBNYXRoLnBvdyhwb3MxWzFdIC0gcG9zMlsxXSwgMikpO1xyXG59XHJcblxyXG4vLyB0aGlzIG11c3QgYmUgY2FjaGVkIGJlY2F1c2Ugb2YgdGhlIGFjY2VzcyB0byBkb2N1bWVudC5ib2R5LnN0eWxlXHJcbnZhciBjYWNoZWRUcmFuc2Zvcm1Qcm9wO1xyXG5cclxuZnVuY3Rpb24gY29tcHV0ZVRyYW5zZm9ybVByb3AoKSB7XHJcbiAgcmV0dXJuICd0cmFuc2Zvcm0nIGluIGRvY3VtZW50LmJvZHkuc3R5bGUgP1xyXG4gICAgJ3RyYW5zZm9ybScgOiAnd2Via2l0VHJhbnNmb3JtJyBpbiBkb2N1bWVudC5ib2R5LnN0eWxlID9cclxuICAgICd3ZWJraXRUcmFuc2Zvcm0nIDogJ21velRyYW5zZm9ybScgaW4gZG9jdW1lbnQuYm9keS5zdHlsZSA/XHJcbiAgICAnbW96VHJhbnNmb3JtJyA6ICdvVHJhbnNmb3JtJyBpbiBkb2N1bWVudC5ib2R5LnN0eWxlID9cclxuICAgICdvVHJhbnNmb3JtJyA6ICdtc1RyYW5zZm9ybSc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRyYW5zZm9ybVByb3AoKSB7XHJcbiAgaWYgKCFjYWNoZWRUcmFuc2Zvcm1Qcm9wKSBjYWNoZWRUcmFuc2Zvcm1Qcm9wID0gY29tcHV0ZVRyYW5zZm9ybVByb3AoKTtcclxuICByZXR1cm4gY2FjaGVkVHJhbnNmb3JtUHJvcDtcclxufVxyXG5cclxudmFyIGNhY2hlZElzVHJpZGVudCA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBpc1RyaWRlbnQoKSB7XHJcbiAgaWYgKGNhY2hlZElzVHJpZGVudCA9PT0gbnVsbClcclxuICAgIGNhY2hlZElzVHJpZGVudCA9IHdpbmRvdy5uYXZpZ2F0b3IudXNlckFnZW50LmluZGV4T2YoJ1RyaWRlbnQvJykgPiAtMTtcclxuICByZXR1cm4gY2FjaGVkSXNUcmlkZW50O1xyXG59XHJcblxyXG5mdW5jdGlvbiB0cmFuc2xhdGUocG9zKSB7XHJcbiAgcmV0dXJuICd0cmFuc2xhdGUoJyArIHBvc1swXSArICdweCwnICsgcG9zWzFdICsgJ3B4KSc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV2ZW50UG9zaXRpb24oZSkge1xyXG4gIGlmIChlLmNsaWVudFggfHwgZS5jbGllbnRYID09PSAwKSByZXR1cm4gW2UuY2xpZW50WCwgZS5jbGllbnRZXTtcclxuICBpZiAoZS50b3VjaGVzICYmIGUudGFyZ2V0VG91Y2hlc1swXSkgcmV0dXJuIFtlLnRhcmdldFRvdWNoZXNbMF0uY2xpZW50WCwgZS50YXJnZXRUb3VjaGVzWzBdLmNsaWVudFldO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJ0aWFsQXBwbHkoZm4sIGFyZ3MpIHtcclxuICByZXR1cm4gZm4uYmluZC5hcHBseShmbiwgW251bGxdLmNvbmNhdChhcmdzKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnRpYWwoKSB7XHJcbiAgcmV0dXJuIHBhcnRpYWxBcHBseShhcmd1bWVudHNbMF0sIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1JpZ2h0QnV0dG9uKGUpIHtcclxuICByZXR1cm4gZS5idXR0b25zID09PSAyIHx8IGUuYnV0dG9uID09PSAyO1xyXG59XHJcblxyXG5mdW5jdGlvbiBtZW1vKGYpIHtcclxuICB2YXIgdiwgcmV0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAodiA9PT0gdW5kZWZpbmVkKSB2ID0gZigpO1xyXG4gICAgcmV0dXJuIHY7XHJcbiAgfTtcclxuICByZXQuY2xlYXIgPSBmdW5jdGlvbigpIHtcclxuICAgIHYgPSB1bmRlZmluZWQ7XHJcbiAgfVxyXG4gIHJldHVybiByZXQ7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIGZpbGVzOiBmaWxlcyxcclxuICByYW5rczogcmFua3MsXHJcbiAgaW52UmFua3M6IGludlJhbmtzLFxyXG4gIGFsbFBvczogYWxsUG9zLFxyXG4gIGFsbEtleXM6IGFsbEtleXMsXHJcbiAgaW52S2V5czogaW52S2V5cyxcclxuICBwb3Mya2V5OiBwb3Mya2V5LFxyXG4gIGtleTJwb3M6IGtleTJwb3MsXHJcbiAgaW52ZXJ0S2V5OiBpbnZlcnRLZXksXHJcbiAgY2xhc3NTZXQ6IGNsYXNzU2V0LFxyXG4gIG9wcG9zaXRlOiBvcHBvc2l0ZSxcclxuICB0cmFuc2xhdGU6IHRyYW5zbGF0ZSxcclxuICBjb250YWluc1g6IGNvbnRhaW5zWCxcclxuICBkaXN0YW5jZTogZGlzdGFuY2UsXHJcbiAgZXZlbnRQb3NpdGlvbjogZXZlbnRQb3NpdGlvbixcclxuICBwYXJ0aWFsQXBwbHk6IHBhcnRpYWxBcHBseSxcclxuICBwYXJ0aWFsOiBwYXJ0aWFsLFxyXG4gIHRyYW5zZm9ybVByb3A6IHRyYW5zZm9ybVByb3AsXHJcbiAgaXNUcmlkZW50OiBpc1RyaWRlbnQsXHJcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lOiAod2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cuc2V0VGltZW91dCkuYmluZCh3aW5kb3cpLFxyXG4gIGlzUmlnaHRCdXR0b246IGlzUmlnaHRCdXR0b24sXHJcbiAgbWVtbzogbWVtb1xyXG59O1xyXG4iLCJ2YXIgZHJhZyA9IHJlcXVpcmUoJy4vZHJhZycpO1xyXG52YXIgZHJhdyA9IHJlcXVpcmUoJy4vZHJhdycpO1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xyXG52YXIgc3ZnID0gcmVxdWlyZSgnLi9zdmcnKTtcclxudmFyIG1ha2VDb29yZHMgPSByZXF1aXJlKCcuL2Nvb3JkcycpO1xyXG52YXIgbSA9IHJlcXVpcmUoJ21pdGhyaWwnKTtcclxuXHJcbnZhciBwaWVjZVRhZyA9ICdwaWVjZSc7XHJcbnZhciBzcXVhcmVUYWcgPSAnc3F1YXJlJztcclxuXHJcbmZ1bmN0aW9uIHBpZWNlQ2xhc3MocCkge1xyXG4gIHJldHVybiBwLnJvbGUgKyAnICcgKyBwLmNvbG9yO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJQaWVjZShkLCBrZXksIGN0eCkge1xyXG4gIHZhciBhdHRycyA9IHtcclxuICAgIGtleTogJ3AnICsga2V5LFxyXG4gICAgc3R5bGU6IHt9LFxyXG4gICAgY2xhc3M6IHBpZWNlQ2xhc3MoZC5waWVjZXNba2V5XSlcclxuICB9O1xyXG4gIHZhciB0cmFuc2xhdGUgPSBwb3NUb1RyYW5zbGF0ZSh1dGlsLmtleTJwb3Moa2V5KSwgY3R4KTtcclxuICB2YXIgZHJhZ2dhYmxlID0gZC5kcmFnZ2FibGUuY3VycmVudDtcclxuICBpZiAoZHJhZ2dhYmxlLm9yaWcgPT09IGtleSAmJiBkcmFnZ2FibGUuc3RhcnRlZCkge1xyXG4gICAgdHJhbnNsYXRlWzBdICs9IGRyYWdnYWJsZS5wb3NbMF0gKyBkcmFnZ2FibGUuZGVjWzBdO1xyXG4gICAgdHJhbnNsYXRlWzFdICs9IGRyYWdnYWJsZS5wb3NbMV0gKyBkcmFnZ2FibGUuZGVjWzFdO1xyXG4gICAgYXR0cnMuY2xhc3MgKz0gJyBkcmFnZ2luZyc7XHJcbiAgfSBlbHNlIGlmIChkLmFuaW1hdGlvbi5jdXJyZW50LmFuaW1zKSB7XHJcbiAgICB2YXIgYW5pbWF0aW9uID0gZC5hbmltYXRpb24uY3VycmVudC5hbmltc1trZXldO1xyXG4gICAgaWYgKGFuaW1hdGlvbikge1xyXG4gICAgICB0cmFuc2xhdGVbMF0gKz0gYW5pbWF0aW9uWzFdWzBdO1xyXG4gICAgICB0cmFuc2xhdGVbMV0gKz0gYW5pbWF0aW9uWzFdWzFdO1xyXG4gICAgfVxyXG4gIH1cclxuICBhdHRycy5zdHlsZVtjdHgudHJhbnNmb3JtUHJvcF0gPSB1dGlsLnRyYW5zbGF0ZSh0cmFuc2xhdGUpO1xyXG4gIGlmIChkLnBpZWNlS2V5KSBhdHRyc1snZGF0YS1rZXknXSA9IGtleTtcclxuICByZXR1cm4ge1xyXG4gICAgdGFnOiBwaWVjZVRhZyxcclxuICAgIGF0dHJzOiBhdHRyc1xyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlclNxdWFyZShrZXksIGNsYXNzZXMsIGN0eCkge1xyXG4gIHZhciBhdHRycyA9IHtcclxuICAgIGtleTogJ3MnICsga2V5LFxyXG4gICAgY2xhc3M6IGNsYXNzZXMsXHJcbiAgICBzdHlsZToge31cclxuICB9O1xyXG4gIGF0dHJzLnN0eWxlW2N0eC50cmFuc2Zvcm1Qcm9wXSA9IHV0aWwudHJhbnNsYXRlKHBvc1RvVHJhbnNsYXRlKHV0aWwua2V5MnBvcyhrZXkpLCBjdHgpKTtcclxuICByZXR1cm4ge1xyXG4gICAgdGFnOiBzcXVhcmVUYWcsXHJcbiAgICBhdHRyczogYXR0cnNcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBwb3NUb1RyYW5zbGF0ZShwb3MsIGN0eCkge1xyXG4gIHJldHVybiBbXHJcbiAgICAoY3R4LmFzV2hpdGUgPyBwb3NbMF0gLSAxIDogOCAtIHBvc1swXSkgKiBjdHguYm91bmRzLndpZHRoIC8gOCwgKGN0eC5hc1doaXRlID8gOCAtIHBvc1sxXSA6IHBvc1sxXSAtIDEpICogY3R4LmJvdW5kcy5oZWlnaHQgLyA4XHJcbiAgXTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyR2hvc3Qoa2V5LCBwaWVjZSwgY3R4KSB7XHJcbiAgaWYgKCFwaWVjZSkgcmV0dXJuO1xyXG4gIHZhciBhdHRycyA9IHtcclxuICAgIGtleTogJ2cnICsga2V5LFxyXG4gICAgc3R5bGU6IHt9LFxyXG4gICAgY2xhc3M6IHBpZWNlQ2xhc3MocGllY2UpICsgJyBnaG9zdCdcclxuICB9O1xyXG4gIGF0dHJzLnN0eWxlW2N0eC50cmFuc2Zvcm1Qcm9wXSA9IHV0aWwudHJhbnNsYXRlKHBvc1RvVHJhbnNsYXRlKHV0aWwua2V5MnBvcyhrZXkpLCBjdHgpKTtcclxuICByZXR1cm4ge1xyXG4gICAgdGFnOiBwaWVjZVRhZyxcclxuICAgIGF0dHJzOiBhdHRyc1xyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlckZhZGluZyhjZmcsIGN0eCkge1xyXG4gIHZhciBhdHRycyA9IHtcclxuICAgIGtleTogJ2YnICsgY2ZnLnBpZWNlLmtleSxcclxuICAgIGNsYXNzOiAnZmFkaW5nICcgKyBwaWVjZUNsYXNzKGNmZy5waWVjZSksXHJcbiAgICBzdHlsZToge1xyXG4gICAgICBvcGFjaXR5OiBjZmcub3BhY2l0eVxyXG4gICAgfVxyXG4gIH07XHJcbiAgYXR0cnMuc3R5bGVbY3R4LnRyYW5zZm9ybVByb3BdID0gdXRpbC50cmFuc2xhdGUocG9zVG9UcmFuc2xhdGUoY2ZnLnBpZWNlLnBvcywgY3R4KSk7XHJcbiAgcmV0dXJuIHtcclxuICAgIHRhZzogcGllY2VUYWcsXHJcbiAgICBhdHRyczogYXR0cnNcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZGRTcXVhcmUoc3F1YXJlcywga2V5LCBrbGFzcykge1xyXG4gIGlmIChzcXVhcmVzW2tleV0pIHNxdWFyZXNba2V5XS5wdXNoKGtsYXNzKTtcclxuICBlbHNlIHNxdWFyZXNba2V5XSA9IFtrbGFzc107XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlclNxdWFyZXMoY3RybCwgY3R4KSB7XHJcbiAgdmFyIGQgPSBjdHJsLmRhdGE7XHJcbiAgdmFyIHNxdWFyZXMgPSB7fTtcclxuICBpZiAoZC5sYXN0TW92ZSAmJiBkLmhpZ2hsaWdodC5sYXN0TW92ZSkgZC5sYXN0TW92ZS5mb3JFYWNoKGZ1bmN0aW9uKGspIHtcclxuICAgIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAnbGFzdC1tb3ZlJyk7XHJcbiAgfSk7XHJcbiAgaWYgKGQuY2hlY2sgJiYgZC5oaWdobGlnaHQuY2hlY2spIGFkZFNxdWFyZShzcXVhcmVzLCBkLmNoZWNrLCAnY2hlY2snKTtcclxuICBpZiAoZC5zZWxlY3RlZCkge1xyXG4gICAgYWRkU3F1YXJlKHNxdWFyZXMsIGQuc2VsZWN0ZWQsICdzZWxlY3RlZCcpO1xyXG4gICAgdmFyIG92ZXIgPSBkLmRyYWdnYWJsZS5jdXJyZW50Lm92ZXI7XHJcbiAgICB2YXIgZGVzdHMgPSBkLm1vdmFibGUuZGVzdHNbZC5zZWxlY3RlZF07XHJcbiAgICBpZiAoZGVzdHMpIGRlc3RzLmZvckVhY2goZnVuY3Rpb24oaykge1xyXG4gICAgICBpZiAoayA9PT0gb3ZlcikgYWRkU3F1YXJlKHNxdWFyZXMsIGssICdtb3ZlLWRlc3QgZHJhZy1vdmVyJyk7XHJcbiAgICAgIGVsc2UgaWYgKGQubW92YWJsZS5zaG93RGVzdHMpIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAnbW92ZS1kZXN0JyArIChkLnBpZWNlc1trXSA/ICcgb2MnIDogJycpKTtcclxuICAgIH0pO1xyXG4gICAgdmFyIHBEZXN0cyA9IGQucHJlbW92YWJsZS5kZXN0cztcclxuICAgIGlmIChwRGVzdHMpIHBEZXN0cy5mb3JFYWNoKGZ1bmN0aW9uKGspIHtcclxuICAgICAgaWYgKGsgPT09IG92ZXIpIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAncHJlbW92ZS1kZXN0IGRyYWctb3ZlcicpO1xyXG4gICAgICBlbHNlIGlmIChkLm1vdmFibGUuc2hvd0Rlc3RzKSBhZGRTcXVhcmUoc3F1YXJlcywgaywgJ3ByZW1vdmUtZGVzdCcgKyAoZC5waWVjZXNba10gPyAnIG9jJyA6ICcnKSk7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgdmFyIHByZW1vdmUgPSBkLnByZW1vdmFibGUuY3VycmVudDtcclxuICBpZiAocHJlbW92ZSkgcHJlbW92ZS5mb3JFYWNoKGZ1bmN0aW9uKGspIHtcclxuICAgIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAnY3VycmVudC1wcmVtb3ZlJyk7XHJcbiAgfSk7XHJcbiAgZWxzZSBpZiAoZC5wcmVkcm9wcGFibGUuY3VycmVudC5rZXkpXHJcbiAgICBhZGRTcXVhcmUoc3F1YXJlcywgZC5wcmVkcm9wcGFibGUuY3VycmVudC5rZXksICdjdXJyZW50LXByZW1vdmUnKTtcclxuXHJcbiAgaWYgKGN0cmwudm0uZXhwbG9kaW5nKSBjdHJsLnZtLmV4cGxvZGluZy5rZXlzLmZvckVhY2goZnVuY3Rpb24oaykge1xyXG4gICAgYWRkU3F1YXJlKHNxdWFyZXMsIGssICdleHBsb2RpbmcnICsgY3RybC52bS5leHBsb2Rpbmcuc3RhZ2UpO1xyXG4gIH0pO1xyXG5cclxuICB2YXIgZG9tID0gW107XHJcbiAgaWYgKGQuaXRlbXMpIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjQ7IGkrKykge1xyXG4gICAgICB2YXIga2V5ID0gdXRpbC5hbGxLZXlzW2ldO1xyXG4gICAgICB2YXIgc3F1YXJlID0gc3F1YXJlc1trZXldO1xyXG4gICAgICB2YXIgaXRlbSA9IGQuaXRlbXMucmVuZGVyKHV0aWwua2V5MnBvcyhrZXkpLCBrZXkpO1xyXG4gICAgICBpZiAoc3F1YXJlIHx8IGl0ZW0pIHtcclxuICAgICAgICB2YXIgc3EgPSByZW5kZXJTcXVhcmUoa2V5LCBzcXVhcmUgPyBzcXVhcmUuam9pbignICcpICsgKGl0ZW0gPyAnIGhhcy1pdGVtJyA6ICcnKSA6ICdoYXMtaXRlbScsIGN0eCk7XHJcbiAgICAgICAgaWYgKGl0ZW0pIHNxLmNoaWxkcmVuID0gW2l0ZW1dO1xyXG4gICAgICAgIGRvbS5wdXNoKHNxKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0gZWxzZSB7XHJcbiAgICBmb3IgKHZhciBrZXkgaW4gc3F1YXJlcylcclxuICAgICAgZG9tLnB1c2gocmVuZGVyU3F1YXJlKGtleSwgc3F1YXJlc1trZXldLmpvaW4oJyAnKSwgY3R4KSk7XHJcbiAgfVxyXG4gIHJldHVybiBkb207XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlckNvbnRlbnQoY3RybCkge1xyXG4gIHZhciBkID0gY3RybC5kYXRhO1xyXG4gIGlmICghZC5ib3VuZHMpIHJldHVybjtcclxuICB2YXIgY3R4ID0ge1xyXG4gICAgYXNXaGl0ZTogZC5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJyxcclxuICAgIGJvdW5kczogZC5ib3VuZHMoKSxcclxuICAgIHRyYW5zZm9ybVByb3A6IHV0aWwudHJhbnNmb3JtUHJvcCgpXHJcbiAgfTtcclxuICB2YXIgY2hpbGRyZW4gPSByZW5kZXJTcXVhcmVzKGN0cmwsIGN0eCk7XHJcbiAgaWYgKGQuYW5pbWF0aW9uLmN1cnJlbnQuZmFkaW5ncylcclxuICAgIGQuYW5pbWF0aW9uLmN1cnJlbnQuZmFkaW5ncy5mb3JFYWNoKGZ1bmN0aW9uKHApIHtcclxuICAgICAgY2hpbGRyZW4ucHVzaChyZW5kZXJGYWRpbmcocCwgY3R4KSk7XHJcbiAgICB9KTtcclxuXHJcbiAgLy8gbXVzdCBpbnNlcnQgcGllY2VzIGluIHRoZSByaWdodCBvcmRlclxyXG4gIC8vIGZvciAzRCB0byBkaXNwbGF5IGNvcnJlY3RseVxyXG4gIHZhciBrZXlzID0gY3R4LmFzV2hpdGUgPyB1dGlsLmFsbEtleXMgOiB1dGlsLmludktleXM7XHJcbiAgaWYgKGQuaXRlbXMpXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY0OyBpKyspIHtcclxuICAgICAgaWYgKGQucGllY2VzW2tleXNbaV1dICYmICFkLml0ZW1zLnJlbmRlcih1dGlsLmtleTJwb3Moa2V5c1tpXSksIGtleXNbaV0pKVxyXG4gICAgICAgIGNoaWxkcmVuLnB1c2gocmVuZGVyUGllY2UoZCwga2V5c1tpXSwgY3R4KSk7XHJcbiAgICB9IGVsc2VcclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2NDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGQucGllY2VzW2tleXNbaV1dKSBjaGlsZHJlbi5wdXNoKHJlbmRlclBpZWNlKGQsIGtleXNbaV0sIGN0eCkpO1xyXG4gICAgICB9XHJcblxyXG4gIGlmIChkLmRyYWdnYWJsZS5zaG93R2hvc3QpIHtcclxuICAgIHZhciBkcmFnT3JpZyA9IGQuZHJhZ2dhYmxlLmN1cnJlbnQub3JpZztcclxuICAgIGlmIChkcmFnT3JpZyAmJiAhZC5kcmFnZ2FibGUuY3VycmVudC5uZXdQaWVjZSlcclxuICAgICAgY2hpbGRyZW4ucHVzaChyZW5kZXJHaG9zdChkcmFnT3JpZywgZC5waWVjZXNbZHJhZ09yaWddLCBjdHgpKTtcclxuICB9XHJcbiAgaWYgKGQuZHJhd2FibGUuZW5hYmxlZCkgY2hpbGRyZW4ucHVzaChzdmcoY3RybCkpO1xyXG4gIHJldHVybiBjaGlsZHJlbjtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RhcnREcmFnT3JEcmF3KGQpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZSkge1xyXG4gICAgaWYgKHV0aWwuaXNSaWdodEJ1dHRvbihlKSAmJiBkLmRyYWdnYWJsZS5jdXJyZW50Lm9yaWcpIHtcclxuICAgICAgaWYgKGQuZHJhZ2dhYmxlLmN1cnJlbnQubmV3UGllY2UpIGRlbGV0ZSBkLnBpZWNlc1tkLmRyYWdnYWJsZS5jdXJyZW50Lm9yaWddO1xyXG4gICAgICBkLmRyYWdnYWJsZS5jdXJyZW50ID0ge31cclxuICAgICAgZC5zZWxlY3RlZCA9IG51bGw7XHJcbiAgICB9IGVsc2UgaWYgKChlLnNoaWZ0S2V5IHx8IHV0aWwuaXNSaWdodEJ1dHRvbihlKSkgJiYgZC5kcmF3YWJsZS5lbmFibGVkKSBkcmF3LnN0YXJ0KGQsIGUpO1xyXG4gICAgZWxzZSBkcmFnLnN0YXJ0KGQsIGUpO1xyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYWdPckRyYXcoZCwgd2l0aERyYWcsIHdpdGhEcmF3KSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcclxuICAgIGlmICgoZS5zaGlmdEtleSB8fCB1dGlsLmlzUmlnaHRCdXR0b24oZSkpICYmIGQuZHJhd2FibGUuZW5hYmxlZCkgd2l0aERyYXcoZCwgZSk7XHJcbiAgICBlbHNlIGlmICghZC52aWV3T25seSkgd2l0aERyYWcoZCwgZSk7XHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gYmluZEV2ZW50cyhjdHJsLCBlbCwgY29udGV4dCkge1xyXG4gIHZhciBkID0gY3RybC5kYXRhO1xyXG4gIHZhciBvbnN0YXJ0ID0gc3RhcnREcmFnT3JEcmF3KGQpO1xyXG4gIHZhciBvbm1vdmUgPSBkcmFnT3JEcmF3KGQsIGRyYWcubW92ZSwgZHJhdy5tb3ZlKTtcclxuICB2YXIgb25lbmQgPSBkcmFnT3JEcmF3KGQsIGRyYWcuZW5kLCBkcmF3LmVuZCk7XHJcbiAgdmFyIHN0YXJ0RXZlbnRzID0gWyd0b3VjaHN0YXJ0JywgJ21vdXNlZG93biddO1xyXG4gIHZhciBtb3ZlRXZlbnRzID0gWyd0b3VjaG1vdmUnLCAnbW91c2Vtb3ZlJ107XHJcbiAgdmFyIGVuZEV2ZW50cyA9IFsndG91Y2hlbmQnLCAnbW91c2V1cCddO1xyXG4gIHN0YXJ0RXZlbnRzLmZvckVhY2goZnVuY3Rpb24oZXYpIHtcclxuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXYsIG9uc3RhcnQpO1xyXG4gIH0pO1xyXG4gIG1vdmVFdmVudHMuZm9yRWFjaChmdW5jdGlvbihldikge1xyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldiwgb25tb3ZlKTtcclxuICB9KTtcclxuICBlbmRFdmVudHMuZm9yRWFjaChmdW5jdGlvbihldikge1xyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldiwgb25lbmQpO1xyXG4gIH0pO1xyXG4gIGNvbnRleHQub251bmxvYWQgPSBmdW5jdGlvbigpIHtcclxuICAgIHN0YXJ0RXZlbnRzLmZvckVhY2goZnVuY3Rpb24oZXYpIHtcclxuICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldiwgb25zdGFydCk7XHJcbiAgICB9KTtcclxuICAgIG1vdmVFdmVudHMuZm9yRWFjaChmdW5jdGlvbihldikge1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2LCBvbm1vdmUpO1xyXG4gICAgfSk7XHJcbiAgICBlbmRFdmVudHMuZm9yRWFjaChmdW5jdGlvbihldikge1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2LCBvbmVuZCk7XHJcbiAgICB9KTtcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJCb2FyZChjdHJsKSB7XHJcbiAgdmFyIGQgPSBjdHJsLmRhdGE7XHJcbiAgcmV0dXJuIHtcclxuICAgIHRhZzogJ2RpdicsXHJcbiAgICBhdHRyczoge1xyXG4gICAgICBjbGFzczogJ2NnLWJvYXJkIG9yaWVudGF0aW9uLScgKyBkLm9yaWVudGF0aW9uLFxyXG4gICAgICBjb25maWc6IGZ1bmN0aW9uKGVsLCBpc1VwZGF0ZSwgY29udGV4dCkge1xyXG4gICAgICAgIGlmIChpc1VwZGF0ZSkgcmV0dXJuO1xyXG4gICAgICAgIGlmICghZC52aWV3T25seSB8fCBkLmRyYXdhYmxlLmVuYWJsZWQpXHJcbiAgICAgICAgICBiaW5kRXZlbnRzKGN0cmwsIGVsLCBjb250ZXh0KTtcclxuICAgICAgICAvLyB0aGlzIGZ1bmN0aW9uIG9ubHkgcmVwYWludHMgdGhlIGJvYXJkIGl0c2VsZi5cclxuICAgICAgICAvLyBpdCdzIGNhbGxlZCB3aGVuIGRyYWdnaW5nIG9yIGFuaW1hdGluZyBwaWVjZXMsXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCB0aGUgZnVsbCBhcHBsaWNhdGlvbiBlbWJlZGRpbmcgY2hlc3Nncm91bmRcclxuICAgICAgICAvLyByZW5kZXJpbmcgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lXHJcbiAgICAgICAgZC5yZW5kZXIgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgIG0ucmVuZGVyKGVsLCByZW5kZXJDb250ZW50KGN0cmwpKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGQucmVuZGVyUkFGID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICB1dGlsLnJlcXVlc3RBbmltYXRpb25GcmFtZShkLnJlbmRlcik7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBkLmJvdW5kcyA9IHV0aWwubWVtbyhlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QuYmluZChlbCkpO1xyXG4gICAgICAgIGQuZWxlbWVudCA9IGVsO1xyXG4gICAgICAgIGQucmVuZGVyKCk7XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBjaGlsZHJlbjogW11cclxuICB9O1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGN0cmwpIHtcclxuICB2YXIgZCA9IGN0cmwuZGF0YTtcclxuICByZXR1cm4ge1xyXG4gICAgdGFnOiAnZGl2JyxcclxuICAgIGF0dHJzOiB7XHJcbiAgICAgIGNvbmZpZzogZnVuY3Rpb24oZWwsIGlzVXBkYXRlKSB7XHJcbiAgICAgICAgaWYgKGlzVXBkYXRlKSB7XHJcbiAgICAgICAgICBpZiAoZC5yZWRyYXdDb29yZHMpIGQucmVkcmF3Q29vcmRzKGQub3JpZW50YXRpb24pO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZC5jb29yZGluYXRlcykgZC5yZWRyYXdDb29yZHMgPSBtYWtlQ29vcmRzKGQub3JpZW50YXRpb24sIGVsKTtcclxuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjb250ZXh0bWVudScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgIGlmIChkLmRpc2FibGVDb250ZXh0TWVudSB8fCBkLmRyYXdhYmxlLmVuYWJsZWQpIHtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKGQucmVzaXphYmxlKVxyXG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdjaGVzc2dyb3VuZC5yZXNpemUnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGQuYm91bmRzLmNsZWFyKCk7XHJcbiAgICAgICAgICAgIGQucmVuZGVyKCk7XHJcbiAgICAgICAgICB9LCBmYWxzZSk7XHJcbiAgICAgICAgWydvbnNjcm9sbCcsICdvbnJlc2l6ZSddLmZvckVhY2goZnVuY3Rpb24obikge1xyXG4gICAgICAgICAgdmFyIHByZXYgPSB3aW5kb3dbbl07XHJcbiAgICAgICAgICB3aW5kb3dbbl0gPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcHJldiAmJiBwcmV2KCk7XHJcbiAgICAgICAgICAgIGQuYm91bmRzLmNsZWFyKCk7XHJcbiAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9LFxyXG4gICAgICBjbGFzczogW1xyXG4gICAgICAgICdjZy1ib2FyZC13cmFwJyxcclxuICAgICAgICBkLnZpZXdPbmx5ID8gJ3ZpZXctb25seScgOiAnbWFuaXB1bGFibGUnXHJcbiAgICAgIF0uam9pbignICcpXHJcbiAgICB9LFxyXG4gICAgY2hpbGRyZW46IFtyZW5kZXJCb2FyZChjdHJsKV1cclxuICB9O1xyXG59O1xyXG4iLCIvKiFcclxuICogQG5hbWUgSmF2YVNjcmlwdC9Ob2RlSlMgTWVyZ2UgdjEuMi4wXHJcbiAqIEBhdXRob3IgeWVpa29zXHJcbiAqIEByZXBvc2l0b3J5IGh0dHBzOi8vZ2l0aHViLmNvbS95ZWlrb3MvanMubWVyZ2VcclxuXHJcbiAqIENvcHlyaWdodCAyMDE0IHllaWtvcyAtIE1JVCBsaWNlbnNlXHJcbiAqIGh0dHBzOi8vcmF3LmdpdGh1Yi5jb20veWVpa29zL2pzLm1lcmdlL21hc3Rlci9MSUNFTlNFXHJcbiAqL1xyXG5cclxuOyhmdW5jdGlvbihpc05vZGUpIHtcclxuXHJcblx0LyoqXHJcblx0ICogTWVyZ2Ugb25lIG9yIG1vcmUgb2JqZWN0cyBcclxuXHQgKiBAcGFyYW0gYm9vbD8gY2xvbmVcclxuXHQgKiBAcGFyYW0gbWl4ZWQsLi4uIGFyZ3VtZW50c1xyXG5cdCAqIEByZXR1cm4gb2JqZWN0XHJcblx0ICovXHJcblxyXG5cdHZhciBQdWJsaWMgPSBmdW5jdGlvbihjbG9uZSkge1xyXG5cclxuXHRcdHJldHVybiBtZXJnZShjbG9uZSA9PT0gdHJ1ZSwgZmFsc2UsIGFyZ3VtZW50cyk7XHJcblxyXG5cdH0sIHB1YmxpY05hbWUgPSAnbWVyZ2UnO1xyXG5cclxuXHQvKipcclxuXHQgKiBNZXJnZSB0d28gb3IgbW9yZSBvYmplY3RzIHJlY3Vyc2l2ZWx5IFxyXG5cdCAqIEBwYXJhbSBib29sPyBjbG9uZVxyXG5cdCAqIEBwYXJhbSBtaXhlZCwuLi4gYXJndW1lbnRzXHJcblx0ICogQHJldHVybiBvYmplY3RcclxuXHQgKi9cclxuXHJcblx0UHVibGljLnJlY3Vyc2l2ZSA9IGZ1bmN0aW9uKGNsb25lKSB7XHJcblxyXG5cdFx0cmV0dXJuIG1lcmdlKGNsb25lID09PSB0cnVlLCB0cnVlLCBhcmd1bWVudHMpO1xyXG5cclxuXHR9O1xyXG5cclxuXHQvKipcclxuXHQgKiBDbG9uZSB0aGUgaW5wdXQgcmVtb3ZpbmcgYW55IHJlZmVyZW5jZVxyXG5cdCAqIEBwYXJhbSBtaXhlZCBpbnB1dFxyXG5cdCAqIEByZXR1cm4gbWl4ZWRcclxuXHQgKi9cclxuXHJcblx0UHVibGljLmNsb25lID0gZnVuY3Rpb24oaW5wdXQpIHtcclxuXHJcblx0XHR2YXIgb3V0cHV0ID0gaW5wdXQsXHJcblx0XHRcdHR5cGUgPSB0eXBlT2YoaW5wdXQpLFxyXG5cdFx0XHRpbmRleCwgc2l6ZTtcclxuXHJcblx0XHRpZiAodHlwZSA9PT0gJ2FycmF5Jykge1xyXG5cclxuXHRcdFx0b3V0cHV0ID0gW107XHJcblx0XHRcdHNpemUgPSBpbnB1dC5sZW5ndGg7XHJcblxyXG5cdFx0XHRmb3IgKGluZGV4PTA7aW5kZXg8c2l6ZTsrK2luZGV4KVxyXG5cclxuXHRcdFx0XHRvdXRwdXRbaW5kZXhdID0gUHVibGljLmNsb25lKGlucHV0W2luZGV4XSk7XHJcblxyXG5cdFx0fSBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0Jykge1xyXG5cclxuXHRcdFx0b3V0cHV0ID0ge307XHJcblxyXG5cdFx0XHRmb3IgKGluZGV4IGluIGlucHV0KVxyXG5cclxuXHRcdFx0XHRvdXRwdXRbaW5kZXhdID0gUHVibGljLmNsb25lKGlucHV0W2luZGV4XSk7XHJcblxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBvdXRwdXQ7XHJcblxyXG5cdH07XHJcblxyXG5cdC8qKlxyXG5cdCAqIE1lcmdlIHR3byBvYmplY3RzIHJlY3Vyc2l2ZWx5XHJcblx0ICogQHBhcmFtIG1peGVkIGlucHV0XHJcblx0ICogQHBhcmFtIG1peGVkIGV4dGVuZFxyXG5cdCAqIEByZXR1cm4gbWl4ZWRcclxuXHQgKi9cclxuXHJcblx0ZnVuY3Rpb24gbWVyZ2VfcmVjdXJzaXZlKGJhc2UsIGV4dGVuZCkge1xyXG5cclxuXHRcdGlmICh0eXBlT2YoYmFzZSkgIT09ICdvYmplY3QnKVxyXG5cclxuXHRcdFx0cmV0dXJuIGV4dGVuZDtcclxuXHJcblx0XHRmb3IgKHZhciBrZXkgaW4gZXh0ZW5kKSB7XHJcblxyXG5cdFx0XHRpZiAodHlwZU9mKGJhc2Vba2V5XSkgPT09ICdvYmplY3QnICYmIHR5cGVPZihleHRlbmRba2V5XSkgPT09ICdvYmplY3QnKSB7XHJcblxyXG5cdFx0XHRcdGJhc2Vba2V5XSA9IG1lcmdlX3JlY3Vyc2l2ZShiYXNlW2tleV0sIGV4dGVuZFtrZXldKTtcclxuXHJcblx0XHRcdH0gZWxzZSB7XHJcblxyXG5cdFx0XHRcdGJhc2Vba2V5XSA9IGV4dGVuZFtrZXldO1xyXG5cclxuXHRcdFx0fVxyXG5cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gYmFzZTtcclxuXHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBNZXJnZSB0d28gb3IgbW9yZSBvYmplY3RzXHJcblx0ICogQHBhcmFtIGJvb2wgY2xvbmVcclxuXHQgKiBAcGFyYW0gYm9vbCByZWN1cnNpdmVcclxuXHQgKiBAcGFyYW0gYXJyYXkgYXJndlxyXG5cdCAqIEByZXR1cm4gb2JqZWN0XHJcblx0ICovXHJcblxyXG5cdGZ1bmN0aW9uIG1lcmdlKGNsb25lLCByZWN1cnNpdmUsIGFyZ3YpIHtcclxuXHJcblx0XHR2YXIgcmVzdWx0ID0gYXJndlswXSxcclxuXHRcdFx0c2l6ZSA9IGFyZ3YubGVuZ3RoO1xyXG5cclxuXHRcdGlmIChjbG9uZSB8fCB0eXBlT2YocmVzdWx0KSAhPT0gJ29iamVjdCcpXHJcblxyXG5cdFx0XHRyZXN1bHQgPSB7fTtcclxuXHJcblx0XHRmb3IgKHZhciBpbmRleD0wO2luZGV4PHNpemU7KytpbmRleCkge1xyXG5cclxuXHRcdFx0dmFyIGl0ZW0gPSBhcmd2W2luZGV4XSxcclxuXHJcblx0XHRcdFx0dHlwZSA9IHR5cGVPZihpdGVtKTtcclxuXHJcblx0XHRcdGlmICh0eXBlICE9PSAnb2JqZWN0JykgY29udGludWU7XHJcblxyXG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gaXRlbSkge1xyXG5cclxuXHRcdFx0XHR2YXIgc2l0ZW0gPSBjbG9uZSA/IFB1YmxpYy5jbG9uZShpdGVtW2tleV0pIDogaXRlbVtrZXldO1xyXG5cclxuXHRcdFx0XHRpZiAocmVjdXJzaXZlKSB7XHJcblxyXG5cdFx0XHRcdFx0cmVzdWx0W2tleV0gPSBtZXJnZV9yZWN1cnNpdmUocmVzdWx0W2tleV0sIHNpdGVtKTtcclxuXHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHJcblx0XHRcdFx0XHRyZXN1bHRba2V5XSA9IHNpdGVtO1xyXG5cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHR9XHJcblxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiByZXN1bHQ7XHJcblxyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogR2V0IHR5cGUgb2YgdmFyaWFibGVcclxuXHQgKiBAcGFyYW0gbWl4ZWQgaW5wdXRcclxuXHQgKiBAcmV0dXJuIHN0cmluZ1xyXG5cdCAqXHJcblx0ICogQHNlZSBodHRwOi8vanNwZXJmLmNvbS90eXBlb2Z2YXJcclxuXHQgKi9cclxuXHJcblx0ZnVuY3Rpb24gdHlwZU9mKGlucHV0KSB7XHJcblxyXG5cdFx0cmV0dXJuICh7fSkudG9TdHJpbmcuY2FsbChpbnB1dCkuc2xpY2UoOCwgLTEpLnRvTG93ZXJDYXNlKCk7XHJcblxyXG5cdH1cclxuXHJcblx0aWYgKGlzTm9kZSkge1xyXG5cclxuXHRcdG1vZHVsZS5leHBvcnRzID0gUHVibGljO1xyXG5cclxuXHR9IGVsc2Uge1xyXG5cclxuXHRcdHdpbmRvd1twdWJsaWNOYW1lXSA9IFB1YmxpYztcclxuXHJcblx0fVxyXG5cclxufSkodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpOyIsInZhciBtID0gKGZ1bmN0aW9uIGFwcCh3aW5kb3csIHVuZGVmaW5lZCkge1xyXG5cdFwidXNlIHN0cmljdFwiO1xyXG4gIFx0dmFyIFZFUlNJT04gPSBcInYwLjIuMVwiO1xyXG5cdGZ1bmN0aW9uIGlzRnVuY3Rpb24ob2JqZWN0KSB7XHJcblx0XHRyZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gXCJmdW5jdGlvblwiO1xyXG5cdH1cclxuXHRmdW5jdGlvbiBpc09iamVjdChvYmplY3QpIHtcclxuXHRcdHJldHVybiB0eXBlLmNhbGwob2JqZWN0KSA9PT0gXCJbb2JqZWN0IE9iamVjdF1cIjtcclxuXHR9XHJcblx0ZnVuY3Rpb24gaXNTdHJpbmcob2JqZWN0KSB7XHJcblx0XHRyZXR1cm4gdHlwZS5jYWxsKG9iamVjdCkgPT09IFwiW29iamVjdCBTdHJpbmddXCI7XHJcblx0fVxyXG5cdHZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAob2JqZWN0KSB7XHJcblx0XHRyZXR1cm4gdHlwZS5jYWxsKG9iamVjdCkgPT09IFwiW29iamVjdCBBcnJheV1cIjtcclxuXHR9O1xyXG5cdHZhciB0eXBlID0ge30udG9TdHJpbmc7XHJcblx0dmFyIHBhcnNlciA9IC8oPzooXnwjfFxcLikoW14jXFwuXFxbXFxdXSspKXwoXFxbLis/XFxdKS9nLCBhdHRyUGFyc2VyID0gL1xcWyguKz8pKD86PShcInwnfCkoLio/KVxcMik/XFxdLztcclxuXHR2YXIgdm9pZEVsZW1lbnRzID0gL14oQVJFQXxCQVNFfEJSfENPTHxDT01NQU5EfEVNQkVEfEhSfElNR3xJTlBVVHxLRVlHRU58TElOS3xNRVRBfFBBUkFNfFNPVVJDRXxUUkFDS3xXQlIpJC87XHJcblx0dmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcclxuXHJcblx0Ly8gY2FjaGluZyBjb21tb25seSB1c2VkIHZhcmlhYmxlc1xyXG5cdHZhciAkZG9jdW1lbnQsICRsb2NhdGlvbiwgJHJlcXVlc3RBbmltYXRpb25GcmFtZSwgJGNhbmNlbEFuaW1hdGlvbkZyYW1lO1xyXG5cclxuXHQvLyBzZWxmIGludm9raW5nIGZ1bmN0aW9uIG5lZWRlZCBiZWNhdXNlIG9mIHRoZSB3YXkgbW9ja3Mgd29ya1xyXG5cdGZ1bmN0aW9uIGluaXRpYWxpemUod2luZG93KSB7XHJcblx0XHQkZG9jdW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQ7XHJcblx0XHQkbG9jYXRpb24gPSB3aW5kb3cubG9jYXRpb247XHJcblx0XHQkY2FuY2VsQW5pbWF0aW9uRnJhbWUgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LmNsZWFyVGltZW91dDtcclxuXHRcdCRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5zZXRUaW1lb3V0O1xyXG5cdH1cclxuXHJcblx0aW5pdGlhbGl6ZSh3aW5kb3cpO1xyXG5cclxuXHRtLnZlcnNpb24gPSBmdW5jdGlvbigpIHtcclxuXHRcdHJldHVybiBWRVJTSU9OO1xyXG5cdH07XHJcblxyXG5cdC8qKlxyXG5cdCAqIEB0eXBlZGVmIHtTdHJpbmd9IFRhZ1xyXG5cdCAqIEEgc3RyaW5nIHRoYXQgbG9va3MgbGlrZSAtPiBkaXYuY2xhc3NuYW1lI2lkW3BhcmFtPW9uZV1bcGFyYW0yPXR3b11cclxuXHQgKiBXaGljaCBkZXNjcmliZXMgYSBET00gbm9kZVxyXG5cdCAqL1xyXG5cclxuXHQvKipcclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7VGFnfSBUaGUgRE9NIG5vZGUgdGFnXHJcblx0ICogQHBhcmFtIHtPYmplY3Q9W119IG9wdGlvbmFsIGtleS12YWx1ZSBwYWlycyB0byBiZSBtYXBwZWQgdG8gRE9NIGF0dHJzXHJcblx0ICogQHBhcmFtIHsuLi5tTm9kZT1bXX0gWmVybyBvciBtb3JlIE1pdGhyaWwgY2hpbGQgbm9kZXMuIENhbiBiZSBhbiBhcnJheSwgb3Igc3BsYXQgKG9wdGlvbmFsKVxyXG5cdCAqXHJcblx0ICovXHJcblx0ZnVuY3Rpb24gbSh0YWcsIHBhaXJzKSB7XHJcblx0XHRmb3IgKHZhciBhcmdzID0gW10sIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGlzT2JqZWN0KHRhZykpIHJldHVybiBwYXJhbWV0ZXJpemUodGFnLCBhcmdzKTtcclxuXHRcdHZhciBoYXNBdHRycyA9IHBhaXJzICE9IG51bGwgJiYgaXNPYmplY3QocGFpcnMpICYmICEoXCJ0YWdcIiBpbiBwYWlycyB8fCBcInZpZXdcIiBpbiBwYWlycyB8fCBcInN1YnRyZWVcIiBpbiBwYWlycyk7XHJcblx0XHR2YXIgYXR0cnMgPSBoYXNBdHRycyA/IHBhaXJzIDoge307XHJcblx0XHR2YXIgY2xhc3NBdHRyTmFtZSA9IFwiY2xhc3NcIiBpbiBhdHRycyA/IFwiY2xhc3NcIiA6IFwiY2xhc3NOYW1lXCI7XHJcblx0XHR2YXIgY2VsbCA9IHt0YWc6IFwiZGl2XCIsIGF0dHJzOiB7fX07XHJcblx0XHR2YXIgbWF0Y2gsIGNsYXNzZXMgPSBbXTtcclxuXHRcdGlmICghaXNTdHJpbmcodGFnKSkgdGhyb3cgbmV3IEVycm9yKFwic2VsZWN0b3IgaW4gbShzZWxlY3RvciwgYXR0cnMsIGNoaWxkcmVuKSBzaG91bGQgYmUgYSBzdHJpbmdcIik7XHJcblx0XHR3aGlsZSAoKG1hdGNoID0gcGFyc2VyLmV4ZWModGFnKSkgIT0gbnVsbCkge1xyXG5cdFx0XHRpZiAobWF0Y2hbMV0gPT09IFwiXCIgJiYgbWF0Y2hbMl0pIGNlbGwudGFnID0gbWF0Y2hbMl07XHJcblx0XHRcdGVsc2UgaWYgKG1hdGNoWzFdID09PSBcIiNcIikgY2VsbC5hdHRycy5pZCA9IG1hdGNoWzJdO1xyXG5cdFx0XHRlbHNlIGlmIChtYXRjaFsxXSA9PT0gXCIuXCIpIGNsYXNzZXMucHVzaChtYXRjaFsyXSk7XHJcblx0XHRcdGVsc2UgaWYgKG1hdGNoWzNdWzBdID09PSBcIltcIikge1xyXG5cdFx0XHRcdHZhciBwYWlyID0gYXR0clBhcnNlci5leGVjKG1hdGNoWzNdKTtcclxuXHRcdFx0XHRjZWxsLmF0dHJzW3BhaXJbMV1dID0gcGFpclszXSB8fCAocGFpclsyXSA/IFwiXCIgOnRydWUpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGNoaWxkcmVuID0gaGFzQXR0cnMgPyBhcmdzLnNsaWNlKDEpIDogYXJncztcclxuXHRcdGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDEgJiYgaXNBcnJheShjaGlsZHJlblswXSkpIHtcclxuXHRcdFx0Y2VsbC5jaGlsZHJlbiA9IGNoaWxkcmVuWzBdO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGNlbGwuY2hpbGRyZW4gPSBjaGlsZHJlbjtcclxuXHRcdH1cclxuXHJcblx0XHRmb3IgKHZhciBhdHRyTmFtZSBpbiBhdHRycykge1xyXG5cdFx0XHRpZiAoYXR0cnMuaGFzT3duUHJvcGVydHkoYXR0ck5hbWUpKSB7XHJcblx0XHRcdFx0aWYgKGF0dHJOYW1lID09PSBjbGFzc0F0dHJOYW1lICYmIGF0dHJzW2F0dHJOYW1lXSAhPSBudWxsICYmIGF0dHJzW2F0dHJOYW1lXSAhPT0gXCJcIikge1xyXG5cdFx0XHRcdFx0Y2xhc3Nlcy5wdXNoKGF0dHJzW2F0dHJOYW1lXSk7XHJcblx0XHRcdFx0XHRjZWxsLmF0dHJzW2F0dHJOYW1lXSA9IFwiXCI7IC8vY3JlYXRlIGtleSBpbiBjb3JyZWN0IGl0ZXJhdGlvbiBvcmRlclxyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRlbHNlIGNlbGwuYXR0cnNbYXR0ck5hbWVdID0gYXR0cnNbYXR0ck5hbWVdO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRpZiAoY2xhc3Nlcy5sZW5ndGgpIGNlbGwuYXR0cnNbY2xhc3NBdHRyTmFtZV0gPSBjbGFzc2VzLmpvaW4oXCIgXCIpO1xyXG5cclxuXHRcdHJldHVybiBjZWxsO1xyXG5cdH1cclxuXHRmdW5jdGlvbiBmb3JFYWNoKGxpc3QsIGYpIHtcclxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGggJiYgIWYobGlzdFtpXSwgaSsrKTspIHt9XHJcblx0fVxyXG5cdGZ1bmN0aW9uIGZvcktleXMobGlzdCwgZikge1xyXG5cdFx0Zm9yRWFjaChsaXN0LCBmdW5jdGlvbiAoYXR0cnMsIGkpIHtcclxuXHRcdFx0cmV0dXJuIChhdHRycyA9IGF0dHJzICYmIGF0dHJzLmF0dHJzKSAmJiBhdHRycy5rZXkgIT0gbnVsbCAmJiBmKGF0dHJzLCBpKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHQvLyBUaGlzIGZ1bmN0aW9uIHdhcyBjYXVzaW5nIGRlb3B0cyBpbiBDaHJvbWUuXHJcblx0Ly8gV2VsbCBubyBsb25nZXJcclxuXHRmdW5jdGlvbiBkYXRhVG9TdHJpbmcoZGF0YSkge1xyXG4gICAgaWYgKGRhdGEgPT0gbnVsbCkgcmV0dXJuICcnO1xyXG4gICAgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JykgcmV0dXJuIGRhdGE7XHJcbiAgICBpZiAoZGF0YS50b1N0cmluZygpID09IG51bGwpIHJldHVybiBcIlwiOyAvLyBwcmV2ZW50IHJlY3Vyc2lvbiBlcnJvciBvbiBGRlxyXG4gICAgcmV0dXJuIGRhdGE7XHJcblx0fVxyXG5cdC8vIFRoaXMgZnVuY3Rpb24gd2FzIGNhdXNpbmcgZGVvcHRzIGluIENocm9tZS5cclxuXHRmdW5jdGlvbiBpbmplY3RUZXh0Tm9kZShwYXJlbnRFbGVtZW50LCBmaXJzdCwgaW5kZXgsIGRhdGEpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdGluc2VydE5vZGUocGFyZW50RWxlbWVudCwgZmlyc3QsIGluZGV4KTtcclxuXHRcdFx0Zmlyc3Qubm9kZVZhbHVlID0gZGF0YTtcclxuXHRcdH0gY2F0Y2ggKGUpIHt9IC8vSUUgZXJyb25lb3VzbHkgdGhyb3dzIGVycm9yIHdoZW4gYXBwZW5kaW5nIGFuIGVtcHR5IHRleHQgbm9kZSBhZnRlciBhIG51bGxcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGZsYXR0ZW4obGlzdCkge1xyXG5cdFx0Ly9yZWN1cnNpdmVseSBmbGF0dGVuIGFycmF5XHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0aWYgKGlzQXJyYXkobGlzdFtpXSkpIHtcclxuXHRcdFx0XHRsaXN0ID0gbGlzdC5jb25jYXQuYXBwbHkoW10sIGxpc3QpO1xyXG5cdFx0XHRcdC8vY2hlY2sgY3VycmVudCBpbmRleCBhZ2FpbiBhbmQgZmxhdHRlbiB1bnRpbCB0aGVyZSBhcmUgbm8gbW9yZSBuZXN0ZWQgYXJyYXlzIGF0IHRoYXQgaW5kZXhcclxuXHRcdFx0XHRpLS07XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdHJldHVybiBsaXN0O1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gaW5zZXJ0Tm9kZShwYXJlbnRFbGVtZW50LCBub2RlLCBpbmRleCkge1xyXG5cdFx0cGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUobm9kZSwgcGFyZW50RWxlbWVudC5jaGlsZE5vZGVzW2luZGV4XSB8fCBudWxsKTtcclxuXHR9XHJcblxyXG5cdHZhciBERUxFVElPTiA9IDEsIElOU0VSVElPTiA9IDIsIE1PVkUgPSAzO1xyXG5cclxuXHRmdW5jdGlvbiBoYW5kbGVLZXlzRGlmZmVyKGRhdGEsIGV4aXN0aW5nLCBjYWNoZWQsIHBhcmVudEVsZW1lbnQpIHtcclxuXHRcdGZvcktleXMoZGF0YSwgZnVuY3Rpb24gKGtleSwgaSkge1xyXG5cdFx0XHRleGlzdGluZ1trZXkgPSBrZXkua2V5XSA9IGV4aXN0aW5nW2tleV0gPyB7XHJcblx0XHRcdFx0YWN0aW9uOiBNT1ZFLFxyXG5cdFx0XHRcdGluZGV4OiBpLFxyXG5cdFx0XHRcdGZyb206IGV4aXN0aW5nW2tleV0uaW5kZXgsXHJcblx0XHRcdFx0ZWxlbWVudDogY2FjaGVkLm5vZGVzW2V4aXN0aW5nW2tleV0uaW5kZXhdIHx8ICRkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpXHJcblx0XHRcdH0gOiB7YWN0aW9uOiBJTlNFUlRJT04sIGluZGV4OiBpfTtcclxuXHRcdH0pO1xyXG5cdFx0dmFyIGFjdGlvbnMgPSBbXTtcclxuXHRcdGZvciAodmFyIHByb3AgaW4gZXhpc3RpbmcpIGFjdGlvbnMucHVzaChleGlzdGluZ1twcm9wXSk7XHJcblx0XHR2YXIgY2hhbmdlcyA9IGFjdGlvbnMuc29ydChzb3J0Q2hhbmdlcyksIG5ld0NhY2hlZCA9IG5ldyBBcnJheShjYWNoZWQubGVuZ3RoKTtcclxuXHRcdG5ld0NhY2hlZC5ub2RlcyA9IGNhY2hlZC5ub2Rlcy5zbGljZSgpO1xyXG5cclxuXHRcdGZvckVhY2goY2hhbmdlcywgZnVuY3Rpb24gKGNoYW5nZSkge1xyXG5cdFx0XHR2YXIgaW5kZXggPSBjaGFuZ2UuaW5kZXg7XHJcblx0XHRcdGlmIChjaGFuZ2UuYWN0aW9uID09PSBERUxFVElPTikge1xyXG5cdFx0XHRcdGNsZWFyKGNhY2hlZFtpbmRleF0ubm9kZXMsIGNhY2hlZFtpbmRleF0pO1xyXG5cdFx0XHRcdG5ld0NhY2hlZC5zcGxpY2UoaW5kZXgsIDEpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChjaGFuZ2UuYWN0aW9uID09PSBJTlNFUlRJT04pIHtcclxuXHRcdFx0XHR2YXIgZHVtbXkgPSAkZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRcdFx0XHRkdW1teS5rZXkgPSBkYXRhW2luZGV4XS5hdHRycy5rZXk7XHJcblx0XHRcdFx0aW5zZXJ0Tm9kZShwYXJlbnRFbGVtZW50LCBkdW1teSwgaW5kZXgpO1xyXG5cdFx0XHRcdG5ld0NhY2hlZC5zcGxpY2UoaW5kZXgsIDAsIHtcclxuXHRcdFx0XHRcdGF0dHJzOiB7a2V5OiBkYXRhW2luZGV4XS5hdHRycy5rZXl9LFxyXG5cdFx0XHRcdFx0bm9kZXM6IFtkdW1teV1cclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0XHRuZXdDYWNoZWQubm9kZXNbaW5kZXhdID0gZHVtbXk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGlmIChjaGFuZ2UuYWN0aW9uID09PSBNT1ZFKSB7XHJcblx0XHRcdFx0dmFyIGNoYW5nZUVsZW1lbnQgPSBjaGFuZ2UuZWxlbWVudDtcclxuXHRcdFx0XHR2YXIgbWF5YmVDaGFuZ2VkID0gcGFyZW50RWxlbWVudC5jaGlsZE5vZGVzW2luZGV4XTtcclxuXHRcdFx0XHRpZiAobWF5YmVDaGFuZ2VkICE9PSBjaGFuZ2VFbGVtZW50ICYmIGNoYW5nZUVsZW1lbnQgIT09IG51bGwpIHtcclxuXHRcdFx0XHRcdHBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKGNoYW5nZUVsZW1lbnQsIG1heWJlQ2hhbmdlZCB8fCBudWxsKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0bmV3Q2FjaGVkW2luZGV4XSA9IGNhY2hlZFtjaGFuZ2UuZnJvbV07XHJcblx0XHRcdFx0bmV3Q2FjaGVkLm5vZGVzW2luZGV4XSA9IGNoYW5nZUVsZW1lbnQ7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cclxuXHRcdHJldHVybiBuZXdDYWNoZWQ7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBkaWZmS2V5cyhkYXRhLCBjYWNoZWQsIGV4aXN0aW5nLCBwYXJlbnRFbGVtZW50KSB7XHJcblx0XHR2YXIga2V5c0RpZmZlciA9IGRhdGEubGVuZ3RoICE9PSBjYWNoZWQubGVuZ3RoO1xyXG5cdFx0aWYgKCFrZXlzRGlmZmVyKSB7XHJcblx0XHRcdGZvcktleXMoZGF0YSwgZnVuY3Rpb24gKGF0dHJzLCBpKSB7XHJcblx0XHRcdFx0dmFyIGNhY2hlZENlbGwgPSBjYWNoZWRbaV07XHJcblx0XHRcdFx0cmV0dXJuIGtleXNEaWZmZXIgPSBjYWNoZWRDZWxsICYmIGNhY2hlZENlbGwuYXR0cnMgJiYgY2FjaGVkQ2VsbC5hdHRycy5rZXkgIT09IGF0dHJzLmtleTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIGtleXNEaWZmZXIgPyBoYW5kbGVLZXlzRGlmZmVyKGRhdGEsIGV4aXN0aW5nLCBjYWNoZWQsIHBhcmVudEVsZW1lbnQpIDogY2FjaGVkO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gZGlmZkFycmF5KGRhdGEsIGNhY2hlZCwgbm9kZXMpIHtcclxuXHRcdC8vZGlmZiB0aGUgYXJyYXkgaXRzZWxmXHJcblxyXG5cdFx0Ly91cGRhdGUgdGhlIGxpc3Qgb2YgRE9NIG5vZGVzIGJ5IGNvbGxlY3RpbmcgdGhlIG5vZGVzIGZyb20gZWFjaCBpdGVtXHJcblx0XHRmb3JFYWNoKGRhdGEsIGZ1bmN0aW9uIChfLCBpKSB7XHJcblx0XHRcdGlmIChjYWNoZWRbaV0gIT0gbnVsbCkgbm9kZXMucHVzaC5hcHBseShub2RlcywgY2FjaGVkW2ldLm5vZGVzKTtcclxuXHRcdH0pXHJcblx0XHQvL3JlbW92ZSBpdGVtcyBmcm9tIHRoZSBlbmQgb2YgdGhlIGFycmF5IGlmIHRoZSBuZXcgYXJyYXkgaXMgc2hvcnRlciB0aGFuIHRoZSBvbGQgb25lLiBpZiBlcnJvcnMgZXZlciBoYXBwZW4gaGVyZSwgdGhlIGlzc3VlIGlzIG1vc3QgbGlrZWx5XHJcblx0XHQvL2EgYnVnIGluIHRoZSBjb25zdHJ1Y3Rpb24gb2YgdGhlIGBjYWNoZWRgIGRhdGEgc3RydWN0dXJlIHNvbWV3aGVyZSBlYXJsaWVyIGluIHRoZSBwcm9ncmFtXHJcblx0XHRmb3JFYWNoKGNhY2hlZC5ub2RlcywgZnVuY3Rpb24gKG5vZGUsIGkpIHtcclxuXHRcdFx0aWYgKG5vZGUucGFyZW50Tm9kZSAhPSBudWxsICYmIG5vZGVzLmluZGV4T2Yobm9kZSkgPCAwKSBjbGVhcihbbm9kZV0sIFtjYWNoZWRbaV1dKTtcclxuXHRcdH0pXHJcblx0XHRpZiAoZGF0YS5sZW5ndGggPCBjYWNoZWQubGVuZ3RoKSBjYWNoZWQubGVuZ3RoID0gZGF0YS5sZW5ndGg7XHJcblx0XHRjYWNoZWQubm9kZXMgPSBub2RlcztcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGJ1aWxkQXJyYXlLZXlzKGRhdGEpIHtcclxuXHRcdHZhciBndWlkID0gMDtcclxuXHRcdGZvcktleXMoZGF0YSwgZnVuY3Rpb24gKCkge1xyXG5cdFx0XHRmb3JFYWNoKGRhdGEsIGZ1bmN0aW9uIChhdHRycykge1xyXG5cdFx0XHRcdGlmICgoYXR0cnMgPSBhdHRycyAmJiBhdHRycy5hdHRycykgJiYgYXR0cnMua2V5ID09IG51bGwpIGF0dHJzLmtleSA9IFwiX19taXRocmlsX19cIiArIGd1aWQrKztcclxuXHRcdFx0fSlcclxuXHRcdFx0cmV0dXJuIDE7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIG1heWJlUmVjcmVhdGVPYmplY3QoZGF0YSwgY2FjaGVkLCBkYXRhQXR0cktleXMpIHtcclxuXHRcdC8vaWYgYW4gZWxlbWVudCBpcyBkaWZmZXJlbnQgZW5vdWdoIGZyb20gdGhlIG9uZSBpbiBjYWNoZSwgcmVjcmVhdGUgaXRcclxuXHRcdGlmIChkYXRhLnRhZyAhPT0gY2FjaGVkLnRhZyB8fFxyXG5cdFx0XHRcdGRhdGFBdHRyS2V5cy5zb3J0KCkuam9pbigpICE9PSBPYmplY3Qua2V5cyhjYWNoZWQuYXR0cnMpLnNvcnQoKS5qb2luKCkgfHxcclxuXHRcdFx0XHRkYXRhLmF0dHJzLmlkICE9PSBjYWNoZWQuYXR0cnMuaWQgfHxcclxuXHRcdFx0XHRkYXRhLmF0dHJzLmtleSAhPT0gY2FjaGVkLmF0dHJzLmtleSB8fFxyXG5cdFx0XHRcdChtLnJlZHJhdy5zdHJhdGVneSgpID09PSBcImFsbFwiICYmICghY2FjaGVkLmNvbmZpZ0NvbnRleHQgfHwgY2FjaGVkLmNvbmZpZ0NvbnRleHQucmV0YWluICE9PSB0cnVlKSkgfHxcclxuXHRcdFx0XHQobS5yZWRyYXcuc3RyYXRlZ3koKSA9PT0gXCJkaWZmXCIgJiYgY2FjaGVkLmNvbmZpZ0NvbnRleHQgJiYgY2FjaGVkLmNvbmZpZ0NvbnRleHQucmV0YWluID09PSBmYWxzZSkpIHtcclxuXHRcdFx0aWYgKGNhY2hlZC5ub2Rlcy5sZW5ndGgpIGNsZWFyKGNhY2hlZC5ub2Rlcyk7XHJcblx0XHRcdGlmIChjYWNoZWQuY29uZmlnQ29udGV4dCAmJiBpc0Z1bmN0aW9uKGNhY2hlZC5jb25maWdDb250ZXh0Lm9udW5sb2FkKSkgY2FjaGVkLmNvbmZpZ0NvbnRleHQub251bmxvYWQoKTtcclxuXHRcdFx0aWYgKGNhY2hlZC5jb250cm9sbGVycykge1xyXG5cdFx0XHRcdGZvckVhY2goY2FjaGVkLmNvbnRyb2xsZXJzLCBmdW5jdGlvbiAoY29udHJvbGxlcikge1xyXG5cdFx0XHRcdFx0aWYgKGNvbnRyb2xsZXIudW5sb2FkKSBjb250cm9sbGVyLm9udW5sb2FkKHtwcmV2ZW50RGVmYXVsdDogbm9vcH0pO1xyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBnZXRPYmplY3ROYW1lc3BhY2UoZGF0YSwgbmFtZXNwYWNlKSB7XHJcblx0XHRyZXR1cm4gZGF0YS5hdHRycy54bWxucyA/IGRhdGEuYXR0cnMueG1sbnMgOlxyXG5cdFx0XHRkYXRhLnRhZyA9PT0gXCJzdmdcIiA/IFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiA6XHJcblx0XHRcdGRhdGEudGFnID09PSBcIm1hdGhcIiA/IFwiaHR0cDovL3d3dy53My5vcmcvMTk5OC9NYXRoL01hdGhNTFwiIDpcclxuXHRcdFx0bmFtZXNwYWNlO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gdW5sb2FkQ2FjaGVkQ29udHJvbGxlcnMoY2FjaGVkLCB2aWV3cywgY29udHJvbGxlcnMpIHtcclxuXHRcdGlmIChjb250cm9sbGVycy5sZW5ndGgpIHtcclxuXHRcdFx0Y2FjaGVkLnZpZXdzID0gdmlld3M7XHJcblx0XHRcdGNhY2hlZC5jb250cm9sbGVycyA9IGNvbnRyb2xsZXJzO1xyXG5cdFx0XHRmb3JFYWNoKGNvbnRyb2xsZXJzLCBmdW5jdGlvbiAoY29udHJvbGxlcikge1xyXG5cdFx0XHRcdGlmIChjb250cm9sbGVyLm9udW5sb2FkICYmIGNvbnRyb2xsZXIub251bmxvYWQuJG9sZCkgY29udHJvbGxlci5vbnVubG9hZCA9IGNvbnRyb2xsZXIub251bmxvYWQuJG9sZDtcclxuXHRcdFx0XHRpZiAocGVuZGluZ1JlcXVlc3RzICYmIGNvbnRyb2xsZXIub251bmxvYWQpIHtcclxuXHRcdFx0XHRcdHZhciBvbnVubG9hZCA9IGNvbnRyb2xsZXIub251bmxvYWQ7XHJcblx0XHRcdFx0XHRjb250cm9sbGVyLm9udW5sb2FkID0gbm9vcDtcclxuXHRcdFx0XHRcdGNvbnRyb2xsZXIub251bmxvYWQuJG9sZCA9IG9udW5sb2FkO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBzY2hlZHVsZUNvbmZpZ3NUb0JlQ2FsbGVkKGNvbmZpZ3MsIGRhdGEsIG5vZGUsIGlzTmV3LCBjYWNoZWQpIHtcclxuXHRcdC8vc2NoZWR1bGUgY29uZmlncyB0byBiZSBjYWxsZWQuIFRoZXkgYXJlIGNhbGxlZCBhZnRlciBgYnVpbGRgXHJcblx0XHQvL2ZpbmlzaGVzIHJ1bm5pbmdcclxuXHRcdGlmIChpc0Z1bmN0aW9uKGRhdGEuYXR0cnMuY29uZmlnKSkge1xyXG5cdFx0XHR2YXIgY29udGV4dCA9IGNhY2hlZC5jb25maWdDb250ZXh0ID0gY2FjaGVkLmNvbmZpZ0NvbnRleHQgfHwge307XHJcblxyXG5cdFx0XHQvL2JpbmRcclxuXHRcdFx0Y29uZmlncy5wdXNoKGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdHJldHVybiBkYXRhLmF0dHJzLmNvbmZpZy5jYWxsKGRhdGEsIG5vZGUsICFpc05ldywgY29udGV4dCwgY2FjaGVkKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBidWlsZFVwZGF0ZWROb2RlKGNhY2hlZCwgZGF0YSwgZWRpdGFibGUsIGhhc0tleXMsIG5hbWVzcGFjZSwgdmlld3MsIGNvbmZpZ3MsIGNvbnRyb2xsZXJzKSB7XHJcblx0XHR2YXIgbm9kZSA9IGNhY2hlZC5ub2Rlc1swXTtcclxuXHRcdGlmIChoYXNLZXlzKSBzZXRBdHRyaWJ1dGVzKG5vZGUsIGRhdGEudGFnLCBkYXRhLmF0dHJzLCBjYWNoZWQuYXR0cnMsIG5hbWVzcGFjZSk7XHJcblx0XHRjYWNoZWQuY2hpbGRyZW4gPSBidWlsZChub2RlLCBkYXRhLnRhZywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGRhdGEuY2hpbGRyZW4sIGNhY2hlZC5jaGlsZHJlbiwgZmFsc2UsIDAsIGRhdGEuYXR0cnMuY29udGVudGVkaXRhYmxlID8gbm9kZSA6IGVkaXRhYmxlLCBuYW1lc3BhY2UsIGNvbmZpZ3MpO1xyXG5cdFx0Y2FjaGVkLm5vZGVzLmludGFjdCA9IHRydWU7XHJcblxyXG5cdFx0aWYgKGNvbnRyb2xsZXJzLmxlbmd0aCkge1xyXG5cdFx0XHRjYWNoZWQudmlld3MgPSB2aWV3cztcclxuXHRcdFx0Y2FjaGVkLmNvbnRyb2xsZXJzID0gY29udHJvbGxlcnM7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIG5vZGU7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBoYW5kbGVOb25leGlzdGVudE5vZGVzKGRhdGEsIHBhcmVudEVsZW1lbnQsIGluZGV4KSB7XHJcblx0XHR2YXIgbm9kZXM7XHJcblx0XHRpZiAoZGF0YS4kdHJ1c3RlZCkge1xyXG5cdFx0XHRub2RlcyA9IGluamVjdEhUTUwocGFyZW50RWxlbWVudCwgaW5kZXgsIGRhdGEpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdG5vZGVzID0gWyRkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShkYXRhKV07XHJcblx0XHRcdGlmICghcGFyZW50RWxlbWVudC5ub2RlTmFtZS5tYXRjaCh2b2lkRWxlbWVudHMpKSBpbnNlcnROb2RlKHBhcmVudEVsZW1lbnQsIG5vZGVzWzBdLCBpbmRleCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGNhY2hlZCA9IHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBkYXRhID09PSBcIm51bWJlclwiIHx8IHR5cGVvZiBkYXRhID09PSBcImJvb2xlYW5cIiA/IG5ldyBkYXRhLmNvbnN0cnVjdG9yKGRhdGEpIDogZGF0YTtcclxuXHRcdGNhY2hlZC5ub2RlcyA9IG5vZGVzO1xyXG5cdFx0cmV0dXJuIGNhY2hlZDtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIHJlYXR0YWNoTm9kZXMoZGF0YSwgY2FjaGVkLCBwYXJlbnRFbGVtZW50LCBlZGl0YWJsZSwgaW5kZXgsIHBhcmVudFRhZykge1xyXG5cdFx0dmFyIG5vZGVzID0gY2FjaGVkLm5vZGVzO1xyXG5cdFx0aWYgKCFlZGl0YWJsZSB8fCBlZGl0YWJsZSAhPT0gJGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpIHtcclxuXHRcdFx0aWYgKGRhdGEuJHRydXN0ZWQpIHtcclxuXHRcdFx0XHRjbGVhcihub2RlcywgY2FjaGVkKTtcclxuXHRcdFx0XHRub2RlcyA9IGluamVjdEhUTUwocGFyZW50RWxlbWVudCwgaW5kZXgsIGRhdGEpO1xyXG5cdFx0XHR9XHJcblx0XHRcdC8vY29ybmVyIGNhc2U6IHJlcGxhY2luZyB0aGUgbm9kZVZhbHVlIG9mIGEgdGV4dCBub2RlIHRoYXQgaXMgYSBjaGlsZCBvZiBhIHRleHRhcmVhL2NvbnRlbnRlZGl0YWJsZSBkb2Vzbid0IHdvcmtcclxuXHRcdFx0Ly93ZSBuZWVkIHRvIHVwZGF0ZSB0aGUgdmFsdWUgcHJvcGVydHkgb2YgdGhlIHBhcmVudCB0ZXh0YXJlYSBvciB0aGUgaW5uZXJIVE1MIG9mIHRoZSBjb250ZW50ZWRpdGFibGUgZWxlbWVudCBpbnN0ZWFkXHJcblx0XHRcdGVsc2UgaWYgKHBhcmVudFRhZyA9PT0gXCJ0ZXh0YXJlYVwiKSB7XHJcblx0XHRcdFx0cGFyZW50RWxlbWVudC52YWx1ZSA9IGRhdGE7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZiAoZWRpdGFibGUpIHtcclxuXHRcdFx0XHRlZGl0YWJsZS5pbm5lckhUTUwgPSBkYXRhO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdC8vd2FzIGEgdHJ1c3RlZCBzdHJpbmdcclxuXHRcdFx0XHRpZiAobm9kZXNbMF0ubm9kZVR5cGUgPT09IDEgfHwgbm9kZXMubGVuZ3RoID4gMSkge1xyXG5cdFx0XHRcdFx0Y2xlYXIoY2FjaGVkLm5vZGVzLCBjYWNoZWQpO1xyXG5cdFx0XHRcdFx0bm9kZXMgPSBbJGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGRhdGEpXTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0aW5qZWN0VGV4dE5vZGUocGFyZW50RWxlbWVudCwgbm9kZXNbMF0sIGluZGV4LCBkYXRhKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0Y2FjaGVkID0gbmV3IGRhdGEuY29uc3RydWN0b3IoZGF0YSk7XHJcblx0XHRjYWNoZWQubm9kZXMgPSBub2RlcztcclxuXHRcdHJldHVybiBjYWNoZWQ7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBoYW5kbGVUZXh0KGNhY2hlZCwgZGF0YSwgaW5kZXgsIHBhcmVudEVsZW1lbnQsIHNob3VsZFJlYXR0YWNoLCBlZGl0YWJsZSwgcGFyZW50VGFnKSB7XHJcblx0XHQvL2hhbmRsZSB0ZXh0IG5vZGVzXHJcblx0XHRyZXR1cm4gY2FjaGVkLm5vZGVzLmxlbmd0aCA9PT0gMCA/IGhhbmRsZU5vbmV4aXN0ZW50Tm9kZXMoZGF0YSwgcGFyZW50RWxlbWVudCwgaW5kZXgpIDpcclxuXHRcdFx0Y2FjaGVkLnZhbHVlT2YoKSAhPT0gZGF0YS52YWx1ZU9mKCkgfHwgc2hvdWxkUmVhdHRhY2ggPT09IHRydWUgP1xyXG5cdFx0XHRcdHJlYXR0YWNoTm9kZXMoZGF0YSwgY2FjaGVkLCBwYXJlbnRFbGVtZW50LCBlZGl0YWJsZSwgaW5kZXgsIHBhcmVudFRhZykgOlxyXG5cdFx0XHQoY2FjaGVkLm5vZGVzLmludGFjdCA9IHRydWUsIGNhY2hlZCk7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBnZXRTdWJBcnJheUNvdW50KGl0ZW0pIHtcclxuXHRcdGlmIChpdGVtLiR0cnVzdGVkKSB7XHJcblx0XHRcdC8vZml4IG9mZnNldCBvZiBuZXh0IGVsZW1lbnQgaWYgaXRlbSB3YXMgYSB0cnVzdGVkIHN0cmluZyB3LyBtb3JlIHRoYW4gb25lIGh0bWwgZWxlbWVudFxyXG5cdFx0XHQvL3RoZSBmaXJzdCBjbGF1c2UgaW4gdGhlIHJlZ2V4cCBtYXRjaGVzIGVsZW1lbnRzXHJcblx0XHRcdC8vdGhlIHNlY29uZCBjbGF1c2UgKGFmdGVyIHRoZSBwaXBlKSBtYXRjaGVzIHRleHQgbm9kZXNcclxuXHRcdFx0dmFyIG1hdGNoID0gaXRlbS5tYXRjaCgvPFteXFwvXXxcXD5cXHMqW148XS9nKTtcclxuXHRcdFx0aWYgKG1hdGNoICE9IG51bGwpIHJldHVybiBtYXRjaC5sZW5ndGg7XHJcblx0XHR9XHJcblx0XHRlbHNlIGlmIChpc0FycmF5KGl0ZW0pKSB7XHJcblx0XHRcdHJldHVybiBpdGVtLmxlbmd0aDtcclxuXHRcdH1cclxuXHRcdHJldHVybiAxO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gYnVpbGRBcnJheShkYXRhLCBjYWNoZWQsIHBhcmVudEVsZW1lbnQsIGluZGV4LCBwYXJlbnRUYWcsIHNob3VsZFJlYXR0YWNoLCBlZGl0YWJsZSwgbmFtZXNwYWNlLCBjb25maWdzKSB7XHJcblx0XHRkYXRhID0gZmxhdHRlbihkYXRhKTtcclxuXHRcdHZhciBub2RlcyA9IFtdLCBpbnRhY3QgPSBjYWNoZWQubGVuZ3RoID09PSBkYXRhLmxlbmd0aCwgc3ViQXJyYXlDb3VudCA9IDA7XHJcblxyXG5cdFx0Ly9rZXlzIGFsZ29yaXRobTogc29ydCBlbGVtZW50cyB3aXRob3V0IHJlY3JlYXRpbmcgdGhlbSBpZiBrZXlzIGFyZSBwcmVzZW50XHJcblx0XHQvLzEpIGNyZWF0ZSBhIG1hcCBvZiBhbGwgZXhpc3Rpbmcga2V5cywgYW5kIG1hcmsgYWxsIGZvciBkZWxldGlvblxyXG5cdFx0Ly8yKSBhZGQgbmV3IGtleXMgdG8gbWFwIGFuZCBtYXJrIHRoZW0gZm9yIGFkZGl0aW9uXHJcblx0XHQvLzMpIGlmIGtleSBleGlzdHMgaW4gbmV3IGxpc3QsIGNoYW5nZSBhY3Rpb24gZnJvbSBkZWxldGlvbiB0byBhIG1vdmVcclxuXHRcdC8vNCkgZm9yIGVhY2gga2V5LCBoYW5kbGUgaXRzIGNvcnJlc3BvbmRpbmcgYWN0aW9uIGFzIG1hcmtlZCBpbiBwcmV2aW91cyBzdGVwc1xyXG5cdFx0dmFyIGV4aXN0aW5nID0ge30sIHNob3VsZE1haW50YWluSWRlbnRpdGllcyA9IGZhbHNlO1xyXG5cdFx0Zm9yS2V5cyhjYWNoZWQsIGZ1bmN0aW9uIChhdHRycywgaSkge1xyXG5cdFx0XHRzaG91bGRNYWludGFpbklkZW50aXRpZXMgPSB0cnVlO1xyXG5cdFx0XHRleGlzdGluZ1tjYWNoZWRbaV0uYXR0cnMua2V5XSA9IHthY3Rpb246IERFTEVUSU9OLCBpbmRleDogaX07XHJcblx0XHR9KTtcclxuXHJcblx0XHRidWlsZEFycmF5S2V5cyhkYXRhKTtcclxuXHRcdGlmIChzaG91bGRNYWludGFpbklkZW50aXRpZXMpIGNhY2hlZCA9IGRpZmZLZXlzKGRhdGEsIGNhY2hlZCwgZXhpc3RpbmcsIHBhcmVudEVsZW1lbnQpO1xyXG5cdFx0Ly9lbmQga2V5IGFsZ29yaXRobVxyXG5cclxuXHRcdHZhciBjYWNoZUNvdW50ID0gMDtcclxuXHRcdC8vZmFzdGVyIGV4cGxpY2l0bHkgd3JpdHRlblxyXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbiA9IGRhdGEubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0Ly9kaWZmIGVhY2ggaXRlbSBpbiB0aGUgYXJyYXlcclxuXHRcdFx0dmFyIGl0ZW0gPSBidWlsZChwYXJlbnRFbGVtZW50LCBwYXJlbnRUYWcsIGNhY2hlZCwgaW5kZXgsIGRhdGFbaV0sIGNhY2hlZFtjYWNoZUNvdW50XSwgc2hvdWxkUmVhdHRhY2gsIGluZGV4ICsgc3ViQXJyYXlDb3VudCB8fCBzdWJBcnJheUNvdW50LCBlZGl0YWJsZSwgbmFtZXNwYWNlLCBjb25maWdzKTtcclxuXHJcblx0XHRcdGlmIChpdGVtICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0XHRpbnRhY3QgPSBpbnRhY3QgJiYgaXRlbS5ub2Rlcy5pbnRhY3Q7XHJcblx0XHRcdFx0c3ViQXJyYXlDb3VudCArPSBnZXRTdWJBcnJheUNvdW50KGl0ZW0pO1xyXG5cdFx0XHRcdGNhY2hlZFtjYWNoZUNvdW50KytdID0gaXRlbTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGlmICghaW50YWN0KSBkaWZmQXJyYXkoZGF0YSwgY2FjaGVkLCBub2Rlcyk7XHJcblx0XHRyZXR1cm4gY2FjaGVkXHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBtYWtlQ2FjaGUoZGF0YSwgY2FjaGVkLCBpbmRleCwgcGFyZW50SW5kZXgsIHBhcmVudENhY2hlKSB7XHJcblx0XHRpZiAoY2FjaGVkICE9IG51bGwpIHtcclxuXHRcdFx0aWYgKHR5cGUuY2FsbChjYWNoZWQpID09PSB0eXBlLmNhbGwoZGF0YSkpIHJldHVybiBjYWNoZWQ7XHJcblxyXG5cdFx0XHRpZiAocGFyZW50Q2FjaGUgJiYgcGFyZW50Q2FjaGUubm9kZXMpIHtcclxuXHRcdFx0XHR2YXIgb2Zmc2V0ID0gaW5kZXggLSBwYXJlbnRJbmRleCwgZW5kID0gb2Zmc2V0ICsgKGlzQXJyYXkoZGF0YSkgPyBkYXRhIDogY2FjaGVkLm5vZGVzKS5sZW5ndGg7XHJcblx0XHRcdFx0Y2xlYXIocGFyZW50Q2FjaGUubm9kZXMuc2xpY2Uob2Zmc2V0LCBlbmQpLCBwYXJlbnRDYWNoZS5zbGljZShvZmZzZXQsIGVuZCkpO1xyXG5cdFx0XHR9IGVsc2UgaWYgKGNhY2hlZC5ub2Rlcykge1xyXG5cdFx0XHRcdGNsZWFyKGNhY2hlZC5ub2RlcywgY2FjaGVkKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGNhY2hlZCA9IG5ldyBkYXRhLmNvbnN0cnVjdG9yKCk7XHJcblx0XHQvL2lmIGNvbnN0cnVjdG9yIGNyZWF0ZXMgYSB2aXJ0dWFsIGRvbSBlbGVtZW50LCB1c2UgYSBibGFuayBvYmplY3RcclxuXHRcdC8vYXMgdGhlIGJhc2UgY2FjaGVkIG5vZGUgaW5zdGVhZCBvZiBjb3B5aW5nIHRoZSB2aXJ0dWFsIGVsICgjMjc3KVxyXG5cdFx0aWYgKGNhY2hlZC50YWcpIGNhY2hlZCA9IHt9O1xyXG5cdFx0Y2FjaGVkLm5vZGVzID0gW107XHJcblx0XHRyZXR1cm4gY2FjaGVkO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gY29uc3RydWN0Tm9kZShkYXRhLCBuYW1lc3BhY2UpIHtcclxuXHRcdHJldHVybiBuYW1lc3BhY2UgPT09IHVuZGVmaW5lZCA/XHJcblx0XHRcdGRhdGEuYXR0cnMuaXMgPyAkZG9jdW1lbnQuY3JlYXRlRWxlbWVudChkYXRhLnRhZywgZGF0YS5hdHRycy5pcykgOiAkZG9jdW1lbnQuY3JlYXRlRWxlbWVudChkYXRhLnRhZykgOlxyXG5cdFx0XHRkYXRhLmF0dHJzLmlzID8gJGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhuYW1lc3BhY2UsIGRhdGEudGFnLCBkYXRhLmF0dHJzLmlzKSA6ICRkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlLCBkYXRhLnRhZyk7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBjb25zdHJ1Y3RBdHRycyhkYXRhLCBub2RlLCBuYW1lc3BhY2UsIGhhc0tleXMpIHtcclxuXHRcdHJldHVybiBoYXNLZXlzID8gc2V0QXR0cmlidXRlcyhub2RlLCBkYXRhLnRhZywgZGF0YS5hdHRycywge30sIG5hbWVzcGFjZSkgOiBkYXRhLmF0dHJzO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gY29uc3RydWN0Q2hpbGRyZW4oZGF0YSwgbm9kZSwgY2FjaGVkLCBlZGl0YWJsZSwgbmFtZXNwYWNlLCBjb25maWdzKSB7XHJcblx0XHRyZXR1cm4gZGF0YS5jaGlsZHJlbiAhPSBudWxsICYmIGRhdGEuY2hpbGRyZW4ubGVuZ3RoID4gMCA/XHJcblx0XHRcdGJ1aWxkKG5vZGUsIGRhdGEudGFnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZGF0YS5jaGlsZHJlbiwgY2FjaGVkLmNoaWxkcmVuLCB0cnVlLCAwLCBkYXRhLmF0dHJzLmNvbnRlbnRlZGl0YWJsZSA/IG5vZGUgOiBlZGl0YWJsZSwgbmFtZXNwYWNlLCBjb25maWdzKSA6XHJcblx0XHRcdGRhdGEuY2hpbGRyZW47XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiByZWNvbnN0cnVjdENhY2hlZChkYXRhLCBhdHRycywgY2hpbGRyZW4sIG5vZGUsIG5hbWVzcGFjZSwgdmlld3MsIGNvbnRyb2xsZXJzKSB7XHJcblx0XHR2YXIgY2FjaGVkID0ge3RhZzogZGF0YS50YWcsIGF0dHJzOiBhdHRycywgY2hpbGRyZW46IGNoaWxkcmVuLCBub2RlczogW25vZGVdfTtcclxuXHRcdHVubG9hZENhY2hlZENvbnRyb2xsZXJzKGNhY2hlZCwgdmlld3MsIGNvbnRyb2xsZXJzKTtcclxuXHRcdGlmIChjYWNoZWQuY2hpbGRyZW4gJiYgIWNhY2hlZC5jaGlsZHJlbi5ub2RlcykgY2FjaGVkLmNoaWxkcmVuLm5vZGVzID0gW107XHJcblx0XHQvL2VkZ2UgY2FzZTogc2V0dGluZyB2YWx1ZSBvbiA8c2VsZWN0PiBkb2Vzbid0IHdvcmsgYmVmb3JlIGNoaWxkcmVuIGV4aXN0LCBzbyBzZXQgaXQgYWdhaW4gYWZ0ZXIgY2hpbGRyZW4gaGF2ZSBiZWVuIGNyZWF0ZWRcclxuXHRcdGlmIChkYXRhLnRhZyA9PT0gXCJzZWxlY3RcIiAmJiBcInZhbHVlXCIgaW4gZGF0YS5hdHRycykgc2V0QXR0cmlidXRlcyhub2RlLCBkYXRhLnRhZywge3ZhbHVlOiBkYXRhLmF0dHJzLnZhbHVlfSwge30sIG5hbWVzcGFjZSk7XHJcblx0XHRyZXR1cm4gY2FjaGVkXHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBnZXRDb250cm9sbGVyKHZpZXdzLCB2aWV3LCBjYWNoZWRDb250cm9sbGVycywgY29udHJvbGxlcikge1xyXG5cdFx0dmFyIGNvbnRyb2xsZXJJbmRleCA9IG0ucmVkcmF3LnN0cmF0ZWd5KCkgPT09IFwiZGlmZlwiICYmIHZpZXdzID8gdmlld3MuaW5kZXhPZih2aWV3KSA6IC0xO1xyXG5cdFx0cmV0dXJuIGNvbnRyb2xsZXJJbmRleCA+IC0xID8gY2FjaGVkQ29udHJvbGxlcnNbY29udHJvbGxlckluZGV4XSA6XHJcblx0XHRcdHR5cGVvZiBjb250cm9sbGVyID09PSBcImZ1bmN0aW9uXCIgPyBuZXcgY29udHJvbGxlcigpIDoge307XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiB1cGRhdGVMaXN0cyh2aWV3cywgY29udHJvbGxlcnMsIHZpZXcsIGNvbnRyb2xsZXIpIHtcclxuXHRcdGlmIChjb250cm9sbGVyLm9udW5sb2FkICE9IG51bGwpIHVubG9hZGVycy5wdXNoKHtjb250cm9sbGVyOiBjb250cm9sbGVyLCBoYW5kbGVyOiBjb250cm9sbGVyLm9udW5sb2FkfSk7XHJcblx0XHR2aWV3cy5wdXNoKHZpZXcpO1xyXG5cdFx0Y29udHJvbGxlcnMucHVzaChjb250cm9sbGVyKTtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGNoZWNrVmlldyhkYXRhLCB2aWV3LCBjYWNoZWQsIGNhY2hlZENvbnRyb2xsZXJzLCBjb250cm9sbGVycywgdmlld3MpIHtcclxuXHRcdHZhciBjb250cm9sbGVyID0gZ2V0Q29udHJvbGxlcihjYWNoZWQudmlld3MsIHZpZXcsIGNhY2hlZENvbnRyb2xsZXJzLCBkYXRhLmNvbnRyb2xsZXIpO1xyXG5cdFx0Ly9GYXN0ZXIgdG8gY29lcmNlIHRvIG51bWJlciBhbmQgY2hlY2sgZm9yIE5hTlxyXG5cdFx0dmFyIGtleSA9ICsoZGF0YSAmJiBkYXRhLmF0dHJzICYmIGRhdGEuYXR0cnMua2V5KTtcclxuXHRcdGRhdGEgPSBwZW5kaW5nUmVxdWVzdHMgPT09IDAgfHwgZm9yY2luZyB8fCBjYWNoZWRDb250cm9sbGVycyAmJiBjYWNoZWRDb250cm9sbGVycy5pbmRleE9mKGNvbnRyb2xsZXIpID4gLTEgPyBkYXRhLnZpZXcoY29udHJvbGxlcikgOiB7dGFnOiBcInBsYWNlaG9sZGVyXCJ9O1xyXG5cdFx0aWYgKGRhdGEuc3VidHJlZSA9PT0gXCJyZXRhaW5cIikgcmV0dXJuIGNhY2hlZDtcclxuXHRcdGlmIChrZXkgPT09IGtleSkgKGRhdGEuYXR0cnMgPSBkYXRhLmF0dHJzIHx8IHt9KS5rZXkgPSBrZXk7XHJcblx0XHR1cGRhdGVMaXN0cyh2aWV3cywgY29udHJvbGxlcnMsIHZpZXcsIGNvbnRyb2xsZXIpO1xyXG5cdFx0cmV0dXJuIGRhdGE7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBtYXJrVmlld3MoZGF0YSwgY2FjaGVkLCB2aWV3cywgY29udHJvbGxlcnMpIHtcclxuXHRcdHZhciBjYWNoZWRDb250cm9sbGVycyA9IGNhY2hlZCAmJiBjYWNoZWQuY29udHJvbGxlcnM7XHJcblx0XHR3aGlsZSAoZGF0YS52aWV3ICE9IG51bGwpIGRhdGEgPSBjaGVja1ZpZXcoZGF0YSwgZGF0YS52aWV3LiRvcmlnaW5hbCB8fCBkYXRhLnZpZXcsIGNhY2hlZCwgY2FjaGVkQ29udHJvbGxlcnMsIGNvbnRyb2xsZXJzLCB2aWV3cyk7XHJcblx0XHRyZXR1cm4gZGF0YTtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGJ1aWxkT2JqZWN0KGRhdGEsIGNhY2hlZCwgZWRpdGFibGUsIHBhcmVudEVsZW1lbnQsIGluZGV4LCBzaG91bGRSZWF0dGFjaCwgbmFtZXNwYWNlLCBjb25maWdzKSB7XHJcblx0XHR2YXIgdmlld3MgPSBbXSwgY29udHJvbGxlcnMgPSBbXTtcclxuXHRcdGRhdGEgPSBtYXJrVmlld3MoZGF0YSwgY2FjaGVkLCB2aWV3cywgY29udHJvbGxlcnMpO1xyXG5cdFx0aWYgKCFkYXRhLnRhZyAmJiBjb250cm9sbGVycy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcihcIkNvbXBvbmVudCB0ZW1wbGF0ZSBtdXN0IHJldHVybiBhIHZpcnR1YWwgZWxlbWVudCwgbm90IGFuIGFycmF5LCBzdHJpbmcsIGV0Yy5cIik7XHJcblx0XHRkYXRhLmF0dHJzID0gZGF0YS5hdHRycyB8fCB7fTtcclxuXHRcdGNhY2hlZC5hdHRycyA9IGNhY2hlZC5hdHRycyB8fCB7fTtcclxuXHRcdHZhciBkYXRhQXR0cktleXMgPSBPYmplY3Qua2V5cyhkYXRhLmF0dHJzKTtcclxuXHRcdHZhciBoYXNLZXlzID0gZGF0YUF0dHJLZXlzLmxlbmd0aCA+IChcImtleVwiIGluIGRhdGEuYXR0cnMgPyAxIDogMCk7XHJcblx0XHRtYXliZVJlY3JlYXRlT2JqZWN0KGRhdGEsIGNhY2hlZCwgZGF0YUF0dHJLZXlzKTtcclxuXHRcdGlmICghaXNTdHJpbmcoZGF0YS50YWcpKSByZXR1cm47XHJcblx0XHR2YXIgaXNOZXcgPSBjYWNoZWQubm9kZXMubGVuZ3RoID09PSAwO1xyXG5cdFx0bmFtZXNwYWNlID0gZ2V0T2JqZWN0TmFtZXNwYWNlKGRhdGEsIG5hbWVzcGFjZSk7XHJcblx0XHR2YXIgbm9kZTtcclxuXHRcdGlmIChpc05ldykge1xyXG5cdFx0XHRub2RlID0gY29uc3RydWN0Tm9kZShkYXRhLCBuYW1lc3BhY2UpO1xyXG5cdFx0XHQvL3NldCBhdHRyaWJ1dGVzIGZpcnN0LCB0aGVuIGNyZWF0ZSBjaGlsZHJlblxyXG5cdFx0XHR2YXIgYXR0cnMgPSBjb25zdHJ1Y3RBdHRycyhkYXRhLCBub2RlLCBuYW1lc3BhY2UsIGhhc0tleXMpXHJcblx0XHRcdHZhciBjaGlsZHJlbiA9IGNvbnN0cnVjdENoaWxkcmVuKGRhdGEsIG5vZGUsIGNhY2hlZCwgZWRpdGFibGUsIG5hbWVzcGFjZSwgY29uZmlncyk7XHJcblx0XHRcdGNhY2hlZCA9IHJlY29uc3RydWN0Q2FjaGVkKGRhdGEsIGF0dHJzLCBjaGlsZHJlbiwgbm9kZSwgbmFtZXNwYWNlLCB2aWV3cywgY29udHJvbGxlcnMpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdG5vZGUgPSBidWlsZFVwZGF0ZWROb2RlKGNhY2hlZCwgZGF0YSwgZWRpdGFibGUsIGhhc0tleXMsIG5hbWVzcGFjZSwgdmlld3MsIGNvbmZpZ3MsIGNvbnRyb2xsZXJzKTtcclxuXHRcdH1cclxuXHRcdGlmIChpc05ldyB8fCBzaG91bGRSZWF0dGFjaCA9PT0gdHJ1ZSAmJiBub2RlICE9IG51bGwpIGluc2VydE5vZGUocGFyZW50RWxlbWVudCwgbm9kZSwgaW5kZXgpO1xyXG5cdFx0Ly9zY2hlZHVsZSBjb25maWdzIHRvIGJlIGNhbGxlZC4gVGhleSBhcmUgY2FsbGVkIGFmdGVyIGBidWlsZGBcclxuXHRcdC8vZmluaXNoZXMgcnVubmluZ1xyXG5cdFx0c2NoZWR1bGVDb25maWdzVG9CZUNhbGxlZChjb25maWdzLCBkYXRhLCBub2RlLCBpc05ldywgY2FjaGVkKTtcclxuXHRcdHJldHVybiBjYWNoZWRcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGJ1aWxkKHBhcmVudEVsZW1lbnQsIHBhcmVudFRhZywgcGFyZW50Q2FjaGUsIHBhcmVudEluZGV4LCBkYXRhLCBjYWNoZWQsIHNob3VsZFJlYXR0YWNoLCBpbmRleCwgZWRpdGFibGUsIG5hbWVzcGFjZSwgY29uZmlncykge1xyXG5cdFx0Ly9gYnVpbGRgIGlzIGEgcmVjdXJzaXZlIGZ1bmN0aW9uIHRoYXQgbWFuYWdlcyBjcmVhdGlvbi9kaWZmaW5nL3JlbW92YWxcclxuXHRcdC8vb2YgRE9NIGVsZW1lbnRzIGJhc2VkIG9uIGNvbXBhcmlzb24gYmV0d2VlbiBgZGF0YWAgYW5kIGBjYWNoZWRgXHJcblx0XHQvL3RoZSBkaWZmIGFsZ29yaXRobSBjYW4gYmUgc3VtbWFyaXplZCBhcyB0aGlzOlxyXG5cdFx0Ly8xIC0gY29tcGFyZSBgZGF0YWAgYW5kIGBjYWNoZWRgXHJcblx0XHQvLzIgLSBpZiB0aGV5IGFyZSBkaWZmZXJlbnQsIGNvcHkgYGRhdGFgIHRvIGBjYWNoZWRgIGFuZCB1cGRhdGUgdGhlIERPTVxyXG5cdFx0Ly8gICAgYmFzZWQgb24gd2hhdCB0aGUgZGlmZmVyZW5jZSBpc1xyXG5cdFx0Ly8zIC0gcmVjdXJzaXZlbHkgYXBwbHkgdGhpcyBhbGdvcml0aG0gZm9yIGV2ZXJ5IGFycmF5IGFuZCBmb3IgdGhlXHJcblx0XHQvLyAgICBjaGlsZHJlbiBvZiBldmVyeSB2aXJ0dWFsIGVsZW1lbnRcclxuXHJcblx0XHQvL3RoZSBgY2FjaGVkYCBkYXRhIHN0cnVjdHVyZSBpcyBlc3NlbnRpYWxseSB0aGUgc2FtZSBhcyB0aGUgcHJldmlvdXNcclxuXHRcdC8vcmVkcmF3J3MgYGRhdGFgIGRhdGEgc3RydWN0dXJlLCB3aXRoIGEgZmV3IGFkZGl0aW9uczpcclxuXHRcdC8vLSBgY2FjaGVkYCBhbHdheXMgaGFzIGEgcHJvcGVydHkgY2FsbGVkIGBub2Rlc2AsIHdoaWNoIGlzIGEgbGlzdCBvZlxyXG5cdFx0Ly8gICBET00gZWxlbWVudHMgdGhhdCBjb3JyZXNwb25kIHRvIHRoZSBkYXRhIHJlcHJlc2VudGVkIGJ5IHRoZVxyXG5cdFx0Ly8gICByZXNwZWN0aXZlIHZpcnR1YWwgZWxlbWVudFxyXG5cdFx0Ly8tIGluIG9yZGVyIHRvIHN1cHBvcnQgYXR0YWNoaW5nIGBub2Rlc2AgYXMgYSBwcm9wZXJ0eSBvZiBgY2FjaGVkYCxcclxuXHRcdC8vICAgYGNhY2hlZGAgaXMgKmFsd2F5cyogYSBub24tcHJpbWl0aXZlIG9iamVjdCwgaS5lLiBpZiB0aGUgZGF0YSB3YXNcclxuXHRcdC8vICAgYSBzdHJpbmcsIHRoZW4gY2FjaGVkIGlzIGEgU3RyaW5nIGluc3RhbmNlLiBJZiBkYXRhIHdhcyBgbnVsbGAgb3JcclxuXHRcdC8vICAgYHVuZGVmaW5lZGAsIGNhY2hlZCBpcyBgbmV3IFN0cmluZyhcIlwiKWBcclxuXHRcdC8vLSBgY2FjaGVkIGFsc28gaGFzIGEgYGNvbmZpZ0NvbnRleHRgIHByb3BlcnR5LCB3aGljaCBpcyB0aGUgc3RhdGVcclxuXHRcdC8vICAgc3RvcmFnZSBvYmplY3QgZXhwb3NlZCBieSBjb25maWcoZWxlbWVudCwgaXNJbml0aWFsaXplZCwgY29udGV4dClcclxuXHRcdC8vLSB3aGVuIGBjYWNoZWRgIGlzIGFuIE9iamVjdCwgaXQgcmVwcmVzZW50cyBhIHZpcnR1YWwgZWxlbWVudDsgd2hlblxyXG5cdFx0Ly8gICBpdCdzIGFuIEFycmF5LCBpdCByZXByZXNlbnRzIGEgbGlzdCBvZiBlbGVtZW50czsgd2hlbiBpdCdzIGFcclxuXHRcdC8vICAgU3RyaW5nLCBOdW1iZXIgb3IgQm9vbGVhbiwgaXQgcmVwcmVzZW50cyBhIHRleHQgbm9kZVxyXG5cclxuXHRcdC8vYHBhcmVudEVsZW1lbnRgIGlzIGEgRE9NIGVsZW1lbnQgdXNlZCBmb3IgVzNDIERPTSBBUEkgY2FsbHNcclxuXHRcdC8vYHBhcmVudFRhZ2AgaXMgb25seSB1c2VkIGZvciBoYW5kbGluZyBhIGNvcm5lciBjYXNlIGZvciB0ZXh0YXJlYVxyXG5cdFx0Ly92YWx1ZXNcclxuXHRcdC8vYHBhcmVudENhY2hlYCBpcyB1c2VkIHRvIHJlbW92ZSBub2RlcyBpbiBzb21lIG11bHRpLW5vZGUgY2FzZXNcclxuXHRcdC8vYHBhcmVudEluZGV4YCBhbmQgYGluZGV4YCBhcmUgdXNlZCB0byBmaWd1cmUgb3V0IHRoZSBvZmZzZXQgb2Ygbm9kZXMuXHJcblx0XHQvL1RoZXkncmUgYXJ0aWZhY3RzIGZyb20gYmVmb3JlIGFycmF5cyBzdGFydGVkIGJlaW5nIGZsYXR0ZW5lZCBhbmQgYXJlXHJcblx0XHQvL2xpa2VseSByZWZhY3RvcmFibGVcclxuXHRcdC8vYGRhdGFgIGFuZCBgY2FjaGVkYCBhcmUsIHJlc3BlY3RpdmVseSwgdGhlIG5ldyBhbmQgb2xkIG5vZGVzIGJlaW5nXHJcblx0XHQvL2RpZmZlZFxyXG5cdFx0Ly9gc2hvdWxkUmVhdHRhY2hgIGlzIGEgZmxhZyBpbmRpY2F0aW5nIHdoZXRoZXIgYSBwYXJlbnQgbm9kZSB3YXNcclxuXHRcdC8vcmVjcmVhdGVkIChpZiBzbywgYW5kIGlmIHRoaXMgbm9kZSBpcyByZXVzZWQsIHRoZW4gdGhpcyBub2RlIG11c3RcclxuXHRcdC8vcmVhdHRhY2ggaXRzZWxmIHRvIHRoZSBuZXcgcGFyZW50KVxyXG5cdFx0Ly9gZWRpdGFibGVgIGlzIGEgZmxhZyB0aGF0IGluZGljYXRlcyB3aGV0aGVyIGFuIGFuY2VzdG9yIGlzXHJcblx0XHQvL2NvbnRlbnRlZGl0YWJsZVxyXG5cdFx0Ly9gbmFtZXNwYWNlYCBpbmRpY2F0ZXMgdGhlIGNsb3Nlc3QgSFRNTCBuYW1lc3BhY2UgYXMgaXQgY2FzY2FkZXMgZG93blxyXG5cdFx0Ly9mcm9tIGFuIGFuY2VzdG9yXHJcblx0XHQvL2Bjb25maWdzYCBpcyBhIGxpc3Qgb2YgY29uZmlnIGZ1bmN0aW9ucyB0byBydW4gYWZ0ZXIgdGhlIHRvcG1vc3RcclxuXHRcdC8vYGJ1aWxkYCBjYWxsIGZpbmlzaGVzIHJ1bm5pbmdcclxuXHJcblx0XHQvL3RoZXJlJ3MgbG9naWMgdGhhdCByZWxpZXMgb24gdGhlIGFzc3VtcHRpb24gdGhhdCBudWxsIGFuZCB1bmRlZmluZWRcclxuXHRcdC8vZGF0YSBhcmUgZXF1aXZhbGVudCB0byBlbXB0eSBzdHJpbmdzXHJcblx0XHQvLy0gdGhpcyBwcmV2ZW50cyBsaWZlY3ljbGUgc3VycHJpc2VzIGZyb20gcHJvY2VkdXJhbCBoZWxwZXJzIHRoYXQgbWl4XHJcblx0XHQvLyAgaW1wbGljaXQgYW5kIGV4cGxpY2l0IHJldHVybiBzdGF0ZW1lbnRzIChlLmcuXHJcblx0XHQvLyAgZnVuY3Rpb24gZm9vKCkge2lmIChjb25kKSByZXR1cm4gbShcImRpdlwiKX1cclxuXHRcdC8vLSBpdCBzaW1wbGlmaWVzIGRpZmZpbmcgY29kZVxyXG5cdFx0ZGF0YSA9IGRhdGFUb1N0cmluZyhkYXRhKTtcclxuXHRcdGlmIChkYXRhLnN1YnRyZWUgPT09IFwicmV0YWluXCIpIHJldHVybiBjYWNoZWQ7XHJcblx0XHRjYWNoZWQgPSBtYWtlQ2FjaGUoZGF0YSwgY2FjaGVkLCBpbmRleCwgcGFyZW50SW5kZXgsIHBhcmVudENhY2hlKTtcclxuXHRcdHJldHVybiBpc0FycmF5KGRhdGEpID8gYnVpbGRBcnJheShkYXRhLCBjYWNoZWQsIHBhcmVudEVsZW1lbnQsIGluZGV4LCBwYXJlbnRUYWcsIHNob3VsZFJlYXR0YWNoLCBlZGl0YWJsZSwgbmFtZXNwYWNlLCBjb25maWdzKSA6XHJcblx0XHRcdGRhdGEgIT0gbnVsbCAmJiBpc09iamVjdChkYXRhKSA/IGJ1aWxkT2JqZWN0KGRhdGEsIGNhY2hlZCwgZWRpdGFibGUsIHBhcmVudEVsZW1lbnQsIGluZGV4LCBzaG91bGRSZWF0dGFjaCwgbmFtZXNwYWNlLCBjb25maWdzKSA6XHJcblx0XHRcdCFpc0Z1bmN0aW9uKGRhdGEpID8gaGFuZGxlVGV4dChjYWNoZWQsIGRhdGEsIGluZGV4LCBwYXJlbnRFbGVtZW50LCBzaG91bGRSZWF0dGFjaCwgZWRpdGFibGUsIHBhcmVudFRhZykgOlxyXG5cdFx0XHRjYWNoZWQ7XHJcblx0fVxyXG5cdGZ1bmN0aW9uIHNvcnRDaGFuZ2VzKGEsIGIpIHsgcmV0dXJuIGEuYWN0aW9uIC0gYi5hY3Rpb24gfHwgYS5pbmRleCAtIGIuaW5kZXg7IH1cclxuXHRmdW5jdGlvbiBzZXRBdHRyaWJ1dGVzKG5vZGUsIHRhZywgZGF0YUF0dHJzLCBjYWNoZWRBdHRycywgbmFtZXNwYWNlKSB7XHJcblx0XHRmb3IgKHZhciBhdHRyTmFtZSBpbiBkYXRhQXR0cnMpIHtcclxuXHRcdFx0dmFyIGRhdGFBdHRyID0gZGF0YUF0dHJzW2F0dHJOYW1lXTtcclxuXHRcdFx0dmFyIGNhY2hlZEF0dHIgPSBjYWNoZWRBdHRyc1thdHRyTmFtZV07XHJcblx0XHRcdGlmICghKGF0dHJOYW1lIGluIGNhY2hlZEF0dHJzKSB8fCAoY2FjaGVkQXR0ciAhPT0gZGF0YUF0dHIpKSB7XHJcblx0XHRcdFx0Y2FjaGVkQXR0cnNbYXR0ck5hbWVdID0gZGF0YUF0dHI7XHJcblx0XHRcdFx0Ly9gY29uZmlnYCBpc24ndCBhIHJlYWwgYXR0cmlidXRlcywgc28gaWdub3JlIGl0XHJcblx0XHRcdFx0aWYgKGF0dHJOYW1lID09PSBcImNvbmZpZ1wiIHx8IGF0dHJOYW1lID09PSBcImtleVwiKSBjb250aW51ZTtcclxuXHRcdFx0XHQvL2hvb2sgZXZlbnQgaGFuZGxlcnMgdG8gdGhlIGF1dG8tcmVkcmF3aW5nIHN5c3RlbVxyXG5cdFx0XHRcdGVsc2UgaWYgKGlzRnVuY3Rpb24oZGF0YUF0dHIpICYmIGF0dHJOYW1lLnNsaWNlKDAsIDIpID09PSBcIm9uXCIpIHtcclxuXHRcdFx0XHRub2RlW2F0dHJOYW1lXSA9IGF1dG9yZWRyYXcoZGF0YUF0dHIsIG5vZGUpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHQvL2hhbmRsZSBgc3R5bGU6IHsuLi59YFxyXG5cdFx0XHRcdGVsc2UgaWYgKGF0dHJOYW1lID09PSBcInN0eWxlXCIgJiYgZGF0YUF0dHIgIT0gbnVsbCAmJiBpc09iamVjdChkYXRhQXR0cikpIHtcclxuXHRcdFx0XHRmb3IgKHZhciBydWxlIGluIGRhdGFBdHRyKSB7XHJcblx0XHRcdFx0XHRcdGlmIChjYWNoZWRBdHRyID09IG51bGwgfHwgY2FjaGVkQXR0cltydWxlXSAhPT0gZGF0YUF0dHJbcnVsZV0pIG5vZGUuc3R5bGVbcnVsZV0gPSBkYXRhQXR0cltydWxlXTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0Zm9yICh2YXIgcnVsZSBpbiBjYWNoZWRBdHRyKSB7XHJcblx0XHRcdFx0XHRcdGlmICghKHJ1bGUgaW4gZGF0YUF0dHIpKSBub2RlLnN0eWxlW3J1bGVdID0gXCJcIjtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdC8vaGFuZGxlIFNWR1xyXG5cdFx0XHRcdGVsc2UgaWYgKG5hbWVzcGFjZSAhPSBudWxsKSB7XHJcblx0XHRcdFx0aWYgKGF0dHJOYW1lID09PSBcImhyZWZcIikgbm9kZS5zZXRBdHRyaWJ1dGVOUyhcImh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmtcIiwgXCJocmVmXCIsIGRhdGFBdHRyKTtcclxuXHRcdFx0XHRlbHNlIG5vZGUuc2V0QXR0cmlidXRlKGF0dHJOYW1lID09PSBcImNsYXNzTmFtZVwiID8gXCJjbGFzc1wiIDogYXR0ck5hbWUsIGRhdGFBdHRyKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0Ly9oYW5kbGUgY2FzZXMgdGhhdCBhcmUgcHJvcGVydGllcyAoYnV0IGlnbm9yZSBjYXNlcyB3aGVyZSB3ZSBzaG91bGQgdXNlIHNldEF0dHJpYnV0ZSBpbnN0ZWFkKVxyXG5cdFx0XHRcdC8vLSBsaXN0IGFuZCBmb3JtIGFyZSB0eXBpY2FsbHkgdXNlZCBhcyBzdHJpbmdzLCBidXQgYXJlIERPTSBlbGVtZW50IHJlZmVyZW5jZXMgaW4ganNcclxuXHRcdFx0XHQvLy0gd2hlbiB1c2luZyBDU1Mgc2VsZWN0b3JzIChlLmcuIGBtKFwiW3N0eWxlPScnXVwiKWApLCBzdHlsZSBpcyB1c2VkIGFzIGEgc3RyaW5nLCBidXQgaXQncyBhbiBvYmplY3QgaW4ganNcclxuXHRcdFx0XHRlbHNlIGlmIChhdHRyTmFtZSBpbiBub2RlICYmIGF0dHJOYW1lICE9PSBcImxpc3RcIiAmJiBhdHRyTmFtZSAhPT0gXCJzdHlsZVwiICYmIGF0dHJOYW1lICE9PSBcImZvcm1cIiAmJiBhdHRyTmFtZSAhPT0gXCJ0eXBlXCIgJiYgYXR0ck5hbWUgIT09IFwid2lkdGhcIiAmJiBhdHRyTmFtZSAhPT0gXCJoZWlnaHRcIikge1xyXG5cdFx0XHRcdC8vIzM0OCBkb24ndCBzZXQgdGhlIHZhbHVlIGlmIG5vdCBuZWVkZWQgb3RoZXJ3aXNlIGN1cnNvciBwbGFjZW1lbnQgYnJlYWtzIGluIENocm9tZVxyXG5cdFx0XHRcdGlmICh0YWcgIT09IFwiaW5wdXRcIiB8fCBub2RlW2F0dHJOYW1lXSAhPT0gZGF0YUF0dHIpIG5vZGVbYXR0ck5hbWVdID0gZGF0YUF0dHI7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2Ugbm9kZS5zZXRBdHRyaWJ1dGUoYXR0ck5hbWUsIGRhdGFBdHRyKTtcclxuXHRcdFx0fVxyXG5cdFx0XHQvLyMzNDggZGF0YUF0dHIgbWF5IG5vdCBiZSBhIHN0cmluZywgc28gdXNlIGxvb3NlIGNvbXBhcmlzb24gKGRvdWJsZSBlcXVhbCkgaW5zdGVhZCBvZiBzdHJpY3QgKHRyaXBsZSBlcXVhbClcclxuXHRcdFx0ZWxzZSBpZiAoYXR0ck5hbWUgPT09IFwidmFsdWVcIiAmJiB0YWcgPT09IFwiaW5wdXRcIiAmJiBub2RlLnZhbHVlICE9IGRhdGFBdHRyKSB7XHJcblx0XHRcdFx0bm9kZS52YWx1ZSA9IGRhdGFBdHRyO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gY2FjaGVkQXR0cnM7XHJcblx0fVxyXG5cdGZ1bmN0aW9uIGNsZWFyKG5vZGVzLCBjYWNoZWQpIHtcclxuXHRcdGZvciAodmFyIGkgPSBub2Rlcy5sZW5ndGggLSAxOyBpID4gLTE7IGktLSkge1xyXG5cdFx0XHRpZiAobm9kZXNbaV0gJiYgbm9kZXNbaV0ucGFyZW50Tm9kZSkge1xyXG5cdFx0XHRcdHRyeSB7IG5vZGVzW2ldLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZXNbaV0pOyB9XHJcblx0XHRcdFx0Y2F0Y2ggKGUpIHt9IC8vaWdub3JlIGlmIHRoaXMgZmFpbHMgZHVlIHRvIG9yZGVyIG9mIGV2ZW50cyAoc2VlIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjE5MjYwODMvZmFpbGVkLXRvLWV4ZWN1dGUtcmVtb3ZlY2hpbGQtb24tbm9kZSlcclxuXHRcdFx0XHRjYWNoZWQgPSBbXS5jb25jYXQoY2FjaGVkKTtcclxuXHRcdFx0XHRpZiAoY2FjaGVkW2ldKSB1bmxvYWQoY2FjaGVkW2ldKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0Ly9yZWxlYXNlIG1lbW9yeSBpZiBub2RlcyBpcyBhbiBhcnJheS4gVGhpcyBjaGVjayBzaG91bGQgZmFpbCBpZiBub2RlcyBpcyBhIE5vZGVMaXN0IChzZWUgbG9vcCBhYm92ZSlcclxuXHRcdGlmIChub2Rlcy5sZW5ndGgpIG5vZGVzLmxlbmd0aCA9IDA7XHJcblx0fVxyXG5cdGZ1bmN0aW9uIHVubG9hZChjYWNoZWQpIHtcclxuXHRcdGlmIChjYWNoZWQuY29uZmlnQ29udGV4dCAmJiBpc0Z1bmN0aW9uKGNhY2hlZC5jb25maWdDb250ZXh0Lm9udW5sb2FkKSkge1xyXG5cdFx0XHRjYWNoZWQuY29uZmlnQ29udGV4dC5vbnVubG9hZCgpO1xyXG5cdFx0XHRjYWNoZWQuY29uZmlnQ29udGV4dC5vbnVubG9hZCA9IG51bGw7XHJcblx0XHR9XHJcblx0XHRpZiAoY2FjaGVkLmNvbnRyb2xsZXJzKSB7XHJcblx0XHRcdGZvckVhY2goY2FjaGVkLmNvbnRyb2xsZXJzLCBmdW5jdGlvbiAoY29udHJvbGxlcikge1xyXG5cdFx0XHRcdGlmIChpc0Z1bmN0aW9uKGNvbnRyb2xsZXIub251bmxvYWQpKSBjb250cm9sbGVyLm9udW5sb2FkKHtwcmV2ZW50RGVmYXVsdDogbm9vcH0pO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdGlmIChjYWNoZWQuY2hpbGRyZW4pIHtcclxuXHRcdFx0aWYgKGlzQXJyYXkoY2FjaGVkLmNoaWxkcmVuKSkgZm9yRWFjaChjYWNoZWQuY2hpbGRyZW4sIHVubG9hZCk7XHJcblx0XHRcdGVsc2UgaWYgKGNhY2hlZC5jaGlsZHJlbi50YWcpIHVubG9hZChjYWNoZWQuY2hpbGRyZW4pO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0dmFyIGluc2VydEFkamFjZW50QmVmb3JlRW5kID0gKGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciByYW5nZVN0cmF0ZWd5ID0gZnVuY3Rpb24gKHBhcmVudEVsZW1lbnQsIGRhdGEpIHtcclxuXHRcdFx0cGFyZW50RWxlbWVudC5hcHBlbmRDaGlsZCgkZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKS5jcmVhdGVDb250ZXh0dWFsRnJhZ21lbnQoZGF0YSkpO1xyXG5cdFx0fTtcclxuXHRcdHZhciBpbnNlcnRBZGphY2VudFN0cmF0ZWd5ID0gZnVuY3Rpb24gKHBhcmVudEVsZW1lbnQsIGRhdGEpIHtcclxuXHRcdFx0cGFyZW50RWxlbWVudC5pbnNlcnRBZGphY2VudEhUTUwoXCJiZWZvcmVlbmRcIiwgZGF0YSk7XHJcblx0XHR9O1xyXG5cclxuXHRcdHRyeSB7XHJcblx0XHRcdCRkb2N1bWVudC5jcmVhdGVSYW5nZSgpLmNyZWF0ZUNvbnRleHR1YWxGcmFnbWVudCgneCcpO1xyXG5cdFx0XHRyZXR1cm4gcmFuZ2VTdHJhdGVneTtcclxuXHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0cmV0dXJuIGluc2VydEFkamFjZW50U3RyYXRlZ3k7XHJcblx0XHR9XHJcblx0fSkoKTtcclxuXHJcblx0ZnVuY3Rpb24gaW5qZWN0SFRNTChwYXJlbnRFbGVtZW50LCBpbmRleCwgZGF0YSkge1xyXG5cdFx0dmFyIG5leHRTaWJsaW5nID0gcGFyZW50RWxlbWVudC5jaGlsZE5vZGVzW2luZGV4XTtcclxuXHRcdGlmIChuZXh0U2libGluZykge1xyXG5cdFx0XHR2YXIgaXNFbGVtZW50ID0gbmV4dFNpYmxpbmcubm9kZVR5cGUgIT09IDE7XHJcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9ICRkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuXHRcdFx0aWYgKGlzRWxlbWVudCkge1xyXG5cdFx0XHRcdHBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHBsYWNlaG9sZGVyLCBuZXh0U2libGluZyB8fCBudWxsKTtcclxuXHRcdFx0XHRwbGFjZWhvbGRlci5pbnNlcnRBZGphY2VudEhUTUwoXCJiZWZvcmViZWdpblwiLCBkYXRhKTtcclxuXHRcdFx0XHRwYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKHBsYWNlaG9sZGVyKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIG5leHRTaWJsaW5nLmluc2VydEFkamFjZW50SFRNTChcImJlZm9yZWJlZ2luXCIsIGRhdGEpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpbnNlcnRBZGphY2VudEJlZm9yZUVuZChwYXJlbnRFbGVtZW50LCBkYXRhKTtcclxuXHJcblx0XHR2YXIgbm9kZXMgPSBbXTtcclxuXHRcdHdoaWxlIChwYXJlbnRFbGVtZW50LmNoaWxkTm9kZXNbaW5kZXhdICE9PSBuZXh0U2libGluZykge1xyXG5cdFx0XHRub2Rlcy5wdXNoKHBhcmVudEVsZW1lbnQuY2hpbGROb2Rlc1tpbmRleF0pO1xyXG5cdFx0XHRpbmRleCsrO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIG5vZGVzO1xyXG5cdH1cclxuXHRmdW5jdGlvbiBhdXRvcmVkcmF3KGNhbGxiYWNrLCBvYmplY3QpIHtcclxuXHRcdHJldHVybiBmdW5jdGlvbihlKSB7XHJcblx0XHRcdGUgPSBlIHx8IGV2ZW50O1xyXG5cdFx0XHRtLnJlZHJhdy5zdHJhdGVneShcImRpZmZcIik7XHJcblx0XHRcdG0uc3RhcnRDb21wdXRhdGlvbigpO1xyXG5cdFx0XHR0cnkgeyByZXR1cm4gY2FsbGJhY2suY2FsbChvYmplY3QsIGUpOyB9XHJcblx0XHRcdGZpbmFsbHkge1xyXG5cdFx0XHRcdGVuZEZpcnN0Q29tcHV0YXRpb24oKTtcclxuXHRcdFx0fVxyXG5cdFx0fTtcclxuXHR9XHJcblxyXG5cdHZhciBodG1sO1xyXG5cdHZhciBkb2N1bWVudE5vZGUgPSB7XHJcblx0XHRhcHBlbmRDaGlsZDogZnVuY3Rpb24obm9kZSkge1xyXG5cdFx0XHRpZiAoaHRtbCA9PT0gdW5kZWZpbmVkKSBodG1sID0gJGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJodG1sXCIpO1xyXG5cdFx0XHRpZiAoJGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCAmJiAkZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50ICE9PSBub2RlKSB7XHJcblx0XHRcdFx0JGRvY3VtZW50LnJlcGxhY2VDaGlsZChub2RlLCAkZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlICRkb2N1bWVudC5hcHBlbmRDaGlsZChub2RlKTtcclxuXHRcdFx0dGhpcy5jaGlsZE5vZGVzID0gJGRvY3VtZW50LmNoaWxkTm9kZXM7XHJcblx0XHR9LFxyXG5cdFx0aW5zZXJ0QmVmb3JlOiBmdW5jdGlvbihub2RlKSB7XHJcblx0XHRcdHRoaXMuYXBwZW5kQ2hpbGQobm9kZSk7XHJcblx0XHR9LFxyXG5cdFx0Y2hpbGROb2RlczogW11cclxuXHR9O1xyXG5cdHZhciBub2RlQ2FjaGUgPSBbXSwgY2VsbENhY2hlID0ge307XHJcblx0bS5yZW5kZXIgPSBmdW5jdGlvbihyb290LCBjZWxsLCBmb3JjZVJlY3JlYXRpb24pIHtcclxuXHRcdHZhciBjb25maWdzID0gW107XHJcblx0XHRpZiAoIXJvb3QpIHRocm93IG5ldyBFcnJvcihcIkVuc3VyZSB0aGUgRE9NIGVsZW1lbnQgYmVpbmcgcGFzc2VkIHRvIG0ucm91dGUvbS5tb3VudC9tLnJlbmRlciBpcyBub3QgdW5kZWZpbmVkLlwiKTtcclxuXHRcdHZhciBpZCA9IGdldENlbGxDYWNoZUtleShyb290KTtcclxuXHRcdHZhciBpc0RvY3VtZW50Um9vdCA9IHJvb3QgPT09ICRkb2N1bWVudDtcclxuXHRcdHZhciBub2RlID0gaXNEb2N1bWVudFJvb3QgfHwgcm9vdCA9PT0gJGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCA/IGRvY3VtZW50Tm9kZSA6IHJvb3Q7XHJcblx0XHRpZiAoaXNEb2N1bWVudFJvb3QgJiYgY2VsbC50YWcgIT09IFwiaHRtbFwiKSBjZWxsID0ge3RhZzogXCJodG1sXCIsIGF0dHJzOiB7fSwgY2hpbGRyZW46IGNlbGx9O1xyXG5cdFx0aWYgKGNlbGxDYWNoZVtpZF0gPT09IHVuZGVmaW5lZCkgY2xlYXIobm9kZS5jaGlsZE5vZGVzKTtcclxuXHRcdGlmIChmb3JjZVJlY3JlYXRpb24gPT09IHRydWUpIHJlc2V0KHJvb3QpO1xyXG5cdFx0Y2VsbENhY2hlW2lkXSA9IGJ1aWxkKG5vZGUsIG51bGwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjZWxsLCBjZWxsQ2FjaGVbaWRdLCBmYWxzZSwgMCwgbnVsbCwgdW5kZWZpbmVkLCBjb25maWdzKTtcclxuXHRcdGZvckVhY2goY29uZmlncywgZnVuY3Rpb24gKGNvbmZpZykgeyBjb25maWcoKTsgfSk7XHJcblx0fTtcclxuXHRmdW5jdGlvbiBnZXRDZWxsQ2FjaGVLZXkoZWxlbWVudCkge1xyXG5cdFx0dmFyIGluZGV4ID0gbm9kZUNhY2hlLmluZGV4T2YoZWxlbWVudCk7XHJcblx0XHRyZXR1cm4gaW5kZXggPCAwID8gbm9kZUNhY2hlLnB1c2goZWxlbWVudCkgLSAxIDogaW5kZXg7XHJcblx0fVxyXG5cclxuXHRtLnRydXN0ID0gZnVuY3Rpb24odmFsdWUpIHtcclxuXHRcdHZhbHVlID0gbmV3IFN0cmluZyh2YWx1ZSk7XHJcblx0XHR2YWx1ZS4kdHJ1c3RlZCA9IHRydWU7XHJcblx0XHRyZXR1cm4gdmFsdWU7XHJcblx0fTtcclxuXHJcblx0ZnVuY3Rpb24gZ2V0dGVyc2V0dGVyKHN0b3JlKSB7XHJcblx0XHR2YXIgcHJvcCA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCkgc3RvcmUgPSBhcmd1bWVudHNbMF07XHJcblx0XHRcdHJldHVybiBzdG9yZTtcclxuXHRcdH07XHJcblxyXG5cdFx0cHJvcC50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuXHRcdFx0cmV0dXJuIHN0b3JlO1xyXG5cdFx0fTtcclxuXHJcblx0XHRyZXR1cm4gcHJvcDtcclxuXHR9XHJcblxyXG5cdG0ucHJvcCA9IGZ1bmN0aW9uIChzdG9yZSkge1xyXG5cdFx0Ly9ub3RlOiB1c2luZyBub24tc3RyaWN0IGVxdWFsaXR5IGNoZWNrIGhlcmUgYmVjYXVzZSB3ZSdyZSBjaGVja2luZyBpZiBzdG9yZSBpcyBudWxsIE9SIHVuZGVmaW5lZFxyXG5cdFx0aWYgKChzdG9yZSAhPSBudWxsICYmIGlzT2JqZWN0KHN0b3JlKSB8fCBpc0Z1bmN0aW9uKHN0b3JlKSkgJiYgaXNGdW5jdGlvbihzdG9yZS50aGVuKSkge1xyXG5cdFx0XHRyZXR1cm4gcHJvcGlmeShzdG9yZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIGdldHRlcnNldHRlcihzdG9yZSk7XHJcblx0fTtcclxuXHJcblx0dmFyIHJvb3RzID0gW10sIGNvbXBvbmVudHMgPSBbXSwgY29udHJvbGxlcnMgPSBbXSwgbGFzdFJlZHJhd0lkID0gbnVsbCwgbGFzdFJlZHJhd0NhbGxUaW1lID0gMCwgY29tcHV0ZVByZVJlZHJhd0hvb2sgPSBudWxsLCBjb21wdXRlUG9zdFJlZHJhd0hvb2sgPSBudWxsLCB0b3BDb21wb25lbnQsIHVubG9hZGVycyA9IFtdO1xyXG5cdHZhciBGUkFNRV9CVURHRVQgPSAxNjsgLy82MCBmcmFtZXMgcGVyIHNlY29uZCA9IDEgY2FsbCBwZXIgMTYgbXNcclxuXHRmdW5jdGlvbiBwYXJhbWV0ZXJpemUoY29tcG9uZW50LCBhcmdzKSB7XHJcblx0XHR2YXIgY29udHJvbGxlciA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRyZXR1cm4gKGNvbXBvbmVudC5jb250cm9sbGVyIHx8IG5vb3ApLmFwcGx5KHRoaXMsIGFyZ3MpIHx8IHRoaXM7XHJcblx0XHR9O1xyXG5cdFx0aWYgKGNvbXBvbmVudC5jb250cm9sbGVyKSBjb250cm9sbGVyLnByb3RvdHlwZSA9IGNvbXBvbmVudC5jb250cm9sbGVyLnByb3RvdHlwZTtcclxuXHRcdHZhciB2aWV3ID0gZnVuY3Rpb24oY3RybCkge1xyXG5cdFx0XHR2YXIgY3VycmVudEFyZ3MgPSBhcmd1bWVudHMubGVuZ3RoID4gMSA/IGFyZ3MuY29uY2F0KFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSkgOiBhcmdzO1xyXG5cdFx0XHRyZXR1cm4gY29tcG9uZW50LnZpZXcuYXBwbHkoY29tcG9uZW50LCBjdXJyZW50QXJncyA/IFtjdHJsXS5jb25jYXQoY3VycmVudEFyZ3MpIDogW2N0cmxdKTtcclxuXHRcdH07XHJcblx0XHR2aWV3LiRvcmlnaW5hbCA9IGNvbXBvbmVudC52aWV3O1xyXG5cdFx0dmFyIG91dHB1dCA9IHtjb250cm9sbGVyOiBjb250cm9sbGVyLCB2aWV3OiB2aWV3fTtcclxuXHRcdGlmIChhcmdzWzBdICYmIGFyZ3NbMF0ua2V5ICE9IG51bGwpIG91dHB1dC5hdHRycyA9IHtrZXk6IGFyZ3NbMF0ua2V5fTtcclxuXHRcdHJldHVybiBvdXRwdXQ7XHJcblx0fVxyXG5cdG0uY29tcG9uZW50ID0gZnVuY3Rpb24oY29tcG9uZW50KSB7XHJcblx0XHRmb3IgKHZhciBhcmdzID0gW10sIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSBhcmdzLnB1c2goYXJndW1lbnRzW2ldKTtcclxuXHRcdHJldHVybiBwYXJhbWV0ZXJpemUoY29tcG9uZW50LCBhcmdzKTtcclxuXHR9O1xyXG5cdG0ubW91bnQgPSBtLm1vZHVsZSA9IGZ1bmN0aW9uKHJvb3QsIGNvbXBvbmVudCkge1xyXG5cdFx0aWYgKCFyb290KSB0aHJvdyBuZXcgRXJyb3IoXCJQbGVhc2UgZW5zdXJlIHRoZSBET00gZWxlbWVudCBleGlzdHMgYmVmb3JlIHJlbmRlcmluZyBhIHRlbXBsYXRlIGludG8gaXQuXCIpO1xyXG5cdFx0dmFyIGluZGV4ID0gcm9vdHMuaW5kZXhPZihyb290KTtcclxuXHRcdGlmIChpbmRleCA8IDApIGluZGV4ID0gcm9vdHMubGVuZ3RoO1xyXG5cclxuXHRcdHZhciBpc1ByZXZlbnRlZCA9IGZhbHNlO1xyXG5cdFx0dmFyIGV2ZW50ID0ge3ByZXZlbnREZWZhdWx0OiBmdW5jdGlvbigpIHtcclxuXHRcdFx0aXNQcmV2ZW50ZWQgPSB0cnVlO1xyXG5cdFx0XHRjb21wdXRlUHJlUmVkcmF3SG9vayA9IGNvbXB1dGVQb3N0UmVkcmF3SG9vayA9IG51bGw7XHJcblx0XHR9fTtcclxuXHJcblx0XHRmb3JFYWNoKHVubG9hZGVycywgZnVuY3Rpb24gKHVubG9hZGVyKSB7XHJcblx0XHRcdHVubG9hZGVyLmhhbmRsZXIuY2FsbCh1bmxvYWRlci5jb250cm9sbGVyLCBldmVudCk7XHJcblx0XHRcdHVubG9hZGVyLmNvbnRyb2xsZXIub251bmxvYWQgPSBudWxsO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0aWYgKGlzUHJldmVudGVkKSB7XHJcblx0XHRcdGZvckVhY2godW5sb2FkZXJzLCBmdW5jdGlvbiAodW5sb2FkZXIpIHtcclxuXHRcdFx0XHR1bmxvYWRlci5jb250cm9sbGVyLm9udW5sb2FkID0gdW5sb2FkZXIuaGFuZGxlcjtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHVubG9hZGVycyA9IFtdO1xyXG5cclxuXHRcdGlmIChjb250cm9sbGVyc1tpbmRleF0gJiYgaXNGdW5jdGlvbihjb250cm9sbGVyc1tpbmRleF0ub251bmxvYWQpKSB7XHJcblx0XHRcdGNvbnRyb2xsZXJzW2luZGV4XS5vbnVubG9hZChldmVudCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGlzTnVsbENvbXBvbmVudCA9IGNvbXBvbmVudCA9PT0gbnVsbDtcclxuXHJcblx0XHRpZiAoIWlzUHJldmVudGVkKSB7XHJcblx0XHRcdG0ucmVkcmF3LnN0cmF0ZWd5KFwiYWxsXCIpO1xyXG5cdFx0XHRtLnN0YXJ0Q29tcHV0YXRpb24oKTtcclxuXHRcdFx0cm9vdHNbaW5kZXhdID0gcm9vdDtcclxuXHRcdFx0dmFyIGN1cnJlbnRDb21wb25lbnQgPSBjb21wb25lbnQgPyAodG9wQ29tcG9uZW50ID0gY29tcG9uZW50KSA6ICh0b3BDb21wb25lbnQgPSBjb21wb25lbnQgPSB7Y29udHJvbGxlcjogbm9vcH0pO1xyXG5cdFx0XHR2YXIgY29udHJvbGxlciA9IG5ldyAoY29tcG9uZW50LmNvbnRyb2xsZXIgfHwgbm9vcCkoKTtcclxuXHRcdFx0Ly9jb250cm9sbGVycyBtYXkgY2FsbCBtLm1vdW50IHJlY3Vyc2l2ZWx5ICh2aWEgbS5yb3V0ZSByZWRpcmVjdHMsIGZvciBleGFtcGxlKVxyXG5cdFx0XHQvL3RoaXMgY29uZGl0aW9uYWwgZW5zdXJlcyBvbmx5IHRoZSBsYXN0IHJlY3Vyc2l2ZSBtLm1vdW50IGNhbGwgaXMgYXBwbGllZFxyXG5cdFx0XHRpZiAoY3VycmVudENvbXBvbmVudCA9PT0gdG9wQ29tcG9uZW50KSB7XHJcblx0XHRcdFx0Y29udHJvbGxlcnNbaW5kZXhdID0gY29udHJvbGxlcjtcclxuXHRcdFx0XHRjb21wb25lbnRzW2luZGV4XSA9IGNvbXBvbmVudDtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbmRGaXJzdENvbXB1dGF0aW9uKCk7XHJcblx0XHRcdGlmIChpc051bGxDb21wb25lbnQpIHtcclxuXHRcdFx0XHRyZW1vdmVSb290RWxlbWVudChyb290LCBpbmRleCk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIGNvbnRyb2xsZXJzW2luZGV4XTtcclxuXHRcdH1cclxuXHRcdGlmIChpc051bGxDb21wb25lbnQpIHtcclxuXHRcdFx0cmVtb3ZlUm9vdEVsZW1lbnQocm9vdCwgaW5kZXgpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdGZ1bmN0aW9uIHJlbW92ZVJvb3RFbGVtZW50KHJvb3QsIGluZGV4KSB7XHJcblx0XHRyb290cy5zcGxpY2UoaW5kZXgsIDEpO1xyXG5cdFx0Y29udHJvbGxlcnMuc3BsaWNlKGluZGV4LCAxKTtcclxuXHRcdGNvbXBvbmVudHMuc3BsaWNlKGluZGV4LCAxKTtcclxuXHRcdHJlc2V0KHJvb3QpO1xyXG5cdFx0bm9kZUNhY2hlLnNwbGljZShnZXRDZWxsQ2FjaGVLZXkocm9vdCksIDEpO1xyXG5cdH1cclxuXHJcblx0dmFyIHJlZHJhd2luZyA9IGZhbHNlLCBmb3JjaW5nID0gZmFsc2U7XHJcblx0bS5yZWRyYXcgPSBmdW5jdGlvbihmb3JjZSkge1xyXG5cdFx0aWYgKHJlZHJhd2luZykgcmV0dXJuO1xyXG5cdFx0cmVkcmF3aW5nID0gdHJ1ZTtcclxuXHRcdGlmIChmb3JjZSkgZm9yY2luZyA9IHRydWU7XHJcblx0XHR0cnkge1xyXG5cdFx0XHQvL2xhc3RSZWRyYXdJZCBpcyBhIHBvc2l0aXZlIG51bWJlciBpZiBhIHNlY29uZCByZWRyYXcgaXMgcmVxdWVzdGVkIGJlZm9yZSB0aGUgbmV4dCBhbmltYXRpb24gZnJhbWVcclxuXHRcdFx0Ly9sYXN0UmVkcmF3SUQgaXMgbnVsbCBpZiBpdCdzIHRoZSBmaXJzdCByZWRyYXcgYW5kIG5vdCBhbiBldmVudCBoYW5kbGVyXHJcblx0XHRcdGlmIChsYXN0UmVkcmF3SWQgJiYgIWZvcmNlKSB7XHJcblx0XHRcdFx0Ly93aGVuIHNldFRpbWVvdXQ6IG9ubHkgcmVzY2hlZHVsZSByZWRyYXcgaWYgdGltZSBiZXR3ZWVuIG5vdyBhbmQgcHJldmlvdXMgcmVkcmF3IGlzIGJpZ2dlciB0aGFuIGEgZnJhbWUsIG90aGVyd2lzZSBrZWVwIGN1cnJlbnRseSBzY2hlZHVsZWQgdGltZW91dFxyXG5cdFx0XHRcdC8vd2hlbiByQUY6IGFsd2F5cyByZXNjaGVkdWxlIHJlZHJhd1xyXG5cdFx0XHRcdGlmICgkcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IG5ldyBEYXRlIC0gbGFzdFJlZHJhd0NhbGxUaW1lID4gRlJBTUVfQlVER0VUKSB7XHJcblx0XHRcdFx0XHRpZiAobGFzdFJlZHJhd0lkID4gMCkgJGNhbmNlbEFuaW1hdGlvbkZyYW1lKGxhc3RSZWRyYXdJZCk7XHJcblx0XHRcdFx0XHRsYXN0UmVkcmF3SWQgPSAkcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlZHJhdywgRlJBTUVfQlVER0VUKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0cmVkcmF3KCk7XHJcblx0XHRcdFx0bGFzdFJlZHJhd0lkID0gJHJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbigpIHsgbGFzdFJlZHJhd0lkID0gbnVsbDsgfSwgRlJBTUVfQlVER0VUKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0ZmluYWxseSB7XHJcblx0XHRcdHJlZHJhd2luZyA9IGZvcmNpbmcgPSBmYWxzZTtcclxuXHRcdH1cclxuXHR9O1xyXG5cdG0ucmVkcmF3LnN0cmF0ZWd5ID0gbS5wcm9wKCk7XHJcblx0ZnVuY3Rpb24gcmVkcmF3KCkge1xyXG5cdFx0aWYgKGNvbXB1dGVQcmVSZWRyYXdIb29rKSB7XHJcblx0XHRcdGNvbXB1dGVQcmVSZWRyYXdIb29rKCk7XHJcblx0XHRcdGNvbXB1dGVQcmVSZWRyYXdIb29rID0gbnVsbDtcclxuXHRcdH1cclxuXHRcdGZvckVhY2gocm9vdHMsIGZ1bmN0aW9uIChyb290LCBpKSB7XHJcblx0XHRcdHZhciBjb21wb25lbnQgPSBjb21wb25lbnRzW2ldO1xyXG5cdFx0XHRpZiAoY29udHJvbGxlcnNbaV0pIHtcclxuXHRcdFx0XHR2YXIgYXJncyA9IFtjb250cm9sbGVyc1tpXV07XHJcblx0XHRcdFx0bS5yZW5kZXIocm9vdCwgY29tcG9uZW50LnZpZXcgPyBjb21wb25lbnQudmlldyhjb250cm9sbGVyc1tpXSwgYXJncykgOiBcIlwiKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0XHQvL2FmdGVyIHJlbmRlcmluZyB3aXRoaW4gYSByb3V0ZWQgY29udGV4dCwgd2UgbmVlZCB0byBzY3JvbGwgYmFjayB0byB0aGUgdG9wLCBhbmQgZmV0Y2ggdGhlIGRvY3VtZW50IHRpdGxlIGZvciBoaXN0b3J5LnB1c2hTdGF0ZVxyXG5cdFx0aWYgKGNvbXB1dGVQb3N0UmVkcmF3SG9vaykge1xyXG5cdFx0XHRjb21wdXRlUG9zdFJlZHJhd0hvb2soKTtcclxuXHRcdFx0Y29tcHV0ZVBvc3RSZWRyYXdIb29rID0gbnVsbDtcclxuXHRcdH1cclxuXHRcdGxhc3RSZWRyYXdJZCA9IG51bGw7XHJcblx0XHRsYXN0UmVkcmF3Q2FsbFRpbWUgPSBuZXcgRGF0ZTtcclxuXHRcdG0ucmVkcmF3LnN0cmF0ZWd5KFwiZGlmZlwiKTtcclxuXHR9XHJcblxyXG5cdHZhciBwZW5kaW5nUmVxdWVzdHMgPSAwO1xyXG5cdG0uc3RhcnRDb21wdXRhdGlvbiA9IGZ1bmN0aW9uKCkgeyBwZW5kaW5nUmVxdWVzdHMrKzsgfTtcclxuXHRtLmVuZENvbXB1dGF0aW9uID0gZnVuY3Rpb24oKSB7XHJcblx0XHRpZiAocGVuZGluZ1JlcXVlc3RzID4gMSkgcGVuZGluZ1JlcXVlc3RzLS07XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0cGVuZGluZ1JlcXVlc3RzID0gMDtcclxuXHRcdFx0bS5yZWRyYXcoKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGVuZEZpcnN0Q29tcHV0YXRpb24oKSB7XHJcblx0XHRpZiAobS5yZWRyYXcuc3RyYXRlZ3koKSA9PT0gXCJub25lXCIpIHtcclxuXHRcdFx0cGVuZGluZ1JlcXVlc3RzLS07XHJcblx0XHRcdG0ucmVkcmF3LnN0cmF0ZWd5KFwiZGlmZlwiKTtcclxuXHRcdH1cclxuXHRcdGVsc2UgbS5lbmRDb21wdXRhdGlvbigpO1xyXG5cdH1cclxuXHJcblx0bS53aXRoQXR0ciA9IGZ1bmN0aW9uKHByb3AsIHdpdGhBdHRyQ2FsbGJhY2ssIGNhbGxiYWNrVGhpcykge1xyXG5cdFx0cmV0dXJuIGZ1bmN0aW9uKGUpIHtcclxuXHRcdFx0ZSA9IGUgfHwgZXZlbnQ7XHJcblx0XHRcdHZhciBjdXJyZW50VGFyZ2V0ID0gZS5jdXJyZW50VGFyZ2V0IHx8IHRoaXM7XHJcblx0XHRcdHZhciBfdGhpcyA9IGNhbGxiYWNrVGhpcyB8fCB0aGlzO1xyXG5cdFx0XHR3aXRoQXR0ckNhbGxiYWNrLmNhbGwoX3RoaXMsIHByb3AgaW4gY3VycmVudFRhcmdldCA/IGN1cnJlbnRUYXJnZXRbcHJvcF0gOiBjdXJyZW50VGFyZ2V0LmdldEF0dHJpYnV0ZShwcm9wKSk7XHJcblx0XHR9O1xyXG5cdH07XHJcblxyXG5cdC8vcm91dGluZ1xyXG5cdHZhciBtb2RlcyA9IHtwYXRobmFtZTogXCJcIiwgaGFzaDogXCIjXCIsIHNlYXJjaDogXCI/XCJ9O1xyXG5cdHZhciByZWRpcmVjdCA9IG5vb3AsIHJvdXRlUGFyYW1zLCBjdXJyZW50Um91dGUsIGlzRGVmYXVsdFJvdXRlID0gZmFsc2U7XHJcblx0bS5yb3V0ZSA9IGZ1bmN0aW9uKHJvb3QsIGFyZzEsIGFyZzIsIHZkb20pIHtcclxuXHRcdC8vbS5yb3V0ZSgpXHJcblx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGN1cnJlbnRSb3V0ZTtcclxuXHRcdC8vbS5yb3V0ZShlbCwgZGVmYXVsdFJvdXRlLCByb3V0ZXMpXHJcblx0XHRlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAzICYmIGlzU3RyaW5nKGFyZzEpKSB7XHJcblx0XHRcdHJlZGlyZWN0ID0gZnVuY3Rpb24oc291cmNlKSB7XHJcblx0XHRcdFx0dmFyIHBhdGggPSBjdXJyZW50Um91dGUgPSBub3JtYWxpemVSb3V0ZShzb3VyY2UpO1xyXG5cdFx0XHRcdGlmICghcm91dGVCeVZhbHVlKHJvb3QsIGFyZzIsIHBhdGgpKSB7XHJcblx0XHRcdFx0XHRpZiAoaXNEZWZhdWx0Um91dGUpIHRocm93IG5ldyBFcnJvcihcIkVuc3VyZSB0aGUgZGVmYXVsdCByb3V0ZSBtYXRjaGVzIG9uZSBvZiB0aGUgcm91dGVzIGRlZmluZWQgaW4gbS5yb3V0ZVwiKTtcclxuXHRcdFx0XHRcdGlzRGVmYXVsdFJvdXRlID0gdHJ1ZTtcclxuXHRcdFx0XHRcdG0ucm91dGUoYXJnMSwgdHJ1ZSk7XHJcblx0XHRcdFx0XHRpc0RlZmF1bHRSb3V0ZSA9IGZhbHNlO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fTtcclxuXHRcdFx0dmFyIGxpc3RlbmVyID0gbS5yb3V0ZS5tb2RlID09PSBcImhhc2hcIiA/IFwib25oYXNoY2hhbmdlXCIgOiBcIm9ucG9wc3RhdGVcIjtcclxuXHRcdFx0d2luZG93W2xpc3RlbmVyXSA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdHZhciBwYXRoID0gJGxvY2F0aW9uW20ucm91dGUubW9kZV07XHJcblx0XHRcdFx0aWYgKG0ucm91dGUubW9kZSA9PT0gXCJwYXRobmFtZVwiKSBwYXRoICs9ICRsb2NhdGlvbi5zZWFyY2g7XHJcblx0XHRcdFx0aWYgKGN1cnJlbnRSb3V0ZSAhPT0gbm9ybWFsaXplUm91dGUocGF0aCkpIHJlZGlyZWN0KHBhdGgpO1xyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0Y29tcHV0ZVByZVJlZHJhd0hvb2sgPSBzZXRTY3JvbGw7XHJcblx0XHRcdHdpbmRvd1tsaXN0ZW5lcl0oKTtcclxuXHRcdH1cclxuXHRcdC8vY29uZmlnOiBtLnJvdXRlXHJcblx0XHRlbHNlIGlmIChyb290LmFkZEV2ZW50TGlzdGVuZXIgfHwgcm9vdC5hdHRhY2hFdmVudCkge1xyXG5cdFx0XHRyb290LmhyZWYgPSAobS5yb3V0ZS5tb2RlICE9PSAncGF0aG5hbWUnID8gJGxvY2F0aW9uLnBhdGhuYW1lIDogJycpICsgbW9kZXNbbS5yb3V0ZS5tb2RlXSArIHZkb20uYXR0cnMuaHJlZjtcclxuXHRcdFx0aWYgKHJvb3QuYWRkRXZlbnRMaXN0ZW5lcikge1xyXG5cdFx0XHRcdHJvb3QucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHJvdXRlVW5vYnRydXNpdmUpO1xyXG5cdFx0XHRcdHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHJvdXRlVW5vYnRydXNpdmUpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdHJvb3QuZGV0YWNoRXZlbnQoXCJvbmNsaWNrXCIsIHJvdXRlVW5vYnRydXNpdmUpO1xyXG5cdFx0XHRcdHJvb3QuYXR0YWNoRXZlbnQoXCJvbmNsaWNrXCIsIHJvdXRlVW5vYnRydXNpdmUpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHQvL20ucm91dGUocm91dGUsIHBhcmFtcywgc2hvdWxkUmVwbGFjZUhpc3RvcnlFbnRyeSlcclxuXHRcdGVsc2UgaWYgKGlzU3RyaW5nKHJvb3QpKSB7XHJcblx0XHRcdHZhciBvbGRSb3V0ZSA9IGN1cnJlbnRSb3V0ZTtcclxuXHRcdFx0Y3VycmVudFJvdXRlID0gcm9vdDtcclxuXHRcdFx0dmFyIGFyZ3MgPSBhcmcxIHx8IHt9O1xyXG5cdFx0XHR2YXIgcXVlcnlJbmRleCA9IGN1cnJlbnRSb3V0ZS5pbmRleE9mKFwiP1wiKTtcclxuXHRcdFx0dmFyIHBhcmFtcyA9IHF1ZXJ5SW5kZXggPiAtMSA/IHBhcnNlUXVlcnlTdHJpbmcoY3VycmVudFJvdXRlLnNsaWNlKHF1ZXJ5SW5kZXggKyAxKSkgOiB7fTtcclxuXHRcdFx0Zm9yICh2YXIgaSBpbiBhcmdzKSBwYXJhbXNbaV0gPSBhcmdzW2ldO1xyXG5cdFx0XHR2YXIgcXVlcnlzdHJpbmcgPSBidWlsZFF1ZXJ5U3RyaW5nKHBhcmFtcyk7XHJcblx0XHRcdHZhciBjdXJyZW50UGF0aCA9IHF1ZXJ5SW5kZXggPiAtMSA/IGN1cnJlbnRSb3V0ZS5zbGljZSgwLCBxdWVyeUluZGV4KSA6IGN1cnJlbnRSb3V0ZTtcclxuXHRcdFx0aWYgKHF1ZXJ5c3RyaW5nKSBjdXJyZW50Um91dGUgPSBjdXJyZW50UGF0aCArIChjdXJyZW50UGF0aC5pbmRleE9mKFwiP1wiKSA9PT0gLTEgPyBcIj9cIiA6IFwiJlwiKSArIHF1ZXJ5c3RyaW5nO1xyXG5cclxuXHRcdFx0dmFyIHNob3VsZFJlcGxhY2VIaXN0b3J5RW50cnkgPSAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMyA/IGFyZzIgOiBhcmcxKSA9PT0gdHJ1ZSB8fCBvbGRSb3V0ZSA9PT0gcm9vdDtcclxuXHJcblx0XHRcdGlmICh3aW5kb3cuaGlzdG9yeS5wdXNoU3RhdGUpIHtcclxuXHRcdFx0XHRjb21wdXRlUHJlUmVkcmF3SG9vayA9IHNldFNjcm9sbDtcclxuXHRcdFx0XHRjb21wdXRlUG9zdFJlZHJhd0hvb2sgPSBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcdHdpbmRvdy5oaXN0b3J5W3Nob3VsZFJlcGxhY2VIaXN0b3J5RW50cnkgPyBcInJlcGxhY2VTdGF0ZVwiIDogXCJwdXNoU3RhdGVcIl0obnVsbCwgJGRvY3VtZW50LnRpdGxlLCBtb2Rlc1ttLnJvdXRlLm1vZGVdICsgY3VycmVudFJvdXRlKTtcclxuXHRcdFx0XHR9O1xyXG5cdFx0XHRcdHJlZGlyZWN0KG1vZGVzW20ucm91dGUubW9kZV0gKyBjdXJyZW50Um91dGUpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdCRsb2NhdGlvblttLnJvdXRlLm1vZGVdID0gY3VycmVudFJvdXRlO1xyXG5cdFx0XHRcdHJlZGlyZWN0KG1vZGVzW20ucm91dGUubW9kZV0gKyBjdXJyZW50Um91dGUpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fTtcclxuXHRtLnJvdXRlLnBhcmFtID0gZnVuY3Rpb24oa2V5KSB7XHJcblx0XHRpZiAoIXJvdXRlUGFyYW1zKSB0aHJvdyBuZXcgRXJyb3IoXCJZb3UgbXVzdCBjYWxsIG0ucm91dGUoZWxlbWVudCwgZGVmYXVsdFJvdXRlLCByb3V0ZXMpIGJlZm9yZSBjYWxsaW5nIG0ucm91dGUucGFyYW0oKVwiKTtcclxuXHRcdGlmKCAha2V5ICl7XHJcblx0XHRcdHJldHVybiByb3V0ZVBhcmFtcztcclxuXHRcdH1cclxuXHRcdHJldHVybiByb3V0ZVBhcmFtc1trZXldO1xyXG5cdH07XHJcblx0bS5yb3V0ZS5tb2RlID0gXCJzZWFyY2hcIjtcclxuXHRmdW5jdGlvbiBub3JtYWxpemVSb3V0ZShyb3V0ZSkge1xyXG5cdFx0cmV0dXJuIHJvdXRlLnNsaWNlKG1vZGVzW20ucm91dGUubW9kZV0ubGVuZ3RoKTtcclxuXHR9XHJcblx0ZnVuY3Rpb24gcm91dGVCeVZhbHVlKHJvb3QsIHJvdXRlciwgcGF0aCkge1xyXG5cdFx0cm91dGVQYXJhbXMgPSB7fTtcclxuXHJcblx0XHR2YXIgcXVlcnlTdGFydCA9IHBhdGguaW5kZXhPZihcIj9cIik7XHJcblx0XHRpZiAocXVlcnlTdGFydCAhPT0gLTEpIHtcclxuXHRcdFx0cm91dGVQYXJhbXMgPSBwYXJzZVF1ZXJ5U3RyaW5nKHBhdGguc3Vic3RyKHF1ZXJ5U3RhcnQgKyAxLCBwYXRoLmxlbmd0aCkpO1xyXG5cdFx0XHRwYXRoID0gcGF0aC5zdWJzdHIoMCwgcXVlcnlTdGFydCk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gR2V0IGFsbCByb3V0ZXMgYW5kIGNoZWNrIGlmIHRoZXJlJ3NcclxuXHRcdC8vIGFuIGV4YWN0IG1hdGNoIGZvciB0aGUgY3VycmVudCBwYXRoXHJcblx0XHR2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJvdXRlcik7XHJcblx0XHR2YXIgaW5kZXggPSBrZXlzLmluZGV4T2YocGF0aCk7XHJcblx0XHRpZihpbmRleCAhPT0gLTEpe1xyXG5cdFx0XHRtLm1vdW50KHJvb3QsIHJvdXRlcltrZXlzIFtpbmRleF1dKTtcclxuXHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHR9XHJcblxyXG5cdFx0Zm9yICh2YXIgcm91dGUgaW4gcm91dGVyKSB7XHJcblx0XHRcdGlmIChyb3V0ZSA9PT0gcGF0aCkge1xyXG5cdFx0XHRcdG0ubW91bnQocm9vdCwgcm91dGVyW3JvdXRlXSk7XHJcblx0XHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHZhciBtYXRjaGVyID0gbmV3IFJlZ0V4cChcIl5cIiArIHJvdXRlLnJlcGxhY2UoLzpbXlxcL10rP1xcLnszfS9nLCBcIiguKj8pXCIpLnJlcGxhY2UoLzpbXlxcL10rL2csIFwiKFteXFxcXC9dKylcIikgKyBcIlxcLz8kXCIpO1xyXG5cclxuXHRcdFx0aWYgKG1hdGNoZXIudGVzdChwYXRoKSkge1xyXG5cdFx0XHRcdHBhdGgucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcdHZhciBrZXlzID0gcm91dGUubWF0Y2goLzpbXlxcL10rL2cpIHx8IFtdO1xyXG5cdFx0XHRcdFx0dmFyIHZhbHVlcyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxLCAtMik7XHJcblx0XHRcdFx0XHRmb3JFYWNoKGtleXMsIGZ1bmN0aW9uIChrZXksIGkpIHtcclxuXHRcdFx0XHRcdFx0cm91dGVQYXJhbXNba2V5LnJlcGxhY2UoLzp8XFwuL2csIFwiXCIpXSA9IGRlY29kZVVSSUNvbXBvbmVudCh2YWx1ZXNbaV0pO1xyXG5cdFx0XHRcdFx0fSlcclxuXHRcdFx0XHRcdG0ubW91bnQocm9vdCwgcm91dGVyW3JvdXRlXSk7XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblx0ZnVuY3Rpb24gcm91dGVVbm9idHJ1c2l2ZShlKSB7XHJcblx0XHRlID0gZSB8fCBldmVudDtcclxuXHJcblx0XHRpZiAoZS5jdHJsS2V5IHx8IGUubWV0YUtleSB8fCBlLndoaWNoID09PSAyKSByZXR1cm47XHJcblxyXG5cdFx0aWYgKGUucHJldmVudERlZmF1bHQpIGUucHJldmVudERlZmF1bHQoKTtcclxuXHRcdGVsc2UgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlO1xyXG5cclxuXHRcdHZhciBjdXJyZW50VGFyZ2V0ID0gZS5jdXJyZW50VGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcclxuXHRcdHZhciBhcmdzID0gbS5yb3V0ZS5tb2RlID09PSBcInBhdGhuYW1lXCIgJiYgY3VycmVudFRhcmdldC5zZWFyY2ggPyBwYXJzZVF1ZXJ5U3RyaW5nKGN1cnJlbnRUYXJnZXQuc2VhcmNoLnNsaWNlKDEpKSA6IHt9O1xyXG5cdFx0d2hpbGUgKGN1cnJlbnRUYXJnZXQgJiYgY3VycmVudFRhcmdldC5ub2RlTmFtZS50b1VwcGVyQ2FzZSgpICE9PSBcIkFcIikgY3VycmVudFRhcmdldCA9IGN1cnJlbnRUYXJnZXQucGFyZW50Tm9kZTtcclxuXHRcdG0ucm91dGUoY3VycmVudFRhcmdldFttLnJvdXRlLm1vZGVdLnNsaWNlKG1vZGVzW20ucm91dGUubW9kZV0ubGVuZ3RoKSwgYXJncyk7XHJcblx0fVxyXG5cdGZ1bmN0aW9uIHNldFNjcm9sbCgpIHtcclxuXHRcdGlmIChtLnJvdXRlLm1vZGUgIT09IFwiaGFzaFwiICYmICRsb2NhdGlvbi5oYXNoKSAkbG9jYXRpb24uaGFzaCA9ICRsb2NhdGlvbi5oYXNoO1xyXG5cdFx0ZWxzZSB3aW5kb3cuc2Nyb2xsVG8oMCwgMCk7XHJcblx0fVxyXG5cdGZ1bmN0aW9uIGJ1aWxkUXVlcnlTdHJpbmcob2JqZWN0LCBwcmVmaXgpIHtcclxuXHRcdHZhciBkdXBsaWNhdGVzID0ge307XHJcblx0XHR2YXIgc3RyID0gW107XHJcblx0XHRmb3IgKHZhciBwcm9wIGluIG9iamVjdCkge1xyXG5cdFx0XHR2YXIga2V5ID0gcHJlZml4ID8gcHJlZml4ICsgXCJbXCIgKyBwcm9wICsgXCJdXCIgOiBwcm9wO1xyXG5cdFx0XHR2YXIgdmFsdWUgPSBvYmplY3RbcHJvcF07XHJcblxyXG5cdFx0XHRpZiAodmFsdWUgPT09IG51bGwpIHtcclxuXHRcdFx0XHRzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQoa2V5KSk7XHJcblx0XHRcdH0gZWxzZSBpZiAoaXNPYmplY3QodmFsdWUpKSB7XHJcblx0XHRcdFx0c3RyLnB1c2goYnVpbGRRdWVyeVN0cmluZyh2YWx1ZSwga2V5KSk7XHJcblx0XHRcdH0gZWxzZSBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcclxuXHRcdFx0XHR2YXIga2V5cyA9IFtdO1xyXG5cdFx0XHRcdGR1cGxpY2F0ZXNba2V5XSA9IGR1cGxpY2F0ZXNba2V5XSB8fCB7fTtcclxuXHRcdFx0XHRmb3JFYWNoKHZhbHVlLCBmdW5jdGlvbiAoaXRlbSkge1xyXG5cdFx0XHRcdFx0aWYgKCFkdXBsaWNhdGVzW2tleV1baXRlbV0pIHtcclxuXHRcdFx0XHRcdFx0ZHVwbGljYXRlc1trZXldW2l0ZW1dID0gdHJ1ZTtcclxuXHRcdFx0XHRcdFx0a2V5cy5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChrZXkpICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQoaXRlbSkpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHRcdHN0ci5wdXNoKGtleXMuam9pbihcIiZcIikpO1xyXG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0XHRzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQoa2V5KSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KHZhbHVlKSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdHJldHVybiBzdHIuam9pbihcIiZcIik7XHJcblx0fVxyXG5cdGZ1bmN0aW9uIHBhcnNlUXVlcnlTdHJpbmcoc3RyKSB7XHJcblx0XHRpZiAoc3RyID09PSBcIlwiIHx8IHN0ciA9PSBudWxsKSByZXR1cm4ge307XHJcblx0XHRpZiAoc3RyLmNoYXJBdCgwKSA9PT0gXCI/XCIpIHN0ciA9IHN0ci5zbGljZSgxKTtcclxuXHJcblx0XHR2YXIgcGFpcnMgPSBzdHIuc3BsaXQoXCImXCIpLCBwYXJhbXMgPSB7fTtcclxuXHRcdGZvckVhY2gocGFpcnMsIGZ1bmN0aW9uIChzdHJpbmcpIHtcclxuXHRcdFx0dmFyIHBhaXIgPSBzdHJpbmcuc3BsaXQoXCI9XCIpO1xyXG5cdFx0XHR2YXIga2V5ID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhaXJbMF0pO1xyXG5cdFx0XHR2YXIgdmFsdWUgPSBwYWlyLmxlbmd0aCA9PT0gMiA/IGRlY29kZVVSSUNvbXBvbmVudChwYWlyWzFdKSA6IG51bGw7XHJcblx0XHRcdGlmIChwYXJhbXNba2V5XSAhPSBudWxsKSB7XHJcblx0XHRcdFx0aWYgKCFpc0FycmF5KHBhcmFtc1trZXldKSkgcGFyYW1zW2tleV0gPSBbcGFyYW1zW2tleV1dO1xyXG5cdFx0XHRcdHBhcmFtc1trZXldLnB1c2godmFsdWUpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgcGFyYW1zW2tleV0gPSB2YWx1ZTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdHJldHVybiBwYXJhbXM7XHJcblx0fVxyXG5cdG0ucm91dGUuYnVpbGRRdWVyeVN0cmluZyA9IGJ1aWxkUXVlcnlTdHJpbmc7XHJcblx0bS5yb3V0ZS5wYXJzZVF1ZXJ5U3RyaW5nID0gcGFyc2VRdWVyeVN0cmluZztcclxuXHJcblx0ZnVuY3Rpb24gcmVzZXQocm9vdCkge1xyXG5cdFx0dmFyIGNhY2hlS2V5ID0gZ2V0Q2VsbENhY2hlS2V5KHJvb3QpO1xyXG5cdFx0Y2xlYXIocm9vdC5jaGlsZE5vZGVzLCBjZWxsQ2FjaGVbY2FjaGVLZXldKTtcclxuXHRcdGNlbGxDYWNoZVtjYWNoZUtleV0gPSB1bmRlZmluZWQ7XHJcblx0fVxyXG5cclxuXHRtLmRlZmVycmVkID0gZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkKCk7XHJcblx0XHRkZWZlcnJlZC5wcm9taXNlID0gcHJvcGlmeShkZWZlcnJlZC5wcm9taXNlKTtcclxuXHRcdHJldHVybiBkZWZlcnJlZDtcclxuXHR9O1xyXG5cdGZ1bmN0aW9uIHByb3BpZnkocHJvbWlzZSwgaW5pdGlhbFZhbHVlKSB7XHJcblx0XHR2YXIgcHJvcCA9IG0ucHJvcChpbml0aWFsVmFsdWUpO1xyXG5cdFx0cHJvbWlzZS50aGVuKHByb3ApO1xyXG5cdFx0cHJvcC50aGVuID0gZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcblx0XHRcdHJldHVybiBwcm9waWZ5KHByb21pc2UudGhlbihyZXNvbHZlLCByZWplY3QpLCBpbml0aWFsVmFsdWUpO1xyXG5cdFx0fTtcclxuXHRcdHByb3BbXCJjYXRjaFwiXSA9IHByb3AudGhlbi5iaW5kKG51bGwsIG51bGwpO1xyXG5cdFx0cHJvcFtcImZpbmFsbHlcIl0gPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG5cdFx0XHR2YXIgX2NhbGxiYWNrID0gZnVuY3Rpb24oKSB7cmV0dXJuIG0uZGVmZXJyZWQoKS5yZXNvbHZlKGNhbGxiYWNrKCkpLnByb21pc2U7fTtcclxuXHRcdFx0cmV0dXJuIHByb3AudGhlbihmdW5jdGlvbih2YWx1ZSkge1xyXG5cdFx0XHRcdHJldHVybiBwcm9waWZ5KF9jYWxsYmFjaygpLnRoZW4oZnVuY3Rpb24oKSB7cmV0dXJuIHZhbHVlO30pLCBpbml0aWFsVmFsdWUpO1xyXG5cdFx0XHR9LCBmdW5jdGlvbihyZWFzb24pIHtcclxuXHRcdFx0XHRyZXR1cm4gcHJvcGlmeShfY2FsbGJhY2soKS50aGVuKGZ1bmN0aW9uKCkge3Rocm93IG5ldyBFcnJvcihyZWFzb24pO30pLCBpbml0aWFsVmFsdWUpO1xyXG5cdFx0XHR9KTtcclxuXHRcdH07XHJcblx0XHRyZXR1cm4gcHJvcDtcclxuXHR9XHJcblx0Ly9Qcm9taXoubWl0aHJpbC5qcyB8IFpvbG1laXN0ZXIgfCBNSVRcclxuXHQvL2EgbW9kaWZpZWQgdmVyc2lvbiBvZiBQcm9taXouanMsIHdoaWNoIGRvZXMgbm90IGNvbmZvcm0gdG8gUHJvbWlzZXMvQSsgZm9yIHR3byByZWFzb25zOlxyXG5cdC8vMSkgYHRoZW5gIGNhbGxiYWNrcyBhcmUgY2FsbGVkIHN5bmNocm9ub3VzbHkgKGJlY2F1c2Ugc2V0VGltZW91dCBpcyB0b28gc2xvdywgYW5kIHRoZSBzZXRJbW1lZGlhdGUgcG9seWZpbGwgaXMgdG9vIGJpZ1xyXG5cdC8vMikgdGhyb3dpbmcgc3ViY2xhc3NlcyBvZiBFcnJvciBjYXVzZSB0aGUgZXJyb3IgdG8gYmUgYnViYmxlZCB1cCBpbnN0ZWFkIG9mIHRyaWdnZXJpbmcgcmVqZWN0aW9uIChiZWNhdXNlIHRoZSBzcGVjIGRvZXMgbm90IGFjY291bnQgZm9yIHRoZSBpbXBvcnRhbnQgdXNlIGNhc2Ugb2YgZGVmYXVsdCBicm93c2VyIGVycm9yIGhhbmRsaW5nLCBpLmUuIG1lc3NhZ2Ugdy8gbGluZSBudW1iZXIpXHJcblx0ZnVuY3Rpb24gRGVmZXJyZWQoc3VjY2Vzc0NhbGxiYWNrLCBmYWlsdXJlQ2FsbGJhY2spIHtcclxuXHRcdHZhciBSRVNPTFZJTkcgPSAxLCBSRUpFQ1RJTkcgPSAyLCBSRVNPTFZFRCA9IDMsIFJFSkVDVEVEID0gNDtcclxuXHRcdHZhciBzZWxmID0gdGhpcywgc3RhdGUgPSAwLCBwcm9taXNlVmFsdWUgPSAwLCBuZXh0ID0gW107XHJcblxyXG5cdFx0c2VsZi5wcm9taXNlID0ge307XHJcblxyXG5cdFx0c2VsZi5yZXNvbHZlID0gZnVuY3Rpb24odmFsdWUpIHtcclxuXHRcdFx0aWYgKCFzdGF0ZSkge1xyXG5cdFx0XHRcdHByb21pc2VWYWx1ZSA9IHZhbHVlO1xyXG5cdFx0XHRcdHN0YXRlID0gUkVTT0xWSU5HO1xyXG5cclxuXHRcdFx0XHRmaXJlKCk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9O1xyXG5cclxuXHRcdHNlbGYucmVqZWN0ID0gZnVuY3Rpb24odmFsdWUpIHtcclxuXHRcdFx0aWYgKCFzdGF0ZSkge1xyXG5cdFx0XHRcdHByb21pc2VWYWx1ZSA9IHZhbHVlO1xyXG5cdFx0XHRcdHN0YXRlID0gUkVKRUNUSU5HO1xyXG5cclxuXHRcdFx0XHRmaXJlKCk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9O1xyXG5cclxuXHRcdHNlbGYucHJvbWlzZS50aGVuID0gZnVuY3Rpb24oc3VjY2Vzc0NhbGxiYWNrLCBmYWlsdXJlQ2FsbGJhY2spIHtcclxuXHRcdFx0dmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkKHN1Y2Nlc3NDYWxsYmFjaywgZmFpbHVyZUNhbGxiYWNrKVxyXG5cdFx0XHRpZiAoc3RhdGUgPT09IFJFU09MVkVEKSB7XHJcblx0XHRcdFx0ZGVmZXJyZWQucmVzb2x2ZShwcm9taXNlVmFsdWUpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYgKHN0YXRlID09PSBSRUpFQ1RFRCkge1xyXG5cdFx0XHRcdGRlZmVycmVkLnJlamVjdChwcm9taXNlVmFsdWUpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdG5leHQucHVzaChkZWZlcnJlZCk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIGRlZmVycmVkLnByb21pc2VcclxuXHRcdH07XHJcblxyXG5cdFx0ZnVuY3Rpb24gZmluaXNoKHR5cGUpIHtcclxuXHRcdFx0c3RhdGUgPSB0eXBlIHx8IFJFSkVDVEVEO1xyXG5cdFx0XHRuZXh0Lm1hcChmdW5jdGlvbihkZWZlcnJlZCkge1xyXG5cdFx0XHRcdHN0YXRlID09PSBSRVNPTFZFRCA/IGRlZmVycmVkLnJlc29sdmUocHJvbWlzZVZhbHVlKSA6IGRlZmVycmVkLnJlamVjdChwcm9taXNlVmFsdWUpO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHJcblx0XHRmdW5jdGlvbiB0aGVubmFibGUodGhlbiwgc3VjY2Vzc0NhbGxiYWNrLCBmYWlsdXJlQ2FsbGJhY2ssIG5vdFRoZW5uYWJsZUNhbGxiYWNrKSB7XHJcblx0XHRcdGlmICgoKHByb21pc2VWYWx1ZSAhPSBudWxsICYmIGlzT2JqZWN0KHByb21pc2VWYWx1ZSkpIHx8IGlzRnVuY3Rpb24ocHJvbWlzZVZhbHVlKSkgJiYgaXNGdW5jdGlvbih0aGVuKSkge1xyXG5cdFx0XHRcdHRyeSB7XHJcblx0XHRcdFx0XHQvLyBjb3VudCBwcm90ZWN0cyBhZ2FpbnN0IGFidXNlIGNhbGxzIGZyb20gc3BlYyBjaGVja2VyXHJcblx0XHRcdFx0XHR2YXIgY291bnQgPSAwO1xyXG5cdFx0XHRcdFx0dGhlbi5jYWxsKHByb21pc2VWYWx1ZSwgZnVuY3Rpb24odmFsdWUpIHtcclxuXHRcdFx0XHRcdFx0aWYgKGNvdW50KyspIHJldHVybjtcclxuXHRcdFx0XHRcdFx0cHJvbWlzZVZhbHVlID0gdmFsdWU7XHJcblx0XHRcdFx0XHRcdHN1Y2Nlc3NDYWxsYmFjaygpO1xyXG5cdFx0XHRcdFx0fSwgZnVuY3Rpb24gKHZhbHVlKSB7XHJcblx0XHRcdFx0XHRcdGlmIChjb3VudCsrKSByZXR1cm47XHJcblx0XHRcdFx0XHRcdHByb21pc2VWYWx1ZSA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0XHRmYWlsdXJlQ2FsbGJhY2soKTtcclxuXHRcdFx0XHRcdH0pO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRjYXRjaCAoZSkge1xyXG5cdFx0XHRcdFx0bS5kZWZlcnJlZC5vbmVycm9yKGUpO1xyXG5cdFx0XHRcdFx0cHJvbWlzZVZhbHVlID0gZTtcclxuXHRcdFx0XHRcdGZhaWx1cmVDYWxsYmFjaygpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRub3RUaGVubmFibGVDYWxsYmFjaygpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0ZnVuY3Rpb24gZmlyZSgpIHtcclxuXHRcdFx0Ly8gY2hlY2sgaWYgaXQncyBhIHRoZW5hYmxlXHJcblx0XHRcdHZhciB0aGVuO1xyXG5cdFx0XHR0cnkge1xyXG5cdFx0XHRcdHRoZW4gPSBwcm9taXNlVmFsdWUgJiYgcHJvbWlzZVZhbHVlLnRoZW47XHJcblx0XHRcdH1cclxuXHRcdFx0Y2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRtLmRlZmVycmVkLm9uZXJyb3IoZSk7XHJcblx0XHRcdFx0cHJvbWlzZVZhbHVlID0gZTtcclxuXHRcdFx0XHRzdGF0ZSA9IFJFSkVDVElORztcclxuXHRcdFx0XHRyZXR1cm4gZmlyZSgpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR0aGVubmFibGUodGhlbiwgZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0c3RhdGUgPSBSRVNPTFZJTkc7XHJcblx0XHRcdFx0ZmlyZSgpO1xyXG5cdFx0XHR9LCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRzdGF0ZSA9IFJFSkVDVElORztcclxuXHRcdFx0XHRmaXJlKCk7XHJcblx0XHRcdH0sIGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdHRyeSB7XHJcblx0XHRcdFx0XHRpZiAoc3RhdGUgPT09IFJFU09MVklORyAmJiBpc0Z1bmN0aW9uKHN1Y2Nlc3NDYWxsYmFjaykpIHtcclxuXHRcdFx0XHRcdFx0cHJvbWlzZVZhbHVlID0gc3VjY2Vzc0NhbGxiYWNrKHByb21pc2VWYWx1ZSk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIGlmIChzdGF0ZSA9PT0gUkVKRUNUSU5HICYmIGlzRnVuY3Rpb24oZmFpbHVyZUNhbGxiYWNrKSkge1xyXG5cdFx0XHRcdFx0XHRwcm9taXNlVmFsdWUgPSBmYWlsdXJlQ2FsbGJhY2socHJvbWlzZVZhbHVlKTtcclxuXHRcdFx0XHRcdFx0c3RhdGUgPSBSRVNPTFZJTkc7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGNhdGNoIChlKSB7XHJcblx0XHRcdFx0XHRtLmRlZmVycmVkLm9uZXJyb3IoZSk7XHJcblx0XHRcdFx0XHRwcm9taXNlVmFsdWUgPSBlO1xyXG5cdFx0XHRcdFx0cmV0dXJuIGZpbmlzaCgpO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0aWYgKHByb21pc2VWYWx1ZSA9PT0gc2VsZikge1xyXG5cdFx0XHRcdFx0cHJvbWlzZVZhbHVlID0gVHlwZUVycm9yKCk7XHJcblx0XHRcdFx0XHRmaW5pc2goKTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0dGhlbm5hYmxlKHRoZW4sIGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0XHRcdFx0ZmluaXNoKFJFU09MVkVEKTtcclxuXHRcdFx0XHRcdH0sIGZpbmlzaCwgZnVuY3Rpb24gKCkge1xyXG5cdFx0XHRcdFx0XHRmaW5pc2goc3RhdGUgPT09IFJFU09MVklORyAmJiBSRVNPTFZFRCk7XHJcblx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRtLmRlZmVycmVkLm9uZXJyb3IgPSBmdW5jdGlvbihlKSB7XHJcblx0XHRpZiAodHlwZS5jYWxsKGUpID09PSBcIltvYmplY3QgRXJyb3JdXCIgJiYgIWUuY29uc3RydWN0b3IudG9TdHJpbmcoKS5tYXRjaCgvIEVycm9yLykpIHtcclxuXHRcdFx0cGVuZGluZ1JlcXVlc3RzID0gMDtcclxuXHRcdFx0dGhyb3cgZTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHRtLnN5bmMgPSBmdW5jdGlvbihhcmdzKSB7XHJcblx0XHR2YXIgbWV0aG9kID0gXCJyZXNvbHZlXCI7XHJcblxyXG5cdFx0ZnVuY3Rpb24gc3luY2hyb25pemVyKHBvcywgcmVzb2x2ZWQpIHtcclxuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uKHZhbHVlKSB7XHJcblx0XHRcdFx0cmVzdWx0c1twb3NdID0gdmFsdWU7XHJcblx0XHRcdFx0aWYgKCFyZXNvbHZlZCkgbWV0aG9kID0gXCJyZWplY3RcIjtcclxuXHRcdFx0XHRpZiAoLS1vdXRzdGFuZGluZyA9PT0gMCkge1xyXG5cdFx0XHRcdFx0ZGVmZXJyZWQucHJvbWlzZShyZXN1bHRzKTtcclxuXHRcdFx0XHRcdGRlZmVycmVkW21ldGhvZF0ocmVzdWx0cyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcclxuXHRcdFx0fTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgZGVmZXJyZWQgPSBtLmRlZmVycmVkKCk7XHJcblx0XHR2YXIgb3V0c3RhbmRpbmcgPSBhcmdzLmxlbmd0aDtcclxuXHRcdHZhciByZXN1bHRzID0gbmV3IEFycmF5KG91dHN0YW5kaW5nKTtcclxuXHRcdGlmIChhcmdzLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0Zm9yRWFjaChhcmdzLCBmdW5jdGlvbiAoYXJnLCBpKSB7XHJcblx0XHRcdFx0YXJnLnRoZW4oc3luY2hyb25pemVyKGksIHRydWUpLCBzeW5jaHJvbml6ZXIoaSwgZmFsc2UpKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIGRlZmVycmVkLnJlc29sdmUoW10pO1xyXG5cclxuXHRcdHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xyXG5cdH07XHJcblx0ZnVuY3Rpb24gaWRlbnRpdHkodmFsdWUpIHsgcmV0dXJuIHZhbHVlOyB9XHJcblxyXG5cdGZ1bmN0aW9uIGFqYXgob3B0aW9ucykge1xyXG5cdFx0aWYgKG9wdGlvbnMuZGF0YVR5cGUgJiYgb3B0aW9ucy5kYXRhVHlwZS50b0xvd2VyQ2FzZSgpID09PSBcImpzb25wXCIpIHtcclxuXHRcdFx0dmFyIGNhbGxiYWNrS2V5ID0gXCJtaXRocmlsX2NhbGxiYWNrX1wiICsgbmV3IERhdGUoKS5nZXRUaW1lKCkgKyBcIl9cIiArIChNYXRoLnJvdW5kKE1hdGgucmFuZG9tKCkgKiAxZTE2KSkudG9TdHJpbmcoMzYpXHJcblx0XHRcdHZhciBzY3JpcHQgPSAkZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcclxuXHJcblx0XHRcdHdpbmRvd1tjYWxsYmFja0tleV0gPSBmdW5jdGlvbihyZXNwKSB7XHJcblx0XHRcdFx0c2NyaXB0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoc2NyaXB0KTtcclxuXHRcdFx0XHRvcHRpb25zLm9ubG9hZCh7XHJcblx0XHRcdFx0XHR0eXBlOiBcImxvYWRcIixcclxuXHRcdFx0XHRcdHRhcmdldDoge1xyXG5cdFx0XHRcdFx0XHRyZXNwb25zZVRleHQ6IHJlc3BcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0XHR3aW5kb3dbY2FsbGJhY2tLZXldID0gdW5kZWZpbmVkO1xyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0c2NyaXB0Lm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRzY3JpcHQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChzY3JpcHQpO1xyXG5cclxuXHRcdFx0XHRvcHRpb25zLm9uZXJyb3Ioe1xyXG5cdFx0XHRcdFx0dHlwZTogXCJlcnJvclwiLFxyXG5cdFx0XHRcdFx0dGFyZ2V0OiB7XHJcblx0XHRcdFx0XHRcdHN0YXR1czogNTAwLFxyXG5cdFx0XHRcdFx0XHRyZXNwb25zZVRleHQ6IEpTT04uc3RyaW5naWZ5KHtcclxuXHRcdFx0XHRcdFx0XHRlcnJvcjogXCJFcnJvciBtYWtpbmcganNvbnAgcmVxdWVzdFwiXHJcblx0XHRcdFx0XHRcdH0pXHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdFx0d2luZG93W2NhbGxiYWNrS2V5XSA9IHVuZGVmaW5lZDtcclxuXHJcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRzY3JpcHQub25sb2FkID0gZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0c2NyaXB0LnNyYyA9IG9wdGlvbnMudXJsXHJcblx0XHRcdFx0KyAob3B0aW9ucy51cmwuaW5kZXhPZihcIj9cIikgPiAwID8gXCImXCIgOiBcIj9cIilcclxuXHRcdFx0XHQrIChvcHRpb25zLmNhbGxiYWNrS2V5ID8gb3B0aW9ucy5jYWxsYmFja0tleSA6IFwiY2FsbGJhY2tcIilcclxuXHRcdFx0XHQrIFwiPVwiICsgY2FsbGJhY2tLZXlcclxuXHRcdFx0XHQrIFwiJlwiICsgYnVpbGRRdWVyeVN0cmluZyhvcHRpb25zLmRhdGEgfHwge30pO1xyXG5cdFx0XHQkZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzY3JpcHQpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdHZhciB4aHIgPSBuZXcgd2luZG93LlhNTEh0dHBSZXF1ZXN0KCk7XHJcblx0XHRcdHhoci5vcGVuKG9wdGlvbnMubWV0aG9kLCBvcHRpb25zLnVybCwgdHJ1ZSwgb3B0aW9ucy51c2VyLCBvcHRpb25zLnBhc3N3b3JkKTtcclxuXHRcdFx0eGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xyXG5cdFx0XHRcdFx0aWYgKHhoci5zdGF0dXMgPj0gMjAwICYmIHhoci5zdGF0dXMgPCAzMDApIG9wdGlvbnMub25sb2FkKHt0eXBlOiBcImxvYWRcIiwgdGFyZ2V0OiB4aHJ9KTtcclxuXHRcdFx0XHRcdGVsc2Ugb3B0aW9ucy5vbmVycm9yKHt0eXBlOiBcImVycm9yXCIsIHRhcmdldDogeGhyfSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9O1xyXG5cdFx0XHRpZiAob3B0aW9ucy5zZXJpYWxpemUgPT09IEpTT04uc3RyaW5naWZ5ICYmIG9wdGlvbnMuZGF0YSAmJiBvcHRpb25zLm1ldGhvZCAhPT0gXCJHRVRcIikge1xyXG5cdFx0XHRcdHhoci5zZXRSZXF1ZXN0SGVhZGVyKFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRpZiAob3B0aW9ucy5kZXNlcmlhbGl6ZSA9PT0gSlNPTi5wYXJzZSkge1xyXG5cdFx0XHRcdHhoci5zZXRSZXF1ZXN0SGVhZGVyKFwiQWNjZXB0XCIsIFwiYXBwbGljYXRpb24vanNvbiwgdGV4dC8qXCIpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChpc0Z1bmN0aW9uKG9wdGlvbnMuY29uZmlnKSkge1xyXG5cdFx0XHRcdHZhciBtYXliZVhociA9IG9wdGlvbnMuY29uZmlnKHhociwgb3B0aW9ucyk7XHJcblx0XHRcdFx0aWYgKG1heWJlWGhyICE9IG51bGwpIHhociA9IG1heWJlWGhyO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR2YXIgZGF0YSA9IG9wdGlvbnMubWV0aG9kID09PSBcIkdFVFwiIHx8ICFvcHRpb25zLmRhdGEgPyBcIlwiIDogb3B0aW9ucy5kYXRhO1xyXG5cdFx0XHRpZiAoZGF0YSAmJiAoIWlzU3RyaW5nKGRhdGEpICYmIGRhdGEuY29uc3RydWN0b3IgIT09IHdpbmRvdy5Gb3JtRGF0YSkpIHtcclxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJSZXF1ZXN0IGRhdGEgc2hvdWxkIGJlIGVpdGhlciBiZSBhIHN0cmluZyBvciBGb3JtRGF0YS4gQ2hlY2sgdGhlIGBzZXJpYWxpemVgIG9wdGlvbiBpbiBgbS5yZXF1ZXN0YFwiKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR4aHIuc2VuZChkYXRhKTtcclxuXHRcdFx0cmV0dXJuIHhocjtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGJpbmREYXRhKHhock9wdGlvbnMsIGRhdGEsIHNlcmlhbGl6ZSkge1xyXG5cdFx0aWYgKHhock9wdGlvbnMubWV0aG9kID09PSBcIkdFVFwiICYmIHhock9wdGlvbnMuZGF0YVR5cGUgIT09IFwianNvbnBcIikge1xyXG5cdFx0XHR2YXIgcHJlZml4ID0geGhyT3B0aW9ucy51cmwuaW5kZXhPZihcIj9cIikgPCAwID8gXCI/XCIgOiBcIiZcIjtcclxuXHRcdFx0dmFyIHF1ZXJ5c3RyaW5nID0gYnVpbGRRdWVyeVN0cmluZyhkYXRhKTtcclxuXHRcdFx0eGhyT3B0aW9ucy51cmwgPSB4aHJPcHRpb25zLnVybCArIChxdWVyeXN0cmluZyA/IHByZWZpeCArIHF1ZXJ5c3RyaW5nIDogXCJcIik7XHJcblx0XHR9XHJcblx0XHRlbHNlIHhock9wdGlvbnMuZGF0YSA9IHNlcmlhbGl6ZShkYXRhKTtcclxuXHRcdHJldHVybiB4aHJPcHRpb25zO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gcGFyYW1ldGVyaXplVXJsKHVybCwgZGF0YSkge1xyXG5cdFx0dmFyIHRva2VucyA9IHVybC5tYXRjaCgvOlthLXpdXFx3Ky9naSk7XHJcblx0XHRpZiAodG9rZW5zICYmIGRhdGEpIHtcclxuXHRcdFx0Zm9yRWFjaCh0b2tlbnMsIGZ1bmN0aW9uICh0b2tlbikge1xyXG5cdFx0XHRcdHZhciBrZXkgPSB0b2tlbi5zbGljZSgxKTtcclxuXHRcdFx0XHR1cmwgPSB1cmwucmVwbGFjZSh0b2tlbiwgZGF0YVtrZXldKTtcclxuXHRcdFx0XHRkZWxldGUgZGF0YVtrZXldO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB1cmw7XHJcblx0fVxyXG5cclxuXHRtLnJlcXVlc3QgPSBmdW5jdGlvbih4aHJPcHRpb25zKSB7XHJcblx0XHRpZiAoeGhyT3B0aW9ucy5iYWNrZ3JvdW5kICE9PSB0cnVlKSBtLnN0YXJ0Q29tcHV0YXRpb24oKTtcclxuXHRcdHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZCgpO1xyXG5cdFx0dmFyIGlzSlNPTlAgPSB4aHJPcHRpb25zLmRhdGFUeXBlICYmIHhock9wdGlvbnMuZGF0YVR5cGUudG9Mb3dlckNhc2UoKSA9PT0gXCJqc29ucFwiXHJcblx0XHR2YXIgc2VyaWFsaXplID0geGhyT3B0aW9ucy5zZXJpYWxpemUgPSBpc0pTT05QID8gaWRlbnRpdHkgOiB4aHJPcHRpb25zLnNlcmlhbGl6ZSB8fCBKU09OLnN0cmluZ2lmeTtcclxuXHRcdHZhciBkZXNlcmlhbGl6ZSA9IHhock9wdGlvbnMuZGVzZXJpYWxpemUgPSBpc0pTT05QID8gaWRlbnRpdHkgOiB4aHJPcHRpb25zLmRlc2VyaWFsaXplIHx8IEpTT04ucGFyc2U7XHJcblx0XHR2YXIgZXh0cmFjdCA9IGlzSlNPTlAgPyBmdW5jdGlvbihqc29ucCkgeyByZXR1cm4ganNvbnAucmVzcG9uc2VUZXh0IH0gOiB4aHJPcHRpb25zLmV4dHJhY3QgfHwgZnVuY3Rpb24oeGhyKSB7XHJcblx0XHRcdGlmICh4aHIucmVzcG9uc2VUZXh0Lmxlbmd0aCA9PT0gMCAmJiBkZXNlcmlhbGl6ZSA9PT0gSlNPTi5wYXJzZSkge1xyXG5cdFx0XHRcdHJldHVybiBudWxsXHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0cmV0dXJuIHhoci5yZXNwb25zZVRleHRcclxuXHRcdFx0fVxyXG5cdFx0fTtcclxuXHRcdHhock9wdGlvbnMubWV0aG9kID0gKHhock9wdGlvbnMubWV0aG9kIHx8IFwiR0VUXCIpLnRvVXBwZXJDYXNlKCk7XHJcblx0XHR4aHJPcHRpb25zLnVybCA9IHBhcmFtZXRlcml6ZVVybCh4aHJPcHRpb25zLnVybCwgeGhyT3B0aW9ucy5kYXRhKTtcclxuXHRcdHhock9wdGlvbnMgPSBiaW5kRGF0YSh4aHJPcHRpb25zLCB4aHJPcHRpb25zLmRhdGEsIHNlcmlhbGl6ZSk7XHJcblx0XHR4aHJPcHRpb25zLm9ubG9hZCA9IHhock9wdGlvbnMub25lcnJvciA9IGZ1bmN0aW9uKGUpIHtcclxuXHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRlID0gZSB8fCBldmVudDtcclxuXHRcdFx0XHR2YXIgdW53cmFwID0gKGUudHlwZSA9PT0gXCJsb2FkXCIgPyB4aHJPcHRpb25zLnVud3JhcFN1Y2Nlc3MgOiB4aHJPcHRpb25zLnVud3JhcEVycm9yKSB8fCBpZGVudGl0eTtcclxuXHRcdFx0XHR2YXIgcmVzcG9uc2UgPSB1bndyYXAoZGVzZXJpYWxpemUoZXh0cmFjdChlLnRhcmdldCwgeGhyT3B0aW9ucykpLCBlLnRhcmdldCk7XHJcblx0XHRcdFx0aWYgKGUudHlwZSA9PT0gXCJsb2FkXCIpIHtcclxuXHRcdFx0XHRcdGlmIChpc0FycmF5KHJlc3BvbnNlKSAmJiB4aHJPcHRpb25zLnR5cGUpIHtcclxuXHRcdFx0XHRcdFx0Zm9yRWFjaChyZXNwb25zZSwgZnVuY3Rpb24gKHJlcywgaSkge1xyXG5cdFx0XHRcdFx0XHRcdHJlc3BvbnNlW2ldID0gbmV3IHhock9wdGlvbnMudHlwZShyZXMpO1xyXG5cdFx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoeGhyT3B0aW9ucy50eXBlKSB7XHJcblx0XHRcdFx0XHRcdHJlc3BvbnNlID0gbmV3IHhock9wdGlvbnMudHlwZShyZXNwb25zZSk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRkZWZlcnJlZFtlLnR5cGUgPT09IFwibG9hZFwiID8gXCJyZXNvbHZlXCIgOiBcInJlamVjdFwiXShyZXNwb25zZSk7XHJcblx0XHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRtLmRlZmVycmVkLm9uZXJyb3IoZSk7XHJcblx0XHRcdFx0ZGVmZXJyZWQucmVqZWN0KGUpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAoeGhyT3B0aW9ucy5iYWNrZ3JvdW5kICE9PSB0cnVlKSBtLmVuZENvbXB1dGF0aW9uKClcclxuXHRcdH1cclxuXHJcblx0XHRhamF4KHhock9wdGlvbnMpO1xyXG5cdFx0ZGVmZXJyZWQucHJvbWlzZSA9IHByb3BpZnkoZGVmZXJyZWQucHJvbWlzZSwgeGhyT3B0aW9ucy5pbml0aWFsVmFsdWUpO1xyXG5cdFx0cmV0dXJuIGRlZmVycmVkLnByb21pc2U7XHJcblx0fTtcclxuXHJcblx0Ly90ZXN0aW5nIEFQSVxyXG5cdG0uZGVwcyA9IGZ1bmN0aW9uKG1vY2spIHtcclxuXHRcdGluaXRpYWxpemUod2luZG93ID0gbW9jayB8fCB3aW5kb3cpO1xyXG5cdFx0cmV0dXJuIHdpbmRvdztcclxuXHR9O1xyXG5cdC8vZm9yIGludGVybmFsIHRlc3Rpbmcgb25seSwgZG8gbm90IHVzZSBgbS5kZXBzLmZhY3RvcnlgXHJcblx0bS5kZXBzLmZhY3RvcnkgPSBhcHA7XHJcblxyXG5cdHJldHVybiBtO1xyXG59KSh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pO1xyXG5cclxuaWYgKHR5cGVvZiBtb2R1bGUgPT09IFwib2JqZWN0XCIgJiYgbW9kdWxlICE9IG51bGwgJiYgbW9kdWxlLmV4cG9ydHMpIG1vZHVsZS5leHBvcnRzID0gbTtcclxuZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIGRlZmluZShmdW5jdGlvbigpIHsgcmV0dXJuIG0gfSk7XHJcbiIsInZhciBtID0gcmVxdWlyZSgnbWl0aHJpbCcpO1xyXG52YXIgZ3JvdW5kQnVpbGQgPSByZXF1aXJlKCcuL2dyb3VuZCcpO1xyXG52YXIgZ2VuZXJhdGUgPSByZXF1aXJlKCcuLi8uLi9nZW5lcmF0ZS9zcmMvZ2VuZXJhdGUnKTtcclxudmFyIGRpYWdyYW0gPSByZXF1aXJlKCcuLi8uLi9nZW5lcmF0ZS9zcmMvZGlhZ3JhbScpO1xyXG52YXIgZmVuZGF0YSA9IHJlcXVpcmUoJy4uLy4uL2dlbmVyYXRlL3NyYy9mZW5kYXRhJyk7XHJcbnZhciBxdWVyeXBhcmFtID0gcmVxdWlyZSgnLi91dGlsL3F1ZXJ5cGFyYW0nKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0cywgaTE4bikge1xyXG5cclxuICB2YXIgZmVuID0gbS5wcm9wKG9wdHMuZmVuKTtcclxuICB2YXIgZmVhdHVyZXMgPSBtLnByb3AoZ2VuZXJhdGUuZXh0cmFjdEZlYXR1cmVzKGZlbigpKSk7XHJcbiAgdmFyIGdyb3VuZDtcclxuXHJcbiAgZnVuY3Rpb24gc2hvd0dyb3VuZCgpIHtcclxuICAgIGlmICghZ3JvdW5kKSBncm91bmQgPSBncm91bmRCdWlsZChmZW4oKSwgb25TcXVhcmVTZWxlY3QpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25TcXVhcmVTZWxlY3QodGFyZ2V0KSB7XHJcbiAgICBvbkZpbHRlclNlbGVjdChudWxsLCBudWxsLCB0YXJnZXQpO1xyXG4gICAgbS5yZWRyYXcoKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uRmlsdGVyU2VsZWN0KHNpZGUsIGRlc2NyaXB0aW9uLCB0YXJnZXQpIHtcclxuICAgIGRpYWdyYW0uY2xlYXJEaWFncmFtcyhmZWF0dXJlcygpKTtcclxuICAgIGdyb3VuZC5zZXRTaGFwZXMoW10pO1xyXG4gICAgZ3JvdW5kLnNldCh7XHJcbiAgICAgIGZlbjogZmVuKCksXHJcbiAgICB9KTtcclxuICAgIGdyb3VuZC5zZXRTaGFwZXMoZGlhZ3JhbS5kaWFncmFtRm9yVGFyZ2V0KHNpZGUsIGRlc2NyaXB0aW9uLCB0YXJnZXQsIGZlYXR1cmVzKCkpKTtcclxuICAgIHF1ZXJ5cGFyYW0udXBkYXRlVXJsV2l0aFN0YXRlKGZlbigpLCBzaWRlLCBkZXNjcmlwdGlvbiwgdGFyZ2V0KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNob3dBbGwoKSB7XHJcbiAgICBncm91bmQuc2V0U2hhcGVzKGRpYWdyYW0uYWxsRGlhZ3JhbXMoZmVhdHVyZXMoKSkpO1xyXG4gICAgcXVlcnlwYXJhbS51cGRhdGVVcmxXaXRoU3RhdGUoZmVuKCksIG51bGwsIG51bGwsIFwiYWxsXCIpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdXBkYXRlRmVuKHZhbHVlKSB7XHJcbiAgICBmZW4odmFsdWUpO1xyXG4gICAgZ3JvdW5kLnNldCh7XHJcbiAgICAgIGZlbjogZmVuKCksXHJcbiAgICB9KTtcclxuICAgIGdyb3VuZC5zZXRTaGFwZXMoW10pO1xyXG4gICAgZmVhdHVyZXMoZ2VuZXJhdGUuZXh0cmFjdEZlYXR1cmVzKGZlbigpKSk7XHJcbiAgICBxdWVyeXBhcmFtLnVwZGF0ZVVybFdpdGhTdGF0ZShmZW4oKSwgbnVsbCwgbnVsbCwgbnVsbCk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBuZXh0RmVuKGRlc3QpIHtcclxuICAgIHVwZGF0ZUZlbihmZW5kYXRhW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGZlbmRhdGEubGVuZ3RoKV0pO1xyXG4gIH1cclxuXHJcbiAgc2hvd0dyb3VuZCgpO1xyXG4gIG0ucmVkcmF3KCk7XHJcbiAgb25GaWx0ZXJTZWxlY3Qob3B0cy5zaWRlLCBvcHRzLmRlc2NyaXB0aW9uLCBvcHRzLnRhcmdldCk7XHJcbiAgaWYgKG9wdHMudGFyZ2V0ID09PSAnYWxsJykge1xyXG4gICAgc2hvd0FsbCgpOyAgICBcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBmZW46IGZlbixcclxuICAgIGdyb3VuZDogZ3JvdW5kLFxyXG4gICAgZmVhdHVyZXM6IGZlYXR1cmVzLFxyXG4gICAgdXBkYXRlRmVuOiB1cGRhdGVGZW4sXHJcbiAgICBvbkZpbHRlclNlbGVjdDogb25GaWx0ZXJTZWxlY3QsXHJcbiAgICBvblNxdWFyZVNlbGVjdDogb25TcXVhcmVTZWxlY3QsXHJcbiAgICBuZXh0RmVuOiBuZXh0RmVuLFxyXG4gICAgc2hvd0FsbDogc2hvd0FsbFxyXG4gIH07XHJcbn07XHJcbiIsInZhciBjaGVzc2dyb3VuZCA9IHJlcXVpcmUoJ2NoZXNzZ3JvdW5kJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGZlbiwgb25TZWxlY3QpIHtcclxuICByZXR1cm4gbmV3IGNoZXNzZ3JvdW5kLmNvbnRyb2xsZXIoe1xyXG4gICAgZmVuOiBmZW4sXHJcbiAgICB2aWV3T25seTogZmFsc2UsXHJcbiAgICB0dXJuQ29sb3I6ICd3aGl0ZScsXHJcbiAgICBhbmltYXRpb246IHtcclxuICAgICAgZHVyYXRpb246IDIwMFxyXG4gICAgfSxcclxuICAgIGhpZ2hsaWdodDoge1xyXG4gICAgICBsYXN0TW92ZTogZmFsc2VcclxuICAgIH0sXHJcbiAgICBtb3ZhYmxlOiB7XHJcbiAgICAgIGZyZWU6IGZhbHNlLFxyXG4gICAgICBjb2xvcjogJ3doaXRlJyxcclxuICAgICAgcHJlbW92ZTogdHJ1ZSxcclxuICAgICAgZGVzdHM6IFtdLFxyXG4gICAgICBzaG93RGVzdHM6IGZhbHNlLFxyXG4gICAgICBldmVudHM6IHtcclxuICAgICAgICBhZnRlcjogZnVuY3Rpb24oKSB7fVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgZHJhd2FibGU6IHtcclxuICAgICAgZW5hYmxlZDogdHJ1ZVxyXG4gICAgfSxcclxuICAgIGV2ZW50czoge1xyXG4gICAgICBtb3ZlOiBmdW5jdGlvbihvcmlnLCBkZXN0LCBjYXB0dXJlZFBpZWNlKSB7XHJcbiAgICAgICAgb25TZWxlY3QoZGVzdCk7XHJcbiAgICAgIH0sXHJcbiAgICAgIHNlbGVjdDogZnVuY3Rpb24oa2V5KSB7XHJcbiAgICAgICAgb25TZWxlY3Qoa2V5KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG59O1xyXG4iLCJ2YXIgbSA9IHJlcXVpcmUoJ21pdGhyaWwnKTtcclxudmFyIGN0cmwgPSByZXF1aXJlKCcuL2N0cmwnKTtcclxudmFyIHZpZXcgPSByZXF1aXJlKCcuL3ZpZXcvbWFpbicpO1xyXG52YXIgcXVlcnlwYXJhbSA9IHJlcXVpcmUoJy4vdXRpbC9xdWVyeXBhcmFtJyk7XHJcblxyXG5mdW5jdGlvbiBtYWluKG9wdHMpIHtcclxuICAgIHZhciBjb250cm9sbGVyID0gbmV3IGN0cmwob3B0cyk7XHJcbiAgICBtLm1vdW50KG9wdHMuZWxlbWVudCwge1xyXG4gICAgICAgIGNvbnRyb2xsZXI6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY29udHJvbGxlcjtcclxuICAgICAgICB9LFxyXG4gICAgICAgIHZpZXc6IHZpZXdcclxuICAgIH0pO1xyXG59XHJcblxyXG52YXIgZmVuID0gcXVlcnlwYXJhbS5nZXRQYXJhbWV0ZXJCeU5hbWUoJ2ZlbicpO1xyXG52YXIgc2lkZSA9IHF1ZXJ5cGFyYW0uZ2V0UGFyYW1ldGVyQnlOYW1lKCdzaWRlJyk7XHJcbnZhciBkZXNjcmlwdGlvbiA9IHF1ZXJ5cGFyYW0uZ2V0UGFyYW1ldGVyQnlOYW1lKCdkZXNjcmlwdGlvbicpO1xyXG52YXIgdGFyZ2V0ID0gcXVlcnlwYXJhbS5nZXRQYXJhbWV0ZXJCeU5hbWUoJ3RhcmdldCcpO1xyXG5cclxuaWYgKCFzaWRlICYmICFkZXNjcmlwdGlvbiAmJiAhdGFyZ2V0KSB7XHJcbiAgICB0YXJnZXQgPSAnbm9uZSc7XHJcbn1cclxubWFpbih7XHJcbiAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIndyYXBwZXJcIiksXHJcbiAgICBmZW46IGZlbiA/IGZlbiA6IFwiYjNrMnIvMXAzcHAxLzVwMi81bjIvOC81TjIvNlBQLzVLMVIgdyAtIC0gMCAxXCIsXHJcbiAgICBzaWRlOiBzaWRlLFxyXG4gICAgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uLFxyXG4gICAgdGFyZ2V0OiB0YXJnZXRcclxufSk7XHJcbiIsIi8qIGdsb2JhbCBoaXN0b3J5ICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuXHJcbiAgICBnZXRQYXJhbWV0ZXJCeU5hbWU6IGZ1bmN0aW9uKG5hbWUsIHVybCkge1xyXG4gICAgICAgIGlmICghdXJsKSB7XHJcbiAgICAgICAgICAgIHVybCA9IHdpbmRvdy5sb2NhdGlvbi5ocmVmO1xyXG4gICAgICAgIH1cclxuICAgICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC9bXFxbXFxdXS9nLCBcIlxcXFwkJlwiKTtcclxuICAgICAgICB2YXIgcmVnZXggPSBuZXcgUmVnRXhwKFwiWz8mXVwiICsgbmFtZSArIFwiKD0oW14mI10qKXwmfCN8JClcIiksXHJcbiAgICAgICAgICAgIHJlc3VsdHMgPSByZWdleC5leGVjKHVybCk7XHJcbiAgICAgICAgaWYgKCFyZXN1bHRzKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBpZiAoIXJlc3VsdHNbMl0pIHJldHVybiAnJztcclxuICAgICAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHJlc3VsdHNbMl0ucmVwbGFjZSgvXFwrL2csIFwiIFwiKSk7XHJcbiAgICB9LFxyXG5cclxuICAgIHVwZGF0ZVVybFdpdGhTdGF0ZTogZnVuY3Rpb24oZmVuLCBzaWRlLCBkZXNjcmlwdGlvbiwgdGFyZ2V0KSB7XHJcbiAgICAgICAgaWYgKGhpc3RvcnkucHVzaFN0YXRlKSB7XHJcbiAgICAgICAgICAgIHZhciBuZXd1cmwgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgKyBcIi8vXCIgK1xyXG4gICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhvc3QgK1xyXG4gICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICtcclxuICAgICAgICAgICAgICAgICc/ZmVuPScgKyBlbmNvZGVVUklDb21wb25lbnQoZmVuKSArXHJcbiAgICAgICAgICAgICAgICAoc2lkZSA/IFwiJnNpZGU9XCIgKyBlbmNvZGVVUklDb21wb25lbnQoc2lkZSkgOiBcIlwiKSArXHJcbiAgICAgICAgICAgICAgICAoZGVzY3JpcHRpb24gPyBcIiZkZXNjcmlwdGlvbj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChkZXNjcmlwdGlvbikgOiBcIlwiKSArXHJcbiAgICAgICAgICAgICAgICAodGFyZ2V0ID8gXCImdGFyZ2V0PVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRhcmdldCkgOiBcIlwiKTtcclxuICAgICAgICAgICAgd2luZG93Lmhpc3RvcnkucHVzaFN0YXRlKHtcclxuICAgICAgICAgICAgICAgIHBhdGg6IG5ld3VybFxyXG4gICAgICAgICAgICB9LCAnJywgbmV3dXJsKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZXZlbnQpIHtcclxuICAgIGlmIChldmVudCkge1xyXG4gICAgICAgIGlmIChldmVudC5zdG9wUHJvcGFnYXRpb24pIHtcclxuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKCFlKSB2YXIgZSA9IHdpbmRvdy5ldmVudDtcclxuICAgIGUuY2FuY2VsQnViYmxlID0gdHJ1ZTtcclxuICAgIGlmIChlLnN0b3BQcm9wYWdhdGlvbikgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxufTtcclxuIiwidmFyIG0gPSByZXF1aXJlKCdtaXRocmlsJyk7XHJcbnZhciBzdG9wZXZlbnQgPSByZXF1aXJlKCcuLi91dGlsL3N0b3BldmVudCcpO1xyXG5cclxuZnVuY3Rpb24gbWFrZVN0YXJzKGNvbnRyb2xsZXIsIGZlYXR1cmUpIHtcclxuICAgIHJldHVybiBmZWF0dXJlLnRhcmdldHMubWFwKHQgPT4gbSgnc3Bhbi5zdGFyJywge1xyXG4gICAgICAgIHRpdGxlOiB0LnRhcmdldCxcclxuICAgICAgICBvbmNsaWNrOiBmdW5jdGlvbihldmVudCkge1xyXG4gICAgICAgICAgICBjb250cm9sbGVyLm9uRmlsdGVyU2VsZWN0KGZlYXR1cmUuc2lkZSwgZmVhdHVyZS5kZXNjcmlwdGlvbiwgdC50YXJnZXQpO1xyXG4gICAgICAgICAgICByZXR1cm4gc3RvcGV2ZW50KGV2ZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9LCB0LnNlbGVjdGVkID8gbSgnc3Bhbi5zdGFyLnNlbGVjdGVkJywgJ+KYhScpIDogbSgnc3Bhbi5zdGFyJywgJ+KYhicpKSk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY29udHJvbGxlciwgZmVhdHVyZSkge1xyXG4gICAgaWYgKGZlYXR1cmUudGFyZ2V0cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbSgnbGkuZmVhdHVyZS5idXR0b24nLCB7XHJcbiAgICAgICAgb25jbGljazogZnVuY3Rpb24oZXZlbnQpIHtcclxuICAgICAgICAgICAgY29udHJvbGxlci5vbkZpbHRlclNlbGVjdChmZWF0dXJlLnNpZGUsIGZlYXR1cmUuZGVzY3JpcHRpb24pO1xyXG4gICAgICAgICAgICByZXR1cm4gc3RvcGV2ZW50KGV2ZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9LCBbXHJcbiAgICAgICAgbSgnZGl2Lm5hbWUnLCBmZWF0dXJlLmRlc2NyaXB0aW9uKSxcclxuICAgICAgICBtKCdkaXYuc3RhcnMnLCBtYWtlU3RhcnMoY29udHJvbGxlciwgZmVhdHVyZSkpXHJcbiAgICBdKTtcclxufTtcclxuIiwidmFyIG0gPSByZXF1aXJlKCdtaXRocmlsJyk7XHJcbnZhciBmZWF0dXJlID0gcmVxdWlyZSgnLi9mZWF0dXJlJyk7XHJcbnZhciBzdG9wZXZlbnQgPSByZXF1aXJlKCcuLi91dGlsL3N0b3BldmVudCcpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjb250cm9sbGVyKSB7XHJcbiAgcmV0dXJuIG0oJ2Rpdi5mZWF0dXJlc2FsbCcsIFtcclxuICAgIG0oJ2Rpdi5mZWF0dXJlcy5ib3RoLmJ1dHRvbicsIHtcclxuICAgICAgb25jbGljazogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgY29udHJvbGxlci5zaG93QWxsKCk7XHJcbiAgICAgIH1cclxuICAgIH0sIFtcclxuICAgICAgbSgncCcsICdBbGwnKSxcclxuICAgICAgbSgnZGl2LmZlYXR1cmVzLmJsYWNrLmJ1dHRvbicsIHtcclxuICAgICAgICBvbmNsaWNrOiBmdW5jdGlvbihldmVudCkge1xyXG4gICAgICAgICAgY29udHJvbGxlci5vbkZpbHRlclNlbGVjdCgnYicsIG51bGwsIG51bGwpO1xyXG4gICAgICAgICAgcmV0dXJuIHN0b3BldmVudChldmVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LCBbXHJcbiAgICAgICAgbSgncCcsICdCbGFjaycpLFxyXG4gICAgICAgIG0oJ3VsLmZlYXR1cmVzLmJsYWNrJywgY29udHJvbGxlci5mZWF0dXJlcygpLmZpbHRlcihmID0+IGYuc2lkZSA9PT0gJ2InKS5tYXAoZiA9PiBmZWF0dXJlKGNvbnRyb2xsZXIsIGYpKSlcclxuICAgICAgXSksXHJcbiAgICAgIG0oJ2Rpdi5mZWF0dXJlcy53aGl0ZS5idXR0b24nLCB7XHJcbiAgICAgICAgb25jbGljazogZnVuY3Rpb24oZXZlbnQpIHtcclxuICAgICAgICAgIGNvbnRyb2xsZXIub25GaWx0ZXJTZWxlY3QoJ3cnLCBudWxsLCBudWxsKTtcclxuICAgICAgICAgIHJldHVybiBzdG9wZXZlbnQoZXZlbnQpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSwgW1xyXG4gICAgICAgIG0oJ3AnLCAnV2hpdGUnKSxcclxuICAgICAgICBtKCd1bC5mZWF0dXJlcy53aGl0ZScsIGNvbnRyb2xsZXIuZmVhdHVyZXMoKS5maWx0ZXIoZiA9PiBmLnNpZGUgPT09ICd3JykubWFwKGYgPT4gZmVhdHVyZShjb250cm9sbGVyLCBmKSkpXHJcbiAgICAgIF0pXHJcbiAgICBdKVxyXG4gIF0pO1xyXG59O1xyXG4iLCJ2YXIgbSA9IHJlcXVpcmUoJ21pdGhyaWwnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY29udHJvbGxlcikge1xyXG4gIHJldHVybiBbXHJcbiAgICBtKCdpbnB1dC5jb3B5YWJsZS5hdXRvc2VsZWN0LmZlbmlucHV0Jywge1xyXG4gICAgICBzcGVsbGNoZWNrOiBmYWxzZSxcclxuICAgICAgdmFsdWU6IGNvbnRyb2xsZXIuZmVuKCksXHJcbiAgICAgIG9uaW5wdXQ6IG0ud2l0aEF0dHIoJ3ZhbHVlJywgY29udHJvbGxlci51cGRhdGVGZW4pLFxyXG4gICAgICBvbmNsaWNrOiBmdW5jdGlvbigpIHtcclxuICAgICAgICB0aGlzLnNlbGVjdCgpO1xyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIF07XHJcbn07XHJcbiIsInZhciBtID0gcmVxdWlyZSgnbWl0aHJpbCcpO1xyXG52YXIgY2hlc3Nncm91bmQgPSByZXF1aXJlKCdjaGVzc2dyb3VuZCcpO1xyXG52YXIgZmVuYmFyID0gcmVxdWlyZSgnLi9mZW5iYXInKTtcclxudmFyIGZlYXR1cmVzID0gcmVxdWlyZSgnLi9mZWF0dXJlcycpO1xyXG5cclxuZnVuY3Rpb24gdmlzdWFsQm9hcmQoY3RybCkge1xyXG4gIHJldHVybiBtKCdkaXYubGljaGVzc19ib2FyZCcsIG0oJ2Rpdi5saWNoZXNzX2JvYXJkX3dyYXAnLCBtKCdkaXYubGljaGVzc19ib2FyZCcsIFtcclxuICAgIGNoZXNzZ3JvdW5kLnZpZXcoY3RybC5ncm91bmQpXHJcbiAgXSkpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaW5mbyhjdHJsKSB7XHJcbiAgcmV0dXJuIFttKCdkaXYuZXhwbGFuYXRpb24nLCBbXHJcbiAgICBtKCdwJywgJ1RvIGltcHJvdmUgYXQgdGFjdGljcyB5b3UgZmlyc3QgbmVlZCB0byBpbXByb3ZlIHlvdXIgdmlzaW9uIG9mIHRoZSB0YWN0aWNhbCBmZWF0dXJlcyBwcmVzZW50IGluIHRoZSBwb3NpdGlvbi4nKSxcclxuICAgIG0oJ3AuYXV0aG9yJywgJy0gbGljaGVzcy5vcmcgc3RyZWFtZXInKSxcclxuICAgIG0oJ2JyJyksXHJcbiAgICBtKCdicicpLFxyXG4gICAgbSgndWwuaW5zdHJ1Y3Rpb25zJywgW1xyXG4gICAgICBtKCdsaS5pbnN0cnVjdGlvbnMnLCAnUGFzdGUgeW91ciBGRU4gcG9zaXRpb24gYmVsb3cuJyksXHJcbiAgICAgIG0oJ2xpLmluc3RydWN0aW9ucycsICdDbGljayBvbiB0aGUgaWRlbnRpZmllZCBmZWF0dXJlcy4nKSxcclxuICAgICAgbSgnbGkuaW5zdHJ1Y3Rpb25zJywgJ0NvcHkgdGhlIFVSTCBhbmQgc2hhcmUuJylcclxuICAgIF0pLFxyXG4gICAgbSgnYnInKSxcclxuICAgIG0oJ2JyJyksXHJcbiAgICBtKCdkaXYuYnV0dG9uLm5ld2dhbWUnLCB7XHJcbiAgICAgIG9uY2xpY2s6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHdpbmRvdy5vcGVuKCcuL3F1aXouaHRtbCcpO1xyXG4gICAgICB9XHJcbiAgICB9LCAnVHJhaW5lcicpLFxyXG4gICAgbSgnYnInKSxcclxuICAgIG0oJ2JyJyksXHJcbiAgICBtKCdkaXYuYnV0dG9uLm5ld2dhbWUnLCB7XHJcbiAgICAgIG9uY2xpY2s6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGN0cmwubmV4dEZlbigpO1xyXG4gICAgICB9XHJcbiAgICB9LCAnUmFuZG9tIFBvc2l0aW9uJylcclxuICBdKV07XHJcbn1cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjdHJsKSB7XHJcbiAgcmV0dXJuIFtcclxuICAgIG0oXCJkaXYuI3NpdGVfaGVhZGVyXCIsXHJcbiAgICAgIG0oJ2Rpdi5ib2FyZF9sZWZ0JywgW1xyXG4gICAgICAgIG0oJ2gyJyxcclxuICAgICAgICAgIG0oJ2Ejc2l0ZV90aXRsZScsICdmZWF0dXJlJyxcclxuICAgICAgICAgICAgbSgnc3Bhbi5leHRlbnNpb24nLCAndHJvbicpKSksXHJcbiAgICAgICAgZmVhdHVyZXMoY3RybClcclxuICAgICAgXSlcclxuICAgICksXHJcbiAgICBtKCdkaXYuI2xpY2hlc3MnLFxyXG4gICAgICBtKCdkaXYuYW5hbHlzZS5jZy01MTInLCBbXHJcbiAgICAgICAgbSgnZGl2JyxcclxuICAgICAgICAgIG0oJ2Rpdi5saWNoZXNzX2dhbWUnLCBbXHJcbiAgICAgICAgICAgIHZpc3VhbEJvYXJkKGN0cmwpLFxyXG4gICAgICAgICAgICBtKCdkaXYubGljaGVzc19ncm91bmQnLCBpbmZvKGN0cmwpKVxyXG4gICAgICAgICAgXSlcclxuICAgICAgICApLFxyXG4gICAgICAgIG0oJ2Rpdi51bmRlcmJvYXJkJywgW1xyXG4gICAgICAgICAgbSgnZGl2LmNlbnRlcicsIFtcclxuICAgICAgICAgICAgZmVuYmFyKGN0cmwpLFxyXG4gICAgICAgICAgICBtKCdicicpLFxyXG4gICAgICAgICAgICBtKCdzbWFsbCcsICdEYXRhIGF1dG9nZW5lcmF0ZWQgZnJvbSBnYW1lcyBvbiAnLCBtKFwiYS5leHRlcm5hbFtocmVmPSdodHRwOi8vbGljaGVzcy5vcmcnXVwiLCAnbGljaGVzcy5vcmcuJykpLFxyXG4gICAgICAgICAgICBtKCdzbWFsbCcsIFtcclxuICAgICAgICAgICAgICAnVXNlcyBsaWJyYXJpZXMgJywgbShcImEuZXh0ZXJuYWxbaHJlZj0naHR0cHM6Ly9naXRodWIuY29tL29ybmljYXIvY2hlc3Nncm91bmQnXVwiLCAnY2hlc3Nncm91bmQnKSxcclxuICAgICAgICAgICAgICAnIGFuZCAnLCBtKFwiYS5leHRlcm5hbFtocmVmPSdodHRwczovL2dpdGh1Yi5jb20vamhseXdhL2NoZXNzLmpzJ11cIiwgJ2NoZXNzanMuJyksXHJcbiAgICAgICAgICAgICAgJyBTb3VyY2UgY29kZSBvbiAnLCBtKFwiYS5leHRlcm5hbFtocmVmPSdodHRwczovL2dpdGh1Yi5jb20vdGFpbHVnZS9jaGVzcy1vLXRyb24nXVwiLCAnR2l0SHViLicpXHJcbiAgICAgICAgICAgIF0pXHJcbiAgICAgICAgICBdKVxyXG4gICAgICAgIF0pXHJcbiAgICAgIF0pXHJcbiAgICApXHJcbiAgXTtcclxufTtcclxuIiwiLypcclxuICogQ29weXJpZ2h0IChjKSAyMDE2LCBKZWZmIEhseXdhIChqaGx5d2FAZ21haWwuY29tKVxyXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKlxyXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcclxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XHJcbiAqXHJcbiAqIDEuIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcclxuICogICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cclxuICogMi4gUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxyXG4gKiAgICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uXHJcbiAqICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxyXG4gKlxyXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIlxyXG4gKiBBTkQgQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFXHJcbiAqIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFXHJcbiAqIEFSRSBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIE9XTkVSIE9SIENPTlRSSUJVVE9SUyBCRVxyXG4gKiBMSUFCTEUgRk9SIEFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SXHJcbiAqIENPTlNFUVVFTlRJQUwgREFNQUdFUyAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GXHJcbiAqIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7IExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTU1xyXG4gKiBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTlxyXG4gKiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVCAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKVxyXG4gKiBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJUyBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRVxyXG4gKiBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cclxuICpcclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbi8qIG1pbmlmaWVkIGxpY2Vuc2UgYmVsb3cgICovXHJcblxyXG4vKiBAbGljZW5zZVxyXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTYsIEplZmYgSGx5d2EgKGpobHl3YUBnbWFpbC5jb20pXHJcbiAqIFJlbGVhc2VkIHVuZGVyIHRoZSBCU0QgbGljZW5zZVxyXG4gKiBodHRwczovL2dpdGh1Yi5jb20vamhseXdhL2NoZXNzLmpzL2Jsb2IvbWFzdGVyL0xJQ0VOU0VcclxuICovXHJcblxyXG52YXIgQ2hlc3MgPSBmdW5jdGlvbihmZW4pIHtcclxuXHJcbiAgLyoganNoaW50IGluZGVudDogZmFsc2UgKi9cclxuXHJcbiAgdmFyIEJMQUNLID0gJ2InO1xyXG4gIHZhciBXSElURSA9ICd3JztcclxuXHJcbiAgdmFyIEVNUFRZID0gLTE7XHJcblxyXG4gIHZhciBQQVdOID0gJ3AnO1xyXG4gIHZhciBLTklHSFQgPSAnbic7XHJcbiAgdmFyIEJJU0hPUCA9ICdiJztcclxuICB2YXIgUk9PSyA9ICdyJztcclxuICB2YXIgUVVFRU4gPSAncSc7XHJcbiAgdmFyIEtJTkcgPSAnayc7XHJcblxyXG4gIHZhciBTWU1CT0xTID0gJ3BuYnJxa1BOQlJRSyc7XHJcblxyXG4gIHZhciBERUZBVUxUX1BPU0lUSU9OID0gJ3JuYnFrYm5yL3BwcHBwcHBwLzgvOC84LzgvUFBQUFBQUFAvUk5CUUtCTlIgdyBLUWtxIC0gMCAxJztcclxuXHJcbiAgdmFyIFBPU1NJQkxFX1JFU1VMVFMgPSBbJzEtMCcsICcwLTEnLCAnMS8yLTEvMicsICcqJ107XHJcblxyXG4gIHZhciBQQVdOX09GRlNFVFMgPSB7XHJcbiAgICBiOiBbMTYsIDMyLCAxNywgMTVdLFxyXG4gICAgdzogWy0xNiwgLTMyLCAtMTcsIC0xNV1cclxuICB9O1xyXG5cclxuICB2YXIgUElFQ0VfT0ZGU0VUUyA9IHtcclxuICAgIG46IFstMTgsIC0zMywgLTMxLCAtMTQsICAxOCwgMzMsIDMxLCAgMTRdLFxyXG4gICAgYjogWy0xNywgLTE1LCAgMTcsICAxNV0sXHJcbiAgICByOiBbLTE2LCAgIDEsICAxNiwgIC0xXSxcclxuICAgIHE6IFstMTcsIC0xNiwgLTE1LCAgIDEsICAxNywgMTYsIDE1LCAgLTFdLFxyXG4gICAgazogWy0xNywgLTE2LCAtMTUsICAgMSwgIDE3LCAxNiwgMTUsICAtMV1cclxuICB9O1xyXG5cclxuICB2YXIgQVRUQUNLUyA9IFtcclxuICAgIDIwLCAwLCAwLCAwLCAwLCAwLCAwLCAyNCwgIDAsIDAsIDAsIDAsIDAsIDAsMjAsIDAsXHJcbiAgICAgMCwyMCwgMCwgMCwgMCwgMCwgMCwgMjQsICAwLCAwLCAwLCAwLCAwLDIwLCAwLCAwLFxyXG4gICAgIDAsIDAsMjAsIDAsIDAsIDAsIDAsIDI0LCAgMCwgMCwgMCwgMCwyMCwgMCwgMCwgMCxcclxuICAgICAwLCAwLCAwLDIwLCAwLCAwLCAwLCAyNCwgIDAsIDAsIDAsMjAsIDAsIDAsIDAsIDAsXHJcbiAgICAgMCwgMCwgMCwgMCwyMCwgMCwgMCwgMjQsICAwLCAwLDIwLCAwLCAwLCAwLCAwLCAwLFxyXG4gICAgIDAsIDAsIDAsIDAsIDAsMjAsIDIsIDI0LCAgMiwyMCwgMCwgMCwgMCwgMCwgMCwgMCxcclxuICAgICAwLCAwLCAwLCAwLCAwLCAyLDUzLCA1NiwgNTMsIDIsIDAsIDAsIDAsIDAsIDAsIDAsXHJcbiAgICAyNCwyNCwyNCwyNCwyNCwyNCw1NiwgIDAsIDU2LDI0LDI0LDI0LDI0LDI0LDI0LCAwLFxyXG4gICAgIDAsIDAsIDAsIDAsIDAsIDIsNTMsIDU2LCA1MywgMiwgMCwgMCwgMCwgMCwgMCwgMCxcclxuICAgICAwLCAwLCAwLCAwLCAwLDIwLCAyLCAyNCwgIDIsMjAsIDAsIDAsIDAsIDAsIDAsIDAsXHJcbiAgICAgMCwgMCwgMCwgMCwyMCwgMCwgMCwgMjQsICAwLCAwLDIwLCAwLCAwLCAwLCAwLCAwLFxyXG4gICAgIDAsIDAsIDAsMjAsIDAsIDAsIDAsIDI0LCAgMCwgMCwgMCwyMCwgMCwgMCwgMCwgMCxcclxuICAgICAwLCAwLDIwLCAwLCAwLCAwLCAwLCAyNCwgIDAsIDAsIDAsIDAsMjAsIDAsIDAsIDAsXHJcbiAgICAgMCwyMCwgMCwgMCwgMCwgMCwgMCwgMjQsICAwLCAwLCAwLCAwLCAwLDIwLCAwLCAwLFxyXG4gICAgMjAsIDAsIDAsIDAsIDAsIDAsIDAsIDI0LCAgMCwgMCwgMCwgMCwgMCwgMCwyMFxyXG4gIF07XHJcblxyXG4gIHZhciBSQVlTID0gW1xyXG4gICAgIDE3LCAgMCwgIDAsICAwLCAgMCwgIDAsICAwLCAxNiwgIDAsICAwLCAgMCwgIDAsICAwLCAgMCwgMTUsIDAsXHJcbiAgICAgIDAsIDE3LCAgMCwgIDAsICAwLCAgMCwgIDAsIDE2LCAgMCwgIDAsICAwLCAgMCwgIDAsIDE1LCAgMCwgMCxcclxuICAgICAgMCwgIDAsIDE3LCAgMCwgIDAsICAwLCAgMCwgMTYsICAwLCAgMCwgIDAsICAwLCAxNSwgIDAsICAwLCAwLFxyXG4gICAgICAwLCAgMCwgIDAsIDE3LCAgMCwgIDAsICAwLCAxNiwgIDAsICAwLCAgMCwgMTUsICAwLCAgMCwgIDAsIDAsXHJcbiAgICAgIDAsICAwLCAgMCwgIDAsIDE3LCAgMCwgIDAsIDE2LCAgMCwgIDAsIDE1LCAgMCwgIDAsICAwLCAgMCwgMCxcclxuICAgICAgMCwgIDAsICAwLCAgMCwgIDAsIDE3LCAgMCwgMTYsICAwLCAxNSwgIDAsICAwLCAgMCwgIDAsICAwLCAwLFxyXG4gICAgICAwLCAgMCwgIDAsICAwLCAgMCwgIDAsIDE3LCAxNiwgMTUsICAwLCAgMCwgIDAsICAwLCAgMCwgIDAsIDAsXHJcbiAgICAgIDEsICAxLCAgMSwgIDEsICAxLCAgMSwgIDEsICAwLCAtMSwgLTEsICAtMSwtMSwgLTEsIC0xLCAtMSwgMCxcclxuICAgICAgMCwgIDAsICAwLCAgMCwgIDAsICAwLC0xNSwtMTYsLTE3LCAgMCwgIDAsICAwLCAgMCwgIDAsICAwLCAwLFxyXG4gICAgICAwLCAgMCwgIDAsICAwLCAgMCwtMTUsICAwLC0xNiwgIDAsLTE3LCAgMCwgIDAsICAwLCAgMCwgIDAsIDAsXHJcbiAgICAgIDAsICAwLCAgMCwgIDAsLTE1LCAgMCwgIDAsLTE2LCAgMCwgIDAsLTE3LCAgMCwgIDAsICAwLCAgMCwgMCxcclxuICAgICAgMCwgIDAsICAwLC0xNSwgIDAsICAwLCAgMCwtMTYsICAwLCAgMCwgIDAsLTE3LCAgMCwgIDAsICAwLCAwLFxyXG4gICAgICAwLCAgMCwtMTUsICAwLCAgMCwgIDAsICAwLC0xNiwgIDAsICAwLCAgMCwgIDAsLTE3LCAgMCwgIDAsIDAsXHJcbiAgICAgIDAsLTE1LCAgMCwgIDAsICAwLCAgMCwgIDAsLTE2LCAgMCwgIDAsICAwLCAgMCwgIDAsLTE3LCAgMCwgMCxcclxuICAgIC0xNSwgIDAsICAwLCAgMCwgIDAsICAwLCAgMCwtMTYsICAwLCAgMCwgIDAsICAwLCAgMCwgIDAsLTE3XHJcbiAgXTtcclxuXHJcbiAgdmFyIFNISUZUUyA9IHsgcDogMCwgbjogMSwgYjogMiwgcjogMywgcTogNCwgazogNSB9O1xyXG5cclxuICB2YXIgRkxBR1MgPSB7XHJcbiAgICBOT1JNQUw6ICduJyxcclxuICAgIENBUFRVUkU6ICdjJyxcclxuICAgIEJJR19QQVdOOiAnYicsXHJcbiAgICBFUF9DQVBUVVJFOiAnZScsXHJcbiAgICBQUk9NT1RJT046ICdwJyxcclxuICAgIEtTSURFX0NBU1RMRTogJ2snLFxyXG4gICAgUVNJREVfQ0FTVExFOiAncSdcclxuICB9O1xyXG5cclxuICB2YXIgQklUUyA9IHtcclxuICAgIE5PUk1BTDogMSxcclxuICAgIENBUFRVUkU6IDIsXHJcbiAgICBCSUdfUEFXTjogNCxcclxuICAgIEVQX0NBUFRVUkU6IDgsXHJcbiAgICBQUk9NT1RJT046IDE2LFxyXG4gICAgS1NJREVfQ0FTVExFOiAzMixcclxuICAgIFFTSURFX0NBU1RMRTogNjRcclxuICB9O1xyXG5cclxuICB2YXIgUkFOS18xID0gNztcclxuICB2YXIgUkFOS18yID0gNjtcclxuICB2YXIgUkFOS18zID0gNTtcclxuICB2YXIgUkFOS180ID0gNDtcclxuICB2YXIgUkFOS181ID0gMztcclxuICB2YXIgUkFOS182ID0gMjtcclxuICB2YXIgUkFOS183ID0gMTtcclxuICB2YXIgUkFOS184ID0gMDtcclxuXHJcbiAgdmFyIFNRVUFSRVMgPSB7XHJcbiAgICBhODogICAwLCBiODogICAxLCBjODogICAyLCBkODogICAzLCBlODogICA0LCBmODogICA1LCBnODogICA2LCBoODogICA3LFxyXG4gICAgYTc6ICAxNiwgYjc6ICAxNywgYzc6ICAxOCwgZDc6ICAxOSwgZTc6ICAyMCwgZjc6ICAyMSwgZzc6ICAyMiwgaDc6ICAyMyxcclxuICAgIGE2OiAgMzIsIGI2OiAgMzMsIGM2OiAgMzQsIGQ2OiAgMzUsIGU2OiAgMzYsIGY2OiAgMzcsIGc2OiAgMzgsIGg2OiAgMzksXHJcbiAgICBhNTogIDQ4LCBiNTogIDQ5LCBjNTogIDUwLCBkNTogIDUxLCBlNTogIDUyLCBmNTogIDUzLCBnNTogIDU0LCBoNTogIDU1LFxyXG4gICAgYTQ6ICA2NCwgYjQ6ICA2NSwgYzQ6ICA2NiwgZDQ6ICA2NywgZTQ6ICA2OCwgZjQ6ICA2OSwgZzQ6ICA3MCwgaDQ6ICA3MSxcclxuICAgIGEzOiAgODAsIGIzOiAgODEsIGMzOiAgODIsIGQzOiAgODMsIGUzOiAgODQsIGYzOiAgODUsIGczOiAgODYsIGgzOiAgODcsXHJcbiAgICBhMjogIDk2LCBiMjogIDk3LCBjMjogIDk4LCBkMjogIDk5LCBlMjogMTAwLCBmMjogMTAxLCBnMjogMTAyLCBoMjogMTAzLFxyXG4gICAgYTE6IDExMiwgYjE6IDExMywgYzE6IDExNCwgZDE6IDExNSwgZTE6IDExNiwgZjE6IDExNywgZzE6IDExOCwgaDE6IDExOVxyXG4gIH07XHJcblxyXG4gIHZhciBST09LUyA9IHtcclxuICAgIHc6IFt7c3F1YXJlOiBTUVVBUkVTLmExLCBmbGFnOiBCSVRTLlFTSURFX0NBU1RMRX0sXHJcbiAgICAgICAge3NxdWFyZTogU1FVQVJFUy5oMSwgZmxhZzogQklUUy5LU0lERV9DQVNUTEV9XSxcclxuICAgIGI6IFt7c3F1YXJlOiBTUVVBUkVTLmE4LCBmbGFnOiBCSVRTLlFTSURFX0NBU1RMRX0sXHJcbiAgICAgICAge3NxdWFyZTogU1FVQVJFUy5oOCwgZmxhZzogQklUUy5LU0lERV9DQVNUTEV9XVxyXG4gIH07XHJcblxyXG4gIHZhciBib2FyZCA9IG5ldyBBcnJheSgxMjgpO1xyXG4gIHZhciBraW5ncyA9IHt3OiBFTVBUWSwgYjogRU1QVFl9O1xyXG4gIHZhciB0dXJuID0gV0hJVEU7XHJcbiAgdmFyIGNhc3RsaW5nID0ge3c6IDAsIGI6IDB9O1xyXG4gIHZhciBlcF9zcXVhcmUgPSBFTVBUWTtcclxuICB2YXIgaGFsZl9tb3ZlcyA9IDA7XHJcbiAgdmFyIG1vdmVfbnVtYmVyID0gMTtcclxuICB2YXIgaGlzdG9yeSA9IFtdO1xyXG4gIHZhciBoZWFkZXIgPSB7fTtcclxuXHJcbiAgLyogaWYgdGhlIHVzZXIgcGFzc2VzIGluIGEgZmVuIHN0cmluZywgbG9hZCBpdCwgZWxzZSBkZWZhdWx0IHRvXHJcbiAgICogc3RhcnRpbmcgcG9zaXRpb25cclxuICAgKi9cclxuICBpZiAodHlwZW9mIGZlbiA9PT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgIGxvYWQoREVGQVVMVF9QT1NJVElPTik7XHJcbiAgfSBlbHNlIHtcclxuICAgIGxvYWQoZmVuKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNsZWFyKCkge1xyXG4gICAgYm9hcmQgPSBuZXcgQXJyYXkoMTI4KTtcclxuICAgIGtpbmdzID0ge3c6IEVNUFRZLCBiOiBFTVBUWX07XHJcbiAgICB0dXJuID0gV0hJVEU7XHJcbiAgICBjYXN0bGluZyA9IHt3OiAwLCBiOiAwfTtcclxuICAgIGVwX3NxdWFyZSA9IEVNUFRZO1xyXG4gICAgaGFsZl9tb3ZlcyA9IDA7XHJcbiAgICBtb3ZlX251bWJlciA9IDE7XHJcbiAgICBoaXN0b3J5ID0gW107XHJcbiAgICBoZWFkZXIgPSB7fTtcclxuICAgIHVwZGF0ZV9zZXR1cChnZW5lcmF0ZV9mZW4oKSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZXNldCgpIHtcclxuICAgIGxvYWQoREVGQVVMVF9QT1NJVElPTik7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBsb2FkKGZlbikge1xyXG4gICAgdmFyIHRva2VucyA9IGZlbi5zcGxpdCgvXFxzKy8pO1xyXG4gICAgdmFyIHBvc2l0aW9uID0gdG9rZW5zWzBdO1xyXG4gICAgdmFyIHNxdWFyZSA9IDA7XHJcblxyXG4gICAgaWYgKCF2YWxpZGF0ZV9mZW4oZmVuKS52YWxpZCkge1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgY2xlYXIoKTtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBvc2l0aW9uLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIHZhciBwaWVjZSA9IHBvc2l0aW9uLmNoYXJBdChpKTtcclxuXHJcbiAgICAgIGlmIChwaWVjZSA9PT0gJy8nKSB7XHJcbiAgICAgICAgc3F1YXJlICs9IDg7XHJcbiAgICAgIH0gZWxzZSBpZiAoaXNfZGlnaXQocGllY2UpKSB7XHJcbiAgICAgICAgc3F1YXJlICs9IHBhcnNlSW50KHBpZWNlLCAxMCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIGNvbG9yID0gKHBpZWNlIDwgJ2EnKSA/IFdISVRFIDogQkxBQ0s7XHJcbiAgICAgICAgcHV0KHt0eXBlOiBwaWVjZS50b0xvd2VyQ2FzZSgpLCBjb2xvcjogY29sb3J9LCBhbGdlYnJhaWMoc3F1YXJlKSk7XHJcbiAgICAgICAgc3F1YXJlKys7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0dXJuID0gdG9rZW5zWzFdO1xyXG5cclxuICAgIGlmICh0b2tlbnNbMl0uaW5kZXhPZignSycpID4gLTEpIHtcclxuICAgICAgY2FzdGxpbmcudyB8PSBCSVRTLktTSURFX0NBU1RMRTtcclxuICAgIH1cclxuICAgIGlmICh0b2tlbnNbMl0uaW5kZXhPZignUScpID4gLTEpIHtcclxuICAgICAgY2FzdGxpbmcudyB8PSBCSVRTLlFTSURFX0NBU1RMRTtcclxuICAgIH1cclxuICAgIGlmICh0b2tlbnNbMl0uaW5kZXhPZignaycpID4gLTEpIHtcclxuICAgICAgY2FzdGxpbmcuYiB8PSBCSVRTLktTSURFX0NBU1RMRTtcclxuICAgIH1cclxuICAgIGlmICh0b2tlbnNbMl0uaW5kZXhPZigncScpID4gLTEpIHtcclxuICAgICAgY2FzdGxpbmcuYiB8PSBCSVRTLlFTSURFX0NBU1RMRTtcclxuICAgIH1cclxuXHJcbiAgICBlcF9zcXVhcmUgPSAodG9rZW5zWzNdID09PSAnLScpID8gRU1QVFkgOiBTUVVBUkVTW3Rva2Vuc1szXV07XHJcbiAgICBoYWxmX21vdmVzID0gcGFyc2VJbnQodG9rZW5zWzRdLCAxMCk7XHJcbiAgICBtb3ZlX251bWJlciA9IHBhcnNlSW50KHRva2Vuc1s1XSwgMTApO1xyXG5cclxuICAgIHVwZGF0ZV9zZXR1cChnZW5lcmF0ZV9mZW4oKSk7XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICAvKiBUT0RPOiB0aGlzIGZ1bmN0aW9uIGlzIHByZXR0eSBtdWNoIGNyYXAgLSBpdCB2YWxpZGF0ZXMgc3RydWN0dXJlIGJ1dFxyXG4gICAqIGNvbXBsZXRlbHkgaWdub3JlcyBjb250ZW50IChlLmcuIGRvZXNuJ3QgdmVyaWZ5IHRoYXQgZWFjaCBzaWRlIGhhcyBhIGtpbmcpXHJcbiAgICogLi4uIHdlIHNob3VsZCByZXdyaXRlIHRoaXMsIGFuZCBkaXRjaCB0aGUgc2lsbHkgZXJyb3JfbnVtYmVyIGZpZWxkIHdoaWxlXHJcbiAgICogd2UncmUgYXQgaXRcclxuICAgKi9cclxuICBmdW5jdGlvbiB2YWxpZGF0ZV9mZW4oZmVuKSB7XHJcbiAgICB2YXIgZXJyb3JzID0ge1xyXG4gICAgICAgMDogJ05vIGVycm9ycy4nLFxyXG4gICAgICAgMTogJ0ZFTiBzdHJpbmcgbXVzdCBjb250YWluIHNpeCBzcGFjZS1kZWxpbWl0ZWQgZmllbGRzLicsXHJcbiAgICAgICAyOiAnNnRoIGZpZWxkIChtb3ZlIG51bWJlcikgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXIuJyxcclxuICAgICAgIDM6ICc1dGggZmllbGQgKGhhbGYgbW92ZSBjb3VudGVyKSBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlIGludGVnZXIuJyxcclxuICAgICAgIDQ6ICc0dGggZmllbGQgKGVuLXBhc3NhbnQgc3F1YXJlKSBpcyBpbnZhbGlkLicsXHJcbiAgICAgICA1OiAnM3JkIGZpZWxkIChjYXN0bGluZyBhdmFpbGFiaWxpdHkpIGlzIGludmFsaWQuJyxcclxuICAgICAgIDY6ICcybmQgZmllbGQgKHNpZGUgdG8gbW92ZSkgaXMgaW52YWxpZC4nLFxyXG4gICAgICAgNzogJzFzdCBmaWVsZCAocGllY2UgcG9zaXRpb25zKSBkb2VzIG5vdCBjb250YWluIDggXFwnL1xcJy1kZWxpbWl0ZWQgcm93cy4nLFxyXG4gICAgICAgODogJzFzdCBmaWVsZCAocGllY2UgcG9zaXRpb25zKSBpcyBpbnZhbGlkIFtjb25zZWN1dGl2ZSBudW1iZXJzXS4nLFxyXG4gICAgICAgOTogJzFzdCBmaWVsZCAocGllY2UgcG9zaXRpb25zKSBpcyBpbnZhbGlkIFtpbnZhbGlkIHBpZWNlXS4nLFxyXG4gICAgICAxMDogJzFzdCBmaWVsZCAocGllY2UgcG9zaXRpb25zKSBpcyBpbnZhbGlkIFtyb3cgdG9vIGxhcmdlXS4nLFxyXG4gICAgICAxMTogJ0lsbGVnYWwgZW4tcGFzc2FudCBzcXVhcmUnLFxyXG4gICAgfTtcclxuXHJcbiAgICAvKiAxc3QgY3JpdGVyaW9uOiA2IHNwYWNlLXNlcGVyYXRlZCBmaWVsZHM/ICovXHJcbiAgICB2YXIgdG9rZW5zID0gZmVuLnNwbGl0KC9cXHMrLyk7XHJcbiAgICBpZiAodG9rZW5zLmxlbmd0aCAhPT0gNikge1xyXG4gICAgICByZXR1cm4ge3ZhbGlkOiBmYWxzZSwgZXJyb3JfbnVtYmVyOiAxLCBlcnJvcjogZXJyb3JzWzFdfTtcclxuICAgIH1cclxuXHJcbiAgICAvKiAybmQgY3JpdGVyaW9uOiBtb3ZlIG51bWJlciBmaWVsZCBpcyBhIGludGVnZXIgdmFsdWUgPiAwPyAqL1xyXG4gICAgaWYgKGlzTmFOKHRva2Vuc1s1XSkgfHwgKHBhcnNlSW50KHRva2Vuc1s1XSwgMTApIDw9IDApKSB7XHJcbiAgICAgIHJldHVybiB7dmFsaWQ6IGZhbHNlLCBlcnJvcl9udW1iZXI6IDIsIGVycm9yOiBlcnJvcnNbMl19O1xyXG4gICAgfVxyXG5cclxuICAgIC8qIDNyZCBjcml0ZXJpb246IGhhbGYgbW92ZSBjb3VudGVyIGlzIGFuIGludGVnZXIgPj0gMD8gKi9cclxuICAgIGlmIChpc05hTih0b2tlbnNbNF0pIHx8IChwYXJzZUludCh0b2tlbnNbNF0sIDEwKSA8IDApKSB7XHJcbiAgICAgIHJldHVybiB7dmFsaWQ6IGZhbHNlLCBlcnJvcl9udW1iZXI6IDMsIGVycm9yOiBlcnJvcnNbM119O1xyXG4gICAgfVxyXG5cclxuICAgIC8qIDR0aCBjcml0ZXJpb246IDR0aCBmaWVsZCBpcyBhIHZhbGlkIGUucC4tc3RyaW5nPyAqL1xyXG4gICAgaWYgKCEvXigtfFthYmNkZWZnaF1bMzZdKSQvLnRlc3QodG9rZW5zWzNdKSkge1xyXG4gICAgICByZXR1cm4ge3ZhbGlkOiBmYWxzZSwgZXJyb3JfbnVtYmVyOiA0LCBlcnJvcjogZXJyb3JzWzRdfTtcclxuICAgIH1cclxuXHJcbiAgICAvKiA1dGggY3JpdGVyaW9uOiAzdGggZmllbGQgaXMgYSB2YWxpZCBjYXN0bGUtc3RyaW5nPyAqL1xyXG4gICAgaWYoICEvXihLUT9rP3E/fFFrP3E/fGtxP3xxfC0pJC8udGVzdCh0b2tlbnNbMl0pKSB7XHJcbiAgICAgIHJldHVybiB7dmFsaWQ6IGZhbHNlLCBlcnJvcl9udW1iZXI6IDUsIGVycm9yOiBlcnJvcnNbNV19O1xyXG4gICAgfVxyXG5cclxuICAgIC8qIDZ0aCBjcml0ZXJpb246IDJuZCBmaWVsZCBpcyBcIndcIiAod2hpdGUpIG9yIFwiYlwiIChibGFjayk/ICovXHJcbiAgICBpZiAoIS9eKHd8YikkLy50ZXN0KHRva2Vuc1sxXSkpIHtcclxuICAgICAgcmV0dXJuIHt2YWxpZDogZmFsc2UsIGVycm9yX251bWJlcjogNiwgZXJyb3I6IGVycm9yc1s2XX07XHJcbiAgICB9XHJcblxyXG4gICAgLyogN3RoIGNyaXRlcmlvbjogMXN0IGZpZWxkIGNvbnRhaW5zIDggcm93cz8gKi9cclxuICAgIHZhciByb3dzID0gdG9rZW5zWzBdLnNwbGl0KCcvJyk7XHJcbiAgICBpZiAocm93cy5sZW5ndGggIT09IDgpIHtcclxuICAgICAgcmV0dXJuIHt2YWxpZDogZmFsc2UsIGVycm9yX251bWJlcjogNywgZXJyb3I6IGVycm9yc1s3XX07XHJcbiAgICB9XHJcblxyXG4gICAgLyogOHRoIGNyaXRlcmlvbjogZXZlcnkgcm93IGlzIHZhbGlkPyAqL1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIC8qIGNoZWNrIGZvciByaWdodCBzdW0gb2YgZmllbGRzIEFORCBub3QgdHdvIG51bWJlcnMgaW4gc3VjY2Vzc2lvbiAqL1xyXG4gICAgICB2YXIgc3VtX2ZpZWxkcyA9IDA7XHJcbiAgICAgIHZhciBwcmV2aW91c193YXNfbnVtYmVyID0gZmFsc2U7XHJcblxyXG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IHJvd3NbaV0ubGVuZ3RoOyBrKyspIHtcclxuICAgICAgICBpZiAoIWlzTmFOKHJvd3NbaV1ba10pKSB7XHJcbiAgICAgICAgICBpZiAocHJldmlvdXNfd2FzX251bWJlcikge1xyXG4gICAgICAgICAgICByZXR1cm4ge3ZhbGlkOiBmYWxzZSwgZXJyb3JfbnVtYmVyOiA4LCBlcnJvcjogZXJyb3JzWzhdfTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHN1bV9maWVsZHMgKz0gcGFyc2VJbnQocm93c1tpXVtrXSwgMTApO1xyXG4gICAgICAgICAgcHJldmlvdXNfd2FzX251bWJlciA9IHRydWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGlmICghL15bcHJuYnFrUFJOQlFLXSQvLnRlc3Qocm93c1tpXVtrXSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHt2YWxpZDogZmFsc2UsIGVycm9yX251bWJlcjogOSwgZXJyb3I6IGVycm9yc1s5XX07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBzdW1fZmllbGRzICs9IDE7XHJcbiAgICAgICAgICBwcmV2aW91c193YXNfbnVtYmVyID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIGlmIChzdW1fZmllbGRzICE9PSA4KSB7XHJcbiAgICAgICAgcmV0dXJuIHt2YWxpZDogZmFsc2UsIGVycm9yX251bWJlcjogMTAsIGVycm9yOiBlcnJvcnNbMTBdfTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICgodG9rZW5zWzNdWzFdID09ICczJyAmJiB0b2tlbnNbMV0gPT0gJ3cnKSB8fFxyXG4gICAgICAgICh0b2tlbnNbM11bMV0gPT0gJzYnICYmIHRva2Vuc1sxXSA9PSAnYicpKSB7XHJcbiAgICAgICAgICByZXR1cm4ge3ZhbGlkOiBmYWxzZSwgZXJyb3JfbnVtYmVyOiAxMSwgZXJyb3I6IGVycm9yc1sxMV19O1xyXG4gICAgfVxyXG5cclxuICAgIC8qIGV2ZXJ5dGhpbmcncyBva2F5ISAqL1xyXG4gICAgcmV0dXJuIHt2YWxpZDogdHJ1ZSwgZXJyb3JfbnVtYmVyOiAwLCBlcnJvcjogZXJyb3JzWzBdfTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGdlbmVyYXRlX2ZlbigpIHtcclxuICAgIHZhciBlbXB0eSA9IDA7XHJcbiAgICB2YXIgZmVuID0gJyc7XHJcblxyXG4gICAgZm9yICh2YXIgaSA9IFNRVUFSRVMuYTg7IGkgPD0gU1FVQVJFUy5oMTsgaSsrKSB7XHJcbiAgICAgIGlmIChib2FyZFtpXSA9PSBudWxsKSB7XHJcbiAgICAgICAgZW1wdHkrKztcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpZiAoZW1wdHkgPiAwKSB7XHJcbiAgICAgICAgICBmZW4gKz0gZW1wdHk7XHJcbiAgICAgICAgICBlbXB0eSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciBjb2xvciA9IGJvYXJkW2ldLmNvbG9yO1xyXG4gICAgICAgIHZhciBwaWVjZSA9IGJvYXJkW2ldLnR5cGU7XHJcblxyXG4gICAgICAgIGZlbiArPSAoY29sb3IgPT09IFdISVRFKSA/XHJcbiAgICAgICAgICAgICAgICAgcGllY2UudG9VcHBlckNhc2UoKSA6IHBpZWNlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICgoaSArIDEpICYgMHg4OCkge1xyXG4gICAgICAgIGlmIChlbXB0eSA+IDApIHtcclxuICAgICAgICAgIGZlbiArPSBlbXB0eTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChpICE9PSBTUVVBUkVTLmgxKSB7XHJcbiAgICAgICAgICBmZW4gKz0gJy8nO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZW1wdHkgPSAwO1xyXG4gICAgICAgIGkgKz0gODtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBjZmxhZ3MgPSAnJztcclxuICAgIGlmIChjYXN0bGluZ1tXSElURV0gJiBCSVRTLktTSURFX0NBU1RMRSkgeyBjZmxhZ3MgKz0gJ0snOyB9XHJcbiAgICBpZiAoY2FzdGxpbmdbV0hJVEVdICYgQklUUy5RU0lERV9DQVNUTEUpIHsgY2ZsYWdzICs9ICdRJzsgfVxyXG4gICAgaWYgKGNhc3RsaW5nW0JMQUNLXSAmIEJJVFMuS1NJREVfQ0FTVExFKSB7IGNmbGFncyArPSAnayc7IH1cclxuICAgIGlmIChjYXN0bGluZ1tCTEFDS10gJiBCSVRTLlFTSURFX0NBU1RMRSkgeyBjZmxhZ3MgKz0gJ3EnOyB9XHJcblxyXG4gICAgLyogZG8gd2UgaGF2ZSBhbiBlbXB0eSBjYXN0bGluZyBmbGFnPyAqL1xyXG4gICAgY2ZsYWdzID0gY2ZsYWdzIHx8ICctJztcclxuICAgIHZhciBlcGZsYWdzID0gKGVwX3NxdWFyZSA9PT0gRU1QVFkpID8gJy0nIDogYWxnZWJyYWljKGVwX3NxdWFyZSk7XHJcblxyXG4gICAgcmV0dXJuIFtmZW4sIHR1cm4sIGNmbGFncywgZXBmbGFncywgaGFsZl9tb3ZlcywgbW92ZV9udW1iZXJdLmpvaW4oJyAnKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNldF9oZWFkZXIoYXJncykge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSArPSAyKSB7XHJcbiAgICAgIGlmICh0eXBlb2YgYXJnc1tpXSA9PT0gJ3N0cmluZycgJiZcclxuICAgICAgICAgIHR5cGVvZiBhcmdzW2kgKyAxXSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICBoZWFkZXJbYXJnc1tpXV0gPSBhcmdzW2kgKyAxXTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGhlYWRlcjtcclxuICB9XHJcblxyXG4gIC8qIGNhbGxlZCB3aGVuIHRoZSBpbml0aWFsIGJvYXJkIHNldHVwIGlzIGNoYW5nZWQgd2l0aCBwdXQoKSBvciByZW1vdmUoKS5cclxuICAgKiBtb2RpZmllcyB0aGUgU2V0VXAgYW5kIEZFTiBwcm9wZXJ0aWVzIG9mIHRoZSBoZWFkZXIgb2JqZWN0LiAgaWYgdGhlIEZFTiBpc1xyXG4gICAqIGVxdWFsIHRvIHRoZSBkZWZhdWx0IHBvc2l0aW9uLCB0aGUgU2V0VXAgYW5kIEZFTiBhcmUgZGVsZXRlZFxyXG4gICAqIHRoZSBzZXR1cCBpcyBvbmx5IHVwZGF0ZWQgaWYgaGlzdG9yeS5sZW5ndGggaXMgemVybywgaWUgbW92ZXMgaGF2ZW4ndCBiZWVuXHJcbiAgICogbWFkZS5cclxuICAgKi9cclxuICBmdW5jdGlvbiB1cGRhdGVfc2V0dXAoZmVuKSB7XHJcbiAgICBpZiAoaGlzdG9yeS5sZW5ndGggPiAwKSByZXR1cm47XHJcblxyXG4gICAgaWYgKGZlbiAhPT0gREVGQVVMVF9QT1NJVElPTikge1xyXG4gICAgICBoZWFkZXJbJ1NldFVwJ10gPSAnMSc7XHJcbiAgICAgIGhlYWRlclsnRkVOJ10gPSBmZW47XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBkZWxldGUgaGVhZGVyWydTZXRVcCddO1xyXG4gICAgICBkZWxldGUgaGVhZGVyWydGRU4nXTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGdldChzcXVhcmUpIHtcclxuICAgIHZhciBwaWVjZSA9IGJvYXJkW1NRVUFSRVNbc3F1YXJlXV07XHJcbiAgICByZXR1cm4gKHBpZWNlKSA/IHt0eXBlOiBwaWVjZS50eXBlLCBjb2xvcjogcGllY2UuY29sb3J9IDogbnVsbDtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHB1dChwaWVjZSwgc3F1YXJlKSB7XHJcbiAgICAvKiBjaGVjayBmb3IgdmFsaWQgcGllY2Ugb2JqZWN0ICovXHJcbiAgICBpZiAoISgndHlwZScgaW4gcGllY2UgJiYgJ2NvbG9yJyBpbiBwaWVjZSkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qIGNoZWNrIGZvciBwaWVjZSAqL1xyXG4gICAgaWYgKFNZTUJPTFMuaW5kZXhPZihwaWVjZS50eXBlLnRvTG93ZXJDYXNlKCkpID09PSAtMSkge1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyogY2hlY2sgZm9yIHZhbGlkIHNxdWFyZSAqL1xyXG4gICAgaWYgKCEoc3F1YXJlIGluIFNRVUFSRVMpKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgc3EgPSBTUVVBUkVTW3NxdWFyZV07XHJcblxyXG4gICAgLyogZG9uJ3QgbGV0IHRoZSB1c2VyIHBsYWNlIG1vcmUgdGhhbiBvbmUga2luZyAqL1xyXG4gICAgaWYgKHBpZWNlLnR5cGUgPT0gS0lORyAmJlxyXG4gICAgICAgICEoa2luZ3NbcGllY2UuY29sb3JdID09IEVNUFRZIHx8IGtpbmdzW3BpZWNlLmNvbG9yXSA9PSBzcSkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGJvYXJkW3NxXSA9IHt0eXBlOiBwaWVjZS50eXBlLCBjb2xvcjogcGllY2UuY29sb3J9O1xyXG4gICAgaWYgKHBpZWNlLnR5cGUgPT09IEtJTkcpIHtcclxuICAgICAga2luZ3NbcGllY2UuY29sb3JdID0gc3E7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlX3NldHVwKGdlbmVyYXRlX2ZlbigpKTtcclxuXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHJlbW92ZShzcXVhcmUpIHtcclxuICAgIHZhciBwaWVjZSA9IGdldChzcXVhcmUpO1xyXG4gICAgYm9hcmRbU1FVQVJFU1tzcXVhcmVdXSA9IG51bGw7XHJcbiAgICBpZiAocGllY2UgJiYgcGllY2UudHlwZSA9PT0gS0lORykge1xyXG4gICAgICBraW5nc1twaWVjZS5jb2xvcl0gPSBFTVBUWTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGVfc2V0dXAoZ2VuZXJhdGVfZmVuKCkpO1xyXG5cclxuICAgIHJldHVybiBwaWVjZTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGJ1aWxkX21vdmUoYm9hcmQsIGZyb20sIHRvLCBmbGFncywgcHJvbW90aW9uKSB7XHJcbiAgICB2YXIgbW92ZSA9IHtcclxuICAgICAgY29sb3I6IHR1cm4sXHJcbiAgICAgIGZyb206IGZyb20sXHJcbiAgICAgIHRvOiB0byxcclxuICAgICAgZmxhZ3M6IGZsYWdzLFxyXG4gICAgICBwaWVjZTogYm9hcmRbZnJvbV0udHlwZVxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAocHJvbW90aW9uKSB7XHJcbiAgICAgIG1vdmUuZmxhZ3MgfD0gQklUUy5QUk9NT1RJT047XHJcbiAgICAgIG1vdmUucHJvbW90aW9uID0gcHJvbW90aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChib2FyZFt0b10pIHtcclxuICAgICAgbW92ZS5jYXB0dXJlZCA9IGJvYXJkW3RvXS50eXBlO1xyXG4gICAgfSBlbHNlIGlmIChmbGFncyAmIEJJVFMuRVBfQ0FQVFVSRSkge1xyXG4gICAgICAgIG1vdmUuY2FwdHVyZWQgPSBQQVdOO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG1vdmU7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBnZW5lcmF0ZV9tb3ZlcyhvcHRpb25zKSB7XHJcbiAgICBmdW5jdGlvbiBhZGRfbW92ZShib2FyZCwgbW92ZXMsIGZyb20sIHRvLCBmbGFncykge1xyXG4gICAgICAvKiBpZiBwYXduIHByb21vdGlvbiAqL1xyXG4gICAgICBpZiAoYm9hcmRbZnJvbV0udHlwZSA9PT0gUEFXTiAmJlxyXG4gICAgICAgICAocmFuayh0bykgPT09IFJBTktfOCB8fCByYW5rKHRvKSA9PT0gUkFOS18xKSkge1xyXG4gICAgICAgICAgdmFyIHBpZWNlcyA9IFtRVUVFTiwgUk9PSywgQklTSE9QLCBLTklHSFRdO1xyXG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHBpZWNlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICAgICAgICBtb3Zlcy5wdXNoKGJ1aWxkX21vdmUoYm9hcmQsIGZyb20sIHRvLCBmbGFncywgcGllY2VzW2ldKSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICBtb3Zlcy5wdXNoKGJ1aWxkX21vdmUoYm9hcmQsIGZyb20sIHRvLCBmbGFncykpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG1vdmVzID0gW107XHJcbiAgICB2YXIgdXMgPSB0dXJuO1xyXG4gICAgdmFyIHRoZW0gPSBzd2FwX2NvbG9yKHVzKTtcclxuICAgIHZhciBzZWNvbmRfcmFuayA9IHtiOiBSQU5LXzcsIHc6IFJBTktfMn07XHJcblxyXG4gICAgdmFyIGZpcnN0X3NxID0gU1FVQVJFUy5hODtcclxuICAgIHZhciBsYXN0X3NxID0gU1FVQVJFUy5oMTtcclxuICAgIHZhciBzaW5nbGVfc3F1YXJlID0gZmFsc2U7XHJcblxyXG4gICAgLyogZG8gd2Ugd2FudCBsZWdhbCBtb3Zlcz8gKi9cclxuICAgIHZhciBsZWdhbCA9ICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ3VuZGVmaW5lZCcgJiYgJ2xlZ2FsJyBpbiBvcHRpb25zKSA/XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmxlZ2FsIDogdHJ1ZTtcclxuXHJcbiAgICAvKiBhcmUgd2UgZ2VuZXJhdGluZyBtb3ZlcyBmb3IgYSBzaW5nbGUgc3F1YXJlPyAqL1xyXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAndW5kZWZpbmVkJyAmJiAnc3F1YXJlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIGlmIChvcHRpb25zLnNxdWFyZSBpbiBTUVVBUkVTKSB7XHJcbiAgICAgICAgZmlyc3Rfc3EgPSBsYXN0X3NxID0gU1FVQVJFU1tvcHRpb25zLnNxdWFyZV07XHJcbiAgICAgICAgc2luZ2xlX3NxdWFyZSA9IHRydWU7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLyogaW52YWxpZCBzcXVhcmUgKi9cclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBpID0gZmlyc3Rfc3E7IGkgPD0gbGFzdF9zcTsgaSsrKSB7XHJcbiAgICAgIC8qIGRpZCB3ZSBydW4gb2ZmIHRoZSBlbmQgb2YgdGhlIGJvYXJkICovXHJcbiAgICAgIGlmIChpICYgMHg4OCkgeyBpICs9IDc7IGNvbnRpbnVlOyB9XHJcblxyXG4gICAgICB2YXIgcGllY2UgPSBib2FyZFtpXTtcclxuICAgICAgaWYgKHBpZWNlID09IG51bGwgfHwgcGllY2UuY29sb3IgIT09IHVzKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChwaWVjZS50eXBlID09PSBQQVdOKSB7XHJcbiAgICAgICAgLyogc2luZ2xlIHNxdWFyZSwgbm9uLWNhcHR1cmluZyAqL1xyXG4gICAgICAgIHZhciBzcXVhcmUgPSBpICsgUEFXTl9PRkZTRVRTW3VzXVswXTtcclxuICAgICAgICBpZiAoYm9hcmRbc3F1YXJlXSA9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGFkZF9tb3ZlKGJvYXJkLCBtb3ZlcywgaSwgc3F1YXJlLCBCSVRTLk5PUk1BTCk7XHJcblxyXG4gICAgICAgICAgLyogZG91YmxlIHNxdWFyZSAqL1xyXG4gICAgICAgICAgdmFyIHNxdWFyZSA9IGkgKyBQQVdOX09GRlNFVFNbdXNdWzFdO1xyXG4gICAgICAgICAgaWYgKHNlY29uZF9yYW5rW3VzXSA9PT0gcmFuayhpKSAmJiBib2FyZFtzcXVhcmVdID09IG51bGwpIHtcclxuICAgICAgICAgICAgYWRkX21vdmUoYm9hcmQsIG1vdmVzLCBpLCBzcXVhcmUsIEJJVFMuQklHX1BBV04pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLyogcGF3biBjYXB0dXJlcyAqL1xyXG4gICAgICAgIGZvciAoaiA9IDI7IGogPCA0OyBqKyspIHtcclxuICAgICAgICAgIHZhciBzcXVhcmUgPSBpICsgUEFXTl9PRkZTRVRTW3VzXVtqXTtcclxuICAgICAgICAgIGlmIChzcXVhcmUgJiAweDg4KSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICBpZiAoYm9hcmRbc3F1YXJlXSAhPSBudWxsICYmXHJcbiAgICAgICAgICAgICAgYm9hcmRbc3F1YXJlXS5jb2xvciA9PT0gdGhlbSkge1xyXG4gICAgICAgICAgICAgIGFkZF9tb3ZlKGJvYXJkLCBtb3ZlcywgaSwgc3F1YXJlLCBCSVRTLkNBUFRVUkUpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChzcXVhcmUgPT09IGVwX3NxdWFyZSkge1xyXG4gICAgICAgICAgICAgIGFkZF9tb3ZlKGJvYXJkLCBtb3ZlcywgaSwgZXBfc3F1YXJlLCBCSVRTLkVQX0NBUFRVUkUpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBmb3IgKHZhciBqID0gMCwgbGVuID0gUElFQ0VfT0ZGU0VUU1twaWVjZS50eXBlXS5sZW5ndGg7IGogPCBsZW47IGorKykge1xyXG4gICAgICAgICAgdmFyIG9mZnNldCA9IFBJRUNFX09GRlNFVFNbcGllY2UudHlwZV1bal07XHJcbiAgICAgICAgICB2YXIgc3F1YXJlID0gaTtcclxuXHJcbiAgICAgICAgICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgICAgICAgICBzcXVhcmUgKz0gb2Zmc2V0O1xyXG4gICAgICAgICAgICBpZiAoc3F1YXJlICYgMHg4OCkgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBpZiAoYm9hcmRbc3F1YXJlXSA9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgYWRkX21vdmUoYm9hcmQsIG1vdmVzLCBpLCBzcXVhcmUsIEJJVFMuTk9STUFMKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBpZiAoYm9hcmRbc3F1YXJlXS5jb2xvciA9PT0gdXMpIGJyZWFrO1xyXG4gICAgICAgICAgICAgIGFkZF9tb3ZlKGJvYXJkLCBtb3ZlcywgaSwgc3F1YXJlLCBCSVRTLkNBUFRVUkUpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvKiBicmVhaywgaWYga25pZ2h0IG9yIGtpbmcgKi9cclxuICAgICAgICAgICAgaWYgKHBpZWNlLnR5cGUgPT09ICduJyB8fCBwaWVjZS50eXBlID09PSAnaycpIGJyZWFrO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qIGNoZWNrIGZvciBjYXN0bGluZyBpZjogYSkgd2UncmUgZ2VuZXJhdGluZyBhbGwgbW92ZXMsIG9yIGIpIHdlJ3JlIGRvaW5nXHJcbiAgICAgKiBzaW5nbGUgc3F1YXJlIG1vdmUgZ2VuZXJhdGlvbiBvbiB0aGUga2luZydzIHNxdWFyZVxyXG4gICAgICovXHJcbiAgICBpZiAoKCFzaW5nbGVfc3F1YXJlKSB8fCBsYXN0X3NxID09PSBraW5nc1t1c10pIHtcclxuICAgICAgLyoga2luZy1zaWRlIGNhc3RsaW5nICovXHJcbiAgICAgIGlmIChjYXN0bGluZ1t1c10gJiBCSVRTLktTSURFX0NBU1RMRSkge1xyXG4gICAgICAgIHZhciBjYXN0bGluZ19mcm9tID0ga2luZ3NbdXNdO1xyXG4gICAgICAgIHZhciBjYXN0bGluZ190byA9IGNhc3RsaW5nX2Zyb20gKyAyO1xyXG5cclxuICAgICAgICBpZiAoYm9hcmRbY2FzdGxpbmdfZnJvbSArIDFdID09IG51bGwgJiZcclxuICAgICAgICAgICAgYm9hcmRbY2FzdGxpbmdfdG9dICAgICAgID09IG51bGwgJiZcclxuICAgICAgICAgICAgIWF0dGFja2VkKHRoZW0sIGtpbmdzW3VzXSkgJiZcclxuICAgICAgICAgICAgIWF0dGFja2VkKHRoZW0sIGNhc3RsaW5nX2Zyb20gKyAxKSAmJlxyXG4gICAgICAgICAgICAhYXR0YWNrZWQodGhlbSwgY2FzdGxpbmdfdG8pKSB7XHJcbiAgICAgICAgICBhZGRfbW92ZShib2FyZCwgbW92ZXMsIGtpbmdzW3VzXSAsIGNhc3RsaW5nX3RvLFxyXG4gICAgICAgICAgICAgICAgICAgQklUUy5LU0lERV9DQVNUTEUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLyogcXVlZW4tc2lkZSBjYXN0bGluZyAqL1xyXG4gICAgICBpZiAoY2FzdGxpbmdbdXNdICYgQklUUy5RU0lERV9DQVNUTEUpIHtcclxuICAgICAgICB2YXIgY2FzdGxpbmdfZnJvbSA9IGtpbmdzW3VzXTtcclxuICAgICAgICB2YXIgY2FzdGxpbmdfdG8gPSBjYXN0bGluZ19mcm9tIC0gMjtcclxuXHJcbiAgICAgICAgaWYgKGJvYXJkW2Nhc3RsaW5nX2Zyb20gLSAxXSA9PSBudWxsICYmXHJcbiAgICAgICAgICAgIGJvYXJkW2Nhc3RsaW5nX2Zyb20gLSAyXSA9PSBudWxsICYmXHJcbiAgICAgICAgICAgIGJvYXJkW2Nhc3RsaW5nX2Zyb20gLSAzXSA9PSBudWxsICYmXHJcbiAgICAgICAgICAgICFhdHRhY2tlZCh0aGVtLCBraW5nc1t1c10pICYmXHJcbiAgICAgICAgICAgICFhdHRhY2tlZCh0aGVtLCBjYXN0bGluZ19mcm9tIC0gMSkgJiZcclxuICAgICAgICAgICAgIWF0dGFja2VkKHRoZW0sIGNhc3RsaW5nX3RvKSkge1xyXG4gICAgICAgICAgYWRkX21vdmUoYm9hcmQsIG1vdmVzLCBraW5nc1t1c10sIGNhc3RsaW5nX3RvLFxyXG4gICAgICAgICAgICAgICAgICAgQklUUy5RU0lERV9DQVNUTEUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qIHJldHVybiBhbGwgcHNldWRvLWxlZ2FsIG1vdmVzICh0aGlzIGluY2x1ZGVzIG1vdmVzIHRoYXQgYWxsb3cgdGhlIGtpbmdcclxuICAgICAqIHRvIGJlIGNhcHR1cmVkKVxyXG4gICAgICovXHJcbiAgICBpZiAoIWxlZ2FsKSB7XHJcbiAgICAgIHJldHVybiBtb3ZlcztcclxuICAgIH1cclxuXHJcbiAgICAvKiBmaWx0ZXIgb3V0IGlsbGVnYWwgbW92ZXMgKi9cclxuICAgIHZhciBsZWdhbF9tb3ZlcyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IG1vdmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIG1ha2VfbW92ZShtb3Zlc1tpXSk7XHJcbiAgICAgIGlmICgha2luZ19hdHRhY2tlZCh1cykpIHtcclxuICAgICAgICBsZWdhbF9tb3Zlcy5wdXNoKG1vdmVzW2ldKTtcclxuICAgICAgfVxyXG4gICAgICB1bmRvX21vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGVnYWxfbW92ZXM7XHJcbiAgfVxyXG5cclxuICAvKiBjb252ZXJ0IGEgbW92ZSBmcm9tIDB4ODggY29vcmRpbmF0ZXMgdG8gU3RhbmRhcmQgQWxnZWJyYWljIE5vdGF0aW9uXHJcbiAgICogKFNBTilcclxuICAgKlxyXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gc2xvcHB5IFVzZSB0aGUgc2xvcHB5IFNBTiBnZW5lcmF0b3IgdG8gd29yayBhcm91bmQgb3ZlclxyXG4gICAqIGRpc2FtYmlndWF0aW9uIGJ1Z3MgaW4gRnJpdHogYW5kIENoZXNzYmFzZS4gIFNlZSBiZWxvdzpcclxuICAgKlxyXG4gICAqIHIxYnFrYm5yL3BwcDJwcHAvMm41LzFCMXBQMy80UDMvOC9QUFBQMlBQL1JOQlFLMU5SIGIgS1FrcSAtIDIgNFxyXG4gICAqIDQuIC4uLiBOZ2U3IGlzIG92ZXJseSBkaXNhbWJpZ3VhdGVkIGJlY2F1c2UgdGhlIGtuaWdodCBvbiBjNiBpcyBwaW5uZWRcclxuICAgKiA0LiAuLi4gTmU3IGlzIHRlY2huaWNhbGx5IHRoZSB2YWxpZCBTQU5cclxuICAgKi9cclxuICBmdW5jdGlvbiBtb3ZlX3RvX3Nhbihtb3ZlLCBzbG9wcHkpIHtcclxuXHJcbiAgICB2YXIgb3V0cHV0ID0gJyc7XHJcblxyXG4gICAgaWYgKG1vdmUuZmxhZ3MgJiBCSVRTLktTSURFX0NBU1RMRSkge1xyXG4gICAgICBvdXRwdXQgPSAnTy1PJztcclxuICAgIH0gZWxzZSBpZiAobW92ZS5mbGFncyAmIEJJVFMuUVNJREVfQ0FTVExFKSB7XHJcbiAgICAgIG91dHB1dCA9ICdPLU8tTyc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB2YXIgZGlzYW1iaWd1YXRvciA9IGdldF9kaXNhbWJpZ3VhdG9yKG1vdmUsIHNsb3BweSk7XHJcblxyXG4gICAgICBpZiAobW92ZS5waWVjZSAhPT0gUEFXTikge1xyXG4gICAgICAgIG91dHB1dCArPSBtb3ZlLnBpZWNlLnRvVXBwZXJDYXNlKCkgKyBkaXNhbWJpZ3VhdG9yO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAobW92ZS5mbGFncyAmIChCSVRTLkNBUFRVUkUgfCBCSVRTLkVQX0NBUFRVUkUpKSB7XHJcbiAgICAgICAgaWYgKG1vdmUucGllY2UgPT09IFBBV04pIHtcclxuICAgICAgICAgIG91dHB1dCArPSBhbGdlYnJhaWMobW92ZS5mcm9tKVswXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgb3V0cHV0ICs9ICd4JztcclxuICAgICAgfVxyXG5cclxuICAgICAgb3V0cHV0ICs9IGFsZ2VicmFpYyhtb3ZlLnRvKTtcclxuXHJcbiAgICAgIGlmIChtb3ZlLmZsYWdzICYgQklUUy5QUk9NT1RJT04pIHtcclxuICAgICAgICBvdXRwdXQgKz0gJz0nICsgbW92ZS5wcm9tb3Rpb24udG9VcHBlckNhc2UoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG1ha2VfbW92ZShtb3ZlKTtcclxuICAgIGlmIChpbl9jaGVjaygpKSB7XHJcbiAgICAgIGlmIChpbl9jaGVja21hdGUoKSkge1xyXG4gICAgICAgIG91dHB1dCArPSAnIyc7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgb3V0cHV0ICs9ICcrJztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgdW5kb19tb3ZlKCk7XHJcblxyXG4gICAgcmV0dXJuIG91dHB1dDtcclxuICB9XHJcblxyXG4gIC8vIHBhcnNlcyBhbGwgb2YgdGhlIGRlY29yYXRvcnMgb3V0IG9mIGEgU0FOIHN0cmluZ1xyXG4gIGZ1bmN0aW9uIHN0cmlwcGVkX3Nhbihtb3ZlKSB7XHJcbiAgICByZXR1cm4gbW92ZS5yZXBsYWNlKC89LywnJykucmVwbGFjZSgvWysjXT9bPyFdKiQvLCcnKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGF0dGFja2VkKGNvbG9yLCBzcXVhcmUpIHtcclxuICAgIGlmIChzcXVhcmUgPCAwKSByZXR1cm4gZmFsc2U7XHJcbiAgICBmb3IgKHZhciBpID0gU1FVQVJFUy5hODsgaSA8PSBTUVVBUkVTLmgxOyBpKyspIHtcclxuICAgICAgLyogZGlkIHdlIHJ1biBvZmYgdGhlIGVuZCBvZiB0aGUgYm9hcmQgKi9cclxuICAgICAgaWYgKGkgJiAweDg4KSB7IGkgKz0gNzsgY29udGludWU7IH1cclxuXHJcbiAgICAgIC8qIGlmIGVtcHR5IHNxdWFyZSBvciB3cm9uZyBjb2xvciAqL1xyXG4gICAgICBpZiAoYm9hcmRbaV0gPT0gbnVsbCB8fCBib2FyZFtpXS5jb2xvciAhPT0gY29sb3IpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgdmFyIHBpZWNlID0gYm9hcmRbaV07XHJcbiAgICAgIHZhciBkaWZmZXJlbmNlID0gaSAtIHNxdWFyZTtcclxuICAgICAgdmFyIGluZGV4ID0gZGlmZmVyZW5jZSArIDExOTtcclxuXHJcbiAgICAgIGlmIChBVFRBQ0tTW2luZGV4XSAmICgxIDw8IFNISUZUU1twaWVjZS50eXBlXSkpIHtcclxuICAgICAgICBpZiAocGllY2UudHlwZSA9PT0gUEFXTikge1xyXG4gICAgICAgICAgaWYgKGRpZmZlcmVuY2UgPiAwKSB7XHJcbiAgICAgICAgICAgIGlmIChwaWVjZS5jb2xvciA9PT0gV0hJVEUpIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKHBpZWNlLmNvbG9yID09PSBCTEFDSykgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8qIGlmIHRoZSBwaWVjZSBpcyBhIGtuaWdodCBvciBhIGtpbmcgKi9cclxuICAgICAgICBpZiAocGllY2UudHlwZSA9PT0gJ24nIHx8IHBpZWNlLnR5cGUgPT09ICdrJykgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgICAgIHZhciBvZmZzZXQgPSBSQVlTW2luZGV4XTtcclxuICAgICAgICB2YXIgaiA9IGkgKyBvZmZzZXQ7XHJcblxyXG4gICAgICAgIHZhciBibG9ja2VkID0gZmFsc2U7XHJcbiAgICAgICAgd2hpbGUgKGogIT09IHNxdWFyZSkge1xyXG4gICAgICAgICAgaWYgKGJvYXJkW2pdICE9IG51bGwpIHsgYmxvY2tlZCA9IHRydWU7IGJyZWFrOyB9XHJcbiAgICAgICAgICBqICs9IG9mZnNldDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghYmxvY2tlZCkgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBraW5nX2F0dGFja2VkKGNvbG9yKSB7XHJcbiAgICByZXR1cm4gYXR0YWNrZWQoc3dhcF9jb2xvcihjb2xvciksIGtpbmdzW2NvbG9yXSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbl9jaGVjaygpIHtcclxuICAgIHJldHVybiBraW5nX2F0dGFja2VkKHR1cm4pO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gaW5fY2hlY2ttYXRlKCkge1xyXG4gICAgcmV0dXJuIGluX2NoZWNrKCkgJiYgZ2VuZXJhdGVfbW92ZXMoKS5sZW5ndGggPT09IDA7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbl9zdGFsZW1hdGUoKSB7XHJcbiAgICByZXR1cm4gIWluX2NoZWNrKCkgJiYgZ2VuZXJhdGVfbW92ZXMoKS5sZW5ndGggPT09IDA7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbnN1ZmZpY2llbnRfbWF0ZXJpYWwoKSB7XHJcbiAgICB2YXIgcGllY2VzID0ge307XHJcbiAgICB2YXIgYmlzaG9wcyA9IFtdO1xyXG4gICAgdmFyIG51bV9waWVjZXMgPSAwO1xyXG4gICAgdmFyIHNxX2NvbG9yID0gMDtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gU1FVQVJFUy5hODsgaTw9IFNRVUFSRVMuaDE7IGkrKykge1xyXG4gICAgICBzcV9jb2xvciA9IChzcV9jb2xvciArIDEpICUgMjtcclxuICAgICAgaWYgKGkgJiAweDg4KSB7IGkgKz0gNzsgY29udGludWU7IH1cclxuXHJcbiAgICAgIHZhciBwaWVjZSA9IGJvYXJkW2ldO1xyXG4gICAgICBpZiAocGllY2UpIHtcclxuICAgICAgICBwaWVjZXNbcGllY2UudHlwZV0gPSAocGllY2UudHlwZSBpbiBwaWVjZXMpID9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGllY2VzW3BpZWNlLnR5cGVdICsgMSA6IDE7XHJcbiAgICAgICAgaWYgKHBpZWNlLnR5cGUgPT09IEJJU0hPUCkge1xyXG4gICAgICAgICAgYmlzaG9wcy5wdXNoKHNxX2NvbG9yKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbnVtX3BpZWNlcysrO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyogayB2cy4gayAqL1xyXG4gICAgaWYgKG51bV9waWVjZXMgPT09IDIpIHsgcmV0dXJuIHRydWU7IH1cclxuXHJcbiAgICAvKiBrIHZzLiBrbiAuLi4uIG9yIC4uLi4gayB2cy4ga2IgKi9cclxuICAgIGVsc2UgaWYgKG51bV9waWVjZXMgPT09IDMgJiYgKHBpZWNlc1tCSVNIT1BdID09PSAxIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBpZWNlc1tLTklHSFRdID09PSAxKSkgeyByZXR1cm4gdHJ1ZTsgfVxyXG5cclxuICAgIC8qIGtiIHZzLiBrYiB3aGVyZSBhbnkgbnVtYmVyIG9mIGJpc2hvcHMgYXJlIGFsbCBvbiB0aGUgc2FtZSBjb2xvciAqL1xyXG4gICAgZWxzZSBpZiAobnVtX3BpZWNlcyA9PT0gcGllY2VzW0JJU0hPUF0gKyAyKSB7XHJcbiAgICAgIHZhciBzdW0gPSAwO1xyXG4gICAgICB2YXIgbGVuID0gYmlzaG9wcy5sZW5ndGg7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgICBzdW0gKz0gYmlzaG9wc1tpXTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoc3VtID09PSAwIHx8IHN1bSA9PT0gbGVuKSB7IHJldHVybiB0cnVlOyB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gaW5fdGhyZWVmb2xkX3JlcGV0aXRpb24oKSB7XHJcbiAgICAvKiBUT0RPOiB3aGlsZSB0aGlzIGZ1bmN0aW9uIGlzIGZpbmUgZm9yIGNhc3VhbCB1c2UsIGEgYmV0dGVyXHJcbiAgICAgKiBpbXBsZW1lbnRhdGlvbiB3b3VsZCB1c2UgYSBab2JyaXN0IGtleSAoaW5zdGVhZCBvZiBGRU4pLiB0aGVcclxuICAgICAqIFpvYnJpc3Qga2V5IHdvdWxkIGJlIG1haW50YWluZWQgaW4gdGhlIG1ha2VfbW92ZS91bmRvX21vdmUgZnVuY3Rpb25zLFxyXG4gICAgICogYXZvaWRpbmcgdGhlIGNvc3RseSB0aGF0IHdlIGRvIGJlbG93LlxyXG4gICAgICovXHJcbiAgICB2YXIgbW92ZXMgPSBbXTtcclxuICAgIHZhciBwb3NpdGlvbnMgPSB7fTtcclxuICAgIHZhciByZXBldGl0aW9uID0gZmFsc2U7XHJcblxyXG4gICAgd2hpbGUgKHRydWUpIHtcclxuICAgICAgdmFyIG1vdmUgPSB1bmRvX21vdmUoKTtcclxuICAgICAgaWYgKCFtb3ZlKSBicmVhaztcclxuICAgICAgbW92ZXMucHVzaChtb3ZlKTtcclxuICAgIH1cclxuXHJcbiAgICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgICAvKiByZW1vdmUgdGhlIGxhc3QgdHdvIGZpZWxkcyBpbiB0aGUgRkVOIHN0cmluZywgdGhleSdyZSBub3QgbmVlZGVkXHJcbiAgICAgICAqIHdoZW4gY2hlY2tpbmcgZm9yIGRyYXcgYnkgcmVwICovXHJcbiAgICAgIHZhciBmZW4gPSBnZW5lcmF0ZV9mZW4oKS5zcGxpdCgnICcpLnNsaWNlKDAsNCkuam9pbignICcpO1xyXG5cclxuICAgICAgLyogaGFzIHRoZSBwb3NpdGlvbiBvY2N1cnJlZCB0aHJlZSBvciBtb3ZlIHRpbWVzICovXHJcbiAgICAgIHBvc2l0aW9uc1tmZW5dID0gKGZlbiBpbiBwb3NpdGlvbnMpID8gcG9zaXRpb25zW2Zlbl0gKyAxIDogMTtcclxuICAgICAgaWYgKHBvc2l0aW9uc1tmZW5dID49IDMpIHtcclxuICAgICAgICByZXBldGl0aW9uID0gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCFtb3Zlcy5sZW5ndGgpIHtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgICBtYWtlX21vdmUobW92ZXMucG9wKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXBldGl0aW9uO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcHVzaChtb3ZlKSB7XHJcbiAgICBoaXN0b3J5LnB1c2goe1xyXG4gICAgICBtb3ZlOiBtb3ZlLFxyXG4gICAgICBraW5nczoge2I6IGtpbmdzLmIsIHc6IGtpbmdzLnd9LFxyXG4gICAgICB0dXJuOiB0dXJuLFxyXG4gICAgICBjYXN0bGluZzoge2I6IGNhc3RsaW5nLmIsIHc6IGNhc3RsaW5nLnd9LFxyXG4gICAgICBlcF9zcXVhcmU6IGVwX3NxdWFyZSxcclxuICAgICAgaGFsZl9tb3ZlczogaGFsZl9tb3ZlcyxcclxuICAgICAgbW92ZV9udW1iZXI6IG1vdmVfbnVtYmVyXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG1ha2VfbW92ZShtb3ZlKSB7XHJcbiAgICB2YXIgdXMgPSB0dXJuO1xyXG4gICAgdmFyIHRoZW0gPSBzd2FwX2NvbG9yKHVzKTtcclxuICAgIHB1c2gobW92ZSk7XHJcblxyXG4gICAgYm9hcmRbbW92ZS50b10gPSBib2FyZFttb3ZlLmZyb21dO1xyXG4gICAgYm9hcmRbbW92ZS5mcm9tXSA9IG51bGw7XHJcblxyXG4gICAgLyogaWYgZXAgY2FwdHVyZSwgcmVtb3ZlIHRoZSBjYXB0dXJlZCBwYXduICovXHJcbiAgICBpZiAobW92ZS5mbGFncyAmIEJJVFMuRVBfQ0FQVFVSRSkge1xyXG4gICAgICBpZiAodHVybiA9PT0gQkxBQ0spIHtcclxuICAgICAgICBib2FyZFttb3ZlLnRvIC0gMTZdID0gbnVsbDtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBib2FyZFttb3ZlLnRvICsgMTZdID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qIGlmIHBhd24gcHJvbW90aW9uLCByZXBsYWNlIHdpdGggbmV3IHBpZWNlICovXHJcbiAgICBpZiAobW92ZS5mbGFncyAmIEJJVFMuUFJPTU9USU9OKSB7XHJcbiAgICAgIGJvYXJkW21vdmUudG9dID0ge3R5cGU6IG1vdmUucHJvbW90aW9uLCBjb2xvcjogdXN9O1xyXG4gICAgfVxyXG5cclxuICAgIC8qIGlmIHdlIG1vdmVkIHRoZSBraW5nICovXHJcbiAgICBpZiAoYm9hcmRbbW92ZS50b10udHlwZSA9PT0gS0lORykge1xyXG4gICAgICBraW5nc1tib2FyZFttb3ZlLnRvXS5jb2xvcl0gPSBtb3ZlLnRvO1xyXG5cclxuICAgICAgLyogaWYgd2UgY2FzdGxlZCwgbW92ZSB0aGUgcm9vayBuZXh0IHRvIHRoZSBraW5nICovXHJcbiAgICAgIGlmIChtb3ZlLmZsYWdzICYgQklUUy5LU0lERV9DQVNUTEUpIHtcclxuICAgICAgICB2YXIgY2FzdGxpbmdfdG8gPSBtb3ZlLnRvIC0gMTtcclxuICAgICAgICB2YXIgY2FzdGxpbmdfZnJvbSA9IG1vdmUudG8gKyAxO1xyXG4gICAgICAgIGJvYXJkW2Nhc3RsaW5nX3RvXSA9IGJvYXJkW2Nhc3RsaW5nX2Zyb21dO1xyXG4gICAgICAgIGJvYXJkW2Nhc3RsaW5nX2Zyb21dID0gbnVsbDtcclxuICAgICAgfSBlbHNlIGlmIChtb3ZlLmZsYWdzICYgQklUUy5RU0lERV9DQVNUTEUpIHtcclxuICAgICAgICB2YXIgY2FzdGxpbmdfdG8gPSBtb3ZlLnRvICsgMTtcclxuICAgICAgICB2YXIgY2FzdGxpbmdfZnJvbSA9IG1vdmUudG8gLSAyO1xyXG4gICAgICAgIGJvYXJkW2Nhc3RsaW5nX3RvXSA9IGJvYXJkW2Nhc3RsaW5nX2Zyb21dO1xyXG4gICAgICAgIGJvYXJkW2Nhc3RsaW5nX2Zyb21dID0gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLyogdHVybiBvZmYgY2FzdGxpbmcgKi9cclxuICAgICAgY2FzdGxpbmdbdXNdID0gJyc7XHJcbiAgICB9XHJcblxyXG4gICAgLyogdHVybiBvZmYgY2FzdGxpbmcgaWYgd2UgbW92ZSBhIHJvb2sgKi9cclxuICAgIGlmIChjYXN0bGluZ1t1c10pIHtcclxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IFJPT0tTW3VzXS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICAgIGlmIChtb3ZlLmZyb20gPT09IFJPT0tTW3VzXVtpXS5zcXVhcmUgJiZcclxuICAgICAgICAgICAgY2FzdGxpbmdbdXNdICYgUk9PS1NbdXNdW2ldLmZsYWcpIHtcclxuICAgICAgICAgIGNhc3RsaW5nW3VzXSBePSBST09LU1t1c11baV0uZmxhZztcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qIHR1cm4gb2ZmIGNhc3RsaW5nIGlmIHdlIGNhcHR1cmUgYSByb29rICovXHJcbiAgICBpZiAoY2FzdGxpbmdbdGhlbV0pIHtcclxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IFJPT0tTW3RoZW1dLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgICAgaWYgKG1vdmUudG8gPT09IFJPT0tTW3RoZW1dW2ldLnNxdWFyZSAmJlxyXG4gICAgICAgICAgICBjYXN0bGluZ1t0aGVtXSAmIFJPT0tTW3RoZW1dW2ldLmZsYWcpIHtcclxuICAgICAgICAgIGNhc3RsaW5nW3RoZW1dIF49IFJPT0tTW3RoZW1dW2ldLmZsYWc7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiBpZiBiaWcgcGF3biBtb3ZlLCB1cGRhdGUgdGhlIGVuIHBhc3NhbnQgc3F1YXJlICovXHJcbiAgICBpZiAobW92ZS5mbGFncyAmIEJJVFMuQklHX1BBV04pIHtcclxuICAgICAgaWYgKHR1cm4gPT09ICdiJykge1xyXG4gICAgICAgIGVwX3NxdWFyZSA9IG1vdmUudG8gLSAxNjtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBlcF9zcXVhcmUgPSBtb3ZlLnRvICsgMTY7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGVwX3NxdWFyZSA9IEVNUFRZO1xyXG4gICAgfVxyXG5cclxuICAgIC8qIHJlc2V0IHRoZSA1MCBtb3ZlIGNvdW50ZXIgaWYgYSBwYXduIGlzIG1vdmVkIG9yIGEgcGllY2UgaXMgY2FwdHVyZWQgKi9cclxuICAgIGlmIChtb3ZlLnBpZWNlID09PSBQQVdOKSB7XHJcbiAgICAgIGhhbGZfbW92ZXMgPSAwO1xyXG4gICAgfSBlbHNlIGlmIChtb3ZlLmZsYWdzICYgKEJJVFMuQ0FQVFVSRSB8IEJJVFMuRVBfQ0FQVFVSRSkpIHtcclxuICAgICAgaGFsZl9tb3ZlcyA9IDA7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBoYWxmX21vdmVzKys7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR1cm4gPT09IEJMQUNLKSB7XHJcbiAgICAgIG1vdmVfbnVtYmVyKys7XHJcbiAgICB9XHJcbiAgICB0dXJuID0gc3dhcF9jb2xvcih0dXJuKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHVuZG9fbW92ZSgpIHtcclxuICAgIHZhciBvbGQgPSBoaXN0b3J5LnBvcCgpO1xyXG4gICAgaWYgKG9sZCA9PSBudWxsKSB7IHJldHVybiBudWxsOyB9XHJcblxyXG4gICAgdmFyIG1vdmUgPSBvbGQubW92ZTtcclxuICAgIGtpbmdzID0gb2xkLmtpbmdzO1xyXG4gICAgdHVybiA9IG9sZC50dXJuO1xyXG4gICAgY2FzdGxpbmcgPSBvbGQuY2FzdGxpbmc7XHJcbiAgICBlcF9zcXVhcmUgPSBvbGQuZXBfc3F1YXJlO1xyXG4gICAgaGFsZl9tb3ZlcyA9IG9sZC5oYWxmX21vdmVzO1xyXG4gICAgbW92ZV9udW1iZXIgPSBvbGQubW92ZV9udW1iZXI7XHJcblxyXG4gICAgdmFyIHVzID0gdHVybjtcclxuICAgIHZhciB0aGVtID0gc3dhcF9jb2xvcih0dXJuKTtcclxuXHJcbiAgICBib2FyZFttb3ZlLmZyb21dID0gYm9hcmRbbW92ZS50b107XHJcbiAgICBib2FyZFttb3ZlLmZyb21dLnR5cGUgPSBtb3ZlLnBpZWNlOyAgLy8gdG8gdW5kbyBhbnkgcHJvbW90aW9uc1xyXG4gICAgYm9hcmRbbW92ZS50b10gPSBudWxsO1xyXG5cclxuICAgIGlmIChtb3ZlLmZsYWdzICYgQklUUy5DQVBUVVJFKSB7XHJcbiAgICAgIGJvYXJkW21vdmUudG9dID0ge3R5cGU6IG1vdmUuY2FwdHVyZWQsIGNvbG9yOiB0aGVtfTtcclxuICAgIH0gZWxzZSBpZiAobW92ZS5mbGFncyAmIEJJVFMuRVBfQ0FQVFVSRSkge1xyXG4gICAgICB2YXIgaW5kZXg7XHJcbiAgICAgIGlmICh1cyA9PT0gQkxBQ0spIHtcclxuICAgICAgICBpbmRleCA9IG1vdmUudG8gLSAxNjtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpbmRleCA9IG1vdmUudG8gKyAxNjtcclxuICAgICAgfVxyXG4gICAgICBib2FyZFtpbmRleF0gPSB7dHlwZTogUEFXTiwgY29sb3I6IHRoZW19O1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBpZiAobW92ZS5mbGFncyAmIChCSVRTLktTSURFX0NBU1RMRSB8IEJJVFMuUVNJREVfQ0FTVExFKSkge1xyXG4gICAgICB2YXIgY2FzdGxpbmdfdG8sIGNhc3RsaW5nX2Zyb207XHJcbiAgICAgIGlmIChtb3ZlLmZsYWdzICYgQklUUy5LU0lERV9DQVNUTEUpIHtcclxuICAgICAgICBjYXN0bGluZ190byA9IG1vdmUudG8gKyAxO1xyXG4gICAgICAgIGNhc3RsaW5nX2Zyb20gPSBtb3ZlLnRvIC0gMTtcclxuICAgICAgfSBlbHNlIGlmIChtb3ZlLmZsYWdzICYgQklUUy5RU0lERV9DQVNUTEUpIHtcclxuICAgICAgICBjYXN0bGluZ190byA9IG1vdmUudG8gLSAyO1xyXG4gICAgICAgIGNhc3RsaW5nX2Zyb20gPSBtb3ZlLnRvICsgMTtcclxuICAgICAgfVxyXG5cclxuICAgICAgYm9hcmRbY2FzdGxpbmdfdG9dID0gYm9hcmRbY2FzdGxpbmdfZnJvbV07XHJcbiAgICAgIGJvYXJkW2Nhc3RsaW5nX2Zyb21dID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbW92ZTtcclxuICB9XHJcblxyXG4gIC8qIHRoaXMgZnVuY3Rpb24gaXMgdXNlZCB0byB1bmlxdWVseSBpZGVudGlmeSBhbWJpZ3VvdXMgbW92ZXMgKi9cclxuICBmdW5jdGlvbiBnZXRfZGlzYW1iaWd1YXRvcihtb3ZlLCBzbG9wcHkpIHtcclxuICAgIHZhciBtb3ZlcyA9IGdlbmVyYXRlX21vdmVzKHtsZWdhbDogIXNsb3BweX0pO1xyXG5cclxuICAgIHZhciBmcm9tID0gbW92ZS5mcm9tO1xyXG4gICAgdmFyIHRvID0gbW92ZS50bztcclxuICAgIHZhciBwaWVjZSA9IG1vdmUucGllY2U7XHJcblxyXG4gICAgdmFyIGFtYmlndWl0aWVzID0gMDtcclxuICAgIHZhciBzYW1lX3JhbmsgPSAwO1xyXG4gICAgdmFyIHNhbWVfZmlsZSA9IDA7XHJcblxyXG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IG1vdmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIHZhciBhbWJpZ19mcm9tID0gbW92ZXNbaV0uZnJvbTtcclxuICAgICAgdmFyIGFtYmlnX3RvID0gbW92ZXNbaV0udG87XHJcbiAgICAgIHZhciBhbWJpZ19waWVjZSA9IG1vdmVzW2ldLnBpZWNlO1xyXG5cclxuICAgICAgLyogaWYgYSBtb3ZlIG9mIHRoZSBzYW1lIHBpZWNlIHR5cGUgZW5kcyBvbiB0aGUgc2FtZSB0byBzcXVhcmUsIHdlJ2xsXHJcbiAgICAgICAqIG5lZWQgdG8gYWRkIGEgZGlzYW1iaWd1YXRvciB0byB0aGUgYWxnZWJyYWljIG5vdGF0aW9uXHJcbiAgICAgICAqL1xyXG4gICAgICBpZiAocGllY2UgPT09IGFtYmlnX3BpZWNlICYmIGZyb20gIT09IGFtYmlnX2Zyb20gJiYgdG8gPT09IGFtYmlnX3RvKSB7XHJcbiAgICAgICAgYW1iaWd1aXRpZXMrKztcclxuXHJcbiAgICAgICAgaWYgKHJhbmsoZnJvbSkgPT09IHJhbmsoYW1iaWdfZnJvbSkpIHtcclxuICAgICAgICAgIHNhbWVfcmFuaysrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGZpbGUoZnJvbSkgPT09IGZpbGUoYW1iaWdfZnJvbSkpIHtcclxuICAgICAgICAgIHNhbWVfZmlsZSsrO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChhbWJpZ3VpdGllcyA+IDApIHtcclxuICAgICAgLyogaWYgdGhlcmUgZXhpc3RzIGEgc2ltaWxhciBtb3ZpbmcgcGllY2Ugb24gdGhlIHNhbWUgcmFuayBhbmQgZmlsZSBhc1xyXG4gICAgICAgKiB0aGUgbW92ZSBpbiBxdWVzdGlvbiwgdXNlIHRoZSBzcXVhcmUgYXMgdGhlIGRpc2FtYmlndWF0b3JcclxuICAgICAgICovXHJcbiAgICAgIGlmIChzYW1lX3JhbmsgPiAwICYmIHNhbWVfZmlsZSA+IDApIHtcclxuICAgICAgICByZXR1cm4gYWxnZWJyYWljKGZyb20pO1xyXG4gICAgICB9XHJcbiAgICAgIC8qIGlmIHRoZSBtb3ZpbmcgcGllY2UgcmVzdHMgb24gdGhlIHNhbWUgZmlsZSwgdXNlIHRoZSByYW5rIHN5bWJvbCBhcyB0aGVcclxuICAgICAgICogZGlzYW1iaWd1YXRvclxyXG4gICAgICAgKi9cclxuICAgICAgZWxzZSBpZiAoc2FtZV9maWxlID4gMCkge1xyXG4gICAgICAgIHJldHVybiBhbGdlYnJhaWMoZnJvbSkuY2hhckF0KDEpO1xyXG4gICAgICB9XHJcbiAgICAgIC8qIGVsc2UgdXNlIHRoZSBmaWxlIHN5bWJvbCAqL1xyXG4gICAgICBlbHNlIHtcclxuICAgICAgICByZXR1cm4gYWxnZWJyYWljKGZyb20pLmNoYXJBdCgwKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiAnJztcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGFzY2lpKCkge1xyXG4gICAgdmFyIHMgPSAnICAgKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLStcXG4nO1xyXG4gICAgZm9yICh2YXIgaSA9IFNRVUFSRVMuYTg7IGkgPD0gU1FVQVJFUy5oMTsgaSsrKSB7XHJcbiAgICAgIC8qIGRpc3BsYXkgdGhlIHJhbmsgKi9cclxuICAgICAgaWYgKGZpbGUoaSkgPT09IDApIHtcclxuICAgICAgICBzICs9ICcgJyArICc4NzY1NDMyMSdbcmFuayhpKV0gKyAnIHwnO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvKiBlbXB0eSBwaWVjZSAqL1xyXG4gICAgICBpZiAoYm9hcmRbaV0gPT0gbnVsbCkge1xyXG4gICAgICAgIHMgKz0gJyAuICc7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIHBpZWNlID0gYm9hcmRbaV0udHlwZTtcclxuICAgICAgICB2YXIgY29sb3IgPSBib2FyZFtpXS5jb2xvcjtcclxuICAgICAgICB2YXIgc3ltYm9sID0gKGNvbG9yID09PSBXSElURSkgP1xyXG4gICAgICAgICAgICAgICAgICAgICBwaWVjZS50b1VwcGVyQ2FzZSgpIDogcGllY2UudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBzICs9ICcgJyArIHN5bWJvbCArICcgJztcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKChpICsgMSkgJiAweDg4KSB7XHJcbiAgICAgICAgcyArPSAnfFxcbic7XHJcbiAgICAgICAgaSArPSA4O1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBzICs9ICcgICArLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tK1xcbic7XHJcbiAgICBzICs9ICcgICAgIGEgIGIgIGMgIGQgIGUgIGYgIGcgIGhcXG4nO1xyXG5cclxuICAgIHJldHVybiBzO1xyXG4gIH1cclxuXHJcbiAgLy8gY29udmVydCBhIG1vdmUgZnJvbSBTdGFuZGFyZCBBbGdlYnJhaWMgTm90YXRpb24gKFNBTikgdG8gMHg4OCBjb29yZGluYXRlc1xyXG4gIGZ1bmN0aW9uIG1vdmVfZnJvbV9zYW4obW92ZSwgc2xvcHB5KSB7XHJcbiAgICAvLyBzdHJpcCBvZmYgYW55IG1vdmUgZGVjb3JhdGlvbnM6IGUuZyBOZjMrPyFcclxuICAgIHZhciBjbGVhbl9tb3ZlID0gc3RyaXBwZWRfc2FuKG1vdmUpO1xyXG5cclxuICAgIC8vIGlmIHdlJ3JlIHVzaW5nIHRoZSBzbG9wcHkgcGFyc2VyIHJ1biBhIHJlZ2V4IHRvIGdyYWIgcGllY2UsIHRvLCBhbmQgZnJvbVxyXG4gICAgLy8gdGhpcyBzaG91bGQgcGFyc2UgaW52YWxpZCBTQU4gbGlrZTogUGUyLWU0LCBSYzFjNCwgUWYzeGY3XHJcbiAgICBpZiAoc2xvcHB5KSB7XHJcbiAgICAgIHZhciBtYXRjaGVzID0gY2xlYW5fbW92ZS5tYXRjaCgvKFtwbmJycWtQTkJSUUtdKT8oW2EtaF1bMS04XSl4Py0/KFthLWhdWzEtOF0pKFtxcmJuUVJCTl0pPy8pO1xyXG4gICAgICBpZiAobWF0Y2hlcykge1xyXG4gICAgICAgIHZhciBwaWVjZSA9IG1hdGNoZXNbMV07XHJcbiAgICAgICAgdmFyIGZyb20gPSBtYXRjaGVzWzJdO1xyXG4gICAgICAgIHZhciB0byA9IG1hdGNoZXNbM107XHJcbiAgICAgICAgdmFyIHByb21vdGlvbiA9IG1hdGNoZXNbNF07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgbW92ZXMgPSBnZW5lcmF0ZV9tb3ZlcygpO1xyXG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IG1vdmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIC8vIHRyeSB0aGUgc3RyaWN0IHBhcnNlciBmaXJzdCwgdGhlbiB0aGUgc2xvcHB5IHBhcnNlciBpZiByZXF1ZXN0ZWRcclxuICAgICAgLy8gYnkgdGhlIHVzZXJcclxuICAgICAgaWYgKChjbGVhbl9tb3ZlID09PSBzdHJpcHBlZF9zYW4obW92ZV90b19zYW4obW92ZXNbaV0pKSkgfHxcclxuICAgICAgICAgIChzbG9wcHkgJiYgY2xlYW5fbW92ZSA9PT0gc3RyaXBwZWRfc2FuKG1vdmVfdG9fc2FuKG1vdmVzW2ldLCB0cnVlKSkpKSB7XHJcbiAgICAgICAgcmV0dXJuIG1vdmVzW2ldO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlmIChtYXRjaGVzICYmXHJcbiAgICAgICAgICAgICghcGllY2UgfHwgcGllY2UudG9Mb3dlckNhc2UoKSA9PSBtb3Zlc1tpXS5waWVjZSkgJiZcclxuICAgICAgICAgICAgU1FVQVJFU1tmcm9tXSA9PSBtb3Zlc1tpXS5mcm9tICYmXHJcbiAgICAgICAgICAgIFNRVUFSRVNbdG9dID09IG1vdmVzW2ldLnRvICYmXHJcbiAgICAgICAgICAgICghcHJvbW90aW9uIHx8IHByb21vdGlvbi50b0xvd2VyQ2FzZSgpID09IG1vdmVzW2ldLnByb21vdGlvbikpIHtcclxuICAgICAgICAgIHJldHVybiBtb3Zlc1tpXTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG5cclxuICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgKiBVVElMSVRZIEZVTkNUSU9OU1xyXG4gICAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG4gIGZ1bmN0aW9uIHJhbmsoaSkge1xyXG4gICAgcmV0dXJuIGkgPj4gNDtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGZpbGUoaSkge1xyXG4gICAgcmV0dXJuIGkgJiAxNTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGFsZ2VicmFpYyhpKXtcclxuICAgIHZhciBmID0gZmlsZShpKSwgciA9IHJhbmsoaSk7XHJcbiAgICByZXR1cm4gJ2FiY2RlZmdoJy5zdWJzdHJpbmcoZixmKzEpICsgJzg3NjU0MzIxJy5zdWJzdHJpbmcocixyKzEpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3dhcF9jb2xvcihjKSB7XHJcbiAgICByZXR1cm4gYyA9PT0gV0hJVEUgPyBCTEFDSyA6IFdISVRFO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gaXNfZGlnaXQoYykge1xyXG4gICAgcmV0dXJuICcwMTIzNDU2Nzg5Jy5pbmRleE9mKGMpICE9PSAtMTtcclxuICB9XHJcblxyXG4gIC8qIHByZXR0eSA9IGV4dGVybmFsIG1vdmUgb2JqZWN0ICovXHJcbiAgZnVuY3Rpb24gbWFrZV9wcmV0dHkodWdseV9tb3ZlKSB7XHJcbiAgICB2YXIgbW92ZSA9IGNsb25lKHVnbHlfbW92ZSk7XHJcbiAgICBtb3ZlLnNhbiA9IG1vdmVfdG9fc2FuKG1vdmUsIGZhbHNlKTtcclxuICAgIG1vdmUudG8gPSBhbGdlYnJhaWMobW92ZS50byk7XHJcbiAgICBtb3ZlLmZyb20gPSBhbGdlYnJhaWMobW92ZS5mcm9tKTtcclxuXHJcbiAgICB2YXIgZmxhZ3MgPSAnJztcclxuXHJcbiAgICBmb3IgKHZhciBmbGFnIGluIEJJVFMpIHtcclxuICAgICAgaWYgKEJJVFNbZmxhZ10gJiBtb3ZlLmZsYWdzKSB7XHJcbiAgICAgICAgZmxhZ3MgKz0gRkxBR1NbZmxhZ107XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIG1vdmUuZmxhZ3MgPSBmbGFncztcclxuXHJcbiAgICByZXR1cm4gbW92ZTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNsb25lKG9iaikge1xyXG4gICAgdmFyIGR1cGUgPSAob2JqIGluc3RhbmNlb2YgQXJyYXkpID8gW10gOiB7fTtcclxuXHJcbiAgICBmb3IgKHZhciBwcm9wZXJ0eSBpbiBvYmopIHtcclxuICAgICAgaWYgKHR5cGVvZiBwcm9wZXJ0eSA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICBkdXBlW3Byb3BlcnR5XSA9IGNsb25lKG9ialtwcm9wZXJ0eV0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGR1cGVbcHJvcGVydHldID0gb2JqW3Byb3BlcnR5XTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBkdXBlO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdHJpbShzdHIpIHtcclxuICAgIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xyXG4gIH1cclxuXHJcbiAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICogREVCVUdHSU5HIFVUSUxJVElFU1xyXG4gICAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG4gIGZ1bmN0aW9uIHBlcmZ0KGRlcHRoKSB7XHJcbiAgICB2YXIgbW92ZXMgPSBnZW5lcmF0ZV9tb3Zlcyh7bGVnYWw6IGZhbHNlfSk7XHJcbiAgICB2YXIgbm9kZXMgPSAwO1xyXG4gICAgdmFyIGNvbG9yID0gdHVybjtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gbW92ZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgbWFrZV9tb3ZlKG1vdmVzW2ldKTtcclxuICAgICAgaWYgKCFraW5nX2F0dGFja2VkKGNvbG9yKSkge1xyXG4gICAgICAgIGlmIChkZXB0aCAtIDEgPiAwKSB7XHJcbiAgICAgICAgICB2YXIgY2hpbGRfbm9kZXMgPSBwZXJmdChkZXB0aCAtIDEpO1xyXG4gICAgICAgICAgbm9kZXMgKz0gY2hpbGRfbm9kZXM7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIG5vZGVzKys7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHVuZG9fbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBub2RlcztcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgKiBQVUJMSUMgQ09OU1RBTlRTIChpcyB0aGVyZSBhIGJldHRlciB3YXkgdG8gZG8gdGhpcz8pXHJcbiAgICAgKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbiAgICBXSElURTogV0hJVEUsXHJcbiAgICBCTEFDSzogQkxBQ0ssXHJcbiAgICBQQVdOOiBQQVdOLFxyXG4gICAgS05JR0hUOiBLTklHSFQsXHJcbiAgICBCSVNIT1A6IEJJU0hPUCxcclxuICAgIFJPT0s6IFJPT0ssXHJcbiAgICBRVUVFTjogUVVFRU4sXHJcbiAgICBLSU5HOiBLSU5HLFxyXG4gICAgU1FVQVJFUzogKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgLyogZnJvbSB0aGUgRUNNQS0yNjIgc3BlYyAoc2VjdGlvbiAxMi42LjQpOlxyXG4gICAgICAgICAgICAgICAgICogXCJUaGUgbWVjaGFuaWNzIG9mIGVudW1lcmF0aW5nIHRoZSBwcm9wZXJ0aWVzIC4uLiBpc1xyXG4gICAgICAgICAgICAgICAgICogaW1wbGVtZW50YXRpb24gZGVwZW5kZW50XCJcclxuICAgICAgICAgICAgICAgICAqIHNvOiBmb3IgKHZhciBzcSBpbiBTUVVBUkVTKSB7IGtleXMucHVzaChzcSk7IH0gbWlnaHQgbm90IGJlXHJcbiAgICAgICAgICAgICAgICAgKiBvcmRlcmVkIGNvcnJlY3RseVxyXG4gICAgICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgICAgICB2YXIga2V5cyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IFNRVUFSRVMuYTg7IGkgPD0gU1FVQVJFUy5oMTsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChpICYgMHg4OCkgeyBpICs9IDc7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgICAgICAgICAgIGtleXMucHVzaChhbGdlYnJhaWMoaSkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleXM7XHJcbiAgICAgICAgICAgICAgfSkoKSxcclxuICAgIEZMQUdTOiBGTEFHUyxcclxuXHJcbiAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgKiBQVUJMSUMgQVBJXHJcbiAgICAgKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbiAgICBsb2FkOiBmdW5jdGlvbihmZW4pIHtcclxuICAgICAgcmV0dXJuIGxvYWQoZmVuKTtcclxuICAgIH0sXHJcblxyXG4gICAgcmVzZXQ6IGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gcmVzZXQoKTtcclxuICAgIH0sXHJcblxyXG4gICAgbW92ZXM6IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICAgICAgLyogVGhlIGludGVybmFsIHJlcHJlc2VudGF0aW9uIG9mIGEgY2hlc3MgbW92ZSBpcyBpbiAweDg4IGZvcm1hdCwgYW5kXHJcbiAgICAgICAqIG5vdCBtZWFudCB0byBiZSBodW1hbi1yZWFkYWJsZS4gIFRoZSBjb2RlIGJlbG93IGNvbnZlcnRzIHRoZSAweDg4XHJcbiAgICAgICAqIHNxdWFyZSBjb29yZGluYXRlcyB0byBhbGdlYnJhaWMgY29vcmRpbmF0ZXMuICBJdCBhbHNvIHBydW5lcyBhblxyXG4gICAgICAgKiB1bm5lY2Vzc2FyeSBtb3ZlIGtleXMgcmVzdWx0aW5nIGZyb20gYSB2ZXJib3NlIGNhbGwuXHJcbiAgICAgICAqL1xyXG5cclxuICAgICAgdmFyIHVnbHlfbW92ZXMgPSBnZW5lcmF0ZV9tb3ZlcyhvcHRpb25zKTtcclxuICAgICAgdmFyIG1vdmVzID0gW107XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gdWdseV9tb3Zlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cclxuICAgICAgICAvKiBkb2VzIHRoZSB1c2VyIHdhbnQgYSBmdWxsIG1vdmUgb2JqZWN0IChtb3N0IGxpa2VseSBub3QpLCBvciBqdXN0XHJcbiAgICAgICAgICogU0FOXHJcbiAgICAgICAgICovXHJcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAndW5kZWZpbmVkJyAmJiAndmVyYm9zZScgaW4gb3B0aW9ucyAmJlxyXG4gICAgICAgICAgICBvcHRpb25zLnZlcmJvc2UpIHtcclxuICAgICAgICAgIG1vdmVzLnB1c2gobWFrZV9wcmV0dHkodWdseV9tb3Zlc1tpXSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBtb3Zlcy5wdXNoKG1vdmVfdG9fc2FuKHVnbHlfbW92ZXNbaV0sIGZhbHNlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gbW92ZXM7XHJcbiAgICB9LFxyXG5cclxuICAgIGluX2NoZWNrOiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGluX2NoZWNrKCk7XHJcbiAgICB9LFxyXG5cclxuICAgIGluX2NoZWNrbWF0ZTogZnVuY3Rpb24oKSB7XHJcbiAgICAgIHJldHVybiBpbl9jaGVja21hdGUoKTtcclxuICAgIH0sXHJcblxyXG4gICAgaW5fc3RhbGVtYXRlOiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGluX3N0YWxlbWF0ZSgpO1xyXG4gICAgfSxcclxuXHJcbiAgICBpbl9kcmF3OiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGhhbGZfbW92ZXMgPj0gMTAwIHx8XHJcbiAgICAgICAgICAgICBpbl9zdGFsZW1hdGUoKSB8fFxyXG4gICAgICAgICAgICAgaW5zdWZmaWNpZW50X21hdGVyaWFsKCkgfHxcclxuICAgICAgICAgICAgIGluX3RocmVlZm9sZF9yZXBldGl0aW9uKCk7XHJcbiAgICB9LFxyXG5cclxuICAgIGluc3VmZmljaWVudF9tYXRlcmlhbDogZnVuY3Rpb24oKSB7XHJcbiAgICAgIHJldHVybiBpbnN1ZmZpY2llbnRfbWF0ZXJpYWwoKTtcclxuICAgIH0sXHJcblxyXG4gICAgaW5fdGhyZWVmb2xkX3JlcGV0aXRpb246IGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gaW5fdGhyZWVmb2xkX3JlcGV0aXRpb24oKTtcclxuICAgIH0sXHJcblxyXG4gICAgZ2FtZV9vdmVyOiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGhhbGZfbW92ZXMgPj0gMTAwIHx8XHJcbiAgICAgICAgICAgICBpbl9jaGVja21hdGUoKSB8fFxyXG4gICAgICAgICAgICAgaW5fc3RhbGVtYXRlKCkgfHxcclxuICAgICAgICAgICAgIGluc3VmZmljaWVudF9tYXRlcmlhbCgpIHx8XHJcbiAgICAgICAgICAgICBpbl90aHJlZWZvbGRfcmVwZXRpdGlvbigpO1xyXG4gICAgfSxcclxuXHJcbiAgICB2YWxpZGF0ZV9mZW46IGZ1bmN0aW9uKGZlbikge1xyXG4gICAgICByZXR1cm4gdmFsaWRhdGVfZmVuKGZlbik7XHJcbiAgICB9LFxyXG5cclxuICAgIGZlbjogZnVuY3Rpb24oKSB7XHJcbiAgICAgIHJldHVybiBnZW5lcmF0ZV9mZW4oKTtcclxuICAgIH0sXHJcblxyXG4gICAgcGduOiBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICAgIC8qIHVzaW5nIHRoZSBzcGVjaWZpY2F0aW9uIGZyb20gaHR0cDovL3d3dy5jaGVzc2NsdWIuY29tL2hlbHAvUEdOLXNwZWNcclxuICAgICAgICogZXhhbXBsZSBmb3IgaHRtbCB1c2FnZTogLnBnbih7IG1heF93aWR0aDogNzIsIG5ld2xpbmVfY2hhcjogXCI8YnIgLz5cIiB9KVxyXG4gICAgICAgKi9cclxuICAgICAgdmFyIG5ld2xpbmUgPSAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnICYmXHJcbiAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiBvcHRpb25zLm5ld2xpbmVfY2hhciA9PT0gJ3N0cmluZycpID9cclxuICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5uZXdsaW5lX2NoYXIgOiAnXFxuJztcclxuICAgICAgdmFyIG1heF93aWR0aCA9ICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2Ygb3B0aW9ucy5tYXhfd2lkdGggPT09ICdudW1iZXInKSA/XHJcbiAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5tYXhfd2lkdGggOiAwO1xyXG4gICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgIHZhciBoZWFkZXJfZXhpc3RzID0gZmFsc2U7XHJcblxyXG4gICAgICAvKiBhZGQgdGhlIFBHTiBoZWFkZXIgaGVhZGVycm1hdGlvbiAqL1xyXG4gICAgICBmb3IgKHZhciBpIGluIGhlYWRlcikge1xyXG4gICAgICAgIC8qIFRPRE86IG9yZGVyIG9mIGVudW1lcmF0ZWQgcHJvcGVydGllcyBpbiBoZWFkZXIgb2JqZWN0IGlzIG5vdFxyXG4gICAgICAgICAqIGd1YXJhbnRlZWQsIHNlZSBFQ01BLTI2MiBzcGVjIChzZWN0aW9uIDEyLjYuNClcclxuICAgICAgICAgKi9cclxuICAgICAgICByZXN1bHQucHVzaCgnWycgKyBpICsgJyBcXFwiJyArIGhlYWRlcltpXSArICdcXFwiXScgKyBuZXdsaW5lKTtcclxuICAgICAgICBoZWFkZXJfZXhpc3RzID0gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGhlYWRlcl9leGlzdHMgJiYgaGlzdG9yeS5sZW5ndGgpIHtcclxuICAgICAgICByZXN1bHQucHVzaChuZXdsaW5lKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLyogcG9wIGFsbCBvZiBoaXN0b3J5IG9udG8gcmV2ZXJzZWRfaGlzdG9yeSAqL1xyXG4gICAgICB2YXIgcmV2ZXJzZWRfaGlzdG9yeSA9IFtdO1xyXG4gICAgICB3aGlsZSAoaGlzdG9yeS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgcmV2ZXJzZWRfaGlzdG9yeS5wdXNoKHVuZG9fbW92ZSgpKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdmFyIG1vdmVzID0gW107XHJcbiAgICAgIHZhciBtb3ZlX3N0cmluZyA9ICcnO1xyXG5cclxuICAgICAgLyogYnVpbGQgdGhlIGxpc3Qgb2YgbW92ZXMuICBhIG1vdmVfc3RyaW5nIGxvb2tzIGxpa2U6IFwiMy4gZTMgZTZcIiAqL1xyXG4gICAgICB3aGlsZSAocmV2ZXJzZWRfaGlzdG9yeS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdmFyIG1vdmUgPSByZXZlcnNlZF9oaXN0b3J5LnBvcCgpO1xyXG5cclxuICAgICAgICAvKiBpZiB0aGUgcG9zaXRpb24gc3RhcnRlZCB3aXRoIGJsYWNrIHRvIG1vdmUsIHN0YXJ0IFBHTiB3aXRoIDEuIC4uLiAqL1xyXG4gICAgICAgIGlmICghaGlzdG9yeS5sZW5ndGggJiYgbW92ZS5jb2xvciA9PT0gJ2InKSB7XHJcbiAgICAgICAgICBtb3ZlX3N0cmluZyA9IG1vdmVfbnVtYmVyICsgJy4gLi4uJztcclxuICAgICAgICB9IGVsc2UgaWYgKG1vdmUuY29sb3IgPT09ICd3Jykge1xyXG4gICAgICAgICAgLyogc3RvcmUgdGhlIHByZXZpb3VzIGdlbmVyYXRlZCBtb3ZlX3N0cmluZyBpZiB3ZSBoYXZlIG9uZSAqL1xyXG4gICAgICAgICAgaWYgKG1vdmVfc3RyaW5nLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBtb3Zlcy5wdXNoKG1vdmVfc3RyaW5nKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIG1vdmVfc3RyaW5nID0gbW92ZV9udW1iZXIgKyAnLic7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBtb3ZlX3N0cmluZyA9IG1vdmVfc3RyaW5nICsgJyAnICsgbW92ZV90b19zYW4obW92ZSwgZmFsc2UpO1xyXG4gICAgICAgIG1ha2VfbW92ZShtb3ZlKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLyogYXJlIHRoZXJlIGFueSBvdGhlciBsZWZ0b3ZlciBtb3Zlcz8gKi9cclxuICAgICAgaWYgKG1vdmVfc3RyaW5nLmxlbmd0aCkge1xyXG4gICAgICAgIG1vdmVzLnB1c2gobW92ZV9zdHJpbmcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvKiBpcyB0aGVyZSBhIHJlc3VsdD8gKi9cclxuICAgICAgaWYgKHR5cGVvZiBoZWFkZXIuUmVzdWx0ICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgIG1vdmVzLnB1c2goaGVhZGVyLlJlc3VsdCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8qIGhpc3Rvcnkgc2hvdWxkIGJlIGJhY2sgdG8gd2hhdCBpcyB3YXMgYmVmb3JlIHdlIHN0YXJ0ZWQgZ2VuZXJhdGluZyBQR04sXHJcbiAgICAgICAqIHNvIGpvaW4gdG9nZXRoZXIgbW92ZXNcclxuICAgICAgICovXHJcbiAgICAgIGlmIChtYXhfd2lkdGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gcmVzdWx0LmpvaW4oJycpICsgbW92ZXMuam9pbignICcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvKiB3cmFwIHRoZSBQR04gb3V0cHV0IGF0IG1heF93aWR0aCAqL1xyXG4gICAgICB2YXIgY3VycmVudF93aWR0aCA9IDA7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbW92ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAvKiBpZiB0aGUgY3VycmVudCBtb3ZlIHdpbGwgcHVzaCBwYXN0IG1heF93aWR0aCAqL1xyXG4gICAgICAgIGlmIChjdXJyZW50X3dpZHRoICsgbW92ZXNbaV0ubGVuZ3RoID4gbWF4X3dpZHRoICYmIGkgIT09IDApIHtcclxuXHJcbiAgICAgICAgICAvKiBkb24ndCBlbmQgdGhlIGxpbmUgd2l0aCB3aGl0ZXNwYWNlICovXHJcbiAgICAgICAgICBpZiAocmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSA9PT0gJyAnKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wb3AoKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICByZXN1bHQucHVzaChuZXdsaW5lKTtcclxuICAgICAgICAgIGN1cnJlbnRfd2lkdGggPSAwO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaSAhPT0gMCkge1xyXG4gICAgICAgICAgcmVzdWx0LnB1c2goJyAnKTtcclxuICAgICAgICAgIGN1cnJlbnRfd2lkdGgrKztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzdWx0LnB1c2gobW92ZXNbaV0pO1xyXG4gICAgICAgIGN1cnJlbnRfd2lkdGggKz0gbW92ZXNbaV0ubGVuZ3RoO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcmVzdWx0LmpvaW4oJycpO1xyXG4gICAgfSxcclxuXHJcbiAgICBsb2FkX3BnbjogZnVuY3Rpb24ocGduLCBvcHRpb25zKSB7XHJcbiAgICAgIC8vIGFsbG93IHRoZSB1c2VyIHRvIHNwZWNpZnkgdGhlIHNsb3BweSBtb3ZlIHBhcnNlciB0byB3b3JrIGFyb3VuZCBvdmVyXHJcbiAgICAgIC8vIGRpc2FtYmlndWF0aW9uIGJ1Z3MgaW4gRnJpdHogYW5kIENoZXNzYmFzZVxyXG4gICAgICB2YXIgc2xvcHB5ID0gKHR5cGVvZiBvcHRpb25zICE9PSAndW5kZWZpbmVkJyAmJiAnc2xvcHB5JyBpbiBvcHRpb25zKSA/XHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5zbG9wcHkgOiBmYWxzZTtcclxuXHJcbiAgICAgIGZ1bmN0aW9uIG1hc2soc3RyKSB7XHJcbiAgICAgICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXFxcL2csICdcXFxcJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIGhhc19rZXlzKG9iamVjdCkge1xyXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIHBhcnNlX3Bnbl9oZWFkZXIoaGVhZGVyLCBvcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIG5ld2xpbmVfY2hhciA9ICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiBvcHRpb25zLm5ld2xpbmVfY2hhciA9PT0gJ3N0cmluZycpID9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMubmV3bGluZV9jaGFyIDogJ1xccj9cXG4nO1xyXG4gICAgICAgIHZhciBoZWFkZXJfb2JqID0ge307XHJcbiAgICAgICAgdmFyIGhlYWRlcnMgPSBoZWFkZXIuc3BsaXQobmV3IFJlZ0V4cChtYXNrKG5ld2xpbmVfY2hhcikpKTtcclxuICAgICAgICB2YXIga2V5ID0gJyc7XHJcbiAgICAgICAgdmFyIHZhbHVlID0gJyc7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGVhZGVycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAga2V5ID0gaGVhZGVyc1tpXS5yZXBsYWNlKC9eXFxbKFtBLVpdW0EtWmEtel0qKVxccy4qXFxdJC8sICckMScpO1xyXG4gICAgICAgICAgdmFsdWUgPSBoZWFkZXJzW2ldLnJlcGxhY2UoL15cXFtbQS1aYS16XStcXHNcIiguKilcIlxcXSQvLCAnJDEnKTtcclxuICAgICAgICAgIGlmICh0cmltKGtleSkubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBoZWFkZXJfb2JqW2tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBoZWFkZXJfb2JqO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB2YXIgbmV3bGluZV9jaGFyID0gKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0JyAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiBvcHRpb25zLm5ld2xpbmVfY2hhciA9PT0gJ3N0cmluZycpID9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLm5ld2xpbmVfY2hhciA6ICdcXHI/XFxuJztcclxuICAgICAgdmFyIHJlZ2V4ID0gbmV3IFJlZ0V4cCgnXihcXFxcWygufCcgKyBtYXNrKG5ld2xpbmVfY2hhcikgKyAnKSpcXFxcXSknICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnKCcgKyBtYXNrKG5ld2xpbmVfY2hhcikgKyAnKSonICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnMS4oJyArIG1hc2sobmV3bGluZV9jaGFyKSArICd8LikqJCcsICdnJyk7XHJcblxyXG4gICAgICAvKiBnZXQgaGVhZGVyIHBhcnQgb2YgdGhlIFBHTiBmaWxlICovXHJcbiAgICAgIHZhciBoZWFkZXJfc3RyaW5nID0gcGduLnJlcGxhY2UocmVnZXgsICckMScpO1xyXG5cclxuICAgICAgLyogbm8gaW5mbyBwYXJ0IGdpdmVuLCBiZWdpbnMgd2l0aCBtb3ZlcyAqL1xyXG4gICAgICBpZiAoaGVhZGVyX3N0cmluZ1swXSAhPT0gJ1snKSB7XHJcbiAgICAgICAgaGVhZGVyX3N0cmluZyA9ICcnO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXNldCgpO1xyXG5cclxuICAgICAgLyogcGFyc2UgUEdOIGhlYWRlciAqL1xyXG4gICAgICB2YXIgaGVhZGVycyA9IHBhcnNlX3Bnbl9oZWFkZXIoaGVhZGVyX3N0cmluZywgb3B0aW9ucyk7XHJcbiAgICAgIGZvciAodmFyIGtleSBpbiBoZWFkZXJzKSB7XHJcbiAgICAgICAgc2V0X2hlYWRlcihba2V5LCBoZWFkZXJzW2tleV1dKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLyogbG9hZCB0aGUgc3RhcnRpbmcgcG9zaXRpb24gaW5kaWNhdGVkIGJ5IFtTZXR1cCAnMSddIGFuZFxyXG4gICAgICAqIFtGRU4gcG9zaXRpb25dICovXHJcbiAgICAgIGlmIChoZWFkZXJzWydTZXRVcCddID09PSAnMScpIHtcclxuICAgICAgICAgIGlmICghKCgnRkVOJyBpbiBoZWFkZXJzKSAmJiBsb2FkKGhlYWRlcnNbJ0ZFTiddKSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvKiBkZWxldGUgaGVhZGVyIHRvIGdldCB0aGUgbW92ZXMgKi9cclxuICAgICAgdmFyIG1zID0gcGduLnJlcGxhY2UoaGVhZGVyX3N0cmluZywgJycpLnJlcGxhY2UobmV3IFJlZ0V4cChtYXNrKG5ld2xpbmVfY2hhciksICdnJyksICcgJyk7XHJcblxyXG4gICAgICAvKiBkZWxldGUgY29tbWVudHMgKi9cclxuICAgICAgbXMgPSBtcy5yZXBsYWNlKC8oXFx7W159XStcXH0pKz8vZywgJycpO1xyXG5cclxuICAgICAgLyogZGVsZXRlIHJlY3Vyc2l2ZSBhbm5vdGF0aW9uIHZhcmlhdGlvbnMgKi9cclxuICAgICAgdmFyIHJhdl9yZWdleCA9IC8oXFwoW15cXChcXCldK1xcKSkrPy9nXHJcbiAgICAgIHdoaWxlIChyYXZfcmVnZXgudGVzdChtcykpIHtcclxuICAgICAgICBtcyA9IG1zLnJlcGxhY2UocmF2X3JlZ2V4LCAnJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8qIGRlbGV0ZSBtb3ZlIG51bWJlcnMgKi9cclxuICAgICAgbXMgPSBtcy5yZXBsYWNlKC9cXGQrXFwuKFxcLlxcLik/L2csICcnKTtcclxuXHJcbiAgICAgIC8qIGRlbGV0ZSAuLi4gaW5kaWNhdGluZyBibGFjayB0byBtb3ZlICovXHJcbiAgICAgIG1zID0gbXMucmVwbGFjZSgvXFwuXFwuXFwuL2csICcnKTtcclxuXHJcbiAgICAgIC8qIGRlbGV0ZSBudW1lcmljIGFubm90YXRpb24gZ2x5cGhzICovXHJcbiAgICAgIG1zID0gbXMucmVwbGFjZSgvXFwkXFxkKy9nLCAnJyk7XHJcblxyXG4gICAgICAvKiB0cmltIGFuZCBnZXQgYXJyYXkgb2YgbW92ZXMgKi9cclxuICAgICAgdmFyIG1vdmVzID0gdHJpbShtcykuc3BsaXQobmV3IFJlZ0V4cCgvXFxzKy8pKTtcclxuXHJcbiAgICAgIC8qIGRlbGV0ZSBlbXB0eSBlbnRyaWVzICovXHJcbiAgICAgIG1vdmVzID0gbW92ZXMuam9pbignLCcpLnJlcGxhY2UoLywsKy9nLCAnLCcpLnNwbGl0KCcsJyk7XHJcbiAgICAgIHZhciBtb3ZlID0gJyc7XHJcblxyXG4gICAgICBmb3IgKHZhciBoYWxmX21vdmUgPSAwOyBoYWxmX21vdmUgPCBtb3Zlcy5sZW5ndGggLSAxOyBoYWxmX21vdmUrKykge1xyXG4gICAgICAgIG1vdmUgPSBtb3ZlX2Zyb21fc2FuKG1vdmVzW2hhbGZfbW92ZV0sIHNsb3BweSk7XHJcblxyXG4gICAgICAgIC8qIG1vdmUgbm90IHBvc3NpYmxlISAoZG9uJ3QgY2xlYXIgdGhlIGJvYXJkIHRvIGV4YW1pbmUgdG8gc2hvdyB0aGVcclxuICAgICAgICAgKiBsYXRlc3QgdmFsaWQgcG9zaXRpb24pXHJcbiAgICAgICAgICovXHJcbiAgICAgICAgaWYgKG1vdmUgPT0gbnVsbCkge1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBtYWtlX21vdmUobW92ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvKiBleGFtaW5lIGxhc3QgbW92ZSAqL1xyXG4gICAgICBtb3ZlID0gbW92ZXNbbW92ZXMubGVuZ3RoIC0gMV07XHJcbiAgICAgIGlmIChQT1NTSUJMRV9SRVNVTFRTLmluZGV4T2YobW92ZSkgPiAtMSkge1xyXG4gICAgICAgIGlmIChoYXNfa2V5cyhoZWFkZXIpICYmIHR5cGVvZiBoZWFkZXIuUmVzdWx0ID09PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgc2V0X2hlYWRlcihbJ1Jlc3VsdCcsIG1vdmVdKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgbW92ZSA9IG1vdmVfZnJvbV9zYW4obW92ZSwgc2xvcHB5KTtcclxuICAgICAgICBpZiAobW92ZSA9PSBudWxsKSB7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIG1ha2VfbW92ZShtb3ZlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9LFxyXG5cclxuICAgIGhlYWRlcjogZnVuY3Rpb24oKSB7XHJcbiAgICAgIHJldHVybiBzZXRfaGVhZGVyKGFyZ3VtZW50cyk7XHJcbiAgICB9LFxyXG5cclxuICAgIGFzY2lpOiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGFzY2lpKCk7XHJcbiAgICB9LFxyXG5cclxuICAgIHR1cm46IGZ1bmN0aW9uKCkge1xyXG4gICAgICByZXR1cm4gdHVybjtcclxuICAgIH0sXHJcblxyXG4gICAgbW92ZTogZnVuY3Rpb24obW92ZSwgb3B0aW9ucykge1xyXG4gICAgICAvKiBUaGUgbW92ZSBmdW5jdGlvbiBjYW4gYmUgY2FsbGVkIHdpdGggaW4gdGhlIGZvbGxvd2luZyBwYXJhbWV0ZXJzOlxyXG4gICAgICAgKlxyXG4gICAgICAgKiAubW92ZSgnTnhiNycpICAgICAgPC0gd2hlcmUgJ21vdmUnIGlzIGEgY2FzZS1zZW5zaXRpdmUgU0FOIHN0cmluZ1xyXG4gICAgICAgKlxyXG4gICAgICAgKiAubW92ZSh7IGZyb206ICdoNycsIDwtIHdoZXJlIHRoZSAnbW92ZScgaXMgYSBtb3ZlIG9iamVjdCAoYWRkaXRpb25hbFxyXG4gICAgICAgKiAgICAgICAgIHRvIDonaDgnLCAgICAgIGZpZWxkcyBhcmUgaWdub3JlZClcclxuICAgICAgICogICAgICAgICBwcm9tb3Rpb246ICdxJyxcclxuICAgICAgICogICAgICB9KVxyXG4gICAgICAgKi9cclxuXHJcbiAgICAgIC8vIGFsbG93IHRoZSB1c2VyIHRvIHNwZWNpZnkgdGhlIHNsb3BweSBtb3ZlIHBhcnNlciB0byB3b3JrIGFyb3VuZCBvdmVyXHJcbiAgICAgIC8vIGRpc2FtYmlndWF0aW9uIGJ1Z3MgaW4gRnJpdHogYW5kIENoZXNzYmFzZVxyXG4gICAgICB2YXIgc2xvcHB5ID0gKHR5cGVvZiBvcHRpb25zICE9PSAndW5kZWZpbmVkJyAmJiAnc2xvcHB5JyBpbiBvcHRpb25zKSA/XHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5zbG9wcHkgOiBmYWxzZTtcclxuXHJcbiAgICAgIHZhciBtb3ZlX29iaiA9IG51bGw7XHJcblxyXG4gICAgICBpZiAodHlwZW9mIG1vdmUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgbW92ZV9vYmogPSBtb3ZlX2Zyb21fc2FuKG1vdmUsIHNsb3BweSk7XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vdmUgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgdmFyIG1vdmVzID0gZ2VuZXJhdGVfbW92ZXMoKTtcclxuXHJcbiAgICAgICAgLyogY29udmVydCB0aGUgcHJldHR5IG1vdmUgb2JqZWN0IHRvIGFuIHVnbHkgbW92ZSBvYmplY3QgKi9cclxuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gbW92ZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgICAgIGlmIChtb3ZlLmZyb20gPT09IGFsZ2VicmFpYyhtb3Zlc1tpXS5mcm9tKSAmJlxyXG4gICAgICAgICAgICAgIG1vdmUudG8gPT09IGFsZ2VicmFpYyhtb3Zlc1tpXS50bykgJiZcclxuICAgICAgICAgICAgICAoISgncHJvbW90aW9uJyBpbiBtb3Zlc1tpXSkgfHxcclxuICAgICAgICAgICAgICBtb3ZlLnByb21vdGlvbiA9PT0gbW92ZXNbaV0ucHJvbW90aW9uKSkge1xyXG4gICAgICAgICAgICBtb3ZlX29iaiA9IG1vdmVzW2ldO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8qIGZhaWxlZCB0byBmaW5kIG1vdmUgKi9cclxuICAgICAgaWYgKCFtb3ZlX29iaikge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvKiBuZWVkIHRvIG1ha2UgYSBjb3B5IG9mIG1vdmUgYmVjYXVzZSB3ZSBjYW4ndCBnZW5lcmF0ZSBTQU4gYWZ0ZXIgdGhlXHJcbiAgICAgICAqIG1vdmUgaXMgbWFkZVxyXG4gICAgICAgKi9cclxuICAgICAgdmFyIHByZXR0eV9tb3ZlID0gbWFrZV9wcmV0dHkobW92ZV9vYmopO1xyXG5cclxuICAgICAgbWFrZV9tb3ZlKG1vdmVfb2JqKTtcclxuXHJcbiAgICAgIHJldHVybiBwcmV0dHlfbW92ZTtcclxuICAgIH0sXHJcblxyXG4gICAgdW5kbzogZnVuY3Rpb24oKSB7XHJcbiAgICAgIHZhciBtb3ZlID0gdW5kb19tb3ZlKCk7XHJcbiAgICAgIHJldHVybiAobW92ZSkgPyBtYWtlX3ByZXR0eShtb3ZlKSA6IG51bGw7XHJcbiAgICB9LFxyXG5cclxuICAgIGNsZWFyOiBmdW5jdGlvbigpIHtcclxuICAgICAgcmV0dXJuIGNsZWFyKCk7XHJcbiAgICB9LFxyXG5cclxuICAgIHB1dDogZnVuY3Rpb24ocGllY2UsIHNxdWFyZSkge1xyXG4gICAgICByZXR1cm4gcHV0KHBpZWNlLCBzcXVhcmUpO1xyXG4gICAgfSxcclxuXHJcbiAgICBnZXQ6IGZ1bmN0aW9uKHNxdWFyZSkge1xyXG4gICAgICByZXR1cm4gZ2V0KHNxdWFyZSk7XHJcbiAgICB9LFxyXG5cclxuICAgIHJlbW92ZTogZnVuY3Rpb24oc3F1YXJlKSB7XHJcbiAgICAgIHJldHVybiByZW1vdmUoc3F1YXJlKTtcclxuICAgIH0sXHJcblxyXG4gICAgcGVyZnQ6IGZ1bmN0aW9uKGRlcHRoKSB7XHJcbiAgICAgIHJldHVybiBwZXJmdChkZXB0aCk7XHJcbiAgICB9LFxyXG5cclxuICAgIHNxdWFyZV9jb2xvcjogZnVuY3Rpb24oc3F1YXJlKSB7XHJcbiAgICAgIGlmIChzcXVhcmUgaW4gU1FVQVJFUykge1xyXG4gICAgICAgIHZhciBzcV8weDg4ID0gU1FVQVJFU1tzcXVhcmVdO1xyXG4gICAgICAgIHJldHVybiAoKHJhbmsoc3FfMHg4OCkgKyBmaWxlKHNxXzB4ODgpKSAlIDIgPT09IDApID8gJ2xpZ2h0JyA6ICdkYXJrJztcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9LFxyXG5cclxuICAgIGhpc3Rvcnk6IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICAgICAgdmFyIHJldmVyc2VkX2hpc3RvcnkgPSBbXTtcclxuICAgICAgdmFyIG1vdmVfaGlzdG9yeSA9IFtdO1xyXG4gICAgICB2YXIgdmVyYm9zZSA9ICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ3VuZGVmaW5lZCcgJiYgJ3ZlcmJvc2UnIGluIG9wdGlvbnMgJiZcclxuICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy52ZXJib3NlKTtcclxuXHJcbiAgICAgIHdoaWxlIChoaXN0b3J5Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICByZXZlcnNlZF9oaXN0b3J5LnB1c2godW5kb19tb3ZlKCkpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB3aGlsZSAocmV2ZXJzZWRfaGlzdG9yeS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdmFyIG1vdmUgPSByZXZlcnNlZF9oaXN0b3J5LnBvcCgpO1xyXG4gICAgICAgIGlmICh2ZXJib3NlKSB7XHJcbiAgICAgICAgICBtb3ZlX2hpc3RvcnkucHVzaChtYWtlX3ByZXR0eShtb3ZlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIG1vdmVfaGlzdG9yeS5wdXNoKG1vdmVfdG9fc2FuKG1vdmUpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbWFrZV9tb3ZlKG1vdmUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gbW92ZV9oaXN0b3J5O1xyXG4gICAgfVxyXG5cclxuICB9O1xyXG59O1xyXG5cclxuLyogZXhwb3J0IENoZXNzIG9iamVjdCBpZiB1c2luZyBub2RlIG9yIGFueSBvdGhlciBDb21tb25KUyBjb21wYXRpYmxlXHJcbiAqIGVudmlyb25tZW50ICovXHJcbmlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIGV4cG9ydHMuQ2hlc3MgPSBDaGVzcztcclxuLyogZXhwb3J0IENoZXNzIG9iamVjdCBmb3IgYW55IFJlcXVpcmVKUyBjb21wYXRpYmxlIGVudmlyb25tZW50ICovXHJcbmlmICh0eXBlb2YgZGVmaW5lICE9PSAndW5kZWZpbmVkJykgZGVmaW5lKCBmdW5jdGlvbiAoKSB7IHJldHVybiBDaGVzczsgIH0pO1xyXG4iLCJ2YXIgQ2hlc3MgPSByZXF1aXJlKCdjaGVzcy5qcycpLkNoZXNzO1xyXG52YXIgYyA9IHJlcXVpcmUoJy4vY2hlc3N1dGlscycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcygpO1xyXG4gICAgY2hlc3MubG9hZChwdXp6bGUuZmVuKTtcclxuICAgIGFkZENoZWNraW5nU3F1YXJlcyhwdXp6bGUuZmVuLCBwdXp6bGUuZmVhdHVyZXMpO1xyXG4gICAgYWRkQ2hlY2tpbmdTcXVhcmVzKGMuZmVuRm9yT3RoZXJTaWRlKHB1enpsZS5mZW4pLCBwdXp6bGUuZmVhdHVyZXMpO1xyXG4gICAgcmV0dXJuIHB1enpsZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGFkZENoZWNraW5nU3F1YXJlcyhmZW4sIGZlYXR1cmVzKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoKTtcclxuICAgIGNoZXNzLmxvYWQoZmVuKTtcclxuICAgIHZhciBtb3ZlcyA9IGNoZXNzLm1vdmVzKHtcclxuICAgICAgICB2ZXJib3NlOiB0cnVlXHJcbiAgICB9KTtcclxuXHJcbiAgICB2YXIgbWF0ZXMgPSBtb3Zlcy5maWx0ZXIobW92ZSA9PiAvXFwjLy50ZXN0KG1vdmUuc2FuKSk7XHJcbiAgICB2YXIgY2hlY2tzID0gbW92ZXMuZmlsdGVyKG1vdmUgPT4gL1xcKy8udGVzdChtb3ZlLnNhbikpO1xyXG4gICAgZmVhdHVyZXMucHVzaCh7XHJcbiAgICAgICAgZGVzY3JpcHRpb246IFwiQ2hlY2tpbmcgc3F1YXJlc1wiLFxyXG4gICAgICAgIHNpZGU6IGNoZXNzLnR1cm4oKSxcclxuICAgICAgICB0YXJnZXRzOiBjaGVja3MubWFwKG0gPT4gdGFyZ2V0QW5kRGlhZ3JhbShtLmZyb20sIG0udG8sIGNoZWNraW5nTW92ZXMoZmVuLCBtKSwgJ+KZlCsnKSlcclxuICAgIH0pO1xyXG5cclxuICAgIGZlYXR1cmVzLnB1c2goe1xyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIk1hdGluZyBzcXVhcmVzXCIsXHJcbiAgICAgICAgc2lkZTogY2hlc3MudHVybigpLFxyXG4gICAgICAgIHRhcmdldHM6IG1hdGVzLm1hcChtID0+IHRhcmdldEFuZERpYWdyYW0obS5mcm9tLCBtLnRvLCBjaGVja2luZ01vdmVzKGZlbiwgbSksICfimZQjJykpXHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAobWF0ZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGZlYXR1cmVzLmZvckVhY2goZiA9PiB7XHJcbiAgICAgICAgICAgIGlmIChmLmRlc2NyaXB0aW9uID09PSBcIk1hdGUtaW4tMSB0aHJlYXRzXCIpIHtcclxuICAgICAgICAgICAgICAgIGYudGFyZ2V0cyA9IFtdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNraW5nTW92ZXMoZmVuLCBtb3ZlKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoKTtcclxuICAgIGNoZXNzLmxvYWQoZmVuKTtcclxuICAgIGNoZXNzLm1vdmUobW92ZSk7XHJcbiAgICBjaGVzcy5sb2FkKGMuZmVuRm9yT3RoZXJTaWRlKGNoZXNzLmZlbigpKSk7XHJcbiAgICB2YXIgbW92ZXMgPSBjaGVzcy5tb3Zlcyh7XHJcbiAgICAgICAgdmVyYm9zZTogdHJ1ZVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gbW92ZXMuZmlsdGVyKG0gPT4gbS5jYXB0dXJlZCAmJiBtLmNhcHR1cmVkLnRvTG93ZXJDYXNlKCkgPT09ICdrJyk7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiB0YXJnZXRBbmREaWFncmFtKGZyb20sIHRvLCBjaGVja3MsIG1hcmtlcikge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0YXJnZXQ6IHRvLFxyXG4gICAgICAgIG1hcmtlcjogbWFya2VyLFxyXG4gICAgICAgIGRpYWdyYW06IFt7XHJcbiAgICAgICAgICAgIG9yaWc6IGZyb20sXHJcbiAgICAgICAgICAgIGRlc3Q6IHRvLFxyXG4gICAgICAgICAgICBicnVzaDogJ3BhbGVCbHVlJ1xyXG4gICAgICAgIH1dLmNvbmNhdChjaGVja3MubWFwKG0gPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgb3JpZzogbS5mcm9tLFxyXG4gICAgICAgICAgICAgICAgZGVzdDogbS50byxcclxuICAgICAgICAgICAgICAgIGJydXNoOiAncmVkJ1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pKVxyXG4gICAgfTtcclxufVxyXG4iLCIvKipcclxuICogQ2hlc3MgZXh0ZW5zaW9uc1xyXG4gKi9cclxuXHJcbnZhciBDaGVzcyA9IHJlcXVpcmUoJ2NoZXNzLmpzJykuQ2hlc3M7XHJcblxyXG52YXIgYWxsU3F1YXJlcyA9IFsnYTEnLCAnYTInLCAnYTMnLCAnYTQnLCAnYTUnLCAnYTYnLCAnYTcnLCAnYTgnLCAnYjEnLCAnYjInLCAnYjMnLCAnYjQnLCAnYjUnLCAnYjYnLCAnYjcnLCAnYjgnLCAnYzEnLCAnYzInLCAnYzMnLCAnYzQnLCAnYzUnLCAnYzYnLCAnYzcnLCAnYzgnLCAnZDEnLCAnZDInLCAnZDMnLCAnZDQnLCAnZDUnLCAnZDYnLCAnZDcnLCAnZDgnLCAnZTEnLCAnZTInLCAnZTMnLCAnZTQnLCAnZTUnLCAnZTYnLCAnZTcnLCAnZTgnLCAnZjEnLCAnZjInLCAnZjMnLCAnZjQnLCAnZjUnLCAnZjYnLCAnZjcnLCAnZjgnLCAnZzEnLCAnZzInLCAnZzMnLCAnZzQnLCAnZzUnLCAnZzYnLCAnZzcnLCAnZzgnLCAnaDEnLCAnaDInLCAnaDMnLCAnaDQnLCAnaDUnLCAnaDYnLCAnaDcnLCAnaDgnXTtcclxuXHJcbi8qKlxyXG4gKiBQbGFjZSBraW5nIGF0IHNxdWFyZSBhbmQgZmluZCBvdXQgaWYgaXQgaXMgaW4gY2hlY2suXHJcbiAqL1xyXG5mdW5jdGlvbiBpc0NoZWNrQWZ0ZXJQbGFjaW5nS2luZ0F0U3F1YXJlKGZlbiwga2luZywgc3F1YXJlKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoZmVuKTtcclxuICAgIGNoZXNzLnJlbW92ZShzcXVhcmUpO1xyXG4gICAgY2hlc3MucmVtb3ZlKGtpbmcpO1xyXG4gICAgY2hlc3MucHV0KHtcclxuICAgICAgICB0eXBlOiAnaycsXHJcbiAgICAgICAgY29sb3I6IGNoZXNzLnR1cm4oKVxyXG4gICAgfSwgc3F1YXJlKTtcclxuICAgIHJldHVybiBjaGVzcy5pbl9jaGVjaygpO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gbW92ZXNUaGF0UmVzdWx0SW5DYXB0dXJlVGhyZWF0KGZlbiwgZnJvbSwgdG8sIHNhbWVTaWRlKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoZmVuKTtcclxuXHJcbiAgICBpZiAoIXNhbWVTaWRlKSB7XHJcbiAgICAgICAgLy9udWxsIG1vdmUgZm9yIHBsYXllciB0byBhbGxvdyBvcHBvbmVudCBhIG1vdmVcclxuICAgICAgICBjaGVzcy5sb2FkKGZlbkZvck90aGVyU2lkZShjaGVzcy5mZW4oKSkpO1xyXG4gICAgICAgIGZlbiA9IGNoZXNzLmZlbigpO1xyXG5cclxuICAgIH1cclxuICAgIHZhciBtb3ZlcyA9IGNoZXNzLm1vdmVzKHtcclxuICAgICAgICB2ZXJib3NlOiB0cnVlXHJcbiAgICB9KTtcclxuICAgIHZhciBzcXVhcmVzQmV0d2VlbiA9IGJldHdlZW4oZnJvbSwgdG8pO1xyXG5cclxuICAgIC8vIGRvIGFueSBvZiB0aGUgbW92ZXMgcmV2ZWFsIHRoZSBkZXNpcmVkIGNhcHR1cmUgXHJcbiAgICByZXR1cm4gbW92ZXMuZmlsdGVyKG1vdmUgPT4gc3F1YXJlc0JldHdlZW4uaW5kZXhPZihtb3ZlLmZyb20pICE9PSAtMSlcclxuICAgICAgICAuZmlsdGVyKG0gPT4gZG9lc01vdmVSZXN1bHRJbkNhcHR1cmVUaHJlYXQobSwgZmVuLCBmcm9tLCB0bywgc2FtZVNpZGUpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZG9lc01vdmVSZXN1bHRJbkNhcHR1cmVUaHJlYXQobW92ZSwgZmVuLCBmcm9tLCB0bywgc2FtZVNpZGUpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcyhmZW4pO1xyXG5cclxuICAgIC8vYXBwbHkgbW92ZSBvZiBpbnRlcm1lZGlhcnkgcGllY2UgKHN0YXRlIGJlY29tZXMgb3RoZXIgc2lkZXMgdHVybilcclxuICAgIGNoZXNzLm1vdmUobW92ZSk7XHJcblxyXG4gICAgLy9jb25zb2xlLmxvZyhjaGVzcy5hc2NpaSgpKTtcclxuICAgIC8vY29uc29sZS5sb2coY2hlc3MudHVybigpKTtcclxuXHJcbiAgICBpZiAoc2FtZVNpZGUpIHtcclxuICAgICAgICAvL251bGwgbW92ZSBmb3Igb3Bwb25lbnQgdG8gcmVnYWluIHRoZSBtb3ZlIGZvciBvcmlnaW5hbCBzaWRlXHJcbiAgICAgICAgY2hlc3MubG9hZChmZW5Gb3JPdGhlclNpZGUoY2hlc3MuZmVuKCkpKTtcclxuICAgIH1cclxuXHJcbiAgICAvL2dldCBsZWdhbCBtb3Zlc1xyXG4gICAgdmFyIG1vdmVzID0gY2hlc3MubW92ZXMoe1xyXG4gICAgICAgIHZlcmJvc2U6IHRydWVcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIGRvIGFueSBvZiB0aGUgbW92ZXMgbWF0Y2ggZnJvbSx0byBcclxuICAgIHJldHVybiBtb3Zlcy5maWx0ZXIobSA9PiBtLmZyb20gPT09IGZyb20gJiYgbS50byA9PT0gdG8pLmxlbmd0aCA+IDA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTd2l0Y2ggc2lkZSB0byBwbGF5IChhbmQgcmVtb3ZlIGVuLXBhc3NlbnQgaW5mb3JtYXRpb24pXHJcbiAqL1xyXG5mdW5jdGlvbiBmZW5Gb3JPdGhlclNpZGUoZmVuKSB7XHJcbiAgICBpZiAoZmVuLnNlYXJjaChcIiB3IFwiKSA+IDApIHtcclxuICAgICAgICByZXR1cm4gZmVuLnJlcGxhY2UoLyB3IC4qLywgXCIgYiAtIC0gMCAxXCIpO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIGZlbi5yZXBsYWNlKC8gYiAuKi8sIFwiIHcgLSAtIDAgMlwiKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFdoZXJlIGlzIHRoZSBraW5nLlxyXG4gKi9cclxuZnVuY3Rpb24ga2luZ3NTcXVhcmUoZmVuLCBjb2xvdXIpIHtcclxuICAgIHJldHVybiBzcXVhcmVzT2ZQaWVjZShmZW4sIGNvbG91ciwgJ2snKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3F1YXJlc09mUGllY2UoZmVuLCBjb2xvdXIsIHBpZWNlVHlwZSkge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKGZlbik7XHJcbiAgICByZXR1cm4gYWxsU3F1YXJlcy5maW5kKHNxdWFyZSA9PiB7XHJcbiAgICAgICAgdmFyIHIgPSBjaGVzcy5nZXQoc3F1YXJlKTtcclxuICAgICAgICByZXR1cm4gciA9PT0gbnVsbCA/IGZhbHNlIDogKHIuY29sb3IgPT0gY29sb3VyICYmIHIudHlwZS50b0xvd2VyQ2FzZSgpID09PSBwaWVjZVR5cGUpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG1vdmVzT2ZQaWVjZU9uKGZlbiwgc3F1YXJlKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoZmVuKTtcclxuICAgIHJldHVybiBjaGVzcy5tb3Zlcyh7XHJcbiAgICAgICAgdmVyYm9zZTogdHJ1ZSxcclxuICAgICAgICBzcXVhcmU6IHNxdWFyZVxyXG4gICAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGaW5kIHBvc2l0aW9uIG9mIGFsbCBvZiBvbmUgY29sb3VycyBwaWVjZXMgZXhjbHVkaW5nIHRoZSBraW5nLlxyXG4gKi9cclxuZnVuY3Rpb24gcGllY2VzRm9yQ29sb3VyKGZlbiwgY29sb3VyKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoZmVuKTtcclxuICAgIHJldHVybiBhbGxTcXVhcmVzLmZpbHRlcihzcXVhcmUgPT4ge1xyXG4gICAgICAgIHZhciByID0gY2hlc3MuZ2V0KHNxdWFyZSk7XHJcbiAgICAgICAgaWYgKChyID09PSBudWxsKSB8fCAoci50eXBlID09PSAnaycpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHIuY29sb3IgPT0gY29sb3VyO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFsbFBpZWNlc0ZvckNvbG91cihmZW4sIGNvbG91cikge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKGZlbik7XHJcbiAgICByZXR1cm4gYWxsU3F1YXJlcy5maWx0ZXIoc3F1YXJlID0+IHtcclxuICAgICAgICB2YXIgciA9IGNoZXNzLmdldChzcXVhcmUpO1xyXG4gICAgICAgIHJldHVybiByICYmIHIuY29sb3IgPT0gY29sb3VyO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG1ham9yUGllY2VzRm9yQ29sb3VyKGZlbiwgY29sb3VyKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoZmVuKTtcclxuICAgIHJldHVybiBhbGxTcXVhcmVzLmZpbHRlcihzcXVhcmUgPT4ge1xyXG4gICAgICAgIHZhciByID0gY2hlc3MuZ2V0KHNxdWFyZSk7XHJcbiAgICAgICAgaWYgKChyID09PSBudWxsKSB8fCAoci50eXBlID09PSAncCcpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHIuY29sb3IgPT0gY29sb3VyO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbkNhcHR1cmUoZnJvbSwgZnJvbVBpZWNlLCB0bywgdG9QaWVjZSkge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKCk7XHJcbiAgICBjaGVzcy5jbGVhcigpO1xyXG4gICAgY2hlc3MucHV0KHtcclxuICAgICAgICB0eXBlOiBmcm9tUGllY2UudHlwZSxcclxuICAgICAgICBjb2xvcjogJ3cnXHJcbiAgICB9LCBmcm9tKTtcclxuICAgIGNoZXNzLnB1dCh7XHJcbiAgICAgICAgdHlwZTogdG9QaWVjZS50eXBlLFxyXG4gICAgICAgIGNvbG9yOiAnYidcclxuICAgIH0sIHRvKTtcclxuICAgIHZhciBtb3ZlcyA9IGNoZXNzLm1vdmVzKHtcclxuICAgICAgICBzcXVhcmU6IGZyb20sXHJcbiAgICAgICAgdmVyYm9zZTogdHJ1ZVxyXG4gICAgfSkuZmlsdGVyKG0gPT4gKC8uKnguKi8udGVzdChtLnNhbikpKTtcclxuICAgIHJldHVybiBtb3Zlcy5sZW5ndGggPiAwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBiZXR3ZWVuKGZyb20sIHRvKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICB2YXIgbiA9IGZyb207XHJcbiAgICB3aGlsZSAobiAhPT0gdG8pIHtcclxuICAgICAgICBuID0gU3RyaW5nLmZyb21DaGFyQ29kZShuLmNoYXJDb2RlQXQoKSArIE1hdGguc2lnbih0by5jaGFyQ29kZUF0KCkgLSBuLmNoYXJDb2RlQXQoKSkpICtcclxuICAgICAgICAgICAgU3RyaW5nLmZyb21DaGFyQ29kZShuLmNoYXJDb2RlQXQoMSkgKyBNYXRoLnNpZ24odG8uY2hhckNvZGVBdCgxKSAtIG4uY2hhckNvZGVBdCgxKSkpO1xyXG4gICAgICAgIHJlc3VsdC5wdXNoKG4pO1xyXG4gICAgfVxyXG4gICAgcmVzdWx0LnBvcCgpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVwYWlyRmVuKGZlbikge1xyXG4gICAgaWYgKC9eW14gXSokLy50ZXN0KGZlbikpIHtcclxuICAgICAgICByZXR1cm4gZmVuICsgXCIgdyAtIC0gMCAxXCI7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmVuLnJlcGxhY2UoLyB3IC4qLywgJyB3IC0gLSAwIDEnKS5yZXBsYWNlKC8gYiAuKi8sICcgYiAtIC0gMCAxJyk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzLmFsbFNxdWFyZXMgPSBhbGxTcXVhcmVzO1xyXG5tb2R1bGUuZXhwb3J0cy5raW5nc1NxdWFyZSA9IGtpbmdzU3F1YXJlO1xyXG5tb2R1bGUuZXhwb3J0cy5waWVjZXNGb3JDb2xvdXIgPSBwaWVjZXNGb3JDb2xvdXI7XHJcbm1vZHVsZS5leHBvcnRzLmFsbFBpZWNlc0ZvckNvbG91ciA9IGFsbFBpZWNlc0ZvckNvbG91cjtcclxubW9kdWxlLmV4cG9ydHMuaXNDaGVja0FmdGVyUGxhY2luZ0tpbmdBdFNxdWFyZSA9IGlzQ2hlY2tBZnRlclBsYWNpbmdLaW5nQXRTcXVhcmU7XHJcbm1vZHVsZS5leHBvcnRzLmZlbkZvck90aGVyU2lkZSA9IGZlbkZvck90aGVyU2lkZTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLm1vdmVzVGhhdFJlc3VsdEluQ2FwdHVyZVRocmVhdCA9IG1vdmVzVGhhdFJlc3VsdEluQ2FwdHVyZVRocmVhdDtcclxubW9kdWxlLmV4cG9ydHMubW92ZXNPZlBpZWNlT24gPSBtb3Zlc09mUGllY2VPbjtcclxubW9kdWxlLmV4cG9ydHMubWFqb3JQaWVjZXNGb3JDb2xvdXIgPSBtYWpvclBpZWNlc0ZvckNvbG91cjtcclxubW9kdWxlLmV4cG9ydHMuY2FuQ2FwdHVyZSA9IGNhbkNhcHR1cmU7XHJcbm1vZHVsZS5leHBvcnRzLmJldHdlZW4gPSBiZXR3ZWVuO1xyXG5tb2R1bGUuZXhwb3J0cy5yZXBhaXJGZW4gPSByZXBhaXJGZW47XHJcbiIsInZhciB1bmlxID0gcmVxdWlyZSgnLi91dGlsL3VuaXEnKTtcclxuXHJcbi8qKlxyXG4gKiBGaW5kIGFsbCBkaWFncmFtcyBhc3NvY2lhdGVkIHdpdGggdGFyZ2V0IHNxdWFyZSBpbiB0aGUgbGlzdCBvZiBmZWF0dXJlcy5cclxuICovXHJcbmZ1bmN0aW9uIGRpYWdyYW1Gb3JUYXJnZXQoc2lkZSwgZGVzY3JpcHRpb24sIHRhcmdldCwgZmVhdHVyZXMpIHtcclxuICB2YXIgZGlhZ3JhbSA9IFtdO1xyXG4gIGZlYXR1cmVzXHJcbiAgICAuZmlsdGVyKGYgPT4gc2lkZSA/IHNpZGUgPT09IGYuc2lkZSA6IHRydWUpXHJcbiAgICAuZmlsdGVyKGYgPT4gZGVzY3JpcHRpb24gPyBkZXNjcmlwdGlvbiA9PT0gZi5kZXNjcmlwdGlvbiA6IHRydWUpXHJcbiAgICAuZm9yRWFjaChmID0+IGYudGFyZ2V0cy5mb3JFYWNoKHQgPT4ge1xyXG4gICAgICBpZiAoIXRhcmdldCB8fCB0LnRhcmdldCA9PT0gdGFyZ2V0KSB7XHJcbiAgICAgICAgZGlhZ3JhbSA9IGRpYWdyYW0uY29uY2F0KHQuZGlhZ3JhbSk7XHJcbiAgICAgICAgdC5zZWxlY3RlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgIH0pKTtcclxuICByZXR1cm4gdW5pcShkaWFncmFtKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWxsRGlhZ3JhbXMoZmVhdHVyZXMpIHtcclxuICB2YXIgZGlhZ3JhbSA9IFtdO1xyXG4gIGZlYXR1cmVzLmZvckVhY2goZiA9PiBmLnRhcmdldHMuZm9yRWFjaCh0ID0+IHtcclxuICAgIGRpYWdyYW0gPSBkaWFncmFtLmNvbmNhdCh0LmRpYWdyYW0pO1xyXG4gICAgdC5zZWxlY3RlZCA9IHRydWU7XHJcbiAgfSkpO1xyXG4gIHJldHVybiB1bmlxKGRpYWdyYW0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjbGVhckRpYWdyYW1zKGZlYXR1cmVzKSB7XHJcbiAgZmVhdHVyZXMuZm9yRWFjaChmID0+IGYudGFyZ2V0cy5mb3JFYWNoKHQgPT4ge1xyXG4gICAgdC5zZWxlY3RlZCA9IGZhbHNlO1xyXG4gIH0pKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2xpY2tlZFNxdWFyZXMoZmVhdHVyZXMsIGNvcnJlY3QsIGluY29ycmVjdCwgdGFyZ2V0KSB7XHJcbiAgdmFyIGRpYWdyYW0gPSBkaWFncmFtRm9yVGFyZ2V0KG51bGwsIG51bGwsIHRhcmdldCwgZmVhdHVyZXMpO1xyXG4gIGNvcnJlY3QuZm9yRWFjaCh0YXJnZXQgPT4ge1xyXG4gICAgZGlhZ3JhbS5wdXNoKHtcclxuICAgICAgb3JpZzogdGFyZ2V0LFxyXG4gICAgICBicnVzaDogJ2dyZWVuJ1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbiAgaW5jb3JyZWN0LmZvckVhY2godGFyZ2V0ID0+IHtcclxuICAgIGRpYWdyYW0ucHVzaCh7XHJcbiAgICAgIG9yaWc6IHRhcmdldCxcclxuICAgICAgYnJ1c2g6ICdyZWQnXHJcbiAgICB9KTtcclxuICB9KTtcclxuICByZXR1cm4gZGlhZ3JhbTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgZGlhZ3JhbUZvclRhcmdldDogZGlhZ3JhbUZvclRhcmdldCxcclxuICBhbGxEaWFncmFtczogYWxsRGlhZ3JhbXMsXHJcbiAgY2xlYXJEaWFncmFtczogY2xlYXJEaWFncmFtcyxcclxuICBjbGlja2VkU3F1YXJlczogY2xpY2tlZFNxdWFyZXNcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBbXHJcbiAgICAnMmJyM2svcHAzUHAxLzFuMnAzLzFQMk4xcHIvMlAycVAxLzgvMUJRMlAxUC80UjFLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzZSMS81cjFrL3A2Yi8xcEIxcDJxLzFQNi81clFQLzVQMUsvNlIxIHcgLSAtIDEgMCcsXHJcbiAgICAnNnJrL3AxcGIxcDFwLzJwcDFQMi8yYjFuMlEvNFBSMi8zQjQvUFBQMUsyUC9STkIzcTEgdyAtIC0gMSAwJyxcclxuICAgICdybjNyazEvMnFwMnBwL3AzUDMvMXAxYjQvM2I0LzNCNC9QUFAxUTFQUC9SMUIyUjFLIHcgLSAtIDEgMCcsXHJcbiAgICAncjJCMWJrMS8xcDVwLzJwMnAyL3AxbjUvNFAxQlAvUDFOYjQvS1BuM1BOLzNSM1IgYiAtIC0gMCAxJyxcclxuICAgICcyUjNuay8zcjJiMS9wMnByMVExLzRwTjIvMVA2L1A2UC9xNy9CNFJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzgvOC8yTjFQMy8xUDYvNFEzLzRiMksvNGszLzRxMyB3IC0gLSAxIDAnLFxyXG4gICAgJ3IxYjFrMW5yL3A1YnAvcDFwQnExcDEvM3BQMVAxL040UTIvOC9QUFAxTjJQL1I0UksxIHcgLSAtIDEgMCcsXHJcbiAgICAnNXJrMS9wcDJwMnAvM3AycGIvMnBQbjJQLzJQMnEyLzJONFAvUFAzQlIxL1IyQksxTjEgYiAtIC0gMCAxJyxcclxuICAgICcxcjJxcmsxL3A0cDFwL2JwMXAxUXAxL24xcHBQMy9QMVA1LzJQQjFQTjEvNlBQL1I0UksxIHcgLSAtIDEgMCcsXHJcbiAgICAncjNxMXIxLzFwMmJOa3AvcDNuMy8yUE4xQjFRL1BQMVAxcDIvN1AvNVBQMS82SzEgdyAtIC0gMSAwJyxcclxuICAgICczazQvUjcvNU4yLzFwMm4zLzZwMS9QMU4yYlAxLzFyNi81SzIgYiAtIC0gMCAxJyxcclxuICAgICc3ay8xcHBxNC8xbjFwMlExLzFQNE5wLzFQM3AxQi8zQjQvN1Avcm41SyB3IC0gLSAxIDAnLFxyXG4gICAgJzZyMS9RNHAyLzRwcTFrLzNwMk5iL1A0UDFLLzRQMy83UC8yUjUgYiAtIC0gMCAxJyxcclxuICAgICdyM2syci8xQnAycHBwLzgvNHExYjEvcFAxbjQvUDFLUDNQLzFCUDUvUjJRM1IgYiAtIC0gMCAxJyxcclxuICAgICc3ci9wcDRRMS8xcXAycDFyLzVrMi8yUDRQLzFQQjUvUDRQUDEvNFIxSzEgdyAtIC0gMSAwJyxcclxuICAgICczcjJrMS8xcDNwMXAvcDFuMnFwMS8yQjUvMVAyUTJQLzZQMS9CMmJSUDIvNksxIHcgLSAtIDEgMCcsXHJcbiAgICAncjVyay9wcHEycDIvMnBiMVAxQi8zbjQvM1A0LzJQQjNQL1BQMVFOUDIvMUs2IHcgLSAtIDEgMCcsXHJcbiAgICAnNmsxLzJiM3IxLzgvNnBSLzJwM04xLzJQYlAxUFAvMVBCMlIxSy8ycjUgdyAtIC0gMSAwJyxcclxuICAgICdyMnExazFyL3BwcDFiQjFwLzJucDQvNk4xLzNQUDFiUC84L1BQUDUvUk5CMlJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzJyM2sxL3A0cDIvM1JwMnAvMXAyUDFwSy84LzFQNFAxL1AzUTJQLzFxNiBiIC0gLSAwIDEnLFxyXG4gICAgJzgvcHAyazMvN3IvMlAxcDFwMS80UDMvNXBxMS8yUjNOMS8xUjNCSzEgYiAtIC0gMCAxJyxcclxuICAgICc0cjJyLzVrMi8ycDJQMXAvcDJwUDFwMS8zUDJRMS82UEIvMW41UC82SzEgdyAtIC0gMSAwJyxcclxuICAgICcyYjFycWsxL3IxcDJwcDEvcHA0bjEvM05wMVExLzRQMlAvMUJQNS9QUDNQMi8yS1IyUjEgdyAtIC0gMSAwJyxcclxuICAgICc0cjFrMS9wUTNwcDEvN3AvNHEzLzRyMy9QNy8xUDJuUFBQLzJCUjFSMUsgYiAtIC0gMCAxJyxcclxuICAgICdyNWsxL3AxcDNicC8xcDFwNC8yUFAycXAvMVA2LzFRMWJQMy9QQjNyUFAvUjJOMlJLIGIgLSAtIDAgMScsXHJcbiAgICAnNGszL3IyYm5uMXIvMXEycFIxcC9wMnBQcDFCLzJwUDFOMVAvUHBQMUIzLzFQNFExLzVLUjEgdyAtIC0gMSAwJyxcclxuICAgICdyMWIyazIvMXA0cHAvcDROMXIvNFBwMi9QM3BQMXEvNFAyUC8xUDJRMksvM1IyUjEgdyAtIC0gMSAwJyxcclxuICAgICcycTRyL1I3LzVwMWsvMkJwUG4yLzZRcC82UE4vNVAxSy84IHcgLSAtIDEgMCcsXHJcbiAgICAnM3IxcTFyLzFwNGsxLzFwcDJwcDEvNHAzLzRQMlIvMW5QM1BRL1BQM1BLMS83UiB3IC0gLSAxIDAnLFxyXG4gICAgJzNyNC9wUjJOMy8ycGtiMy81cDIvOC8yQjUvcVAzUFBQLzRSMUsxIHcgLSAtIDEgMCcsXHJcbiAgICAncjFiNHIvMWsyYnBwcC9wMXAxcDMvOC9OcDJuQjIvM1I0L1BQUDFCUFBQLzJLUjQgdyAtIC0gMSAwJyxcclxuICAgICc2a3IvcDFRM3BwLzNCYmJxMS84LzVSMi81UDIvUFAzUDFQLzRLQjFSIHcgLSAtIDEgMCcsXHJcbiAgICAnMnEycjFrLzVRcDEvNHAxUDEvM3A0L3I2Yi83Ui81QlBQLzVSSzEgdyAtIC0gMSAwJyxcclxuICAgICc1cjFrLzRSMy82cFAvcjFwUVBwMi81UDIvMnAxUE4yLzJxNS81SzFSIHcgLSAtIDEgMCcsXHJcbiAgICAnMnIycjIvN2svNXBScC81cTIvM3AxUDIvNlFQL1AyQjFQMUsvNlIxIHcgLSAtIDEgMCcsXHJcbiAgICAnUTcvMnIycnBrLzJwNHAvN04vM1BwTjIvMXAyUDMvMUs0UjEvNXEyIHcgLSAtIDEgMCcsXHJcbiAgICAncjRrMi9QUjYvMWI2LzRwMU5wLzJCMnAyLzJwNS8ySzUvOCB3IC0gLSAxIDAnLFxyXG4gICAgJ3JuM3JrMS9wNXBwLzJwNS8zUHBiMi8ycTUvMVE2L1BQUEIyUFAvUjNLMU5SIGIgLSAtIDAgMScsXHJcbiAgICAncjJxcjFrMS8xcDFuMnBwLzJiMXAzL3AycFAxYjEvUDJQMU5wMS8zQlBSMi8xUFFCM1AvNVJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzVyMWsvMXE0YnAvM3BCMXAxLzJwUG4xQjEvMXI2LzFwNVIvMVAyUFBRUC9SNUsxIHcgLSAtIDEgMCcsXHJcbiAgICAncjFuMWticjEvcHBxMXBOMi8ycDFQbjFwLzJQcDNRLzNQM1AvOC9QUDNQMi9SMUIxSzJSIHcgLSAtIDEgMCcsXHJcbiAgICAncjNiMy8xcDNOMWsvbjRwMi9wMlBwUDIvbjcvNlAxLzFQMVFCMVAxLzRLMyB3IC0gLSAxIDAnLFxyXG4gICAgJzFyYjJrMi9wcDNwcFEvN3EvMnAxbjFOMS8ycDUvMk41L1AzQlAxUC9LMlI0IHcgLSAtIDEgMCcsXHJcbiAgICAncjcvNXBrMS8ycDRwLzFwMXA0LzFxblA0LzVRUFAvMkIxUlAxSy84IHcgLSAtIDEgMCcsXHJcbiAgICAnNnIxL3A2ay9CcDNuMXIvMnBQMVAyL1A0cTFQLzJQMlEyLzVLMi8yUjJSMiBiIC0gLSAwIDEnLFxyXG4gICAgJzZrMS80cHAyLzJxM3BwL1IxcDFQbjIvMk4yUDIvMVA0clAvMVAzUTFLLzggYiAtIC0gMCAxJyxcclxuICAgICc0UTMvMWI1ci8xcDFrcDMvNXAxci8zcDFucTEvUDROUDEvMVAzUEIxLzJSM0sxIHcgLSAtIDEgMCcsXHJcbiAgICAnMnJiM3IvM04xcGsxL3AycHAycC9xcDJQQjFRL24yTjFQMi82UDEvUDFQNFAvMUsxUlIzIHcgLSAtIDEgMCcsXHJcbiAgICAncjFiMmsxci8ycTFiMy9wM3BwQnAvMm4zQjEvMXA2LzJONFEvUFBQM1BQLzJLUlIzIHcgLSAtIDEgMCcsXHJcbiAgICAncjFiMXJrMi9wcDFuYk5wQi8ycDFwMnAvcTJuQjMvM1AzUC8yTjFQMy9QUFEyUFAxLzJLUjNSIHcgLSAtIDEgMCcsXHJcbiAgICAnNXIxay83cC84LzROUDIvOC8zcDJSMS8ycjNQUC8ybjFSSzIgdyAtIC0gMSAwJyxcclxuICAgICczcjQvNmtwLzFwMXIxcE4xLzVRcTEvNnAxL1BCNFAxLzFQM1AyLzZLUiB3IC0gLSAxIDAnLFxyXG4gICAgJzZyMS9yNVBSLzJwM1IxLzJQazFuMi8zcDQvMVAxTlAzLzRLMy84IHcgLSAtIDEgMCcsXHJcbiAgICAnM3ExcjIvcDJucjMvMWsxTkIxcHAvMVBwNS81QjIvMVE2L1A1UFAvNVJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJ1E3LzFSNXAvMmtxcjJuLzdwLzVQYjEvOC9QMVAyQlAxLzZLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzNyMmsxLzVwMi8yYjJCcDEvN3AvNHAzLzVQUDEvUDNCcTFQL1EzUjJLIGIgLSAtIDAgMScsXHJcbiAgICAncjRxazEvMnA0cC9wMXAxTjMvMmJwUTMvNG5QMi84L1BQUDNQUC81UjFLIGIgLSAtIDAgMScsXHJcbiAgICAncjFyM2sxLzNOUXBwcC9xM3AzLzgvOC9QMUIxUDFQMS8xUDFSMVBiUC8zSzQgYiAtIC0gMCAxJyxcclxuICAgICczcjQvN3AvMlJOMmsxLzRuMnEvUDJwNC8zUDJQMS80cDFQMS81UUsxIHcgLSAtIDEgMCcsXHJcbiAgICAncjFicTFyMWsvcHA0cHAvMnBwNC8yYjJwMi80UE4yLzFCUFAxUTIvUFAzUFBQL1I0UksxIHcgLSAtIDEgMCcsXHJcbiAgICAncjJxNC9wMm5SMWJrLzFwMVBiMnAvNHAycC8zbk4zL0IyQjNQL1BQMVEyUDEvNksxIHcgLSAtIDEgMCcsXHJcbiAgICAncjJuMXJrMS8xcHBiMnBwLzFwMXA0LzNQcHExbi8yQjNQMS8yUDRQL1BQMU4xUDFLL1IyUTFSTjEgYiAtIC0gMCAxJyxcclxuICAgICcxcjJyMy8xbjNOa3AvcDJQMnAxLzNCNC8xcDVRLzFQNVAvNlAxLzJiNEsgdyAtIC0gMSAwJyxcclxuICAgICdyMWIycmsxL3BwMXAxcDFwLzJuM3BRLzVxQjEvOC8yUDUvUDRQUFAvNFJSSzEgdyAtIC0gMSAwJyxcclxuICAgICc1cmsxL3BSNGJwLzZwMS82QjEvNVEyLzRQMy9xMnIxUFBQLzVSSzEgdyAtIC0gMSAwJyxcclxuICAgICc2UTEvMXEyTjFuMS8zcDNrLzNQM3AvMlA1LzNicDFQMS8xUDRCUC82SzEgdyAtIC0gMSAwJyxcclxuICAgICdybmJxMXJrMS9wcDJicDFwLzRwMXAxLzJwcDJObi81UDFQLzFQMUJQMy9QQlBQMlAxL1JOMVFLMlIgdyAtIC0gMSAwJyxcclxuICAgICcycTJyazEvNHIxYnAvYnBRcDJwMS9wMlBwMy9QM1AyUC8xTlAxQjFLMS8xUDYvUjJSNCBiIC0gLSAwIDEnLFxyXG4gICAgJzVyMWsvcHAxbjFwMXAvNW4xUS8zcDFwTjEvM1A0LzFQNFJQL1AxcjFxUFAxL1I1SzEgdyAtIC0gMSAwJyxcclxuICAgICc0bnJrMS9yUjVwLzRwbnBRLzRwMU4xLzJwMU4zLzZQMS9xNFAxUC80UjFLMSB3IC0gLSAxIDAnLFxyXG4gICAgJ3IzcTJrL3AybjFyMi8yYlAxcHBCL2IzcDJRL04xUHA0L1A1UjEvNVBQUC9SNUsxIHcgLSAtIDEgMCcsXHJcbiAgICAnMVIxbjNrLzZwcC8yTnI0L1A0cDIvcjcvOC80UFBCUC82SzEgYiAtIC0gMCAxJyxcclxuICAgICdyMWIycjFrL3AxbjNiMS83cC81cTIvMkJwTjFwMS9QNVAxLzFQMVExTlAxLzJLMVIyUiB3IC0gLSAxIDAnLFxyXG4gICAgJzNrcjMvcDFyMWJSMi80UDJwLzFRcDUvM3AzcC84L1BQNFBQLzZLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzZyMS8zcDJxay80UDMvMVI1cC8zYjFwclAvM1AyQjEvMlAxUVAyLzZSSyBiIC0gLSAwIDEnLFxyXG4gICAgJ3I1cTEvcHAxYjFrcjEvMnAycDIvMlE1LzJQcEIzLzFQNE5QL1A0UDIvNFJLMiB3IC0gLSAxIDAnLFxyXG4gICAgJzdSL3IxcDFxMXBwLzNrNC8xcDFuMVEyLzNONC84LzFQUDJQUFAvMkIzSzEgdyAtIC0gMSAwJyxcclxuICAgICcycTFyYjFrL3BycDNwcC8xcG4xcDMvNXAxTi8yUFAzUS82UjEvUFAzUFBQL1I1SzEgdyAtIC0gMSAwJyxcclxuICAgICdyMXFicjJrLzFwMm4xcHAvM0IxbjIvMlAxTnAyL3A0TjIvUFE0UDEvMVAzUDFQLzNSUjFLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzNyazMvMXE0cHAvM0IxcDIvM1I0LzFwUTUvMVBiNS9QNFBQUC82SzEgdyAtIC0gMSAwJyxcclxuICAgICdyNGsyLzZwcC9wMW4xcDJOLzJwNS8xcTYvNlFQL1BiUDJQUDEvMUsxUjFCMiB3IC0gLSAxIDAnLFxyXG4gICAgJzNycjJrL3BwMWIyYjEvNHExcHAvMlBwMXAyLzNCNC8xUDJRTlAxL1A2UC9SNFJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzVRMVIvM3FuMXAxL3AzcDFrMS8xcHAxUHBCMS8zcjNQLzVQMi9QUFAzSzEvOCB3IC0gLSAxIDAnLFxyXG4gICAgJzJyMXIzL3AzUDFrMS8xcDFwUjFQcC9uMnExUDIvOC8ycDRQL1A0UTIvMUIzUksxIHcgLSAtIDEgMCcsXHJcbiAgICAncjFiMnJrMS8ycDJwcHAvcDcvMXA2LzNQM3EvMUJQM2JQL1BQM1FQMS9STkIxUjFLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzFSNi80cjFway9wcDJOMnAvNG5QMi8ycDUvMlAzUDEvUDJQMUsyLzggdyAtIC0gMSAwJyxcclxuICAgICcxcmIyUlIxL3AxcDNwMS8ycDNrMS81cDFwLzgvM04xUFAxL1BQNXIvMks1IHcgLSAtIDEgMCcsXHJcbiAgICAncjJyMmsxL3BwMmJwcHAvMnAxcDMvNHFiMVAvOC8xQlAxQlEyL1BQM1BQMS8yS1IzUiBiIC0gLSAwIDEnLFxyXG4gICAgJzFyNGsxLzVicDEvcHIxUDJwMS8xbnAxcDMvMkIxUDJSLzJQMlBOMS82SzEvUjcgdyAtIC0gMSAwJyxcclxuICAgICczazQvMVI2LzNOMm4xL3AyUHAzLzJQMU4zLzNuMlBwL3E2UC81UksxIHcgLSAtIDEgMCcsXHJcbiAgICAnMXIxcmIzL3AxcTJwa3AvUG5wMm5wMS80cDMvNFAzL1ExTjFCMVBQLzJQUkJQMi8zUjJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJ3IzazMvcGJwcWIxcjEvMXAyUTFwMS8zcFAxQjEvM1A0LzNCNC9QUFA0UC81UksxIHcgLSAtIDEgMCcsXHJcbiAgICAncjJrMXIyLzNiMnBwL3A1cDEvMlExUjMvMXBCMVBxMi8xUDYvUEtQNFAvN1IgdyAtIC0gMSAwJyxcclxuICAgICczcTJyMS80bjJrL3AxcDFyQnBwL1BwUHBQcDIvMVAzUDFRLzJQM1IxLzdQLzFSNUsgdyAtIC0gMSAwJyxcclxuICAgICc1cjFrLzJwMWIxcHAvcHExcEIzLzgvMlExUDMvNXBQMS9SUDNuMVAvMVI0SzEgYiAtIC0gMCAxJyxcclxuICAgICcyYnFyMmsvMXIxbjJicC9wcDFwQnAyLzJwUDFQUTEvUDNQTjIvMVA0UDEvMUI1UC9SM1IxSzEgdyAtIC0gMSAwJyxcclxuICAgICdyMWIycmsxLzVwYjEvcDFuMXAzLzRCMy80TjJSLzgvMVBQMXAxUFAvNVJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzJyMmsyL3BiNGJRLzFwMXFyMXBSLzNwMXBCMS8zUHAzLzJQNS9QUEIyUFAxLzFLNVIgdyAtIC0gMSAwJyxcclxuICAgICc0cjMvMkI0Qi8ycDFiMy9wcGs1LzVSMi9QMlAzcC8xUFA1LzFLNVIgdyAtIC0gMSAwJyxcclxuICAgICdyNWsxL3E0cHBwL3JuUjFwYjIvMVExcDQvMVAxUDQvUDROMVAvMUIzUFAxLzJSM0sxIHcgLSAtIDEgMCcsXHJcbiAgICAncjFicm4zL3AxcTRwL3AxcDJQMWsvMlBwUFBwMS9QNy8xUTJCMlAvMVA2LzFLMVIxUjIgdyAtIC0gMSAwJyxcclxuICAgICc1cjFrLzdwL3AyYjQvMXBOcDFwMXEvM1ByMy8yUDJiUDEvUFAxQjNRL1IzUjFLMSBiIC0gLSAwIDEnLFxyXG4gICAgJzdrLzJwM3BwL3A3LzFwMXA0L1BQMnByMi9CMVAzcVAvNE4xQjEvUjFRbjJLMSBiIC0gLSAwIDEnLFxyXG4gICAgJzJyM2sxL3BwNHJwLzFxMXAycFEvMU4ycDFQUi8ybk5QMy81UDIvUFBQNS8ySzRSIHcgLSAtIDEgMCcsXHJcbiAgICAnNHExa3IvcDRwMi8xcDFRYlBwMS8ycDFQMU5wLzJQNS83UC9QUDRQMS8zUjNLIHcgLSAtIDEgMCcsXHJcbiAgICAnUjcvM25icGtwLzRwMXAxLzNyUDFQMS9QMkIxUTFQLzNxMU5LMS84LzggdyAtIC0gMSAwJyxcclxuICAgICc1cmsxLzRScDFwLzFxMXBCUXAxLzVyMi8xcDYvMVA0UDEvMm4yUDIvM1IySzEgdyAtIC0gMSAwJyxcclxuICAgICcyUTUvcHAycmsxcC8zcDJwcS8yYlAxcjIvNVJSMS8xUDJQMy9QQjNQMVAvN0sgdyAtIC0gMSAwJyxcclxuICAgICczUTQvNHIxcHAvYjZrLzZSMS84LzFxQm4xTjIvMVA0UFAvNktSIHcgLSAtIDEgMCcsXHJcbiAgICAnM3IycWsvcDJRM3AvMXAzUjIvMnBQcDMvMW5iNS82TjEvUEI0UFAvMUI0SzEgdyAtIC0gMSAwJyxcclxuICAgICc1YjIvMXAzcnBrL3AxYjNScC80QjFSUS8zUDFwMVAvN3EvNVAyLzZLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzRyMy8ycTFycGsxL3AzYk4xcC8ycDNwMS80UVAyLzJONFAvUFA0UDEvNVJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzNScjJrL3BwNHBiLzJwNHAvMlAxbjMvMVAxUTNQLzRyMXExL1BCNEIxLzVSSzEgYiAtIC0gMCAxJyxcclxuICAgICdyMWIza3IvM3BSMXAxL3BwcTRwLzVQMi80UTMvQjcvUDVQUC81UksxIHcgLSAtIDEgMCcsXHJcbiAgICAnMXI2LzFwM0sxay9wM04zL1A2bi82UlAvMlA1LzgvOCB3IC0gLSAxIDAnLFxyXG4gICAgJzRrMy8ycTJwMi80cDMvM2JQMVExL3A2Ui9yNlAvNlBLLzVCMiB3IC0gLSAxIDAnLFxyXG4gICAgJzFRNi8xUDJwazFwLzVwcEIvM3E0L1A1UEsvN1AvNVAyLzZyMSBiIC0gLSAwIDEnLFxyXG4gICAgJ3EyYnIxazEvMWI0cHAvM0JwMy9wNm4vMXAzUjIvM0IxTjIvUFAyUVBQUC82SzEgdyAtIC0gMSAwJyxcclxuICAgICdycTNyazEvMXAxYnBwMXAvM3AycFEvcDJOM24vMkJuUDFQMS81UDIvUFBQNS8yS1IzUiB3IC0gLSAxIDAnLFxyXG4gICAgJ1I3LzVwa3AvM04ycDEvMnIzUG4vNXIyLzFQNi9QMVA1LzJLUjQgdyAtIC0gMSAwJyxcclxuICAgICc0a3ExUS9wMmIzcC8xcFI1LzNCMnAxLzVQcjEvOC9QUDVQLzdLIHcgLSAtIDEgMCcsXHJcbiAgICAnNFEzL3I0cHBrLzNwM3AvNHBQYkIvMlAxUDMvMXE1UC82UDEvM1IzSyB3IC0gLSAxIDAnLFxyXG4gICAgJzRyMWsxL1E0YnBwL3A3LzVOMi8xUDNxbjEvMlA1L1AxQjNQUC9SNUsxIGIgLSAtIDAgMScsXHJcbiAgICAnNmsxLzVwMXAvMlExcDFwMS81bjFyL043LzFCM1AxUC8xUFAzUEsvNHEzIGIgLSAtIDAgMScsXHJcbiAgICAnMXIzazIvNXAxcC8xcWJScDMvMnIxUHAyL3BwQjRRLzFQNi9QMVA0UC8xSzFSNCB3IC0gLSAxIDAnLFxyXG4gICAgJzgvMlExUjFiay8zcjNwL3AyTjFwMVAvUDJQNC8xcDNQcTEvMVA0UDEvMUs2IHcgLSAtIDEgMCcsXHJcbiAgICAnOC9rMXAxcTMvUHA1US80cDMvMlAxUDJwLzNQNC80SzMvOCB3IC0gLSAxIDAnLFxyXG4gICAgJzVyMWsvcjJiMXAxcC9wNFBwMS8xcDJSMy8zcUJRMi9QNy82UFAvMlI0SyB3IC0gLSAxIDAnLFxyXG4gICAgJzgvOC8yTjUvOC84L3A3LzJLNS9rNyB3IC0gLSAxIDAnLFxyXG4gICAgJzNyM2svMXAzUnBwL3Aybm4zLzNONC84LzFQQjFQUTFQL3E0UFAxLzZLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzNxMnJuL3BwM3JCay8xbnBwMXAyLzVQMi8yUFBQMVJQLzJQMkIyL1A1UTEvNlJLIHcgLSAtIDEgMCcsXHJcbiAgICAnOC8zbjJwcC8ycUJrcDIvcHBQcHAxUDEvMVAyUDMvMVE2L1A0UFAxLzZLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzRyMy8ycDUvMnAxcTFrcC9wMXIxcDFwTi9QNVAxLzFQM1AyLzRRMy8zUkIxSzEgdyAtIC0gMSAwJyxcclxuICAgICczcjFrcjEvOC9wMnEycDEvMXAyUjMvMVE2LzgvUFBQNS8xSzRSMSB3IC0gLSAxIDAnLFxyXG4gICAgJzRyMmsvMnBiMVIyLzJwNFAvM3ByMU4xLzFwNi83UC9QMVA1LzJLNFIgdyAtIC0gMSAwJyxcclxuICAgICdyNGsxci8ycFExcHAxL3A0cTFwLzJOM04xLzFwM1AyLzgvUFAzUFBQLzRSMUsxIHcgLSAtIDEgMCcsXHJcbiAgICAnNnJrLzFyMnBSMXAvM3BQMXBCLzJwMXAzL1A2US9QMXEzUDEvN1AvNUJLMSB3IC0gLSAxIDAnLFxyXG4gICAgJzNyM2svMWIyYjFwcC8zcHAzL3AzbjFQMS8xcFBxUDJQLzFQMk4yUi9QMVFCMXIyLzJLUjNCIGIgLSAtIDAgMScsXHJcbiAgICAnOC8ycDNOMS82cDEvNVBCMS9wcDJSbjIvN2svUDFwMksxUC8zcjQgdyAtIC0gMSAwJyxcclxuICAgICc4L3AzUTJwLzZway8xTjYvNG5QMi83UC9QNVBLLzNycjMgdyAtIC0gMSAwJyxcclxuICAgICc1cmtyLzFwMlFwYnAvcHExUDQvMm5CNC81cDIvMk41L1BQUDRQLzFLMVJSMyB3IC0gLSAxIDAnLFxyXG4gICAgJzgvMXA2LzgvMlAzcGsvM1IybjEvN3AvMnI1LzRSMksgYiAtIC0gMCAxJyxcclxuICAgICcycjUvMXA1cC8zcDQvcFAxUDFSMi8xbjJCMWsxLzgvMVAzS1BQLzggdyAtIC0gMSAwJ1xyXG5dO1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IFtcclxuXCJyMWJrM3IvcHBwcTFwcHAvNW4yLzROMU4xLzJCcDQvQm42L1A0UFBQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjNyMXJrMS9wcHFuM3AvMW5wYjFQMi81QjIvMlA1LzJOM0IxL1BQMlExUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyM3JrMi82YjEvcTJwUUJwMS8xTnBQNC8xbjJQUDIvblA2L1AzTjFLMS9SNlIgdyAtIC0gMCAxXCIsXHJcblwicjRuMWsvcHBCbk4xcDEvMnAxcDMvNk5wL3EyYlAxYjEvM0I0L1BQUDNQUC9SNFExSyB3IC0gLSAwIDFcIixcclxuXCJyM1FuUjEvMWJrNS9wcDVxLzJiNS8ycDFQMy9QNy8xQkI0UC8zUjNLIHcgLSAtIDAgMVwiLFxyXG5cInExcjJiMWsvcmI0bnAvMXAycDJOL3BCMW40LzZRMS8xUDJQMy9QQjNQUFAvMlJSMksxIHcgLSAtIDAgMVwiLFxyXG5cImsybjFxMXIvcDFwQjJwMS9QNHBQMS8xUXAxcDMvOC8yUDFCYk4xL1A3LzJLUjQgdyAtIC0gMCAxXCIsXHJcblwicjJxazJyL3BiNHBwLzFuMlBiMi8yQjJRMi9wMXA1LzJQNS8yQjJQUFAvUk4yUjFLMSB3IC0gLSAwIDFcIixcclxuXCIxUTFSNC81azIvNnBwLzJOMWJwMi8xQm41LzJQMlAxUC8xcjNQSzEvOCBiIC0gLSAwIDFcIixcclxuXCJyblI1L3AzcDFrcC80cDFwbi9icFA1LzVCUDEvNU4xUC8yUDJQMi8ySzUgdyAtIC0gMCAxXCIsXHJcblwicjZyLzFwMnBwMWsvcDFiMnExcC80cFAyLzZRUi8zQjJQMS9QMVAySzIvN1IgdyAtIC0gMCAxXCIsXHJcblwiMms0ci9wcHAycDIvMmIyQjIvN3AvNnBQLzJQMXExYlAvUFAzTjIvUjRRSzEgYiAtIC0gMCAxXCIsXHJcblwiMXIyazFyMS9wYnBwbnAxcC8xYjNQMi84L1E3L0IxUEIxcTIvUDRQUFAvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwicjRyMWsvMWJwcTFwMW4vcDFucDQvMXAxQmIxQlEvUDcvNlIxLzFQM1BQUC8xTjJSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInI0cmsxL3A0cHBwL1BwNG4xLzRCTjIvMWJxNS83US8yUDJQUFAvM1JSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIzcmtuUS8xcDFSMXBiMS9wM3BxQkIvMnA1LzgvNlAxL1BQUDJQMVAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiM2sxcjFyL3BiM3AyLzFwNHAxLzFCMkIzLzNxbjMvNlFQL1A0UlAxLzJSM0sxIHcgLSAtIDAgMVwiLFxyXG5cIjFiNHJrLzRSMXBwL3AxYjRyLzJQQjQvUHAxUTQvNlBxLzFQM1AxUC80Uk5LMSB3IC0gLSAwIDFcIixcclxuXCJyMWIxcjFrMS9wcHAxbnAxcC8ybnAycFEvNXFOMS8xYlA1LzZQMS9QUDJQUEJQL1IxQjJSSzEgdyAtIC0gMCAxXCIsXHJcblwiNXFyay9wM2IxcnAvNFAyUS81UDIvMXBwNS81UFIxL1A2UC9CNksgdyAtIC0gMCAxXCIsXHJcblwicjJxMm5yLzVwMXAvcDFCcDNiLzFwMU5rUDIvM3BQMXAxLzJQUDJQMS9QUDVQL1IxQmIxUksxIHcgLSAtIDAgMVwiLFxyXG5cIjJyM2sxLzFwMXIxcDFwL3BuYjFwQjIvNXAyLzFiUDUvMVAyUVAyL1AxQjNQUC80UksyIHcgLSAtIDAgMVwiLFxyXG5cIjJyNS8ycDJrMXAvcHFwMVJCMi8ycjUvUGJRMk4yLzFQM1BQMS8yUDNQMS80UjJLIHcgLSAtIDAgMVwiLFxyXG5cIjdyL3BScGs0LzJucDJwMS81YjIvMlA0cS8yYjFCQk4xL1A0UFAxLzNRMUsyIGIgLSAtIDAgMVwiLFxyXG5cIlI0cmsxLzRyMXAxLzFxMnAxUXAvMXBiNS8xbjVSLzVOQjEvMVAzUFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCIycjRrL3BwcWJwUTFwLzNwMWJwQi84LzgvMU5yMlAyL1BQUDNQMS8yS1IzUiB3IC0gLSAwIDFcIixcclxuXCIycjFrMnIvMXAycHAxcC8xcDJiMXBRLzRCMy8zbjQvMnFCNC9QMVAyUFBQLzJLUlIzIGIgLSAtIDAgMVwiLFxyXG5cInIxYjJyazEvcDNScDFwLzNxMnBRLzJwcDJCMS8zYjQvM0I0L1BQUDJQUFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiN2svMWIxbjFxMXAvMXAxcDQvcFAycFAxTi9QNmIvM3BCMlAvOC8xUjFRMksxIGIgLSAtIDAgMVwiLFxyXG5cIjFyMWtyMy9OYnBwbjFwcC8xYjYvOC82UTEvM0IxUDIvUHEzUDFQLzNSUjFLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJxcjMvcHBwMUIxa3AvMWI0cDEvbjJCNC8zUFExUDEvMlA1L1A0UDIvUk40SzEgdyAtIC0gMCAxXCIsXHJcblwicjFuazNyLzJiMnBwcC9wM2JxMi8zcE4zL1EyUDQvQjFOQjQvUDRQUFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMnIxcjFrMS9wMm4xcDFwLzVwcDEvcVExUDFiMi9ONy81TjIvUFAzUlBQLzNLMUIxUiBiIC0gLSAwIDFcIixcclxuXCJyMW5rM3IvMmIycHBwL3AzYjMvM05OMy9RMlAzcS9CMkI0L1A0UFBQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjFubjFrL3AzcDFiMS8xcXAxQjFwMS8xcDFwNC8zUDNOLzJOMUIzL1BQUDNQUC9SMlExSzIgdyAtIC0gMCAxXCIsXHJcblwicjFibmsyci9wcHBwMXBwcC8xYjRxMS80UDMvMkIxTjMvUTFQcDFOMi9QNFBQUC9SM1IxSzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxL0IyTjFwcDEvcDZwL1AzTjFyMS80bmIyLzgvMlIzQjEvNksxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjNuci9wcHAxa0IxcC8zcDQvOC8zUFBCbmIvMVEzcDIvUFBQMnEyL1JONFJLIGIgLSAtIDAgMVwiLFxyXG5cInIyYjJRMS8xYnE1L3BwMWsycDEvMnAxbjFCMS9QM1AzLzJONS8xUFAzUFAvNVIxSyB3IC0gLSAwIDFcIixcclxuXCIxUjRRMS8zbnIxcHAvM3AxazIvNUJiMS80UDMvMnExQjFQMS81UDFQLzZLMSB3IC0gLSAwIDFcIixcclxuXCIxcjRrci9RMWJSQnBwcC8yYjUvOC8yQjFxMy82UDEvUDRQMVAvNVJLMSB3IC0gLSAwIDFcIixcclxuXCI2azEvMXA1cC8zUDNyLzRwMy8yTjFQQnBiL1BQcjUvM1IxUDFLLzViMVIgYiAtIC0gMCAxXCIsXHJcblwiNXJrMS8xcDFyMnBwL3AycDNxLzNQMmIxL1BQMXBQMy81UHAxLzRCMVAxLzJSUlFOSzEgYiAtIC0gMCAxXCIsXHJcblwiMms0ci9wcHA1LzRicXAxLzNwMlExLzZuMS8yTkIzUC9QUFAyYlAxL1IxQjJSMUsgYiAtIC0gMCAxXCIsXHJcblwiNXIxay8zcTNwL3AyQjFucGIvUDJucDMvNE4zLzJOMmIyLzVQUFAvUjNRUksxIGIgLSAtIDAgMVwiLFxyXG5cIjRyMy9wNHBrcC9xNy8zQmJiMi9QMlAxcHBQLzJOM24xLzFQUDJLUFIvUjFCUTQgYiAtIC0gMCAxXCIsXHJcblwiM3IxcTFrLzZicC9wMXA1LzFwMkIxUTEvUDFCNS8zUDQvNVBQUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCJyNGtyMS9wYk5uMXExcC8xcDYvMnAyQlBRLzVCMi84L1A2UC9iNFJLMSB3IC0gLSAwIDFcIixcclxuXCJyM3Iyay80YjJCL3BuM3AyL3ExcDRSLzZiMS80UDMvUFBRMU5QUFAvNVJLMSB3IC0gLSAwIDFcIixcclxuXCJybmJrMWIxci9wcHFwblExcC80cDFwMS8ycDFOMUIxLzROMy84L1BQUDJQUFAvUjNLQjFSIHcgLSAtIDAgMVwiLFxyXG5cIjZyay9wMXBiMXAxcC8ycHAxUDIvMmIxbjJRLzRQUjIvM0I0L1BQUDFLMlAvUk5CM3ExIHcgLSAtIDAgMVwiLFxyXG5cInJuM3JrMS8ycXAycHAvcDNQMy8xcDFiNC8zYjQvM0I0L1BQUDFRMVBQL1IxQjJSMUsgdyAtIC0gMCAxXCIsXHJcblwicjJCMWJrMS8xcDVwLzJwMnAyL3AxbjUvNFAxQlAvUDFOYjQvS1BuM1BOLzNSM1IgYiAtIC0gMCAxXCIsXHJcblwiNmsxLzJiM3IxLzgvNnBSLzJwM04xLzJQYlAxUFAvMVBCMlIxSy8ycjUgdyAtIC0gMCAxXCIsXHJcblwicjVrMS9wMXAzYnAvMXAxcDQvMlBQMnFwLzFQNi8xUTFiUDMvUEIzclBQL1IyTjJSSyBiIC0gLSAwIDFcIixcclxuXCIzcnIyay9wcDFiMmIxLzRxMXBwLzJQcDFwMi8zQjQvMVAyUU5QMS9QNlAvUjRSSzEgdyAtIC0gMCAxXCIsXHJcblwiMmJxcjJrLzFyMW4yYnAvcHAxcEJwMi8ycFAxUFExL1AzUE4yLzFQNFAxLzFCNVAvUjNSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInEyYnIxazEvMWI0cHAvM0JwMy9wNm4vMXAzUjIvM0IxTjIvUFAyUVBQUC82SzEgdyAtIC0gMCAxXCIsXHJcbl07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gW1xyXG5cInIxYmszci9wcHBxMXBwcC81bjIvNE4xTjEvMkJwNC9CbjYvUDRQUFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMnIyYmsxL3BiM3BwcC8xcDYvbjcvcTJQNC9QMVAxUjJRL0IyQjFQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJrMW4zcnIvUHAzcDIvM3E0LzNONC8zUHAycC8xUTJQMXAxLzNCMVBQMS9SNFJLMSB3IC0gLSAwIDFcIixcclxuXCIzcjFyazEvcHBxbjNwLzFucGIxUDIvNUIyLzJQNS8yTjNCMS9QUDJRMVBQL1I1SzEgdyAtIC0gMCAxXCIsXHJcblwiTjFiazQvcHAxcDFRcHAvOC8yYjUvM24zcS84L1BQUDJSUFAvUk5CMXJCSzEgYiAtIC0gMCAxXCIsXHJcblwicjNicjFrL3BwNXAvNEIxcDEvNE5wUDEvUDJQbjMvcTFQUTNSLzdQLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjgvNFIxcGsvcDVwMS84LzFwQjFuMWIxLzFQMmIxUDEvUDRyMVAvNVIxSyBiIC0gLSAwIDFcIixcclxuXCJyMWJrMXIyL3BwMW4ycHAvM05RMy8xUDYvOC8ybjJQQjEvcTFCM1BQLzNSMVJLMSB3IC0gLSAwIDFcIixcclxuXCJybjNyazEvcHAzcDIvMmIxcG5wMS80TjMvM3E0L1AxTkIzUi8xUDFRMVBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjNxcmsyL3AxcjJwcDEvMXAycGIyL25QMWJOMlEvM1BOMy9QNlIvNVBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cInI0bjFrL3BwQm5OMXAxLzJwMXAzLzZOcC9xMmJQMWIxLzNCNC9QUFAzUFAvUjRRMUsgdyAtIC0gMCAxXCIsXHJcblwiNWsxci80bnBwMS9wM3AycC8zblAyUC8zUDNRLzNONC9xQjJLUFAxLzJSNSB3IC0gLSAwIDFcIixcclxuXCJyM3IxazEvMWI2L3AxbnAxcHBRLzRuMy80UDMvUE5CNFIvMlAxQksxUC8xcTYgdyAtIC0gMCAxXCIsXHJcblwicjNxMWsxLzVwMi8zUDJwUS9QcHA1LzFwbmJOMlIvOC8xUDRQUC81UjFLIHcgLSAtIDAgMVwiLFxyXG5cIjJyMmIxay9wMlEzcC9iMW4yUHBQLzJwNS8zcjFCTjEvM3EyUDEvUDRQQjEvUjNSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInExcjJiMWsvcmI0bnAvMXAycDJOL3BCMW40LzZRMS8xUDJQMy9QQjNQUFAvMlJSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjJyMWsyci9wUjJwMWJwLzJuMVAxcDEvOC8yUVA0L3EyYjFOMi9QMkIxUFBQLzRLMlIgdyAtIC0gMCAxXCIsXHJcblwiM2JyMy9wcDJyMy8ycDRrLzROMXBwLzNQUDMvUDFONS8xUDJLMy82UlIgdyAtIC0gMCAxXCIsXHJcblwiMnJyMWsyL3BiNHAxLzFwMXFwcDIvNFIyUS8zbjQvUDFONS8xUDNQUFAvMUIyUjFLMSB3IC0gLSAwIDFcIixcclxuXCI0cTFyay9wYjJicG5wLzJyNFEvMXAxcDFwUDEvNE5QMi8xUDNSMi9QQm40UC9SQjRLMSB3IC0gLSAwIDFcIixcclxuXCJybmIyYjFyL3Aza0JwMS8zcE5uMXAvMnBRTjMvMXAyUFAyLzRCMy9QcTVQLzRLMyB3IC0gLSAwIDFcIixcclxuXCJyNW5yLzZScC9wMU5Oa3AyLzFwM2IyLzJwNS81SzIvUFAyUDMvM1I0IHcgLSAtIDAgMVwiLFxyXG5cInIxYjFrYjFyL3BwMW4xcHAxLzFxcDFwMnAvNkIxLzJQUFEzLzNCMU4yL1A0UFBQL1I0UksxIHcgLSAtIDAgMVwiLFxyXG5cInJuM2sxci9wYnBwMUJicC8xcDRwTi80UDFCMS8zbjQvMnEzUTEvUFBQMlBQUC8yS1IzUiB3IC0gLSAwIDFcIixcclxuXCJyMWJxa2IyLzZwMS9wMXA0cC8xcDFONC84LzFCM1EyL1BQM1BQUC8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCJybmJxMWJuci9wcDFwMXAxcC8zcGszLzNOUDFwMS81cDIvNU4yL1BQUDFRMVBQL1IxQjFLQjFSIHcgLSAtIDAgMVwiLFxyXG5cInIzcmsyLzVwbjEvcGIxbnExcFIvMXAycDFQMS8ycDFQMy8yUDJRTjEvUFBCQjFQMi8ySzRSIHcgLSAtIDAgMVwiLFxyXG5cInIxYnEzci9wcHAxblEyLzJrcDFOMi82TjEvM2JQMy84L1AybjFQUFAvMVIzUksxIHcgLSAtIDAgMVwiLFxyXG5cIjRyMy9wYnBuMm4xLzFwMXBycDFrLzgvMlBQMlBCL1A1TjEvMkIyUjFQL1I1SzEgdyAtIC0gMCAxXCIsXHJcblwicnEzcmsxLzNuMXBwMS9wYjRuMS8zTjJQMS8xcEIxUVAyLzRCMy9QUDYvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwiNGIzL2sxcjFxMnAvcDNwMy8zcFEzLzJwTjQvMVI2L1A0UFBQLzFSNEsxIHcgLSAtIDAgMVwiLFxyXG5cIjJiMnIxay8xcDJSMy8ybjJyMXAvcDFQMU4xcDEvMkIzUDEvUDZQLzFQM1IyLzZLMSB3IC0gLSAwIDFcIixcclxuXCIxcXIyYmsxL3BiM3BwMS8xcG4zbnAvM04yTlEvOC9QNy9CUDNQUFAvMkIxUjFLMSB3IC0gLSAwIDFcIixcclxuXCIxazVyL3BQM3BwcC8zcDJiMS8xQk4xbjMvMVEyUDMvUDFCNS9LUDNQMVAvN3EgdyAtIC0gMCAxXCIsXHJcblwiNWtxUS8xYjFyMnAxL3BwbjFwMUJwLzJiNS8yUDJyUDEvUDROMi8xQjVQLzRSUjFLIHcgLSAtIDAgMVwiLFxyXG5cIjNybnIxay9wMXExYjFwQi8xcGIxcDJwLzJwMVAzLzJQMk4yL1BQNFAxLzFCUTRQLzRSUksxIHcgLSAtIDAgMVwiLFxyXG5cInIycXIyay9wcDFiM3AvMm5RNC8ycEIxcDFQLzNuMVBwUi8yTlAyUDEvUFBQNS8ySzFSMU4xIHcgLSAtIDAgMVwiLFxyXG5cInIycTFyMWsvcHBwYjJwcC8ybnA0LzVwMi81TjIvMUIxUTQvUFBQMVJQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIxcXIyL3BwMm4xazEvM3BwMXBSLzJwMnBRMS80UE4yLzJOUDJQMS9QUDFLMVBCMS9uNyB3IC0gLSAwIDFcIixcclxuXCIzcjFyMWsvMXAzcDFwL3AycDQvNG4xTk4vNmJRLzFCUHE0L1AzcDFQUC8xUjVLIHcgLSAtIDAgMVwiLFxyXG5cIjFyM3Ixay82cDEvcDZwLzJicE5CUDEvMXAybjMvMVA1US9QQlAxcTJQLzFLNVIgdyAtIC0gMCAxXCIsXHJcblwicjRyazEvNGJwMi8xQnBwcTFwMS80cDFuMS8yUDFQbjIvM1AyTjEvUDJRMVBCSy8xUjVSIGIgLSAtIDAgMVwiLFxyXG5cInIycTNyL3BwcDUvMm40cC80UGJrMS8yQlAxTnBiL1AyUUIzLzFQUDNQMS9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJyMmJrMS8ycW4xcHBwL3BuMXA0LzVOMi9OM3IzLzFRNi81UFBQL0JSM0JLMSB3IC0gLSAwIDFcIixcclxuXCJyNWtyL3BwcE4xcHAxLzFibjFSMy8xcTFOMkJwLzNwMlExLzgvUFBQMlBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cInIzbjFrMS9wYjVwLzROMXAxLzJwcjQvcTcvM0IzUC8xUDFRMVBQMS8yQjFSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjFrMXIycjEvcHBxNHAvNFEzLzFCMm5wMi8yUDFwMy9QNy8yUDFSUFBSLzJCMUszIGIgLSAtIDAgMVwiLFxyXG5cInJuNG5yL3BwcHEyYmsvN3AvNWIxUC80TkJRMS8zQjQvUFBQM1AxL1IzSzJSIHcgLSAtIDAgMVwiLFxyXG5cInIxYnI0LzFwMmJwazEvcDFucHBuMXAvNVAyLzRQMkIvcU5OQjNSL1AxUFEyUFAvN0sgdyAtIC0gMCAxXCIsXHJcblwiMnI1LzJwMmsxcC9wcXAxUkIyLzJyNS9QYlEyTjIvMVAzUFAxLzJQM1AxLzRSMksgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzVwMi9SNXAxL1A2bi84LzVQUHAvMnIzclAvUjROMUsgYiAtIC0gMCAxXCIsXHJcblwicjNrcjIvNlFwLzFQYjJwMi9wQjNSMi8zcHEyQi80bjMvMVA0UFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwicjFyM2sxLzFicTJwYlIvcDVwMS8xcG5wcDFCMS8zTlAzLzNCMVAyL1BQUFE0LzFLNVIgdyAtIC0gMCAxXCIsXHJcblwiNVEyLzFwM3AxTi8ycDNwMS81YjFrLzJQM24xL1A0UlAxLzNxMnJQLzVSMUsgdyAtIC0gMCAxXCIsXHJcblwicm5iMWsyci9wcHBwYk4xcC81bjIvN1EvNFAzLzJONS9QUFBQM1AvUjFCMUtCMXEgdyAtIC0gMCAxXCIsXHJcblwicjFiMnJrMS8xcDRxcC9wNXBRLzJuTjFwMi8yQjJQMi84L1BQUDNQUC8ySzFSMyB3IC0gLSAwIDFcIixcclxuXCI0cjFrMS9wYjRwcC8xcDJwMy80UHAyLzFQM04yL1AyUW4yUC8zbjFxUEsvUkJCMVIzIGIgLSAtIDAgMVwiLFxyXG5cIjNxMXIyLzJyYm5wMi9wM3BwMWsvMXAxcDJOMS8zUDJRMS9QM1AzLzFQM1BQUC81UksxIHcgLSAtIDAgMVwiLFxyXG5cInE1azEvNXJiMS9yNnAvMU5wMW4xcDEvM3AxUG4xLzFONFAxL1BQNVAvUjFCUVJLMiBiIC0gLSAwIDFcIixcclxuXCJybjFxM3IvcHAya3BwcC8zTnAzLzJiMW4zLzNOMlExLzNCNC9QUDRQUC9SMUIyUksxIHcgLSAtIDAgMVwiLFxyXG5cInJuYjFrYjFyL3BwM3BwcC8ycDUvNHEzLzRuMy8zUTQvUFBQQjFQUFAvMktSMUJOUiB3IC0gLSAwIDFcIixcclxuXCI0cjFrMS8zcjFwMXAvYnFwMW4zL3AycDFOUDEvUG4xUTFiMi83UC8xUFAzQjEvUjJOUjJLIHcgLSAtIDAgMVwiLFxyXG5cIjdyLzZrci9wNXAxLzFwTmIxcHExL1BQcFBwMy80UDFiMS9SM1IxUTEvMkIyQksxIGIgLSAtIDAgMVwiLFxyXG5cInJuYmtuMnIvcHBwcDFRcHAvNWIyLzNOTjMvM1BwMy84L1BQUDFLUDFQL1IxQjRxIHcgLSAtIDAgMVwiLFxyXG5cInI3LzZSMS9wcGtxcm4xQi8ycHAzcC9QNm4vMk41LzgvMVExUjFLMiB3IC0gLSAwIDFcIixcclxuXCJyMWIycmsxLzFwM3BwcC9wMnA0LzNOblEyLzJCMVIzLzgvUHFQM1BQLzVSSzEgdyAtIC0gMCAxXCIsXHJcblwicjRyMWsvMnFiM3AvcDJwMXAyLzFwblBOMy8ycDFQbjIvMlAxTjMvUFBCMVFQUjEvNlJLIHcgLSAtIDAgMVwiLFxyXG5cInJuYnExYjFyL3BwNGtwLzVucDEvNHAyUS8yQk4xUjIvNEIzL1BQUE4yUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCIxbmJrMWIxci8xcjYvcDJQMnBwLzFCMlBwTjEvMnAyUDIvMlAxQjMvN1AvUjNLMlIgdyAtIC0gMCAxXCIsXHJcblwiMXIxa3IzL05icHBuMXBwLzFiNi84LzZRMS8zQjFQMi9QcTNQMVAvM1JSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjRrMXIxLzVwMi9wMXE1LzFwMnAycC82bjEvUDRiUTEvMVA0UlAvM05SMUJLIGIgLSAtIDAgMVwiLFxyXG5cIjVuazEvMk4ycDIvMmIyUXAxL3AzUHBOcC8ycVAzUC82UDEvNVAxSy84IHcgLSAtIDAgMVwiLFxyXG5cIjFrNXIvcHAxUTFwcDEvMnA0ci9iNFBuMS8zTlBwMi8yUDJQMi8xcTRCMS8xUjJSMUsxIGIgLSAtIDAgMVwiLFxyXG5cIjZyay81cDIvMnAxcDJwLzJQcFAxcTEvM1BuUW4xLzgvNFAyUC8xTjJCUjFLIGIgLSAtIDAgMVwiLFxyXG5cIjRyazFyL3AyYjFwcDEvMXE1cC8zcFIxbjEvM04xcDIvMVAxUTFQMi9QQlAzUEsvNFIzIHcgLSAtIDAgMVwiLFxyXG5cInIxYnExcmsxL3BwMW5iMXBwLzVwMi82QjEvM3BRMy8zQlBOMi9QUDNQUFAvUjRSSzEgdyAtIC0gMCAxXCIsXHJcblwicm4xcjQvcHAycDFiMS81a3BwL3ExUFExYjIvNm4xLzJOMk4yL1BQUDNQUC9SMUIyUksxIHcgLSAtIDAgMVwiLFxyXG5cIms3L3AxUW5yMnAvYjFwQjFwMi8zcDNxL04xcDUvM1AzUC9QUFAzUDEvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjNyNC80UlJway81bjFOLzgvcDFwMnFQUC9QMVFwMVAyLzFQNEsxLzNiNCB3IC0gLSAwIDFcIixcclxuXCJxcjYvMWIxcDFrclEvcDJQcDFwMS80UFAyLzFwMUIxbjIvM0I0L1BQM0sxUC8yUjJSMiB3IC0gLSAwIDFcIixcclxuXCJyMW5rM3IvMmIycHBwL3AzYnEyLzNwTjMvUTJQNC9CMU5CNC9QNFBQUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCI0cjJrLzRRMWJwLzRCMXAxLzFxMm4zLzRwTjIvUDFCM1AxLzRwUDFQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjRyMWsxLzVwcHAvcDJwNC80cjMvMXBObjQvMVA2LzFQUEsyUFAvUjNSMyBiIC0gLSAwIDFcIixcclxuXCJyMW5rM3IvMmIycHBwL3AzYjMvM05OMy9RMlAzcS9CMkI0L1A0UFBQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjFrMW5yL3AycDFwcHAvbjJCNC8xcDFOUE4xUC82UDEvM1AxUTIvUDFQMUszL3E1YjEgdyAtIC0gMCAxXCIsXHJcblwiMnIxcmsyLzFiMmIxcDEvcDFxMm5QMS8xcDJRMy80UDMvUDFOMUIzLzFQUDFCMlIvMks0UiB3IC0gLSAwIDFcIixcclxuXCI0cjFrMS9wUjNwcDEvN3AvM24xYjFOLzJwUDQvMlAyUFExLzNCMUtQUC9xNyBiIC0gLSAwIDFcIixcclxuXCIyUjFSMW5rLzFwNHJwL3AxbjUvM04ycDEvMVA2LzJQNS9QNlAvMks1IHcgLSAtIDAgMVwiLFxyXG5cInIxYjFyMWtxL3BwcG5wcDFwLzFuNHBCLzgvNE4yUC8xQlA1L1BQMlFQUDEvUjNLMlIgdyAtIC0gMCAxXCIsXHJcblwicm5iMnJrMS9wcHAycWIxLzZwUS8ycE4xcDIvOC8xUDNCUDEvUEIyUFAxUC9SNFJLMSB3IC0gLSAwIDFcIixcclxuXCJyMnFrYjFyLzJwMW5wcHAvcDJwNC9ucDFOTjMvNFAzLzFCUDUvUFAxUDFQUFAvUjFCMUsyUiB3IC0gLSAwIDFcIixcclxuXCJyNnIvMXExbmJrcDEvcG4ycDJwLzFwMXBQMVAxLzNQMU4xUC8xUDFRMVAyL1AyQjFLMi9SNlIgdyAtIC0gMCAxXCIsXHJcblwiM2s0LzFwcDNiMS80YjJwLzFwM3FwMS8zUG4zLzJQMVJOMi9yNVAxLzFRMlIxSzEgYiAtIC0gMCAxXCIsXHJcblwicm4zazIvcFIyYjMvNHAxUTEvMnExTjJQLzNSMlAxLzNLNC9QM0JyMi84IHcgLSAtIDAgMVwiLFxyXG5cIjJyMXIzL3BwMW5iTjIvNHAzL3E3L1AxcFAybmsvMlAyUDIvMVBRNS9SM1IxSzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzVwMi9wNW4xLzgvMXAxcDJQMS8xUGIyQjFyL1AzS1BOMS8yUlEzcSBiIC0gLSAwIDFcIixcclxuXCJyMWJxcjFrMS9wcHAycHAxLzNwNC80bjFOUS8yQjFQTjIvOC9QNFBQUC9iNFJLMSB3IC0gLSAwIDFcIixcclxuXCIxcjJxMmsvNE4ycC8zcDFQcDEvMnAxbjFQMS8yUDUvcDJQMktRL1AzUjMvOCB3IC0gLSAwIDFcIixcclxuXCJyNXJrL3BwMnFiMXAvMnAycG4xLzJicDQvM3BQMVExLzFCMVAxTjFSL1BQUDNQUC9SMUIzSzEgdyAtIC0gMCAxXCIsXHJcblwicm5icTFia3IvcHAzcDFwLzJwM3BRLzNOMk4xLzJCMnAyLzgvUFBQUDJQUC9SMUIxUjFLMSB3IC0gLSAwIDFcIixcclxuXCIycjJuMWsvMnEzcHAvcDJwMWIyLzJuQjFQMi8xcDFONC84L1BQUDRRLzJLM1JSIHcgLSAtIDAgMVwiLFxyXG5cInIxcTUvMnAyazIvcDRCcDEvMk5iMU4yL3A2US83UC9ubjNQUDEvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJybjJrYjFyLzFwUWJwcHBwLzFwNi9xcDFONC82bjEvOC9QUFAzUFAvMktSMk5SIHcgLSAtIDAgMVwiLFxyXG5cIjJyMWszLzNuMXAyLzZwMS8xcDFRYjMvMUIyTjFxMS8yUDFwMy9QNFBQMS8yS1I0IHcgLSAtIDAgMVwiLFxyXG5cInIxYjFyMy9xcDFuMXBrMS8ycHAycDEvcDNuMy9OMVBOUDFQMS8xUDNQMi9QNlEvMUsxUjFCMVIgdyAtIC0gMCAxXCIsXHJcblwiNXJrMS8ycGIxcHBwL3AycjQvMXAxUHAzLzRQbjFxLzFCMVBOUDIvUFAxUTFQMVAvUjVSSyBiIC0gLSAwIDFcIixcclxuXCIzbmJyMi80cTJwL3IzcFJway9wMnBRUk4xLzFwcFAycDEvMlA1L1BQQjRQLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJucm4yL3BwcDFrMnAvNHAzLzNQTnAxUC81UTIvM0IyUjEvUFBQMlBQMS8ySzFSMyB3IC0gLSAwIDFcIixcclxuXCI3ay9wNWIxLzFwNEJwLzJxMXAxcDEvMVAxbjFyMi9QMlEyTjEvNlAxLzNSMksxIGIgLSAtIDAgMVwiLFxyXG5cInIxYnExazFyL3BwMlIxcHAvMnBwMXAyLzFuMU40LzgvM1AxUTIvUFBQMlBQUC9SMUIzSzEgdyAtIC0gMCAxXCIsXHJcblwicjFibjFiMi9wcGsxbjJyLzJwM3BwLzVwMi9OMVBOcFBQMS8yQjFQMy9QUDJCMlAvMktSMlIxIHcgLSAtIDAgMVwiLFxyXG5cIjJycTJrMS8zYmIycC9uMnAycFEvcDJQcDMvMlAxTjFQMS8xUDVQLzZCMS8yQjJSMUsgdyAtIC0gMCAxXCIsXHJcblwicjZrL3BwNHBwLzFiMVA0LzgvMW40UTEvMk4xUlAyL1BQcTNwMS8xUkIxSzMgYiAtIC0gMCAxXCIsXHJcblwicm5iMmIxci9wcHAxbjFrcC8zcDFxMi83US80UEIyLzJONS9QUFAzUFAvUjRSSzEgdyAtIC0gMCAxXCIsXHJcblwicjJrMm5yL3BwMWIxUTFwLzJuNGIvM040LzNxNC8zUDQvUFBQM1BQLzRSUjFLIHcgLSAtIDAgMVwiLFxyXG5cIjVyMWsvM3EzcC9wMkIxbnBiL1AybnAzLzROMy8yTjJiMi81UFBQL1IzUVJLMSBiIC0gLSAwIDFcIixcclxuXCI0cjMvcDRwa3AvcTcvM0JiYjIvUDJQMXBwUC8yTjNuMS8xUFAyS1BSL1IxQlE0IGIgLSAtIDAgMVwiLFxyXG5cIjZrMS82cDEvM3IxbjFwL3A0cDFuL1AxTjRQLzJONS9RMlJLMy83cSBiIC0gLSAwIDFcIixcclxuXCI4LzgvMksyYjIvMk4yazIvMXA0UjEvMUIzbjFQLzNyMVAyLzggdyAtIC0gMCAxXCIsXHJcblwiMnEycjIvNXJrMS80cE5wcC9wMnBQbjIvUDFwUDJRUC8yUDJSMi8yQjNQMS82SzEgdyAtIC0gMCAxXCIsXHJcblwiNWtyMS9wcDRwMS8zYjFyYjEvMkJwMk5RLzFxNi84L1BQM1BQUC9SM1IxSzEgdyAtIC0gMCAxXCIsXHJcblwicjFiMnIyL3BwM05way82bnAvOC8ycTFOMy80UTMvUFBQMlJQUC82SzEgdyAtIC0gMCAxXCIsXHJcblwicjJxMXJrMS9wNHAxcC8zcDFRMi8ybjNCMS9CMlI0LzgvUFAzUFBQLzViSzEgdyAtIC0gMCAxXCIsXHJcblwiM3EycjEvcDJiMWsyLzFwbkJwMU4xLzNwMXBRUC82UDEvNVIyLzJyMlAyLzRSSzIgdyAtIC0gMCAxXCIsXHJcblwiM3JubjIvcDFyMnBrcC8xcDJwTjIvMnAxUDMvNVExTi8yUDNQMS9QUDJxUEsxL1I2UiB3IC0gLSAwIDFcIixcclxuXCJyMWIycmsxL3BwMmIxcHAvcTNwbjIvM25OMU4xLzNwNC9QMlE0LzFQM1BQUC9SQkIxUjFLMSB3IC0gLSAwIDFcIixcclxuXCJxcjNiMXIvUTVwcC8zcDQvMWtwNS8yTm4xQjIvUHA2LzFQM1BQUC8yUjFSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIycXIxazEvMXAzcFAxL3AycDFucDEvMnBQcDFCMS8yUG5QMWIxLzJOMnAyL1BQMVE0LzJLUjFCTlIgdyAtIC0gMCAxXCIsXHJcblwiNnJrL3AzcDJwLzFwMlBwMi8ycDJQMi8yUDFuQnIxLzFQNi9QNlAvM1IxUjFLIGIgLSAtIDAgMVwiLFxyXG5cInJrM3Exci9wYnA0cC8xcDNQMi8ycDFOMy8zcDJRMS8zUDQvUFBQM1BQL1IzUjFLMSB3IC0gLSAwIDFcIixcclxuXCIzcTFyMi9wYjNwcDEvMXA2LzNwUDFOay8ycjJRMi84L1BuM1BQMS8zUlIxSzEgdyAtIC0gMCAxXCIsXHJcblwicjcvM2JiMWtwL3E0cDFOLzFwblBwMW5wLzJwNFEvMlA1LzFQQjNQMS8yQjJSSzEgdyAtIC0gMCAxXCIsXHJcblwiMXIxcXJiazEvM2IzcC9wMnAxcHAxLzNOblAyLzNONC8xUTRCUC9QUDRQMS8xUjJSMksgdyAtIC0gMCAxXCIsXHJcblwicjJyMmsxLzFxNHAxL3BwYjNwMS8yYk5wMy9QMVE1LzFONVIvMVA0QlAvbjZLIHcgLSAtIDAgMVwiLFxyXG5cIjFiMnIxazEvM24ycDEvcDNwMnAvMXAzcjIvM1BOcDFxLzNCblAxUC9QUDFCUVAxSy9SNlIgYiAtIC0gMCAxXCIsXHJcblwiNnJrLzFwcWJicDFwL3AzcDJRLzZSMS80TjFuUC8zQjQvUFBQNS8yS1I0IHcgLSAtIDAgMVwiLFxyXG5cInIzcjFuMS9wcDNwazEvMnEycDFwL1AyTlAzLzJwMVFQMi84LzFQNVAvMUIxUjNLIHcgLSAtIDAgMVwiLFxyXG5cInJuYmsxYjFyL3BwcXBuUTFwLzRwMXAxLzJwMU4xQjEvNE4zLzgvUFBQMlBQUC9SM0tCMVIgdyAtIC0gMCAxXCIsXHJcblwiMmJyM2svcHAzUHAxLzFuMnAzLzFQMk4xcHIvMlAycVAxLzgvMUJRMlAxUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BwMnAycC8zcDJwYi8ycFBuMlAvMlAycTIvMk40UC9QUDNCUjEvUjJCSzFOMSBiIC0gLSAwIDFcIixcclxuXCJyM3ExcjEvMXAyYk5rcC9wM24zLzJQTjFCMVEvUFAxUDFwMi83UC81UFAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyNXJrL3BwcTJwMi8ycGIxUDFCLzNuNC8zUDQvMlBCM1AvUFAxUU5QMi8xSzYgdyAtIC0gMCAxXCIsXHJcblwiMmIxcnFrMS9yMXAycHAxL3BwNG4xLzNOcDFRMS80UDJQLzFCUDUvUFAzUDIvMktSMlIxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjRyLzFrMmJwcHAvcDFwMXAzLzgvTnAybkIyLzNSNC9QUFAxQlBQUC8yS1I0IHcgLSAtIDAgMVwiLFxyXG5cInIycXIxazEvMXAxbjJwcC8yYjFwMy9wMnBQMWIxL1AyUDFOcDEvM0JQUjIvMVBRQjNQLzVSSzEgdyAtIC0gMCAxXCIsXHJcblwiMnJiM3IvM04xcGsxL3AycHAycC9xcDJQQjFRL24yTjFQMi82UDEvUDFQNFAvMUsxUlIzIHcgLSAtIDAgMVwiLFxyXG5cInIxYjJrMXIvMnExYjMvcDNwcEJwLzJuM0IxLzFwNi8yTjRRL1BQUDNQUC8yS1JSMyB3IC0gLSAwIDFcIixcclxuXCJyMWIxcmsyL3BwMW5iTnBCLzJwMXAycC9xMm5CMy8zUDNQLzJOMVAzL1BQUTJQUDEvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwicjFicTFyMWsvcHA0cHAvMnBwNC8yYjJwMi80UE4yLzFCUFAxUTIvUFAzUFBQL1I0UksxIHcgLSAtIDAgMVwiLFxyXG5cInIycTQvcDJuUjFiay8xcDFQYjJwLzRwMnAvM25OMy9CMkIzUC9QUDFRMlAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCI1cjFrL3BwMW4xcDFwLzVuMVEvM3AxcE4xLzNQNC8xUDRSUC9QMXIxcVBQMS9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjRucmsxL3JSNXAvNHBucFEvNHAxTjEvMnAxTjMvNlAxL3E0UDFQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjdSL3IxcDFxMXBwLzNrNC8xcDFuMVEyLzNONC84LzFQUDJQUFAvMkIzSzEgdyAtIC0gMCAxXCIsXHJcblwicjFxYnIyay8xcDJuMXBwLzNCMW4yLzJQMU5wMi9wNE4yL1BRNFAxLzFQM1AxUC8zUlIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMXIxcmIzL3AxcTJwa3AvUG5wMm5wMS80cDMvNFAzL1ExTjFCMVBQLzJQUkJQMi8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCI0cjMvMnExcnBrMS9wM2JOMXAvMnAzcDEvNFFQMi8yTjRQL1BQNFAxLzVSSzEgdyAtIC0gMCAxXCIsXHJcblwicnEzcmsxLzFwMWJwcDFwLzNwMnBRL3AyTjNuLzJCblAxUDEvNVAyL1BQUDUvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwiNHIxazEvUTRicHAvcDcvNU4yLzFQM3FuMS8yUDUvUDFCM1BQL1I1SzEgYiAtIC0gMCAxXCIsXHJcblwiNHIzLzJwNS8ycDFxMWtwL3AxcjFwMXBOL1A1UDEvMVAzUDIvNFEzLzNSQjFLMSB3IC0gLSAwIDFcIixcclxuXCIzcjNrLzFiMmIxcHAvM3BwMy9wM24xUDEvMXBQcVAyUC8xUDJOMlIvUDFRQjFyMi8yS1IzQiBiIC0gLSAwIDFcIixcclxuXTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBbXHJcblwicjJxMXJrMS9wcHAxbjFwMS8xYjFwMXAyLzFCMU4yQlEvM3BQMy8yUDNQMS9QUDNQMi9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjNyMXJrMS9wcHFuM3AvMW5wYjFQMi81QjIvMlA1LzJOM0IxL1BQMlExUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCIyYnExazFyL3I1cHAvcDJiMVBuMS8xcDFRNC8zUDQvMUI2L1BQM1BQUC8yUjFSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJyMWszLzJQM1IxLzNQMksxLzZOMS84LzgvOC8zcjQgdyAtIC0gMCAxXCIsXHJcblwiMXIxYjFuMi8xcGszcDEvNFAycC8zcFAzLzNONC8xcDJCMy82UFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIyazFyL3BwcDFicHBwLzgvMUIxUTQvNXEyLzJQNS9QUFAyUFBQL1IzUjFLMSB3IC0gLSAwIDFcIixcclxuXCI1cXJrL3AzYjFycC80UDJRLzVQMi8xcHA1LzVQUjEvUDZQL0I2SyB3IC0gLSAwIDFcIixcclxuXCIycm5rMy9wcTNwMi8zUDFRMVIvMXA2LzNQNC81UDIvUDFiMU4xUDEvNUsyIHcgLSAtIDAgMVwiLFxyXG5cIjJycmszL1FSM3BwMS8ybjFiMnAvMUJCMXEzLzNQNC84L1A0UFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIyazFyLzFwMXAxcHAxL3AyUDQvNE4xQnAvM3A0LzgvUFBCMlAyLzJLMVIzIHcgLSAtIDAgMVwiLFxyXG5cIjdSLzVycDEvMnAxcjFrMS8ycTUvNHBQMVEvNFAzLzVQSzEvN1IgdyAtIC0gMCAxXCIsXHJcblwicjFiMmsxci9wcHBwNC8xYlAycXAxLzVwcDEvNHBQMi8xQlA1L1BCUDNQUC9SMlExUjFLIGIgLSAtIDAgMVwiLFxyXG5cInIxYm5rMnIvcHBwcDFwcHAvMWI0cTEvNFAzLzJCMU4zL1ExUHAxTjIvUDRQUFAvUjNSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJrcjNyLzFwM3BwcC9wM3BuMi8yYjFCMnEvUTFONS8yUDUvUFAzUFBQL1IyUjJLMSB3IC0gLSAwIDFcIixcclxuXCI2azEvMXAzcHAxL3AxYjFwMnAvcTNyMWIxL1A3LzFQNVAvMU5RMVJQUDEvMUI0SzEgYiAtIC0gMCAxXCIsXHJcblwiNXIyLzFxcDJwcDEvYm5wazNwLzROUTIvMlA1LzFQNVAvNVBQMS80UjFLMSB3IC0gLSAwIDFcIixcclxuXCIxcjJyMmsvMXExbjFwMXAvcDFiMXBwMi8zcFAzLzFiNVIvMk4xQkJRMS8xUFAzUFAvM1IzSyB3IC0gLSAwIDFcIixcclxuXCI0UjMvcDJyMXExay81QjFQLzZQMS8ycDRLLzNiNC80UTMvOCB3IC0gLSAwIDFcIixcclxuXCI0azMvcDVwMS8ycDRyLzJOUGIzLzRwMXByLzFQNHExL1AxUVIxUjFQLzdLIGIgLSAtIDAgMVwiLFxyXG5cIjZyMS9yNVBSLzJwM1IxLzJQazFuMi8zcDQvMVAxTlAzLzRLMy84IHcgLSAtIDAgMVwiLFxyXG5cIjZrMS81cDFwLzJRMXAxcDEvNW4xci9ONy8xQjNQMVAvMVBQM1BLLzRxMyBiIC0gLSAwIDFcIixcclxuXCI4LzNuMnBwLzJxQmtwMi9wcFBwcDFQMS8xUDJQMy8xUTYvUDRQUDEvNksxIHcgLSAtIDAgMVwiLFxyXG5cInIycWtiMXIvMXBwMXBwcHAvcDFubjQvM04xYjIvUTFCUDFCMi80UDMvUFAzUFBQL1IzSzFOUiB3IC0gLSAwIDFcIixcclxuXCIzYnIxazEvM04xcHBwLzFwMVFQMy8zUDQvNlAxLzVxMi81UDFQLzVSSzEgYiAtIC0gMCAxXCIsXHJcblwiOC81cDIvNGIxa3AvM3BQcDFOLzNQbjFQMS9CNlAvN0svOCBiIC0gLSAwIDFcIixcclxuXCJyMnFrYjFyL24yYm5wcDEvMnAxcDJwL1JQNi9RMUJQUDJCLzJOMk4yLzFQM1BQUC80SzJSIGIgLSAtIDAgMVwiLFxyXG5cInIxYnExcmsxL3BwMXAxcHAxLzFiM24xcC9uMnA0LzFQMlAzLzNCMU4yL1A0UFBQL1JOQlExUksxIHcgLSAtIDAgMVwiLFxyXG5cInIxYnExcmsxL3BwcDJwcDEvMm5wMW4xcC8yYjFwMy9OMUIxUDMvM1AxTjFQL1BQUDJQUDEvUjFCUTFSSzEgYiAtIC0gMCAxXCIsXHJcblwiNWsxci9wMXAxcTFwcC8xcEIycDFuLzNwMWIyLzFQNi9QM3AyUC8yUE4xUFAxL1IxQlExUksxIHcgLSAtIDAgMVwiLFxyXG5cInJuYnExcmsxL3BwcDJwcHAvM2IxbjIvOC80UDMvM1BCTjIvUFBQM1BQL1JOMVFLQjFSIGIgLSAtIDAgMVwiLFxyXG5cInIxYnExcmsxL3BwcDFicHBuLzNQM3AvOC8yQlE0LzJOMUIzL1BQUDJQUFAvUjRSSzEgYiAtIC0gMCAxXCIsXHJcblwicjJxMXIxay8xcDNwcHAvcDJwYmIxbi8ycDUvUDFCcFBQUFAvTlAxUDQvMlAzUTEvMksxUjJSIGIgLSAtIDAgMVwiLFxyXG5cInJuYnFrYjFyL3A1cHAvMnBwM24vMXAycHAyLzRQMy8xUE5CMU4xUC9QMVBQUVBQMS9SMUIyUksxIHcgLSAtIDAgMVwiLFxyXG5cInJuYnExcmsxL3BwcDFiMXBwLzNwMW4yLzRwMy81cDIvMVAyUDFQMS9QQlBQTlBCUC9STjFRMVJLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJxMXJrMS9wcDJicHBwLzJuMm4yLzJwMXAzLzRwMy8yUFAxTjIvUFBCMVFQUFAvUk5CMlJLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIycjFrLzFwcDNwMS9wMXExcFBCcC81cDFRLzNQNC9QNU4xLzFQM1BQUC8zUjFSSzEgYiAtIC0gMCAxXCIsXHJcblwicm5icWtiMXIvcHBwM3BwLzNwMVAyLzZCMS84LzNCMU4yL1BQUDJQUFAvUk4xUUsyUiBiIC0gLSAwIDFcIixcclxuXCJybjNyazEvcHAybjFwcC8xcTFwNC8ycFAxcDFiLzJQMVBQMi8zQkJOMi9QMVEzUFAvUjRSSzEgdyAtIC0gMCAxXCIsXHJcblwicm5xMnJrMS9wcDFiMXBwcC8ycGIxbjIvM3A0LzNOUDMvMUJOMVAyUC9QUFAyUFAxL1IxQlExUksxIGIgLSAtIDAgMVwiLFxyXG5cIjJrcjQvcHBwNFEvNnAxLzJiMnBxMS84LzJQMXAxUDEvUFAxUE4yUC9SMUIxSzJSIHcgLSAtIDAgMVwiLFxyXG5cInIxYnFrYm5yL3BwMXAxcHBwLzgvMnA1LzNuUDMvMVBOUTJwMS9QMVBQTjJQL1IxQjFLQjFSIHcgLSAtIDAgMVwiLFxyXG5cInJuYnFrMnIvcHBwcDFwcDEvN3AvMmIxTjMvMkIxTjMvOC9QUFBQMVBQUC9SMUJRSzJSIGIgLSAtIDAgMVwiLFxyXG5cInIxYjFrMnIvcHBwcHExcDEvN3AvMmIxUDMvMkIxUTMvOC9QUFAyUFBQL1IxQjJSSzEgYiAtIC0gMCAxXCIsXHJcblwicm5icTFyazEvcHAzcHAxLzJwYnBuMXAvM3A0LzRQMy8xUU40Ti9QUFBQMVBQUC9SMUIxS0IxUiBiIC0gLSAwIDFcIixcclxuXCJybjJrMnIvcHBwMnBwMS8zcDFuMXAvMlAxcDMvMkIxTjMvOC9QMVBQMVAxUC9SMUIxSzFSMSBiIC0gLSAwIDFcIixcclxuXCI2azEvNnAxLzgvOC8zUDFxMXIvN1AvUFA0UDEvM1IzSyBiIC0gLSAwIDFcIixcclxuXCJyMnEyazEvMXBwM3AxL3AxbnBiYjFwLzgvM1BQMy83UC9QUDNQUDEvUjFCUTFSSzEgdyAtIC0gMCAxXCIsXHJcblwicjFiMnJrMS9wcHBwMXBwcC9uNG4yLzRxMy8xYjVRLzJQMVBwUDEvUEIxUDJCUC9STjJLMU5SIHcgLSAtIDAgMVwiLFxyXG5cIjNyMXJrMS9iMXAzcHAvcDFwMVBwMi8yUDJQMi8xUDJOMW4xLzJCNS9QM0syUC9SNlIgYiAtIC0gMCAxXCIsXHJcblwicjRuazEvNHExcHAvMXIxcDFwMi8ycFBwMy8yUDJCMi8xcDYvUDRQUFAvUjFRMVIxSzEgdyAtIC0gMCAxXCIsXHJcblwicjFiM3IxL3BwMXAycHAvazFQYjQvMnAxcDMvOC8yUVA0L1BQUDJQUFAvUk4ySzJSIGIgLSAtIDAgMVwiLFxyXG5cIjFyNGsxL3AxcDFxMXBwLzVwMi8ycFBwUDIvYnI0UFAvMVAxUlBCMi9QMVE1LzJLNFIgYiAtIC0gMCAxXCIsXHJcblwiM3EyazEvcDFwbjJwcC8xcm4xYjFyMS8xcDFwcDMvNFBwTmIvMlBQMUIxUC9QUE4xUVBQMS9SMUIxUjFLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJxMXIxay9wcHBwbjFwcC8xYjFQNC9uNHAyLzJCMVAyQi8yTjJOMi9QUDNQUFAvUjJRMVJLMSBiIC0gLSAwIDFcIixcclxuXCJyNHJrMS9wcDNwcHAvMXFuYjFuMi8xQjFwcDMvMlA1LzNQMU4xUC9QUDNQMVAvUjFCUTFSSzEgYiAtIC0gMCAxXCIsXHJcblwicjFicWsxbnIvcHBwcDNwLzVwcDEvNHAzLzFiQm5QMy81UTFOL1BQUFAxUFBQL1JOQjJSSzEgdyAtIC0gMCAxXCIsXHJcblwicjNrMnIvcHBiMXEycC9uMXAxQnBwMS8yUFA0LzNQNC9QNE4xUC8xUDNQUDEvMVIxUTFSSzEgYiAtIC0gMCAxXCIsXHJcblwicjFicTFyazEvcHAxcGJwcDEvNW4xcC8ycDUvMkJwUE4xQi8zUDQvUFBQMlBQUC9SMlExUksxIGIgLSAtIDAgMVwiLFxyXG5cInI0cmsxLzFwcDFicHAxLzJwcTFuMXAvcDNwUTIvNFBQMi8zUEIyUC9QUFAxTjFQMS9SNFJLMSBiIC0gLSAwIDFcIixcclxuXCJyMWIxazJiL3AxcG4zcC8xcDJQMXAxLzVuMi81QjIvMk5CNC9QUFAyUFBQLzJLUlIzIGIgLSAtIDAgMVwiLFxyXG5cInIxYnFrYm5yL3BwM3BwcC8ybjFwMy8ycHBQMy8zUDQvMk4xQjMvUFBQMlBQUC9SMlFLQk5SIGIgLSAtIDAgMVwiLFxyXG5cInIxYjJyazEvMXA0cHAvMXBuMnAyLzFOMnFwMi84L1AyQnAyUC8xUFAyUFAxLzFSMVExUksxIHcgLSAtIDAgMVwiLFxyXG5cInI3LzdrLzFCcDNwcC80cHExbi9QM1EzLzFQUDRQLzJQM1AxLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cInIycXIxazEvMnAxbnBwcC9wNy8xcDFwTjFOMS8zUDQvMUI1UC9QUDNQUDEvUjNRMUsxIGIgLSAtIDAgMVwiLFxyXG5cInJuYjFrcjIvcHBwMW4xcHAvM1AycTEvOC84LzRQTjIvUFBQUDJQUC9STkIyUksxIGIgLSAtIDAgMVwiLFxyXG5cInIycTQvcGJwcDFrcDEvMXAxYjFuMXAvOC8zcFAzLzNQNC9QUFAyUFBQL1JOMVFLMlIgdyAtIC0gMCAxXCIsXHJcblwicm5icWsxbnIvcHAxcDJwcC8xYjJwUDIvMnAzQjEvM1A0LzJQMk4yL1BQM1BQUC9STjFRS0IxUiBiIC0gLSAwIDFcIixcclxuXCJyMWJxMXJrMS9wcHAxbjFwMS8xYm4xcFAyLzNwMk4xLzNQMVBQMS8yUDJRMi9QUDVQL1JOQjJSSzEgYiAtIC0gMCAxXCIsXHJcblwicm4yazJyL3BwcDJwMXAvNHAxcDEvNGIxcW4vM1BCMy80UDJQL1BQUDJQMi9SMUJRSzJSIHcgLSAtIDAgMVwiLFxyXG5cIjJyM2sxLzVwcHAvNHAzLzJibk5uTjEvNVAyLzgvMVA0UFAvMkIyUjFLIHcgLSAtIDAgMVwiLFxyXG5cInIza2Juci9wcDRwMS8ybjFwMnAvcTFwcFBiMi8zUDNQL1AxTjFCTjIvMVBQMlBCMS9SMlFLMlIgYiAtIC0gMCAxXCIsXHJcblwicm5icWsyci9wM2JwcHAvMXAycDMvMnA1LzJwUFAzL1AxTjFCUDIvMVBQUU4xUFAvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwiOC82UVAvcGs2LzgvNWIxci81SzIvUFA0UDEvOCBiIC0gLSAwIDFcIixcclxuXCJybjFxazFuci9wcDJicHBwLzJwMXAzLzNwNC8zUFAzLzJOUTFOMi9QUFAyUFBQL1IxQjFLMlIgYiAtIC0gMCAxXCIsXHJcblwicjFicTFyazEvcHBwMnBwcC8zYjFuMi8zUG4zLzJCMXBQMi84L1BQUFBRMVBQL1JOQjJSSzEgdyAtIC0gMCAxXCIsXHJcblwiNXJrMS9wNHBwcC8xcnAxcDMvM3BCMVExLzNQbjMvMVA0UFAvUDFQMlAyL1IzUjFLMSBiIC0gLSAwIDFcIixcclxuXCJybjFxa2Ixci9wcHAxcHBwcC81bjIvNWJOMS84LzJOcDQvUFBQMlBQUC9SMUJRS0IxUiB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3JiM3AxcC81cDIvM3A0LzRQMy9QUDFCbk5CMS8xUDNSUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyMnExcmsxL3BwYm4xcHAxLzNwM3AvM3A0LzFQQjFQTmIxL1AyUTFOMi8yUDNQUC9SNFIxSyB3IC0gLSAwIDFcIixcclxuXCJyNW5yLzNrMXBwcC9wMlBwMy9uNy8zTjFCMi84L1BQM1BQUC9SM0syUiBiIC0gLSAwIDFcIixcclxuXCJybjFxa2Juci8xcDYvcDFwcDFwMi82cHAvUTFCUFBwYjEvMlAyTjIvUFAxTjJQUC9SMUIyUksxIHcgLSAtIDAgMVwiLFxyXG5cInIzazJyL3BwMW4xcHAxLzFxcGJwbjFwLzNwNC8zUFAzL1AxTlExTjFQLzFQUDJQUDEvUjFCMVIxSzEgYiAtIC0gMCAxXCIsXHJcblwiN3IvMnFuMXJrMS8ycDJicHAvcDFwMXBwMi9QMVAyUDIvMVAxUEJSUU4vNlBQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIycWsxbnIvcHBwM3BwLzJuMnAyLzJicDQvM3BQUGIxLzNCMU4yL1BQUDNQUC9STkJRMVIxSyB3IC0gLSAwIDFcIixcclxuXCJyMWIycWsxL3BwUTRwLzJQMXBwcnAvM3A0LzNuNC9QNVAxLzFQMU5QUEJQL1I0UksxIGIgLSAtIDAgMVwiLFxyXG5cInIycWtiMXIvcHAzcDFwLzJiMXAxcDEvMnBwUDJuLzNQMVAyLzJOMUJOMi9QUFAzUFAvUjJRMVJLMSBiIC0gLSAwIDFcIixcclxuXCJybmJxazJyL3BwcDJwcHAvNW4yLzJiUDQvNVAyLzNwMk4xL1BQUDNQUC9STkJRS0IxUiB3IC0gLSAwIDFcIixcclxuXCJyMWI0ci8xcGszcHAvcDFucDQvM0JuMWIxL1BQMkszLzVQMi8zUDNQLzJSNSB3IC0gLSAwIDFcIixcclxuXCJyMWJxa2Juci9wNXBwLzFwbnAxUDIvMnA1LzJCUDFCMi81TjIvUFBQM1BQL1JOMVFLMlIgYiAtIC0gMCAxXCIsXHJcbl07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gW1xyXG5cIjFyYjJrMi8xcHEzcFEvcFJwTnAzL1AxUDJuMi8zUDFQMi80UDMvNlBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCIycjJiazEvcGIzcHBwLzFwNi9uNy9xMlA0L1AxUDFSMlEvQjJCMVBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjNyMmsxL3AxcDJwMi9icDJwMW5RLzRQQjFQLzJwcjNxLzZSMS9QUDNQUDEvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwicjFicjFiMi80cFBrMS8xcDFxM3AvcDJQUjMvUDFQMk4yLzFQMVEyUDEvNVBCSy80UjMgdyAtIC0gMCAxXCIsXHJcblwiN3IvM2ticDFwLzFRM1IyLzNwM3EvcDJQM0IvMVA1Sy9QNlAvOCB3IC0gLSAwIDFcIixcclxuXCI0Um5rMS9wcjNwcHAvMXAzcTIvNU5RMS8ycDUvOC9QNFBQUC82SzEgdyAtIC0gMCAxXCIsXHJcblwiNHFrMi82cDEvcDcvMXAxUXAzL3IxUDJiMi8xSzVQLzFQNi80UlIyIHcgLSAtIDAgMVwiLFxyXG5cIjNyMXJrMS9wcHFuM3AvMW5wYjFQMi81QjIvMlA1LzJOM0IxL1BQMlExUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyM3JrMi82YjEvcTJwUUJwMS8xTnBQNC8xbjJQUDIvblA2L1AzTjFLMS9SNlIgdyAtIC0gMCAxXCIsXHJcblwicjVrMS9wcDJwcGIxLzNwNC9xM1AxUVIvNmIxL3IyQjFwMi8xUFA1LzFLNFIxIHcgLSAtIDAgMVwiLFxyXG5cIjZrMS81cHAxL3AzcDJwLzNiUDJQLzZRTi84L3JxNFAxLzJSNEsgdyAtIC0gMCAxXCIsXHJcblwiTjFiazQvcHAxcDFRcHAvOC8yYjUvM24zcS84L1BQUDJSUFAvUk5CMXJCSzEgYiAtIC0gMCAxXCIsXHJcblwicjNicjFrL3BwNXAvNEIxcDEvNE5wUDEvUDJQbjMvcTFQUTNSLzdQLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjZrci9wcDJyMnAvbjFwMVBCMVEvMnE1LzJCNFAvMk4zcDEvUFBQM1AxLzdLIHcgLSAtIDAgMVwiLFxyXG5cIjFSNi81cXBrLzRwMnAvMVBwMUJwMVAvcjFuMlFQMS81UEsxLzRQMy84IHcgLSAtIDAgMVwiLFxyXG5cIjgvNFIxcGsvcDVwMS84LzFwQjFuMWIxLzFQMmIxUDEvUDRyMVAvNVIxSyBiIC0gLSAwIDFcIixcclxuXCJyMWJrMXIyL3BwMW4ycHAvM05RMy8xUDYvOC8ybjJQQjEvcTFCM1BQLzNSMVJLMSB3IC0gLSAwIDFcIixcclxuXCJybjNyazEvcHAzcDIvMmIxcG5wMS80TjMvM3E0L1AxTkIzUi8xUDFRMVBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJrcjFiMXIvcHAzcHBwLzJwMWIycS80QjMvNFEzLzJQQjJSMS9QUFAyUFBQLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjVxcjEva3AyUjMvNXAyLzFiMU4xcDIvNVEyL1A1UDEvNkJQLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyMnFyazIvcDViMS8yYjFwMVExLzFwMXBQMy8ycDFuQjIvMlAxUDMvUFAzUDIvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwicjVyay9wcDFucDFibi8ycHAycTEvM1AxYk4xLzJQMU4yUS8xUDYvUEIyUFBCUC8zUjFSSzEgdyAtIC0gMCAxXCIsXHJcblwicjRuMWsvcHBCbk4xcDEvMnAxcDMvNk5wL3EyYlAxYjEvM0I0L1BQUDNQUC9SNFExSyB3IC0gLSAwIDFcIixcclxuXCJyM1FuUjEvMWJrNS9wcDVxLzJiNS8ycDFQMy9QNy8xQkI0UC8zUjNLIHcgLSAtIDAgMVwiLFxyXG5cIjFyNGsxLzNiMnBwLzFiMXBQMnIvcHAxUDQvNHEzLzgvUFA0UlAvMlEyUjFLIGIgLSAtIDAgMVwiLFxyXG5cInIyTnFiMXIvcFExYnAxcHAvMXBuMXAzLzFrMXA0LzJwMkIyLzJQNS9QUFAyUFBQL1IzS0IxUiB3IC0gLSAwIDFcIixcclxuXCJyNmsvcGI0YnAvNVEyLzJwMU5wMi8xcUI1LzgvUDRQUFAvNFJLMiB3IC0gLSAwIDFcIixcclxuXCIycjJiMWsvcDJRM3AvYjFuMlBwUC8ycDUvM3IxQk4xLzNxMlAxL1A0UEIxL1IzUjFLMSB3IC0gLSAwIDFcIixcclxuXCJyM3Iyay9wYjFuM3AvMXAxcTFwcDEvNHAxQjEvMkJQM1EvMlAxUjMvUDRQUFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwicTFyMmIxay9yYjRucC8xcDJwMk4vcEIxbjQvNlExLzFQMlAzL1BCM1BQUC8yUlIySzEgdyAtIC0gMCAxXCIsXHJcblwiMnIxazJyL3BSMnAxYnAvMm4xUDFwMS84LzJRUDQvcTJiMU4yL1AyQjFQUFAvNEsyUiB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BwMlJwcHAvbnFwNS84LzVRMi82UEIvUFBQMlAxUC82SzEgdyAtIC0gMCAxXCIsXHJcblwiMVExUjQvNWsyLzZwcC8yTjFicDIvMUJuNS8yUDJQMVAvMXIzUEsxLzggYiAtIC0gMCAxXCIsXHJcblwiMXE1ci8xYjFyMXAxay8ycDFwUHBiL3AxUHA0LzNCMVAxUS8xUDRQMS9QNEtCMS8yUlI0IHcgLSAtIDAgMVwiLFxyXG5cInIxYnFuMXJrLzFwMW5wMWJwL3AxcHAycDEvNlAxLzJQUFAzLzJOMUJQTjEvUFAxUTQvMktSMUIxUiB3IC0gLSAwIDFcIixcclxuXCJyMnE0L3BwMXJwUWJrLzNwMnAxLzJwUFAycC81UDIvMk41L1BQUDJQMi8yS1IzUiB3IC0gLSAwIDFcIixcclxuXCI0cTFyay9wYjJicG5wLzJyNFEvMXAxcDFwUDEvNE5QMi8xUDNSMi9QQm40UC9SQjRLMSB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BicHBxMWJOLzFwbjFwMVExLzZOMS8zUDQvOC9QUFAyUFAxLzJLNFIgdyAtIC0gMCAxXCIsXHJcblwicjJyNC8xcDFibjJwL3BuMnBwa0IvNXAyLzRQUU4xLzZQMS9QUHEyUEJQL1IyUjJLMSB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BwcDNwcC84LzNwUTMvM1AyYjEvNXJQcS9QUDFQMVAyL1IxQkIxUksxIGIgLSAtIDAgMVwiLFxyXG5cInI2ci8xcDJwcDFrL3AxYjJxMXAvNHBQMi82UVIvM0IyUDEvUDFQMksyLzdSIHcgLSAtIDAgMVwiLFxyXG5cInIyUTFxMWsvcHA1ci80QjFwMS81cDIvUDcvNFAyUi83UC8xUjRLMSB3IC0gLSAwIDFcIixcclxuXCI1azIvcDJRMXBwMS8xYjVwLzFwMlBCMVAvMnAyUDIvOC9QUDNxUEsvOCB3IC0gLSAwIDFcIixcclxuXCJyM2tiMXIvcGI2LzJwMnAxcC8xcDJwcTIvMnBRM3AvMk4yQjIvUFAzUFBQLzNSUjFLMSB3IC0gLSAwIDFcIixcclxuXCJybjNrMXIvcGJwcDFCYnAvMXA0cE4vNFAxQjEvM240LzJxM1ExL1BQUDJQUFAvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwicjFiM2tyL3BwcDFCcDFwLzFiNi9uMlA0LzJwM3ExLzJRMk4yL1A0UFBQL1JOMlIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMVIxYnIxazEvcFI1cC8ycDNwQi8ycDJQMi9QMXFwMlExLzJuNFAvUDVQMS82SzEgdyAtIC0gMCAxXCIsXHJcblwiNnJrLzJwMnAxcC9wMnExcDFRLzJwMXBQMi8xblAxUjMvMVA1UC9QNVAxLzJCM0sxIHcgLSAtIDAgMVwiLFxyXG5cInIzcmsyLzVwbjEvcGIxbnExcFIvMXAycDFQMS8ycDFQMy8yUDJRTjEvUFBCQjFQMi8ySzRSIHcgLSAtIDAgMVwiLFxyXG5cIjNya3Exci8xcFEycDFwL3AzYlBwMS8zcFIzLzgvOC9QUFAyUFAxLzFLMVI0IHcgLSAtIDAgMVwiLFxyXG5cIm4ycTFyMWsvNGJwMXAvNHAzLzRQMXAxLzJwUE5RMi8ycDRSLzVQUFAvMkIzSzEgdyAtIC0gMCAxXCIsXHJcblwiMlJyMXFrMS81cHBwL3AyTjQvUDcvNVEyLzgvMXI0UFAvNUJLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJxMnJrL3BwM3BicC8ycDFwMXBRLzdQLzNQNC8yUEIxTjIvUFAzUFBSLzJLUjQgdyAtIC0gMCAxXCIsXHJcblwiNXFyMS9wcjNwMWsvMW4xcDJwMS8ycFBwUDFwL1AzUDJRLzJQMUJQMVIvN1AvNlJLIHcgLSAtIDAgMVwiLFxyXG5cIjdrL3BiNHJwLzJxcDFRMi8xcDNwUDEvbnAzUDIvM1ByTjFSL1AxUDRQL1IzTjFLMSB3IC0gLSAwIDFcIixcclxuXCI4L3A0cGsxLzZwMS8zUjQvM25xTjFQLzJRM1AxLzVQMi8zcjFCSzEgYiAtIC0gMCAxXCIsXHJcblwicjFiMnJrMS9wMXFuYnAxcC8ycDNwMS8ycHAzUS80cFAyLzFQMUJQMVIxL1BCUFAyUFAvUk40SzEgdyAtIC0gMCAxXCIsXHJcblwicnFyM2sxLzNicHBCcC8zcDJQMS9wNy8xbjJQMy8xcDNQMi8xUFBRMlAxLzJLUjNSIHcgLSAtIDAgMVwiLFxyXG5cInIzcTFyay8xcHAzcGIvcGI1US8zcEIzLzNQNC8yUDJOMVAvUFAxTjJQMS83SyB3IC0gLSAwIDFcIixcclxuXCIzUTFyazEvOC83Ui9wMU4xcDFCcC9QMXE1LzdiLzNRMVBQSy8xcjYgYiAtIC0gMCAxXCIsXHJcblwiMXIyazFyMS9wYnBwbnAxcC8xYjNQMi84L1E3L0IxUEIxcTIvUDRQUFAvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwiMnIzazEvNnBwL3AycDQvMXA2LzFwMlAzLzFQTksxYlExLzFCUDNxUC9SNyBiIC0gLSAwIDFcIixcclxuXCIxcjNyazEvMW5xYjJuMS82UjEvMXAxUHAzLzFQcDNwMS8yUDRQLzJCMlFQMS8yQjJSSzEgdyAtIC0gMCAxXCIsXHJcblwiM3IxcmsxL3AxcDRwLzgvMVBQMXAxYnEvMlA1LzNOMVBwMS9QQjJRMy8xUjNSSzEgYiAtIC0gMCAxXCIsXHJcblwiMmIzazEvNnAxL3AyYnAyci8xcDFwNC8zTnAxQjEvMVBQMVBScTEvUDFSM1AxLzNRMksxIGIgLSAtIDAgMVwiLFxyXG5cIjVxMi8xcHByMWJyMS8xcDFwMWtuUi8xTjRSMS9QMVAxUFAyLzFQNi8yUDRRLzJLNSB3IC0gLSAwIDFcIixcclxuXCJyMnExYjFyLzFwTjFuMXBwL3AxbjNrMS80UGIyLzJCUDQvOC9QUFAzUFAvUjFCUTFSSzEgdyAtIC0gMCAxXCIsXHJcblwiNG4zL3BicTJyazEvMXAzcE4xLzgvMnAyUTIvUG40TjEvQjRQUDEvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiOC8xcDJwMWtwLzJyUkIzL3BxMm4xUHAvNFAzLzgvUFBQMlEyLzJLNSB3IC0gLSAwIDFcIixcclxuXCIzcjFyazEvMXEyYjFuMS9wMWIxcFJwUS8xcDJQMy8zQk4zL1AxUEI0LzFQNFBQLzRSMksgdyAtIC0gMCAxXCIsXHJcblwicjRyMWsvMWJwcTFwMW4vcDFucDQvMXAxQmIxQlEvUDcvNlIxLzFQM1BQUC8xTjJSMUsxIHcgLSAtIDAgMVwiLFxyXG5cImsxYjRyLzFwNi9wUjNwMi9QMVFwMnAxLzJwcDQvNlBQLzJQMnFCSy84IHcgLSAtIDAgMVwiLFxyXG5cInIzcmtuUS8xcDFSMXBiMS9wM3BxQkIvMnA1LzgvNlAxL1BQUDJQMVAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiazJyNC9wcDNwMi8ycDUvUTNwMnAvNEtwMVAvNVIyL1BQNHExLzdSIGIgLSAtIDAgMVwiLFxyXG5cIjVyazEvMWJSMnBicC80cDFwMS84LzFwMVAxUFBxLzFCMlAyci9QMk5RMlAvNVJLMSBiIC0gLSAwIDFcIixcclxuXCI2cmsvM2IzcC9wMmIxcDIvMnBQcFAyLzJQMUIzLzFQNHExL1AyQlExUFIvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjNrMXIxci9wYjNwMi8xcDRwMS8xQjJCMy8zcW4zLzZRUC9QNFJQMS8yUjNLMSB3IC0gLSAwIDFcIixcclxuXCI1a3FRLzFiMXIycDEvcHBuMXAxQnAvMmI1LzJQMnJQMS9QNE4yLzFCNVAvNFJSMUsgdyAtIC0gMCAxXCIsXHJcblwiM3JucjFrL3AxcTFiMXBCLzFwYjFwMnAvMnAxUDMvMlAyTjIvUFA0UDEvMUJRNFAvNFJSSzEgdyAtIC0gMCAxXCIsXHJcblwiNnJrLzVwMXAvNXAyLzFwMmJQMi8xUDJSMlEvMnExQkJQUC81UEsxL3I3IHcgLSAtIDAgMVwiLFxyXG5cIjVyMWsvMnExcjFwMS8xbnBiQnBRQi8xcDFwM1AvcDJQMlIxL1A0UFAxLzFQUjJQSzEvOCB3IC0gLSAwIDFcIixcclxuXCJyMWIycmsxLzFwM3BiMS8ycDNwMS9wMUI1L1AzTjMvMUIxUTFQbjEvMVBQM3ExLzJLUjNSIHcgLSAtIDAgMVwiLFxyXG5cIjgvUXJrYlIzLzNwM3AvMnBQNC8xUDNOMi82UDEvNnBLLzJxNSB3IC0gLSAwIDFcIixcclxuXCI4L3BwM3BrMS8yYjJiMi84LzJRMlAxci8yUDFxMkIvUFA0UEsvNVIyIGIgLSAtIDAgMVwiLFxyXG5cIjFyM3Ixay8yUjRwL3E0cHBQLzNQcFEyLzJSYlAzL3BQNi9QMkIyUDEvMUs2IHcgLSAtIDAgMVwiLFxyXG5cInIxcTJiMi9wNHAxay8xcDFyM3AvM0IxUDIvM0IyUTEvNFAzL1A1UFAvNVJLMSB3IC0gLSAwIDFcIixcclxuXCI2azEvNnBwLzFxNi80cHAyL1A1bjEvMVA2LzFQM0JQci9SNFFLMSBiIC0gLSAwIDFcIixcclxuXCI1cjIvNmsxL3AycDQvNm4xL1AzcDMvOC81UDIvMnEyUUtSIGIgLSAtIDAgMVwiLFxyXG5cIjFrMXI0LzFiMXAycHAvUFEycDMvbk42L1AzUDMvOC82UFAvMnEyQksxIHcgLSAtIDAgMVwiLFxyXG5cIjJiM2sxLzFwNXAvMnAxbjFwUS8zcUIzLzNQNC8zQjNQL3I1UDEvNVJLMSB3IC0gLSAwIDFcIixcclxuXCIycjFyazIvNmIxLzFxMnBwUDEvcHAxUHBRQjEvOC9QUFAyQlAxLzZLMS83UiB3IC0gLSAwIDFcIixcclxuXCJycjNrMi9wcHBxMXBOMS8xYjFwMUJuUS8xYjJwMU4xLzRQMy8yUFAzUC9QUDNQUDEvUjRSSzEgdyAtIC0gMCAxXCIsXHJcblwiN1IvMWJwa3AzL3AycHAzLzNQNC80QjFxMS8yUTUvNE5yUDEvM0s0IHcgLSAtIDAgMVwiLFxyXG5cIjJiMXIyci8ycTFwMWtuL3BOMXBQcDIvUDJQMVJwUS8zcDQvM0I0LzFQNFBQL1I2SyB3IC0gLSAwIDFcIixcclxuXCIzcjFrYlIvMXAxcjJwMS8ycXAxbjIvcDNwUFExL1AxUDFQMy9CUDYvMkI1LzZSSyB3IC0gLSAwIDFcIixcclxuXCI1cXJrL3AzYjFycC80UDJRLzVQMi8xcHA1LzVQUjEvUDZQL0I2SyB3IC0gLSAwIDFcIixcclxuXCIxcjNyMWsvNnAxL3A2cC8yYnBOQlAxLzFwMm4zLzFQNVEvUEJQMXEyUC8xSzVSIHcgLSAtIDAgMVwiLFxyXG5cIjgvMXI1cC9rcFEzcDEvcDNycDIvUDZQLzgvNGJQUEsvMVI2IHcgLSAtIDAgMVwiLFxyXG5cIjNyMWsyLzFwcjJwUjEvcDFicTFuMVEvUDNwUDIvM3BQMy8zUDQvMVAyTjJQLzZSSyB3IC0gLSAwIDFcIixcclxuXCIzUnJrMi8xcDFSMXByMS8ycDFwMlEvMnExUDFwMS81UDIvOC8xUFA1LzFLNiB3IC0gLSAwIDFcIixcclxuXCIxUjNuazEvNXBwMS8zTjJiMS80cDFuMS8yQnFQMVExLzgvOC83SyB3IC0gLSAwIDFcIixcclxuXCIycjJyazEvMWIzcHAxLzRwMy9wM1AxUTEvMXBxUDFSMi8yUDUvUFAxQjFLMVAvUjcgdyAtIC0gMCAxXCIsXHJcblwiNmsxL3BwM3IyLzJwNHEvM3AycDEvM1BwMWIxLzRQMVAxL1BQNFJQLzJRMVJyTksgYiAtIC0gMCAxXCIsXHJcblwiOC84L3AzcDMvM2IxcFIxLzFCM1Axay84LzRyMVBLLzggdyAtIC0gMCAxXCIsXHJcblwicjFiMm5yay8xcDNwMXAvcDJwMVAyLzVQMi8ycTFQMlEvOC9QcFA1LzFLMVIzUiB3IC0gLSAwIDFcIixcclxuXCJyNWtyL3BwcE4xcHAxLzFibjFSMy8xcTFOMkJwLzNwMlExLzgvUFBQMlBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cImIzcjFrMS81cHBwL3AycDQvcDRxTjEvUTJiNC82UjEvNVBQUC81UksxIGIgLSAtIDAgMVwiLFxyXG5cInIyUm5rMXIvMXAycTFiMS83cC82cFEvNFBwYjEvMUJQNS9QUDNCUFAvMks0UiB3IC0gLSAwIDFcIixcclxuXCJyM25yMWsvMWIyTnBwcC9wbjYvcTNwMVAxL1AxcDRRL1I3LzFQMlBQMVAvMkIyUksxIHcgLSAtIDAgMVwiLFxyXG5cInI1clIvM05rcDIvNHAzLzFRNHExL25wMU40LzgvYlBQUjJQMS8ySzUgdyAtIC0gMCAxXCIsXHJcblwiNXJrMS9wcDNwcHAvN3IvNm4xL05CMVAzcS9QUTNQMi8xUDRQMS9SNFJLMSBiIC0gLSAwIDFcIixcclxuXCI0UjMvMnAya3BRLzNwM3AvcDJyMnExLzgvMVByMlAyL1AxUDNQUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCIycTFyMy80cFIyLzNyUTFway9wMXBuTjJwL1BuNUIvOC8xUDRQUC8zUjNLIHcgLSAtIDAgMVwiLFxyXG5cInJuNG5yL3BwcHEyYmsvN3AvNWIxUC80TkJRMS8zQjQvUFBQM1AxL1IzSzJSIHcgLSAtIDAgMVwiLFxyXG5cIjNybjJyLzNrYjJwL3A0cHBCLzFxMVBwMy84LzNQMU4yLzFQMlExUFAvUjFSNEsgdyAtIC0gMCAxXCIsXHJcblwiNGtyMi8zcm4ycC8xUDRwMS8ycDUvUTFCMlAyLzgvUDJxMlBQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIxYnI0LzFwMmJwazEvcDFucHBuMXAvNVAyLzRQMkIvcU5OQjNSL1AxUFEyUFAvN0sgdyAtIC0gMCAxXCIsXHJcblwiM3Ezci9yNHBrMS9wcDJwTnAxLzNiUDFRMS83Ui84L1BQM1BQUC8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCJyMWtxMWIxci81cHBwL3A0bjIvMnBQUjFCMS9RNy8yUDUvUDRQUFAvMVI0SzEgdyAtIC0gMCAxXCIsXHJcblwicjNrcjIvNlFwLzFQYjJwMi9wQjNSMi8zcHEyQi80bjMvMVA0UFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMnJyazMvUVIzcHAxLzJuMWIycC8xQkIxcTMvM1A0LzgvUDRQUFAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjFxYmsybnIvMXBOcDJCcC8ybjFwcDIvOC8yUDFQMy84L1ByM1BQUC9SMlFLQjFSIHcgLSAtIDAgMVwiLFxyXG5cIjJRNS82cGsvNWIxcC81UDIvM3A0LzFScjJxTksvN1AvOCBiIC0gLSAwIDFcIixcclxuXCI0QnIxay9wNXBwLzFuNi84LzNQUWJxMS82UDEvUFA1UC9STkIzSzEgYiAtIC0gMCAxXCIsXHJcblwicm5iMWsyci9wcHBwYk4xcC81bjIvN1EvNFAzLzJONS9QUFBQM1AvUjFCMUtCMXEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzJSMVFwYjEvM0JwMXAxLzFwMm4ycC8zcTQvMVA1UC8yTjJQUEsvcjcgYiAtIC0gMCAxXCIsXHJcblwicjFiMnJrMS9wcDNwcHAvM3A0LzNRMW5xMS8yQjFSMy84L1BQM1BQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjFyM2IyLzFicDJwa3AvcDFxNE4vMXAxbjFwQm4vOC8yUDNRUC9QUEIyUFAxLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjdyL3BScGs0LzJucDJwMS81YjIvMlA0cS8yYjFCQk4xL1A0UFAxLzNRMUsyIGIgLSAtIDAgMVwiLFxyXG5cIlI0cmsxLzRyMXAxLzFxMnAxUXAvMXBiNS8xbjVSLzVOQjEvMVAzUFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIycmsxLzFwMm5wcHAvcDJSMWIyLzRxUDFRLzRQMy8xQjJCMy9QUFAyUDFQLzJLM1IxIHcgLSAtIDAgMVwiLFxyXG5cIjdrL3AxcDJicDEvM3ExTjFwLzRyUDIvNHBRMi8yUDRSL1AycjJQUC80UjJLIHcgLSAtIDAgMVwiLFxyXG5cIjRyMWsxL3BiNHBwLzFwMnAzLzRQcDIvMVAzTjIvUDJRbjJQLzNuMXFQSy9SQkIxUjMgYiAtIC0gMCAxXCIsXHJcblwicjFicTFyMWsvcHAybjFwcC84LzNOMXAyLzJCNFIvOC9QUFAyUVBQLzdLIHcgLSAtIDAgMVwiLFxyXG5cIjVyazEvM3AxcDFwL3A0UXExLzFwMVAyUjEvN04vbjZQLzJyM1BLLzggdyAtIC0gMCAxXCIsXHJcblwicjJyMmsxL3AzYnBwcC8zcDQvcTJwM24vM1FQMy8xUDRSMS9QQjNQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyNHIyLzJxbmJwa3AvYjNwMy8ycHBQMU4xL3AyUDFRMi9QMVA1LzVQUFAvbkJCUjJLMSB3IC0gLSAwIDFcIixcclxuXCI1cjFrLzFwMWIxcDFwL3AycHBiMi81UDFCLzFxNi8xUHIzUjEvMlBRMlBQLzVSMUsgdyAtIC0gMCAxXCIsXHJcblwiNXIyL3BwMlIzLzFxMXAzUS8ycFAxYjIvMlBrcnAyLzNCNC9QUEsyUFAxL1I3IHcgLSAtIDAgMVwiLFxyXG5cInE1azEvNXJiMS9yNnAvMU5wMW4xcDEvM3AxUG4xLzFONFAxL1BQNVAvUjFCUVJLMiBiIC0gLSAwIDFcIixcclxuXCI3ci8xcDNiazEvMVBwMnAyLzNwMnAxLzNQMW5xMS8xUVBOUjFQMS81UDIvNUJLMSBiIC0gLSAwIDFcIixcclxuXCJybjFxM3IvcHAya3BwcC8zTnAzLzJiMW4zLzNOMlExLzNCNC9QUDRQUC9SMUIyUksxIHcgLSAtIDAgMVwiLFxyXG5cIjJya3IzLzNiMXAxUi8zUjFQMi8xcDJRMVAxL3BQcTUvUDFONS8xS1A1LzggdyAtIC0gMCAxXCIsXHJcblwicjFicTFyazEvNG5wMXAvMXAzUnBCL3AxUTUvMkJwNC8zUDQvUFBQM1BQL1I1SzEgdyAtIC0gMCAxXCIsXHJcblwiMXJiazFyMi9wcDRSMS8zTnAzLzNwMnAxLzZxMS9CUDJQMy9QMlAyQjEvMlIzSzEgdyAtIC0gMCAxXCIsXHJcblwiMms0ci8xcjFxMnBwL1FCcDJwMi8xcDYvOC84L1A0UFBQLzJSM0sxIHcgLSAtIDAgMVwiLFxyXG5cInIxcXIzay8zUjJwMS9wM1EzLzFwMnAxcDEvM2JOMy84L1BQM1BQUC81UksxIHcgLSAtIDAgMVwiLFxyXG5cIjJycjNrLzFwMWIxcHExLzRwTnAxL1BwMlEycC8zUDQvN1IvNVBQUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BiMm5wcDEvMXBxNHAvNXAyLzVCMi8xQjYvUDJSUTFQUC8ycjFSMksgYiAtIC0gMCAxXCIsXHJcblwicjNSbmtyLzFiNXAvcDNOcEIxLzNwNC8xcDYvOC9QUFAzUDEvMksyUjIgdyAtIC0gMCAxXCIsXHJcblwiNHIxazEvM3IxcDFwL2JxcDFuMy9wMnAxTlAxL1BuMVExYjIvN1AvMVBQM0IxL1IyTlIySyB3IC0gLSAwIDFcIixcclxuXCI3ci82a3IvcDVwMS8xcE5iMXBxMS9QUHBQcDMvNFAxYjEvUjNSMVExLzJCMkJLMSBiIC0gLSAwIDFcIixcclxuXCIycjRrL3BwcWJwUTFwLzNwMWJwQi84LzgvMU5yMlAyL1BQUDNQMS8yS1IzUiB3IC0gLSAwIDFcIixcclxuXCIycjFrMnIvMXAycHAxcC8xcDJiMXBRLzRCMy8zbjQvMnFCNC9QMVAyUFBQLzJLUlIzIGIgLSAtIDAgMVwiLFxyXG5cIjFyMXI0L1JwMm5wMi8zazQvM1AzcC8yUTJwMi8yUDRxLzFQMU4xUDFQLzZSSyB3IC0gLSAwIDFcIixcclxuXCJyMWIycmsxL3AzUnAxcC8zcTJwUS8ycHAyQjEvM2I0LzNCNC9QUFAyUFBQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjZyay82cHAvMnAycDIvMkIyUDFxLzFQMlBiMi8xUTVQLzJQMlAyLzNSM0sgdyAtIC0gMCAxXCIsXHJcblwicm5icTFiMXIvcHA0a3AvNW5wMS80cDJRLzJCTjFSMi80QjMvUFBQTjJQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjFyMWtyMy9OYnBwbjFwcC8xYjYvOC82UTEvM0IxUDIvUHEzUDFQLzNSUjFLMSB3IC0gLSAwIDFcIixcclxuXCIzcjJrMS8xYjJRcDIvcHFucDNiLzFwbjUvM0IzcC8xUFI0UC9QNFBQMS8xQjRLMSB3IC0gLSAwIDFcIixcclxuXCI0azFyMS81cDIvcDFxNS8xcDJwMnAvNm4xL1A0YlExLzFQNFJQLzNOUjFCSyBiIC0gLSAwIDFcIixcclxuXCIxazVyL3BwMVExcHAxLzJwNHIvYjRQbjEvM05QcDIvMlAyUDIvMXE0QjEvMVIyUjFLMSBiIC0gLSAwIDFcIixcclxuXCJrMnIzci9wM1JwcHAvMXA0cTEvMVAxYjQvM1ExQjIvNk4xL1BQM1BQUC82SzEgdyAtIC0gMCAxXCIsXHJcblwiNHJrMXIvcDJiMXBwMS8xcTVwLzNwUjFuMS8zTjFwMi8xUDFRMVAyL1BCUDNQSy80UjMgdyAtIC0gMCAxXCIsXHJcblwicjFicTFyazEvcHAxbmIxcHAvNXAyLzZCMS8zcFEzLzNCUE4yL1BQM1BQUC9SNFJLMSB3IC0gLSAwIDFcIixcclxuXCJrYjNSMi8xcDVyLzVwMi8xUDFRNC9wNVAxL3E3LzVQMi80UksyIHcgLSAtIDAgMVwiLFxyXG5cInJuMXI0L3BwMnAxYjEvNWtwcC9xMVBRMWIyLzZuMS8yTjJOMi9QUFAzUFAvUjFCMlJLMSB3IC0gLSAwIDFcIixcclxuXCJycjJrMy81cDIvcDFicHBQcFEvMnAxbjFQMS8xcTJQQjIvMk40Ui9QUDRCUC82SzEgdyAtIC0gMCAxXCIsXHJcblwicjVrMS8yUmIzci9wMnAzYi9QMlBwMy80UDFwcS81cDIvMVBRMkIxUC8yUjJCS04gYiAtIC0gMCAxXCIsXHJcblwicjFicXIzL3BwcDFCMWtwLzFiNHAxL24yQjQvM1BRMVAxLzJQNS9QNFAyL1JONEsxIHcgLSAtIDAgMVwiLFxyXG5cIjNyNC80UlJway81bjFOLzgvcDFwMnFQUC9QMVFwMVAyLzFQNEsxLzNiNCB3IC0gLSAwIDFcIixcclxuXCIycnIyazEvMWIxcTJwMS9wMlBwMVFwLzFwbjFQMlAvMnA1LzgvUFAzUFAxLzFCUjJSSzEgdyAtIC0gMCAxXCIsXHJcblwiMXIzcjFrLzZSMS8xcDJRcDFwL3AxcDROLzNwUDMvM1AxUDIvUFAycTJQLzVSMUsgdyAtIC0gMCAxXCIsXHJcblwiNHIzL3AxcjJwMWsvMXAycFBwcC8ycXBQMy8zUjJQMS8xUFBRM1IvMVA1UC83SyB3IC0gLSAwIDFcIixcclxuXCIxUjRuci9wMWsxcHBiMS8ycDRwLzRQcDIvM04xUDFCLzgvcTFQM1BQLzNRMksxIHcgLSAtIDAgMVwiLFxyXG5cIjJSMmJrMS81cnIxL3AzUTJSLzNQcHEyLzFwM3AyLzgvUFAxQjJQUC83SyB3IC0gLSAwIDFcIixcclxuXCI0cjJrLzRRMWJwLzRCMXAxLzFxMm4zLzRwTjIvUDFCM1AxLzRwUDFQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJycTFyMWsvMWIyYnAxcC9wMW5wcHAxUS8xcDNQMi80UDFQUC8yTjJOMi9QUFA1LzFLMVIxQjFSIHcgLSAtIDAgMVwiLFxyXG5cIjNyMmsxL3BwNXAvNnAxLzJQcHEzLzROcjIvNEIyYi9QUDJQMksvUjFRMVIyQiBiIC0gLSAwIDFcIixcclxuXCJyMkJrMnIvcGIxbjFwUTEvM25wMy8xcDJQMy8ycDNLMS8zcDQvUFAxYjFQUFAvUjRCMVIgYiAtIC0gMCAxXCIsXHJcblwiNHIxazEvM24xcHBwLzRyMy8zbjNxL1EyUDQvNVAyL1BQMkJQMVAvUjFCMVIxSzEgYiAtIC0gMCAxXCIsXHJcblwicjFuazNyLzJiMnBwcC9wM2IzLzNOTjMvUTJQM3EvQjJCNC9QNFBQUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCI0TjFuay9wNVIxLzRiMnAvM3BQcDFRLzJwQjFQMUsvMlAzUFAvN3IvMnE1IHcgLSAtIDAgMVwiLFxyXG5cIjdrL3BicDNicC8zcDQvMXA1cS8zbjJwMS81ckIxL1BQMU5yTjFQLzFRMUJSUksxIGIgLSAtIDAgMVwiLFxyXG5cIjNuMmIxLzFwcjFyMmsvcDFwMXBRcHAvUDFQNS8yQlAxUFAxLzVLMi8xUDVSLzggdyAtIC0gMCAxXCIsXHJcblwiNHJrMi8xYnEycDFRLzNwMWJwMS8xcDFuMk4xLzRQQjIvMlBwM1AvMVAxTjQvNVJLMSB3IC0gLSAwIDFcIixcclxuXCJiNHJrMS9wNHAyLzFwNFBxLzRwMy84L1AxTjJQUTEvQlAzUEsxLzggdyAtIC0gMCAxXCIsXHJcblwiM3IxcjIvcHBiMXFCcGsvMnBwMVIxcC83US80UDMvMlBQMlAxL1BQNEtQLzVSMiB3IC0gLSAwIDFcIixcclxuXCI0cjMvNXAxay8ycDFuQnBwL3EycDQvUDFiUDQvMlAxUjJRLzJCMlBQUC82SzEgdyAtIC0gMCAxXCIsXHJcblwiNnIxL3BwM04xay8xcTJiUXBwLzNwUDMvOC82UlAvUFAzUFAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCIycjFyazIvMWIyYjFwMS9wMXEyblAxLzFwMlEzLzRQMy9QMU4xQjMvMVBQMUIyUi8ySzRSIHcgLSAtIDAgMVwiLFxyXG5cImJyMXFyMWsxL2IxcG5ucDIvcDJwMnAxL1A0UEIxLzNOUDJRLzJQM04xL0I1UFAvUjNSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIycjQvcHAycHBrcC8yUDNwMS9xMXA1LzRQUTIvMlAyYjIvUDRQUFAvMlIxS0IxUiBiIC0gLSAwIDFcIixcclxuXCI2azEvNXBwMS8xcHE0cC9wM1AzL1A0UDIvMlAxUTFQSy83UC9SMUJyM3IgYiAtIC0gMCAxXCIsXHJcblwicjFiMmsxci9wcHBwNC8xYlAycXAxLzVwcDEvNHBQMi8xQlA1L1BCUDNQUC9SMlExUjFLIGIgLSAtIDAgMVwiLFxyXG5cInIxYjFubjFrL3AzcDFiMS8xcXAxQjFwMS8xcDFwNC8zUDNOLzJOMUIzL1BQUDNQUC9SMlExSzIgdyAtIC0gMCAxXCIsXHJcblwicm5iMnJrMS9wcHAycWIxLzZwUS8ycE4xcDIvOC8xUDNCUDEvUEIyUFAxUC9SNFJLMSB3IC0gLSAwIDFcIixcclxuXCI1cmtyL3BwMlJwMi8xYjFwMVBiMS8zUDJRMS8ybjNQMS8ycDUvUDRQMi80UjFLMSB3IC0gLSAwIDFcIixcclxuXCJybjFrM3IvMWIxcTFwcHAvcDJQNC8yQjJwMi84LzFRTkJSMy9QUDNQUFAvMlIzSzEgdyAtIC0gMCAxXCIsXHJcblwicm5iMnIxay9wcDJxMnAvMnAyUjIvOC8yQnAzUS84L1BQUDNQUC9STjRLMSB3IC0gLSAwIDFcIixcclxuXCIzazQvMXBwM2IxLzRiMnAvMXAzcXAxLzNQbjMvMlAxUk4yL3I1UDEvMVEyUjFLMSBiIC0gLSAwIDFcIixcclxuXCJyMWJuazJyL3BwcHAxcHBwLzFiNHExLzRQMy8yQjFOMy9RMVBwMU4yL1A0UFBQL1IzUjFLMSB3IC0gLSAwIDFcIixcclxuXCIycTUvcDNwMmsvM3BQMXAxLzJyTjJQbi8xcDFRNC83Ui9QUHI1LzFLNVIgdyAtIC0gMCAxXCIsXHJcblwiMnIxcjMvcHAxbmJOMi80cDMvcTcvUDFwUDJuay8yUDJQMi8xUFE1L1IzUjFLMSB3IC0gLSAwIDFcIixcclxuXCI2azEvcDFwM3BwLzZxMS8zcHIzLzNObjMvMVFQMUIxUGIvUFAzcjFQL1IzUjFLMSBiIC0gLSAwIDFcIixcclxuXCI2azEvNXAyL3A1bjEvOC8xcDFwMlAxLzFQYjJCMXIvUDNLUE4xLzJSUTNxIGIgLSAtIDAgMVwiLFxyXG5cIjRyMXIxL3BiMVEyYnAvMXAxUm5rcDEvNXAyLzJQMVAzLzRCUDIvcVAyQjFQUC8yUjNLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJxcjFrMS9wcHAycHAxLzNwNC80bjFOUS8yQjFQTjIvOC9QNFBQUC9iNFJLMSB3IC0gLSAwIDFcIixcclxuXCI2azEvcDJyUjFwMS8xcDFyMXAxUi8zUDQvNFFQcTEvMVA2L1A1UEsvOCB3IC0gLSAwIDFcIixcclxuXCJyNXJrL3BwMnFiMXAvMnAycG4xLzJicDQvM3BQMVExLzFCMVAxTjFSL1BQUDNQUC9SMUIzSzEgdyAtIC0gMCAxXCIsXHJcblwicjJxMWJrMS81bjFwLzJwM3BQL3A3LzNCcjMvMVAzUFFSL1A1UDEvMktSNCB3IC0gLSAwIDFcIixcclxuXCIycjJuMWsvMnEzcHAvcDJwMWIyLzJuQjFQMi8xcDFONC84L1BQUDRRLzJLM1JSIHcgLSAtIDAgMVwiLFxyXG5cIjFSNFExLzNucjFwcC8zcDFrMi81QmIxLzRQMy8ycTFCMVAxLzVQMVAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjVrMXIvM2I0LzNwMXAyL3A0UHFwLzFwQjUvMVA0cjEvUDFQNS8xSzFSUjJRIHcgLSAtIDAgMVwiLFxyXG5cIlE3L3AxcDFxMXBrLzNwMnJwLzRuMy8zYlAzLzdiL1BQM1BQSy9SMUIyUjIgYiAtIC0gMCAxXCIsXHJcblwiN3IvcDNwcGsxLzNwNC8ycDFQMUtwLzJQYjQvM1AxUVBxL1BQNVAvUjZSIGIgLSAtIDAgMVwiLFxyXG5cIjZrMS82cHAvcHAxcDNxLzNQNC9QMVEyYjIvMU5OMXIyYi8xUFA0UC82UksgYiAtIC0gMCAxXCIsXHJcblwiOC8yUTJwazEvM1BwMXAxLzFiNXAvMXAzUDFQLzFQMlBLMi82UlAvN3EgYiAtIC0gMCAxXCIsXHJcblwiMXIyazMvMnBuMXAyL3AxUWIzcC83cS8zUFAzLzJQMUJOMWIvUFAxTjFQcjEvUlI1SyBiIC0gLSAwIDFcIixcclxuXCI4LzVwMWsvM3AycTEvM1BwMy80UG4xci9SNFFiMS8xUDVCLzVCMUsgYiAtIC0gMCAxXCIsXHJcblwiMnIzazEvcHBxM3AxLzJuMnAxcC8ycHI0LzVQMU4vNlFQL1BQMlIxUDEvNFIySyB3IC0gLSAwIDFcIixcclxuXCI1azIvcjNwcDFwLzZwMS9xMXBQM1IvNUIyLzJiM1BQL1BRM1BLMS9SNyB3IC0gLSAwIDFcIixcclxuXCJyMWIyazIvMXAxcDFyMUIvbjRwMi9wMXFQcDMvMlA0Ti80UDFSMS9QUFEzUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCIycjFrMy8zbjFwMi82cDEvMXAxUWIzLzFCMk4xcTEvMlAxcDMvUDRQUDEvMktSNCB3IC0gLSAwIDFcIixcclxuXCI1cmsxLzJwYjFwcHAvcDJyNC8xcDFQcDMvNFBuMXEvMUIxUE5QMi9QUDFRMVAxUC9SNVJLIGIgLSAtIDAgMVwiLFxyXG5cIjNuYnIyLzRxMnAvcjNwUnBrL3AycFFSTjEvMXBwUDJwMS8yUDUvUFBCNFAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjVyazEvcHAxcXBSMi82UHAvM3BwTmJRLzJuUDQvQjFQNS9QNVBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCI1azIvcHBxclJCMi8zcjFwMi8ycDJwMi83UC9QMVBQMlAxLzFQMlFQMi82SzEgdyAtIC0gMCAxXCIsXHJcblwiOC9rcDFSNC8ycTJwMXAvM1FiMlAvcDcvUDVQMS9LUDYvTjFyNSBiIC0gLSAwIDFcIixcclxuXCI0cmsyL3BwMk4xYlEvNXAyLzgvMnE1L1A3LzNyMlBQLzRSUjFLIHcgLSAtIDAgMVwiLFxyXG5cInI0cjFrLzFwM3AxcC9wcDFwMXAyLzRxTjFSL1BQMlAxbjEvNlExLzVQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyNGIxci9wcDFuMmsxLzFxcDFwMnAvM3BQMXBRLzFQNi8yQlAyTjEvUDRQUFAvUjRSSzEgdyAtIC0gMCAxXCIsXHJcblwiNnJrL1EybjJycC81cDIvM1A0LzRQMy8ycTRQL1A1UDEvNVJSSyBiIC0gLSAwIDFcIixcclxuXCIyazRyL3BwcDUvNGJxcDEvM3AyUTEvNm4xLzJOQjNQL1BQUDJiUDEvUjFCMlIxSyBiIC0gLSAwIDFcIixcclxuXCJybmIyYjFyL3BwcDFuMWtwLzNwMXEyLzdRLzRQQjIvMk41L1BQUDNQUC9SNFJLMSB3IC0gLSAwIDFcIixcclxuXCIxcjJyMmsvMXExbjFwMXAvcDFiMXBwMi8zcFAzLzFiNVIvMk4xQkJRMS8xUFAzUFAvM1IzSyB3IC0gLSAwIDFcIixcclxuXCIzcjFyMWsvcDRwMXAvMXBwMnAyLzJiMlAxUS8zcTFQUjEvMVBOMlIxUC8xUDRQMS83SyB3IC0gLSAwIDFcIixcclxuXCJyMWIxcjFrMS9wMXEzcDEvMXBwMXBuMXAvOC8zUFEzL0IxUEI0L1A1UFAvUjRSSzEgdyAtIC0gMCAxXCIsXHJcblwiazcvNHJwMXAvcDFxM3AxL1ExcjJwMi8xUjYvOC9QNVBQLzFSNUsgdyAtIC0gMCAxXCIsXHJcblwicjFiMnIyL3AxcTFucGtCLzFwbjFwMXAxLzJwcFAxTjEvM1A0L1AxUDJRMi8yUDJQUFAvUjFCMlJLMSB3IC0gLSAwIDFcIixcclxuXCJybmIza3IvcHBwMnBwcC8xYjYvM3E0LzNwTjMvUTROMi9QUFAyS1BQL1IxQjFSMyB3IC0gLSAwIDFcIixcclxuXCIzcTFyMWsvMnA0cC8xcDFwQnJwMS9wMlBwMy8yUG5QMy81UFAxL1BQMVEySzEvNVIxUiB3IC0gLSAwIDFcIixcclxuXCI1cmsxLzFSNGIxLzNwNC8xUDFQNC80UHAyLzNCMVBuYi9QcVJLMVEyLzggYiAtIC0gMCAxXCIsXHJcblwicjRyazEvMXEyYnAxcC81UnAxL3BwMVBwMy80QjJRL1AyUjQvMVBQM1BQLzdLIHcgLSAtIDAgMVwiLFxyXG5cIjROcjFrLzFicDJwMXAvMXI0cDEvM1A0LzFwMXExUDFRLzRSMy9QNVBQLzRSMksgdyAtIC0gMCAxXCIsXHJcblwiNGtiMVEvNXAyLzFwNi8xSzFONC8yUDJQMi84L3E3LzggdyAtIC0gMCAxXCIsXHJcblwiNHIzL3A0cGtwL3E3LzNCYmIyL1AyUDFwcFAvMk4zbjEvMVBQMktQUi9SMUJRNCBiIC0gLSAwIDFcIixcclxuXCJyNHJrMS8zUjNwLzFxMnBRcDEvcDcvUDcvOC8xUDVQLzRSSzIgdyAtIC0gMCAxXCIsXHJcblwicjZrLzFwNXAvMnAxYjFwQi83Qi9wMVAxcTJyLzgvUDVRUC8zUjJSSyBiIC0gLSAwIDFcIixcclxuXCIya3Izci8xcHAycHBwL3BicDRuLzVxMi8xUFA1LzJRNS9QQjNQUFAvUk4zUksxIGIgLSAtIDAgMVwiLFxyXG5cIjgvNG4yay9iMVBwMnAxLzNQcHAxcC9wMnFQMy8zQjFQMi9RMk5LMVBQLzNSNCBiIC0gLSAwIDFcIixcclxuXCIycTFybmsxL3A0cjIvMXAzcHAxLzNQM1EvMmJQcDJCLzJQNFIvUDFCM1BQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInI1azEvMnAycHBwL3AxUDJuMi84LzFwUDJiYlEvMUIzUFAxL1BQMVBxMlAvUk5CM0sxIGIgLSAtIDAgMVwiLFxyXG5cInIxYjUvNXAyLzVOcGsvcDFwUDJxMS80UDJwLzFQUTJSMVAvNlAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyMnExcmsxL3A0cDFwLzNwMVEyLzJuM0IxL0IyUjQvOC9QUDNQUFAvNWJLMSB3IC0gLSAwIDFcIixcclxuXCJyNHIxay9wcDVwL241cDEvMXEyTnAxbi8xUGI1LzZQMS9QUTJQUEJQLzFSQjNLMSB3IC0gLSAwIDFcIixcclxuXCIxbjFOMnJrLzJRMnBiMS9wM3AycC9QcTJQMy8zUjQvNkIxLzFQM1AxUC82SzEgdyAtIC0gMCAxXCIsXHJcblwiYm41ay83cC9wMnAycjEvMXAycDMvNXAyLzJQNHEvUFAxQjFRUFAvNE4xUksgYiAtIC0gMCAxXCIsXHJcblwicm5iM2tiL3BwNXAvNHAxcEIvcTFwMnBOMS8ycjFQUTIvMlA1L1A0UFBQLzJSMlJLMSB3IC0gLSAwIDFcIixcclxuXCIzcmtiMXIvcHBuMnBwMS8xcXAxcDJwLzRQMy8yUDRQLzNRMk4xL1BQMUIxUFAxLzFLMVIzUiB3IC0gLSAwIDFcIixcclxuXCI4LzVwcmsvcDVyYi9QM04yUi8xcDFQUTJwLzdQLzFQM1JQcS81SzIgdyAtIC0gMCAxXCIsXHJcblwiM3EycjEvcDJiMWsyLzFwbkJwMU4xLzNwMXBRUC82UDEvNVIyLzJyMlAyLzRSSzIgdyAtIC0gMCAxXCIsXHJcblwicjFiMnJrMS9wcDJiMXBwL3EzcG4yLzNuTjFOMS8zcDQvUDJRNC8xUDNQUFAvUkJCMVIxSzEgdyAtIC0gMCAxXCIsXHJcblwiazcvMXAxcnIxcHAvcFIxcDFwMi9RMXBxNC9QNy84LzJQM1BQLzFSNEsxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjJyazEvcHBwcGJwcDEvN3AvNFIzLzZRcS8yQkI0L1BQUDJQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCI0a2Ixci8xUjYvcDJycDMvMlExcDFxMS80cDMvM0I0L1A2UC80S1IyIHcgLSAtIDAgMVwiLFxyXG5cInFyM2Ixci9RNXBwLzNwNC8xa3A1LzJObjFCMi9QcDYvMVAzUFBQLzJSMVIxSzEgdyAtIC0gMCAxXCIsXHJcblwicjFicTFyazEvcDNiMW5wLzFwcDJwcFEvM25CMy8zUDQvMk5CMU4xUC9QUDNQUDEvM1IxUksxIHcgLSAtIDAgMVwiLFxyXG5cInI0a3IxL3BiTm4xcTFwLzFwNi8ycDJCUFEvNUIyLzgvUDZQL2I0UksxIHcgLSAtIDAgMVwiLFxyXG5cIjNyMWsyL3IxcTJwMVEvcHAyQjMvNFAzLzFQMXA0LzJONS9QMVAzUFAvNVIxSyB3IC0gLSAwIDFcIixcclxuXCIxUTYvNXBwMS8xQjJwMWsxLzNwUG4xcC8xYjFQNC8ycjNQTi8ycTJQS1AvUjcgYiAtIC0gMCAxXCIsXHJcblwiM3E0LzFwM3Axay8xUDFwclBwMS9QMXJObjFRcC84LzdSLzZQUC8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIycjIvNG5uMWsvMXEyUFExcC81cDIvcHA1Ui81TjIvNVBQUC81UksxIHcgLSAtIDAgMVwiLFxyXG5cIjZyay8xYjYvcDVwQi8xcTJQMlEvNHAyUC82UjEvUFA0UEsvM3I0IHcgLSAtIDAgMVwiLFxyXG5cIjgvMnI1LzFrNXAvMXBwNFAvOC9LMlA0L1BSMlFCMi8ycTUgYiAtIC0gMCAxXCIsXHJcblwiM3I0L3BrM3BxMS9OYjJwMnAvM240LzJRUDQvNlAxLzFQM1BCUC81UksxIHcgLSAtIDAgMVwiLFxyXG5cIjNxMXIyL3BiM3BwMS8xcDYvM3BQMU5rLzJyMlEyLzgvUG4zUFAxLzNSUjFLMSB3IC0gLSAwIDFcIixcclxuXCI1cXJrLzVwMW4vcHAzcDFRLzJwUHAzLzJQMVAxck4vMlA0Ui9QNVAxLzJCM0sxIHcgLSAtIDAgMVwiLFxyXG5cIjgvNnBrL3BiNXAvOC8xUDJxUDIvUDNwMy8ycjJQTlAvMVFSM0sxIGIgLSAtIDAgMVwiLFxyXG5cInJuM3JrMS8xcDNwQjEvcDRiMi9xNFAxcC82UTEvMUI2L1BQcDJQMVAvUjFLM1IxIHcgLSAtIDAgMVwiLFxyXG5cImIzbjFrMS81cFAxLzJONS9wcDFQNC80QmIyL3FQNFFQLzVQMUsvOCB3IC0gLSAwIDFcIixcclxuXCI0YjFrMS8ycjJwMi8xcTFwblBwUS83cC9wM1AyUC9wTjVCL1AxUDUvMUsxUjJSMSB3IC0gLSAwIDFcIixcclxuXCI0cjJrL3BwMnEyYi8ycDJwMVEvNHJQMi9QNy8xQjVQLzFQMlIxUjEvN0sgdyAtIC0gMCAxXCIsXHJcblwicjJyMmsxLzFxNHAxL3BwYjNwMS8yYk5wMy9QMVE1LzFONVIvMVA0QlAvbjZLIHcgLSAtIDAgMVwiLFxyXG5cIjZyay8xcHFiYnAxcC9wM3AyUS82UjEvNE4xblAvM0I0L1BQUDUvMktSNCB3IC0gLSAwIDFcIixcclxuXCJyNWsxLzFiMnExcDEvcDJicDFRcC8xcHA1L1A1UDEvM0I0LzFQUDJQMVAvUjRSSzEgYiAtIC0gMCAxXCIsXHJcblwicjNyMW4xL3BwM3BrMS8ycTJwMXAvUDJOUDMvMnAxUVAyLzgvMVA1UC8xQjFSM0sgdyAtIC0gMCAxXCIsXHJcblwiM3IxcjFrL3EybjNwL2IxcDJwcFEvcDFuMXAzL1BwMlAzLzFCMVBCUjIvMVBQTjJQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cInIzcjFrMS83cC8ycFJSMXAxL3A3LzJQNS9xblExUDFQMS82QlAvNksxIHcgLSAtIDAgMVwiLFxyXG5cInJrNi9ONHBwcC9RcDJxMy8zcDQvOC84LzVQUFAvMlIzSzEgdyAtIC0gMCAxXCIsXHJcblwicjRiMXIvcHBwcTJwcC8ybjFiMWsxLzNuNC8yQnA0LzVRMi9QUFAyUFBQL1JOQjFSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInI2ci9wcDNwazEvMnAyUnAxLzJwMVAyQi8zYlEzLzZQSy83UC82cTEgdyAtIC0gMCAxXCIsXHJcblwiNnJrL3AxcGIxcDFwLzJwcDFQMi8yYjFuMlEvNFBSMi8zQjQvUFBQMUsyUC9STkIzcTEgdyAtIC0gMCAxXCIsXHJcblwicm4zcmsxLzJxcDJwcC9wM1AzLzFwMWI0LzNiNC8zQjQvUFBQMVExUFAvUjFCMlIxSyB3IC0gLSAwIDFcIixcclxuXCIyUjNuay8zcjJiMS9wMnByMVExLzRwTjIvMVA2L1A2UC9xNy9CNFJLMSB3IC0gLSAwIDFcIixcclxuXCIxcjJxcmsxL3A0cDFwL2JwMXAxUXAxL24xcHBQMy9QMVA1LzJQQjFQTjEvNlBQL1I0UksxIHcgLSAtIDAgMVwiLFxyXG5cInI1azEvcDFwM2JwLzFwMXA0LzJQUDJxcC8xUDYvMVExYlAzL1BCM3JQUC9SMk4yUksgYiAtIC0gMCAxXCIsXHJcblwiNGszL3IyYm5uMXIvMXEycFIxcC9wMnBQcDFCLzJwUDFOMVAvUHBQMUIzLzFQNFExLzVLUjEgdyAtIC0gMCAxXCIsXHJcblwiMnEycjFrLzVRcDEvNHAxUDEvM3A0L3I2Yi83Ui81QlBQLzVSSzEgdyAtIC0gMCAxXCIsXHJcblwiNXIxay8xcTRicC8zcEIxcDEvMnBQbjFCMS8xcjYvMXA1Ui8xUDJQUFFQL1I1SzEgdyAtIC0gMCAxXCIsXHJcblwiNFEzLzFiNXIvMXAxa3AzLzVwMXIvM3AxbnExL1A0TlAxLzFQM1BCMS8yUjNLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIyazFyLzJxMWIzL3AzcHBCcC8ybjNCMS8xcDYvMk40US9QUFAzUFAvMktSUjMgdyAtIC0gMCAxXCIsXHJcblwiNnIxL3I1UFIvMnAzUjEvMlBrMW4yLzNwNC8xUDFOUDMvNEszLzggdyAtIC0gMCAxXCIsXHJcblwicjRxazEvMnA0cC9wMXAxTjMvMmJwUTMvNG5QMi84L1BQUDNQUC81UjFLIGIgLSAtIDAgMVwiLFxyXG5cInIybjFyazEvMXBwYjJwcC8xcDFwNC8zUHBxMW4vMkIzUDEvMlA0UC9QUDFOMVAxSy9SMlExUk4xIGIgLSAtIDAgMVwiLFxyXG5cInIxYjJyazEvcHAxcDFwMXAvMm4zcFEvNXFCMS84LzJQNS9QNFBQUC80UlJLMSB3IC0gLSAwIDFcIixcclxuXCJyM3Eyay9wMm4xcjIvMmJQMXBwQi9iM3AyUS9OMVBwNC9QNVIxLzVQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCI2cjEvM3AycWsvNFAzLzFSNXAvM2IxcHJQLzNQMkIxLzJQMVFQMi82UksgYiAtIC0gMCAxXCIsXHJcblwiM3JyMmsvcHAxYjJiMS80cTFwcC8yUHAxcDIvM0I0LzFQMlFOUDEvUDZQL1I0UksxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjJyazEvMnAycHBwL3A3LzFwNi8zUDNxLzFCUDNiUC9QUDNRUDEvUk5CMVIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMXJiMlJSMS9wMXAzcDEvMnAzazEvNXAxcC84LzNOMVBQMS9QUDVyLzJLNSB3IC0gLSAwIDFcIixcclxuXCIzcTJyMS80bjJrL3AxcDFyQnBwL1BwUHBQcDIvMVAzUDFRLzJQM1IxLzdQLzFSNUsgdyAtIC0gMCAxXCIsXHJcblwiMmJxcjJrLzFyMW4yYnAvcHAxcEJwMi8ycFAxUFExL1AzUE4yLzFQNFAxLzFCNVAvUjNSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJyMmsyL3BiNGJRLzFwMXFyMXBSLzNwMXBCMS8zUHAzLzJQNS9QUEIyUFAxLzFLNVIgdyAtIC0gMCAxXCIsXHJcblwicjVrMS9xNHBwcC9yblIxcGIyLzFRMXA0LzFQMVA0L1A0TjFQLzFCM1BQMS8yUjNLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJybjMvcDFxNHAvcDFwMlAxay8yUHBQUHAxL1A3LzFRMkIyUC8xUDYvMUsxUjFSMiB3IC0gLSAwIDFcIixcclxuXCI3ay8ycDNwcC9wNy8xcDFwNC9QUDJwcjIvQjFQM3FQLzROMUIxL1IxUW4ySzEgYiAtIC0gMCAxXCIsXHJcblwiNXJrMS80UnAxcC8xcTFwQlFwMS81cjIvMXA2LzFQNFAxLzJuMlAyLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjJRNS9wcDJyazFwLzNwMnBxLzJiUDFyMi81UlIxLzFQMlAzL1BCM1AxUC83SyB3IC0gLSAwIDFcIixcclxuXCI1YjIvMXAzcnBrL3AxYjNScC80QjFSUS8zUDFwMVAvN3EvNVAyLzZLMSB3IC0gLSAwIDFcIixcclxuXCIzUnIyay9wcDRwYi8ycDRwLzJQMW4zLzFQMVEzUC80cjFxMS9QQjRCMS81UksxIGIgLSAtIDAgMVwiLFxyXG5cIjgvMlExUjFiay8zcjNwL3AyTjFwMVAvUDJQNC8xcDNQcTEvMVA0UDEvMUs2IHcgLSAtIDAgMVwiLFxyXG5cIjNyM2svMXAzUnBwL3Aybm4zLzNONC84LzFQQjFQUTFQL3E0UFAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCIzcjFrcjEvOC9wMnEycDEvMXAyUjMvMVE2LzgvUFBQNS8xSzRSMSB3IC0gLSAwIDFcIixcclxuXCIzcjNrLzFiMmIxcHAvM3BwMy9wM24xUDEvMXBQcVAyUC8xUDJOMlIvUDFRQjFyMi8yS1IzQiBiIC0gLSAwIDFcIixcclxuXCI1cmtyLzFwMlFwYnAvcHExUDQvMm5CNC81cDIvMk41L1BQUDRQLzFLMVJSMyB3IC0gLSAwIDFcIixcclxuXTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBbXHJcblwiMlI1LzRicHBrLzFwMXA0LzVSMVAvNFBRMi81UDIvcjRxMVAvN0sgdyAtIC0gMCAxXCIsXHJcblwiN3IvMXFyMW5OcDEvcDFrNHAvMXBCNS80UDFRMS84L1BQM1BQUC82SzEgdyAtIC0gMCAxXCIsXHJcblwicjFiMmsxci9wcHBwcTMvNU4xcC80UDJRLzRQUDIvMUI2L1BQNVAvbjJLMlIxIHcgLSAtIDAgMVwiLFxyXG5cIjJrcjFiMXIvcHBxNS8xbnAxcHAyL1AzUG4yLzFQM1AyLzJQMlFwMS82UDEvUk5CMVJCSzEgYiAtIC0gMCAxXCIsXHJcblwicjJxcmIyL3AxcG4xUXAxLzFwNE5rLzRQUjIvM240LzdOL1A1UFAvUjZLIHcgLSAtIDAgMVwiLFxyXG5cInIxYmszci9wcHBxMXBwcC81bjIvNE4xTjEvMkJwNC9CbjYvUDRQUFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMXJiMmsyLzFwcTNwUS9wUnBOcDMvUDFQMm4yLzNQMVAyLzRQMy82UFAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjFycjRrLzdwL3AzUXBwMS8zcDFQMi84LzFQMXEzUC9QSzRQMS8zQjNSIGIgLSAtIDAgMVwiLFxyXG5cIjJyMmJrMS9wYjNwcHAvMXA2L243L3EyUDQvUDFQMVIyUS9CMkIxUFBQL1I1SzEgdyAtIC0gMCAxXCIsXHJcblwicjRyazEvcHA0YjEvNnBwLzJwUDQvNXBLbi9QMkIyTjEvMVBRUDFQcTEvMVJCMlIyIGIgLSAtIDAgMVwiLFxyXG5cInI0cjFrL3AycDNwL2JwMU5wMy80UDMvMlAyblIxLzNCMXEyL1AxUFE0LzJLM1IxIHcgLSAtIDAgMVwiLFxyXG5cIjNyMmsxL3AxcDJwMi9icDJwMW5RLzRQQjFQLzJwcjNxLzZSMS9QUDNQUDEvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwicjJxMXJrMS9wcHAxbjFwMS8xYjFwMXAyLzFCMU4yQlEvM3BQMy8yUDNQMS9QUDNQMi9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjVyazEvcFI0cHAvNHAyci8ycDFuMnEvMlAxcDMvUDFRMVAxUDEvMVAzUDFQL1IxQjJOSzEgYiAtIC0gMCAxXCIsXHJcblwiOC9wMnBRMnAvMnAxcDJrLzRCcXAxLzJQMlAyL1A2UC82UEsvM3I0IHcgLSAtIDAgMVwiLFxyXG5cIjRyMWsxLzVwMXAvcDRQcFEvNHEzL1A2UC82UDEvM3AzSy84IGIgLSAtIDAgMVwiLFxyXG5cInIxYnIxYjIvNHBQazEvMXAxcTNwL3AyUFIzL1AxUDJOMi8xUDFRMlAxLzVQQksvNFIzIHcgLSAtIDAgMVwiLFxyXG5cIjdyLzNrYnAxcC8xUTNSMi8zcDNxL3AyUDNCLzFQNUsvUDZQLzggdyAtIC0gMCAxXCIsXHJcblwiMnI0Yi9wcDFrcHJOcC8zcE5wMVAvcTJQMnAxLzJuNS80QjJRL1BQUDNSMS8xSzFSNCB3IC0gLSAwIDFcIixcclxuXCJyNnIvcHAxUTJwcC8ycDRrLzRSMy81UDIvMnE1L1AxUDNQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJycXJiMi9wMm5rMy9icDJwblFwLzRCMXAxLzNQNC9QMU41LzFQM1BQUC8xQjFSUjFLMSB3IC0gLSAwIDFcIixcclxuXCI4L3BwMlExcDEvMnAza3AvNnExLzVuMi8xQjJSMlAvUFAxcjFQUDEvNksxIHcgLSAtIDAgMVwiLFxyXG5cImsxbjNyci9QcDNwMi8zcTQvM040LzNQcDJwLzFRMlAxcDEvM0IxUFAxL1I0UksxIHcgLSAtIDAgMVwiLFxyXG5cIjNyNC9wcDVRL0I3L2s3LzNxNC8yYjUvUDRQUFAvMVI0SzEgdyAtIC0gMCAxXCIsXHJcblwiNFJuazEvcHIzcHBwLzFwM3EyLzVOUTEvMnA1LzgvUDRQUFAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjRxazIvNnAxL3A3LzFwMVFwMy9yMVAyYjIvMUs1UC8xUDYvNFJSMiB3IC0gLSAwIDFcIixcclxuXCIzcjFyazEvcHBxbjNwLzFucGIxUDIvNUIyLzJQNS8yTjNCMS9QUDJRMVBQL1I1SzEgdyAtIC0gMCAxXCIsXHJcblwicjNyazIvNmIxL3EycFFCcDEvMU5wUDQvMW4yUFAyL25QNi9QM04xSzEvUjZSIHcgLSAtIDAgMVwiLFxyXG5cInI1azEvcHAycHBiMS8zcDQvcTNQMVFSLzZiMS9yMkIxcDIvMVBQNS8xSzRSMSB3IC0gLSAwIDFcIixcclxuXCIyYjUvM3FyMmsvNVExcC9QM0IzLzFQQjFQUHAxLzRLMVAxLzgvOCB3IC0gLSAwIDFcIixcclxuXCI2azEvNXBwMS9wM3AycC8zYlAyUC82UU4vOC9ycTRQMS8yUjRLIHcgLSAtIDAgMVwiLFxyXG5cIk4xYms0L3BwMXAxUXBwLzgvMmI1LzNuM3EvOC9QUFAyUlBQL1JOQjFyQksxIGIgLSAtIDAgMVwiLFxyXG5cInIzYnIxay9wcDVwLzRCMXAxLzROcFAxL1AyUG4zL3ExUFEzUi83UC8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCI2a3IvcHAycjJwL24xcDFQQjFRLzJxNS8yQjRQLzJOM3AxL1BQUDNQMS83SyB3IC0gLSAwIDFcIixcclxuXCIycjNyMS83cC9iM1Ayay9wMWJwMXAxQi9QMk4xUDIvMVA0UTEvMlA0UC83SyB3IC0gLSAwIDFcIixcclxuXCIxUTYvMVIzcGsxLzRwMnAvcDNuMy9QM1AyUC82UEsvcjVCMS8zcTQgYiAtIC0gMCAxXCIsXHJcblwiNXJrMS8xcDFuMmJwL3A3L1AyUDJwMS80UjMvNE4xUGIvMlFCMXExUC80UjJLIGIgLSAtIDAgMVwiLFxyXG5cIjFSNi81cXBrLzRwMnAvMVBwMUJwMVAvcjFuMlFQMS81UEsxLzRQMy84IHcgLSAtIDAgMVwiLFxyXG5cIjRrMXIxL3BwMmJwMi8ycDUvM1BQUDIvMXE2LzdyLzFQMlEyUC8yUlIzSyBiIC0gLSAwIDFcIixcclxuXCJyMWJrMXIyL3BwMW4ycHAvM05RMy8xUDYvOC8ybjJQQjEvcTFCM1BQLzNSMVJLMSB3IC0gLSAwIDFcIixcclxuXCJybjNyazEvcHAzcDIvMmIxcG5wMS80TjMvM3E0L1AxTkIzUi8xUDFRMVBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJrcjFiMXIvcHAzcHBwLzJwMWIycS80QjMvNFEzLzJQQjJSMS9QUFAyUFBQLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjNxcmsyL3AxcjJwcDEvMXAycGIyL25QMWJOMlEvM1BOMy9QNlIvNVBQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjVyMWsvMXA0cHAvcDJONC8zUXAzL1AybjFiUDEvNVAxcS8xUFAyUjFQLzRSMksgdyAtIC0gMCAxXCIsXHJcblwiNnIxL3A1YmsvNE4xcHAvMkIxcDMvNFEyTi84LzJQMktQUC9xNyB3IC0gLSAwIDFcIixcclxuXCI0cjFrMS81YnBwLzJwNS8zcHIzLzgvMUIzcFBxL1BQUjJQMi8yUjJRSzEgYiAtIC0gMCAxXCIsXHJcblwiNXIyL3BxNGsxLzFwcDFRbjIvMmJwMVBCMS8zUjFSMi8yUDNQMS9QNlAvNksxIHcgLSAtIDAgMVwiLFxyXG5cInIzazMvM2IzUi8xbjFwMWIxUS8xcDFQcFAxTi8xUDJQMVAxLzZLMS8yQjFxMy84IHcgLSAtIDAgMVwiLFxyXG5cIjVxcjEva3AyUjMvNXAyLzFiMU4xcDIvNVEyL1A1UDEvNkJQLzZLMSB3IC0gLSAwIDFcIixcclxuXCI3ay8xcDFQMVFwcS9wNnAvNXAxTi82TjEvN1AvUFAxcjFQUEsvOCB3IC0gLSAwIDFcIixcclxuXCIyYjNyay8xcTNwMXAvcDFwMXBQcFEvNE4zLzJwUDQvMlAxcDFQMS8xUDRQSy81UjIgdyAtIC0gMCAxXCIsXHJcblwicjJxcmsyL3A1YjEvMmIxcDFRMS8xcDFwUDMvMnAxbkIyLzJQMVAzL1BQM1AyLzJLUjNSIHcgLSAtIDAgMVwiLFxyXG5cInI0azIvMXBwM3ExLzNwMU5uUS9wM1AzLzJQM3AxLzgvUFA2LzJLNFIgdyAtIC0gMCAxXCIsXHJcblwicjVyay9wcDFucDFibi8ycHAycTEvM1AxYk4xLzJQMU4yUS8xUDYvUEIyUFBCUC8zUjFSSzEgdyAtIC0gMCAxXCIsXHJcblwicjRuMWsvcHBCbk4xcDEvMnAxcDMvNk5wL3EyYlAxYjEvM0I0L1BQUDNQUC9SNFExSyB3IC0gLSAwIDFcIixcclxuXCJyM25ya3EvcHAzcDFwLzJwM25RLzVOTjEvOC8zQlAzL1BQUDNQUC8yS1I0IHcgLSAtIDAgMVwiLFxyXG5cInIzUW5SMS8xYms1L3BwNXEvMmI1LzJwMVAzL1A3LzFCQjRQLzNSM0sgdyAtIC0gMCAxXCIsXHJcblwiMXI0azEvM2IycHAvMWIxcFAyci9wcDFQNC80cTMvOC9QUDRSUC8yUTJSMUsgYiAtIC0gMCAxXCIsXHJcblwicjJOcWIxci9wUTFicDFwcC8xcG4xcDMvMWsxcDQvMnAyQjIvMlA1L1BQUDJQUFAvUjNLQjFSIHcgLSAtIDAgMVwiLFxyXG5cInJxMnIxazEvMWIzcHAxL3AzcDFuMS8xcDRCUS84LzdSL1BQM1BQUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCIzcTFyMi82azEvcDJwUWIyLzRwUjFwLzRCMy8yUDNQMS9QNFBLMS84IHcgLSAtIDAgMVwiLFxyXG5cIjNSMXJrMS8xcHAycHAxLzFwNi84LzgvUDcvMXE0QlAvM1EySzEgdyAtIC0gMCAxXCIsXHJcblwicnFiMmJrMS8zbjJwci9wMXBwMlFwLzFwNi8zQlAyTi8yTjRQL1BQUDNQMS8yS1IzUiB3IC0gLSAwIDFcIixcclxuXCI1azFyLzRucHAxL3AzcDJwLzNuUDJQLzNQM1EvM040L3FCMktQUDEvMlI1IHcgLSAtIDAgMVwiLFxyXG5cInIzcjFrMS8xYjYvcDFucDFwcFEvNG4zLzRQMy9QTkI0Ui8yUDFCSzFQLzFxNiB3IC0gLSAwIDFcIixcclxuXCIyUTUvNHBwYmsvM3A0LzNQMU5QcC80UDMvNU5CMS81UFBLL3JxNiB3IC0gLSAwIDFcIixcclxuXCJyNmsvcGI0YnAvNVEyLzJwMU5wMi8xcUI1LzgvUDRQUFAvNFJLMiB3IC0gLSAwIDFcIixcclxuXCIzUTQvNmtwLzRxMXAxLzJwbk4yUC8xcDNQMi8xUG4zUDEvNkJLLzggdyAtIC0gMCAxXCIsXHJcblwicjNxMWsxLzVwMi8zUDJwUS9QcHA1LzFwbmJOMlIvOC8xUDRQUC81UjFLIHcgLSAtIDAgMVwiLFxyXG5cIjJyMmIxay9wMlEzcC9iMW4yUHBQLzJwNS8zcjFCTjEvM3EyUDEvUDRQQjEvUjNSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIycjJrMS8xcTJicEIxL3BwMXAxUEJwLzgvUDcvN1EvMVBQM1BQL1I2SyB3IC0gLSAwIDFcIixcclxuXCJyM3Iyay9wYjFuM3AvMXAxcTFwcDEvNHAxQjEvMkJQM1EvMlAxUjMvUDRQUFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMnJyMmsxLzFiM3AxcC8xcDFiMnAxL3AxcVAzUS8zUjQvMVA2L1BCM1BQUC8xQjJSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJyNS8zbmJrcDEvMnExcDFwMS8xcDFuMlAxLzNQNC8ycDFQMU5RLzFQMUIxUDIvMUI0S1IgdyAtIC0gMCAxXCIsXHJcblwicm5icXIxazEvcHBwM3AxLzRwUjFwLzRwMlEvM1A0L0IxUEI0L1AxUDNQUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cImIzcjFrMS9wNFJiTi9QM1AxcDEvMXA2LzFxcDRQLzRRMVAxLzVQMi81QksxIHcgLSAtIDAgMVwiLFxyXG5cInExcjJiMWsvcmI0bnAvMXAycDJOL3BCMW40LzZRMS8xUDJQMy9QQjNQUFAvMlJSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjVyYmsvMnBxM3AvNVBRUi9wNy8zcDNSLzFQNE4xL1A1UFAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjJyMWsyci9wUjJwMWJwLzJuMVAxcDEvOC8yUVA0L3EyYjFOMi9QMkIxUFBQLzRLMlIgdyAtIC0gMCAxXCIsXHJcblwiazJuMXExci9wMXBCMnAxL1A0cFAxLzFRcDFwMy84LzJQMUJiTjEvUDcvMktSNCB3IC0gLSAwIDFcIixcclxuXCI0cjMvcDJyMXAxay8zcTFCcHAvNFAzLzFQcHBSMy9QNVAxLzVQMVAvMlEzSzEgdyAtIC0gMCAxXCIsXHJcblwiMnJyMWsyL3BiNHAxLzFwMXFwcDIvNFIyUS8zbjQvUDFONS8xUDNQUFAvMUIyUjFLMSB3IC0gLSAwIDFcIixcclxuXCIxcjJxMy8xUjYvM3Axa3AxLzFwcEJwMWIxL3AzUHAyLzJQUDQvUFAzUDIvNUsxUSB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BwMlJwcHAvbnFwNS84LzVRMi82UEIvUFBQMlAxUC82SzEgdyAtIC0gMCAxXCIsXHJcblwicjJxazJyL3BiNHBwLzFuMlBiMi8yQjJRMi9wMXA1LzJQNS8yQjJQUFAvUk4yUjFLMSB3IC0gLSAwIDFcIixcclxuXCJyMWJxM3IvcHBwMWIxa3AvMm4zcDEvM0IzUS8zcDQvOC9QUFAyUFBQL1JOQjJSSzEgdyAtIC0gMCAxXCIsXHJcblwiMnE0ay81cE5QL3AycDFCcFAvNHAzLzFwMmIzLzFQNi9QMXIyUjIvMUs0UTEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzJyQjFwMi9SQjFwMnBiLzNQcDJwLzRQMy8zSzJOUS81UHExLzggYiAtIC0gMCAxXCIsXHJcblwiMmJrNC82YjEvMnBOcDMvcjFQcFAxUDEvUDFwUDFRMi8ycnE0LzdSLzZSSyB3IC0gLSAwIDFcIixcclxuXCI1YmsxLzFRM3AyLzFOcDRwLzZwMS84LzFQMlAxUEsvNHEyUC84IGIgLSAtIDAgMVwiLFxyXG5cIjVyazEvMXAxcTJicC9wMnBOMXAxLzJwUDJCbi8yUDNQMS8xUDYvUDRRS1AvNVIyIHcgLSAtIDAgMVwiLFxyXG5cIjNyM3IvcDFwcXBwYnAvMWtOM3AxLzJwblAzL1E1YjEvMU5QNS9QUDNQUFAvUjFCMlJLMSB3IC0gLSAwIDFcIixcclxuXCIxUTFSNC81azIvNnBwLzJOMWJwMi8xQm41LzJQMlAxUC8xcjNQSzEvOCBiIC0gLSAwIDFcIixcclxuXCIycjFyazIvcDFxM3BRLzRwMy8xcHBwUDFOMS83cC80UDJQL1BQM1AyLzFLNFIxIHcgLSAtIDAgMVwiLFxyXG5cIjRxMy9wYjVwLzFwMnAyay80TjMvUFAxUVAzLzJQMlBQMS82SzEvOCB3IC0gLSAwIDFcIixcclxuXCIyYnExazFyL3I1cHAvcDJiMVBuMS8xcDFRNC8zUDQvMUI2L1BQM1BQUC8yUjFSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjNyM2svNnBwL3AzUW4yL1AzTjMvNHEzLzJQNFAvNVBQMS82SzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzZwMS9wNXAxLzNwQjMvMXAxYjQvMnIxcTFQUC9QNFIxSy81UTIgdyAtIC0gMCAxXCIsXHJcblwiM3IxYjIvM1AxcDIvcDNycGtwLzJxMk4yLzVRMVIvMlAzQlAvUDVQSy84IHcgLSAtIDAgMVwiLFxyXG5cIjFxNXIvMWIxcjFwMWsvMnAxcFBwYi9wMVBwNC8zQjFQMVEvMVA0UDEvUDRLQjEvMlJSNCB3IC0gLSAwIDFcIixcclxuXCI0cjFyay9wUTJQMnAvUDcvMnBxYjMvM3AxcDIvOC8zQjJQUC80UlJLMSBiIC0gLSAwIDFcIixcclxuXCIxcjJScjIvM1AxcDFrLzVScHAvcXA2LzJwUTQvN1AvNVBQSy84IHcgLSAtIDAgMVwiLFxyXG5cInIxYmsybnIvcHBwMnBwcC8zcDQvYlEzcTIvM3A0L0IxUDUvUDNCUFBQL1JOMUtSMyB3IC0gLSAwIDFcIixcclxuXCJyNGtyMS8xYjJSMW4xL3BxNHAxLzRRMy8xcDRQMS81UDIvUFBQNFAvMUsyUjMgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzVwMi80blExUC9wNE4yLzFwMWI0LzdLL1BQM3IyLzggdyAtIC0gMCAxXCIsXHJcblwiMnIycmsxL3BwM25icC8ycDFicTIvMlBwNC8xUDFQMVBQMS9QMU5CNC8xQlFLNC83UiB3IC0gLSAwIDFcIixcclxuXCI1azIvNnIxL3A3LzJwMVAzLzFwMlEzLzgvMXE0UFAvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwicjJxNC9wcDFycFFiay8zcDJwMS8ycFBQMnAvNVAyLzJONS9QUFAyUDIvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwiNFIzLzFwNHJrLzZwMS8ycFFCcFAxL3AxUDFwUDIvUHE2LzFQNi9LNyB3IC0gLSAwIDFcIixcclxuXCIyYjJrMi8ycDJyMXAvcDJwUjMvMXAzUFExLzNxM04vMVA2LzJQM1BQLzVLMiB3IC0gLSAwIDFcIixcclxuXCJyMWIxcjMvcHBxMnBrMS8ybjFwMnAvYjcvM1BCMy8yUDJRMi9QMkIxUFBQLzFSM1JLMSB3IC0gLSAwIDFcIixcclxuXCIycjUvMms0cC8xcDJwcDIvMVAycXAyLzgvUTVQMS80UFAxUC9SNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjRxMXJrL3BiMmJwbnAvMnI0US8xcDFwMXBQMS80TlAyLzFQM1IyL1BCbjRQL1JCNEsxIHcgLSAtIDAgMVwiLFxyXG5cIjJyNGsvcDRyUnAvMXAxUjNCLzVwMXEvMlBuNC81cDIvUFA0UVAvMUI1SyB3IC0gLSAwIDFcIixcclxuXCJyMWIxa2Ixci9wcDJucHBwLzJwUTQvOC8ycTFQMy84L1AxUEIxUFBQLzNSSzJSIHcgLSAtIDAgMVwiLFxyXG5cIjJyMWIzLzFwcDFxcmsxL3AxbjFQMXAxLzdSLzJCMXAzLzRRMVAxL1BQM1BQMS8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BicHBxMWJOLzFwbjFwMVExLzZOMS8zUDQvOC9QUFAyUFAxLzJLNFIgdyAtIC0gMCAxXCIsXHJcblwicW4xcjFrMi8ycjFiMW5wL3BwMXBRMXAxLzNQMlAxLzFQUDJQMi83Ui9QQjRCUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCJyMnI0LzFwMWJuMnAvcG4ycHBrQi81cDIvNFBRTjEvNlAxL1BQcTJQQlAvUjJSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjNrMXIyLzJwYjQvMnAzUDEvMk5wMXAyLzFQNi80bk4xUi8yUDFxMy9RNUsxIHcgLSAtIDAgMVwiLFxyXG5cIjVyazEvcHBwM3BwLzgvM3BRMy8zUDJiMS81clBxL1BQMVAxUDIvUjFCQjFSSzEgYiAtIC0gMCAxXCIsXHJcblwicjZyLzFwMnBwMWsvcDFiMnExcC80cFAyLzZRUi8zQjJQMS9QMVAySzIvN1IgdyAtIC0gMCAxXCIsXHJcblwiMms0ci9wcHAycDIvMmIyQjIvN3AvNnBQLzJQMXExYlAvUFAzTjIvUjRRSzEgYiAtIC0gMCAxXCIsXHJcblwiMlFSNC82YjEvMXA0cGsvN3AvNW4xUC80cnEyLzVQMi81QksxIHcgLSAtIDAgMVwiLFxyXG5cInJuYjJiMXIvcDNrQnAxLzNwTm4xcC8ycFFOMy8xcDJQUDIvNEIzL1BxNVAvNEszIHcgLSAtIDAgMVwiLFxyXG5cIjJycTFuMVEvcDFyMmsyLzJwMXAxcDEvMXAxcFAzLzNQMnAxLzJONFIvUFBQMlAyLzJLNFIgdyAtIC0gMCAxXCIsXHJcblwicjJRMXExay9wcDVyLzRCMXAxLzVwMi9QNy80UDJSLzdQLzFSNEsxIHcgLSAtIDAgMVwiLFxyXG5cIjNrNC8ycDFxMXAxLzgvMVFQUHAycC80UHAyLzdQLzZQMS83SyB3IC0gLSAwIDFcIixcclxuXCI4LzFwM1FiMS9wNXBrL1AxcDFwMXAxLzFQMlAxUDEvMlAxTjJuLzVQMVAvNHFCMUsgdyAtIC0gMCAxXCIsXHJcblwiMXIzazIvM1JucDIvNnAxLzZxMS9wMUJRMXAyL1AxUDUvMVAzUFAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCIycm4yazEvMXExTjFwYnAvNHBCMVAvcHAxcFBuMi8zUDQvMVByMk4yL1AyUTFQMUsvNlIxIHcgLSAtIDAgMVwiLFxyXG5cIjVrMi9wMlExcHAxLzFiNXAvMXAyUEIxUC8ycDJQMi84L1BQM3FQSy84IHcgLSAtIDAgMVwiLFxyXG5cInIza2Ixci9wYjYvMnAycDFwLzFwMnBxMi8ycFEzcC8yTjJCMi9QUDNQUFAvM1JSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjFrYjFyL3BwMW4xcHAxLzFxcDFwMnAvNkIxLzJQUFEzLzNCMU4yL1A0UFBQL1I0UksxIHcgLSAtIDAgMVwiLFxyXG5cInJuM2sxci9wYnBwMUJicC8xcDRwTi80UDFCMS8zbjQvMnEzUTEvUFBQMlBQUC8yS1IzUiB3IC0gLSAwIDFcIixcclxuXCIzUjQvcDFyM3JrLzFxMlAxcDEvNXAxcC8xbjYvMUI1UC9QMlEyUDEvM1IzSyB3IC0gLSAwIDFcIixcclxuXCI4LzZiay8xcDYvNXBCcC8xUDJiMy82UVAvUDVQSy81cTIgYiAtIC0gMCAxXCIsXHJcblwicjFicWtiMi82cDEvcDFwNHAvMXAxTjQvOC8xQjNRMi9QUDNQUFAvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwiNXJyay81cGIxL3AxcE4zcC83US8xcDJQUDFSLzFxNVAvNlAxLzZSSyB3IC0gLSAwIDFcIixcclxuXCJybmJxMWJuci9wcDFwMXAxcC8zcGszLzNOUDFwMS81cDIvNU4yL1BQUDFRMVBQL1IxQjFLQjFSIHcgLSAtIDAgMVwiLFxyXG5cIjFyM3JrMS8xcG5ucTFiUi9wMXBwMkIxL1AyUDFwMi8xUFAxcFAyLzJCM1AxLzVQSzEvMlE0UiB3IC0gLSAwIDFcIixcclxuXCIyUTUvMXAzcDIvM2IxazFwLzNQcDMvNEIxUjEvNHExUDEvcjRQSzEvOCB3IC0gLSAwIDFcIixcclxuXCJyMWIza3IvcHBwMUJwMXAvMWI2L24yUDQvMnAzcTEvMlEyTjIvUDRQUFAvUk4yUjFLMSB3IC0gLSAwIDFcIixcclxuXCIxUjFicjFrMS9wUjVwLzJwM3BCLzJwMlAyL1AxcXAyUTEvMm40UC9QNVAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIybjIvMnEzcmsvcDNwMm4vMXAzcDFQLzROMy9QTjFCMVAyLzFQUFE0LzJLM1IxIHcgLSAtIDAgMVwiLFxyXG5cInIzcTMvcHBwM2sxLzNwM1IvNWIyLzJQUjNRLzJQMVByUDEvUDcvNEszIHcgLSAtIDAgMVwiLFxyXG5cIjJyM2sxLzNiMmIxLzVwcDEvM1A0L3BCMlAzLzJObnFOMi8xUDJCMlEvNUsxUiBiIC0gLSAwIDFcIixcclxuXCI2cmsvMnAycDFwL3AycTFwMVEvMnAxcFAyLzFuUDFSMy8xUDVQL1A1UDEvMkIzSzEgdyAtIC0gMCAxXCIsXHJcblwiMXIyYmsyLzFwM3BwcC9wMW4ycTIvMk41LzFQNi9QM1IxUDEvNVBCUC80UTFLMSB3IC0gLSAwIDFcIixcclxuXCJyM3JrMi81cG4xL3BiMW5xMXBSLzFwMnAxUDEvMnAxUDMvMlAyUU4xL1BQQkIxUDIvMks0UiB3IC0gLSAwIDFcIixcclxuXCIzcmtxMXIvMXBRMnAxcC9wM2JQcDEvM3BSMy84LzgvUFBQMlBQMS8xSzFSNCB3IC0gLSAwIDFcIixcclxuXCJyMWJxM3IvcHBwMW5RMi8ya3AxTjIvNk4xLzNiUDMvOC9QMm4xUFBQLzFSM1JLMSB3IC0gLSAwIDFcIixcclxuXCJuMnExcjFrLzRicDFwLzRwMy80UDFwMS8ycFBOUTIvMnA0Ui81UFBQLzJCM0sxIHcgLSAtIDAgMVwiLFxyXG5cIjJScjFxazEvNXBwcC9wMk40L1A3LzVRMi84LzFyNFBQLzVCSzEgdyAtIC0gMCAxXCIsXHJcblwiOC82azEvM3AxcnAxLzNCcDFwMS8xcFAxUDFLMS80YlBSMS9QNVExLzRxMyBiIC0gLSAwIDFcIixcclxuXCJyMWJxMnJrL3BwM3BicC8ycDFwMXBRLzdQLzNQNC8yUEIxTjIvUFAzUFBSLzJLUjQgdyAtIC0gMCAxXCIsXHJcblwiNXFyMS9wcjNwMWsvMW4xcDJwMS8ycFBwUDFwL1AzUDJRLzJQMUJQMVIvN1AvNlJLIHcgLSAtIDAgMVwiLFxyXG5cInJuMmtiMXIvcHAycHAxcC8ycDJwMi84LzgvM1ExTjIvcVBQQjFQUFAvMktSM1IgdyAtIC0gMCAxXCIsXHJcblwiN2svcGI0cnAvMnFwMVEyLzFwM3BQMS9ucDNQMi8zUHJOMVIvUDFQNFAvUjNOMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjgvcDRwazEvNnAxLzNSNC8zbnFOMVAvMlEzUDEvNVAyLzNyMUJLMSBiIC0gLSAwIDFcIixcclxuXCJyM3JrMi9wM2JwMi8ycDFxQjIvMXAxblAxUlAvM1A0LzJQUTQvUDVQMS81UksxIHcgLSAtIDAgMVwiLFxyXG5cIjZrMS9wcDNwcHAvNHAzLzJQM2IxL2JQUDNQMS8zSzQvUDNRMXExLzFSNVIgYiAtIC0gMCAxXCIsXHJcblwicjFiMnJrMS9wMXFuYnAxcC8ycDNwMS8ycHAzUS80cFAyLzFQMUJQMVIxL1BCUFAyUFAvUk40SzEgdyAtIC0gMCAxXCIsXHJcblwiM3I0L3A0UTFwLzFwMlAyay8ycDNwcS8yUDJCMi8xUDJwMlAvUDVQMS82SzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzgvM3ExcDIvcDVwMS9QMWIxUDJwL1IxUTRQLzVLTjEvM3I0IGIgLSAtIDAgMVwiLFxyXG5dO1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IFtcclxuXCJyNHIxay9wMnAzcC9icDFOcDMvNFAzLzJQMm5SMS8zQjFxMi9QMVBRNC8ySzNSMSB3IC0gLSAwIDFcIixcclxuXCIzcjJrMS9wMXAycDIvYnAycDFuUS80UEIxUC8ycHIzcS82UjEvUFAzUFAxLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cIjJyM2sxL3A2Ui8xcDJwMXAxL25LNE4xL1A0UDIvM240LzRyMVAxLzdSIGIgLSAtIDAgMVwiLFxyXG5cIk4xYms0L3BwMXAxUXBwLzgvMmI1LzNuM3EvOC9QUFAyUlBQL1JOQjFyQksxIGIgLSAtIDAgMVwiLFxyXG5cIjVyazEvMXAxbjJicC9wNy9QMlAycDEvNFIzLzROMVBiLzJRQjFxMVAvNFIySyBiIC0gLSAwIDFcIixcclxuXCI0azFyMS9wcDJicDIvMnA1LzNQUFAyLzFxNi83ci8xUDJRMlAvMlJSM0sgYiAtIC0gMCAxXCIsXHJcblwiOC80UjFway9wNXAxLzgvMXBCMW4xYjEvMVAyYjFQMS9QNHIxUC81UjFLIGIgLSAtIDAgMVwiLFxyXG5cIjJrcjFiMXIvcHAzcHBwLzJwMWIycS80QjMvNFEzLzJQQjJSMS9QUFAyUFBQLzNSMksxIHcgLSAtIDAgMVwiLFxyXG5cInIzazMvM2IzUi8xbjFwMWIxUS8xcDFQcFAxTi8xUDJQMVAxLzZLMS8yQjFxMy84IHcgLSAtIDAgMVwiLFxyXG5cInIzUW5SMS8xYms1L3BwNXEvMmI1LzJwMVAzL1A3LzFCQjRQLzNSM0sgdyAtIC0gMCAxXCIsXHJcblwiMXI0azEvM2IycHAvMWIxcFAyci9wcDFQNC80cTMvOC9QUDRSUC8yUTJSMUsgYiAtIC0gMCAxXCIsXHJcblwiMnIyYjFrL3AyUTNwL2IxbjJQcFAvMnA1LzNyMUJOMS8zcTJQMS9QNFBCMS9SM1IxSzEgdyAtIC0gMCAxXCIsXHJcblwicjRSMi8xYjJuMXBwL3AyTnAxazEvMXBuNS80cFAxUC84L1BQUDFCMVAxLzJLNFIgdyAtIC0gMCAxXCIsXHJcblwiYjNyMWsxL3A0UmJOL1AzUDFwMS8xcDYvMXFwNFAvNFExUDEvNVAyLzVCSzEgdyAtIC0gMCAxXCIsXHJcblwicTFyMmIxay9yYjRucC8xcDJwMk4vcEIxbjQvNlExLzFQMlAzL1BCM1BQUC8yUlIySzEgdyAtIC0gMCAxXCIsXHJcblwiMnIxazJyL3BSMnAxYnAvMm4xUDFwMS84LzJRUDQvcTJiMU4yL1AyQjFQUFAvNEsyUiB3IC0gLSAwIDFcIixcclxuXCIxazVyLzNSMXBicC8xQjJwMy8yTnBQbjIvNXAyLzgvMVBQM1BQLzZLMSB3IC0gLSAwIDFcIixcclxuXCIycnIxazIvcGI0cDEvMXAxcXBwMi80UjJRLzNuNC9QMU41LzFQM1BQUC8xQjJSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJxNGsvNXBOUC9wMnAxQnBQLzRwMy8xcDJiMy8xUDYvUDFyMlIyLzFLNFExIHcgLSAtIDAgMVwiLFxyXG5cIjZrMS8yckIxcDIvUkIxcDJwYi8zUHAycC80UDMvM0syTlEvNVBxMS84IGIgLSAtIDAgMVwiLFxyXG5cIjVyazEvMXAxcTJicC9wMnBOMXAxLzJwUDJCbi8yUDNQMS8xUDYvUDRRS1AvNVIyIHcgLSAtIDAgMVwiLFxyXG5cIjNyazJiLzVSMVAvNkIxLzgvMVAzcE4xLzdQL1AycGJQMi82SzEgdyAtIC0gMCAxXCIsXHJcblwiMmJxMWsxci9yNXBwL3AyYjFQbjEvMXAxUTQvM1A0LzFCNi9QUDNQUFAvMlIxUjFLMSB3IC0gLSAwIDFcIixcclxuXCI0QjMvNlIxLzFwNWsvcDJyM04vUG4xcDJQMS83UC8xUDNQMi82SzEgdyAtIC0gMCAxXCIsXHJcblwiMXIyUnIyLzNQMXAxay81UnBwL3FwNi8ycFE0LzdQLzVQUEsvOCB3IC0gLSAwIDFcIixcclxuXCJyNGtyMS8xYjJSMW4xL3BxNHAxLzRRMy8xcDRQMS81UDIvUFBQNFAvMUsyUjMgdyAtIC0gMCAxXCIsXHJcblwiMmIyazIvMnAycjFwL3AycFIzLzFwM1BRMS8zcTNOLzFQNi8yUDNQUC81SzIgdyAtIC0gMCAxXCIsXHJcblwiNHExcmsvcGIyYnBucC8ycjRRLzFwMXAxcFAxLzROUDIvMVAzUjIvUEJuNFAvUkI0SzEgdyAtIC0gMCAxXCIsXHJcblwiMnI0ay9wNHJScC8xcDFSM0IvNXAxcS8yUG40LzVwMi9QUDRRUC8xQjVLIHcgLSAtIDAgMVwiLFxyXG5cInIycjQvMXAxYm4ycC9wbjJwcGtCLzVwMi80UFFOMS82UDEvUFBxMlBCUC9SMlIySzEgdyAtIC0gMCAxXCIsXHJcblwiNXIxay83Yi80QjMvNksxLzNSMU4yLzgvOC84IHcgLSAtIDAgMVwiLFxyXG5cInI1bnIvNlJwL3AxTk5rcDIvMXAzYjIvMnA1LzVLMi9QUDJQMy8zUjQgdyAtIC0gMCAxXCIsXHJcblwiMXIzazIvM1JucDIvNnAxLzZxMS9wMUJRMXAyL1AxUDUvMVAzUFAxLzZLMSB3IC0gLSAwIDFcIixcclxuXCIycm4yazEvMXExTjFwYnAvNHBCMVAvcHAxcFBuMi8zUDQvMVByMk4yL1AyUTFQMUsvNlIxIHcgLSAtIDAgMVwiLFxyXG5cIjNSNC9wMXIzcmsvMXEyUDFwMS81cDFwLzFuNi8xQjVQL1AyUTJQMS8zUjNLIHcgLSAtIDAgMVwiLFxyXG5cInIxYjJuMi8ycTNyay9wM3Aybi8xcDNwMVAvNE4zL1BOMUIxUDIvMVBQUTQvMkszUjEgdyAtIC0gMCAxXCIsXHJcblwicjNxMy9wcHAzazEvM3AzUi81YjIvMlBSM1EvMlAxUHJQMS9QNy80SzMgdyAtIC0gMCAxXCIsXHJcblwiMXIyYmsyLzFwM3BwcC9wMW4ycTIvMk41LzFQNi9QM1IxUDEvNVBCUC80UTFLMSB3IC0gLSAwIDFcIixcclxuXCIyUnIxcWsxLzVwcHAvcDJONC9QNy81UTIvOC8xcjRQUC81QksxIHcgLSAtIDAgMVwiLFxyXG5cIjdrL3BiNHJwLzJxcDFRMi8xcDNwUDEvbnAzUDIvM1ByTjFSL1AxUDRQL1IzTjFLMSB3IC0gLSAwIDFcIixcclxuXCI4L3A0cGsxLzZwMS8zUjQvM25xTjFQLzJRM1AxLzVQMi8zcjFCSzEgYiAtIC0gMCAxXCIsXHJcblwiNHIzL3BicG4ybjEvMXAxcHJwMWsvOC8yUFAyUEIvUDVOMS8yQjJSMVAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyNHIxay9wcDFiMnBuLzgvM3BSMy81TjIvM1E0L1BxM1BQUC81UksxIHcgLSAtIDAgMVwiLFxyXG5cIjFyMnIxazEvNXAyLzVScDEvNFEycC9QMkIycVAvMU5QNS8xS1A1LzggdyAtIC0gMCAxXCIsXHJcblwiMXIzcmsxLzFucWIybjEvNlIxLzFwMVBwMy8xUHAzcDEvMlA0UC8yQjJRUDEvMkIyUksxIHcgLSAtIDAgMVwiLFxyXG5cInI3LzFwM1EyLzJrcHIycC9wMXAyUnAxL1AzUHAyLzFQM1AyLzFCMnExUFAvM1IzSyB3IC0gLSAwIDFcIixcclxuXCIxcjNyMi8xcDVSL3AxbjJwcDEvMW4xQjFQazEvOC84L1AxUDJCUFAvMksxUjMgdyAtIC0gMCAxXCIsXHJcblwiNGsyci8xUjNSMi9wM3AxcHAvNGIzLzFCbk5yMy84L1AxUDUvNUsyIHcgLSAtIDAgMVwiLFxyXG5cIjVxMi8xcHByMWJyMS8xcDFwMWtuUi8xTjRSMS9QMVAxUFAyLzFQNi8yUDRRLzJLNSB3IC0gLSAwIDFcIixcclxuXCI3ay8zcWJSMW4vcjVwMS8zQnAxUDEvMXAxcFAxcjEvM1AyUTEvMVA1Sy8yUjUgdyAtIC0gMCAxXCIsXHJcblwiNG4zL3BicTJyazEvMXAzcE4xLzgvMnAyUTIvUG40TjEvQjRQUDEvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiOC8xcDJwMWtwLzJyUkIzL3BxMm4xUHAvNFAzLzgvUFBQMlEyLzJLNSB3IC0gLSAwIDFcIixcclxuXCIzcjFyazEvMXEyYjFuMS9wMWIxcFJwUS8xcDJQMy8zQk4zL1AxUEI0LzFQNFBQLzRSMksgdyAtIC0gMCAxXCIsXHJcblwiMmIycjFrLzFwMlIzLzJuMnIxcC9wMVAxTjFwMS8yQjNQMS9QNlAvMVAzUjIvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjFxcjJiazEvcGIzcHAxLzFwbjNucC8zTjJOUS84L1A3L0JQM1BQUC8yQjFSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjJyazQvNVIyLzNwcDFRMS9wYjJxMk4vMXAyUDMvOC9QUHI1LzFLMVI0IHcgLSAtIDAgMVwiLFxyXG5cInI0cjFrL3BwNFIxLzNwTjFwMS8zUDJRcC8xcTJQcG4xLzgvNlBQLzVSSzEgdyAtIC0gMCAxXCIsXHJcblwicjJyMWIxay9wUjYvNnBwLzVRMi8zcUIzLzZQMS9QM1BQMVAvNksxIHcgLSAtIDAgMVwiLFxyXG5cInIzcmtuUS8xcDFSMXBiMS9wM3BxQkIvMnA1LzgvNlAxL1BQUDJQMVAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiM3JiMWsxL3BwcTNwMS8ycDFwMXAxLzZQMS8yUHIzUi8xUDFRNC9QMUI0UC81UksxIHcgLSAtIDAgMVwiLFxyXG5cIjVyazEvMWJSMnBicC80cDFwMS84LzFwMVAxUFBxLzFCMlAyci9QMk5RMlAvNVJLMSBiIC0gLSAwIDFcIixcclxuXCIzcTFyazEvNGJwMXAvMW4yUDJRLzFwMXAxcDIvNnIxL1BwMlIyTi8xQjFQMlBQLzdLIHcgLSAtIDAgMVwiLFxyXG5cIjNuazFyMS8xcHE0cC9wM1BRcEIvNXAyLzJyNS84L1A0UFBQLzNSUjFLMSB3IC0gLSAwIDFcIixcclxuXCI2cmsvNXAxcC81cDIvMXAyYlAyLzFQMlIyUS8ycTFCQlBQLzVQSzEvcjcgdyAtIC0gMCAxXCIsXHJcblwiMWI0cmsvNFIxcHAvcDFiNHIvMlBCNC9QcDFRNC82UHEvMVAzUDFQLzRSTksxIHcgLSAtIDAgMVwiLFxyXG5cIlE0UjIvM2tyMy8xcTNuMXAvMnAxcDFwMS8xcDFiUDFQMS8xQjFQM1AvMlBCSzMvOCB3IC0gLSAwIDFcIixcclxuXCIycmsycjEvM2IzUi9uM3BSQjEvcDJwUDFQMS8zTjQvMVBwNS9QMUs0UC84IHcgLSAtIDAgMVwiLFxyXG5cIjJyNS8yUjUvM25wa3BwLzNiTjMvcDRQUDEvNEszL1AxQjRQLzggdyAtIC0gMCAxXCIsXHJcblwicjJxcjJrL3BwMWIzcC8yblE0LzJwQjFwMVAvM24xUHBSLzJOUDJQMS9QUFA1LzJLMVIxTjEgdyAtIC0gMCAxXCIsXHJcblwiMXIzcjFrLzJSNHAvcTRwcFAvM1BwUTIvMlJiUDMvcFA2L1AyQjJQMS8xSzYgdyAtIC0gMCAxXCIsXHJcblwiMnIzazEvcHAzcHBwLzFxcjJuMi8zcDFRMi8xUDYvUDJCUDJQLzVQUDEvMlIyUksxIHcgLSAtIDAgMVwiLFxyXG5cIjVrMi9wM1JyMi8xcDRwcC9xNHAyLzFuYlExUDIvNlAxLzVOMVAvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwicjNyMy8zUjFRcDEvcHFiMXAyay8xcDROMS84LzRQMy9QYjNQUFAvMlIzSzEgdyAtIC0gMCAxXCIsXHJcblwiOC80azMvMXAycDFwMS9wUDFwUG5QMS9QMXJQcTJwLzFLUDJSMU4vOC81UTIgYiAtIC0gMCAxXCIsXHJcblwiMnEzazEvMXA0cHAvM1IxcjIvcDJiUTMvUDcvMU4yQjMvMVBQM3JQL1IzSzMgYiAtIC0gMCAxXCIsXHJcblwiNHJrMi81cDFiLzFwM1IxSy9wNnAvMlAyUDIvMVA2LzJxNFAvUTVSMSB3IC0gLSAwIDFcIixcclxuXCIycjJiazEvMnFuMXBwcC9wbjFwNC81TjIvTjNyMy8xUTYvNVBQUC9CUjNCSzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxL3BwM3IyLzJwNHEvM3AycDEvM1BwMWIxLzRQMVAxL1BQNFJQLzJRMVJyTksgYiAtIC0gMCAxXCIsXHJcblwicjVrci9wcHBOMXBwMS8xYm4xUjMvMXExTjJCcC8zcDJRMS84L1BQUDJQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCIxcTFyMWsyLzFiMlJwcDEvcDFwUTNwL1BwUHA0LzNQMU5QMS8xUDNQMVAvNksxLzggdyAtIC0gMCAxXCIsXHJcblwiNHIzLzJSTjQvcDFyNS8xazFwNC81QnAxL3AyUDQvMVA0UEsvOCB3IC0gLSAwIDFcIixcclxuXCJyMlJuazFyLzFwMnExYjEvN3AvNnBRLzRQcGIxLzFCUDUvUFAzQlBQLzJLNFIgdyAtIC0gMCAxXCIsXHJcblwicjNuMWsxL3BiNXAvNE4xcDEvMnByNC9xNy8zQjNQLzFQMVExUFAxLzJCMVIxSzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzVwMi8zUDFCcHAvMmIxUDMvYjFwMnAyL3AxUDUvUjVyUC8yTjFLMyBiIC0gLSAwIDFcIixcclxuXCJyNXJSLzNOa3AyLzRwMy8xUTRxMS9ucDFONC84L2JQUFIyUDEvMks1IHcgLSAtIDAgMVwiLFxyXG5cIjZrMS8xcDJxMnAvcDNQMXBCLzgvMVAycDMvMlFyMlAxL1A0UDFQLzJSM0sxIHcgLSAtIDAgMVwiLFxyXG5cIjRSMy8ycDJrcFEvM3AzcC9wMnIycTEvOC8xUHIyUDIvUDFQM1BQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIjgvMmsycjIvcHA2LzJwMVIxTnAvNnBuLzgvUHI0QjEvM1IzSyB3IC0gLSAwIDFcIixcclxuXCI1UjIvNHIxcjEvMXA0azEvcDFwQjJCcC9QMVA0Sy8yUDFwMy8xUDYvOCB3IC0gLSAwIDFcIixcclxuXCI2azEvcHBwMnBwcC84LzJuMksxUC8yUDJQMVAvMkJwcjMvUFA0cjEvNFJSMiBiIC0gLSAwIDFcIixcclxuXCIycXIyazEvNHJwcE4vcHBucDQvMnBSM1EvMlAyUDIvMVA0UDEvUEI1UC82SzEgdyAtIC0gMCAxXCIsXHJcblwiM1I0LzNRMXAyL3Excm4ya3AvNHAzLzRQMy8yTjNQMS81UDFQLzZLMSB3IC0gLSAwIDFcIixcclxuXCI0a3IyLzNybjJwLzFQNHAxLzJwNS9RMUIyUDIvOC9QMnEyUFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiM3Ezci9yNHBrMS9wcDJwTnAxLzNiUDFRMS83Ui84L1BQM1BQUC8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCJybmIza3IvcHBwNHAvM2IzQi8zUHAybi8yQlA0LzRLUnAxL1BQUDNxMS9STjFRNCB3IC0gLSAwIDFcIixcclxuXCJyMWtxMWIxci81cHBwL3A0bjIvMnBQUjFCMS9RNy8yUDUvUDRQUFAvMVI0SzEgdyAtIC0gMCAxXCIsXHJcblwiMnI1LzJwMmsxcC9wcXAxUkIyLzJyNS9QYlEyTjIvMVAzUFAxLzJQM1AxLzRSMksgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzVwMi9SNXAxL1A2bi84LzVQUHAvMnIzclAvUjROMUsgYiAtIC0gMCAxXCIsXHJcblwicjNrcjIvNlFwLzFQYjJwMi9wQjNSMi8zcHEyQi80bjMvMVA0UFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiNXJrMS9uMXAxUjFicC9wMnA0LzFxcFAxUUIxLzdQLzJQM1AxL1BQM1AyLzZLMSB3IC0gLSAwIDFcIixcclxuXCIycnJrMy9RUjNwcDEvMm4xYjJwLzFCQjFxMy8zUDQvOC9QNFBQUC82SzEgdyAtIC0gMCAxXCIsXHJcblwiMnExYjFrMS9wNXBwL24yUjQvMXAyUDMvMnA1L0IxUDUvNVFQUC82SzEgdyAtIC0gMCAxXCIsXHJcblwiYjRyazEvNnAxLzRwMU4xL3EzUDFRMS8xcDFSNC8xUDVyL1A0UDIvM1IySzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzFwNXAvcDJwMXEyLzNQYjMvMVEyUDMvM2IxQnBQL1BQcjNQMS9LUk41IGIgLSAtIDAgMVwiLFxyXG5cIjVRMi8xcDNwMU4vMnAzcDEvNWIxay8yUDNuMS9QNFJQMS8zcTJyUC81UjFLIHcgLSAtIDAgMVwiLFxyXG5cIjZrMS8xcjRucC9wcDFwMVIxQi8ycFAycDEvUDFQNS8xbjVQLzZQMS80UjJLIHcgLSAtIDAgMVwiLFxyXG5cIlI0cmsxLzRyMXAxLzFxMnAxUXAvMXBiNS8xbjVSLzVOQjEvMVAzUFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCI4L3AxcDUvMnAzazEvMmIxcnBCMS83Sy8yUDNQUC9QMVAycjIvM1IzUiBiIC0gLSAwIDFcIixcclxuXCJyMWIycmsxLzFwMm5wcHAvcDJSMWIyLzRxUDFRLzRQMy8xQjJCMy9QUFAyUDFQLzJLM1IxIHcgLSAtIDAgMVwiLFxyXG5cIjdrL3AxcDJicDEvM3ExTjFwLzRyUDIvNHBRMi8yUDRSL1AycjJQUC80UjJLIHcgLSAtIDAgMVwiLFxyXG5cIjZrMS80UjMvcDVxMS8ycFAxUTIvM2JuMXIxL1A3LzZQUC81UjFLIGIgLSAtIDAgMVwiLFxyXG5cInI1azEvM25wcDFwLzJiM3AxLzFwbjUvMnBSUDMvMlAxQlBQMS9yMVA0UC8xTktSMUIyIGIgLSAtIDAgMVwiLFxyXG5cIjVyazEvM3AxcDFwL3A0UXExLzFwMVAyUjEvN04vbjZQLzJyM1BLLzggdyAtIC0gMCAxXCIsXHJcblwiNXIxay8xcDFiMXAxcC9wMnBwYjIvNVAxQi8xcTYvMVByM1IxLzJQUTJQUC81UjFLIHcgLSAtIDAgMVwiLFxyXG5cIjVyMi9wcDJSMy8xcTFwM1EvMnBQMWIyLzJQa3JwMi8zQjQvUFBLMlBQMS9SNyB3IC0gLSAwIDFcIixcclxuXCI1YjIvcHAycjFway8ycHAxUjFwLzRyUDFOLzJQMVAzLzFQNFExL1AzcTFQUC81UjFLIHcgLSAtIDAgMVwiLFxyXG5cIjVuMWsvcnE0cnAvcDFicDFiMi8ycDFwUDFRL1AxQjFQMlIvMk4zUjEvMVA0UFAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjJya3IzLzNiMXAxUi8zUjFQMi8xcDJRMVAxL3BQcTUvUDFONS8xS1A1LzggdyAtIC0gMCAxXCIsXHJcblwiMXJiazFyMi9wcDRSMS8zTnAzLzNwMnAxLzZxMS9CUDJQMy9QMlAyQjEvMlIzSzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzVwMi9wM2JScFEvNHEzLzJyM1AxLzZOUC9QMXAyUjFLLzFyNiB3IC0gLSAwIDFcIixcclxuXCJyMXFyM2svM1IycDEvcDNRMy8xcDJwMXAxLzNiTjMvOC9QUDNQUFAvNVJLMSB3IC0gLSAwIDFcIixcclxuXCI1cmsxL3BiMm5wcDEvMXBxNHAvNXAyLzVCMi8xQjYvUDJSUTFQUC8ycjFSMksgYiAtIC0gMCAxXCIsXHJcblwicjRicjEvM2Ixa3BwLzFxMVA0LzFwcDFSUDFOL3A3LzZRMS9QUEIzUFAvMktSNCB3IC0gLSAwIDFcIixcclxuXCJyM1Jua3IvMWI1cC9wM05wQjEvM3A0LzFwNi84L1BQUDNQMS8ySzJSMiB3IC0gLSAwIDFcIixcclxuXCIycjNrMS9wNHAyLzFwMlAxcFEvM2JSMnAvMXE2LzFCNi9QUDJSUHIxLzVLMiB3IC0gLSAwIDFcIixcclxuXCIycjUvMU5yMWtwUnAvcDNiMy9OM3AzLzFQM24yL1A3LzVQUFAvSzZSIGIgLSAtIDAgMVwiLFxyXG5cIjJyNGsvcHBxYnBRMXAvM3AxYnBCLzgvOC8xTnIyUDIvUFBQM1AxLzJLUjNSIHcgLSAtIDAgMVwiLFxyXG5cInIxYnIyazEvNHAxYjEvcHEycG4yLzFwNE4xLzdRLzNCNC9QUFAzUFAvUjRSMUsgdyAtIC0gMCAxXCIsXHJcblwiMXIxa3IzL05icHBuMXBwLzFiNi84LzZRMS8zQjFQMi9QcTNQMVAvM1JSMUsxIHcgLSAtIDAgMVwiLFxyXG5cIm43L3BrM3BwMS8xclIzcDEvUVAxcHEzLzRuMy82UEIvNFBQMVAvMlIzSzEgdyAtIC0gMCAxXCIsXHJcblwiNmsxL3BwNHAxLzJwNS8yYnA0LzgvUDVQYi8xUDNyclAvMkJSUk4xSyBiIC0gLSAwIDFcIixcclxuXCIzYjJyMS81Um4xLzJxUDJway9wMXAxQjMvMlAxTjMvMVAzUTIvNksxLzggdyAtIC0gMCAxXCIsXHJcblwiMnIxcmsyLzFwMnFwMVIvNHAxcDEvMWIxcFAxTjEvcDJQNC9uQlAxUTMvUDRQUFAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCIycjNrMS8xcDNwcHAvcDNwMy83UC9QNFAyLzFSMlFiUDEvNnExLzFCMkszIGIgLSAtIDAgMVwiLFxyXG5cImsycjNyL3AzUnBwcC8xcDRxMS8xUDFiNC8zUTFCMi82TjEvUFAzUFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCI0cmsxci9wMmIxcHAxLzFxNXAvM3BSMW4xLzNOMXAyLzFQMVExUDIvUEJQM1BLLzRSMyB3IC0gLSAwIDFcIixcclxuXCJSNlIvMmtyNC8xcDNwYjEvM3ByTjIvNlAxLzJQMksyLzFQNi84IHcgLSAtIDAgMVwiLFxyXG5cInI1azEvMlJiM3IvcDJwM2IvUDJQcDMvNFAxcHEvNXAyLzFQUTJCMVAvMlIyQktOIGIgLSAtIDAgMVwiLFxyXG5cIjFrNi81UTIvMlJyMnBwL3BxUDUvMXA2LzdQLzJQM1BLLzRyMyB3IC0gLSAwIDFcIixcclxuXCIxcTJyMy9rNHAyL3ByUTJiMXAvUjcvMVBQMUIxcDEvNlAxL1A1SzEvOCB3IC0gLSAwIDFcIixcclxuXCIyazRyL3BwM3BRMS8ycTUvMm41LzgvTjNwUFAxL1AzcjMvUjFSM0sxIGIgLSAtIDAgMVwiLFxyXG5cIjRyMWsxLzFwM3ExcC9wMXBRNC8yUDFSMXAxLzVuMi8yQjUvUFA1UC82SzEgYiAtIC0gMCAxXCIsXHJcblwiNHIxazEvcFIzcHAxLzFuM1AxcC9xMnA0LzVOMVAvUDFyUXBQMi84LzJCMlJLMSB3IC0gLSAwIDFcIixcclxuXCIxUjRuci9wMWsxcHBiMS8ycDRwLzRQcDIvM04xUDFCLzgvcTFQM1BQLzNRMksxIHcgLSAtIDAgMVwiLFxyXG5cIjJSMmJrMS81cnIxL3AzUTJSLzNQcHEyLzFwM3AyLzgvUFAxQjJQUC83SyB3IC0gLSAwIDFcIixcclxuXCIzcjNrL3BwNHAxLzNxUXAxcC9QMXA1LzdSLzNyTjFQUC8xQjNQMi82SzEgdyAtIC0gMCAxXCIsXHJcblwia3I2L3BSNVIvMXExcHAzLzgvMVE2LzJQNS9QS1A1LzVyMiB3IC0gLSAwIDFcIixcclxuXCI0cjFrMS81cHBwL3AycDQvNHIzLzFwTm40LzFQNi8xUFBLMlBQL1IzUjMgYiAtIC0gMCAxXCIsXHJcblwiN2svcGJwM2JwLzNwNC8xcDVxLzNuMnAxLzVyQjEvUFAxTnJOMVAvMVExQlJSSzEgYiAtIC0gMCAxXCIsXHJcblwicjNyMy9wcHA0cC8yYnEyTmsvOC8xUFA1L1AxQjNRMS82UFAvNFIxSzEgdyAtIC0gMCAxXCIsXHJcblwiNHIxazEvM04xcHBwLzNyNC84LzFuM3AxUC81UDIvUFAzSzFQL1JONVIgYiAtIC0gMCAxXCIsXHJcblwiNHJrMi8ycFExcDIvMnAyQjIvMlAxUDJxLzFiNFIxLzFQNi9yNVBQLzJSM0sxIHcgLSAtIDAgMVwiLFxyXG5cIjNyMmsxLzZwcC8xblExUjMvM3I0LzNOMnExLzZOMS9uNFBQUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCJiMXIzazEvcHEyYjFyMS8xcDNSMXAvNVEyLzJQNS9QNE4xUC81UFAxLzFCMlIxSzEgdyAtIC0gMCAxXCIsXHJcblwiMlIxUjFuay8xcDRycC9wMW41LzNOMnAxLzFQNi8yUDUvUDZQLzJLNSB3IC0gLSAwIDFcIixcclxuXCJuM3IxazEvUTRSMXAvcDVwYi8xcDJwMU4xLzFxMlAzLzFQNFBCLzJQM0tQLzggdyAtIC0gMCAxXCIsXHJcblwiNHIxazEvNXEyL3A1cFEvM2IxcEIxLzJwUDQvMlAzUDEvMVAyUjFQSy84IHcgLSAtIDAgMVwiLFxyXG5cIjZrMS9wcDNwMi8ycDJucDEvMlAxcGJxcC9QM1AzLzJOMm5QMS8yUHIxUDIvMVJRMVJCMUsgYiAtIC0gMCAxXCIsXHJcblwiMnIzazEvcGIzcHBwLzgvcVAyYjMvOC8xUDYvMVAxUlFQUFAvMUszQjFSIGIgLSAtIDAgMVwiLFxyXG5cInIzcm4xay80YjFScC9wcDFwMnBCLzNQcDMvUDJxQjFRMS84LzJQM1BQLzVSMUsgdyAtIC0gMCAxXCIsXHJcblwicm5iMnIxay9wcDJxMnAvMnAyUjIvOC8yQnAzUS84L1BQUDNQUC9STjRLMSB3IC0gLSAwIDFcIixcclxuXCIzazQvMXBwM2IxLzRiMnAvMXAzcXAxLzNQbjMvMlAxUk4yL3I1UDEvMVEyUjFLMSBiIC0gLSAwIDFcIixcclxuXCIya3Izci8xcDNwcHAvcDNwbjIvMmIxQjJxL1ExTjUvMlA1L1BQM1BQUC9SMlIySzEgdyAtIC0gMCAxXCIsXHJcblwiNXExay9wM1IxcnAvMnByMnAxLzFwTjJiUDEvM1ExUDIvMUI2L1BQNVAvMks1IHcgLSAtIDAgMVwiLFxyXG5cIjgvN3AvNXBrMS8zbjJwcS8zTjFuUjEvMVAzUDIvUDZQLzRRSzIgdyAtIC0gMCAxXCIsXHJcblwiNHIyUi8zcTFrYlIvMXA0cDEvcDFwUDFwUDEvUDFQMlAyL0s1UTEvMVAycDMvOCB3IC0gLSAwIDFcIixcclxuXCJybjNrMi9wUjJiMy80cDFRMS8ycTFOMlAvM1IyUDEvM0s0L1AzQnIyLzggdyAtIC0gMCAxXCIsXHJcblwiMnE1L3AzcDJrLzNwUDFwMS8yck4yUG4vMXAxUTQvN1IvUFByNS8xSzVSIHcgLSAtIDAgMVwiLFxyXG5cImI1cjEvMnI1LzJwazQvMk4xUjFwMS8xUDRQMS80SzJwLzRQMlAvUjcgdyAtIC0gMCAxXCIsXHJcblwiNmsxL3AxcDNwcC82cTEvM3ByMy8zTm4zLzFRUDFCMVBiL1BQM3IxUC9SM1IxSzEgYiAtIC0gMCAxXCIsXHJcblwiNHIxcjEvcGIxUTJicC8xcDFSbmtwMS81cDIvMlAxUDMvNEJQMi9xUDJCMVBQLzJSM0sxIHcgLSAtIDAgMVwiLFxyXG5cIjFrM3IyLzRSMVExL3AycTFyMi84LzJwMUJiMi81UjIvcFA1UC9LNyB3IC0gLSAwIDFcIixcclxuXCIzcjQvMXA2LzJwNHAvNWsyL3AxUDFuMlAvM05LMW5OL1AxcjUvMVIyUjMgYiAtIC0gMCAxXCIsXHJcblwicjFiM25yL3BwcDFrQjFwLzNwNC84LzNQUEJuYi8xUTNwMi9QUFAycTIvUk40UksgYiAtIC0gMCAxXCIsXHJcblwiNmsxL3AyclIxcDEvMXAxcjFwMVIvM1A0LzRRUHExLzFQNi9QNVBLLzggdyAtIC0gMCAxXCIsXHJcblwiM3IxYjFrLzFwM1IyLzdwLzJwNE4vcDRQMi8ySzNSMS9QUDYvM3I0IHcgLSAtIDAgMVwiLFxyXG5cIjgvNlIxL3Aya3Ayci9xYjVQLzNwMU4xUS8xcDFQcjMvUFA2LzFLNVIgdyAtIC0gMCAxXCIsXHJcblwiOC80azMvUDRSUjEvMmIxcjMvM24yUHAvOC81S1AxLzggYiAtIC0gMCAxXCIsXHJcblwicjJxMWJrMS81bjFwLzJwM3BQL3A3LzNCcjMvMVAzUFFSL1A1UDEvMktSNCB3IC0gLSAwIDFcIixcclxuXCIxUTYvcjNSMnAvazJwMnBQL3AxcTUvUHA0UDEvNVAyLzFQUDNLMS84IHcgLSAtIDAgMVwiLFxyXG5cIjZrMS82cHAvcHAxcDNxLzNQNC9QMVEyYjIvMU5OMXIyYi8xUFA0UC82UksgYiAtIC0gMCAxXCIsXHJcblwiM3IyazEvNnAxLzNOcDJwLzJQMVAzLzFwMlExUGIvMVAzUjFQLzFxcjUvNVJLMSB3IC0gLSAwIDFcIixcclxuXCIxcjJrMy8ycG4xcDIvcDFRYjNwLzdxLzNQUDMvMlAxQk4xYi9QUDFOMVByMS9SUjVLIGIgLSAtIDAgMVwiLFxyXG5cIjNyMWsxci9wMXEycDIvMXBwMk4xcC9uM1JRMi8zUDQvMnAxUFIyL1BQNFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCJyM24yUi9wcDJuMy8zcDFrcDEvMXExUHAxTjEvNlAxLzJQMUJQMi9QUDYvMktSNCB3IC0gLSAwIDFcIixcclxuXCIyUjJiazEvcjRwcHAvM3BwMy8xQjJuMVAxLzNRUDJQLzVQMi8xUEs1LzdxIHcgLSAtIDAgMVwiLFxyXG5cIjNuYnIyLzRxMnAvcjNwUnBrL3AycFFSTjEvMXBwUDJwMS8yUDUvUFBCNFAvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjdrL3A1YjEvMXA0QnAvMnExcDFwMS8xUDFuMXIyL1AyUTJOMS82UDEvM1IySzEgYiAtIC0gMCAxXCIsXHJcblwiNWsyL3BwcXJSQjIvM3IxcDIvMnAycDIvN1AvUDFQUDJQMS8xUDJRUDIvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjRyMy81a3AxLzFOMXA0LzJwUjFxMXAvOC9wUDNQUDEvNksxLzNRcjMgYiAtIC0gMCAxXCIsXHJcblwiMWsycjMvcHA2LzNiNC8zUDJRMS84LzZQMS9QUDNxMVAvMlI0SyBiIC0gLSAwIDFcIixcclxuXCIya3Izci9SNFEyLzFwcTFuMy83cC8zUjFCMVAvMnAzUDEvMlAyUDIvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjJycTJrMS8zYmIycC9uMnAycFEvcDJQcDMvMlAxTjFQMS8xUDVQLzZCMS8yQjJSMUsgdyAtIC0gMCAxXCIsXHJcblwicjJxM2svcHBiM3BwLzJwMUIzLzJQMVJRMi84LzZQMS9QUDFyM1AvNVJLMSB3IC0gLSAwIDFcIixcclxuXCIzazQvMXAzQnAxL3A1cjEvMmI1L1AzUDFOMS81UHAxLzFQMXI0LzJSNEsgYiAtIC0gMCAxXCIsXHJcblwiazcvNHJwMXAvcDFxM3AxL1ExcjJwMi8xUjYvOC9QNVBQLzFSNUsgdyAtIC0gMCAxXCIsXHJcblwiNXJrMS8xUjRiMS8zcDQvMVAxUDQvNFBwMi8zQjFQbmIvUHFSSzFRMi84IGIgLSAtIDAgMVwiLFxyXG5cIjdrLzFwNHAxL3A0YjFwLzNOM1AvMnA1LzJyYjQvUFAycjMvSzJSMlIxIGIgLSAtIDAgMVwiLFxyXG5cInIxcWIxcmsxLzNSMXBwMS9wMW5SMnAxLzFwMnAyTi82UTEvMlAxQjMvUFAzUFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCIzcjFyazEvMnFQMXAyL3AyUjJwcC82YjEvNlAxLzJwUVIyUC9QMUIyUDIvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjFSMlIzL3AxcjJwazEvM2IxcHAxLzgvMlByNC80TjFQMS9QNFBLMS84IHcgLSAtIDAgMVwiLFxyXG5cInIyazJuci9wcDFiMVExcC8ybjRiLzNONC8zcTQvM1A0L1BQUDNQUC80UlIxSyB3IC0gLSAwIDFcIixcclxuXCJyNHJrMS8zUjNwLzFxMnBRcDEvcDcvUDcvOC8xUDVQLzRSSzIgdyAtIC0gMCAxXCIsXHJcblwicjZrLzFwNXAvMnAxYjFwQi83Qi9wMVAxcTJyLzgvUDVRUC8zUjJSSyBiIC0gLSAwIDFcIixcclxuXCI0cjFrMS8xUjRicC9wQjJwMXAxL1A0cDIvMnIxcFAxUS8yUDRQLzFxNFAxLzNSM0sgdyAtIC0gMCAxXCIsXHJcblwiNmsxLzZwMS8zcjFuMXAvcDRwMW4vUDFONFAvMk41L1EyUkszLzdxIGIgLSAtIDAgMVwiLFxyXG5cIjgvMVI0cHAvazJyUXAyLzJwMlAyL3AycTFQMi8xbjFyMlAxLzZCUC80UjJLIHcgLSAtIDAgMVwiLFxyXG5cIjRSMy9wMnIxcTFrLzVCMVAvNlAxLzJwNEsvM2I0LzRRMy84IHcgLSAtIDAgMVwiLFxyXG5cIjRuMy9wM04xcmsvNVEyLzJxNHAvMnA1LzFQM1AxUC9QMVAyUDIvNlJLIHcgLSAtIDAgMVwiLFxyXG5cInJyNFJiLzJwbnFiMWsvbnAxcDFwMUIvM1BwUDIvcDFQMVAyUC8yTjNSMS9QUDJCUDIvMUtRNSB3IC0gLSAwIDFcIixcclxuXCJyMWJxMnJrL3BwMW4xcDFwLzVQMVEvMUIzcDIvM0IzYi9QNVIxLzJQM1BQLzNLM1IgdyAtIC0gMCAxXCIsXHJcblwicTVrMS8xYjJSMXBwLzFwM24yLzRCUTIvOC83UC81UFBLLzRyMyB3IC0gLSAwIDFcIixcclxuXCIzcjQvMW5iMWtwMi9wMXAyTjIvMXAycFByMS84LzFCUDJQMi9QUDFSNC8yS1I0IHcgLSAtIDAgMVwiLFxyXG5cIjdSLzNRMnAxLzJwMm5rMS9wcDRQMS8zUDJyMS8yUDUvNHEzLzVSMUsgdyAtIC0gMCAxXCIsXHJcblwiM3EycjEvcDJiMWsyLzFwbkJwMU4xLzNwMXBRUC82UDEvNVIyLzJyMlAyLzRSSzIgdyAtIC0gMCAxXCIsXHJcblwiazcvMXAxcnIxcHAvcFIxcDFwMi9RMXBxNC9QNy84LzJQM1BQLzFSNEsxIHcgLSAtIDAgMVwiLFxyXG5cIjRrYjFyLzFSNi9wMnJwMy8yUTFwMXExLzRwMy8zQjQvUDZQLzRLUjIgdyAtIC0gMCAxXCIsXHJcblwiMXIzcjFrL3FwNXAvM040LzNwMlExL3A2UC9QNy8xYjYvMUtSM1IxIHcgLSAtIDAgMVwiLFxyXG5cInI0a3IxL3BiTm4xcTFwLzFwNi8ycDJCUFEvNUIyLzgvUDZQL2I0UksxIHcgLSAtIDAgMVwiLFxyXG5cIjNyM2svN3AvcHAyQjFwMS8zTjJQMS9QMnFQUTIvOC8xUHI0UC81UjFLIHcgLSAtIDAgMVwiLFxyXG5cIjNxMXIyL3BiM3BwMS8xcDYvM3BQMU5rLzJyMlEyLzgvUG4zUFAxLzNSUjFLMSB3IC0gLSAwIDFcIixcclxuXCIxazFyNC9wcDVSLzJwNS9QNXAxLzdiLzRQcTIvMVBRMlAyLzNOSzMgYiAtIC0gMCAxXCIsXHJcblwiNlIxLzJrMlAyLzFuNXIvM3AxcDIvM1AzYi8xUVAycDFxLzNSNC82SzEgYiAtIC0gMCAxXCIsXHJcblwiMWsxcjQvMXA1cC8xUDNwcDEvYjcvUDNLMy8xQjNyUDEvMk4xYlAxUC9SUjYgYiAtIC0gMCAxXCIsXHJcblwiM3IyazEvM3EycDEvMWIzcDFwLzRwMy9wMVIxUDJOL1ByNVAvMVBRM1AxLzVSMUsgYiAtIC0gMCAxXCIsXHJcblwiMmIzazEvcjNxMnAvNHAxcEIvcDRyMi80TjMvUDFRNS8xUDRQUC8yUjJSMUsgdyAtIC0gMCAxXCIsXHJcblwicjVyMS9wMXEycDFrLzFwMVIycEIvM3BQMy82YlEvMnA1L1AxUDFOUFBQLzZLMSB3IC0gLSAwIDFcIixcclxuXCIxcjFxcmJrMS8zYjNwL3AycDFwcDEvM05uUDIvM040LzFRNEJQL1BQNFAxLzFSMlIySyB3IC0gLSAwIDFcIixcclxuXCI0YjFrMS8ycjJwMi8xcTFwblBwUS83cC9wM1AyUC9wTjVCL1AxUDUvMUsxUjJSMSB3IC0gLSAwIDFcIixcclxuXCI0cjJrL3BwMnEyYi8ycDJwMVEvNHJQMi9QNy8xQjVQLzFQMlIxUjEvN0sgdyAtIC0gMCAxXCIsXHJcblwiMms1LzFiMXIxUmJwL3AzcDMvQnA0UDEvM3AxUTFQL1A3LzFQUDFxMy8xSzYgdyAtIC0gMCAxXCIsXHJcblwiNnJrLzFwcWJicDFwL3AzcDJRLzZSMS80TjFuUC8zQjQvUFBQNS8yS1I0IHcgLSAtIDAgMVwiLFxyXG5cInI0cmsxLzVSYnAvcDFxTjJwMS9QMW4xUDMvOC8xUTNOMVAvNVBQMS81UksxIHcgLSAtIDAgMVwiLFxyXG5cInIzcjFrMS83cC8ycFJSMXAxL3A3LzJQNS9xblExUDFQMS82QlAvNksxIHcgLSAtIDAgMVwiLFxyXG5cInI0YjFyL3BwcHEycHAvMm4xYjFrMS8zbjQvMkJwNC81UTIvUFBQMlBQUC9STkIxUjFLMSB3IC0gLSAwIDFcIixcclxuXCI2UjEvNXIxay9wNmIvMXBCMXAycS8xUDYvNXJRUC81UDFLLzZSMSB3IC0gLSAwIDFcIixcclxuXCJybjNyazEvMnFwMnBwL3AzUDMvMXAxYjQvM2I0LzNCNC9QUFAxUTFQUC9SMUIyUjFLIHcgLSAtIDAgMVwiLFxyXG5cIjJSM25rLzNyMmIxL3AycHIxUTEvNHBOMi8xUDYvUDZQL3E3L0I0UksxIHcgLSAtIDAgMVwiLFxyXG5cInI1azEvcDFwM2JwLzFwMXA0LzJQUDJxcC8xUDYvMVExYlAzL1BCM3JQUC9SMk4yUksgYiAtIC0gMCAxXCIsXHJcblwiNGszL3IyYm5uMXIvMXEycFIxcC9wMnBQcDFCLzJwUDFOMVAvUHBQMUIzLzFQNFExLzVLUjEgdyAtIC0gMCAxXCIsXHJcblwicjFiMmsyLzFwNHBwL3A0TjFyLzRQcDIvUDNwUDFxLzRQMlAvMVAyUTJLLzNSMlIxIHcgLSAtIDAgMVwiLFxyXG5cIjNyNC9wUjJOMy8ycGtiMy81cDIvOC8yQjUvcVAzUFBQLzRSMUsxIHcgLSAtIDAgMVwiLFxyXG5cInIxYjRyLzFrMmJwcHAvcDFwMXAzLzgvTnAybkIyLzNSNC9QUFAxQlBQUC8yS1I0IHcgLSAtIDAgMVwiLFxyXG5cIjJxMnIxay81UXAxLzRwMVAxLzNwNC9yNmIvN1IvNUJQUC81UksxIHcgLSAtIDAgMVwiLFxyXG5cIlE3LzJyMnJway8ycDRwLzdOLzNQcE4yLzFwMlAzLzFLNFIxLzVxMiB3IC0gLSAwIDFcIixcclxuXCI1cjFrLzFxNGJwLzNwQjFwMS8ycFBuMUIxLzFyNi8xcDVSLzFQMlBQUVAvUjVLMSB3IC0gLSAwIDFcIixcclxuXCJyMWIyazFyLzJxMWIzL3AzcHBCcC8ybjNCMS8xcDYvMk40US9QUFAzUFAvMktSUjMgdyAtIC0gMCAxXCIsXHJcblwiNXIxay83cC84LzROUDIvOC8zcDJSMS8ycjNQUC8ybjFSSzIgdyAtIC0gMCAxXCIsXHJcblwiNnIxL3I1UFIvMnAzUjEvMlBrMW4yLzNwNC8xUDFOUDMvNEszLzggdyAtIC0gMCAxXCIsXHJcblwicjJxNC9wMm5SMWJrLzFwMVBiMnAvNHAycC8zbk4zL0IyQjNQL1BQMVEyUDEvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjVyazEvcFI0YnAvNnAxLzZCMS81UTIvNFAzL3EycjFQUFAvNVJLMSB3IC0gLSAwIDFcIixcclxuXCI0bnJrMS9yUjVwLzRwbnBRLzRwMU4xLzJwMU4zLzZQMS9xNFAxUC80UjFLMSB3IC0gLSAwIDFcIixcclxuXCIxUjFuM2svNnBwLzJOcjQvUDRwMi9yNy84LzRQUEJQLzZLMSBiIC0gLSAwIDFcIixcclxuXCI2cjEvM3AycWsvNFAzLzFSNXAvM2IxcHJQLzNQMkIxLzJQMVFQMi82UksgYiAtIC0gMCAxXCIsXHJcblwicjVxMS9wcDFiMWtyMS8ycDJwMi8yUTUvMlBwQjMvMVA0TlAvUDRQMi80UksyIHcgLSAtIDAgMVwiLFxyXG5cInIycjJrMS9wcDJicHBwLzJwMXAzLzRxYjFQLzgvMUJQMUJRMi9QUDNQUDEvMktSM1IgYiAtIC0gMCAxXCIsXHJcblwiMXIxcmIzL3AxcTJwa3AvUG5wMm5wMS80cDMvNFAzL1ExTjFCMVBQLzJQUkJQMi8zUjJLMSB3IC0gLSAwIDFcIixcclxuXCJyMmsxcjIvM2IycHAvcDVwMS8yUTFSMy8xcEIxUHEyLzFQNi9QS1A0UC83UiB3IC0gLSAwIDFcIixcclxuXCJyNWsxL3E0cHBwL3JuUjFwYjIvMVExcDQvMVAxUDQvUDROMVAvMUIzUFAxLzJSM0sxIHcgLSAtIDAgMVwiLFxyXG5cIjVyMWsvN3AvcDJiNC8xcE5wMXAxcS8zUHIzLzJQMmJQMS9QUDFCM1EvUjNSMUsxIGIgLSAtIDAgMVwiLFxyXG5cIjViMi8xcDNycGsvcDFiM1JwLzRCMVJRLzNQMXAxUC83cS81UDIvNksxIHcgLSAtIDAgMVwiLFxyXG5cIjNScjJrL3BwNHBiLzJwNHAvMlAxbjMvMVAxUTNQLzRyMXExL1BCNEIxLzVSSzEgYiAtIC0gMCAxXCIsXHJcblwiUjcvNXBrcC8zTjJwMS8ycjNQbi81cjIvMVA2L1AxUDUvMktSNCB3IC0gLSAwIDFcIixcclxuXCIxcjNrMi81cDFwLzFxYlJwMy8ycjFQcDIvcHBCNFEvMVA2L1AxUDRQLzFLMVI0IHcgLSAtIDAgMVwiLFxyXG5cIjgvMlExUjFiay8zcjNwL3AyTjFwMVAvUDJQNC8xcDNQcTEvMVA0UDEvMUs2IHcgLSAtIDAgMVwiLFxyXG5cIjVyMWsvcjJiMXAxcC9wNFBwMS8xcDJSMy8zcUJRMi9QNy82UFAvMlI0SyB3IC0gLSAwIDFcIixcclxuXCIzcjNrLzFwM1JwcC9wMm5uMy8zTjQvOC8xUEIxUFExUC9xNFBQMS82SzEgdyAtIC0gMCAxXCIsXHJcblwiM3Ixa3IxLzgvcDJxMnAxLzFwMlIzLzFRNi84L1BQUDUvMUs0UjEgdyAtIC0gMCAxXCIsXHJcblwiNHIyay8ycGIxUjIvMnA0UC8zcHIxTjEvMXA2LzdQL1AxUDUvMks0UiB3IC0gLSAwIDFcIixcclxuXCIzcjNrLzFiMmIxcHAvM3BwMy9wM24xUDEvMXBQcVAyUC8xUDJOMlIvUDFRQjFyMi8yS1IzQiBiIC0gLSAwIDFcIixcclxuXTtcclxuIiwidmFyIENoZXNzID0gcmVxdWlyZSgnY2hlc3MuanMnKS5DaGVzcztcclxudmFyIGMgPSByZXF1aXJlKCcuL2NoZXNzdXRpbHMnKTtcclxuXHJcbnZhciBmb3JrTWFwID0gW107XHJcbmZvcmtNYXBbJ24nXSA9IHtcclxuICAgIHBpZWNlRW5nbGlzaDogJ0tuaWdodCcsXHJcbiAgICBtYXJrZXI6ICfimZjimYYnXHJcbn07XHJcbmZvcmtNYXBbJ3EnXSA9IHtcclxuICAgIHBpZWNlRW5nbGlzaDogJ1F1ZWVuJyxcclxuICAgIG1hcmtlcjogJ+KZleKZhidcclxufTtcclxuZm9ya01hcFsncCddID0ge1xyXG4gICAgcGllY2VFbmdsaXNoOiAnUGF3bicsXHJcbiAgICBtYXJrZXI6ICfimZnimYYnXHJcbn07XHJcbmZvcmtNYXBbJ2InXSA9IHtcclxuICAgIHBpZWNlRW5nbGlzaDogJ0Jpc2hvcCcsXHJcbiAgICBtYXJrZXI6ICfimZfimYYnXHJcbn07XHJcbmZvcmtNYXBbJ3InXSA9IHtcclxuICAgIHBpZWNlRW5nbGlzaDogJ1Jvb2snLFxyXG4gICAgbWFya2VyOiAn4pmW4pmGJ1xyXG59O1xyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocHV6emxlLCBmb3JrVHlwZSkge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKCk7XHJcbiAgICBjaGVzcy5sb2FkKHB1enpsZS5mZW4pO1xyXG4gICAgYWRkRm9ya3MocHV6emxlLmZlbiwgcHV6emxlLmZlYXR1cmVzLCBmb3JrVHlwZSk7XHJcbiAgICBhZGRGb3JrcyhjLmZlbkZvck90aGVyU2lkZShwdXp6bGUuZmVuKSwgcHV6emxlLmZlYXR1cmVzLCBmb3JrVHlwZSk7XHJcbiAgICByZXR1cm4gcHV6emxlO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gYWRkRm9ya3MoZmVuLCBmZWF0dXJlcywgZm9ya1R5cGUpIHtcclxuXHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoKTtcclxuICAgIGNoZXNzLmxvYWQoZmVuKTtcclxuXHJcbiAgICB2YXIgbW92ZXMgPSBjaGVzcy5tb3Zlcyh7XHJcbiAgICAgICAgdmVyYm9zZTogdHJ1ZVxyXG4gICAgfSk7XHJcblxyXG4gICAgbW92ZXMgPSBtb3Zlcy5tYXAobSA9PiBlbnJpY2hNb3ZlV2l0aEZvcmtDYXB0dXJlcyhmZW4sIG0pKTtcclxuICAgIG1vdmVzID0gbW92ZXMuZmlsdGVyKG0gPT4gbS5jYXB0dXJlcy5sZW5ndGggPj0gMik7XHJcblxyXG4gICAgaWYgKCFmb3JrVHlwZSB8fCBmb3JrVHlwZSA9PSAncScpIHtcclxuICAgICAgICBhZGRGb3Jrc0J5KG1vdmVzLCAncScsIGNoZXNzLnR1cm4oKSwgZmVhdHVyZXMpO1xyXG4gICAgfVxyXG4gICAgaWYgKCFmb3JrVHlwZSB8fCBmb3JrVHlwZSA9PSAncCcpIHtcclxuICAgICAgICBhZGRGb3Jrc0J5KG1vdmVzLCAncCcsIGNoZXNzLnR1cm4oKSwgZmVhdHVyZXMpO1xyXG4gICAgfVxyXG4gICAgaWYgKCFmb3JrVHlwZSB8fCBmb3JrVHlwZSA9PSAncicpIHtcclxuICAgICAgICBhZGRGb3Jrc0J5KG1vdmVzLCAncicsIGNoZXNzLnR1cm4oKSwgZmVhdHVyZXMpO1xyXG4gICAgfVxyXG4gICAgaWYgKCFmb3JrVHlwZSB8fCBmb3JrVHlwZSA9PSAnYicpIHtcclxuICAgICAgICBhZGRGb3Jrc0J5KG1vdmVzLCAnYicsIGNoZXNzLnR1cm4oKSwgZmVhdHVyZXMpO1xyXG4gICAgfVxyXG4gICAgaWYgKCFmb3JrVHlwZSB8fCBmb3JrVHlwZSA9PSAnbicpIHtcclxuICAgICAgICBhZGRGb3Jrc0J5KG1vdmVzLCAnbicsIGNoZXNzLnR1cm4oKSwgZmVhdHVyZXMpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBlbnJpY2hNb3ZlV2l0aEZvcmtDYXB0dXJlcyhmZW4sIG1vdmUpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcygpO1xyXG4gICAgY2hlc3MubG9hZChmZW4pO1xyXG5cclxuICAgIHZhciBraW5nc1NpZGUgPSBjaGVzcy50dXJuKCk7XHJcbiAgICB2YXIga2luZyA9IGMua2luZ3NTcXVhcmUoZmVuLCBraW5nc1NpZGUpO1xyXG5cclxuICAgIGNoZXNzLm1vdmUobW92ZSk7XHJcblxyXG4gICAgLy8gcmVwbGFjZSBtb3Zpbmcgc2lkZXMga2luZyB3aXRoIGEgcGF3biB0byBhdm9pZCBwaW5uZWQgc3RhdGUgcmVkdWNpbmcgYnJhbmNoZXMgb24gZm9ya1xyXG5cclxuICAgIGNoZXNzLnJlbW92ZShraW5nKTtcclxuICAgIGNoZXNzLnB1dCh7XHJcbiAgICAgICAgdHlwZTogJ3AnLFxyXG4gICAgICAgIGNvbG9yOiBraW5nc1NpZGVcclxuICAgIH0sIGtpbmcpO1xyXG5cclxuICAgIHZhciBzYW1lU2lkZXNUdXJuRmVuID0gYy5mZW5Gb3JPdGhlclNpZGUoY2hlc3MuZmVuKCkpO1xyXG5cclxuICAgIHZhciBwaWVjZU1vdmVzID0gYy5tb3Zlc09mUGllY2VPbihzYW1lU2lkZXNUdXJuRmVuLCBtb3ZlLnRvKTtcclxuICAgIHZhciBjYXB0dXJlcyA9IHBpZWNlTW92ZXMuZmlsdGVyKGNhcHR1cmVzTWFqb3JQaWVjZSk7XHJcblxyXG4gICAgbW92ZS5jYXB0dXJlcyA9IHVuaXFUbyhjYXB0dXJlcyk7XHJcbiAgICByZXR1cm4gbW92ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gdW5pcVRvKG1vdmVzKSB7XHJcbiAgICB2YXIgZGVzdHMgPSBbXTtcclxuICAgIHJldHVybiBtb3Zlcy5maWx0ZXIobSA9PiB7XHJcbiAgICAgICAgaWYgKGRlc3RzLmluZGV4T2YobS50bykgIT0gLTEpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBkZXN0cy5wdXNoKG0udG8pO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhcHR1cmVzTWFqb3JQaWVjZShtb3ZlKSB7XHJcbiAgICByZXR1cm4gbW92ZS5jYXB0dXJlZCAmJiBtb3ZlLmNhcHR1cmVkICE9PSAncCc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpYWdyYW0obW92ZSkge1xyXG4gICAgdmFyIG1haW4gPSBbe1xyXG4gICAgICAgIG9yaWc6IG1vdmUuZnJvbSxcclxuICAgICAgICBkZXN0OiBtb3ZlLnRvLFxyXG4gICAgICAgIGJydXNoOiAncGFsZUJsdWUnXHJcbiAgICB9XTtcclxuICAgIHZhciBmb3JrcyA9IG1vdmUuY2FwdHVyZXMubWFwKG0gPT4ge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIG9yaWc6IG1vdmUudG8sXHJcbiAgICAgICAgICAgIGRlc3Q6IG0udG8sXHJcbiAgICAgICAgICAgIGJydXNoOiBtLmNhcHR1cmVkID09PSAnaycgPyAncmVkJyA6ICdibHVlJ1xyXG4gICAgICAgIH07XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBtYWluLmNvbmNhdChmb3Jrcyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZEZvcmtzQnkobW92ZXMsIHBpZWNlLCBzaWRlLCBmZWF0dXJlcykge1xyXG4gICAgdmFyIGJ5cGllY2UgPSBtb3Zlcy5maWx0ZXIobSA9PiBtLnBpZWNlID09PSBwaWVjZSk7XHJcbiAgICBpZiAocGllY2UgPT09ICdwJykge1xyXG4gICAgICAgIGJ5cGllY2UgPSBieXBpZWNlLmZpbHRlcihtID0+ICFtLnByb21vdGlvbik7XHJcbiAgICB9XHJcbiAgICBmZWF0dXJlcy5wdXNoKHtcclxuICAgICAgICBkZXNjcmlwdGlvbjogZm9ya01hcFtwaWVjZV0ucGllY2VFbmdsaXNoICsgXCIgZm9ya3NcIixcclxuICAgICAgICBzaWRlOiBzaWRlLFxyXG4gICAgICAgIHRhcmdldHM6IGJ5cGllY2UubWFwKG0gPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0OiBtLnRvLFxyXG4gICAgICAgICAgICAgICAgZGlhZ3JhbTogZGlhZ3JhbShtKSxcclxuICAgICAgICAgICAgICAgIG1hcmtlcjogZm9ya01hcFtwaWVjZV0ubWFya2VyXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSlcclxuICAgIH0pO1xyXG59XHJcbiIsInZhciBjID0gcmVxdWlyZSgnLi9jaGVzc3V0aWxzJyk7XHJcbnZhciBmb3JrcyA9IHJlcXVpcmUoJy4vZm9ya3MnKTtcclxudmFyIGtuaWdodGZvcmtmZW5zID0gcmVxdWlyZSgnLi9mZW5zL2tuaWdodGZvcmtzJyk7XHJcbnZhciBxdWVlbmZvcmtmZW5zID0gcmVxdWlyZSgnLi9mZW5zL3F1ZWVuZm9ya3MnKTtcclxudmFyIHBhd25mb3JrZmVucyA9IHJlcXVpcmUoJy4vZmVucy9wYXduZm9ya3MnKTtcclxudmFyIHJvb2tmb3JrZmVucyA9IHJlcXVpcmUoJy4vZmVucy9yb29rZm9ya3MnKTtcclxudmFyIGJpc2hvcGZvcmtmZW5zID0gcmVxdWlyZSgnLi9mZW5zL2Jpc2hvcGZvcmtzJyk7XHJcbnZhciBwaW5mZW5zID0gcmVxdWlyZSgnLi9mZW5zL3BpbnMnKTtcclxudmFyIHBpbiA9IHJlcXVpcmUoJy4vcGlucycpO1xyXG52YXIgaGlkZGVuID0gcmVxdWlyZSgnLi9oaWRkZW4nKTtcclxudmFyIGxvb3NlID0gcmVxdWlyZSgnLi9sb29zZScpO1xyXG52YXIgaW1tb2JpbGUgPSByZXF1aXJlKCcuL2ltbW9iaWxlJyk7XHJcbnZhciBtYXRldGhyZWF0ID0gcmVxdWlyZSgnLi9tYXRldGhyZWF0Jyk7XHJcbnZhciBjaGVja3MgPSByZXF1aXJlKCcuL2NoZWNrcycpO1xyXG5cclxuLyoqXHJcbiAqIEZlYXR1cmUgbWFwIFxyXG4gKi9cclxudmFyIGZlYXR1cmVNYXAgPSBbe1xyXG4gICAgZGVzY3JpcHRpb246IFwiS25pZ2h0IGZvcmtzXCIsXHJcbiAgICBmdWxsRGVzY3JpcHRpb246IFwiU3F1YXJlcyBmcm9tIHdoZXJlIGEga25pZ2h0IGNhbiBtb3ZlIGFuZCBmb3JrIHR3byBwaWVjZXMgKG5vdCBwYXducykuXCIsXHJcbiAgICBkYXRhOiBrbmlnaHRmb3JrZmVucyxcclxuICAgIGV4dHJhY3Q6IGZ1bmN0aW9uKHB1enpsZSkge1xyXG4gICAgICByZXR1cm4gZm9ya3MocHV6emxlLCAnbicpO1xyXG4gICAgfVxyXG4gIH0sIHtcclxuICAgIGRlc2NyaXB0aW9uOiBcIlF1ZWVuIGZvcmtzXCIsXHJcbiAgICBmdWxsRGVzY3JpcHRpb246IFwiU3F1YXJlcyBmcm9tIHdoZXJlIGEgcXVlZW4gY2FuIG1vdmUgYW5kIGZvcmsgdHdvIHBpZWNlcyAobm90IHBhd25zKS5cIixcclxuICAgIGRhdGE6IHF1ZWVuZm9ya2ZlbnMsXHJcbiAgICBleHRyYWN0OiBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgICAgcmV0dXJuIGZvcmtzKHB1enpsZSwgJ3EnKTtcclxuICAgIH1cclxuICB9LCB7XHJcbiAgICBkZXNjcmlwdGlvbjogXCJQYXduIGZvcmtzXCIsXHJcbiAgICBmdWxsRGVzY3JpcHRpb246IFwiU3F1YXJlcyBmcm9tIHdoZXJlIGEgcGF3biBjYW4gbW92ZSBhbmQgZm9yayB0d28gcGllY2VzIChub3QgcGF3bnMpLlwiLFxyXG4gICAgZGF0YTogcGF3bmZvcmtmZW5zLFxyXG4gICAgZXh0cmFjdDogZnVuY3Rpb24ocHV6emxlKSB7XHJcbiAgICAgIHJldHVybiBmb3JrcyhwdXp6bGUsICdwJyk7XHJcbiAgICB9XHJcbiAgfSwge1xyXG4gICAgZGVzY3JpcHRpb246IFwiUm9vayBmb3Jrc1wiLFxyXG4gICAgZnVsbERlc2NyaXB0aW9uOiBcIlNxdWFyZXMgZnJvbSB3aGVyZSBhIHJvb2sgY2FuIG1vdmUgYW5kIGZvcmsgdHdvIHBpZWNlcyAobm90IHBhd25zKS5cIixcclxuICAgIGRhdGE6IHJvb2tmb3JrZmVucyxcclxuICAgIGV4dHJhY3Q6IGZ1bmN0aW9uKHB1enpsZSkge1xyXG4gICAgICByZXR1cm4gZm9ya3MocHV6emxlLCAncicpO1xyXG4gICAgfVxyXG4gIH0sIHtcclxuICAgIGRlc2NyaXB0aW9uOiBcIkJpc2hvcCBmb3Jrc1wiLFxyXG4gICAgZnVsbERlc2NyaXB0aW9uOiBcIlNxdWFyZXMgZnJvbSB3aGVyZSBhIGJpc2hvcCBjYW4gbW92ZSBhbmQgZm9yayB0d28gcGllY2VzIChub3QgcGF3bnMpLlwiLFxyXG4gICAgZGF0YTogYmlzaG9wZm9ya2ZlbnMsXHJcbiAgICBleHRyYWN0OiBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgICAgcmV0dXJuIGZvcmtzKHB1enpsZSwgJ2InKTtcclxuICAgIH1cclxuICB9LCB7XHJcbiAgICBkZXNjcmlwdGlvbjogXCJMb29zZSBwaWVjZXNcIixcclxuICAgIGZ1bGxEZXNjcmlwdGlvbjogXCJQaWVjZXMgdGhhdCBhcmUgbm90IHByb3RlY3RlZCBieSBhbnkgcGllY2Ugb2YgdGhlIHNhbWUgY29sb3VyLlwiLFxyXG4gICAgZGF0YToga25pZ2h0Zm9ya2ZlbnMsXHJcbiAgICBleHRyYWN0OiBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgICAgcmV0dXJuIGxvb3NlKHB1enpsZSk7XHJcbiAgICB9XHJcbiAgfSwge1xyXG4gICAgZGVzY3JpcHRpb246IFwiQ2hlY2tpbmcgc3F1YXJlc1wiLFxyXG4gICAgZnVsbERlc2NyaXB0aW9uOiBcIlNxdWFyZXMgZnJvbSB3aGVyZSBjaGVjayBjYW4gYmUgZGVsaXZlcmVkLlwiLFxyXG4gICAgZGF0YToga25pZ2h0Zm9ya2ZlbnMsXHJcbiAgICBleHRyYWN0OiBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgICAgcmV0dXJuIGNoZWNrcyhwdXp6bGUpO1xyXG4gICAgfVxyXG4gIH0sIHtcclxuICAgIGRlc2NyaXB0aW9uOiBcIkhpZGRlbiBhdHRhY2tlcnNcIixcclxuICAgIGZ1bGxEZXNjcmlwdGlvbjogXCJQaWVjZXMgdGhhdCB3aWxsIGF0dGFjayBhbiBvcHBvbmVudHMgcGllY2UgKGJ1dCBub3QgcGF3bikgaWYgYW4gaW50ZXJ2aWVuaW5nIHBpZWNlIG9mIHRoZSBzYW1lIGNvbG91ciBtb3Zlcy5cIixcclxuICAgIGRhdGE6IGtuaWdodGZvcmtmZW5zLFxyXG4gICAgZXh0cmFjdDogZnVuY3Rpb24ocHV6emxlKSB7XHJcbiAgICAgIHJldHVybiBoaWRkZW4ocHV6emxlKTtcclxuICAgIH1cclxuICB9LCB7XHJcbiAgICBkZXNjcmlwdGlvbjogXCJQaW5zIGFuZCBTa2V3ZXJzXCIsXHJcbiAgICBmdWxsRGVzY3JpcHRpb246IFwiUGllY2VzIHRoYXQgYXJlIHBpbm5lZCBvciBza2V3ZXJlZCB0byBhIHBpZWNlIChidXQgbm90IHBhd24pIG9mIHRoZSBzYW1lIGNvbG91ci5cIixcclxuICAgIGRhdGE6IHBpbmZlbnMsXHJcbiAgICBleHRyYWN0OiBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgICAgcmV0dXJuIHBpbihwdXp6bGUpO1xyXG4gICAgfVxyXG4gIH0sIHtcclxuICAgIGRlc2NyaXB0aW9uOiBcIkxvdyBtb2JpbGl0eSBwaWVjZXNcIixcclxuICAgIGZ1bGxEZXNjcmlwdGlvbjogXCJQaWVjZXMgdGhhdCBoYXZlIHJlZHVjZWQgbW9iaWxpdHkuIGkuZS4gUGF3bnMgdGhhdCBhcmUgaW1tb2JpbGUsIGtuaWdodHMgd2l0aCBvbmx5IDEgbGVnYWwgbW92ZSwgYmlzaG9wcyB3aXRoIG5vIG1vcmUgdGhhbiAzIGxlZ2FsIG1vdmVzLCByb29rcyB3aXRoIG5vIG1vcmUgdGhhbiA2IGxlZ2FsIG1vdmVzLCBxdWVlbnMgd2l0aCBubyBtb3JlIHRoYW4gMTAgbGVnYWwgbW92ZXMgYW5kIHRoZSBraW5nIHdpdGggbm8gbW9yZSB0aGFuIDIgbGVnYWwgbW92ZXMuXCIsXHJcbiAgICBkYXRhOiBrbmlnaHRmb3JrZmVucyxcclxuICAgIGV4dHJhY3Q6IGZ1bmN0aW9uKHB1enpsZSkge1xyXG4gICAgICByZXR1cm4gaW1tb2JpbGUocHV6emxlKTtcclxuICAgIH1cclxuICB9LCB7XHJcbiAgICBkZXNjcmlwdGlvbjogXCJNaXhlZFwiLFxyXG4gICAgZnVsbERlc2NyaXB0aW9uOiBcIlVzZSB0aGUgaWNvbnMgdG8gZGV0ZXJtaW5lIHdoaWNoIGZlYXR1cmUgdG8gZmluZC5cIixcclxuICAgIGRhdGE6IG51bGwsXHJcbiAgICBleHRyYWN0OiBudWxsXHJcbiAgfVxyXG5cclxuXHJcbl07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuXHJcbiAgLyoqXHJcbiAgICogQ2FsY3VsYXRlIGFsbCBmZWF0dXJlcyBpbiB0aGUgcG9zaXRpb24uXHJcbiAgICovXHJcbiAgZXh0cmFjdEZlYXR1cmVzOiBmdW5jdGlvbihmZW4pIHtcclxuICAgIHZhciBwdXp6bGUgPSB7XHJcbiAgICAgIGZlbjogYy5yZXBhaXJGZW4oZmVuKSxcclxuICAgICAgZmVhdHVyZXM6IFtdXHJcbiAgICB9O1xyXG5cclxuICAgIHB1enpsZSA9IGZvcmtzKHB1enpsZSk7XHJcbiAgICBwdXp6bGUgPSBoaWRkZW4ocHV6emxlKTtcclxuICAgIHB1enpsZSA9IGxvb3NlKHB1enpsZSk7XHJcbiAgICBwdXp6bGUgPSBwaW4ocHV6emxlKTtcclxuICAgIHB1enpsZSA9IG1hdGV0aHJlYXQocHV6emxlKTtcclxuICAgIHB1enpsZSA9IGNoZWNrcyhwdXp6bGUpO1xyXG4gICAgcHV6emxlID0gaW1tb2JpbGUocHV6emxlKTtcclxuXHJcbiAgICByZXR1cm4gcHV6emxlLmZlYXR1cmVzO1xyXG4gIH0sXHJcblxyXG5cclxuICBmZWF0dXJlTWFwOiBmZWF0dXJlTWFwLFxyXG5cclxuICAvKipcclxuICAgKiBDYWxjdWxhdGUgc2luZ2xlIGZlYXR1cmVzIGluIHRoZSBwb3NpdGlvbi5cclxuICAgKi9cclxuICBleHRyYWN0U2luZ2xlRmVhdHVyZTogZnVuY3Rpb24oZmVhdHVyZURlc2NyaXB0aW9uLCBmZW4pIHtcclxuICAgIHZhciBwdXp6bGUgPSB7XHJcbiAgICAgIGZlbjogYy5yZXBhaXJGZW4oZmVuKSxcclxuICAgICAgZmVhdHVyZXM6IFtdXHJcbiAgICB9O1xyXG5cclxuICAgIGZlYXR1cmVNYXAuZm9yRWFjaChmID0+IHtcclxuICAgICAgaWYgKGZlYXR1cmVEZXNjcmlwdGlvbiA9PT0gZi5kZXNjcmlwdGlvbikge1xyXG4gICAgICAgIHB1enpsZSA9IGYuZXh0cmFjdChwdXp6bGUpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gcHV6emxlLmZlYXR1cmVzO1xyXG4gIH0sXHJcblxyXG4gIGZlYXR1cmVGb3VuZDogZnVuY3Rpb24oZmVhdHVyZXMsIHRhcmdldCkge1xyXG4gICAgdmFyIGZvdW5kID0gMDtcclxuICAgIGZlYXR1cmVzXHJcbiAgICAgIC5mb3JFYWNoKGYgPT4ge1xyXG4gICAgICAgIGYudGFyZ2V0cy5mb3JFYWNoKHQgPT4ge1xyXG4gICAgICAgICAgaWYgKHQudGFyZ2V0ID09PSB0YXJnZXQpIHtcclxuICAgICAgICAgICAgZm91bmQrKztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICByZXR1cm4gZm91bmQ7XHJcbiAgfSxcclxuXHJcbiAgYWxsRmVhdHVyZXNGb3VuZDogZnVuY3Rpb24oZmVhdHVyZXMpIHtcclxuICAgIHZhciBmb3VuZCA9IHRydWU7XHJcbiAgICBmZWF0dXJlc1xyXG4gICAgICAuZm9yRWFjaChmID0+IHtcclxuICAgICAgICBmLnRhcmdldHMuZm9yRWFjaCh0ID0+IHtcclxuICAgICAgICAgIGlmICghdC5zZWxlY3RlZCkge1xyXG4gICAgICAgICAgICBmb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICAgIHJldHVybiBmb3VuZDtcclxuICB9LFxyXG5cclxuICByYW5kb21GZWF0dXJlOiBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiBmZWF0dXJlTWFwW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChmZWF0dXJlTWFwLmxlbmd0aCAtIDEpKV0uZGVzY3JpcHRpb247XHJcbiAgfSxcclxuXHJcbiAgcmFuZG9tRmVuRm9yRmVhdHVyZTogZnVuY3Rpb24oZmVhdHVyZURlc2NyaXB0aW9uKSB7XHJcbiAgICB2YXIgZmVucyA9IGZlYXR1cmVNYXAuZmluZChmID0+IGYuZGVzY3JpcHRpb24gPT09IGZlYXR1cmVEZXNjcmlwdGlvbikuZGF0YTtcclxuICAgIHJldHVybiBmZW5zW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGZlbnMubGVuZ3RoKV07XHJcbiAgfSxcclxuXHJcbn07XHJcbiIsInZhciBDaGVzcyA9IHJlcXVpcmUoJ2NoZXNzLmpzJykuQ2hlc3M7XHJcbnZhciBjID0gcmVxdWlyZSgnLi9jaGVzc3V0aWxzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHB1enpsZSkge1xyXG4gICAgaW5zcGVjdEFsaWduZWQocHV6emxlLmZlbiwgcHV6emxlLmZlYXR1cmVzKTtcclxuICAgIGluc3BlY3RBbGlnbmVkKGMuZmVuRm9yT3RoZXJTaWRlKHB1enpsZS5mZW4pLCBwdXp6bGUuZmVhdHVyZXMpO1xyXG4gICAgcmV0dXJuIHB1enpsZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGluc3BlY3RBbGlnbmVkKGZlbiwgZmVhdHVyZXMpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcyhmZW4pO1xyXG5cclxuICAgIHZhciBtb3ZlcyA9IGNoZXNzLm1vdmVzKHtcclxuICAgICAgICB2ZXJib3NlOiB0cnVlXHJcbiAgICB9KTtcclxuXHJcbiAgICB2YXIgcGllY2VzID0gYy5tYWpvclBpZWNlc0ZvckNvbG91cihmZW4sIGNoZXNzLnR1cm4oKSk7XHJcbiAgICB2YXIgb3Bwb25lbnRzUGllY2VzID0gYy5tYWpvclBpZWNlc0ZvckNvbG91cihmZW4sIGNoZXNzLnR1cm4oKSA9PSAndycgPyAnYicgOiAndycpO1xyXG5cclxuICAgIHZhciBwb3RlbnRpYWxDYXB0dXJlcyA9IFtdO1xyXG4gICAgcGllY2VzLmZvckVhY2goZnJvbSA9PiB7XHJcbiAgICAgICAgdmFyIHR5cGUgPSBjaGVzcy5nZXQoZnJvbSkudHlwZTtcclxuICAgICAgICBpZiAoKHR5cGUgIT09ICdrJykgJiYgKHR5cGUgIT09ICduJykpIHtcclxuICAgICAgICAgICAgb3Bwb25lbnRzUGllY2VzLmZvckVhY2godG8gPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGMuY2FuQ2FwdHVyZShmcm9tLCBjaGVzcy5nZXQoZnJvbSksIHRvLCBjaGVzcy5nZXQodG8pKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBhdmFpbGFibGVPbkJvYXJkID0gbW92ZXMuZmlsdGVyKG0gPT4gbS5mcm9tID09PSBmcm9tICYmIG0udG8gPT09IHRvKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYXZhaWxhYmxlT25Cb2FyZC5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcG90ZW50aWFsQ2FwdHVyZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdHRhY2tlcjogZnJvbSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF0dGFja2VkOiB0b1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGFkZEhpZGRlbkF0dGFja2VycyhmZW4sIGZlYXR1cmVzLCBwb3RlbnRpYWxDYXB0dXJlcyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZEhpZGRlbkF0dGFja2VycyhmZW4sIGZlYXR1cmVzLCBwb3RlbnRpYWxDYXB0dXJlcykge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKGZlbik7XHJcbiAgICB2YXIgdGFyZ2V0cyA9IFtdO1xyXG4gICAgcG90ZW50aWFsQ2FwdHVyZXMuZm9yRWFjaChwYWlyID0+IHtcclxuICAgICAgICB2YXIgcmV2ZWFsaW5nTW92ZXMgPSBjLm1vdmVzVGhhdFJlc3VsdEluQ2FwdHVyZVRocmVhdChmZW4sIHBhaXIuYXR0YWNrZXIsIHBhaXIuYXR0YWNrZWQsIHRydWUpO1xyXG4gICAgICAgIGlmIChyZXZlYWxpbmdNb3Zlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIHRhcmdldHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHBhaXIuYXR0YWNrZXIsXHJcbiAgICAgICAgICAgICAgICBtYXJrZXI6ICfipYcnLFxyXG4gICAgICAgICAgICAgICAgZGlhZ3JhbTogZGlhZ3JhbShwYWlyLmF0dGFja2VyLCBwYWlyLmF0dGFja2VkLCByZXZlYWxpbmdNb3ZlcylcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZmVhdHVyZXMucHVzaCh7XHJcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSGlkZGVuIGF0dGFja2VyXCIsXHJcbiAgICAgICAgc2lkZTogY2hlc3MudHVybigpLFxyXG4gICAgICAgIHRhcmdldHM6IHRhcmdldHNcclxuICAgIH0pO1xyXG5cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGRpYWdyYW0oZnJvbSwgdG8sIHJldmVhbGluZ01vdmVzKSB7XHJcbiAgICB2YXIgbWFpbiA9IFt7XHJcbiAgICAgICAgb3JpZzogZnJvbSxcclxuICAgICAgICBkZXN0OiB0byxcclxuICAgICAgICBicnVzaDogJ3JlZCdcclxuICAgIH1dO1xyXG4gICAgdmFyIHJldmVhbHMgPSByZXZlYWxpbmdNb3Zlcy5tYXAobSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgb3JpZzogbS5mcm9tLFxyXG4gICAgICAgICAgICBkZXN0OiBtLnRvLFxyXG4gICAgICAgICAgICBicnVzaDogJ3BhbGVCbHVlJ1xyXG4gICAgICAgIH07XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBtYWluLmNvbmNhdChyZXZlYWxzKTtcclxufVxyXG4iLCJ2YXIgQ2hlc3MgPSByZXF1aXJlKCdjaGVzcy5qcycpLkNoZXNzO1xyXG52YXIgYyA9IHJlcXVpcmUoJy4vY2hlc3N1dGlscycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgIGFkZExvd01vYmlsaXR5KHB1enpsZS5mZW4sIHB1enpsZS5mZWF0dXJlcyk7XHJcbiAgICBhZGRMb3dNb2JpbGl0eShjLmZlbkZvck90aGVyU2lkZShwdXp6bGUuZmVuKSwgcHV6emxlLmZlYXR1cmVzKTtcclxuICAgIHJldHVybiBwdXp6bGU7XHJcbn07XHJcblxyXG52YXIgbW9iaWxpdHlNYXAgPSB7fTtcclxubW9iaWxpdHlNYXBbJ3AnXSA9IDE7XHJcbm1vYmlsaXR5TWFwWyduJ10gPSAyO1xyXG5tb2JpbGl0eU1hcFsnYiddID0gNDtcclxubW9iaWxpdHlNYXBbJ3InXSA9IDc7XHJcbm1vYmlsaXR5TWFwWydxJ10gPSAxMTtcclxubW9iaWxpdHlNYXBbJ2snXSA9IDI7XHJcblxyXG5mdW5jdGlvbiBhZGRMb3dNb2JpbGl0eShmZW4sIGZlYXR1cmVzKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoZmVuKTtcclxuICAgIHZhciBwaWVjZXMgPSBjLmFsbFBpZWNlc0ZvckNvbG91cihmZW4sIGNoZXNzLnR1cm4oKSk7XHJcblxyXG4gICAgcGllY2VzID0gcGllY2VzLm1hcChzcXVhcmUgPT4ge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHNxdWFyZTogc3F1YXJlLFxyXG4gICAgICAgICAgICB0eXBlOiBjaGVzcy5nZXQoc3F1YXJlKS50eXBlLFxyXG4gICAgICAgICAgICBtb3ZlczogY2hlc3MubW92ZXMoe1xyXG4gICAgICAgICAgICAgICAgdmVyYm9zZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIHNxdWFyZTogc3F1YXJlXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfTtcclxuICAgIH0pO1xyXG5cclxuICAgIHBpZWNlcyA9IHBpZWNlcy5maWx0ZXIobSA9PiBtLm1vdmVzLmxlbmd0aCA8IG1vYmlsaXR5TWFwW20udHlwZV0pO1xyXG5cclxuICAgIGZlYXR1cmVzLnB1c2goe1xyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkxvdyBtb2JpbGl0eVwiLFxyXG4gICAgICAgIHNpZGU6IGNoZXNzLnR1cm4oKSxcclxuICAgICAgICB0YXJnZXRzOiBwaWVjZXMubWFwKHQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0OiB0LnNxdWFyZSxcclxuICAgICAgICAgICAgICAgIG1hcmtlcjogJ+KngCcsXHJcbiAgICAgICAgICAgICAgICBkaWFncmFtOiBbe1xyXG4gICAgICAgICAgICAgICAgICAgIG9yaWc6IHQuc3F1YXJlLFxyXG4gICAgICAgICAgICAgICAgICAgIGJydXNoOiAneWVsbG93J1xyXG4gICAgICAgICAgICAgICAgfV1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KVxyXG4gICAgfSk7XHJcbn1cclxuIiwidmFyIENoZXNzID0gcmVxdWlyZSgnY2hlc3MuanMnKS5DaGVzcztcclxudmFyIGMgPSByZXF1aXJlKCcuL2NoZXNzdXRpbHMnKTtcclxuXHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihwdXp6bGUpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcygpO1xyXG4gICAgYWRkTG9vc2VQaWVjZXMocHV6emxlLmZlbiwgcHV6emxlLmZlYXR1cmVzKTtcclxuICAgIGFkZExvb3NlUGllY2VzKGMuZmVuRm9yT3RoZXJTaWRlKHB1enpsZS5mZW4pLCBwdXp6bGUuZmVhdHVyZXMpO1xyXG4gICAgcmV0dXJuIHB1enpsZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGFkZExvb3NlUGllY2VzKGZlbiwgZmVhdHVyZXMpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcygpO1xyXG4gICAgY2hlc3MubG9hZChmZW4pO1xyXG4gICAgdmFyIGtpbmcgPSBjLmtpbmdzU3F1YXJlKGZlbiwgY2hlc3MudHVybigpKTtcclxuICAgIHZhciBvcHBvbmVudCA9IGNoZXNzLnR1cm4oKSA9PT0gJ3cnID8gJ2InIDogJ3cnO1xyXG4gICAgdmFyIHBpZWNlcyA9IGMucGllY2VzRm9yQ29sb3VyKGZlbiwgb3Bwb25lbnQpO1xyXG4gICAgcGllY2VzID0gcGllY2VzLmZpbHRlcihzcXVhcmUgPT4gIWMuaXNDaGVja0FmdGVyUGxhY2luZ0tpbmdBdFNxdWFyZShmZW4sIGtpbmcsIHNxdWFyZSkpO1xyXG4gICAgZmVhdHVyZXMucHVzaCh7XHJcbiAgICAgICAgZGVzY3JpcHRpb246IFwiTG9vc2UgcGllY2VzXCIsXHJcbiAgICAgICAgc2lkZTogb3Bwb25lbnQsXHJcbiAgICAgICAgdGFyZ2V0czogcGllY2VzLm1hcCh0ID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHRhcmdldDogdCxcclxuICAgICAgICAgICAgICAgIG1hcmtlcjogJ+KaricsXHJcbiAgICAgICAgICAgICAgICBkaWFncmFtOiBbe1xyXG4gICAgICAgICAgICAgICAgICAgIG9yaWc6IHQsXHJcbiAgICAgICAgICAgICAgICAgICAgYnJ1c2g6ICd5ZWxsb3cnXHJcbiAgICAgICAgICAgICAgICB9XVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pXHJcbiAgICB9KTtcclxufVxyXG4iLCJ2YXIgQ2hlc3MgPSByZXF1aXJlKCdjaGVzcy5qcycpLkNoZXNzO1xyXG52YXIgYyA9IHJlcXVpcmUoJy4vY2hlc3N1dGlscycpO1xyXG5cclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHB1enpsZSkge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKCk7XHJcbiAgICBjaGVzcy5sb2FkKHB1enpsZS5mZW4pO1xyXG4gICAgYWRkTWF0ZUluT25lVGhyZWF0cyhwdXp6bGUuZmVuLCBwdXp6bGUuZmVhdHVyZXMpO1xyXG4gICAgYWRkTWF0ZUluT25lVGhyZWF0cyhjLmZlbkZvck90aGVyU2lkZShwdXp6bGUuZmVuKSwgcHV6emxlLmZlYXR1cmVzKTtcclxuICAgIHJldHVybiBwdXp6bGU7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBhZGRNYXRlSW5PbmVUaHJlYXRzKGZlbiwgZmVhdHVyZXMpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcygpO1xyXG4gICAgY2hlc3MubG9hZChmZW4pO1xyXG4gICAgdmFyIG1vdmVzID0gY2hlc3MubW92ZXMoe1xyXG4gICAgICAgIHZlcmJvc2U6IHRydWVcclxuICAgIH0pO1xyXG5cclxuICAgIG1vdmVzID0gbW92ZXMuZmlsdGVyKG0gPT4gY2FuTWF0ZU9uTmV4dFR1cm4oZmVuLCBtKSk7XHJcblxyXG4gICAgZmVhdHVyZXMucHVzaCh7XHJcbiAgICAgICAgZGVzY3JpcHRpb246IFwiTWF0ZS1pbi0xIHRocmVhdHNcIixcclxuICAgICAgICBzaWRlOiBjaGVzcy50dXJuKCksXHJcbiAgICAgICAgdGFyZ2V0czogbW92ZXMubWFwKG0gPT4gdGFyZ2V0QW5kRGlhZ3JhbShtKSlcclxuICAgIH0pO1xyXG5cclxufVxyXG5cclxuZnVuY3Rpb24gY2FuTWF0ZU9uTmV4dFR1cm4oZmVuLCBtb3ZlKSB7XHJcbiAgICB2YXIgY2hlc3MgPSBuZXcgQ2hlc3MoZmVuKTtcclxuICAgIGNoZXNzLm1vdmUobW92ZSk7XHJcbiAgICBpZiAoY2hlc3MuaW5fY2hlY2soKSkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBjaGVzcy5sb2FkKGMuZmVuRm9yT3RoZXJTaWRlKGNoZXNzLmZlbigpKSk7XHJcbiAgICB2YXIgbW92ZXMgPSBjaGVzcy5tb3Zlcyh7XHJcbiAgICAgICAgdmVyYm9zZTogdHJ1ZVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gc3R1ZmYgbWF0aW5nIG1vdmVzIGludG8gbW92ZSBvYmplY3QgZm9yIGRpYWdyYW1cclxuICAgIG1vdmUubWF0aW5nTW92ZXMgPSBtb3Zlcy5maWx0ZXIobSA9PiAvIy8udGVzdChtLnNhbikpO1xyXG4gICAgcmV0dXJuIG1vdmUubWF0aW5nTW92ZXMubGVuZ3RoID4gMDtcclxufVxyXG5cclxuZnVuY3Rpb24gdGFyZ2V0QW5kRGlhZ3JhbShtb3ZlKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHRhcmdldDogbW92ZS50byxcclxuICAgICAgICBkaWFncmFtOiBbe1xyXG4gICAgICAgICAgICBvcmlnOiBtb3ZlLmZyb20sXHJcbiAgICAgICAgICAgIGRlc3Q6IG1vdmUudG8sXHJcbiAgICAgICAgICAgIGJydXNoOiBcInBhbGVHcmVlblwiXHJcbiAgICAgICAgfV0uY29uY2F0KG1vdmUubWF0aW5nTW92ZXMubWFwKG0gPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgb3JpZzogbS5mcm9tLFxyXG4gICAgICAgICAgICAgICAgZGVzdDogbS50byxcclxuICAgICAgICAgICAgICAgIGJydXNoOiBcInBhbGVHcmVlblwiXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSkpLmNvbmNhdChtb3ZlLm1hdGluZ01vdmVzLm1hcChtID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIG9yaWc6IG0uZnJvbSxcclxuICAgICAgICAgICAgICAgIGJydXNoOiBcInBhbGVHcmVlblwiXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSkpXHJcbiAgICB9O1xyXG59XHJcbiIsInZhciBDaGVzcyA9IHJlcXVpcmUoJ2NoZXNzLmpzJykuQ2hlc3M7XHJcbnZhciBjID0gcmVxdWlyZSgnLi9jaGVzc3V0aWxzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHB1enpsZSkge1xyXG4gICAgaW5zcGVjdEFsaWduZWQocHV6emxlLmZlbiwgcHV6emxlLmZlYXR1cmVzKTtcclxuICAgIGluc3BlY3RBbGlnbmVkKGMuZmVuRm9yT3RoZXJTaWRlKHB1enpsZS5mZW4pLCBwdXp6bGUuZmVhdHVyZXMpO1xyXG4gICAgcmV0dXJuIHB1enpsZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGluc3BlY3RBbGlnbmVkKGZlbiwgZmVhdHVyZXMpIHtcclxuICAgIHZhciBjaGVzcyA9IG5ldyBDaGVzcyhmZW4pO1xyXG5cclxuICAgIHZhciBtb3ZlcyA9IGNoZXNzLm1vdmVzKHtcclxuICAgICAgICB2ZXJib3NlOiB0cnVlXHJcbiAgICB9KTtcclxuXHJcbiAgICB2YXIgcGllY2VzID0gYy5tYWpvclBpZWNlc0ZvckNvbG91cihmZW4sIGNoZXNzLnR1cm4oKSk7XHJcbiAgICB2YXIgb3Bwb25lbnRzUGllY2VzID0gYy5tYWpvclBpZWNlc0ZvckNvbG91cihmZW4sIGNoZXNzLnR1cm4oKSA9PSAndycgPyAnYicgOiAndycpO1xyXG5cclxuICAgIHZhciBwb3RlbnRpYWxDYXB0dXJlcyA9IFtdO1xyXG4gICAgcGllY2VzLmZvckVhY2goZnJvbSA9PiB7XHJcbiAgICAgICAgdmFyIHR5cGUgPSBjaGVzcy5nZXQoZnJvbSkudHlwZTtcclxuICAgICAgICBpZiAoKHR5cGUgIT09ICdrJykgJiYgKHR5cGUgIT09ICduJykpIHtcclxuICAgICAgICAgICAgb3Bwb25lbnRzUGllY2VzLmZvckVhY2godG8gPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGMuY2FuQ2FwdHVyZShmcm9tLCBjaGVzcy5nZXQoZnJvbSksIHRvLCBjaGVzcy5nZXQodG8pKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBhdmFpbGFibGVPbkJvYXJkID0gbW92ZXMuZmlsdGVyKG0gPT4gbS5mcm9tID09PSBmcm9tICYmIG0udG8gPT09IHRvKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYXZhaWxhYmxlT25Cb2FyZC5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcG90ZW50aWFsQ2FwdHVyZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdHRhY2tlcjogZnJvbSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF0dGFja2VkOiB0b1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGFkZEdlb21ldHJpY1BpbnMoZmVuLCBmZWF0dXJlcywgcG90ZW50aWFsQ2FwdHVyZXMpO1xyXG59XHJcblxyXG4vLyBwaW5zIGFyZSBmb3VuZCBpZiB0aGVyZSBpcyAxIHBpZWNlIGluIGJldHdlZW4gYSBjYXB0dXJlIG9mIHRoZSBvcHBvbmVudHMgY29sb3VyLlxyXG5cclxuZnVuY3Rpb24gYWRkR2VvbWV0cmljUGlucyhmZW4sIGZlYXR1cmVzLCBwb3RlbnRpYWxDYXB0dXJlcykge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKGZlbik7XHJcbiAgICB2YXIgdGFyZ2V0cyA9IFtdO1xyXG4gICAgcG90ZW50aWFsQ2FwdHVyZXMuZm9yRWFjaChwYWlyID0+IHtcclxuICAgICAgICBwYWlyLnBpZWNlc0JldHdlZW4gPSBjLmJldHdlZW4ocGFpci5hdHRhY2tlciwgcGFpci5hdHRhY2tlZCkubWFwKHNxdWFyZSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzcXVhcmU6IHNxdWFyZSxcclxuICAgICAgICAgICAgICAgIHBpZWNlOiBjaGVzcy5nZXQoc3F1YXJlKVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pLmZpbHRlcihpdGVtID0+IGl0ZW0ucGllY2UpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdmFyIG90aGVyU2lkZSA9IGNoZXNzLnR1cm4oKSA9PT0gJ3cnID8gJ2InIDogJ3cnO1xyXG5cclxuICAgIHBvdGVudGlhbENhcHR1cmVzID0gcG90ZW50aWFsQ2FwdHVyZXMuZmlsdGVyKHBhaXIgPT4gcGFpci5waWVjZXNCZXR3ZWVuLmxlbmd0aCA9PT0gMSk7XHJcbiAgICBwb3RlbnRpYWxDYXB0dXJlcyA9IHBvdGVudGlhbENhcHR1cmVzLmZpbHRlcihwYWlyID0+IHBhaXIucGllY2VzQmV0d2VlblswXS5waWVjZS5jb2xvciA9PT0gb3RoZXJTaWRlKTtcclxuICAgIHBvdGVudGlhbENhcHR1cmVzLmZvckVhY2gocGFpciA9PiB7XHJcbiAgICAgICAgdGFyZ2V0cy5wdXNoKHtcclxuICAgICAgICAgICAgdGFyZ2V0OiBwYWlyLnBpZWNlc0JldHdlZW5bMF0uc3F1YXJlLFxyXG4gICAgICAgICAgICBtYXJrZXI6IG1hcmtlcihmZW4sIHBhaXIucGllY2VzQmV0d2VlblswXS5zcXVhcmUsIHBhaXIuYXR0YWNrZWQpLFxyXG4gICAgICAgICAgICBkaWFncmFtOiBkaWFncmFtKHBhaXIuYXR0YWNrZXIsIHBhaXIuYXR0YWNrZWQsIHBhaXIucGllY2VzQmV0d2VlblswXS5zcXVhcmUpXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfSk7XHJcblxyXG4gICAgZmVhdHVyZXMucHVzaCh7XHJcbiAgICAgICAgZGVzY3JpcHRpb246IFwiUGlucyBhbmQgU2tld2Vyc1wiLFxyXG4gICAgICAgIHNpZGU6IGNoZXNzLnR1cm4oKSA9PT0gJ3cnID8gJ2InIDogJ3cnLFxyXG4gICAgICAgIHRhcmdldHM6IHRhcmdldHNcclxuICAgIH0pO1xyXG5cclxufVxyXG5cclxuZnVuY3Rpb24gbWFya2VyKGZlbiwgcGlubmVkLCBhdHRhY2tlZCkge1xyXG4gICAgdmFyIGNoZXNzID0gbmV3IENoZXNzKGZlbik7XHJcbiAgICB2YXIgcCA9IGNoZXNzLmdldChwaW5uZWQpLnR5cGU7XHJcbiAgICB2YXIgYSA9IGNoZXNzLmdldChhdHRhY2tlZCkudHlwZTtcclxuICAgIHZhciBjaGVja01vZGlmaWVyID0gYSA9PT0gJ2snID8gJysnIDogJyc7XHJcbiAgICBpZiAoKHAgPT09ICdxJykgfHwgKHAgPT09ICdyJyAmJiAoYSA9PT0gJ2InIHx8IGEgPT09ICduJykpKSB7XHJcbiAgICAgICAgcmV0dXJuICfwn42iJyArIGNoZWNrTW9kaWZpZXI7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gJ/Cfk4wnICsgY2hlY2tNb2RpZmllcjtcclxufVxyXG5cclxuZnVuY3Rpb24gZGlhZ3JhbShmcm9tLCB0bywgbWlkZGxlKSB7XHJcbiAgICByZXR1cm4gW3tcclxuICAgICAgICBvcmlnOiBmcm9tLFxyXG4gICAgICAgIGRlc3Q6IHRvLFxyXG4gICAgICAgIGJydXNoOiAncmVkJ1xyXG4gICAgfSwge1xyXG4gICAgICAgIG9yaWc6IG1pZGRsZSxcclxuICAgICAgICBicnVzaDogJ3JlZCdcclxuICAgIH1dO1xyXG59XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24obGlzdCkge1xyXG5cclxuICAgIHZhciBvY2N1cmVkID0gW107XHJcbiAgICB2YXIgcmVzdWx0ID0gW107XHJcblxyXG4gICAgbGlzdC5mb3JFYWNoKHggPT4ge1xyXG4gICAgICAgIHZhciBqc29uID0gSlNPTi5zdHJpbmdpZnkoeCk7XHJcbiAgICAgICAgaWYgKCFvY2N1cmVkLmluY2x1ZGVzKGpzb24pKSB7XHJcbiAgICAgICAgICAgIG9jY3VyZWQucHVzaChqc29uKTtcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goeCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG4iXX0=
