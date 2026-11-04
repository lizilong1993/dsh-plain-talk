window.__ModuleLoader__.load({ id: "dsh-plain-talk", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var React = require("react");

/**
 * dsh-plain-talk — browser half.
 *
 * One composer control, placed in `conversation.input.left`: the list slot the
 * composer renders at the end of its left-hand tool row, so the button lands
 * immediately after the shipped plan control.
 *
 * The switch is per Session. It reads and writes the host's loopback state
 * route; the host owns the sidecar file and decides whether the prompt section
 * is injected, so a failed write never leaves the UI claiming a state the
 * model does not have.
 */

var ROUTE_STATE = '/plain-talk/state';
var ACCENT = '#2f6feb';

function isZh() {
  try { return String(navigator.language || '').toLowerCase().indexOf('zh') === 0 } catch (e) { return false }
}

function labelFor(on) {
  if (isZh()) return on ? '说人话：已开启' : '说人话：已关闭';
  return on ? 'Plain talk: on' : 'Plain talk: off';
}

function readHostState(sessionId) {
  return fetch(ROUTE_STATE + '?sessionId=' + encodeURIComponent(sessionId), {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  }).then(function (r) { return r.json() }).then(function (p) { return p && p.ok ? p : undefined });
}

function writeHostState(sessionId, enabled) {
  return fetch(ROUTE_STATE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ sessionId: sessionId, enabled: enabled }),
  }).then(function (r) { return r.json() }).then(function (p) {
    if (!p || p.ok !== true) throw new Error('host rejected the switch');
    return p;
  });
}

function Glyph(props) {
  var color = props.on ? ACCENT : 'currentColor';
  var opacity = props.on ? 1 : 0.55;
  return React.createElement('svg', {
    width: '18', height: '18', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
    style: { display: 'block', color: color, opacity: opacity, transition: 'color .15s ease, opacity .15s ease' },
  }, [
    React.createElement('path', {
      key: 'bubble',
      d: 'M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6.4L6 20.6V17H7a3 3 0 0 1-3-3z',
      fill: 'none', stroke: 'currentColor', strokeWidth: '1.7', strokeLinejoin: 'round',
    }),
    React.createElement('path', {
      key: 'l1', d: 'M8 8.2h8M8 11.6h5',
      fill: 'none', stroke: 'currentColor', strokeWidth: '1.7', strokeLinecap: 'round',
    }),
    React.createElement('path', {
      key: 'spark',
      d: 'M17.2 12.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z',
      fill: 'currentColor',
    }),
  ]);
}

function PlainTalkButton(props) {
  var sessionId = props.sessionId;
  var hostPair = React.useState(null);
  var host = hostPair[0];
  var setHost = hostPair[1];
  var busyPair = React.useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];
  var hoverPair = React.useState(false);
  var hover = hoverPair[0];
  var setHover = hoverPair[1];

  React.useEffect(function () {
    if (!sessionId) return undefined;
    var alive = true;
    readHostState(sessionId)
      .then(function (payload) { if (alive && payload) setHost(payload) })
      .catch(function () { /* unreachable host: keep the control hidden */ });
    return function () { alive = false };
  }, [sessionId]);

  if (!host || !sessionId) return null;

  var on = host.enabled === true;
  var toggle = function () {
    if (busy) return;
    var next = !on;
    setBusy(true);
    setHost(function (previous) { return previous ? Object.assign({}, previous, { enabled: next }) : previous });
    writeHostState(sessionId, next)
      .then(function (payload) { setHost(payload) })
      .catch(function () {
        setHost(function (previous) { return previous ? Object.assign({}, previous, { enabled: !next }) : previous });
      })
      .then(function () { setBusy(false) });
  };

  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': on,
    'aria-label': labelFor(on),
    title: labelFor(on),
    onClick: toggle,
    onMouseEnter: function () { setHover(true) },
    onMouseLeave: function () { setHover(false) },
    style: {
      flex: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      padding: '0',
      margin: '0',
      border: '0',
      borderRadius: '6px',
      background: hover ? 'rgba(127, 127, 127, 0.14)' : 'transparent',
      cursor: busy ? 'default' : 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      appearance: 'none',
      WebkitAppearance: 'none',
      lineHeight: '0',
    },
  }, React.createElement(Glyph, { on: on }));
}

exports.name = 'plain-talk';
exports.inject = ['slots'];
exports.apply = function apply(ctx) {
  ctx.slots.inject('conversation.input.left', function () {
    return ctx.slots.register({
      name: 'conversation.input.left',
      id: 'plain-talk',
      order: 40,
    }, function (props) {
      return React.createElement(PlainTalkButton, props);
    });
  });
};

return module.exports; } });
