export const dom = {};

export function readHistoryDom() {
  dom.backBtn = document.getElementById("backBtn");
  dom.title = document.getElementById("historyTitle");
  dom.statusBadge = document.getElementById("historyStatusBadge");
  dom.who = document.getElementById("historyWho");
  dom.map = document.getElementById("historyMap");
  dom.infoContent = document.getElementById("historyInfoContent");
  dom.chatMessages = document.getElementById("historyChatMessages");
  dom.prevEvent = document.getElementById("historyPrevEvent");
  dom.playPause = document.getElementById("historyPlayPause");
  dom.nextEvent = document.getElementById("historyNextEvent");
  dom.speed = document.getElementById("historySpeed");
  dom.range = document.getElementById("historyTimeRange");
  dom.currentTime = document.getElementById("historyCurrentTime");
  dom.totalTime = document.getElementById("historyTotalTime");
  dom.eventCounter = document.getElementById("historyEventCounter");
}
