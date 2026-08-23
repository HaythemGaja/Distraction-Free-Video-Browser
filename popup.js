document.addEventListener('DOMContentLoaded', () => {
    // 1. Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tabBtn.classList.add('active');
            document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add('active');
        });
    });

    // 2. Settings State
    let autoNextEnabled = true;
    let autoUnmuteEnabled = true;
    let persistentSpeed = 1.0;
    let globalVolume = 1.0;
    let ambientGlowEnabled = false;
    let miniHudEnabled = true;
    let currentEqPreset = 'flat';
    let forceHighResEnabled = true;
    let watchLaterList = [];

    const volumeSlider = document.getElementById('volume-slider');
    const volumeVal = document.getElementById('volume-val');

    // Load from Multi-Storage
    const storageKeys = [
        'cs_auto_next', 'cs_auto_unmute', 'cs_playback_speed', 'cs_global_volume',
        'cs_ambient_glow', 'cs_mini_hud', 'cs_eq_preset', 'cs_force_high_res',
        'cs_watch_later'
    ];

    chrome.storage.local.get(storageKeys, (localData) => {
        chrome.storage.sync.get(storageKeys, (syncData) => {
            const data = Object.assign({}, syncData, localData);
            if (data.cs_auto_next !== undefined) autoNextEnabled = data.cs_auto_next;
            if (data.cs_auto_unmute !== undefined) autoUnmuteEnabled = data.cs_auto_unmute;
            if (data.cs_playback_speed) persistentSpeed = parseFloat(data.cs_playback_speed);
            if (data.cs_global_volume !== undefined) globalVolume = parseFloat(data.cs_global_volume);
            if (data.cs_ambient_glow !== undefined) ambientGlowEnabled = data.cs_ambient_glow;
            if (data.cs_mini_hud !== undefined) miniHudEnabled = data.cs_mini_hud;
            if (data.cs_eq_preset) currentEqPreset = data.cs_eq_preset;
            if (data.cs_force_high_res !== undefined) forceHighResEnabled = data.cs_force_high_res;
            if (data.cs_watch_later) watchLaterList = data.cs_watch_later;

            syncUI();
            renderWatchLater();
        });
    });

    function saveSettings() {
        const settingsObj = {
            cs_auto_next: autoNextEnabled,
            cs_auto_unmute: autoUnmuteEnabled,
            cs_playback_speed: persistentSpeed,
            cs_global_volume: globalVolume,
            cs_ambient_glow: ambientGlowEnabled,
            cs_mini_hud: miniHudEnabled,
            cs_eq_preset: currentEqPreset,
            cs_force_high_res: forceHighResEnabled
        };

        chrome.storage.local.set(settingsObj);
        chrome.storage.sync.set(settingsObj);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'UPDATE_SETTINGS',
                    settings: {
                        autoNextEnabled, autoUnmuteEnabled, persistentSpeed,
                        globalVolume, ambientGlowEnabled, miniHudEnabled,
                        eqPreset: currentEqPreset, forceHighResEnabled
                    }
                }).catch(() => {});
            }
        });
    }

    function syncUI() {
        setupToggle('toggle-autonext', autoNextEnabled);
        setupToggle('toggle-ambient', ambientGlowEnabled);
        setupToggle('toggle-minihud', miniHudEnabled);
        document.getElementById('speed-select').value = persistentSpeed.toString();
        document.getElementById('eq-select').value = currentEqPreset;
        
        volumeSlider.value = Math.round(globalVolume * 100);
        volumeVal.innerText = `${Math.round(globalVolume * 100)}%`;
    }

    function setupToggle(btnId, val) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.innerText = val ? 'ON' : 'OFF';
        btn.className = 'toggle-btn ' + (val ? 'on' : 'off');
    }

    // Global Volume Slider Listener
    volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        globalVolume = val / 100;
        volumeVal.innerText = `${val}%`;
        saveSettings();
    });

    // Toggle Handlers
    document.getElementById('toggle-autonext').addEventListener('click', () => {
        autoNextEnabled = !autoNextEnabled;
        syncUI();
        saveSettings();
    });

    document.getElementById('toggle-ambient').addEventListener('click', () => {
        ambientGlowEnabled = !ambientGlowEnabled;
        syncUI();
        saveSettings();
    });

    document.getElementById('toggle-minihud').addEventListener('click', () => {
        miniHudEnabled = !miniHudEnabled;
        syncUI();
        saveSettings();
    });

    document.getElementById('speed-select').addEventListener('change', (e) => {
        persistentSpeed = parseFloat(e.target.value);
        saveSettings();
    });

    document.getElementById('eq-select').addEventListener('change', (e) => {
        currentEqPreset = e.target.value;
        saveSettings();
    });

    // Action Triggers
    const sendTabAction = (action) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action }).catch(() => {});
        });
    };

    document.getElementById('btn-download').addEventListener('click', () => sendTabAction('TRIGGER_DOWNLOAD'));
    document.getElementById('btn-pip').addEventListener('click', () => sendTabAction('TRIGGER_PIP'));
    document.getElementById('btn-focus').addEventListener('click', () => sendTabAction('TRIGGER_FOCUS'));
    document.getElementById('btn-shot').addEventListener('click', () => sendTabAction('TRIGGER_SCREENSHOT'));

    document.getElementById('btn-ab-a').addEventListener('click', () => sendTabAction('SET_AB_A'));
    document.getElementById('btn-ab-b').addEventListener('click', () => sendTabAction('SET_AB_B'));
    document.getElementById('btn-ab-clear').addEventListener('click', () => sendTabAction('CLEAR_AB'));

    document.getElementById('btn-frame-back').addEventListener('click', () => sendTabAction('STEP_FRAME_BACK'));
    document.getElementById('btn-frame-fwd').addEventListener('click', () => sendTabAction('STEP_FRAME_FWD'));

    // Watch Later Queue
    function renderWatchLater() {
        document.getElementById('wl-count').innerText = watchLaterList.length;
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count: watchLaterList.length });

        const listEl = document.getElementById('wl-list');
        listEl.innerHTML = '';

        if (watchLaterList.length === 0) {
            listEl.innerHTML = '<div style="color:#888; text-align:center; padding:15px; font-size:11px;">Queue is empty.<br>Click Save Active Video to bookmark!</div>';
            return;
        }

        watchLaterList.forEach(item => {
            const el = document.createElement('div');
            el.className = 'wl-item';
            el.innerHTML = `
                <div class="wl-title" title="${item.title}">${item.title}</div>
                <div style="font-size:9px; color:#888; display:flex; justify-content:space-between;">
                    <span>${item.date}</span>
                    <span style="color:var(--accent-cyan); font-weight:bold;">${item.site}</span>
                </div>
                <div class="wl-actions">
                    <button class="wl-play">▶ Play</button>
                    <button class="wl-share">🔗 Share</button>
                    <button class="wl-del">🗑️</button>
                </div>
            `;

            el.querySelector('.wl-play').addEventListener('click', () => {
                chrome.tabs.create({ url: item.url });
            });

            el.querySelector('.wl-share').addEventListener('click', () => {
                navigator.clipboard.writeText(item.url).then(() => alert('📋 Link copied to clipboard!'));
            });

            el.querySelector('.wl-del').addEventListener('click', () => {
                watchLaterList = watchLaterList.filter(i => i.id !== item.id);
                chrome.storage.local.set({ cs_watch_later: watchLaterList });
                chrome.storage.sync.set({ cs_watch_later: watchLaterList });
                renderWatchLater();
            });

            listEl.appendChild(el);
        });
    }

    document.getElementById('save-current-btn').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_METADATA' }, (res) => {
                let finalUrl = (res && res.url) || tabs[0].url;
                let finalTitle = (res && res.title) || tabs[0].title;
                let site = (res && res.site) || 'Web';

                const exists = watchLaterList.some(i => i.url === finalUrl);
                if (exists) return alert('Video already in Watch Later queue!');

                const newItem = {
                    id: Date.now(),
                    title: finalTitle,
                    url: finalUrl,
                    site: site,
                    date: new Date().toLocaleDateString()
                };

                watchLaterList.unshift(newItem);
                chrome.storage.local.set({ cs_watch_later: watchLaterList });
                chrome.storage.sync.set({ cs_watch_later: watchLaterList });
                renderWatchLater();
            });
        });
    });
});
