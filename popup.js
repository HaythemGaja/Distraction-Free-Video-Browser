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

    // 2. State & Storage Sync
    let panelSettings = {
        showTopBar: true,
        showStories: true,
        showLeftRail: false,
        showRightRail: false,
        showComments: true,
        feedWidth: 680
    };
    let fbpSettings = {
        blockSponsored: true,
        blockSuggested: true,
        blockShared: false,
        blockHoverCards: true,
        blockNotifications: true,
        blockTagSuggestions: true,
        keywords: []
    };
    let commentSortMode = 'newest';
    let autoNextEnabled = true;
    let persistentSpeed = 1.0;
    let watchLaterList = [];

    chrome.storage.sync.get(['cs_panel_settings', 'cs_fbp_settings', 'cs_filter_keywords', 'cs_comment_sort_mode', 'cs_auto_next', 'cs_playback_speed', 'cs_watch_later'], (data) => {
        if (data.cs_panel_settings) panelSettings = data.cs_panel_settings;
        if (data.cs_fbp_settings) fbpSettings = data.cs_fbp_settings;
        if (data.cs_filter_keywords) fbpSettings.keywords = data.cs_filter_keywords;
        if (data.cs_comment_sort_mode) commentSortMode = data.cs_comment_sort_mode;
        if (data.cs_auto_next !== undefined) autoNextEnabled = data.cs_auto_next;
        if (data.cs_playback_speed) persistentSpeed = parseFloat(data.cs_playback_speed);
        if (data.cs_watch_later) watchLaterList = data.cs_watch_later;

        syncUI();
        renderKeywordTags();
        renderWatchLater();
    });

    function saveAllSettings() {
        chrome.storage.sync.set({
            cs_panel_settings: panelSettings,
            cs_fbp_settings: fbpSettings,
            cs_filter_keywords: fbpSettings.keywords,
            cs_comment_sort_mode: commentSortMode,
            cs_auto_next: autoNextEnabled,
            cs_playback_speed: persistentSpeed
        });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'UPDATE_ALL_SETTINGS',
                    settings: { panelSettings, fbpSettings, commentSortMode, autoNextEnabled, persistentSpeed }
                }).catch(() => {});
            }
        });
    }

    function syncUI() {
        document.getElementById('feed-width-slider').value = panelSettings.feedWidth;
        document.getElementById('feed-width-label').innerText = panelSettings.feedWidth + 'px';

        setupToggle('toggle-topbar', panelSettings.showTopBar);
        setupToggle('toggle-stories', panelSettings.showStories);
        setupToggle('toggle-leftrail', panelSettings.showLeftRail);
        setupToggle('toggle-rightrail', panelSettings.showRightRail);
        setupToggle('toggle-comments', panelSettings.showComments);

        setupToggle('toggle-block-sponsored', fbpSettings.blockSponsored, 'ON', 'OFF');
        setupToggle('toggle-block-suggested', fbpSettings.blockSuggested, 'ON', 'OFF');
        setupToggle('toggle-block-shared', fbpSettings.blockShared, 'ON', 'OFF');
        setupToggle('toggle-block-hovercards', fbpSettings.blockHoverCards, 'ON', 'OFF');
        setupToggle('toggle-block-tags', fbpSettings.blockTagSuggestions, 'ON', 'OFF');
        setupToggle('toggle-block-notifs', fbpSettings.blockNotifications, 'ON', 'OFF');

        setupToggle('toggle-autonext', autoNextEnabled, 'ON', 'OFF');
        document.getElementById('comment-sort-select').value = commentSortMode;
        document.getElementById('speed-select').value = persistentSpeed.toString();
    }

    function setupToggle(btnId, val, onText = 'SHOW', offText = 'HIDE') {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.innerText = val ? onText : offText;
        btn.className = 'toggle-btn ' + (val ? 'on' : 'off');
    }

    // Keyword Management
    function renderKeywordTags() {
        const container = document.getElementById('kw-tags-container');
        container.innerHTML = '';
        if (!fbpSettings.keywords || fbpSettings.keywords.length === 0) {
            container.innerHTML = '<span style="color:#666; font-size:10px;">No keywords added yet.</span>';
            return;
        }
        fbpSettings.keywords.forEach((kw, index) => {
            const tag = document.createElement('span');
            tag.className = 'kw-tag';
            tag.innerHTML = `${kw} <span class="kw-tag-del" data-index="${index}">✕</span>`;
            container.appendChild(tag);
        });

        document.querySelectorAll('.kw-tag-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                fbpSettings.keywords.splice(idx, 1);
                renderKeywordTags();
                saveAllSettings();
            });
        });
    }

    document.getElementById('kw-add-btn').addEventListener('click', () => {
        const input = document.getElementById('kw-input');
        const val = input.value.trim().toLowerCase();
        if (val && !fbpSettings.keywords.includes(val)) {
            fbpSettings.keywords.push(val);
            input.value = '';
            renderKeywordTags();
            saveAllSettings();
        }
    });

    document.getElementById('kw-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('kw-add-btn').click();
    });

    // Toggle Listeners
    document.getElementById('toggle-block-sponsored').addEventListener('click', () => { fbpSettings.blockSponsored = !fbpSettings.blockSponsored; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-block-suggested').addEventListener('click', () => { fbpSettings.blockSuggested = !fbpSettings.blockSuggested; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-block-shared').addEventListener('click', () => { fbpSettings.blockShared = !fbpSettings.blockShared; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-block-hovercards').addEventListener('click', () => { fbpSettings.blockHoverCards = !fbpSettings.blockHoverCards; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-block-tags').addEventListener('click', () => { fbpSettings.blockTagSuggestions = !fbpSettings.blockTagSuggestions; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-block-notifs').addEventListener('click', () => { fbpSettings.blockNotifications = !fbpSettings.blockNotifications; syncUI(); saveAllSettings(); });

    document.getElementById('toggle-topbar').addEventListener('click', () => { panelSettings.showTopBar = !panelSettings.showTopBar; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-stories').addEventListener('click', () => { panelSettings.showStories = !panelSettings.showStories; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-leftrail').addEventListener('click', () => { panelSettings.showLeftRail = !panelSettings.showLeftRail; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-rightrail').addEventListener('click', () => { panelSettings.showRightRail = !panelSettings.showRightRail; syncUI(); saveAllSettings(); });
    document.getElementById('toggle-comments').addEventListener('click', () => { panelSettings.showComments = !panelSettings.showComments; syncUI(); saveAllSettings(); });

    document.getElementById('feed-width-slider').addEventListener('input', (e) => {
        panelSettings.feedWidth = parseInt(e.target.value);
        document.getElementById('feed-width-label').innerText = panelSettings.feedWidth + 'px';
        saveAllSettings();
    });

    document.getElementById('toggle-autonext').addEventListener('click', () => {
        autoNextEnabled = !autoNextEnabled;
        syncUI();
        saveAllSettings();
    });

    document.getElementById('comment-sort-select').addEventListener('change', (e) => {
        commentSortMode = e.target.value;
        saveAllSettings();
    });

    document.getElementById('speed-select').addEventListener('change', (e) => {
        persistentSpeed = parseFloat(e.target.value);
        saveAllSettings();
    });

    document.getElementById('btn-pip').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_PIP' }).catch(() => {});
        });
    });

    document.getElementById('btn-focus').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_FOCUS' }).catch(() => {});
        });
    });

    // Watch Later
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
                chrome.storage.sync.set({ cs_watch_later: watchLaterList });
                renderWatchLater();
            });
        });
    });
});
