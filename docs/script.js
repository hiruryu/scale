console.log("script.js loaded");

let scaleNotes = {};

const searchBox = document.getElementById('searchBox');
const details   = document.getElementById('details');
const countSpan = document.getElementById('word-count');
const sortSelect = document.getElementById('sortSelect');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');

let currentPage = 1;
const itemsPerPage = 18;
let currentHits = [];

async function loadScales() {
  try {
    const res = await fetch('scales.json');
    const json = await res.json();

    Object.entries(json).forEach(([name, obj]) => {
      scaleNotes[name] = {
        notes:     (obj.notes    || []).map(n => n.trim()),
        jpname:    obj.jpname    || '',
        aliases:   obj.aliases   || [],
        dimension: obj.dimension || '',
        related:   obj.related   || [],
        deta:      obj.deta      || []
      };
    });

    countSpan.textContent = Object.keys(scaleNotes).length;
  } catch (e) {
    console.error("Failed to load scales.json:", e);
  }
}

function cleanTokens(rawTokens) {
  return rawTokens.map(s => s.trim()).filter(s => /^[0-9/]+$/.test(s));
}

function findScales(rawTokens) {
  const toks = cleanTokens(rawTokens);
  if (toks.length === 0) return [];

  return Object.entries(scaleNotes)
    .filter(([_, { notes }]) =>
      toks.every(t => notes.some(note => note.includes(t)))
    )
    .map(([name]) => name);
}

function parseRatio(ratioStr) {
  const [numerator, denominator] = ratioStr.split('/').map(Number);
  return denominator ? numerator / denominator : numerator;
}

function playJustScale(scaleName, mode = 'arpeggio') {
  const scale = scaleNotes[scaleName];
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const inputFreq = parseFloat(document.getElementById('baseFreqInput')?.value);
  const baseFreq = isNaN(inputFreq) ? 440 : inputFreq;
  let currentTime = context.currentTime;

  scale.deta.forEach((ratioStr, index) => {
    const ratio = parseRatio(ratioStr);
    const freq = baseFreq * ratio;

    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.frequency.value = freq;
    osc.type = "sawtooth";
    gain.gain.value = 0.3;

    osc.connect(gain);
    gain.connect(context.destination);

    if (mode === 'arpeggio') {
      const start = currentTime + index * 0.25;
      osc.start(start);
      osc.stop(start + 0.25);
    } else {
      osc.start(currentTime);
      osc.stop(currentTime + 1.2);
    }
  });
}

function sortScales(hits, method) {
  return hits.sort((aName, bName) => {
    const a = scaleNotes[aName];
    const b = scaleNotes[bName];

    switch (method) {
      case 'length':
        return a.notes.length - b.notes.length;
      case 'dimension':
        return (a.dimension || '').localeCompare(b.dimension || '');
      case 'related':
        return (b.related?.length || 0) - (a.related?.length || 0);
      case 'name':
      default:
        return aName.localeCompare(bName);
    }
  });
}

function updatePaginationDisplay(totalPages) {
  pageInfo.textContent = `${currentPage} / ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

function renderPage() {
  details.innerHTML = '';

  const totalPages = Math.ceil(currentHits.length / itemsPerPage);
  updatePaginationDisplay(totalPages);

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = currentHits.slice(start, end);

  const ul = document.createElement('ul');
  pageItems.forEach(name => {
    const { notes, jpname, aliases, dimension, related } = scaleNotes[name];
    const li = document.createElement('li');

    const tooltipContent = [
      jpname ? `日本名：${jpname}` : null,
      aliases.length ? `別名：${aliases.join('，')}` : null,
      dimension ? `次元限界（ limit ）：${dimension}` : null,
    ].filter(Boolean).join('<br>');

    const relatedHTML = related.length
      ? `<div class="related">関連スケール：${related.map(r => `
          <span class="related-name clickable" data-scale="${r}">${r}</span>
        `).join('，')}</div>`
      : '';

    let colorClass = '';
    switch (dimension) {
      case '2D': colorClass = 'dim-2d'; break;
      case '3D': colorClass = 'dim-3d'; break;
      case '4D': colorClass = 'dim-4d'; break;
      case '5D': colorClass = 'dim-5d'; break;
      case '6D': colorClass = 'dim-6d'; break;
    }

    li.innerHTML = `
      <span class="tooltip">
        <strong class="scale-name ${colorClass}">${name}</strong>
        <span class="tooltip-text">${tooltipContent}</span>
      </span>
      ： ${notes.join('，')}
      <button class="play-button" data-name="${name}">🎵</button>
      ${relatedHTML}
    `;

    ul.appendChild(li);
  });

  details.appendChild(ul);

  document.querySelectorAll('.play-button').forEach(btn => {
    btn.addEventListener('click', () => {
      const scaleName = btn.getAttribute('data-name');
      playJustScale(scaleName);
    });
  });

  document.querySelectorAll('.related-name.clickable').forEach(el => {
    el.addEventListener('click', () => {
      const scaleName = el.getAttribute('data-scale');
      const scale = scaleNotes[scaleName];
      if (scale) {
        searchBox.value = scale.notes.join(' ');
        currentPage = 1;
        renderResults();
      }
    });
  });
}

function renderResults() {
  const raw = searchBox.value;
  const tokens = raw.split(/[\s,]+/).filter(Boolean);

  if (tokens.length === 0 || cleanTokens(tokens).length === 0) {
    details.innerHTML = '<p class="placeholder">コードを入力してください。</p>';
    pageInfo.textContent = '0 / 0';
    return;
  }

  const hits = findScales(tokens);
  if (hits.length === 0) {
    details.innerHTML = '<p>該当スケールが見つかりません…</p>';
    pageInfo.textContent = '0 / 0';
    return;
  }

  const sortMethod = sortSelect?.value || 'name';
  currentHits = sortScales(hits, sortMethod);
  currentPage = 1;
  renderPage();
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage();
  }
});

nextPageBtn.addEventListener('click', () => {
  const totalPages = Math.ceil(currentHits.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderPage();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadScales();
  searchBox.addEventListener('input', renderResults);
  sortSelect.addEventListener('change', renderResults);
});
