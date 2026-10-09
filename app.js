/* 上岗证刷题 · 第1章 基础知识  —— 离线 PWA 单页应用 */
(function () {
  "use strict";

  var BANK = window.BANK || { questions: [] };
  var QUESTIONS = BANK.questions;
  var QMAP = {};
  QUESTIONS.forEach(function (q) { QMAP[q.id] = q; });
  var SECTIONS = [];
  QUESTIONS.forEach(function (q) { if (SECTIONS.indexOf(q.section) < 0) SECTIONS.push(q.section); });
  var TYPES = ["填空题", "单选题", "多选题", "判断题"];
  var LS_KEY = "labexam.state.v1";
  var ALL = "__all__";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var app = $("#app"), modal = $("#modal"), sheet = $("#sheet"), toastEl = $("#toast");

  /* ---------------- state ---------------- */
  function defaults() {
    return {
      version: 1,
      settings: { dark: false, fs: "m", familiarAuto: true },
      fillFamiliarRounds: 0,
      qstats: {},
      rounds: [],
      active: null,
      daily: { date: today(), count: 0 }
    };
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  var S = load();
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaults();
      var s = JSON.parse(raw);
      var d = defaults();
      s.settings = Object.assign(d.settings, s.settings || {});
      s.qstats = s.qstats || {};
      s.rounds = s.rounds || [];
      s.daily = s.daily || d.daily;
      s.fillFamiliarRounds = s.fillFamiliarRounds || 0;
      if (s.daily.date !== today()) { s.daily = { date: today(), count: 0 }; }
      return s;
    } catch (e) { return defaults(); }
  }
  var saveTimer = null;
  function save(now) {
    if (now) { localStorage.setItem(LS_KEY, JSON.stringify(S)); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { localStorage.setItem(LS_KEY, JSON.stringify(S)); }, 250);
  }

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove("on"); }, ms || 1800);
  }
  function openSheet(html) { sheet.innerHTML = html; modal.classList.add("on"); }
  function closeSheet() { modal.classList.remove("on"); }
  modal.addEventListener("click", function (e) { if (e.target === modal) closeSheet(); });

  function normText(s) {
    return String(s == null ? "" : s)
      .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s\u3000]/g, "")
      .replace(/[。，、；：,.;:!?"'（）()\[\]【】《》\-—_]/g, "")
      .toLowerCase();
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sumTypes(list) {
    var m = {};
    list.forEach(function (q) { m[q.type] = (m[q.type] || 0) + 1; });
    return m;
  }

  /* ---------------- stats helpers ---------------- */
  function qs(id) {
    if (!S.qstats[id]) S.qstats[id] = { s: 0, c: 0, w: 0, last: 0, lw: 0, streak: 0 };
    return S.qstats[id];
  }
  function seenCount(id) { var q = S.qstats[id]; return q ? q.s : 0; }
  function sectionStat(sec) {
    var total = 0, seen = 0, c = 0, w = 0;
    QUESTIONS.forEach(function (q) {
      if (q.section !== sec) return;
      total++;
      var st = S.qstats[q.id];
      if (st && st.s > 0) { seen++; c += st.c; w += st.w; }
    });
    var done = c + w;
    return { total: total, seen: seen, acc: done ? Math.round((c / done) * 100) : null };
  }
  function totals() {
    var c = 0, w = 0, seen = 0;
    QUESTIONS.forEach(function (q) {
      var st = S.qstats[q.id];
      if (!st || !st.s) return;
      seen++; c += st.c; w += st.w;
    });
    var done = c + w;
    return { seen: seen, c: c, w: w, done: done, acc: done ? Math.round((c / done) * 100) : 0 };
  }
  function wrongList(includeConsolidated) {
    var out = [];
    QUESTIONS.forEach(function (q) {
      var st = S.qstats[q.id];
      if (!st || !st.w) return;
      if (!includeConsolidated && st.streak >= 2) return;
      out.push(q);
    });
    return out;
  }
  function wrongCount() { return wrongList(false).length; }

  /* ---------------- round ---------------- */
  function poolFor(scope) {
    return QUESTIONS.filter(function (q) {
      var okSec = scope.sections.indexOf(ALL) >= 0 || scope.sections.indexOf(q.section) >= 0;
      var okType = scope.types.indexOf(ALL) >= 0 || scope.types.indexOf(q.type) >= 0;
      return okSec && okType;
    });
  }
  function makeRound(scope) {
    var pool = poolFor(scope);
    var picked;
    if (scope.preferUnseen) {
      var fresh = [], rest = [];
      pool.forEach(function (q) { (seenCount(q.id) ? rest : fresh).push(q); });
      shuffle(fresh); shuffle(rest);
      picked = fresh.concat(rest);
    } else {
      picked = shuffle(pool.slice());
    }
    var size = scope.size === 0 ? picked.length : Math.min(scope.size, picked.length);
    var ids = picked.slice(0, size).map(function (q) { return q.id; });
    var familiar = scope.types.indexOf("填空题") >= 0 &&
      (scope.types.indexOf(ALL) >= 0 || scope.types.indexOf("填空题") >= 0) &&
      S.settings.familiarAuto && S.fillFamiliarRounds < 2 &&
      ids.some(function (id) { return QMAP[id] && QMAP[id].type === "填空题"; });
    return {
      id: "r" + Date.now(),
      startedAt: Date.now(),
      resumeAt: Date.now(),
      elapsed: 0,
      scope: scope,
      ids: ids,
      idx: 0,
      correct: 0,
      wrong: 0,
      familiar: 0,
      familiarMode: !!familiar,
      familiarCounted: false,
      log: [],
      answers: {},
      finished: false
    };
  }

  function addElapsed() {
    var r = S.active;
    if (!r) return;
    r.elapsed += Date.now() - (r.resumeAt || Date.now());
    r.resumeAt = Date.now();
  }
  function roundAccuracy(r) {
    var done = r.correct + r.wrong;
    return done ? Math.round((r.correct / done) * 100) : 0;
  }

  function commitAnswer(round, qid, correct, familiar) {
    if (familiar) { round.familiar++; return; }
    var st = qs(qid);
    var prevStreak = st.streak;
    st.s++;
    st.last = Date.now();
    if (correct) { st.c++; st.streak = prevStreak + 1; }
    else { st.w++; st.streak = 0; st.lw = Date.now(); }
    round.log.push({ id: qid, ok: correct, prevStreak: prevStreak });
    if (correct) round.correct++; else round.wrong++;
    if (S.daily.date !== today()) S.daily = { date: today(), count: 0 };
    S.daily.count++;
    save();
  }
  function rollbackRound(round) {
    round.log.slice().reverse().forEach(function (e) {
      var st = S.qstats[e.id];
      if (!st) return;
      st.s = Math.max(0, st.s - 1);
      if (e.ok) st.c = Math.max(0, st.c - 1); else st.w = Math.max(0, st.w - 1);
      st.streak = e.prevStreak;
      if (S.daily.count > 0) S.daily.count--;
    });
    round.log = [];
    round.correct = 0; round.wrong = 0; round.familiar = 0;
  }
  function finishRound() {
    var r = S.active;
    if (!r) return;
    addElapsed();
    r.finished = true;
    var answered = r.correct + r.wrong;
    if (answered > 0) {
      S.rounds.push({
        id: r.id, ts: Date.now(), scope: r.scope, total: r.ids.length,
        answered: answered, correct: r.correct, wrong: r.wrong,
        familiar: r.familiar, acc: roundAccuracy(r), duration: r.elapsed
      });
      if (S.rounds.length > 200) S.rounds = S.rounds.slice(-200);
      S.lastScope = r.scope;
    }
    S.active = null;
    save(true);
    renderResult(r);
    show("result");
  }

  /* ---------------- routing ---------------- */
  var current = "home";
  function show(name) {
    current = name;
    ["home", "setup", "quiz", "result", "wrong", "stats", "me"].forEach(function (v) {
      $("#v-" + v).classList.toggle("on", v === name);
    });
    $("#tabbar").style.display = (name === "setup" || name === "quiz" || name === "result") ? "none" : "flex";
    ["home", "wrong", "stats", "me"].forEach(function (v) {
      $('.tab[data-tab="' + v + '"]').classList.toggle("on", v === name);
    });
    if (name === "home") renderHome();
    if (name === "wrong") renderWrong();
    if (name === "stats") renderStats();
    if (name === "me") renderMe();
  }
  document.addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (tab) { show(tab.dataset.tab); return; }
    var act = e.target.closest("[data-act]");
    if (!act) return;
    var a = act.dataset.act;
    if (a === "back-home") { show("home"); }
    else if (a === "start-setup") { setup = null; renderSetup(); show("setup"); }
    else if (a === "start-round") { startRound(); }
    else if (a === "resume-round") { resumeRound(); }
    else if (a === "ask-exit") { askExit(); }
    else if (a === "wrong-practice") { startWrongRound(); }
    else if (a === "again") {
      var sc = S.lastScope || (S.rounds.length ? S.rounds[S.rounds.length - 1].scope : defaultScope());
      startRoundWith(JSON.parse(JSON.stringify(sc)));
    }
    else if (a === "result-home") { show("home"); }
    else if (a === "result-wrong") { show("wrong"); }
    else if (a === "close-sheet") { closeSheet(); }
  });

  /* ---------------- home ---------------- */
  function renderHome() {
    var t = totals();
    var wc = wrongCount();
    var active = S.active;
    var html = "";
    html += "<h1>上岗证刷题</h1>";
    html += '<div class="muted">第1章 基础知识 · 共 ' + QUESTIONS.length + " 题（填空" +
      QUESTIONS.filter(function (q) { return q.type === "填空题"; }).length + " / 单选" +
      QUESTIONS.filter(function (q) { return q.type === "单选题"; }).length + " / 多选" +
      QUESTIONS.filter(function (q) { return q.type === "多选题"; }).length + " / 判断" +
      QUESTIONS.filter(function (q) { return q.type === "判断题"; }).length + "）</div>";

    html += '<div class="stat-row">' +
      '<div class="stat"><div class="k">今日已练</div><div class="v">' + S.daily.count + "<small>题</small></div></div>" +
      '<div class="stat"><div class="k">总正确率</div><div class="v">' + (t.done ? t.acc : "--") + (t.done ? "<small>%</small>" : "") + "</div></div>" +
      '<div class="stat"><div class="k">待复习错题</div><div class="v" style="color:var(--red)">' + wc + "<small>题</small></div></div>" +
      "</div>";

    html += '<div style="margin-top:16px"><button class="btn btn-primary" data-act="start-setup">开始答题</button></div>';

    if (active) {
      html += '<div style="margin-top:10px"><button class="btn btn-ghost" data-act="resume-round">继续上次一轮 · 第 ' +
        (active.idx + 1) + "/" + active.ids.length + " 题</button></div>";
    }
    html += '<div style="margin-top:10px"><button class="btn btn-ghost" data-act="wrong-practice">错题重练 · ' +
      wc + " 题</button></div>";

    html += '<div class="section-title"><span>章节练习</span><span class="muted" style="font-weight:500">已练 ' +
      t.seen + " / " + QUESTIONS.length + "</span></div>";
    SECTIONS.forEach(function (sec) {
      var st = sectionStat(sec);
      var pct = Math.round((st.seen / st.total) * 100);
      html += '<div class="chapter" data-act="chapter" data-sec="' + esc(sec) + '">' +
        '<div class="top"><span class="name">' + esc(sec) + '</span><span class="pill">' + st.total + "题</span></div>" +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="meta"><span>已练 ' + pct + "%</span><span>正确率 " + (st.acc === null ? "--" : st.acc + "%") + "</span></div>" +
        "</div>";
    });
    html += '<div style="height:8px"></div>';
    $("#homeScroll").innerHTML = html;
  }
  document.addEventListener("click", function (e) {
    var ch = e.target.closest('[data-act="chapter"]');
    if (ch) {
      setup = null;
      renderSetup(ch.dataset.sec);
      show("setup");
    }
  });

  /* ---------------- setup ---------------- */
  var setup = null;
  function defaultScope() {
    return { sections: [ALL], types: [ALL], size: 50, preferUnseen: false };
  }
  function renderSetup(preselectSection) {
    if (!setup) setup = defaultScope();
    if (preselectSection) setup.sections = [preselectSection];
    var pool = poolFor(setup);
    var html = "";

    html += '<div class="card"><h2>章节</h2><div class="chiprow" id="secChips">';
    html += chip("sec", ALL, "全部混合") ;
    SECTIONS.forEach(function (s) { html += chip("sec", s, s.replace(/^第(\d)节 /, "第$1节 ")); });
    html += "</div></div>";

    html += '<div class="card" style="margin-top:12px"><h2>题型</h2><div class="chiprow" id="typeChips">';
    html += chip("type", ALL, "全部题型");
    TYPES.forEach(function (t) { html += chip("type", t, t); });
    html += "</div></div>";

    html += '<div class="card" style="margin-top:12px"><h2>本轮题量</h2><div class="chiprow" id="sizeChips">';
    [[50, "50题"], [100, "100题"], [200, "200题"], [0, "全部"]].forEach(function (p) {
      html += chip("size", String(p[0]), p[1]);
    });
    html += "</div>";
    html += '<div class="setting" style="margin-top:12px"><div><div class="label">优先出没做过的题</div>' +
      '<div class="sub">开启后先抽未练过的题，练完再重复</div></div>' +
      '<button class="switch' + (setup.preferUnseen ? " on" : "") + '" data-act="toggle-unseen"></button></div>';
    html += "</div>";

    html += '<div class="card" style="margin-top:12px"><div class="row"><h2>填空题熟悉模式</h2>' +
      '<span class="pill' + (familiarLeft() > 0 ? "" : " grey") + '">' +
      (familiarLeft() > 0 ? "还剩 " + familiarLeft() + " 轮" : "已结束") + "</span></div>" +
      '<div class="muted" style="margin-top:8px;line-height:1.6">前两轮含填空题的练习，答案会直接显示在题干中（熟悉用，不计正确率）；两轮之后自动按正常方式作答判分。</div></div>';

    html += '<div class="card" style="margin-top:12px"><div class="row"><span class="muted">当前范围内可抽题</span>' +
      '<span style="font-weight:700;font-size:17px">' + pool.length + " 题</span></div>" +
      '<div class="muted" style="margin-top:6px">实际出题 ' +
      (setup.size === 0 ? pool.length : Math.min(setup.size, pool.length)) + " 题 · 顺序每轮随机打乱</div></div>";

    html += '<div style="height:10px"></div>';
    $("#setupScroll").innerHTML = html;
    wireChips();
  }
  function chip(kind, value, label) {
    var on = kind === "sec" ? setup.sections.indexOf(value) >= 0
      : kind === "type" ? setup.types.indexOf(value) >= 0
        : String(setup.size) === value;
    return '<div class="chip' + (on ? " on" : "") + '" data-kind="' + kind + '" data-val="' + esc(value) + '">' + esc(label) + "</div>";
  }
  function familiarLeft() {
    return S.settings.familiarAuto ? Math.max(0, 2 - S.fillFamiliarRounds) : 0;
  }
  function wireChips() {
    $("#setupScroll").querySelectorAll(".chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var kind = c.dataset.kind, val = c.dataset.val;
        if (kind === "sec") {
          if (val === ALL) setup.sections = [ALL];
          else {
            setup.sections = setup.sections.filter(function (s) { return s !== ALL; });
            var i = setup.sections.indexOf(val);
            if (i >= 0) setup.sections.splice(i, 1); else setup.sections.push(val);
            if (!setup.sections.length) setup.sections = [ALL];
          }
        } else if (kind === "type") {
          if (val === ALL) setup.types = [ALL];
          else {
            setup.types = setup.types.filter(function (s) { return s !== ALL; });
            var j = setup.types.indexOf(val);
            if (j >= 0) setup.types.splice(j, 1); else setup.types.push(val);
            if (!setup.types.length) setup.types = [ALL];
          }
        } else {
          setup.size = parseInt(val, 10);
        }
        renderSetup();
      });
    });
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest('[data-act="toggle-unseen"]')) {
      setup.preferUnseen = !setup.preferUnseen;
      renderSetup();
    }
  });

  /* ---------------- quiz ---------------- */
  function startRound() {
    guardActive(function () { startRoundWith(setup); });
  }
  function guardActive(next) {
    var r = S.active;
    var touched = r && (r.correct + r.wrong + r.familiar > 0 || r.idx > 0);
    if (!touched) { if (r) { rollbackRound(r); S.active = null; save(true); } next(); return; }
    openSheet('<div class="grab"></div><h3>还有一轮没做完</h3>' +
      '<div class="desc">上次的练习停在第 ' + (r.idx + 1) + " / " + r.ids.length +
      " 题（已完成 " + (r.correct + r.wrong + r.familiar) + " 题）。<br>你可以先接着做完，也可以放弃它开始新一轮。</div>" +
      '<button class="btn btn-primary" data-g="resume">继续上次一轮</button>' +
      '<button class="btn btn-ghost" data-g="drop">放弃该轮，开始新的</button>');
    sheet.querySelectorAll("[data-g]").forEach(function (b) {
      b.onclick = function () {
        closeSheet();
        if (b.dataset.g === "resume") { resumeRound(); }
        else { rollbackRound(S.active); S.active = null; save(true); next(); }
      };
    });
  }
  function startRoundWith(scope) {
    var r = makeRound(JSON.parse(JSON.stringify(scope)));
    if (!r.ids.length) { toast("该范围内没有题目"); return; }
    S.active = r;
    save(true);
    show("quiz");
    renderQuestion();
  }
  function resumeRound() {
    if (!S.active) return;
    S.active.resumeAt = Date.now();
    show("quiz");
    renderQuestion();
  }
  function startWrongRound() {
    var ids = wrongList(false).map(function (q) { return q.id; });
    if (!ids.length) { toast("错题本是空的，先去做几轮吧"); return; }
    guardActive(function () {
      shuffle(ids);
      S.active = {
        id: "r" + Date.now(), startedAt: Date.now(), resumeAt: Date.now(), elapsed: 0,
        scope: { sections: [ALL], types: [ALL], size: 0, preferUnseen: false, label: "错题重练" },
        ids: ids, idx: 0, correct: 0, wrong: 0, familiar: 0,
        familiarMode: false, familiarCounted: false, log: [], answers: {}, finished: false
      };
      save(true);
      show("quiz");
      renderQuestion();
    });
  }

  var cur = null;
  function renderQuestion() {
    var r = S.active;
    if (!r) { show("home"); return; }
    var q = QMAP[r.ids[r.idx]];
    if (!q) { finishRound(); return; }
    var st = r.answers[q.id] || null;
    var isFamiliar = r.familiarMode && q.type === "填空题";
    cur = st ? Object.assign({}, st) : {
      qid: q.id, sel: [], fill: [], judged: false, correct: null,
      override: [], submitted: false
    };
    if (!st) { r.answers[q.id] = cur; }

    if (isFamiliar && !r.familiarCounted) {
      r.familiarCounted = true;
      S.fillFamiliarRounds = Math.min(2, S.fillFamiliarRounds + 1);
      save();
    }

    $("#qIndex").textContent = "第 " + (r.idx + 1) + " / " + r.ids.length + " 题";
    $("#qLive").textContent = "本轮正确率 " + (r.correct + r.wrong ? roundAccuracy(r) + "%" : "--");
    $("#v-quiz").dataset.qid = q.id;
    var bar = $("#qBar");
    var pct = Math.round((r.idx / r.ids.length) * 100);
    bar.style.width = pct + "%";
    var acc = r.correct + r.wrong ? roundAccuracy(r) : 100;
    bar.style.background = acc >= 80 ? "var(--green)" : acc >= 60 ? "var(--amber)" : "var(--red)";

    var html = "";
    html += '<div class="qcard"><span class="tag' + (isFamiliar ? " grey" : "") + '">' + esc(q.type) +
      (q.type === "填空题" ? " · 共 " + (q.parts || []).length + " 空" : "") +
      (isFamiliar ? " · 熟悉模式" : "") + "</span>";
    html += '<div class="stem">' + stemHtml(q, isFamiliar) + "</div></div>";

    if (isFamiliar) {
      html += '<div class="familiar"><div class="head">熟悉模式 · 第 ' + S.fillFamiliarRounds + " / 2 轮</div>" +
        '<div class="line">答案已直接标在题干里（绿色部分），先读一遍建立印象，这一轮不计正确率。</div>' +
        '<div class="line" style="margin-top:6px"><b>答案：</b>' + esc((q.parts || [q.answer]).join("；")) + "</div></div>";
      $("#quizScroll").innerHTML = html;
      $("#quizBottom").innerHTML = '<button class="btn btn-primary" data-act="quiz-next">我已看完，下一题</button>';
      bindQuizNext();
      return;
    }

    if (q.type === "单选题" || q.type === "多选题") html += optionsHtml(q);
    if (q.type === "判断题") html += judgeHtml(q);
    if (q.type === "填空题") html += fillHtml(q);
    if (cur.judged) html += feedbackHtml(q, cur);

    $("#quizScroll").innerHTML = html;
    $("#quizBottom").innerHTML = bottomHtml(q, cur);
    bindQuizEvents(q);
  }

  function stemHtml(q, isFamiliar) {
    var s = esc(q.stem);
    if (q.type === "填空题" && isFamiliar && (q.parts || []).length) {
      var parts = q.parts.slice();
      var i = 0;
      s = s.replace(/____/g, function () {
        var v = parts[i++];
        return v ? '<span class="blank filled">' + esc(v) + "</span>" : '<span class="blank"></span>';
      });
    } else {
      s = s.replace(/____/g, '<span class="blank"></span>');
    }
    return s;
  }

  function optionsHtml(q) {
    var letters = q.answer.replace(/[^A-F]/g, "").split("");
    return q.options.map(function (o) {
      var cls = "opt";
      var flag = "";
      if (cur.judged) {
        cls += " disabled";
        if (letters.indexOf(o.key) >= 0) { cls += " right"; flag = '<span class="flag" style="color:var(--green-dark)">正确答案</span>'; }
        if (cur.sel.indexOf(o.key) >= 0 && letters.indexOf(o.key) < 0) { cls += " wrong"; flag = '<span class="flag" style="color:var(--red)">你的选择</span>'; }
        if (cur.sel.indexOf(o.key) >= 0 && letters.indexOf(o.key) >= 0) flag = '<span class="flag" style="color:var(--green-dark)">已选 · 正确</span>';
      } else if (cur.sel.indexOf(o.key) >= 0) cls += " sel";
      return '<div class="' + cls + '" data-key="' + o.key + '"><span class="key">' + o.key + "</span><span>" +
        esc(o.text) + flag + "</span></div>";
    }).join("");
  }
  function judgeHtml(q) {
    return '<div class="tfwrap">' + ["正确", "错误"].map(function (v) {
      var cls = "tf";
      if (cur.judged) {
        if (q.answer === v) cls += " right";
        else if (cur.sel[0] === v) cls += " wrong";
      } else if (cur.sel[0] === v) cls += " sel";
      return '<div class="' + cls + '" data-tf="' + v + '">' + v + "</div>";
    }).join("") + "</div>";
  }
  function fillHtml(q) {
    var parts = q.parts || [];
    if (!parts.length) parts = [q.answer];
    var out = "";
    parts.forEach(function (p, i) {
      var v = cur.fill[i] == null ? "" : cur.fill[i];
      var cls = "fillinput";
      if (cur.judged) {
        var okBlank = cur.override[i] || normText(v) === normText(p);
        cls += okBlank ? " right" : " wrong";
      }
      out += '<div class="fillrow"><div class="lbl"><span>第 ' + (i + 1) + " 空</span>" +
        (cur.judged ? '<button class="judge" data-judge="' + i + '">' +
          ((cur.override[i] || normText(v) === normText(p)) ? "判错" : "按意思判对") + "</button>" : "") +
        "</div>";
      out += '<input class="' + cls + '" data-fill="' + i + '" value="' + esc(v) + '" ' +
        (cur.judged ? "readonly" : "") + ' placeholder="输入答案"' + (cur.judged ? "" : ' inputmode="text"') + ">";
      if (cur.judged && !(cur.override[i] || normText(v) === normText(p))) {
        out += '<div class="fillmsg">正确答案：' + esc(p) + "</div>";
      } else if (cur.judged) {
        out += '<div class="fillmsg ok">正确</div>';
      }
      out += "</div>";
    });
    return out;
  }
  function feedbackHtml(q, c) {
    var ok = isCorrect(q, c);
    var ansText = q.type === "填空题" ? (q.parts || [q.answer]).join("；") : q.answer;
    var st = S.qstats[q.id];
    var times = st ? st.w : 0;
    var head = ok ? "答对了" + (times >= 1 ? " · 这道题你错过 " + times + " 次，本次答对" : "") : "答错了" + (times >= 1 ? " · 已加入错题本（第 " + times + " 次错）" : " · 已加入错题本");
    return '<div class="feedback' + (ok ? " ok" : "") + '"><div class="head">' + esc(head) + "</div>" +
      '<div class="line"><b>正确答案：</b>' + esc(ansText) + "</div>" +
      '<div class="line"><b>出处：</b>原书第 ' + q.sourcePage + " 页 · " + esc(q.section) + "</div></div>";
  }
  function isCorrect(q, c) {
    if (q.type === "填空题") {
      var parts = q.parts || [q.answer];
      return parts.every(function (p, i) {
        return c.override[i] || normText(c.fill[i]) === normText(p);
      });
    }
    if (q.type === "多选题") {
      var a = q.answer.replace(/[^A-F]/g, "").split("").sort().join("");
      return c.sel.slice().sort().join("") === a;
    }
    return c.sel[0] === q.answer;
  }
  function bottomHtml(q, c) {
    var r = S.active;
    var last = r.idx >= r.ids.length - 1;
    if (!c.judged) {
      if (q.type === "多选题") return '<button class="btn btn-primary" data-act="submit">提交答案（可多选）</button>';
      if (q.type === "填空题") return '<button class="btn btn-primary" data-act="submit">提交答案</button>';
      return '<button class="btn btn-primary" disabled>请选择答案</button>';
    }
    return '<button class="btn btn-primary" data-act="quiz-next">' + (last ? "完成本轮 · 查看成绩" : "下一题") + "</button>";
  }
  function bindQuizNext() {
    var btns = document.querySelectorAll('[data-act="quiz-next"]');
    btns.forEach(function (b) {
      b.onclick = function () {
        var r = S.active;
        addElapsed();
        if (r.idx >= r.ids.length - 1) { finishRound(); return; }
        r.idx++;
        save();
        renderQuestion();
        $("#quizScroll").scrollTop = 0;
      };
    });
  }
  function bindQuizEvents(q) {
    var sc = $("#quizScroll");
    sc.querySelectorAll(".opt").forEach(function (o) {
      o.onclick = function () {
        if (cur.judged || q.type === "填空题") return;
        var k = o.dataset.key;
        if (q.type === "单选题") { cur.sel = [k]; submitAnswer(q); }
        else {
          var i = cur.sel.indexOf(k);
          if (i >= 0) cur.sel.splice(i, 1); else cur.sel.push(k);
          S.active.answers[q.id] = cur;
          save();
          renderQuestion();
        }
      };
    });
    sc.querySelectorAll(".tf").forEach(function (t) {
      t.onclick = function () {
        if (cur.judged) return;
        cur.sel = [t.dataset.tf];
        submitAnswer(q);
      };
    });
    sc.querySelectorAll(".fillinput").forEach(function (inp) {
      inp.oninput = function () {
        cur.fill[parseInt(inp.dataset.fill, 10)] = inp.value;
        S.active.answers[q.id] = cur;
        save();
      };
    });
    sc.querySelectorAll("[data-judge]").forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.dataset.judge, 10);
        cur.override[i] = !cur.override[i];
        S.active.answers[q.id] = cur;
        save();
        renderQuestion();
      };
    });
    var sub = $("#quizBottom").querySelector('[data-act="submit"]');
    if (sub) sub.onclick = function () { submitAnswer(q); };
    bindQuizNext();
  }
  function submitAnswer(q) {
    if (q.type === "多选题" && !cur.sel.length) { toast("请至少选择一项"); return; }
    if (q.type === "填空题" && (q.parts || []).length && !(cur.fill || []).some(function (v) { return v; })) {
      toast("请至少填写一个空"); return;
    }
    cur.judged = true;
    cur.submitted = true;
    cur.correct = isCorrect(q, cur);
    S.active.answers[q.id] = cur;
    commitAnswer(S.active, q.id, cur.correct, false);
    save(true);
    renderQuestion();
  }

  /* ---------------- exit ---------------- */
  function askExit() {
    var r = S.active;
    if (!r) { show("home"); return; }
    var answered = r.correct + r.wrong + r.familiar;
    openSheet(
      '<div class="grab"></div><h3>退出本轮答题？</h3>' +
      '<div class="desc">已完成 ' + answered + " / " + r.ids.length + " 题" +
      (r.correct + r.wrong ? "，本轮正确率 " + roundAccuracy(r) + "%" : "") +
      "。<br>选择「保存并退出」后，本轮进度会保留，下次可以从这里接着做。</div>" +
      '<button class="btn btn-ghost" data-x="stay">继续答题</button>' +
      '<button class="btn btn-ghost" data-x="restart">重新开始本轮（清空本轮进度）</button>' +
      '<button class="btn btn-danger" data-x="save">保存并退出，稍后继续</button>'
    );
    sheet.querySelectorAll("[data-x]").forEach(function (b) {
      b.onclick = function () {
        var x = b.dataset.x;
        closeSheet();
        if (x === "stay") return;
        if (x === "restart") {
          rollbackRound(S.active);
          var scope = S.active.scope;
          S.active = null;
          save(true);
          startRoundWith(scope);
          toast("已重新开始本轮");
        } else {
          addElapsed();
          save(true);
          show("home");
          toast("本轮进度已保存");
        }
      };
    });
  }

  /* ---------------- result ---------------- */
  function renderResult(r) {
    var done = r.correct + r.wrong;
    var acc = done ? roundAccuracy(r) : 0;
    var prev = S.rounds.length > 1 ? S.rounds[S.rounds.length - 2] : null;
    var delta = prev && prev.answered ? acc - prev.acc : null;
    if (!done) delta = null;
    var hist = S.rounds.filter(function (x) { return x.answered > 0; }).slice(-10);
    var html = "";
    html += '<h1 class="center" style="margin-top:6px">本轮完成</h1>';
    html += '<div class="muted center" style="margin-top:4px">' + esc(scopeLabel(r.scope)) + " · " +
      r.ids.length + " 题 · 用时 " + fmtTime(r.elapsed) + "</div>";
    var circ = 2 * Math.PI * 52;
    var ringColor = !done ? "var(--amber)" : acc >= 80 ? "var(--green)" : acc >= 60 ? "var(--amber)" : "var(--red)";
    html += '<div class="ring"><svg viewBox="0 0 120 120" width="170" height="170">' +
      '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="11"/>' +
      '<circle cx="60" cy="60" r="52" fill="none" stroke="' + ringColor + '" stroke-width="11" stroke-linecap="round" ' +
      'stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + (done ? (circ * (1 - acc / 100)).toFixed(1) : circ.toFixed(1)) +
      '" transform="rotate(-90 60 60)"/></svg>' +
      '<div class="center"><div class="big"' + (done ? "" : ' style="font-size:22px"') + ">" +
      (done ? acc + "%" : "熟悉轮") + '</div><div class="small">' + (done ? "正确率" : "不计正确率") + "</div></div></div>";
    html += '<div class="result-grid">' +
      '<div class="cell"><div class="k">答对</div><div class="v" style="color:var(--green-dark)">' + r.correct + "</div></div>" +
      '<div class="cell"><div class="k">答错</div><div class="v" style="color:var(--red)">' + r.wrong + "</div></div>" +
      (r.familiar ? '<div class="cell"><div class="k">熟悉（不算分）</div><div class="v">' + r.familiar + "</div></div>" : "") +
      '<div class="cell"><div class="k">较上轮</div><div class="v" style="color:' +
      (delta === null ? "var(--ink-3)" : delta >= 0 ? "var(--green-dark)" : "var(--red)") + '">' +
      (delta === null ? "--" : (delta >= 0 ? "+" : "") + delta + "%") + "</div></div>" +
      "</div>";
    if (!done) {
      html += '<div class="familiar" style="margin-top:16px"><div class="head">熟悉轮已完成</div>' +
        '<div class="line">这一轮只看答案、熟悉内容，所以不计正确率。' +
        (familiarLeft() > 0 ? "还有 " + familiarLeft() + " 轮熟悉，之后填空题开始正常作答判分。" : "两轮熟悉已结束，填空题已切换为逐空作答 + 自动判分。") +
        "</div></div>";
    }
    html += '<div class="card" style="margin-top:16px"><div class="row"><h2>正确率趋势</h2>' +
      '<span class="mini">最近 ' + hist.length + " 轮</span></div>" +
      trendSvg(hist.map(function (h) { return h.acc; }), 320, 100) + "</div>";
    var wrongN = r.log.filter(function (e) { return !e.ok; }).length;
    html += '<div style="margin-top:16px"><button class="btn btn-primary" data-act="result-wrong">' +
      (wrongN ? "查看本轮错题（" + wrongN + "）" : "查看错题本") + "</button></div>" +
      '<div class="grid2" style="margin-top:10px">' +
      '<button class="btn btn-ghost" data-act="again">再来一轮</button>' +
      '<button class="btn btn-ghost" data-act="result-home">返回首页</button></div>';
    html += '<div style="height:10px"></div>';
    $("#resultScroll").innerHTML = html;
  }
  function scopeLabel(scope) {
    if (scope.label) return scope.label;
    var sec = scope.sections.indexOf(ALL) >= 0 ? "全部混合" : scope.sections.length + " 个章节";
    var ty = scope.types.indexOf(ALL) >= 0 ? "全部题型" : scope.types.join("/");
    return sec + " · " + ty;
  }
  function fmtTime(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function trendSvg(values, w, h) {
    if (!values.length) return '<div class="empty">还没有完成过整轮</div>';
    var n = values.length;
    var pad = 16, top = 12, bottom = 18;
    var iw = w - pad * 2, ih = h - top - bottom;
    var step = n > 1 ? iw / (n - 1) : 0;
    var pts = values.map(function (v, i) {
      return [pad + i * step, top + ih * (1 - (v - 40) / 60)];
    });
    var path = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = path + " L" + pts[pts.length - 1][0].toFixed(1) + " " + (top + ih) + " L" + pts[0][0].toFixed(1) + " " + (top + ih) + " Z";
    var dots = pts.map(function (p, i) {
      var last = i === pts.length - 1;
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (last ? 5 : 2.5) +
        '" fill="' + (last ? "var(--green)" : "#fff") + '" stroke="var(--green)" stroke-width="2"/>';
    }).join("");
    return '<svg class="chart" viewBox="0 0 ' + w + " " + h + '" height="' + h + '">' +
      '<path d="' + area + '" fill="var(--green)" fill-opacity=".08"/>' +
      '<path d="' + path + '" fill="none" stroke="var(--green)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots +
      '<line x1="' + pad + '" y1="' + (top + ih) + '" x2="' + (w - pad) + '" y2="' + (top + ih) + '" stroke="var(--line)" stroke-width="1.5"/>' +
      '<text x="' + pad + '" y="' + (h - 4) + '" font-size="10" fill="var(--ink-3)">第1轮</text>' +
      '<text x="' + (w - pad) + '" y="' + (h - 4) + '" font-size="10" fill="var(--ink-3)" text-anchor="end">第' + n + "轮</text></svg>";
  }

  /* ---------------- wrong book ---------------- */
  var wrongSort = "count";
  function renderWrong() {
    var list = wrongList(wrongSort === "done");
    var html = "";
    html += "<h1>错题本</h1>";
    html += '<div class="muted">共 ' + wrongCount() + " 题待巩固" +
      (wrongList(true).length - wrongCount() > 0 ? "（另有 " + (wrongList(true).length - wrongCount()) + " 题已连续答对 2 次，自动移出）" : "") + "</div>";
    html += '<div class="chiprow">' +
      wchip("count", "错误次数 ↓") + wchip("recent", "最近答错") + wchip("section", "按章节") + wchip("done", "已巩固") +
      "</div>";
    if (wrongSort !== "done" && list.length) {
      html += '<div style="margin-top:14px"><button class="btn btn-primary" data-act="wrong-practice">开始错题专项练习（' +
        list.length + " 题）</button></div>";
    }
    if (!list.length) {
      html += '<div class="empty">' + (wrongSort === "done" ? "还没有已巩固的题目" : "暂时没有错题，继续保持 👍") + "</div>";
    } else {
      if (wrongSort === "section") list.sort(function (a, b) { return a.section.localeCompare(b.section) || S.qstats[b.id].w - S.qstats[a.id].w; });
      else if (wrongSort === "recent") list.sort(function (a, b) { return S.qstats[b.id].lw - S.qstats[a.id].lw; });
      else list.sort(function (a, b) { return S.qstats[b.id].w - S.qstats[a.id].w || S.qstats[b.id].lw - S.qstats[a.id].lw; });
      var shown = list.slice(0, 200);
      shown.forEach(function (q) {
        var st = S.qstats[q.id];
        html += '<div class="wrong-item" data-qid="' + q.id + '">' +
          '<div class="t">' + esc(q.stem.length > 72 ? q.stem.slice(0, 72) + "…" : q.stem) + "</div>" +
          '<div class="meta"><span class="badge">错 ' + st.w + " 次</span>" +
          '<span class="mini">' + esc(q.section) + " · " + esc(q.type) + "</span>" +
          (st.streak >= 1 ? '<span class="mini">已连对 ' + st.streak + " 次</span>" : "") +
          "</div></div>";
      });
      if (list.length > shown.length) html += '<div class="empty">已显示前 200 题，共 ' + list.length + " 题</div>";
    }
    html += '<div style="height:10px"></div>';
    $("#wrongScroll").innerHTML = html;
    $("#wrongScroll").querySelectorAll(".chip").forEach(function (c) {
      c.onclick = function () { wrongSort = c.dataset.sort; renderWrong(); };
    });
    $("#wrongScroll").querySelectorAll(".wrong-item").forEach(function (it) {
      it.onclick = function () { openQuestionDetail(it.dataset.qid); };
    });
  }
  function wchip(kind, label) {
    return '<div class="chip' + (wrongSort === kind ? " on grey" : "") + '" data-sort="' + kind + '">' + label + "</div>";
  }
  function openQuestionDetail(qid) {
    var q = QMAP[qid], st = S.qstats[qid] || { w: 0, c: 0, s: 0 };
    var ansText = q.type === "填空题" ? (q.parts || [q.answer]).join("；") : q.answer;
    var opts = (q.options || []).map(function (o) {
      var right = q.answer.indexOf(o.key) >= 0;
      return '<div class="opt disabled' + (right ? " right" : "") + '"><span class="key">' + o.key + "</span><span>" +
        esc(o.text) + "</span></div>";
    }).join("");
    openSheet('<div class="grab"></div><h3>题目详情</h3>' +
      '<div class="desc" style="text-align:left">' + esc(q.section) + " · " + esc(q.type) + " · 原书第 " + q.sourcePage + " 页</div>" +
      '<div class="qcard" style="margin-top:14px"><div class="stem">' + stemHtml(q, false) + "</div>" + opts + "</div>" +
      '<div class="feedback ok" style="margin-top:12px"><div class="head">正确答案：' + esc(ansText) + "</div>" +
      '<div class="line">累计作答 ' + st.s + " 次 · 答对 " + st.c + " 次 · 答错 " + st.w + " 次</div></div>" +
      '<button class="btn btn-ghost" data-act="close-sheet">关闭</button>');
  }

  /* ---------------- stats ---------------- */
  function renderStats() {
    var t = totals();
    var html = "";
    html += "<h1>学习统计</h1>";
    html += '<div class="muted">累计答题 ' + t.done + " 题 · 总正确率 " + (t.done ? t.acc + "%" : "--") + "</div>";

    var hist = S.rounds.filter(function (r) { return r.answered > 0; }).slice(-10);
    html += '<div class="card" style="margin-top:14px"><div class="row"><h2>每轮正确率变化</h2>' +
      '<span class="mini">最近 ' + hist.length + " 轮</span></div>";
    html += trendSvgAll(hist);
    if (hist.length) {
      var vals = hist.map(function (h) { return h.acc; });
      var avg = Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
      html += '<div class="mini" style="margin-top:6px">平均 ' + avg + "%　最高 " + Math.max.apply(null, vals) +
        "%　最低 " + Math.min.apply(null, vals) + "%</div>";
    } else html += '<div class="empty">完成一整轮后这里会出现趋势图</div>';
    html += "</div>";

    html += '<div class="card" style="margin-top:12px"><h2>各章节掌握度</h2><div class="bars">';
    SECTIONS.forEach(function (sec) {
      var st = sectionStat(sec);
      var acc = st.acc === null ? 0 : st.acc;
      var color = st.acc === null ? "var(--line)" : acc >= 85 ? "var(--green)" : acc >= 75 ? "var(--green)" : "var(--amber)";
      html += '<div class="b"><span class="n">' + esc(sec.replace(/^第(\d)节 /, "第$1节 ")) + '</span>' +
        '<span class="track"><i style="width:' + acc + "%;background:" + color + '"></i></span>' +
        '<span class="p">' + (st.acc === null ? "--" : acc + "%") + "</span></div>";
    });
    html += "</div></div>";

    var wrongs = wrongList(false).sort(function (a, b) { return S.qstats[b.id].w - S.qstats[a.id].w; }).slice(0, 10);
    html += '<div class="card" style="margin-top:12px"><div class="row"><h2>错得最多的题</h2>' +
      '<span class="mini">Top 10</span></div>';
    if (!wrongs.length) html += '<div class="empty">还没有错题</div>';
    wrongs.forEach(function (q) {
      html += '<div class="wrong-item" data-qid="' + q.id + '" style="box-shadow:none;border:1px solid var(--line)">' +
        '<div class="t">' + esc(q.stem.length > 56 ? q.stem.slice(0, 56) + "…" : q.stem) + "</div>" +
        '<div class="meta"><span class="badge">错 ' + S.qstats[q.id].w + " 次</span>" +
        '<span class="mini">' + esc(q.section) + "</span></div></div>";
    });
    html += "</div>";

    if (S.rounds.length) {
      html += '<div class="card" style="margin-top:12px"><h2>历次练习</h2>';
      S.rounds.slice(-15).reverse().forEach(function (r) {
        var d = new Date(r.ts);
        html += '<div class="setting"><div><div class="label">' + esc(scopeLabel(r.scope)) + "</div>" +
          '<div class="sub">' + (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
          (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes() +
          " · " + r.answered + " 题 · 用时 " + fmtTime(r.duration) + "</div></div>" +
          '<span class="pill' + (r.acc >= 80 ? "" : " red") + '">' + r.acc + "%</span></div>";
      });
      html += "</div>";
    }
    html += '<div style="height:10px"></div>';
    $("#statsScroll").innerHTML = html;
    $("#statsScroll").querySelectorAll(".wrong-item").forEach(function (it) {
      it.onclick = function () { openQuestionDetail(it.dataset.qid); };
    });
  }
  function trendSvgAll(hist) {
    if (!hist.length) return "";
    var w = 330, h = 140, pad = 18, top = 14, bottom = 22;
    var iw = w - pad * 2, ih = h - top - bottom;
    var vals = hist.map(function (x) { return x.acc; });
    var step = vals.length > 1 ? iw / (vals.length - 1) : 0;
    var pts = vals.map(function (v, i) { return [pad + i * step, top + ih * (1 - (v - 40) / 60)]; });
    var path = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = path + " L" + pts[pts.length - 1][0].toFixed(1) + " " + (top + ih) + " L" + pts[0][0].toFixed(1) + " " + (top + ih) + " Z";
    var minI = vals.indexOf(Math.min.apply(null, vals));
    var dots = pts.map(function (p, i) {
      if (i === minI && vals.length > 2) return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="#fff" stroke="var(--red)" stroke-width="2.5"/>';
      if (i === pts.length - 1) return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5" fill="var(--green)" stroke="#fff" stroke-width="2"/>';
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.5" fill="#fff" stroke="var(--green)" stroke-width="2"/>';
    }).join("");
    return '<svg class="chart" viewBox="0 0 ' + w + " " + h + '" height="' + h + '">' +
      '<line x1="' + pad + '" y1="' + (top + ih * 0.5) + '" x2="' + (w - pad) + '" y2="' + (top + ih * 0.5) + '" stroke="var(--line)"/>' +
      '<line x1="' + pad + '" y1="' + (top + ih) + '" x2="' + (w - pad) + '" y2="' + (top + ih) + '" stroke="var(--line)"/>' +
      '<path d="' + area + '" fill="var(--green)" fill-opacity=".08"/>' +
      '<path d="' + path + '" fill="none" stroke="var(--green)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots +
      '<text x="' + (w - pad) + '" y="' + (h - 6) + '" font-size="10" fill="var(--ink-3)" text-anchor="end">最新一轮 ' + vals[vals.length - 1] + "%</text>" +
      "</svg>";
  }

  /* ---------------- me / settings ---------------- */
  function renderMe() {
    var t = totals();
    var left = familiarLeft();
    var html = "";
    html += "<h1>我的</h1>";
    html += '<div class="muted">数据全部保存在本机，不会上传</div>';
    html += '<div class="card" style="margin-top:14px">' +
      '<div class="setting"><div><div class="label">深色模式</div><div class="sub">夜间刷题更护眼</div></div>' +
      '<button class="switch' + (S.settings.dark ? " on" : "") + '" data-act="toggle-dark"></button></div>' +
      '<div class="setting"><div><div class="label">字号大小</div><div class="sub">题干与选项同步缩放</div></div>' +
      '<div class="chiprow" style="margin:0">' +
      ["s", "m", "l"].map(function (f) {
        return '<div class="chip' + (S.settings.fs === f ? " on" : "") + '" data-fs="' + f + '">' +
          ({ s: "小", m: "标准", l: "大" })[f] + "</div>";
      }).join("") + "</div></div>" +
      '<div class="setting"><div><div class="label">填空题熟悉模式</div><div class="sub">' +
      (left > 0 ? "还剩 " + left + " 轮自动熟悉（答案直接显示在题干里）" : "已完成两轮熟悉，填空题正常作答判分") +
      "</div></div>" +
      '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">' +
      '<button class="switch' + (S.settings.familiarAuto ? " on" : "") + '" data-act="toggle-familiar"></button>' +
      '<button class="judge" data-act="reset-familiar">重新计数</button></div></div>' +
      "</div>";

    html += '<div class="card" style="margin-top:12px"><h2>学习概览</h2>' +
      '<div class="setting"><div class="label">已练题目</div><div style="font-weight:700">' + t.seen + " / " + QUESTIONS.length + "</div></div>" +
      '<div class="setting"><div class="label">累计作答</div><div style="font-weight:700">' + t.done + " 次</div></div>" +
      '<div class="setting"><div class="label">总正确率</div><div style="font-weight:700">' + (t.done ? t.acc + "%" : "--") + "</div></div>" +
      '<div class="setting"><div class="label">完成轮数</div><div style="font-weight:700">' + S.rounds.length + " 轮</div></div>" +
      "</div>";

    html += '<div class="card" style="margin-top:12px"><h2>数据备份</h2>' +
      '<div class="muted" style="margin-top:8px;line-height:1.6">换手机或清理浏览器数据前，先导出备份；在新设备打开本应用后导入即可恢复全部记录。</div>' +
      '<button class="btn btn-ghost" style="margin-top:12px" data-act="export">导出备份文件</button>' +
      '<button class="btn btn-ghost" style="margin-top:10px" data-act="import">导入备份文件</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" style="display:none">' +
      '<button class="btn btn-danger" style="margin-top:10px" data-act="reset-all">清空全部记录</button>' +
      "</div>";

    html += '<div class="card" style="margin-top:12px"><h2>关于</h2>' +
      '<div class="muted" style="margin-top:8px;line-height:1.7">题库：《生态环境监测技术人员持证上岗考核理论试题集》第1章 基础知识<br>' +
      "共 " + QUESTIONS.length + " 题（填空题、单选题、多选题、判断题，已剔除简答题与计算题）<br>" +
      "应用版本 v1.0 · 离线运行，无需联网</div></div>";
    html += '<div style="height:12px"></div>';
    $("#meScroll").innerHTML = html;

    $("#meScroll").querySelectorAll("[data-fs]").forEach(function (c) {
      c.onclick = function () { S.settings.fs = c.dataset.fs; applySettings(); save(true); renderMe(); };
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var a = t.dataset.act;
    if (a === "toggle-dark") { S.settings.dark = !S.settings.dark; applySettings(); save(true); renderMe(); }
    else if (a === "toggle-familiar") { S.settings.familiarAuto = !S.settings.familiarAuto; save(true); renderMe(); }
    else if (a === "reset-familiar") {
      S.fillFamiliarRounds = 0; save(true); renderMe(); toast("填空题熟悉轮次已重置");
    }
    else if (a === "export") exportData();
    else if (a === "import") $("#importFile").click();
    else if (a === "reset-all") {
      openSheet('<div class="grab"></div><h3>清空全部记录？</h3>' +
        '<div class="desc">将删除全部答题记录、错题本与正确率统计，题库本身不受影响。此操作不可撤销。</div>' +
        '<button class="btn btn-danger" data-x="yes">确认清空</button>' +
        '<button class="btn btn-ghost" data-x="no">取消</button>');
      sheet.querySelectorAll("[data-x]").forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.x === "yes") {
            S = defaults(); applySettings(); save(true); closeSheet(); show("home"); toast("已清空全部记录");
          } else closeSheet();
        };
      });
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "importFile" && e.target.files && e.target.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var data = JSON.parse(fr.result);
          if (!data || !data.qstats) throw new Error("bad");
          S.settings = Object.assign(defaults().settings, data.settings || {});
          S.qstats = data.qstats || {};
          S.rounds = data.rounds || [];
          S.fillFamiliarRounds = data.fillFamiliarRounds || 0;
          S.daily = data.daily || { date: today(), count: 0 };
          applySettings(); save(true); show("home");
          toast("备份已导入");
        } catch (err) { toast("文件格式不正确"); }
      };
      fr.readAsText(e.target.files[0]);
      e.target.value = "";
    }
  });
  function exportData() {
    var blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "上岗证刷题-备份-" + today() + ".json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast("备份文件已导出");
  }

  /* ---------------- settings apply ---------------- */
  function applySettings() {
    document.documentElement.classList.toggle("dark", !!S.settings.dark);
    document.documentElement.dataset.fs = S.settings.fs || "m";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", S.settings.dark ? "#0E1512" : "#1AA179");
  }

  /* ---------------- boot ---------------- */
  applySettings();
  if (S.active) {
    S.active.resumeAt = Date.now();
  }
  show("home");
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { });
    });
  }
})();
