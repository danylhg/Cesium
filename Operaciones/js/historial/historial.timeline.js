import { dom } from "./historial.dom.js";
import { replayState } from "./historial.state.js";
import { renderPlaybackState, renderTimelineTime, updateChatToTime } from "./historial.ui.js";
import { updateMapToTime } from "./historial.map.js";

const TICK_MS = 250;

export function initTimeline() {
  dom.playPause?.addEventListener("click", togglePlayback);
  dom.prevEvent?.addEventListener("click", goToPreviousEvent);
  dom.nextEvent?.addEventListener("click", goToNextEvent);

  dom.speed?.addEventListener("change", () => {
    replayState.speed = Number(dom.speed.value) || 1;
  });

  dom.range?.addEventListener("input", () => {
    pausePlayback();
    const offsetSeconds = Number(dom.range.value) || 0;
    setCurrentTime(replayState.startMs + offsetSeconds * 1000);
  });
}

export function setReplayData(replay) {
  const events = [...(replay?.timeline?.eventos || [])]
    .filter((event) => event.occurred_at)
    .sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at));

  const explicitStart = Date.parse(replay?.timeline?.inicio);
  const explicitEnd = Date.parse(replay?.timeline?.fin);
  const firstEvent = events.length ? Date.parse(events[0].occurred_at) : Date.now();
  const lastEvent = events.length ? Date.parse(events[events.length - 1].occurred_at) : firstEvent;

  replayState.replay = replay;
  replayState.events = events;
  replayState.startMs = Number.isFinite(explicitStart) ? explicitStart : firstEvent;
  replayState.endMs = Number.isFinite(explicitEnd) ? explicitEnd : lastEvent;

  if (replayState.endMs < replayState.startMs) {
    replayState.endMs = replayState.startMs;
  }

  const durationSeconds = Math.max(1, Math.ceil((replayState.endMs - replayState.startMs) / 1000));

  if (dom.range) {
    dom.range.min = "0";
    dom.range.max = String(durationSeconds);
    dom.range.value = "0";
  }

  setCurrentTime(replayState.startMs);
}

function togglePlayback() {
  if (replayState.isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (replayState.isPlaying) return;

  if (replayState.currentTimeMs >= replayState.endMs) {
    setCurrentTime(replayState.startMs);
  }

  replayState.isPlaying = true;
  renderPlaybackState(true);

  replayState.timerId = window.setInterval(() => {
    const nextTime = replayState.currentTimeMs + TICK_MS * replayState.speed;
    setCurrentTime(nextTime);

    if (nextTime >= replayState.endMs) {
      pausePlayback();
    }
  }, TICK_MS);
}

function pausePlayback() {
  if (replayState.timerId) {
    window.clearInterval(replayState.timerId);
  }

  replayState.timerId = null;
  replayState.isPlaying = false;
  renderPlaybackState(false);
}

function setCurrentTime(value) {
  const clampedTime = Math.min(Math.max(value, replayState.startMs), replayState.endMs);
  replayState.currentTimeMs = clampedTime;

  if (dom.range) {
    dom.range.value = String(Math.round((clampedTime - replayState.startMs) / 1000));
  }

  renderTimelineTime(clampedTime, replayState.endMs, replayState.events);
  updateMapToTime(clampedTime);
  updateChatToTime(clampedTime);
}

function goToPreviousEvent() {
  pausePlayback();

  let currentIndex = -1;

  for (let index = replayState.events.length - 1; index >= 0; index -= 1) {
    if (Date.parse(replayState.events[index].occurred_at) < replayState.currentTimeMs) {
      currentIndex = index;
      break;
    }
  }

  if (currentIndex >= 0) {
    setCurrentTime(Date.parse(replayState.events[currentIndex].occurred_at));
  }
}

function goToNextEvent() {
  pausePlayback();

  const nextEvent = replayState.events.find((event) => {
    return Date.parse(event.occurred_at) > replayState.currentTimeMs;
  });

  if (nextEvent) {
    setCurrentTime(Date.parse(nextEvent.occurred_at));
  }
}
