const BUZZER_MUTE_DURATION_MS = 60_000;

let muteUntil = 0;

function requestBuzzerMute() {
  muteUntil = Date.now() + BUZZER_MUTE_DURATION_MS;
  return { muteUntil, durationMs: BUZZER_MUTE_DURATION_MS };
}

function getBuzzerMuteState() {
  const remainingMs = Math.max(0, muteUntil - Date.now());
  return {
    muteUntil: remainingMs > 0 ? muteUntil : null,
    remainingMs
  };
}

module.exports = { getBuzzerMuteState, requestBuzzerMute };
