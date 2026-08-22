(function() {
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
    let hasUserInteracted = false;

    // Track User Interaction for Safe Audio Autoplay
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, () => { hasUserInteracted = true; }, { once: true, capture: true });
    });

    // Load Settings & Saved Speed Preference
    chrome.storage.sync.get(['cs_panel_settings', 'cs_fbp_settings', 'cs_filter_keywords', 'cs_comment_sort_mode', 'cs_auto_next', 'cs_playback_speed'], (data) => {
        if (data.cs_panel_settings) panelSettings = data.cs_panel_settings;
        if (data.cs_fbp_settings) fbpSettings = data.cs_fbp_settings;
        if (data.cs_filter_keywords) fbpSettings.keywords = data.cs_filter_keywords;
        if (data.cs_comment_sort_mode) commentSortMode = data.cs_comment_sort_mode;
        if (data.cs_auto_next !== undefined) autoNextEnabled = data.cs_auto_next;
        if (data.cs_playback_speed) persistentSpeed = parseFloat(data.cs_playback_speed);
        
        applyStyles();
        runDOMFilter();
        enforcePersistentSpeed();
        if (location.hostname.includes('facebook.com')) injectOnPageFacebookButton();
    });

    // 1. Persistent Playback Speed Enforcement (Applies to Next Video Automatically)
    function enforcePersistentSpeed() {
        document.querySelectorAll('video').forEach(v => {
            if (!document.querySelector('.ad-showing')) {
                if (v.playbackRate !== persistentSpeed) {
                    v.playbackRate = persistentSpeed;
                }
            }
        });
    }

    document.addEventListener('play', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && !document.querySelector('.ad-showing')) {
            e.target.playbackRate = persistentSpeed;
        }
    }, true);

    document.addEventListener('loadedmetadata', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && !document.querySelector('.ad-showing')) {
            e.target.playbackRate = persistentSpeed;
        }
    }, true);

    // 2. Dynamic Live CSS Generator (Panels & FBP Rules)
    function generateCSS() {
        if (!location.hostname.includes('facebook.com')) return '';
        return `
            /* Top Header */
            ${!panelSettings.showTopBar ? `[role="banner"], header, div[data-pagelet="NavigationTop"] { display: none !important; }` : `[role="banner"], header { visibility: visible !important; }`}
            
            /* Stories Tray */
            ${!panelSettings.showStories ? `[aria-label="Stories"], div[data-pagelet*="Stories"] { display: none !important; }` : `[aria-label="Stories"], div[data-pagelet*="Stories"] { display: flex !important; margin: 0 auto 12px auto !important; }`}
            
            /* Left Rail */
            ${!panelSettings.showLeftRail ? `div[data-pagelet="LeftRail"], #leftCol, div[role="navigation"]:not([role="banner"]):not([role="banner"] *):not([role="main"] *) { display: none !important; width: 0 !important; }` : `div[data-pagelet="LeftRail"], #leftCol { display: block !important; }`}
            
            /* Right Rail */
            ${!panelSettings.showRightRail ? `div[data-pagelet="RightRail"], #rightCol, [role="complementary"] { display: none !important; width: 0 !important; }` : `div[data-pagelet="RightRail"], #rightCol, [role="complementary"] { display: block !important; }`}
            
            /* Comments */
            ${!panelSettings.showComments ? `div[data-pagelet*="Comment"], div[aria-label*="Comment" i], #comments, ytd-comments { display: none !important; }` : `div[data-pagelet*="Comment"] { display: block !important; width: 100% !important; }`}
            
            /* FBP: Block Hovercards */
            ${fbpSettings.blockHoverCards ? `div[data-pagelet*="HoverCard"], [data-hovercard], div[role="dialog"][aria-label*="profile" i] { display: none !important; }` : ''}

            /* FBP: Block Notification Popups & Tag Suggestions */
            ${fbpSettings.blockNotifications ? `div[role="alert"], div[aria-label*="Notifications" i][role="dialog"] { display: none !important; }` : ''}
            ${fbpSettings.blockTagSuggestions ? `div[aria-label*="Tag" i], div[data-pagelet*="Tag"] { display: none !important; }` : ''}

            /* Centered Feed Width */
            ${!panelSettings.showLeftRail && !panelSettings.showRightRail ? `
                div[role="main"] { margin-left: auto !important; margin-right: auto !important; float: none !important; }
                div[role="feed"], div[data-pagelet="MainFeed"], div[data-pagelet*="Feed"] {
                    max-width: ${panelSettings.feedWidth}px !important; margin-left: auto !important; margin-right: auto !important; transition: max-width 0.15s ease !important;
                }
            ` : ''}

            .cs-filtered-post { display: none !important; }

            /* On-Page Floating Icon */
            #cs-floating-fb-btn {
                position: fixed; bottom: 20px; right: 20px; z-index: 999999;
                background: linear-gradient(135deg, #141722, #0d0f15); color: #00f2fe;
                border: 1px solid #00f2fe; border-radius: 50%; width: 44px; height: 44px;
                display: flex; align-items: center; justify-content: center; font-size: 20px;
                cursor: pointer; box-shadow: 0 4px 15px rgba(0, 242, 254, 0.35); transition: 0.2s;
            }
            #cs-floating-fb-btn:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(0, 242, 254, 0.6); }

            #cs-inpage-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: transparent; z-index: 9999998; display: none; }
            #cs-inpage-overlay.open { display: block; }

            #cs-inpage-modal {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                width: 380px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
                background: #141722; border: 1px solid #282e42; border-radius: 16px;
                padding: 18px; z-index: 9999999; display: none; flex-direction: column; gap: 12px;
                color: #e6e9f2; font-family: -apple-system, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            }
            #cs-inpage-modal.open { display: flex; }
        `;
    }

    function applyStyles() {
        let el = document.getElementById('cinemastream-injected-style');
        if (!el) {
            el = document.createElement('style');
            el.id = 'cinemastream-injected-style';
            document.head.appendChild(el);
        }
        el.textContent = generateCSS();
    }

    // 3. Inject On-Page Facebook Quick Customizer Button
    function injectOnPageFacebookButton() {
        if (document.getElementById('cs-floating-fb-btn')) return;

        const floatBtn = document.createElement('div');
        floatBtn.id = 'cs-floating-fb-btn';
        floatBtn.title = 'CinemaStream Pro / FBP Quick Customizer';
        floatBtn.innerHTML = '🎬';
        document.body.appendChild(floatBtn);

        const overlay = document.createElement('div');
        overlay.id = 'cs-inpage-overlay';
        document.body.appendChild(overlay);

        const modal = document.createElement('div');
        modal.id = 'cs-inpage-modal';
        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #282e42; padding-bottom:8px;">
                <h3 style="font-size:14px; color:#00f2fe; font-weight:bold;">🎬 CinemaStream / FBP Quick Settings</h3>
                <button id="cs-modal-close" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer;">✕</button>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Feed Width:</span>
                    <span id="cs-inpage-width-val" style="color:#00f2fe; font-weight:bold;">${panelSettings.feedWidth}px</span>
                </div>
                <input type="range" id="cs-inpage-width-slider" min="500" max="1300" step="20" value="${panelSettings.feedWidth}" style="width:100%; accent-color:#00f2fe;">

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                    <span>📌 Top Navigation:</span>
                    <button id="cs-inpage-topbar" style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; background:${panelSettings.showTopBar ? '#2ecc71' : '#33384a'}; color:${panelSettings.showTopBar ? '#000' : '#8a92a6'}; border:none;">${panelSettings.showTopBar ? 'SHOW' : 'HIDE'}</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>📖 Stories Tray:</span>
                    <button id="cs-inpage-stories" style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; background:${panelSettings.showStories ? '#2ecc71' : '#33384a'}; color:${panelSettings.showStories ? '#000' : '#8a92a6'}; border:none;">${panelSettings.showStories ? 'SHOW' : 'HIDE'}</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>⬅️ Left Sidebar:</span>
                    <button id="cs-inpage-leftrail" style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; background:${panelSettings.showLeftRail ? '#2ecc71' : '#33384a'}; color:${panelSettings.showLeftRail ? '#000' : '#8a92a6'}; border:none;">${panelSettings.showLeftRail ? 'SHOW' : 'HIDE'}</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>➡️ Right Rail / Chat:</span>
                    <button id="cs-inpage-rightrail" style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; background:${panelSettings.showRightRail ? '#2ecc71' : '#33384a'}; color:${panelSettings.showRightRail ? '#000' : '#8a92a6'}; border:none;">${panelSettings.showRightRail ? 'SHOW' : 'HIDE'}</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>💬 Comments Section:</span>
                    <button id="cs-inpage-comments" style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; background:${panelSettings.showComments ? '#2ecc71' : '#33384a'}; color:${panelSettings.showComments ? '#000' : '#8a92a6'}; border:none;">${panelSettings.showComments ? 'SHOW' : 'HIDE'}</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>🚫 Hide Sponsored Posts:</span>
                    <button id="cs-inpage-sponsored" style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; background:${fbpSettings.blockSponsored ? '#2ecc71' : '#33384a'}; color:${fbpSettings.blockSponsored ? '#000' : '#8a92a6'}; border:none;">${fbpSettings.blockSponsored ? 'ON' : 'OFF'}</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>🛑 Block Hover Cards:</span>
                    <button id="cs-inpage-hovercards" style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; background:${fbpSettings.blockHoverCards ? '#2ecc71' : '#33384a'}; color:${fbpSettings.blockHoverCards ? '#000' : '#8a92a6'}; border:none;">${fbpSettings.blockHoverCards ? 'ON' : 'OFF'}</button>
                </div>
            </div>
            <div style="font-size:10px; color:#8a92a6; border-top:1px solid #282e42; padding-top:8px; text-align:center;">
                CinemaStream Pro Suite Active
            </div>
        `;
        document.body.appendChild(modal);

        const toggleModal = () => {
            const isOpen = modal.classList.contains('open');
            modal.classList.toggle('open', !isOpen);
            overlay.classList.toggle('open', !isOpen);
        };

        floatBtn.addEventListener('click', toggleModal);
        document.getElementById('cs-modal-close').addEventListener('click', toggleModal);
        overlay.addEventListener('click', toggleModal);

        const saveAndApply = () => {
            chrome.storage.sync.set({ cs_panel_settings: panelSettings, cs_fbp_settings: fbpSettings });
            applyStyles();
            runDOMFilter();
        };

        document.getElementById('cs-inpage-width-slider').addEventListener('input', (e) => {
            panelSettings.feedWidth = parseInt(e.target.value);
            document.getElementById('cs-inpage-width-val').innerText = panelSettings.feedWidth + 'px';
            saveAndApply();
        });

        const setupBtn = (id, prop, obj, isToggleText = false) => {
            document.getElementById(id).addEventListener('click', (e) => {
                obj[prop] = !obj[prop];
                e.target.innerText = obj[prop] ? (isToggleText ? 'ON' : 'SHOW') : (isToggleText ? 'OFF' : 'HIDE');
                e.target.style.background = obj[prop] ? '#2ecc71' : '#33384a';
                e.target.style.color = obj[prop] ? '#000' : '#8a92a6';
                saveAndApply();
            });
        };

        setupBtn('cs-inpage-topbar', 'showTopBar', panelSettings);
        setupBtn('cs-inpage-stories', 'showStories', panelSettings);
        setupBtn('cs-inpage-leftrail', 'showLeftRail', panelSettings);
        setupBtn('cs-inpage-rightrail', 'showRightRail', panelSettings);
        setupBtn('cs-inpage-comments', 'showComments', panelSettings);
        setupBtn('cs-inpage-sponsored', 'blockSponsored', fbpSettings, true);
        setupBtn('cs-inpage-hovercards', 'blockHoverCards', fbpSettings, true);
    }

    // 4. DOM Post Filtering Engine
    function runDOMFilter() {
        if (!location.hostname.includes('facebook.com') && !location.hostname.includes('youtube.com')) return;

        const posts = document.querySelectorAll('[role="article"], div[data-pagelet^="FeedUnit"], div[data-pagelet*="Feed"] > div, ytd-rich-item-renderer, ytd-video-renderer');
        posts.forEach(post => {
            if (post.classList.contains('cs-filtered-post')) return;
            const text = (post.innerText || '').toLowerCase();

            // A. Custom Keywords / Text Filter
            if (fbpSettings.keywords && fbpSettings.keywords.length > 0) {
                for (const kw of fbpSettings.keywords) {
                    if (kw && text.includes(kw.toLowerCase())) {
                        post.classList.add('cs-filtered-post');
                        return;
                    }
                }
            }

            // B. Sponsored Ads Filter
            if (fbpSettings.blockSponsored && location.hostname.includes('facebook.com')) {
                const isSponsored = text.includes('sponsored') || text.includes('publicidad') || text.includes('gesponsert') || post.querySelector('[aria-label="Sponsored"]');
                if (isSponsored) {
                    post.classList.add('cs-filtered-post');
                    return;
                }
            }

            // C. Suggested Content Filter
            if (fbpSettings.blockSuggested && location.hostname.includes('facebook.com')) {
                const isSuggested = text.includes('suggested for you') || text.includes('people you may know') || text.includes('popular across facebook');
                if (isSuggested) {
                    post.classList.add('cs-filtered-post');
                    return;
                }
            }

            // D. Shared Posts Filter
            if (fbpSettings.blockShared && location.hostname.includes('facebook.com')) {
                const isShared = text.includes('shared a post') || text.includes('shared a memory') || text.includes('shared a link');
                if (isShared) {
                    post.classList.add('cs-filtered-post');
                    return;
                }
            }
        });
    }

    const observer = new MutationObserver(() => {
        runDOMFilter();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 5. High-Frequency YouTube & FB Ad-Skipper (<150ms Instant Action)
    setInterval(() => {
        // Fast-click any skip button the instant it enters the DOM
        const skipSelectors = [
            '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern', '.ytp-skip-ad-button', 
            'button.ytp-ad-skip-button-modern', '.ytp-ad-skip-button-container button',
            '[id^="skip-button"] button', '[aria-label*="Skip Ad" i]', '.videoAdUiSkipButton', 
            '.ytp-ad-overlay-close-button', '.ytp-ad-preview-container'
        ];
        skipSelectors.forEach(s => {
            document.querySelectorAll(s).forEach(btn => {
                try {
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    btn.click();
                } catch(e) {}
            });
        });
        
        // Speed up and mute unskippable video ads
        const adShowing = document.querySelector('.ad-showing, .ytp-ad-player-overlay');
        const vids = document.querySelectorAll('video');
        if (adShowing) {
            vids.forEach(v => {
                v.playbackRate = 16.0;
                v.muted = true;
            });
        } else {
            // Restore persistent speed once ad finishes
            vids.forEach(v => {
                if (v.playbackRate === 16.0) {
                    v.playbackRate = persistentSpeed;
                    v.muted = false;
                }
            });
        }
    }, 150);

    // 6. Safe Auto-Unmute (Guards against Chrome Autoplay errors)
    setInterval(() => {
        const userActive = (navigator.userActivation && navigator.userActivation.hasBeenActive) || hasUserInteracted;
        if (!userActive) return;

        document.querySelectorAll('video').forEach(v => {
            if (v.muted && !document.querySelector('.ad-showing')) {
                try {
                    v.muted = false;
                    v.volume = 1.0;
                } catch(e) {}
            }
        });
        document.querySelectorAll('[aria-label*="unmute" i], [aria-label*="Unmute" i]').forEach(b => {
            try { b.click(); } catch(e) {}
        });
    }, 800);

    // 7. Comment Sorting Engine
    function triggerRealClick(elem) {
        elem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        elem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    setInterval(() => {
        if (!commentSortMode || commentSortMode === 'off' || !location.hostname.includes('facebook.com')) return;
        
        const filterBtns = Array.from(document.querySelectorAll('div[role="button"], span[dir="auto"], span')).filter(el => {
            const text = (el.innerText || '').trim().toLowerCase();
            return (text.includes('most relevant') || text.includes('top comments') || text.includes('newest') || text.includes('all comments')) && 
                   el.closest('[role="article"], div[data-pagelet*="Comment"], div[aria-label*="Comment" i]');
        });

        filterBtns.forEach(btn => {
            const postCard = btn.closest('[role="article"], div[data-pagelet*="Feed"] > div') || btn;
            if (postCard.dataset.userManualSort) return;

            const currentText = (btn.innerText || '').trim().toLowerCase();
            let needsSwitch = false;
            
            if (commentSortMode === 'all' && !currentText.includes('all comments')) needsSwitch = true;
            if (commentSortMode === 'newest' && !currentText.includes('newest')) needsSwitch = true;
            if (commentSortMode === 'relevant' && (!currentText.includes('most relevant') && !currentText.includes('top comments'))) needsSwitch = true;

            if (needsSwitch && !btn.dataset.autoSorted) {
                btn.dataset.autoSorted = "true";
                const clickable = btn.closest('div[role="button"]') || btn;
                triggerRealClick(clickable);

                setTimeout(() => {
                    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], div[role="button"]'));
                    let targetItem = null;
                    if (commentSortMode === 'all') {
                        targetItem = menuItems.find(m => (m.innerText || '').toLowerCase().includes('all comments')) || menuItems[2];
                    } else if (commentSortMode === 'newest') {
                        targetItem = menuItems.find(m => (m.innerText || '').toLowerCase().includes('newest')) || menuItems[1];
                    } else if (commentSortMode === 'relevant') {
                        targetItem = menuItems.find(m => (m.innerText || '').toLowerCase().includes('relevant')) || menuItems[0];
                    }

                    if (targetItem) triggerRealClick(targetItem);
                    else document.body.click();
                }, 250);
            }
        });
    }, 1200);

    // 8. Continuous PiP & Auto-Play Next Video
    document.addEventListener('ended', async (e) => {
        if (!autoNextEnabled) return;
        if (e.target && e.target.tagName === 'VIDEO') {
            const wasInPiP = document.pictureInPictureElement === e.target;
            const vids = Array.from(document.querySelectorAll('video'));
            const currentIdx = vids.indexOf(e.target);

            if (currentIdx !== -1 && currentIdx + 1 < vids.length) {
                const nextVid = vids[currentIdx + 1];
                nextVid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(async () => {
                    nextVid.muted = false;
                    nextVid.volume = 1.0;
                    nextVid.playbackRate = persistentSpeed;
                    try {
                        await nextVid.play();
                        if (wasInPiP) await nextVid.requestPictureInPicture();
                    } catch(err) {}
                }, 700);
            }
        }
    }, true);

    // 9. Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
        const vids = Array.from(document.querySelectorAll('video'));
        const v = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
        if (!v) return;

        if (e.shiftKey && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
            e.preventDefault(); 
            persistentSpeed = Math.min(3.5, +(persistentSpeed + 0.25).toFixed(2));
            chrome.storage.sync.set({ cs_playback_speed: persistentSpeed });
            vids.forEach(vid => vid.playbackRate = persistentSpeed);
        } else if (e.shiftKey && (e.key === '_' || e.key === '-' || e.code === 'NumpadSubtract')) {
            e.preventDefault(); 
            persistentSpeed = Math.max(0.25, +(persistentSpeed - 0.25).toFixed(2));
            chrome.storage.sync.set({ cs_playback_speed: persistentSpeed });
            vids.forEach(vid => vid.playbackRate = persistentSpeed);
        } else if (!e.shiftKey && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
            e.preventDefault(); v.volume = Math.min(1.0, +(v.volume + 0.1).toFixed(2));
        } else if (!e.shiftKey && (e.key === '-' || e.code === 'NumpadSubtract')) {
            e.preventDefault(); v.volume = Math.max(0.0, +(v.volume - 0.1).toFixed(2));
        } else if (e.code === 'Space') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
        else if (e.code === 'KeyF') { e.preventDefault(); (v.parentElement || v).requestFullscreen(); }
        else if (e.code === 'KeyM') { e.preventDefault(); v.muted = !v.muted; }
        else if (e.code === 'ArrowRight') { e.preventDefault(); v.currentTime += 10; }
        else if (e.code === 'ArrowLeft') { e.preventDefault(); v.currentTime -= 10; }
    });

    // 10. Message Listener from Popup & Background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'GET_METADATA') {
            const activeVid = Array.from(document.querySelectorAll('video')).find(v => !v.paused && v.readyState > 0) || document.querySelector('video');
            let u = window.location.href;
            let t = document.title || 'Saved Video';
            let s = 'Web';

            if (location.hostname.includes('youtube.com')) {
                s = 'YouTube';
                const yt = document.querySelector('h1.ytd-watch-metadata, #title h1, h1.title');
                if (yt && yt.innerText) t = yt.innerText.trim();
                if (activeVid) {
                    const link = activeVid.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-reel-video-renderer')?.querySelector('a#thumbnail, a[href^="/watch"], a[href^="/shorts"]');
                    if (link && link.href) u = link.href;
                }
            } else if (location.hostname.includes('facebook.com')) {
                s = 'Facebook';
                if (activeVid) {
                    const card = activeVid.closest('[role="article"], div[data-pagelet*="Feed"] > div, div[data-pagelet^="FeedUnit"]');
                    if (card) {
                        const link = card.querySelector('a[href*="/watch"], a[href*="/reel/"], a[href*="/videos/"]');
                        if (link && link.href) u = link.href;
                        const cap = card.querySelector('div[data-ad-preview="message"], div[dir="auto"], h2, strong');
                        if (cap && cap.innerText) t = cap.innerText.trim().split('\n')[0].slice(0, 60);
                    }
                }
            } else if (location.hostname.includes('tiktok.com')) {
                s = 'TikTok';
                const desc = document.querySelector('[data-e2e="browse-video-desc"]');
                if (desc && desc.innerText) t = desc.innerText.trim().slice(0, 60);
            }
            sendResponse({ url: u, title: t, site: s });
        } else if (msg.action === 'UPDATE_ALL_SETTINGS') {
            panelSettings = msg.settings.panelSettings;
            fbpSettings = msg.settings.fbpSettings;
            commentSortMode = msg.settings.commentSortMode;
            autoNextEnabled = msg.settings.autoNextEnabled;
            if (msg.settings.persistentSpeed) persistentSpeed = msg.settings.persistentSpeed;
            applyStyles();
            runDOMFilter();
            enforcePersistentSpeed();
            sendResponse({ status: 'ok' });
        } else if (msg.action === 'KEYWORDS_UPDATED') {
            fbpSettings.keywords = msg.keywords;
            runDOMFilter();
        } else if (msg.action === 'TRIGGER_PIP') {
            const vids = Array.from(document.querySelectorAll('video'));
            const activeVid = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
            if (activeVid) document.pictureInPictureElement ? document.exitPictureInPicture() : activeVid.requestPictureInPicture();
        } else if (msg.action === 'TRIGGER_FOCUS') {
            const vids = Array.from(document.querySelectorAll('video'));
            const activeVid = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
            if (activeVid) document.fullscreenElement ? document.exitFullscreen() : (activeVid.parentElement.parentElement || activeVid).requestFullscreen();
        } else if (msg.action === 'SET_SPEED') {
            persistentSpeed = msg.speed;
            chrome.storage.sync.set({ cs_playback_speed: persistentSpeed });
            enforcePersistentSpeed();
        }
        return true;
    });
})();
