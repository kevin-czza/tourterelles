// Destination Inconnue — logique du site.
// Tout le contenu vient de contenu.js (chiffré) ; le mot-code est la clé.
(() => {
  'use strict';

  const LS = 'tg-aventure-v1';
  const CONTENU = window.CONTENU;
  const CHAMPS = ['passagers', 'classe', 'saison', 'bagages', 'date', 'porte'];
  const dechiffres = new Map(); // id -> contenu en clair (objet)
  let minuterie = null;

  /* ---------- état ---------- */

  function lireEtat() {
    try { return JSON.parse(localStorage.getItem(LS)) || { codes: {} }; }
    catch { return { codes: {} }; }
  }
  function sauveEtat(e) {
    try { localStorage.setItem(LS, JSON.stringify(e)); } catch {}
  }
  let etat = lireEtat();

  /* ---------- crypto (miroir de outils/chiffre.mjs) ---------- */

  function normaliseCode(s) {
    return String(s).toUpperCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');
  }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function dechiffre(code, payload) {
    try {
      const mat = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(normaliseCode(code)), 'PBKDF2', false, ['deriveKey']);
      const cle = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: unb64(payload.salt), iterations: CONTENU.iterations, hash: 'SHA-256' },
        mat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const clair = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(payload.iv) }, cle, unb64(payload.ct));
      return JSON.parse(new TextDecoder().decode(clair));
    } catch {
      return null;
    }
  }

  /* ---------- aides ---------- */

  const $ = (sel, parent) => (parent || document).querySelector(sel);

  function heureCourte(iso) {
    return new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(iso));
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visible'), 4000);
  }

  /* ---------- billet ---------- */

  function majBillet() {
    const dl = $('#billet-champs');
    dl.innerHTML = '';
    const valeurs = {};
    for (const contenu of dechiffres.values()) {
      for (const ligne of contenu.billet || []) valeurs[ligne.champ] = ligne.valeur;
    }
    for (const champ of CHAMPS) {
      const dt = document.createElement('dt');
      dt.textContent = champ;
      const dd = document.createElement('dd');
      if (valeurs[champ]) { dd.textContent = valeurs[champ]; }
      else { dd.textContent = '·····'; dd.className = 'masque'; }
      dl.append(dt, dd);
    }
  }

  function revelerDestination(nom) {
    const valeur = $('#dest-valeur');
    valeur.textContent = nom;
    valeur.classList.remove('masque');
    $('#dest-note').hidden = true;
  }

  /* ---------- passeport ---------- */

  function majPasseport(nouvelId) {
    const ol = $('#tampons');
    ol.innerHTML = '';
    for (const ch of CONTENU.chapitres) {
      const li = document.createElement('li');
      const contenu = dechiffres.get(ch.id);
      if (contenu) {
        li.className = 'tampon obtenu' + (ch.id === nouvelId ? ' nouveau' : '');
        li.textContent = contenu.tampon;
      } else {
        li.className = 'tampon';
        li.textContent = 'nº ' + ch.id;
      }
      ol.append(li);
    }
  }

  /* ---------- chapitres ---------- */

  function construireChapitres() {
    const ol = $('#liste-chapitres');
    for (const ch of CONTENU.chapitres) {
      const li = document.createElement('li');
      li.className = 'enveloppe';
      li.dataset.id = ch.id;
      li.innerHTML = `
        <div class="env-tete">
          <span class="env-num" aria-hidden="true">${ch.id}</span>
          <div>
            <h3>${ch.titre}</h3>
            <p class="env-sous">${ch.sousTitre}</p>
          </div>
        </div>
        <form class="env-form">
          <label for="code-${ch.id}">Le mot découvert dans l'énigme</label>
          <div class="env-saisie">
            <input id="code-${ch.id}" autocomplete="off" autocapitalize="characters"
                   spellcheck="false" placeholder="·····" required>
            <button>Ouvrir</button>
          </div>
          <p class="env-msg" role="status"></p>
        </form>`;
      $('form', li).addEventListener('submit', (ev) => {
        ev.preventDefault();
        tenterCode(ch, li);
      });
      ol.append(li);
    }
  }

  async function tenterCode(ch, li) {
    const input = $('input', li);
    const bouton = $('button', li);
    const msg = $('.env-msg', li);
    const code = normaliseCode(input.value);
    if (!code) return;
    bouton.disabled = true;
    msg.textContent = '';
    const contenu = await dechiffre(code, ch.payload);
    bouton.disabled = false;
    if (!contenu) {
      msg.textContent = 'Ce n’est pas le bon mot… relisez l’énigme.';
      li.classList.remove('erreur');
      void li.offsetWidth; // relance l'animation
      li.classList.add('erreur');
      return;
    }
    etat.codes[ch.id] = code;
    sauveEtat(etat);
    dechiffres.set(ch.id, contenu);
    ouvreChapitre(ch, li);
    majBillet();
    majPasseport(ch.id);
    majJourJ();
  }

  function ouvreChapitre(ch, li) {
    li.classList.add('ouverte');
    $('form', li).remove();
    const div = document.createElement('div');
    div.className = 'env-contenu';
    div.innerHTML = dechiffres.get(ch.id).html;
    li.append(div);
    const photo = dechiffres.get(ch.id).photo;
    if (photo) {
      const figure = document.createElement('figure');
      figure.className = 'polaroid';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => figure.classList.add('manquante'));
      img.src = 'photos/' + photo;
      figure.append(img);
      div.append(figure);
    }
  }

  /* ---------- défis ---------- */

  function construireDefis() {
    const ol = $('#liste-defis');
    if (!ol || !CONTENU.defis) return;
    for (const d of CONTENU.defis) {
      const li = document.createElement('li');
      li.className = 'defi';
      li.dataset.id = d.id;
      li.innerHTML = `
        <div class="env-tete">
          <span class="env-num" aria-hidden="true">${d.id}</span>
          <div>
            <h3>${d.titre}</h3>
            <p class="env-sous">${d.consigne}</p>
          </div>
        </div>
        <div class="defi-jeu"></div>
        <p class="env-msg" role="status"></p>`;
      ol.append(li);
      montreJeu(d, li);
    }
  }

  function montreJeu(d, li) {
    const zone = $('.defi-jeu', li);
    if (d.type === 'anagramme') {
      zone.innerHTML = `
        <div class="lettres">${d.lettres.map((l) => `<span class="tuile">${l}</span>`).join('')}</div>
        <p class="defi-indice">${d.indice || ''}</p>
        <form class="env-form">
          <div class="env-saisie">
            <input aria-label="Votre réponse" autocomplete="off" spellcheck="false" placeholder="votre réponse" required>
            <button>Tenter</button>
          </div>
        </form>`;
      $('form', zone).addEventListener('submit', (ev) => {
        ev.preventDefault();
        tenterDefi(d, li, $('input', zone).value);
      });
    } else if (d.type === 'memory') {
      montreMemory(d, li, zone);
    } else if (d.type === 'quiz') {
      zone.innerHTML = `
        <form class="env-form">
          ${d.questions.map((q, i) => `
            <label class="quiz-question" for="q-${d.id}-${i}">${q}</label>
            <div class="env-saisie quiz-ligne">
              <input id="q-${d.id}-${i}" autocomplete="off" spellcheck="false" required>
            </div>`).join('')}
          <div class="env-saisie quiz-valider"><button>Valider</button></div>
        </form>`;
      $('form', zone).addEventListener('submit', (ev) => {
        ev.preventDefault();
        const reponses = [...zone.querySelectorAll('input')].map((e) => e.value).join(' ');
        tenterDefi(d, li, reponses);
      });
    }
  }

  function montreMemory(d, li, zone) {
    const cartes = [...d.symboles, ...d.symboles]
      .map((s) => ({ s, tri: Math.random() }))
      .sort((a, b) => a.tri - b.tri)
      .map((c) => c.s);
    zone.innerHTML = `<div class="memory">${cartes.map((s) =>
      `<button type="button" class="carte" data-s="${s}" aria-label="carte retournée"></button>`).join('')}</div>`;
    const grille = $('.memory', zone);
    let ouvertes = [];
    let verrou = false;
    let trouvees = 0;
    grille.addEventListener('click', (ev) => {
      const carte = ev.target.closest('.carte');
      if (!carte || verrou || carte.classList.contains('vue') || carte.classList.contains('trouvee')) return;
      carte.classList.add('vue');
      carte.textContent = carte.dataset.s;
      ouvertes.push(carte);
      if (ouvertes.length < 2) return;
      const [a, b] = ouvertes;
      ouvertes = [];
      if (a.dataset.s === b.dataset.s) {
        a.classList.add('trouvee');
        b.classList.add('trouvee');
        trouvees += 1;
        if (trouvees === d.symboles.length) finMemory(d, li, zone);
      } else {
        verrou = true;
        setTimeout(() => {
          for (const c of [a, b]) { c.classList.remove('vue'); c.textContent = ''; }
          verrou = false;
        }, 750);
      }
    });
  }

  function finMemory(d, li, zone) {
    const apres = document.createElement('div');
    apres.innerHTML = `
      <p class="defi-indice">Toutes les paires ! Voici le mot mystère, en symboles —
      la pierre de Rosette de votre deuxième enveloppe sait le lire :</p>
      <div class="seq">${d.sequence.map((s) => `<span>${s}</span>`).join('')}</div>
      <form class="env-form">
        <div class="env-saisie">
          <input aria-label="Le mot décodé" autocomplete="off" spellcheck="false" placeholder="le mot décodé" required>
          <button>Tenter</button>
        </div>
      </form>`;
    zone.append(apres);
    $('form', apres).addEventListener('submit', (ev) => {
      ev.preventDefault();
      tenterDefi(d, li, $('input', apres).value);
    });
    apres.querySelector('input').focus();
  }

  async function tenterDefi(d, li, reponse) {
    const bouton = $('.defi-jeu button[type="submit"], .defi-jeu form button', li);
    const msg = $('.env-msg', li);
    if (!normaliseCode(reponse)) return;
    if (bouton) bouton.disabled = true;
    msg.textContent = '';
    const contenu = await dechiffre(reponse, d.payload);
    if (bouton) bouton.disabled = false;
    if (!contenu) {
      msg.textContent = 'Pas encore ça… l’Agence croit en vous.';
      li.classList.remove('erreur');
      void li.offsetWidth;
      li.classList.add('erreur');
      return;
    }
    etat.defis = etat.defis || {};
    etat.defis[d.id] = reponse;
    sauveEtat(etat);
    montreRecompense(li, contenu);
  }

  function montreRecompense(li, contenu) {
    li.classList.add('reussi');
    $('.defi-jeu', li).remove();
    $('.env-msg', li)?.remove();
    const div = document.createElement('div');
    div.className = 'env-contenu';
    div.innerHTML = `<p class="defi-badge">Défi réussi</p>${contenu.recompense}`;
    li.append(div);
  }

  /* ---------- Jour J ---------- */

  function majJourJ() {
    const contenu5 = dechiffres.get(5);
    const section = $('#jourj');
    if (!contenu5 || !contenu5.jourj) return;
    section.hidden = false;
    majEtapes();
    if (!minuterie) minuterie = setInterval(majEtapes, 1000);
  }

  function majEtapes() {
    const jourj = (dechiffres.get(5) || {}).jourj;
    if (!jourj) return;
    const present = Date.now();

    // compte à rebours
    const compte = $('#compte-a-rebours');
    const reste = new Date(jourj.date).getTime() - present;
    if (reste > 0) {
      const j = Math.floor(reste / 86400000);
      const h = Math.floor(reste / 3600000) % 24;
      const m = Math.floor(reste / 60000) % 60;
      const s = Math.floor(reste / 1000) % 60;
      compte.innerHTML = '<strong></strong><span>avant le départ</span>';
      $('strong', compte).textContent =
        `${j} j ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
      compte.innerHTML = '<strong>C’est aujourd’hui.</strong><span>suivez les étapes, à l’heure pile</span>';
    }

    // étapes time-lockées
    const ol = $('#etapes');
    for (const [i, etape] of jourj.etapes.entries()) {
      let li = ol.children[i];
      const ouverte = present >= new Date(etape.heure).getTime();
      const dejaBonEtat = li && (li.classList.contains('ouverte') === ouverte);
      if (dejaBonEtat) continue;
      if (!li) { li = document.createElement('li'); ol.append(li); }
      li.className = 'etape ' + (ouverte ? 'ouverte' : 'fermee');
      if (ouverte) {
        li.innerHTML = `<span class="etape-heure">${heureCourte(etape.heure)}</span>
          <h3>${etape.titre}</h3>${etape.texte}`;
        if (etape.destination) revelerDestination(etape.destination);
      } else {
        li.innerHTML = `<span class="etape-heure">${heureCourte(etape.heure)}</span>
          <h3>${etape.titre}</h3>
          <p class="etape-note">Patience — cette étape s’ouvrira à ${heureCourte(etape.heure)}.</p>`;
      }
    }
  }

  /* ---------- clin d'œil ---------- */

  let taps = 0;
  $('#sceau').addEventListener('click', () => {
    taps += 1;
    if (taps === 7) {
      taps = 0;
      toast('Les complices vous embrassent. À très vite.');
    }
  });

  /* ---------- démarrage ---------- */

  async function demarre() {
    construireChapitres();
    construireDefis();
    majBillet();
    majPasseport();
    for (const ch of CONTENU.chapitres) {
      const code = etat.codes[ch.id];
      if (!code) continue;
      const contenu = await dechiffre(code, ch.payload);
      if (!contenu) continue; // code périmé (contenu re-chiffré depuis)
      dechiffres.set(ch.id, contenu);
      ouvreChapitre(ch, $(`.enveloppe[data-id="${ch.id}"]`));
    }
    for (const d of CONTENU.defis || []) {
      const reponse = (etat.defis || {})[d.id];
      if (!reponse) continue;
      const contenu = await dechiffre(reponse, d.payload);
      if (!contenu) continue;
      montreRecompense($(`.defi[data-id="${d.id}"]`), contenu);
    }
    majBillet();
    majPasseport();
    majJourJ();
  }

  demarre();
})();
