/**
 * ============================================================
 * UNIDIRECTIONAL GAME ENGINE (REDUX ARCHITECTURE)
 * ============================================================
 * Strict Flow: Action -> Reducer -> Animation Queue -> Renderer
 * Core Principles: NO direct DOM manipulation in logic. No mutable globals.
 */

// ==========================================
// 1. CONSTANTS & THEMES
// ==========================================
const TIKI_PROPS = [
    { id: 't-1', name: 'Blaze', color: '#e74c3c', bgPos: '0% 0%' },     // Red
    { id: 't-2', name: 'Ember', color: '#e67e22', bgPos: '50% 0%' },    // Orange
    { id: 't-3', name: 'Sol', color: '#f1c40f', bgPos: '100% 0%' },   // Yellow
    { id: 't-4', name: 'Fern', color: '#2ecc71', bgPos: '0% 50%' },    // Green
    { id: 't-5', name: 'Wave', color: '#3498db', bgPos: '50% 50%' },   // Blue
    { id: 't-6', name: 'Mystic', color: '#9b59b6', bgPos: '100% 50%' },  // Purple
    { id: 't-7', name: 'Coral', color: '#e84393', bgPos: '0% 100%' },   // Pink
    { id: 't-8', name: 'Lagoon', color: '#16a085', bgPos: '50% 100%' },  // Teal
    { id: 't-9', name: 'Timber', color: '#b8860b', bgPos: '100% 100%' }  // Brown
];

const UI_COLORS = ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c'];

// ==========================================
// 2. IMAGE SPRITE MANAGER (3x3 Grid Slices)
// ==========================================
class ShapeManager {
    static getTile(t, isTarget = false, isGoal = false) {
        const targetStyle = isTarget ? `border: 4px solid #fff; transform: scale(1.1);` : 'border: 2px solid transparent;';
        const imgName = t.id.replace('-', '') + '.png'; // converts 't-1' to 't1.png'

        return `
    <div style="width: 100%; height: 100%; position: relative;">
      <div class="tiki-image-sprite ${isTarget ? 'is-target' : ''} ${isGoal ? 'is-goal-glow' : ''}" 
           style="${targetStyle} background-image: url('${imgName}'); background-size: contain; background-repeat: no-repeat; background-position: center; border-radius: 12px; background-color: transparent;">
      </div>
    </div>`;
    }
}

// ==========================================
// 3. UTILS & HELPERS
// ==========================================
const Utils = {
    shuffle(array) {
        let a = [...array];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },
    uuid() { return Math.random().toString(36).substr(2, 9); },
    flattenTotem(totem) { return [...totem[0], ...totem[1], ...totem[2]]; },
    buildTotemLayers(flatArray) {
        return [
            flatArray.slice(0, 3) || [],
            flatArray.slice(3, 6) || [],
            flatArray.slice(6, 9) || []
        ]; // Layer 0 (Score/Top), Layer 1 (Mid), Layer 2 (Danger/Bottom)
    }
};

// ==========================================
// 4. DATA MODELS (Generators)
// ==========================================
class Models {
    static generatePlayers(count) {
        const p = [];
        for (let i = 0; i < count; i++) {
            p.push({
                id: `p${i}`,
                name: (count === 1 && i === 1) ? 'Spirit AI' : `Player ${i + 1}`,
                color: UI_COLORS[i],
                isAI: (count === 1 && i === 1),
                score: 0,
                cards: Models.generateHand(i, count),
                secretGoals: Models.generateSecretGoals()
            });
        }
        return p;
    }
    static generateHand(ownerId, numPlayers) {
        const c = [
            { id: Utils.uuid(), type: 'up', value: 1, owner: ownerId },
            { id: Utils.uuid(), type: 'up', value: 1, owner: ownerId },
            { id: Utils.uuid(), type: 'up', value: 2, owner: ownerId },
            { id: Utils.uuid(), type: 'up', value: 3, owner: ownerId },
            { id: Utils.uuid(), type: 'topple', value: 0, owner: ownerId },
            { id: Utils.uuid(), type: 'toast', value: 0, owner: ownerId }
        ];
        if (numPlayers <= 2) c.push({ id: Utils.uuid(), type: 'up', value: 2, owner: ownerId });
        return Utils.shuffle(c);
    }
    static generateSecretGoals() {
        const shuffled = Utils.shuffle(TIKI_PROPS.map(t => t.id));
        return { first: shuffled[0], second: shuffled[1], third: shuffled[2] };
    }
    static generateTotem() {
        const tikis = Utils.shuffle([...TIKI_PROPS]).map((t, idx) => ({
            ...t, position: idx, section: Math.floor(idx / 3)
        }));
        return Utils.buildTotemLayers(tikis);
    }
}

// ==========================================
// 5. REDUCER / RULES ENGINE (Pure Functions)
// ==========================================
const RulesEngine = {
    validateMove(state, card, flatIndex) {
        const flatTotem = Utils.flattenTotem(state.totem);
        if (flatIndex < 0 || flatIndex >= flatTotem.length) return false;

        switch (card.type) {
            case 'up':
                return (flatIndex > 0 && flatIndex - card.value >= 0);
            case 'topple':
                return flatTotem.length > 1 && flatIndex !== flatTotem.length - 1; // Can't topple already bottom piece
            case 'toast':
                return flatTotem.length > 3; // Any piece can be toasted, must have >3 left
            default:
                return false;
        }
    },

    applyAction(state, action) {
        // Redux pattern: Return new state copy
        const newState = JSON.parse(JSON.stringify(state));
        newState.animationsQueue = []; // Clear previous queue

        switch (action.type) {
            case 'START_GAME':
                newState.isOnlineGame = action.payload.isOnlineGame || false;
                newState.players = Models.generatePlayers(action.payload.numPlayers);
                newState.totem = Models.generateTotem();
                newState.toasted = [];
                newState.currentPlayerIndex = 0;
                newState.round = 1;
                // If it's a local pass-and-play game among multiple humans, force 'pass_device', otherwise just 'play'.
                newState.turnPhase = (newState.players.length > 1 && !newState.players[0].isAI && !newState.isOnlineGame) ? 'pass_device' : 'play';
                newState.selectedCardId = null;
                newState.goalsSecret = true;
                newState.winScore = action.payload.winScore || 35;
                break;

            case 'SELECT_CARD':
                if (newState.turnPhase !== 'play') break;
                newState.selectedCardId = newState.selectedCardId === action.payload.cardId ? null : action.payload.cardId;
                break;

            case 'EXECUTE_MOVE':
                if (newState.turnPhase !== 'play') break;
                const { cardId, targetIndex } = action.payload;
                const cp = newState.players[newState.currentPlayerIndex];
                const card = cp.cards.find(c => c.id === cardId);

                if (!card || !RulesEngine.validateMove(newState, card, targetIndex)) break;

                // Mutate stack in pure flat array first, then re-layerize
                let flat = Utils.flattenTotem(newState.totem);
                const targetTikiId = flat[targetIndex].id;

                if (card.type === 'up') {
                    const removed = flat.splice(targetIndex, 1)[0];
                    flat.splice(Math.max(0, targetIndex - card.value), 0, removed);
                    newState.animationsQueue.push({ type: 'MOVE_UP', tikiId: targetTikiId, steps: card.value });
                } else if (card.type === 'topple') {
                    const removed = flat.splice(targetIndex, 1)[0];
                    flat.push(removed);
                    newState.animationsQueue.push({ type: 'TOPPLE', tikiId: targetTikiId });
                } else if (card.type === 'toast') {
                    const removed = flat.splice(targetIndex, 1)[0];
                    newState.toasted.push(removed);
                    newState.animationsQueue.push({ type: 'TOAST', tikiId: targetTikiId });
                }

                // Recalculate layers and update sections
                newState.totem = Utils.buildTotemLayers(flat);
                newState.totem.forEach((layer, lIdx) => layer.forEach(t => t.section = lIdx));

                // Discard card
                cp.cards = cp.cards.filter(c => c.id !== card.id);
                newState.selectedCardId = null;
                newState.turnPhase = 'resolve';
                break;

            case 'END_TURN':
                // Check if round should end
                const rIsOver = Utils.flattenTotem(newState.totem).length <= 3 || newState.players.every(p => p.cards.length === 0);

                if (rIsOver) {
                    // Score Round
                    let maxScore = 0;
                    const flatCheck = Utils.flattenTotem(newState.totem);
                    newState.players.forEach(p => {
                        [p.secretGoals.first, p.secretGoals.second, p.secretGoals.third].forEach((gid, idx) => {
                            const pos = flatCheck.findIndex(t => t.id === gid);
                            if (pos !== -1 && pos <= 2) {
                                p.score += [15, 10, 5][pos];
                            }
                        });
                        if (p.score > maxScore) maxScore = p.score;
                    });

                    if (maxScore >= newState.winScore) {
                        newState.turnPhase = 'gameover';
                    } else {
                        newState.round++;
                        newState.totem = Models.generateTotem();
                        newState.toasted = [];
                        newState.players.forEach(p => {
                            p.cards = Models.generateHand(p.id, newState.players.length);
                            p.secretGoals = Models.generateSecretGoals();
                        });
                        newState.currentPlayerIndex = 0;
                        newState.turnPhase = (newState.players.length > 1 && !newState.players[0].isAI && !newState.isOnlineGame) ? 'pass_device' : 'play';
                    }
                } else {
                    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
                    const nextP = newState.players[newState.currentPlayerIndex];
                    newState.turnPhase = (newState.players.length > 1 && !nextP.isAI && !newState.isOnlineGame) ? 'pass_device' : 'play';
                }
                newState.goalsSecret = true;
                break;

            case 'START_PLAYER_TURN':
                newState.turnPhase = 'play';
                newState.goalsSecret = true;
                break;

            case 'TOGGLE_GOALS':
                newState.goalsSecret = !newState.goalsSecret;
                break;
        }
        return newState;
    }
};

// ==========================================
// 6. STORE (State Container)
// ==========================================
class Store {
    constructor(reducer, renderer) {
        this.reducer = reducer;
        this.renderer = renderer;
        this.state = null;
        this.isAnimating = false; // Lock interactions during animation
    }

    dispatch(action) {
        if (this.isAnimating) return; // Drop inputs while resolving animations

        console.log("ACTION:", action.type, action.payload);
        const nextState = this.reducer.applyAction(this.state || {}, action);
        this.state = nextState;

        // Seamless Realtime Multiplayer Hook
        if (window.NetworkManager && window.NetworkManager.channel && action.type !== 'RESET') {
            window.NetworkManager.broadcastState(this.state);
        }

        // Unidirectional rendering cycle
        if (this.state.animationsQueue.length > 0) {
            this.isAnimating = true;
            this.renderer.playAnimations(this.state.animationsQueue, nextState, () => {
                this.isAnimating = false;
                this.dispatch({ type: 'END_TURN' });
            });
        } else {
            this.renderer.render(this.state);

            // Check async AI trigger
            if (this.state.turnPhase === 'play' && this.state.players[this.state.currentPlayerIndex].isAI) {
                setTimeout(() => AIEngine.dispatchBestMove(this), 1000);
            }
        }
    }
}

// ==========================================
// 7. RENDERER (Pure UI Consumer)
// ==========================================
class UIRenderer {
    constructor() {
        // Pre-cache exact percentage positions mapping to the board_bg.png rocks
        this.stonePxs = [
            { x: 15, y: 85 }, { x: 25, y: 80 }, { x: 15, y: 75 }, { x: 20, y: 68 }, { x: 15, y: 62 }, { x: 22, y: 55 }, { x: 15, y: 50 },
            { x: 18, y: 45 }, { x: 12, y: 40 }, { x: 15, y: 34 }, { x: 12, y: 29 }, { x: 12, y: 24 }, { x: 15, y: 18 }, { x: 12, y: 12 },
            { x: 12, y: 5 }, { x: 23, y: 7 }, { x: 30, y: 5 }, { x: 68, y: 5 }, { x: 75, y: 8 }, { x: 88, y: 5 }, { x: 88, y: 12 },
            { x: 85, y: 18 }, { x: 90, y: 24 }, { x: 85, y: 29 }, { x: 88, y: 34 }, { x: 85, y: 40 }, { x: 85, y: 46 }, { x: 88, y: 51 },
            { x: 86, y: 57 }, { x: 88, y: 62 }, { x: 85, y: 68 }, { x: 86, y: 74 }, { x: 84, y: 80 }, { x: 88, y: 85 }, { x: 85, y: 92 }
        ];
    }

    render(state) {
        if (!state) return;
        const cp = state.players[state.currentPlayerIndex];
        const isHuman = !cp.isAI;

        // Overlay Management
        const isGameStarted = state.players.length > 0;
        
        const menuBtn = document.getElementById('game-menu-btn');
        if (menuBtn) {
            menuBtn.style.display = (isGameStarted && state.turnPhase !== 'gameover' && state.turnPhase !== 'pass_device') ? 'flex' : 'none';
        }

        if (isGameStarted) {
            const ho = document.getElementById('home-overlay');
            if (ho) ho.classList.remove('active');
            document.getElementById('setup-overlay').classList.remove('active');
            document.getElementById('difficulty-overlay').classList.remove('active');
        }
        document.getElementById('pass-overlay').classList.toggle('active', state.turnPhase === 'pass_device');
        
        const goOverlay = document.getElementById('gameover-overlay');
        const isGameOver = state.turnPhase === 'gameover';
        if (isGameOver && !goOverlay.classList.contains('active')) {
            const winSnd = document.getElementById('win-sound');
            if (winSnd) {
                winSnd.currentTime = 0;
                winSnd.play().catch(e => console.log('Win SFX blocked:', e));
            }
        }
        goOverlay.classList.toggle('active', isGameOver);

        // Stop rendering active board if we shouldn't see it (passing device or setup)
        if (state.turnPhase === 'pass_device' || !state.players.length) {
            document.getElementById('ui-bottom').style.display = 'none';
            document.getElementById('secret-card-container').style.display = 'none';
            if (state.turnPhase === 'pass_device') document.getElementById('pass-title').textContent = `Pass to ${cp.name}`;
            return;
        }

        // Apply Data-Driven Color Theming
        document.body.style.setProperty('--active-player-color', cp.color);

        // Turn & Rounds
        document.getElementById('rb-full').textContent = `Round ${state.round}`;
        document.getElementById('rb-short').textContent = `R${state.round}`;
        
        const tb = document.getElementById('turn-badge');
        tb.style.background = cp.color;
        document.getElementById('tb-full').textContent = `${cp.name}'s Turn`;
        document.getElementById('tb-short').textContent = cp.isAI ? 'AI' : cp.name.substring(0,2).toUpperCase();

        // Pawns
        for (let i = 0; i < 4; i++) {
            const el = document.getElementById('pawn-' + i);
            const p = state.players[i];
            if (p) {
                el.style.display = 'flex';
                el.style.background = p.color;
                el.style.borderColor = '#fff';
                el.style.color = '#fff';
                el.style.textShadow = 'none';
                el.style.boxShadow = '';
                
                const pos = p.score <= 0 ? { x: 20, y: 90 } : this.stonePxs[Math.min(p.score - 1, 34)];
                const offset = [{ dx: -2, dy: -2 }, { dx: 2, dy: -2 }, { dx: -2, dy: 2 }, { dx: 2, dy: 2 }][i];
                el.style.left = (pos.x + offset.dx) + '%';
                el.style.top = (pos.y + offset.dy) + '%';
                el.innerText = "🐒";
                el.style.fontSize = "2.1em";
            } else el.style.display = 'none';
        }

        // Toasted Panel
        const toastEl = document.getElementById('toasted-area');
        if (state.toasted.length > 0) {
            toastEl.style.display = 'block';
            document.getElementById('toasted-faces').innerHTML = state.toasted.map(t => {
                const imgName = t.id.replace('-', '') + '.png';
                return `<img src="${imgName}" style="height: 35px; width: 35px; object-fit: contain; margin: 2px;">`;
            }).join('');
        } else { toastEl.style.display = 'none'; }

        // Goals Physical Drop Card
        if (isHuman) {
            document.getElementById('secret-card-container').style.display = 'block';

            const cardEl = document.getElementById('secret-card');
            if (!state.goalsSecret) {
                cardEl.classList.add('flipped');
                const flatTotem = Utils.flattenTotem(state.totem);
                document.getElementById('goals-list').innerHTML = ['first', 'second', 'third'].map((k, i) => {
                    const tid = cp.secretGoals[k];
                    const tObj = TIKI_PROPS.find(x => x.id === tid);
                    const pos = flatTotem.findIndex(x => x.id === tid);
                    const isWin = pos !== -1 && pos <= 2;
                    const tidImg = tObj.id.replace('-', '') + '.png';
                    return `<div class="g-row ${isWin ? 'achieved' : ''}">
                        <div class="g-icon-box" style="background:${tObj.color}; border-radius: 50%;">
                            <span style="display:block; margin-top:-2px">${[15,10,5][i]}p</span>
                        </div>
                        <div class="g-pts">
                            <span style="width: 20px;">#${pos !== -1 ? pos + 1 : '?'}</span>
                            <img src="${tidImg}" style="height: 24px; width: 24px; object-fit: contain;">
                        </div>
                    </div>`;
                }).join('');
            } else {
                cardEl.classList.remove('flipped');
            }
        } else {
            document.getElementById('secret-card-container').style.display = 'none';
        }

        // Evaluate Valid Targets mappings for the GUI
        const selCard = state.selectedCardId ? cp.cards.find(c => c.id === state.selectedCardId) : null;
        let validIndices = new Set();
        if (selCard && isHuman) {
            Utils.flattenTotem(state.totem).forEach((_, idx) => {
                if (RulesEngine.validateMove(state, selCard, idx)) validIndices.add(idx);
            });
        }

        // Render Totem Layers (3 Layer Strict Structure)
        const trackEl = document.getElementById('chute-track');
        trackEl.innerHTML = state.totem.map((layer, lIdx) => `
            <div class="chute-layer layer-zone-${lIdx}">
                ${layer.map(t => {
            const flatIdx = Utils.flattenTotem(state.totem).findIndex(x => x.id === t.id);
            const isGoal = isHuman && !state.goalsSecret && Object.values(cp.secretGoals).includes(t.id);
            const isTgt = validIndices.has(flatIdx);
            return `
                    <div class="tiki-spot-wrap ${isTgt ? 'can-target' : ''}" data-tiki-id="${t.id}" onclick="window.dispatchAction('EXECUTE_MOVE', {cardId: '${state.selectedCardId}', targetIndex: ${flatIdx}})">
                        ${ShapeManager.getTile(t, isTgt, isGoal)}
                    </div>`;
        }).join('')}
            </div>
        `).join('');

        // Bottom UI (Cards)
        if (isHuman) {
            document.getElementById('ui-bottom').style.display = 'flex';
            document.getElementById('hand-count').textContent = cp.cards.length;
            const handEl = document.getElementById('card-hand');
            const currentIds = Array.from(handEl.children).map(el => el.dataset.cardId).join(',');
            const newIds = cp.cards.map(c => c.id).join(',');

            if (currentIds === newIds && newIds !== "") {
                Array.from(handEl.children).forEach(el => {
                    if (el.dataset.cardId === state.selectedCardId) el.classList.add('active');
                    else el.classList.remove('active');
                });
            } else {
                handEl.innerHTML = cp.cards.map((c, i) => {
                    const isSel = c.id === state.selectedCardId;
                    let icon = '';
                    let lbl = '';
                    if (c.type === 'up') {
                        icon = '⬆️';
                        lbl = `Rise +${c.value}`;
                    } else if (c.type === 'topple') {
                        icon = '🌀';
                        lbl = 'Topple';
                    } else {
                        icon = '🔥';
                        lbl = 'Toast';
                    }
                    return `
                    <div class="play-card ${isSel?'active':''}" data-card-id="${c.id}" style="border-bottom: 4px solid ${cp.color}; animation-delay:${i*0.05}s" onclick="window.dispatchAction('SELECT_CARD', {cardId: '${c.id}'})">
                        <span class="c-icon">${icon}</span>
                        <span class="c-text">${lbl}</span>
                    </div>`;
                }).join('');
            }
        }

        if (state.turnPhase === 'gameover') {
            const sorted = [...state.players].sort((a, b) => b.score - a.score);
            document.getElementById('go-result-text').textContent = `${sorted[0].name} WINS!`;
            document.getElementById('go-result-text').style.color = sorted[0].color;
            document.getElementById('go-scores').innerHTML = sorted.map(p => `
                <div class="g-box" style="border-color:${p.color};">
                    <div class="g-box-label">${p.name}</div>
                    <div class="g-box-val" style="color:${p.color}">${p.score} pts</div>
                </div>
            `).join('');
        }
    }

    playAnimations(animQueue, targetState, onCompleteCallback) {
        // Since we are uncoupled, animation plays CSS transitions purely via reading diffs
        // In a true engine we'd calc rect bounds, do FLIP animations.
        // For now, render the layout instantly in DOM, but pop audio hooks.
        // E.g. Audio plays:
        animQueue.forEach(a => {
            if (a.type === 'MOVE_UP') console.log("Animating rise", a);
            if (a.type === 'TOPPLE') console.log("Animating topple", a);
            if (a.type === 'TOAST') {
                console.log("Animating drop", a);
                const toastSound = document.getElementById('toast-sound');
                if (toastSound) {
                    toastSound.currentTime = 0;
                    toastSound.play().catch(e => console.log('SFX blocked:', e));
                }
                if (window.GameApp && window.GameApp.UI && window.GameApp.UI.expandStatusPanel) {
                    window.GameApp.UI.expandStatusPanel();
                }
            }
        });

        // Resolve frame
        this.render(targetState);
        setTimeout(onCompleteCallback, 400); // Wait for CSS dropIns to naturally resolve
    }
}

// ==========================================
// 8. AI ENGINE
// ==========================================
const AIEngine = {
    dispatchBestMove(store) {
        const state = store.state;
        const cp = state.players[state.currentPlayerIndex];
        const flatTotem = Utils.flattenTotem(state.totem);
        const moves = [];

        cp.cards.forEach(card => {
            flatTotem.forEach((t, idx) => {
                if (RulesEngine.validateMove(state, card, idx)) moves.push({ card, target: idx });
            });
        });

        if (!moves.length) return store.dispatch({ type: 'END_TURN' });

        // Arbitrary greedy pick for valid moves
        const best = moves[Math.floor(Math.random() * moves.length)];
        store.dispatch({ type: 'SELECT_CARD', payload: { cardId: best.card.id } });
        setTimeout(() => {
            store.dispatch({ type: 'EXECUTE_MOVE', payload: { cardId: best.card.id, targetIndex: best.target } });
        }, 500);
    }
};

/* ================================================================
   NETWORK MANAGER (Supabase Realtime Broadcast)
   ================================================================ */
const SUPABASE_URL = 'https://cpqxqzzcidazhxfgvatn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jQb0QtinjOpcb5L-bQSpMQ_ZSmHN15-';
const LOCAL_CLIENT_ID = 'cli_' + Math.random().toString(36).substr(2, 9);

const NetworkManager = {
    client: null,
    channel: null,
    roomId: null,
    isHost: false,
    expectedPlayers: 2,
    clientList: [],
    
    init() {
        if (!window.supabase) {
            setTimeout(() => this.init(), 500); // Retry if CDN is slow
            return;
        }
        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        this.updateStatusUI('Connected', 'green');
    },

    updateStatusUI(text, color) {
        const wrap = document.getElementById('network-status');
        const d = document.getElementById('net-dot');
        const t = document.getElementById('net-text');
        if (wrap) {
            wrap.style.display = 'flex';
            d.style.background = color;
            t.textContent = text;
        }
    },

    createRoom(expectedPlayers) {
        this.roomId = 'M' + Math.floor(1000 + Math.random() * 9000);
        this.isHost = true;
        this.expectedPlayers = expectedPlayers;
        this.clientList = [LOCAL_CLIENT_ID];
        this.joinChannel(this.roomId, expectedPlayers);
        return this.roomId;
    },

    joinRoom(id) {
        this.roomId = id;
        this.isHost = false;
        this.joinChannel(id, 0);
    },

    joinChannel(id, expectedPlayers) {
        if (this.channel) this.channel.unsubscribe();
        this.updateStatusUI('Joining...', 'yellow');

        this.channel = this.client.channel(`room:${id}`, {
            config: { broadcast: { ack: true } }
        });

        this.channel
            .on('broadcast', { event: 'game-state' }, (payload) => {
                if (payload.payload) {
                    window.gameStore.state = payload.payload;
                    window.gameStore.renderer.render(window.gameStore.state);

                    // Immediately force away all non-gameplay overlays for Guests
                    if (window.gameStore.state.turnPhase !== 'setup') {
                        document.querySelectorAll('.overlay').forEach(el => {
                            if (el.id !== 'pass-overlay' && el.id !== 'gameover-overlay' && el.id !== 'player-goals-overlay') {
                                el.classList.remove('active');
                            }
                        });
                        if (window.GameApp) window.GameApp.menuStateStack = [];
                    }
                }
            })
            .on('broadcast', { event: 'request-join' }, (payload) => {
                if (this.isHost) {
                    const cid = payload.payload || 'unknown';
                    if (!this.clientList.includes(cid)) {
                        this.clientList.push(cid);
                    }
                    
                    if (window.GameApp && window.GameApp.menuStateStack.includes('waiting-room-overlay')) {
                        const titleEl = document.getElementById('waiting-title');
                        
                        if (this.clientList.length < this.expectedPlayers) {
                            if (titleEl) titleEl.textContent = `Waiting (${this.clientList.length}/${this.expectedPlayers} Joined)...`;
                        } else if (!this._gameStarting) {
                            this._gameStarting = true;
                            if (titleEl) titleEl.textContent = "All Players Ready! Starting...";
                            setTimeout(() => {
                               window.GameApp.startOnlineGame(this.expectedPlayers);
                            }, 800);
                        }
                    } else if (window.gameStore && window.gameStore.state && window.gameStore.state.turnPhase !== 'setup') {
                        // If game already started and someone refreshed/rejoined, resync them
                        this.broadcastState(window.gameStore.state);
                    }
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    this.updateStatusUI(`Room: ${id}`, 'lime');
                    if (!this.isHost) {
                        // Keep requesting join until state is populated and turnPhase is active
                        let attempts = 0;
                        const tryJoin = setInterval(() => {
                            if (window.gameStore && window.gameStore.state && window.gameStore.state.turnPhase) {
                                clearInterval(tryJoin);
                                return;
                            }
                            if (this.channel) {
                                this.channel.send({ type: 'broadcast', event: 'request-join', payload: LOCAL_CLIENT_ID });
                            }
                            attempts++;
                            if (attempts > 30) clearInterval(tryJoin); // timeout after 30s
                        }, 1000);
                        
                        this.channel.send({ type: 'broadcast', event: 'request-join', payload: LOCAL_CLIENT_ID });
                    }
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    this.updateStatusUI('Offline', 'red');
                }
            });
    },

    broadcastState(state) {
        if (!this.channel) return;
        this.channel.send({ type: 'broadcast', event: 'game-state', payload: state });
    },
    
    leave() {
        if (this.channel) this.channel.unsubscribe();
        this.channel = null;
        this.roomId = null;
        this.isHost = false;
        this._gameStarting = false;
        this.clientList = [];
        this.updateStatusUI('Connected', 'green');
    }
};

// ==========================================
// 9. INSTANTIATE & BIND
// ==========================================
const gameStore = new Store(RulesEngine, new UIRenderer());

// Expose Action Dispatcher securely to global scope purely for HTML inline onclick listeners to hook to.
window.dispatchAction = function (type, payload = {}) {
    // Pipe all external UI calls securely into the class architecture
    gameStore.dispatch({ type, payload });
};

// Map basic GUI buttons to generic actions
window.GameApp = {
    pendingNumPlayers: 2,
    pendingGameMode: null,
    menuStateStack: ['home-overlay'],
    menu: {
        openOverlay: (id) => {
            document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            window.GameApp.menuStateStack.push(id);
        },
        goBack: () => {
            if (window.GameApp.menuStateStack.length > 1) {
                window.GameApp.menuStateStack.pop(); 
                const prev = window.GameApp.menuStateStack[window.GameApp.menuStateStack.length - 1];
                document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
                document.getElementById(prev).classList.add('active');
            }
        },
        openPauseMenu: () => {
            document.getElementById('pause-overlay').classList.add('active');
        },
        resumeGame: () => {
            document.getElementById('pause-overlay').classList.remove('active');
        },
        selectMode: (mode) => {
            window.GameApp.pendingGameMode = mode;
            if (mode === 'ai') {
                window.GameApp.pendingNumPlayers = 1;
                window.GameApp.menu.openOverlay('difficulty-overlay');
            } else if (mode === 'passplay') {
                window.GameApp.menu.openOverlay('player-count-overlay');
            } else if (mode === 'online') {
                window.GameApp.menu.openOverlay('online-menu-overlay');
            }
        },
        selectPlayerCount: (count) => {
            window.GameApp.pendingNumPlayers = count;
            window.GameApp.menu.openOverlay('difficulty-overlay');
        },
        selectOnlineMode: (action) => {
            if (action === 'play') {
                window.GameApp.pendingGameMode = 'onlinePlay';
                window.GameApp.menu.openOverlay('player-count-overlay');
            } else if (action === 'create') {
                window.GameApp.pendingGameMode = 'onlineCreate';
                window.GameApp.menu.openOverlay('player-count-overlay');
            } else if (action === 'join') {
                window.GameApp.pendingGameMode = 'onlineJoin';
                window.GameApp.menu.openOverlay('join-room-overlay');
            }
        },
        joinRoomSubmit: () => {
            const inp = document.getElementById('room-code-input').value.trim().toUpperCase();
            if (inp.length > 0) {
                NetworkManager.joinRoom(inp);
                window.GameApp.menu.openOverlay('waiting-room-overlay');
                const titleEl = document.getElementById('waiting-title');
                if (titleEl) titleEl.textContent = "Joining Room...";
                document.getElementById('waiting-room-code-display').textContent = inp;
            }
        },
        generateRoomId: () => {
            const DICT = ['Rangi', 'Papa', 'Tane', 'Tanga', 'Tawhi', 'Tu', 'Rongo', 'Rua', 'Whiro', 'Maui'];
            const name = DICT[Math.floor(Math.random() * DICT.length)];
            const salt = Math.floor(Math.random() * 900) + 100;
            return `${name}${salt}`;
        }
    },
    startLocalGame(playersCount, hasAI, winScore = 35) {
        window.GameApp.pendingNumPlayers = playersCount;
        window.GameApp.pendingWinScore = winScore;
        window.dispatchAction('START_GAME', { numPlayers: playersCount, winScore: winScore });
        
        // Manually enforce AI if isolated
        if (hasAI && window.gameStore.state && window.gameStore.state.players.length > 1) {
            window.gameStore.state.players[1].isAI = true;
            window.gameStore.state.players[1].name = 'Spirit AI';
        }
        
        this.menuStateStack = [];
        document.querySelectorAll('.overlay').forEach(el => {
            if (el.id !== 'pass-overlay' && el.id !== 'gameover-overlay' && el.id !== 'player-goals-overlay') {
                el.classList.remove('active');
            }
        });
        document.getElementById('game-menu-btn').style.display = 'flex';
        this.Audio.setVolume(1);
    },

    startOnlineGame(playersCount, winScore) {
        window.GameApp.pendingNumPlayers = playersCount;
        const actualScore = winScore || window.GameApp.pendingWinScore || 35;
        
        // Let Redux engine build the state and instantly broadcast to all listeners
        window.dispatchAction('START_GAME', { numPlayers: playersCount, winScore: actualScore, isOnlineGame: true });
        
        this.menuStateStack = [];
        document.querySelectorAll('.overlay').forEach(el => {
            if (el.id !== 'pass-overlay' && el.id !== 'gameover-overlay' && el.id !== 'player-goals-overlay') {
                el.classList.remove('active');
            }
        });
        document.getElementById('game-menu-btn').style.display = 'flex';
    },
    startGame: (numPlayers) => {
        // Redundant safely override
        window.GameApp.pendingNumPlayers = numPlayers;
    },
    setDifficulty: (score) => {
        const app = window.GameApp;
        app.pendingWinScore = score;
        
        if (app.pendingGameMode === 'onlineCreate' || app.pendingGameMode === 'onlinePlay') {
            document.getElementById('difficulty-overlay').classList.remove('active');
            app.menu.openOverlay('waiting-room-overlay');
            const roomId = NetworkManager.createRoom(app.pendingNumPlayers);
            const titleEl = document.getElementById('waiting-title');
            if (titleEl) titleEl.textContent = "Waiting for Player...";
            document.getElementById('waiting-room-code-display').textContent = roomId;
            return;
        }

        // Pass & Play or AI setup
        document.getElementById('difficulty-overlay').classList.remove('active');
        app.startLocalGame(app.pendingNumPlayers, app.pendingGameMode === 'ai', score);
        
        if (window.GameApp && window.GameApp.UI && window.GameApp.UI.expandStatusPanel) {
            window.GameApp.UI.expandStatusPanel();
        }

        const bgm = document.getElementById('bg-music');
        if (bgm && bgm.paused) {
            bgm.play().catch(e => console.log('Autoplay blocked:', e));
            const btn = document.getElementById('soundToggle');
            if (btn) {
                btn.innerHTML = '🔊';
                btn.classList.remove('muted');
            }
        }
    },
    resetToSetup: (reload = true) => {
        if (reload) window.location.reload();
        NetworkManager.leave();
    },
    UI: {
        startTurn: () => window.dispatchAction('START_PLAYER_TURN'),
        toggleGoals: (e) => {
           const container = document.getElementById('secret-card-container');
           if (container && container.dataset.dragged === 'true') {
               container.dataset.dragged = 'false';
               return; 
           }
           window.dispatchAction('TOGGLE_GOALS');
        },
        toggleStatusPanel: () => {
            const panel = document.getElementById('status-panel');
            if (!panel) return;
            if (panel.classList.contains('minimized')) {
                window.GameApp.UI.expandStatusPanel();
            } else {
                panel.classList.add('minimized');
                if (window.toastTimer) clearTimeout(window.toastTimer);
            }
        },
        expandStatusPanel: () => {
            const panel = document.getElementById('status-panel');
            if (panel) {
                panel.classList.remove('minimized');
                if (window.toastTimer) clearTimeout(window.toastTimer);
                window.toastTimer = setTimeout(() => {
                    panel.classList.add('minimized');
                }, 3000);
            }
        }
    },
    Audio: { 
        toggleSound: () => {
            const bgm = document.getElementById('bg-music');
            const btn = document.getElementById('soundToggle');
            if (!bgm || !btn) return;
            if (bgm.paused) {
                bgm.play();
                btn.innerHTML = '🔊';
                btn.classList.remove('muted');
            } else {
                bgm.pause();
                btn.innerHTML = '🔇';
                btn.classList.add('muted');
            }
        },
        setVolume: (val) => {
            const vol = parseFloat(val);
            const bgm = document.getElementById('bg-music');
            const tSound = document.getElementById('toast-sound');
            const wSound = document.getElementById('win-sound');
            const icon = document.getElementById('vol-icon');
            
            if (bgm) {
                bgm.volume = vol;
                if (vol > 0 && bgm.paused && document.getElementById('game-menu-btn').style.display !== 'none') {
                     bgm.play().catch(e => console.log('play blocked', e));
                }
            }
            if (tSound) tSound.volume = vol;
            if (wSound) wSound.volume = vol;
            
            if (icon) {
                icon.textContent = vol === 0 ? '🔇' : '🔊';
            }
            
            const oldBtn = document.getElementById('soundToggle');
            if (oldBtn) {
                oldBtn.innerHTML = vol === 0 ? '🔇' : '🔊';
                if (vol === 0) oldBtn.classList.add('muted');
                else oldBtn.classList.remove('muted');
            }
        }
    }
};

// ==========================================
// 10. DRAG MANAGER
// ==========================================
const CardDragger = {
    init() {
        const container = document.getElementById('secret-card-container');
        if(!container) return;
        
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        
        container.addEventListener('pointerdown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = container.getBoundingClientRect();
            if (container.style.left === '') {
                container.style.right = 'auto';
                container.style.marginTop = '0';
                container.style.top = rect.top + 'px';
                container.style.left = rect.left + 'px';
            }
            initialLeft = parseFloat(container.style.left);
            initialTop = parseFloat(container.style.top);
            
            container.dataset.dragged = 'false';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('pointermove', (e) => {
            if(!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                container.dataset.dragged = 'true';
            }
            
            let newX = initialLeft + dx;
            let newY = initialTop + dy;
            
            newX = Math.max(0, Math.min(newX, window.innerWidth - 145));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 240));
            
            container.style.left = newX + 'px';
            container.style.top = newY + 'px';

            const card = document.getElementById('secret-card');
            if (newX < window.innerWidth / 2 - 70) {
                card.style.setProperty('--idle-translate', '-45px');
            } else {
                card.style.setProperty('--idle-translate', '45px');
            }
        });

        window.addEventListener('pointerup', () => {
            isDragging = false;
            document.body.style.userSelect = 'auto';
        });
    }
};

window.addEventListener('DOMContentLoaded', () => {
    // Generate initial pawns tracks visually so they mount
    const mockRenderer = new UIRenderer();
    const parent = document.getElementById('score-track-container');
    mockRenderer.stonePxs.forEach((pos, idx) => {
        const d = document.createElement('div');
        d.className = 'track-stone';
        d.style.left = pos.x + 'px'; d.style.top = pos.y + 'px';
        parent.appendChild(d);
    });
    
    // Start home screen rotating tile
    const homeContainer = document.getElementById('home-moai-container');
    if (homeContainer) {
        let currentIdx = Math.floor(Math.random() * TIKI_PROPS.length);
        const rotateTile = () => {
             const t = TIKI_PROPS[currentIdx];
             homeContainer.innerHTML = ShapeManager.getTile(t, false, false);
             // Ensure it appears crisp
             const innerSprite = homeContainer.querySelector('.tiki-image-sprite');
             if (innerSprite) {
                 innerSprite.style.animation = 'none'; // reset any pulse if active
                 // fade pop effect
                 innerSprite.animate([
                     { transform: 'scale(0.8)', opacity: 0.5 },
                     { transform: 'scale(1)', opacity: 1 }
                 ], { duration: 300, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
             }
             currentIdx = (currentIdx + 1) % TIKI_PROPS.length;
        };
        rotateTile();
        setInterval(rotateTile, 2000);
    }

    CardDragger.init();
    NetworkManager.init();
});
