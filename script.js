// 1. Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyBQuGUV1A7esCJRkPhcAP6i2UStvdJw-Zg",
    authDomain: "pkpd-database.firebaseapp.com",
    databaseURL: "https://pkpd-database-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pkpd-database",
    storageBucket: "pkpd-database.firebasestorage.app",
    messagingSenderId: "280364999020",
    appId: "1:280364999020:web:f565467add14c0c4851349",
    measurementId: "G-BDGVRP0DJM"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentDevice = null;
let scoreChart = null;
let scores = [];

// --- A. 筆記本功能 (同學的部分) ---
function initNoteBoard() {
    const noteInput = document.getElementById('sysMsgInput');
    const saveBtn = document.getElementById('sendMsgBtn');
    const statusText = document.getElementById('currentMsg');

    // 監聽數據庫變化
    database.ref('system_note').on('value', (snapshot) => {
        const val = snapshot.val();
        if (val) {
            // 如果輸入框是空的，才自動填入，避免覆蓋用戶正在打的字
            if (!noteInput.value) noteInput.value = val.text || "";
            statusText.textContent = "最後更新: " + (val.time || "無記錄");
        } else {
            statusText.textContent = "尚無備註";
        }
    });

    saveBtn.onclick = () => {
        const text = noteInput.value;
        const now = new Date().toLocaleString();
        saveBtn.textContent = "儲存中...";
        saveBtn.disabled = true;
        
        database.ref('system_note').set({ text: text, time: now })
            .then(() => {
                saveBtn.textContent = "儲存";
                saveBtn.disabled = false;
            });
    };
}

// --- B. 遠程控制功能 (我們添加的部分) ---
function setDifficulty(level) {
    if (!currentDevice) return;
    const cmdStatus = document.getElementById('cmdStatus');
    cmdStatus.textContent = "發送中...";
    
    // 寫入 Firebase
    database.ref(`devices/${currentDevice}/control/difficulty`).set(level)
        .then(() => {
            cmdStatus.textContent = "✅ 已發送";
            setTimeout(() => { cmdStatus.textContent = ""; }, 3000);
        })
        .catch((e) => {
            cmdStatus.textContent = "❌ 失敗";
            console.error(e);
        });
}

// --- C. 圖表與設備邏輯 ---
function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if(scoreChart) scoreChart.destroy();
    
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '分數',
                data: [],
                borderColor: '#0277bd',
                backgroundColor: 'rgba(2, 119, 189, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0277bd',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f0f0f0' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function loadDevices() {
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        const list = document.getElementById('deviceList');
        list.innerHTML = '';
        if (!data) { list.innerHTML = '<div class="loading">無數據</div>'; return; }

        Object.keys(data).forEach(mac => {
            const btn = document.createElement('div');
            btn.className = 'device-chip' + (currentDevice === mac ? ' active' : '');
            btn.textContent = `📡 ${mac}`;
            btn.onclick = () => selectDevice(mac);
            list.appendChild(btn);
        });
        
        // 默認選中第一個
        if (!currentDevice && Object.keys(data).length > 0) {
            selectDevice(Object.keys(data)[0]);
        }
    });
}

function selectDevice(deviceId) {
    if (currentDevice) {
        // 取消舊的監聽
        database.ref(`devices/${currentDevice}/sessions`).off();
        database.ref(`statistics/${currentDevice}`).off();
        database.ref(`devices/${currentDevice}/status/difficulty`).off();
    }
    currentDevice = deviceId;
    
    // UI 更新
    document.querySelectorAll('.device-chip').forEach(el => 
        el.classList.toggle('active', el.textContent.includes(deviceId))
    );
    document.getElementById('remoteControls').style.display = 'flex'; // 顯示控制面板
    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = "連接數據庫中...";
    statusEl.className = "status-online"; // 暫時狀態

    // 1. 監聽當前難度
    database.ref(`devices/${deviceId}/status/difficulty`).on('value', (snapshot) => {
        const val = snapshot.val();
        const badge = document.getElementById('currentDiff');
        if (val === 0) badge.textContent = "Easy";
        else if (val === 1) badge.textContent = "Hard";
        else if (val === 2) badge.textContent = "Auto";
        else badge.textContent = "Unknown";
    });

    // 2. 監聽統計
    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        document.getElementById('totalGames').textContent = stats.totalGames || 0;
        document.getElementById('highScore').textContent = stats.highScore || 0;
    });

    // 3. 監聽遊戲記錄 (最近50筆)
    database.ref(`devices/${deviceId}/sessions`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        // 數據轉換為數組並按時間倒序
        scores = data ? Object.values(data).sort((a,b) => b.timestamp - a.timestamp) : [];
        updateUI();
    });
}

function updateUI() {
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';
    const statusEl = document.getElementById('connectionStatus');

    // 智能在線狀態判斷
    if (scores.length > 0) {
        const latest = scores[0];
        const lastTime = new Date(latest.timestamp * 1000);
        const now = new Date();
        const diffMinutes = (now - lastTime) / 1000 / 60;

        if (diffMinutes < 5) {
            statusEl.textContent = "🟢 設備活躍中";
            statusEl.className = "status-online";
        } else {
            // 格式化離線時間
            let timeAgo = "";
            if (diffMinutes < 60) timeAgo = Math.floor(diffMinutes) + "分鐘前";
            else if (diffMinutes < 1440) timeAgo = Math.floor(diffMinutes/60) + "小時前";
            else timeAgo = Math.floor(diffMinutes/1440) + "天前";
            
            statusEl.textContent = `🔴 設備離線 (上次: ${timeAgo})`;
            statusEl.className = "status-offline";
        }

        // 更新最新一局面板
        document.getElementById('latestScore').textContent = latest.score;
        let m = latest.mode === 'memory' ? '記憶模式' : '計數模式';
        document.getElementById('latestMode').textContent = m;
        document.getElementById('latestTime').textContent = lastTime.toLocaleTimeString();

        // 填充表格
        scores.forEach(s => {
            const row = tbody.insertRow();
            const d = new Date(s.timestamp * 1000);
            let modeLabel = s.mode === 'memory' ? '記憶' : '計數';
            row.innerHTML = `
                <td>${d.toLocaleString()}</td>
                <td>${modeLabel}</td>
                <td><span class="score-badge">${s.score}</span></td>
                <td>${s.duration}s</td>
                <td style="font-family: monospace; font-size: 0.8em; color:#999;">${s.sessionID || '-'}</td>
            `;
        });

        // 更新圖表 (最近10局，反轉順序讓舊的在左)
        const chartData = scores.slice(0, 10).reverse();
        scoreChart.data.labels = chartData.map(d => new Date(d.timestamp*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
        scoreChart.data.datasets[0].data = chartData.map(d => d.score);
        scoreChart.update();

    } else {
        statusEl.textContent = "⚪ 無數據";
        statusEl.className = "status-offline";
        tbody.innerHTML = '<tr><td colspan="5" class="loading">無記錄</td></tr>';
    }

    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

// 啟動
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initNoteBoard();
    loadDevices();
    
    // 每分鐘刷新一次狀態顯示 (更新"幾分鐘前")
    setInterval(() => { if(scores.length > 0) updateUI(); }, 60000);
});