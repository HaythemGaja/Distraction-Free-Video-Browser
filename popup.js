document.addEventListener('DOMContentLoaded', () => {
    let adSkipperEnabled = true;
    let persistentSpeed = 1.0;
    let globalVolume = 1.0;
    let currentEqPreset = 'flat';
    let autoNextEnabled = true;
    let ambientGlowEnabled = false;
    let watchLaterList = [];
    let durationSec = 0;
    let isDraggingScrubber = false;

    // Elements
    const gmcDomain = document.getElementById('gmc-domain');
    const gmcTitle = document.getElementById('gmc-title');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const gmcScrubber = document.getElementById('gmc-scrubber');
    const timeCurrent = document.getElementById('time-current');
    const timeDuration = document.getElementById('time-duration');
    const cardSpeedSelect = document.getElementById('card-speed-select');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeVal = document.getElementById('volume-val');
    const eqSelect = document.getElementById('eq-select');
    const toggleAdskipper = document.getElementById('toggle-adskipper');
    const toggleAutonext = document.getElementById('toggle-autonext');
    const toggleAmbient = document.getElementById('toggle-ambient');
    const wlCount = document.getElementById('wl-count');
    const wlList = document.getElementById('wl-list');
    const wlContainer = document.getElementById('wl-container');

    function formatTime(s) {
        if (!s || isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    }

    // 1. Poll Active Tab for Live Media Status
    function pollLiveMedia() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_MEDIA_STATUS' }, (res) => {
                if (res) {
                    gmcDomain.innerText = res.hostname || 'Web Video';
                    gmcTitle.innerText = res.title || 'Video Player';
                    
                    const svgPath = btnPlayPause.querySelector('svg path');
                    if (svgPath) {
                        svgPath.setAttribute('d', res.paused ? 'M8 5v14l11-7z' : 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
                    }

                    durationSec = res.duration || 0;
                    timeDuration.innerText = formatTime(durationSec);

                    if (!isDraggingScrubber && durationSec > 0) {
                        timeCurrent.innerText = formatTime(res.currentTime);
                        gmcScrubber.value = (res.currentTime / durationSec) * 100;
                    }
                }
            });
        });
    }

    pollLiveMedia();
    setInterval(pollLiveMedia, 500);

    // 2. Transport Button Controls
    btnPlayPause.addEventListener('click', () => {
        sendTabAction('TOGGLE_PLAY');
        setTimeout(pollLiveMedia, 100);
    });

    document.getElementById('btn-rewind').addEventListener('click', () => {
        sendTabAction('SEEK_OFFSET', { offset: -10 });
    });

    document.getElementById('btn-forward').addEventListener('click', () => {
        sendTabAction('SEEK_OFFSET', { offset: 10 });
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
        sendTabAction('SEEK_EXACT', { time: 0 });
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        sendTabAction('SEEK_OFFSET', { offset: 30 });
    });

    document.getElementById('btn-pip').addEventListener('click', () => {
        sendTabAction('TRIGGER_PIP');
    });

    // Scrubber Dragging
    gmcScrubber.addEventListener('input', (e) => {
        isDraggingScrubber = true;
        if (durationSec > 0) {
            const targetTime = (parseFloat(e.target.value) / 100) * durationSec;
            timeCurrent.innerText = formatTime(targetTime);
        }
    });

    gmcScrubber.addEventListener('change', (e) => {
        isDraggingScrubber = false;
        if (durationSec > 0) {
            const targetTime = (parseFloat(e.target.value) / 100) * durationSec;
            sendTabAction('SEEK_EXACT', { time: targetTime });
        }
    });

    // 3. Storage Sync
    const storageKeys = [
        'cs_ad_skipper_enabled', 'cs_playback_speed', 'cs_global_volume',
        'cs_eq_preset', 'cs_auto_next', 'cs_ambient_glow', 'cs_watch_later'
    ];

    chrome.storage.local.get(storageKeys, (localData) => {
        chrome.storage.sync.get(storageKeys, (syncData) => {
            const data = Object.assign({}, syncData, localData);
            if (data.cs_ad_skipper_enabled !== undefined) adSkipperEnabled = data.cs_ad_skipper_enabled;
            if (data.cs_playback_speed) persistentSpeed = parseFloat(data.cs_playback_speed);
            if (data.cs_global_volume !== undefined) globalVolume = parseFloat(data.cs_global_volume);
            if (data.cs_eq_preset) currentEqPreset = data.cs_eq_preset;
            if (data.cs_auto_next !== undefined) autoNextEnabled = data.cs_auto_next;
            if (data.cs_ambient_glow !== undefined) ambientGlowEnabled = data.cs_ambient_glow;
            if (data.cs_watch_later) watchLaterList = data.cs_watch_later;

            // Sync UI
            cardSpeedSelect.value = persistentSpeed.toString();
            volumeSlider.value = Math.round(globalVolume * 100);
            volumeVal.innerText = `${Math.round(globalVolume * 100)}%`;
            eqSelect.value = currentEqPreset;
            toggleAdskipper.classList.toggle('active', adSkipperEnabled);
            toggleAutonext.classList.toggle('active', autoNextEnabled);
            toggleAmbient.classList.toggle('active', ambientGlowEnabled);
            renderWatchLater();
        });
    });

    let syncTimer = null;
    function saveSettings() {
        const obj = {
            cs_ad_skipper_enabled: adSkipperEnabled,
            cs_playback_speed: persistentSpeed,
            cs_global_volume: globalVolume,
            cs_eq_preset: currentEqPreset,
            cs_auto_next: autoNextEnabled,
            cs_ambient_glow: ambientGlowEnabled
        };
        chrome.storage.local.set(obj);
        
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            chrome.storage.sync.set(obj).catch(() => {});
        }, 500);

        sendTabAction('UPDATE_SETTINGS', {
            settings: {
                adSkipperEnabled,
                persistentSpeed,
                globalVolume,
                eqPreset: currentEqPreset,
                autoNextEnabled,
                ambientGlowEnabled,
                autoUnmuteEnabled: true,
                miniHudEnabled: true,
                forceHighResEnabled: true
            }
        });
    }

    cardSpeedSelect.addEventListener('change', (e) => {
        persistentSpeed = parseFloat(e.target.value);
        saveSettings();
    });

    volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        globalVolume = val / 100;
        volumeVal.innerText = `${val}%`;
        saveSettings();
    });

    eqSelect.addEventListener('change', (e) => {
        currentEqPreset = e.target.value;
        saveSettings();
    });

    toggleAdskipper.addEventListener('click', () => {
        adSkipperEnabled = !adSkipperEnabled;
        toggleAdskipper.classList.toggle('active', adSkipperEnabled);
        saveSettings();
    });

    toggleAutonext.addEventListener('click', () => {
        autoNextEnabled = !autoNextEnabled;
        toggleAutonext.classList.toggle('active', autoNextEnabled);
        saveSettings();
    });

    toggleAmbient.addEventListener('click', () => {
        ambientGlowEnabled = !ambientGlowEnabled;
        toggleAmbient.classList.toggle('active', ambientGlowEnabled);
        saveSettings();
    });

    // Tool Actions
    function sendTabAction(action, data = {}) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, Object.assign({ action }, data)).catch(() => {});
        });
    }

    document.getElementById('btn-ab-a').addEventListener('click', () => sendTabAction('SET_AB_A'));
    document.getElementById('btn-ab-b').addEventListener('click', () => sendTabAction('SET_AB_B'));
    document.getElementById('btn-ab-clear').addEventListener('click', () => sendTabAction('CLEAR_AB'));
    document.getElementById('btn-frame-back').addEventListener('click', () => sendTabAction('STEP_FRAME_BACK'));
    document.getElementById('btn-frame-fwd').addEventListener('click', () => sendTabAction('STEP_FRAME_FWD'));
    document.getElementById('btn-shot').addEventListener('click', () => sendTabAction('TRIGGER_SCREENSHOT'));

    // Watch Later Drawer Toggle
    document.getElementById('row-wl-toggle').addEventListener('click', (e) => {
        if (e.target.id !== 'btn-save-wl') {
            wlContainer.classList.toggle('open');
        }
    });

    // 4. WATCH LATER QUEUE RENDERER
    function renderWatchLater() {
        wlCount.innerText = watchLaterList.length;
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count: watchLaterList.length });
        wlList.innerHTML = '';

        if (watchLaterList.length === 0) {
            wlList.innerHTML = '<div style="color:#8a92a6; text-align:center; padding:12px; font-size:11px;">Queue is empty.<br>Click + Save Video to bookmark!</div>';
            return;
        }

        watchLaterList.forEach(item => {
            const el = document.createElement('div');
            el.className = 'wl-item';
            el.innerHTML = `
                <div class="wl-title" title="${item.title}">${item.title}</div>
                <div style="font-size:9px; color:#8a92a6; display:flex; justify-content:space-between;">
                    <span>📅 ${item.date}</span>
                    <span style="color:var(--gmc-blue); font-weight:bold;">${item.site || 'Web'}</span>
                </div>
                <div class="wl-actions">
                    <button class="wl-btn-play">▶ Play</button>
                    <button class="wl-btn-del">✕</button>
                </div>
            `;
            el.querySelector('.wl-btn-play').addEventListener('click', () => {
                chrome.tabs.create({ url: item.url });
            });
            el.querySelector('.wl-btn-del').addEventListener('click', () => {
                watchLaterList = watchLaterList.filter(i => i.id !== item.id);
                chrome.storage.local.set({ cs_watch_later: watchLaterList });
                renderWatchLater();
            });
            wlList.appendChild(el);
        });
    }

    // 5. BULLETPROOF "SAVE VIDEO" HANDLER
    document.getElementById('btn-save-wl').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;

            chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_METADATA' }, (res) => {
                let finalUrl = (res && res.url) || tabs[0].url || '';
                let finalTitle = (res && res.title) || tabs[0].title || 'Saved Video';
                let site = (res && res.site) || 'Web';

                if (!finalUrl || finalUrl === 'about:blank' || finalUrl.startsWith('chrome://')) {
                    alert('⚠️ Please open or play a video first!');
                    return;
                }

                // Check duplicate
                if (watchLaterList.some(i => i.url === finalUrl)) {
                    alert('ℹ️ Video is already in your Watch Later queue!');
                    wlContainer.classList.add('open');
                    return;
                }

                const newItem = {
                    id: Date.now(),
                    title: finalTitle.slice(0, 65),
                    url: finalUrl,
                    site: site,
                    date: new Date().toLocaleDateString()
                };

                watchLaterList.unshift(newItem);
                chrome.storage.local.set({ cs_watch_later: watchLaterList }, () => {
                    renderWatchLater();
                    wlContainer.classList.add('open');
                });
            });
        });
    });
});
