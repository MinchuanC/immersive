/* Elapsed-time adapters for MineRadio's 60 Hz envelopes and 30 Hz shelf cadence. */
(function (root) {
  function seconds(dt) { return dt == null ? 1 / 60 : Math.max(0, Number(dt) || 0); }
  function ease(factor, dt) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, factor)), seconds(dt) * 60); }
  function drag(rotation, spin, dx, dy, dt) {
    var rx = dy * .0032, ry = dx * .0034;
    rotation.x += rx; rotation.y += ry;
    if (dt > 0) {
      spin.vx = Math.max(-6.2, Math.min(6.2, rx / dt * .46));
      spin.vy = Math.max(-6.2, Math.min(6.2, ry / dt * .46));
    }
  }
  function inertia(rotation, spin, dt) {
    var retention = spin.damping, decay = Math.pow(retention, seconds(dt) * 60);
    // Integrate the donor's discrete 60 Hz release curve over this elapsed interval.
    var distance = retention === 1 ? seconds(dt) : (1 - decay) / (1 - retention) / 60;
    rotation.x += spin.vx * distance; rotation.y += spin.vy * distance;
    spin.vx *= decay; spin.vy *= decay;
    if (Math.abs(spin.vx) < .01) spin.vx = 0;
    if (Math.abs(spin.vy) < .01) spin.vy = 0;
  }
  function envelope(value, target, attack, release, dt) { return value + (target - value) * ease(target > value ? attack : release, dt); }
  function audio(held, target, dt) {
    held.bass = envelope(held.bass, target.bass, .28, .075, dt);
    held.mid = envelope(held.mid, target.mid, .18, .060, dt);
    held.treble = envelope(held.treble, target.treble, .18, .055, dt);
    held.energy = envelope(held.energy, target.energy, .16, .055, dt);
    held.beat = envelope(held.beat, target.beat, .8, .18, dt);
  }
  function cadence(gate, dt, hz) {
    gate.elapsed += seconds(dt);
    var steps = Math.floor((gate.elapsed + 1e-9) * hz);
    if (!steps) return 0;
    var elapsed = steps / hz;
    gate.elapsed = Math.max(0, gate.elapsed - elapsed);
    return elapsed;
  }
  function holdRealm(realm, paused) {
    if (!realm) return;
    var hold = realm.__immersiveMotionHold;
    if (!hold) {
      var request = realm.requestAnimationFrame.bind(realm), cancel = realm.cancelAnimationFrame.bind(realm);
      var held = new Map(), nextId = -1;
      hold = realm.__immersiveMotionHold = { paused: false, held: held };
      realm.requestAnimationFrame = function (callback) {
        if (!hold.paused) return request(callback);
        var id = nextId--; held.set(id, callback); return id;
      };
      realm.cancelAnimationFrame = function (id) { if (id < 0) held.delete(id); else cancel(id); };
      hold.resume = function () { var callbacks = Array.from(held.values()); held.clear(); callbacks.forEach(function (callback) { request(callback); }); };
    }
    if (hold.paused === paused) return;
    hold.paused = paused;
    if (!paused) hold.resume();
  }
  function stepRealm(realm) {
    var hold = realm && realm.__immersiveMotionHold;
    if (!hold || !hold.paused) return;
    var callbacks = Array.from(hold.held.values()); hold.held.clear();
    callbacks.forEach(function (callback) { callback(realm.performance.now()); });
  }
  root.MineradioStageMotion = { ease: ease, drag: drag, inertia: inertia, audio: audio, cadence: cadence, holdRealm: holdRealm, stepRealm: stepRealm };
})(globalThis);
