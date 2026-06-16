// MJ Card Room
// 原生 JS / 本地保存 / 不预设固定字卡内容

(function () {
  const STORAGE_KEY = "mj_card_room_state_v2";

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  let selectedFragmentImage = "";

  const defaultState = {
    settings: {
      mjName: "MJ",
      replyDelayMin: 800,
      replyDelayMax: 2200,
      dailyLetterEnabled: false,
      lastLetterAt: null
    },
    cardSystem: {
      customReplies: [],
      customReplyGroups: [],
      disabledReplyItems: []
    },
    chatMessages: [],
    fragments: [],
    companionSessions: [],
    letters: []
  };

  let state = loadState();

  function $(id) {
    return document.getElementById(id);
  }

  function now() {
    return Date.now();
  }

  function makeId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHTML(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleString("zh-CN");
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function normalizeCardText(text) {
    return String(text || "").trim();
  }

  function cloneDefaultState() {
    return JSON.parse(JSON.stringify(defaultState));
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);

      reader.readAsText(file);
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);

      reader.readAsDataURL(file);
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaultState();

      const saved = JSON.parse(raw);

      return mergeState(defaultState, saved);
    } catch (error) {
      console.warn("读取本地数据失败：", error);
      return cloneDefaultState();
    }
  }

  function mergeState(base, saved) {
    return {
      settings: {
        ...base.settings,
        ...(saved.settings || {})
      },
      cardSystem: {
        ...base.cardSystem,
        ...(saved.cardSystem || {})
      },
      chatMessages: Array.isArray(saved.chatMessages) ? saved.chatMessages : [],
      fragments: Array.isArray(saved.fragments) ? saved.fragments : [],
      companionSessions: Array.isArray(saved.companionSessions) ? saved.companionSessions : [],
      letters: Array.isArray(saved.letters) ? saved.letters : []
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      alert("保存失败：本地存储可能满了。图片太大时容易发生，可以删除一些图片碎片或导出备份。");
      console.warn("保存本地数据失败：", error);
    }
  }

  // =====================
  // 字卡系统
  // =====================

  function getDisabledSet() {
    const arr = state.cardSystem.disabledReplyItems || [];
    return new Set(arr.map(normalizeCardText));
  }

  function getDisabledGroupItemsSet() {
    const result = new Set();

    const groups = Array.isArray(state.cardSystem.customReplyGroups)
      ? state.cardSystem.customReplyGroups
      : [];

    groups.forEach(group => {
      if (!group || !group.disabled) return;
      if (!Array.isArray(group.items)) return;

      group.items.forEach(item => {
        result.add(normalizeCardText(item));
      });
    });

    return result;
  }

  function getAvailableCards() {
    const disabled = getDisabledSet();
    const disabledByGroup = getDisabledGroupItemsSet();

    return (state.cardSystem.customReplies || [])
      .map(normalizeCardText)
      .filter(Boolean)
      .filter(card => !disabled.has(card))
      .filter(card => !disabledByGroup.has(card));
  }

  function drawCards(min, max) {
    const pool = getAvailableCards();

    if (!pool.length) return [];

    const count = Math.min(randomInt(min, max), pool.length);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    return shuffled.slice(0, count);
  }

  function addCardsFromText(text, categoryName) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map(normalizeCardText)
      .filter(Boolean);

    if (!lines.length) return 0;

    const finalCategoryName = normalizeCardText(categoryName) || "未分类";

    if (!Array.isArray(state.cardSystem.customReplyGroups)) {
      state.cardSystem.customReplyGroups = [];
    }

    let group = state.cardSystem.customReplyGroups.find(g => g.name === finalCategoryName);

    if (!group) {
      group = {
        name: finalCategoryName,
        items: [],
        disabled: false
      };
      state.cardSystem.customReplyGroups.push(group);
    }

    if (!Array.isArray(group.items)) {
      group.items = [];
    }

    const existing = new Set((state.cardSystem.customReplies || []).map(normalizeCardText));
    const groupExisting = new Set(group.items.map(normalizeCardText));

    let added = 0;

    lines.forEach(card => {
      if (!existing.has(card)) {
        state.cardSystem.customReplies.push(card);
        existing.add(card);
        added += 1;
      }

      if (!groupExisting.has(card)) {
        group.items.push(card);
        groupExisting.add(card);
      }
    });

    saveState();
    renderCards();

    return added;
  }

  function importCardJSON(data) {
    let source = data;

    if (data && data.cardSystem) {
      source = data.cardSystem;
    }

    if (!source || typeof source !== "object") {
      throw new Error("文件格式不正确");
    }

    if (Array.isArray(source.customReplies)) {
      state.cardSystem.customReplies = source.customReplies
        .map(normalizeCardText)
        .filter(Boolean);
    }

    if (Array.isArray(source.customReplyGroups)) {
      state.cardSystem.customReplyGroups = source.customReplyGroups;
    }

    if (Array.isArray(source.disabledReplyItems)) {
      state.cardSystem.disabledReplyItems = source.disabledReplyItems
        .map(normalizeCardText)
        .filter(Boolean);
    }

    saveState();
    renderCards();
  }

  function exportCardJSON() {
    const data = {
      customReplies: state.cardSystem.customReplies || [],
      customReplyGroups: state.cardSystem.customReplyGroups || [],
      disabledReplyItems: state.cardSystem.disabledReplyItems || []
    };

    downloadText("mj-card-room-cards.json", JSON.stringify(data, null, 2));
  }

  function renderCards() {
    const cardList = $("cardList");
    const cardCount = $("cardCount");

    const cards = state.cardSystem.customReplies || [];
    const groups = Array.isArray(state.cardSystem.customReplyGroups)
      ? state.cardSystem.customReplyGroups
      : [];

    cardCount.textContent = `${cards.length} 张`;

    if (!cards.length) {
      cardList.innerHTML = `<div class="hint">还没有字卡。请先在上方添加，或导入原网站格式 JSON。</div>`;
      return;
    }

    const groupedCards = new Map();

    groups.forEach(group => {
      if (!group || !group.name || !Array.isArray(group.items)) return;

      group.items.forEach(card => {
        const text = normalizeCardText(card);
        if (!text) return;
        groupedCards.set(text, group.name);
      });
    });

    const byCategory = {};

    cards.forEach(card => {
      const text = normalizeCardText(card);
      const category = groupedCards.get(text) || "未分类";

      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push(text);
    });

    cardList.innerHTML = Object.keys(byCategory).map(category => {
      const itemsHTML = byCategory[category].map(card => {
        const index = cards.findIndex(item => normalizeCardText(item) === card);

        return `
          <span class="card-chip">
            ${escapeHTML(card)}
            <button class="inline-x" data-delete-card="${index}" type="button" title="删除这张字卡">×</button>
          </span>
        `;
      }).join("");

      return `
        <div class="card-category-block">
          <div class="card-category-title">${escapeHTML(category)}</div>
          <div>${itemsHTML}</div>
        </div>
      `;
    }).join("");

    cardList.querySelectorAll("[data-delete-card]").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.deleteCard);
        const deletedCard = state.cardSystem.customReplies[index];

        if (!deletedCard) return;

        state.cardSystem.customReplies.splice(index, 1);

        if (Array.isArray(state.cardSystem.customReplyGroups)) {
          state.cardSystem.customReplyGroups.forEach(group => {
            if (!Array.isArray(group.items)) return;
            group.items = group.items.filter(item => normalizeCardText(item) !== normalizeCardText(deletedCard));
          });

          state.cardSystem.customReplyGroups = state.cardSystem.customReplyGroups.filter(group => {
            return Array.isArray(group.items) && group.items.length > 0;
          });
        }

        state.cardSystem.disabledReplyItems = (state.cardSystem.disabledReplyItems || [])
          .filter(item => normalizeCardText(item) !== normalizeCardText(deletedCard));

        saveState();
        renderCards();
      });
    });
  }

  // =====================
  // 对话系统
  // =====================

  function getMJName() {
    return state.settings.mjName || "MJ";
  }

  function getReplyDelay() {
    const min = Number(state.settings.replyDelayMin);
    const max = Number(state.settings.replyDelayMax);

    const safeMin = Number.isFinite(min) ? Math.max(0, min) : 800;
    const safeMax = Number.isFinite(max) ? Math.max(safeMin, max) : 2200;

    return randomBetween(safeMin, safeMax);
  }

  function addChatMessage(message) {
    state.chatMessages.push(message);
    saveState();
    renderChat();
  }

  function sendChat() {
    const input = $("chatInput");
    const text = input.value.trim();

    if (!text) return;

    addChatMessage({
      id: makeId("msg"),
      sender: "me",
      text,
      cards: [],
      createdAt: now()
    });

    input.value = "";

    const cards = drawCards(1, 4);

    if (!cards.length) {
      showTyping(false);
      alert("字卡库里还没有可用字卡。请先去「字卡库」添加。");
      return;
    }

    showTyping(true);

    setTimeout(() => {
      showTyping(false);

      addChatMessage({
        id: makeId("msg"),
        sender: "mj",
        text: cards.join(" "),
        cards,
        createdAt: now()
      });
    }, getReplyDelay());
  }

  function showTyping(show) {
    const el = $("typingIndicator");
    const name = $("typingName");

    name.textContent = getMJName();
    el.classList.toggle("hidden", !show);
  }

  function renderChat() {
    const chatList = $("chatList");

    if (!state.chatMessages.length) {
      chatList.innerHTML = `<div class="hint">还没有对话。你可以先发一句话。</div>`;
      return;
    }

    chatList.innerHTML = state.chatMessages.map(msg => {
      const senderClass = msg.sender === "me" ? "me" : "mj";

      const content = msg.sender === "mj" && msg.cards && msg.cards.length
        ? msg.cards.map(card => `<span class="card-chip">${escapeHTML(card)}</span>`).join("")
        : escapeHTML(msg.text);

      return `
        <div class="message ${senderClass}">
          <div class="bubble">
            ${content}
            <div class="message-time">${escapeHTML(formatTime(msg.createdAt))}</div>
          </div>
        </div>
      `;
    }).join("");

    chatList.scrollTop = chatList.scrollHeight;
  }

  // =====================
  // 碎片系统
  // =====================

  function shouldReply(mode) {
    if (mode === "must") return true;
    if (mode === "silent") return false;
    return Math.random() < 0.5;
  }

  function processDueFragments() {
    let changed = false;
    const t = now();

    state.fragments.forEach(fragment => {
      if (fragment.replyStatus === "pending" && fragment.dueAt && t >= fragment.dueAt) {
        const cards = drawCards(1, 4);

        fragment.replyCards = cards;
        fragment.replyStatus = cards.length ? "replied" : "no_cards";
        fragment.repliedAt = now();

        changed = true;
      }
    });

    if (changed) {
      saveState();
    }
  }

  async function handleFragmentImageChange() {
    const file = $("fragmentImage").files[0];
    const preview = $("fragmentPreview");

    if (!file) return;

    if (file.size > 1024 * 1024 * 2.5) {
      alert("图片有点大。本地保存建议压缩到 2.5MB 以下。");
      $("fragmentImage").value = "";
      return;
    }

    selectedFragmentImage = await readFileAsDataURL(file);
    preview.innerHTML = `<img src="${selectedFragmentImage}" alt="preview">`;
  }

  function saveFragment() {
    const text = $("fragmentText").value.trim();
    const replyMode = $("fragmentReplyMode").value;
    const feedbackMode = $("fragmentFeedbackMode").value;
    const status = $("fragmentStatus");

    if (!text && !selectedFragmentImage) {
      alert("先写点东西，或者上传一张图片。");
      return;
    }

    const willReply = shouldReply(replyMode);

    let fragment = {
      id: makeId("frag"),
      text,
      image: selectedFragmentImage,
      createdAt: now(),
      replyMode,
      feedbackMode,
      replyStatus: "no_reply",
      replyCards: [],
      dueAt: null,
      repliedAt: null
    };

    if (!willReply) {
      fragment.replyStatus = "no_reply";
      status.textContent = `${getMJName()} 这次没有回应。碎片已保存。`;
    } else if (!getAvailableCards().length) {
      fragment.replyStatus = "no_cards";
      status.textContent = "没有可用字卡。碎片已保存，但没有生成回应。";
    } else if (feedbackMode === "delayed") {
      fragment.replyStatus = "pending";
      fragment.dueAt = now() + randomBetween(SIX_HOURS, TWENTY_FOUR_HOURS);
      status.textContent = `${getMJName()} 会稍后回应。预计不早于：${formatTime(fragment.dueAt)}`;
    } else {
      const cards = drawCards(1, 4);
      fragment.replyStatus = "replied";
      fragment.replyCards = cards;
      fragment.repliedAt = now();
      status.textContent = `${getMJName()} 回应了。`;
    }

    state.fragments.unshift(fragment);
    saveState();

    $("fragmentText").value = "";
    $("fragmentImage").value = "";
    $("fragmentPreview").innerHTML = "";
    selectedFragmentImage = "";

    renderFragments();
  }

  function getFragmentStatusHTML(fragment) {
    const name = getMJName();

    if (fragment.replyStatus === "pending") {
      return `<div class="record-status pending">${escapeHTML(name)} 还没有回应。预计不早于：${escapeHTML(formatTime(fragment.dueAt))}</div>`;
    }

    if (fragment.replyStatus === "replied") {
      return `<div class="record-status replied">${escapeHTML(name)} 回应了${fragment.repliedAt ? "：" + escapeHTML(formatTime(fragment.repliedAt)) : ""}</div>`;
    }

    if (fragment.replyStatus === "no_cards") {
      return `<div class="record-status silent">没有可用字卡，因此没有生成回应。</div>`;
    }

    return `<div class="record-status silent">${escapeHTML(name)} 这次没有回应。</div>`;
  }

  function renderFragments() {
    processDueFragments();

    const list = $("fragmentList");

    if (!state.fragments.length) {
      list.innerHTML = `<div class="hint">还没有碎片。</div>`;
      return;
    }

    list.innerHTML = state.fragments.map(fragment => {
      const imageHTML = fragment.image
        ? `<img class="record-image" src="${fragment.image}" alt="fragment image">`
        : "";

      const cardsHTML = fragment.replyCards && fragment.replyCards.length
        ? `<div style="margin-top:8px;">${fragment.replyCards.map(card => `<span class="card-chip">${escapeHTML(card)}</span>`).join("")}</div>`
        : "";

      return `
        <div class="record-item">
          <div class="record-time">${escapeHTML(formatTime(fragment.createdAt))}</div>
          ${imageHTML}
          <div class="record-text">${escapeHTML(fragment.text)}</div>
          ${getFragmentStatusHTML(fragment)}
          ${cardsHTML}
        </div>
      `;
    }).join("");
  }

  function exportFragments() {
    const data = {
      exportedAt: now(),
      type: "mj-card-room-fragments",
      fragments: state.fragments || []
    };

    downloadText("mj-card-room-fragments.json", JSON.stringify(data, null, 2));
  }

  function clearFragments() {
    if (!confirm("确定清空所有碎片吗？")) return;

    state.fragments = [];
    saveState();
    renderFragments();
  }

  // =====================
  // 设置 / 导入导出
  // =====================

  function openSettings() {
    $("settingsModal").classList.remove("hidden");

    $("mjNameInput").value = state.settings.mjName || "MJ";
    $("replyDelayMinInput").value = state.settings.replyDelayMin;
    $("replyDelayMaxInput").value = state.settings.replyDelayMax;
    $("dailyLetterEnabled").checked = !!state.settings.dailyLetterEnabled;
  }

  function closeSettings() {
    $("settingsModal").classList.add("hidden");
  }

  function saveSettings() {
    const mjName = $("mjNameInput").value.trim() || "MJ";
    const delayMin = Number($("replyDelayMinInput").value);
    const delayMax = Number($("replyDelayMaxInput").value);

    state.settings.mjName = mjName;
    state.settings.replyDelayMin = Number.isFinite(delayMin) ? Math.max(0, delayMin) : 800;
    state.settings.replyDelayMax = Number.isFinite(delayMax) ? Math.max(state.settings.replyDelayMin, delayMax) : 2200;
    state.settings.dailyLetterEnabled = $("dailyLetterEnabled").checked;

    saveState();
    renderAll();
    closeSettings();
  }

  function exportAll() {
    downloadText("mj-card-room-backup.json", JSON.stringify(state, null, 2));
  }

  async function importAll(file) {
    const text = await readFileAsText(file);
    const data = JSON.parse(text);

    state = mergeState(defaultState, data);

    saveState();
    renderAll();
    alert("导入完成。");
  }

  // =====================
  // 陪伴系统
  // =====================

  let companionTimer = null;
  let companionEndAt = null;

  function startCompanion(minutes) {
    const durationMs = minutes * 60 * 1000;
    companionEndAt = now() + durationMs;

    state.companionSessions.unshift({
      id: makeId("comp"),
      startedAt: now(),
      plannedEndAt: companionEndAt,
      durationMinutes: minutes,
      status: "active",
      initiator: "me"
    });

    saveState();

    $("companionStatus").textContent = `${getMJName()} 正在陪你 ${formatDurationLabel(minutes)}。`;

    if (companionTimer) clearInterval(companionTimer);

    companionTimer = setInterval(updateCompanionTimer, 1000);
    updateCompanionTimer();
  }

  function formatDurationLabel(minutes) {
    if (minutes === 30) return "半小时";
    if (minutes === 60) return "1 小时";
    if (minutes === 120) return "2 小时";
    if (minutes === 480) return "8 小时";
    return `${minutes} 分钟`;
  }

  function formatDurationMs(ms) {
    const safeMs = Math.max(0, ms || 0);

    const h = Math.floor(safeMs / 3600000);
    const m = Math.floor((safeMs % 3600000) / 60000);
    const s = Math.floor((safeMs % 60000) / 1000);

    return (
      String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0")
    );
  }

  function getTotalCompanionMs() {
    let total = 0;

    (state.companionSessions || []).forEach(session => {
      if (!session.startedAt) return;

      if (session.status === "active") {
        total += Math.max(0, now() - session.startedAt);
      } else if (session.endedAt) {
        total += Math.max(0, session.endedAt - session.startedAt);
      }
    });

    return total;
  }

  function renderCompanionTotal() {
    const el = $("companionTotalTime");
    if (!el) return;

    el.textContent = formatDurationMs(getTotalCompanionMs());
  }

  function updateCompanionTimer() {
    renderCompanionTotal();

    if (!companionEndAt) {
      $("companionTimer").textContent = "00:00:00";
      return;
    }

    const left = Math.max(0, companionEndAt - now());

    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);

    $("companionTimer").textContent =
      String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0");

    if (left <= 0) {
      endCompanion("finished");
    }
  }

  function endCompanion(reason) {
    if (companionTimer) clearInterval(companionTimer);
    companionTimer = null;
    companionEndAt = null;

    $("companionTimer").textContent = "00:00:00";

    if (reason === "finished") {
      $("companionStatus").textContent = "这次陪伴结束了。";
    } else {
      $("companionStatus").textContent = "陪伴已结束。";
    }

    const active = state.companionSessions.find(s => s.status === "active");

    if (active) {
      active.status = "ended";
      active.endedAt = now();
      active.endReason = reason || "manual";
      saveState();
    }

    renderCompanionTotal();
  }

  // =====================
  // 来信占位
  // =====================

  function checkDailyLetter() {
    state.settings.dailyLetterEnabled = $("dailyLetterEnabled").checked;
    saveState();

    if (!state.settings.dailyLetterEnabled) {
      alert("每日来信还没有开启。");
      return;
    }

    alert("每日来信功能下一步接入：每 24 小时生成一封 1-12 张字卡信。");
  }

  // =====================
  // 渲染总入口
  // =====================

  function renderAll() {
    $("typingName").textContent = getMJName();
    renderCards();
    renderChat();
    renderFragments();
    renderCompanionTotal();
  }

  // =====================
  // 事件绑定
  // =====================

  function bindEvents() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;

        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));

        btn.classList.add("active");
        $("tab-" + tabName).classList.add("active");

        if (tabName === "fragments") renderFragments();
        if (tabName === "companion") renderCompanionTotal();
      });
    });

    $("sendChatBtn").addEventListener("click", sendChat);

    $("chatInput").addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });

    $("addCardsBtn").addEventListener("click", () => {
      const added = addCardsFromText($("cardInput").value, $("cardCategoryInput").value);

      $("cardInput").value = "";

      if (added) {
        alert(`已添加 ${added} 张字卡。`);
      } else {
        alert("没有添加新的字卡。");
      }
    });

    $("clearCardsBtn").addEventListener("click", () => {
      if (!confirm("确定清空字卡库吗？")) return;

      state.cardSystem.customReplies = [];
      state.cardSystem.customReplyGroups = [];
      state.cardSystem.disabledReplyItems = [];
      saveState();
      renderCards();
    });

    $("exportCardsBtn").addEventListener("click", exportCardJSON);

    $("importCardsFile").addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const text = await readFileAsText(file);
        const data = JSON.parse(text);

        importCardJSON(data);
        alert("字卡导入完成。");
      } catch (error) {
        alert("导入失败：JSON 格式不正确，或文件内容不兼容。");
        console.warn(error);
      }

      event.target.value = "";
    });

    $("fragmentImage").addEventListener("change", handleFragmentImageChange);
    $("saveFragmentBtn").addEventListener("click", saveFragment);
    $("exportFragmentsBtn").addEventListener("click", exportFragments);
    $("clearFragmentsBtn").addEventListener("click", clearFragments);

    $("settingsOpenBtn").addEventListener("click", openSettings);
    $("settingsCloseBtn").addEventListener("click", closeSettings);
    $("saveSettingsBtn").addEventListener("click", saveSettings);

    $("exportAllBtn").addEventListener("click", exportAll);

    $("importAllFile").addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        await importAll(file);
      } catch (error) {
        alert("导入失败：文件格式不正确。");
        console.warn(error);
      }

      event.target.value = "";
    });

    document.querySelectorAll(".duration-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const minutes = Number(btn.dataset.duration);
        startCompanion(minutes);
      });
    });

    $("endCompanionBtn").addEventListener("click", () => endCompanion("manual"));

    $("dailyLetterEnabled").addEventListener("change", () => {
      state.settings.dailyLetterEnabled = $("dailyLetterEnabled").checked;
      saveState();
    });

    $("checkLetterBtn").addEventListener("click", checkDailyLetter);

    $("settingsModal").addEventListener("click", event => {
      if (event.target === $("settingsModal")) {
        closeSettings();
      }
    });
  }

  // =====================
  // 启动
  // =====================

  function init() {
    bindEvents();
    processDueFragments();
    renderAll();

    setInterval(() => {
      processDueFragments();
      renderFragments();
      renderCompanionTotal();
    }, 60 * 1000);
  }

  init();
})();
