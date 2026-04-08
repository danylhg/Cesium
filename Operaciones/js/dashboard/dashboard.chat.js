// js/dashboard/dashboard.chat.js

import { dom } from "./dashboard.dom.js";
import { dashboardState } from "./dashboard.state.js";
import {
  escapeHtml,
  getChatMessages,
  saveChatMessages,
  isOperationActive
} from "./dashboard.storage.js";
import { formatTime } from "./dashboard.ui.js";

export function switchChatChannel(channel) {
  dashboardState.currentChatChannel = channel;

  if (dom.chatTabCet) {
    dom.chatTabCet.classList.toggle("active", channel === "cet");
  }

  if (dom.chatTabCells) {
    dom.chatTabCells.classList.toggle("active", channel === "cells");
  }

  renderChatMessages();
}

export function renderChatMessages() {
  if (!dom.chatMessages) return;

  const username = localStorage.getItem("username") || "admin";
  const currentChannel = dashboardState.currentChatChannel;

  const messages = getChatMessages().filter(
    msg => msg.channel === currentChannel
  );

  if (!messages.length) {
    dom.chatMessages.innerHTML = `<div class="emptyChat">No hay mensajes en este canal.</div>`;
    return;
  }

  dom.chatMessages.innerHTML = messages.map(msg => {
    const isMine = msg.sender === username;

    const audioHtml = msg.audioBase64
      ? `<audio class="voiceAudio" controls src="${msg.audioBase64}"></audio>`
      : "";

    return `
      <div class="chatBubble ${isMine ? "mine" : ""}">
        <div class="chatBubbleHeader">
          <span>${escapeHtml(msg.sender)}</span>
          <span>${escapeHtml(formatTime(msg.created_at))}</span>
        </div>
        ${msg.text ? `<div class="chatBubbleText">${escapeHtml(msg.text)}</div>` : ""}
        ${audioHtml}
      </div>
    `;
  }).join("");

  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

export function pushChatMessage(payload = {}) {
  const username = localStorage.getItem("username") || "admin";
  const messages = getChatMessages();

  messages.push({
    id: (crypto.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); })),
    channel: dashboardState.currentChatChannel,
    sender: username,
    text: payload.text || "",
    audioBase64: payload.audioBase64 || "",
    created_at: new Date().toISOString()
  });

  saveChatMessages(messages);
  renderChatMessages();
}

export function bindChatEvents() {
  if (dom.sendChatBtn) {
    dom.sendChatBtn.addEventListener("click", () => {
      if (!isOperationActive()) {
        alert("No puedes usar el chat mientras la operación no esté activa.");
        return;
      }

      const text = dom.chatInput?.value.trim() || "";
      if (!text) return;

      pushChatMessage({ text });

      if (dom.chatInput) {
        dom.chatInput.value = "";
      }
    });
  }

  if (dom.chatTabCet) {
    dom.chatTabCet.addEventListener("click", () => switchChatChannel("cet"));
  }

  if (dom.chatTabCells) {
    dom.chatTabCells.addEventListener("click", () => switchChatChannel("cells"));
  }
}
